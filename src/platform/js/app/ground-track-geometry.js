import * as THREE from "three";

import {
    TRACK_WRAP_OFFSETS,
    J2000_OBLIQUITY_RADIANS,
} from "./ground-track-config.js";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function dateToJulianDate(ms) {
    return (ms / 86400000) + 2440587.5;
}

function julianDateToGmstRadians(julianDate) {
    const t = (julianDate - 2451545.0) / 36525.0;
    const gmstDegrees = 280.46061837 +
        (360.98564736629 * (julianDate - 2451545.0)) +
        (0.000387933 * t * t) -
        ((t * t * t) / 38710000.0);
    const radians = (gmstDegrees * Math.PI) / 180;
    const twoPi = Math.PI * 2;
    let normalized = radians % twoPi;
    if (normalized < 0) normalized += twoPi;
    return normalized;
}

function normalizeBodyId(bodyId) {
    return String(bodyId || "").trim().toUpperCase();
}

function resolveTelemetryBodyId(sceneState) {
    const requested = normalizeBodyId(sceneState?.telemetryBodyId);
    if (requested) return requested;
    if (sceneState?.bodies?.SC) return "SC";
    for (const [bodyId, state] of Object.entries(sceneState?.bodies || {})) {
        const id = normalizeBodyId(bodyId);
        if (id === "EARTH" || id === "MOON" || id === "SUN") continue;
        if (state?.position) return id;
    }
    return "SC";
}

function hasVector(vector) {
    return !!vector &&
        Number.isFinite(vector.x) &&
        Number.isFinite(vector.y) &&
        Number.isFinite(vector.z);
}

function normalizeVelocityVector(vector) {
    if (hasVector(vector)) {
        return vector;
    }
    if (
        vector &&
        Number.isFinite(vector.vx) &&
        Number.isFinite(vector.vy) &&
        Number.isFinite(vector.vz)
    ) {
        return {
            x: vector.vx,
            y: vector.vy,
            z: vector.vz,
        };
    }
    return null;
}

function subtractVectors(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
    };
}

function negateVector(vector) {
    if (!hasVector(vector)) return null;
    return {
        x: -vector.x,
        y: -vector.y,
        z: -vector.z,
    };
}

function magnitude(vector) {
    if (!hasVector(vector)) return Number.NaN;
    return Math.hypot(vector.x, vector.y, vector.z);
}

function rotateEclipticToEquatorial(vector) {
    if (!hasVector(vector)) return null;
    const cosEps = Math.cos(J2000_OBLIQUITY_RADIANS);
    const sinEps = Math.sin(J2000_OBLIQUITY_RADIANS);
    return {
        x: vector.x,
        y: (vector.y * cosEps) - (vector.z * sinEps),
        z: (vector.y * sinEps) + (vector.z * cosEps),
    };
}

function eciToLatLonDegrees(vectorEci, timeMs) {
    if (!hasVector(vectorEci) || !Number.isFinite(timeMs)) return null;
    const equatorialVector = rotateEclipticToEquatorial(vectorEci);
    if (!hasVector(equatorialVector)) return null;
    const gmst = julianDateToGmstRadians(dateToJulianDate(timeMs));
    const cosG = Math.cos(gmst);
    const sinG = Math.sin(gmst);
    const x = (equatorialVector.x * cosG) + (equatorialVector.y * sinG);
    const y = (-equatorialVector.x * sinG) + (equatorialVector.y * cosG);
    const z = equatorialVector.z;
    const r = Math.hypot(x, y, z);
    if (!Number.isFinite(r) || r <= 1e-9) return null;
    const lat = Math.asin(clamp(z / r, -1, 1)) * (180 / Math.PI);
    const lon = Math.atan2(y, x) * (180 / Math.PI);
    return [lat, lon];
}

function unwrapTrackPoints(points) {
    const unwrapped = [];
    let previousLon = null;
    for (const point of points) {
        if (!Array.isArray(point) || point.length !== 2) continue;
        const lat = point[0];
        let lon = point[1];
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (Number.isFinite(previousLon)) {
            while ((lon - previousLon) > 180) lon -= 360;
            while ((lon - previousLon) < -180) lon += 360;
        }
        unwrapped.push([lat, lon]);
        previousLon = lon;
    }
    return unwrapped.length >= 2 ? [unwrapped] : [];
}

function duplicateWrappedSegments(segments, wrapOffsets = TRACK_WRAP_OFFSETS) {
    const repeated = [];
    for (const segment of segments) {
        if (!Array.isArray(segment) || segment.length < 2) continue;
        for (const offset of wrapOffsets) {
            repeated.push(segment.map(([lat, lon]) => [lat, lon + offset]));
        }
    }
    return repeated;
}

function wrapLongitudeNearReference(lon, referenceLon = 0) {
    if (!Number.isFinite(lon)) return lon;
    let wrapped = lon;
    while ((wrapped - referenceLon) > 180) wrapped -= 360;
    while ((wrapped - referenceLon) < -180) wrapped += 360;
    return wrapped;
}
export {
    clamp,
    resolveTelemetryBodyId,
    hasVector,
    normalizeVelocityVector,
    subtractVectors,
    negateVector,
    magnitude,
    eciToLatLonDegrees,
    duplicateWrappedSegments,
    wrapLongitudeNearReference,
};
