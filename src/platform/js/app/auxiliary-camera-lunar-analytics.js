// Moon phase and craft-visible lunar hemisphere analytics.

export function computeMoonPhaseInfo(
    { earth, moon, sun },
) {
    if (!earth || !moon) {
        return null;
    }
    if (!this.getObjectWorldPosition(earth, this.earthWorld)) {
        return null;
    }
    if (!this.getObjectWorldPosition(moon, this.moonWorld)) {
        return null;
    }

    this.tmpVectorA.subVectors(this.moonWorld, this.earthWorld);
    const moonDistance = this.tmpVectorA.length();
    if (!Number.isFinite(moonDistance) || moonDistance <= 1e-12) {
        return null;
    }
    this.tmpVectorA.multiplyScalar(1 / moonDistance);

    let sunAvailable = this.vectorFromSunDirection(this.tmpVectorB);
    if (!sunAvailable && sun && this.getObjectWorldPosition(sun, this.sunWorld)) {
        this.tmpVectorB.subVectors(this.sunWorld, this.earthWorld);
        const sunDistance = this.tmpVectorB.length();
        if (Number.isFinite(sunDistance) && sunDistance > 1e-12) {
            this.tmpVectorB.multiplyScalar(1 / sunDistance);
            sunAvailable = true;
        }
    }
    if (!sunAvailable) {
        return null;
    }

    const dot = this.THREE.MathUtils.clamp(this.tmpVectorA.dot(this.tmpVectorB), -1, 1);
    const elongationDeg = this.THREE.MathUtils.radToDeg(Math.acos(dot));

    if (Number.isFinite(this.moonElongationPrevious)) {
        const delta = elongationDeg - this.moonElongationPrevious;
        if (Math.abs(delta) > 0.03) {
            this.moonElongationTrend = delta >= 0 ? 1 : -1;
        }
    }
    this.moonElongationPrevious = elongationDeg;

    const phaseName = this.resolveMoonPhaseName(elongationDeg, this.moonElongationTrend);
    return {
        phaseName,
        elongationDeg,
    };
}

export function resolveMoonPhaseName(
    elongationDeg,
    trend,
) {
    const waxing = trend >= 0;
    if (elongationDeg < 10) {
        return "New Moon";
    }
    if (elongationDeg < 84) {
        return waxing ? "Waxing Crescent" : "Waning Crescent";
    }
    if (elongationDeg <= 96) {
        return waxing ? "First Quarter" : "Last Quarter";
    }
    if (elongationDeg < 170) {
        return waxing ? "Waxing Gibbous" : "Waning Gibbous";
    }
    return "Full Moon";
}

export function roundPercentParts(
    parts,
) {
    const floors = parts.map((value) => Math.floor(Math.max(0, value)));
    let sum = floors.reduce((acc, value) => acc + value, 0);
    let remaining = Math.max(0, 100 - sum);
    const remainders = parts
        .map((value, index) => ({ index, remainder: Math.max(0, value) - floors[index] }))
        .sort((a, b) => b.remainder - a.remainder);
    let cursor = 0;
    while (remaining > 0 && remainders.length > 0) {
        floors[remainders[cursor % remainders.length].index] += 1;
        remaining -= 1;
        cursor += 1;
    }
    sum = floors.reduce((acc, value) => acc + value, 0);
    if (sum !== 100 && floors.length > 0) {
        floors[0] += 100 - sum;
    }
    return floors;
}

export function computeCraftMoonVisibilityInfo(
    { activeCraft, earth, moon, sun },
) {
    if (!activeCraft || !earth || !moon) {
        return null;
    }
    if (!this.getObjectWorldPosition(activeCraft, this.craftWorld)) {
        return null;
    }
    if (!this.getObjectWorldPosition(earth, this.earthWorld)) {
        return null;
    }
    if (!this.getObjectWorldPosition(moon, this.moonWorld)) {
        return null;
    }

    this.craftFromMoonDir.subVectors(this.craftWorld, this.moonWorld);
    this.earthFromMoonDir.subVectors(this.earthWorld, this.moonWorld);
    let craftLen = this.craftFromMoonDir.length();
    let earthLen = this.earthFromMoonDir.length();
    if (craftLen <= 1e-12 || earthLen <= 1e-12) {
        return null;
    }
    this.craftFromMoonDir.multiplyScalar(1 / craftLen);
    this.earthFromMoonDir.multiplyScalar(1 / earthLen);

    let sunAvailable = this.vectorFromSunDirection(this.sunFromMoonDir, "moon");
    if (!sunAvailable && sun && this.getObjectWorldPosition(sun, this.sunWorld)) {
        this.sunFromMoonDir.subVectors(this.sunWorld, this.moonWorld);
        const sunLen = this.sunFromMoonDir.length();
        if (sunLen > 1e-12) {
            this.sunFromMoonDir.multiplyScalar(1 / sunLen);
            sunAvailable = true;
        }
    }
    if (!sunAvailable) {
        return null;
    }

    let visibleCount = 0;
    let nearDay = 0;
    let nearNight = 0;
    let farDay = 0;
    let farNight = 0;
    const samples = this.moonVisibilitySamples;
    for (let i = 0; i < samples.length; i += 3) {
        const nx = samples[i];
        const ny = samples[i + 1];
        const nz = samples[i + 2];
        const visibleDot = nx * this.craftFromMoonDir.x + ny * this.craftFromMoonDir.y + nz * this.craftFromMoonDir.z;
        if (visibleDot <= 0) continue;
        visibleCount += 1;

        const near = (nx * this.earthFromMoonDir.x + ny * this.earthFromMoonDir.y + nz * this.earthFromMoonDir.z) >= 0;
        const day = (nx * this.sunFromMoonDir.x + ny * this.sunFromMoonDir.y + nz * this.sunFromMoonDir.z) >= 0;

        if (near) {
            if (day) nearDay += 1;
            else nearNight += 1;
        } else if (day) {
            farDay += 1;
        } else {
            farNight += 1;
        }
    }

    if (visibleCount <= 0) {
        return null;
    }

    const rawParts = [
        (nearDay * 100) / visibleCount,
        (nearNight * 100) / visibleCount,
        (farDay * 100) / visibleCount,
        (farNight * 100) / visibleCount,
    ];
    const [nearDayPct, nearNightPct, farDayPct, farNightPct] = this.roundPercentParts(rawParts);
    const nearPct = nearDayPct + nearNightPct;
    const farPct = farDayPct + farNightPct;

    return {
        nearPct,
        farPct,
        nearDayPct,
        nearNightPct,
        farDayPct,
        farNightPct,
    };
}
