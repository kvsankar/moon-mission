import * as Astronomy from "astronomy-engine";

const KM_PER_AU = 149597870.7;
const MOON_RADIUS_KM = 1737.4;
const EPSILON = 1e-12;

function vectorLength(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
}

function normalizeVector(vector, fallback = { x: 0, y: 0, z: 1 }) {
    const length = vectorLength(vector);
    if (!Number.isFinite(length) || length <= EPSILON) {
        return { ...fallback };
    }
    return {
        x: vector.x / length,
        y: vector.y / length,
        z: vector.z / length,
    };
}

function subtractVectors(left, right) {
    return {
        x: left.x - right.x,
        y: left.y - right.y,
        z: left.z - right.z,
    };
}

function scaleVector(vector, scale) {
    return {
        x: vector.x * scale,
        y: vector.y * scale,
        z: vector.z * scale,
    };
}

function dotVectors(left, right) {
    return left.x * right.x + left.y * right.y + left.z * right.z;
}

function crossVectors(left, right) {
    return {
        x: left.y * right.z - left.z * right.y,
        y: left.z * right.x - left.x * right.z,
        z: left.x * right.y - left.y * right.x,
    };
}

function rotateEqjToEcliptic(vector, time) {
    const rotated = Astronomy.RotateVector(
        Astronomy.Rotation_EQJ_ECL(),
        new Astronomy.Vector(vector.x, vector.y, vector.z, time),
    );
    return { x: rotated.x, y: rotated.y, z: rotated.z };
}

function projectOntoViewPlane(vector, observerDirection) {
    return subtractVectors(
        vector,
        scaleVector(observerDirection, dotVectors(vector, observerDirection)),
    );
}

export function rotateObserverScreenUp(screenUp, observerDirection, rollDegrees = 0) {
    const axis = normalizeVector(scaleVector(observerDirection, -1));
    const vector = normalizeVector(screenUp);
    const angle = Number(rollDegrees) * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cross = crossVectors(axis, vector);
    const axisWeight = dotVectors(axis, vector) * (1 - cos);
    return normalizeVector({
        x: vector.x * cos + cross.x * sin + axis.x * axisWeight,
        y: vector.y * cos + cross.y * sin + axis.y * axisWeight,
        z: vector.z * cos + cross.z * sin + axis.z * axisWeight,
    });
}

export function resolveBrightLimbAngleDegrees({
    observerDirection,
    sunDirection,
    screenUp,
}) {
    const projectedSun = projectOntoViewPlane(sunDirection, observerDirection);
    if (vectorLength(projectedSun) <= EPSILON) {
        return null;
    }
    const up = normalizeVector(projectOntoViewPlane(screenUp, observerDirection));
    const cameraForward = scaleVector(observerDirection, -1);
    const right = normalizeVector(crossVectors(cameraForward, up), { x: 1, y: 0, z: 0 });
    const sun = normalizeVector(projectedSun);
    return Math.atan2(dotVectors(sun, right), dotVectors(sun, up)) * 180 / Math.PI;
}

export function resolveMoonObserverGeometry({
    date = new Date(),
    observerMode = "geocenter",
    latitude = 0,
    longitude = 0,
    elevationMeters = 0,
} = {}) {
    const resolvedDate = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(resolvedDate.getTime())) {
        throw new Error("A valid UTC observation time is required.");
    }

    const time = Astronomy.MakeTime(resolvedDate);
    const moonGeocentricEqj = Astronomy.GeoVector(Astronomy.Body.Moon, time, true);
    const sunGeocentricEqj = Astronomy.GeoVector(Astronomy.Body.Sun, time, true);
    const siteMode = observerMode === "site";
    let observer = null;
    let observerToMoonEqj = moonGeocentricEqj;
    let screenUpEqj = { x: 0, y: 0, z: 1 };
    let horizontal = null;

    if (siteMode) {
        observer = new Astronomy.Observer(
            Number(latitude),
            Number(longitude),
            Number(elevationMeters),
        );
        observerToMoonEqj = Astronomy.Equator(
            Astronomy.Body.Moon,
            time,
            observer,
            false,
            true,
        ).vec;
        const moonOfDate = Astronomy.Equator(
            Astronomy.Body.Moon,
            time,
            observer,
            true,
            true,
        );
        horizontal = Astronomy.Horizon(
            time,
            observer,
            moonOfDate.ra,
            moonOfDate.dec,
            "normal",
        );
        const localZenithEqj = Astronomy.RotateVector(
            Astronomy.Rotation_HOR_EQJ(time, observer),
            new Astronomy.Vector(0, 0, 1, time),
        );
        screenUpEqj = localZenithEqj;
    }

    const moonToObserverEqj = scaleVector(observerToMoonEqj, -1);
    const moonToSunEqj = subtractVectors(sunGeocentricEqj, moonGeocentricEqj);
    const observerDirection = normalizeVector(rotateEqjToEcliptic(moonToObserverEqj, time));
    const sunDirection = normalizeVector(rotateEqjToEcliptic(moonToSunEqj, time));
    const unprojectedScreenUp = rotateEqjToEcliptic(screenUpEqj, time);
    const screenUp = normalizeVector(
        projectOntoViewPlane(unprojectedScreenUp, observerDirection),
        { x: 0, y: 0, z: 1 },
    );
    const observerDistanceKm = vectorLength(observerToMoonEqj) * KM_PER_AU;
    const observerSunDot = Math.max(-1, Math.min(1, dotVectors(observerDirection, sunDirection)));
    const phaseAngleDegrees = Math.acos(observerSunDot) * 180 / Math.PI;
    const illuminatedFraction = (1 + observerSunDot) / 2;
    const angularDiameterDegrees = 2 * Math.asin(
        Math.min(1, MOON_RADIUS_KM / observerDistanceKm),
    ) * 180 / Math.PI;

    return {
        date: resolvedDate,
        observerMode: siteMode ? "site" : "geocenter",
        observerDirection,
        sunDirection,
        screenUp,
        observerDistanceKm,
        phaseAngleDegrees,
        illuminatedFraction,
        angularDiameterDegrees,
        altitudeDegrees: horizontal?.altitude ?? null,
        azimuthDegrees: horizontal?.azimuth ?? null,
        brightLimbAngleDegrees: resolveBrightLimbAngleDegrees({
            observerDirection,
            sunDirection,
            screenUp,
        }),
    };
}

export function resolveMoonSpacecraftObserverGeometry({
    date,
    spacecraftPositionKm,
    sunPositionKm,
    earthPositionKm = null,
} = {}) {
    const resolvedDate = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(resolvedDate.getTime())) {
        throw new Error("A valid UTC spacecraft observation time is required.");
    }
    const observerDirection = normalizeVector(spacecraftPositionKm);
    const sunDirection = normalizeVector(sunPositionKm);
    const earthDirection = earthPositionKm ? normalizeVector(earthPositionKm) : observerDirection;
    const screenUp = normalizeVector(
        projectOntoViewPlane({ x: 0, y: 0, z: 1 }, observerDirection),
        { x: 0, y: 0, z: 1 },
    );
    const observerDistanceKm = vectorLength(spacecraftPositionKm);
    const observerSunDot = Math.max(-1, Math.min(1, dotVectors(observerDirection, sunDirection)));
    const phaseAngleDegrees = Math.acos(observerSunDot) * 180 / Math.PI;
    return {
        date: resolvedDate,
        observerMode: "artemis2",
        observerDirection,
        observerPositionKm: { ...spacecraftPositionKm },
        sunDirection,
        earthDirection,
        screenUp,
        observerDistanceKm,
        phaseAngleDegrees,
        illuminatedFraction: (1 + observerSunDot) / 2,
        angularDiameterDegrees: 2 * Math.asin(
            Math.min(1, MOON_RADIUS_KM / observerDistanceKm),
        ) * 180 / Math.PI,
        altitudeDegrees: null,
        azimuthDegrees: null,
        brightLimbAngleDegrees: resolveBrightLimbAngleDegrees({
            observerDirection,
            sunDirection,
            screenUp,
        }),
    };
}
