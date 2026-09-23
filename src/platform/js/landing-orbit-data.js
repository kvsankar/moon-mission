import { asTrimmedString, normalizeKey } from "./landing-text.js";
import { BRIEF_ORBIT_MODES, meanOf, quantileOf, getBriefOrbitMode,
    rewriteOrbitFileBase, getChebPosition } from "./landing-orbit-math.js";

const orbitPreviewCache = new Map();
const orbitPreviewConfigCache = new Map();
function rowOrbitPreviewKey(row) {
    return normalizeKey(row && (row.folder || (row.entry && row.entry.folder) || row.title));
}

function fetchOrbitPreviewConfig(row) {
    var key = rowOrbitPreviewKey(row);
    if (!key) return Promise.resolve(null);
    if (orbitPreviewConfigCache.has(key)) {
        return Promise.resolve(orbitPreviewConfigCache.get(key));
    }

    var configPromise = fetch("assets/" + key + "/data/config.json", { cache: "no-store" })
        .then(function(response) {
            if (!response.ok) throw new Error("config unavailable");
            return response.json();
        })
        .catch(function() {
            return null;
        });

    orbitPreviewConfigCache.set(key, configPromise);
    return configPromise;
}

function findPrimaryCraftConfig(config) {
    var crafts = Array.isArray(config && config.crafts) ? config.crafts : [];
    if (!crafts.length) return null;
    var primaryId = normalizeKey(config && config.primaryCraftId);
    var mnemonic = normalizeKey(config && config.spacecraft_mnemonic);
    for (var i = 0; i < crafts.length; i += 1) {
        var craft = crafts[i];
        if (craft && craft.primary) return craft;
    }
    for (var j = 0; j < crafts.length; j += 1) {
        var candidate = crafts[j];
        if (!candidate) continue;
        if (normalizeKey(candidate.id) === primaryId) return candidate;
        if (normalizeKey(candidate.mnemonic) === mnemonic) return candidate;
    }
    return crafts[0];
}

function collectOrbitPreviewCandidates(config, modeKey) {
    var values = [];
    var seen = new Set();
    var primaryCraft = findPrimaryCraftConfig(config);

    function push(base) {
        var value = asTrimmedString(base);
        if (!value) return;
        var normalized = normalizeKey(value);
        if (seen.has(normalized)) return;
        seen.add(normalized);
        values.push(value);
    }

    push(config && config[modeKey] && config[modeKey].orbits_file);
    push(primaryCraft && primaryCraft[modeKey] && primaryCraft[modeKey].orbits_file);

    var geoBase = asTrimmedString(config && config.geo && config.geo.orbits_file);
    if (modeKey !== "geo") {
        push(rewriteOrbitFileBase(geoBase, modeKey));
    } else {
        push(geoBase);
    }

    var primaryGeoBase = asTrimmedString(primaryCraft && primaryCraft.geo && primaryCraft.geo.orbits_file);
    if (modeKey !== "geo") {
        push(rewriteOrbitFileBase(primaryGeoBase, modeKey));
    } else {
        push(primaryGeoBase);
    }

    return values;
}

function fetchOrbitPreviewModeOptions(row) {
    return fetchOrbitPreviewConfig(row).then(function(config) {
        return BRIEF_ORBIT_MODES.map(function(mode) {
            var candidates = collectOrbitPreviewCandidates(config, mode.key);
            return {
                key: mode.key,
                label: mode.label,
                centerBodyKey: mode.centerBodyKey,
                secondaryBodyKey: mode.secondaryBodyKey,
                secondaryLabel: mode.secondaryLabel,
                candidates: candidates,
                available: candidates.length > 0
            };
        });
    });
}

function pickPreviewSpacecraftSeries(chebData) {
    if (chebData && chebData.SC && Array.isArray(chebData.SC.segments)) return chebData.SC;
    var metadataBodies = Array.isArray(chebData && chebData.metadata && chebData.metadata.bodies)
        ? chebData.metadata.bodies
        : [];
    var excluded = new Set(["EARTH", "MOON", "SUN", "FRAME_ROT"]);
    for (var i = 0; i < metadataBodies.length; i += 1) {
        var body = metadataBodies[i];
        if (excluded.has(body)) continue;
        if (chebData && chebData[body] && Array.isArray(chebData[body].segments)) {
            return chebData[body];
        }
    }
    return null;
}

function fetchFirstAvailableChebJson(folder, candidates, index) {
    if (!Array.isArray(candidates) || index >= candidates.length) {
        return Promise.reject(new Error("No preview source found"));
    }
    var base = candidates[index];
    var chebUrl = "assets/" + folder + "/data/" + base + "-cheb.json";
    return fetch(chebUrl, { cache: "no-store" })
        .then(function(response) {
            if (!response.ok) throw new Error("Chebyshev unavailable");
            return response.json();
        })
        .catch(function() {
            return fetchFirstAvailableChebJson(folder, candidates, index + 1);
        });
}

function computePreviewHalfSideKm(modeKey, scDistances, secondaryDistances) {
    var meanSecondaryDistance = meanOf(secondaryDistances);
    if (modeKey === "lunar") {
        // Requested framing: side = 66,000 km * 2 * 1.3, so half-side = 66,000 * 1.3.
        return 66000 * 1.3;
    }

    if (modeKey === "relative") {
        var earthMoonDistance = Number.isFinite(meanSecondaryDistance) && meanSecondaryDistance > 0
            ? meanSecondaryDistance
            : quantileOf(scDistances, 0.94);
        if (!Number.isFinite(earthMoonDistance) || earthMoonDistance <= 0) {
            earthMoonDistance = meanOf(scDistances);
        }
        if (!Number.isFinite(earthMoonDistance) || earthMoonDistance <= 0) {
            earthMoonDistance = 384400;
        }
        // Requested framing: Earth-Moon span occupies 2/3 of the square side.
        // Since side = 2 * halfSide, halfSide = distance / (4/3) = 3/4 * distance.
        return earthMoonDistance * 0.75;
    }

    var transferScale = Number.isFinite(meanSecondaryDistance) && meanSecondaryDistance > 0
        ? meanSecondaryDistance
        : quantileOf(scDistances, 0.94);
    if (!Number.isFinite(transferScale) || transferScale <= 0) {
        transferScale = meanOf(scDistances);
    }
    if (!Number.isFinite(transferScale) || transferScale <= 0) {
        transferScale = 384400;
    }
    return Math.max(16000, Math.min(900000, transferScale * 1.3));
}

function buildOrbitPreviewPayload(chebData, modeKey) {
    var mode = getBriefOrbitMode(modeKey);
    var scSeries = pickPreviewSpacecraftSeries(chebData);
    var secondarySeries = chebData && chebData[mode.secondaryBodyKey];
    if (!scSeries) {
        throw new Error("Required spacecraft series missing");
    }

    var rangeStart = Number(chebData.time_range && chebData.time_range.start);
    var rangeEnd = Number(chebData.time_range && chebData.time_range.end);
    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
        throw new Error("Invalid Chebyshev time range");
    }

    var scPoints = [];
    var secondaryPoints = [];
    var jdPoints = [];
    var scDistances = [];
    var secondaryDistances = [];

    var coarseCount = 512;
    for (var c = 0; c < coarseCount; c += 1) {
        var coarseT = rangeStart + ((rangeEnd - rangeStart) * c) / (coarseCount - 1);
        var coarseScPos = getChebPosition(scSeries, coarseT);
        var coarseSecondaryPos = secondarySeries ? getChebPosition(secondarySeries, coarseT) : null;
        if (coarseScPos) {
            scDistances.push(Math.hypot(coarseScPos.x, coarseScPos.y));
        }
        if (coarseSecondaryPos) {
            secondaryDistances.push(Math.hypot(coarseSecondaryPos.x, coarseSecondaryPos.y));
        }
    }

    if (!scDistances.length) {
        throw new Error("Insufficient sampled points");
    }

    var distanceReference = Number.isFinite(meanOf(secondaryDistances)) ? meanOf(secondaryDistances) : meanOf(scDistances);
    var durationSeconds = Math.max(1, Math.round((rangeEnd - rangeStart) * 86400));
    var minStepSeconds = modeKey === "lunar" ? 20 : 30;
    var maxStepSeconds = modeKey === "lunar" ? 360 : 480;
    var earlyWindowSeconds = Math.min(durationSeconds, modeKey === "lunar" ? (5 * 86400) : (7 * 86400));
    var maxSamples = 45000;

    var t = rangeStart;
    var guard = 0;
    while (t <= rangeEnd && guard < maxSamples) {
        var scPos = getChebPosition(scSeries, t);
        var secondaryPos = secondarySeries ? getChebPosition(secondarySeries, t) : null;
        if (scPos) {
            scPoints.push(scPos);
            secondaryPoints.push(secondaryPos || null);
            jdPoints.push(t);
        }

        var elapsedSeconds = Math.max(0, (t - rangeStart) * 86400);
        var scDistance = scPos ? Math.hypot(scPos.x, scPos.y) : distanceReference;
        var radiusRatio = scDistance / Math.max(1, distanceReference || 1);
        radiusRatio = Math.max(0.015, Math.min(2.5, radiusRatio));
        var nearBodyScale = Math.pow(Math.min(1, radiusRatio), modeKey === "lunar" ? 1.05 : 1.25);
        var earlyProgress = earlyWindowSeconds > 0 ? Math.min(1, elapsedSeconds / earlyWindowSeconds) : 1;
        var earlyStep = minStepSeconds + ((modeKey === "lunar" ? 110 : 150) - minStepSeconds) * nearBodyScale;
        var lateStepFloor = modeKey === "lunar" ? 110 : 180;
        var lateStep = lateStepFloor + (maxStepSeconds - lateStepFloor) * Math.min(1, radiusRatio);
        var adaptiveStepSeconds = earlyStep * (1 - earlyProgress) + lateStep * earlyProgress;
        adaptiveStepSeconds = Math.max(minStepSeconds, Math.min(maxStepSeconds, adaptiveStepSeconds));

        var nextT = t + adaptiveStepSeconds / 86400;
        if (!(nextT > t)) {
            nextT = t + minStepSeconds / 86400;
        }
        t = nextT;
        guard += 1;
    }

    if (jdPoints.length && jdPoints[jdPoints.length - 1] < rangeEnd) {
        var scEnd = getChebPosition(scSeries, rangeEnd);
        var secondaryEnd = secondarySeries ? getChebPosition(secondarySeries, rangeEnd) : null;
        if (scEnd) {
            scPoints.push(scEnd);
            secondaryPoints.push(secondaryEnd || null);
            jdPoints.push(rangeEnd);
        }
    }

    if (!scPoints.length || !jdPoints.length) {
        throw new Error("Insufficient sampled points");
    }

    return {
        modeKey: modeKey,
        centerBodyKey: mode.centerBodyKey,
        secondaryBodyKey: mode.secondaryBodyKey,
        secondaryLabel: mode.secondaryLabel,
        scPoints: scPoints,
        secondaryPoints: secondaryPoints,
        jdPoints: jdPoints,
        halfSideKm: computePreviewHalfSideKm(modeKey, scDistances, secondaryDistances),
        rangeStartJd: rangeStart,
        rangeEndJd: rangeEnd
    };
}

function fetchOrbitPreviewData(row, modeKey) {
    var cacheKey = rowOrbitPreviewKey(row) + "::" + normalizeKey(modeKey || "geo");
    if (orbitPreviewCache.has(cacheKey)) {
        return Promise.resolve(orbitPreviewCache.get(cacheKey));
    }

    var folder = rowOrbitPreviewKey(row);
    if (!folder) {
        orbitPreviewCache.set(cacheKey, null);
        return Promise.resolve(null);
    }

    return fetchOrbitPreviewConfig(row)
        .then(function(config) {
            var candidates = collectOrbitPreviewCandidates(config, modeKey || "geo");
            if (!candidates.length) {
                throw new Error("No preview candidates");
            }
            return fetchFirstAvailableChebJson(folder, candidates, 0);
        })
        .then(function(chebData) {
            var payload = buildOrbitPreviewPayload(chebData, modeKey || "geo");
            orbitPreviewCache.set(cacheKey, payload);
            return payload;
        })
        .catch(function() {
            orbitPreviewCache.set(cacheKey, null);
            return null;
        });
}

export { fetchOrbitPreviewModeOptions, fetchOrbitPreviewData };
