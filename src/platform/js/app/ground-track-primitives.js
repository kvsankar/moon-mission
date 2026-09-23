import * as THREE from "three";

import {
    GLOBE_RADIUS,
    GLOBE_WORLD_NORTH,
    GLOBE_VIEW_UP,
    GLOBE_VIEW_FRONT,
} from "./ground-track-config.js";

function formatUtcDateTime(timeMs) {
    if (!Number.isFinite(timeMs)) return "--";
    try {
        return new Intl.DateTimeFormat("en-GB", {
            timeZone: "UTC",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        }).format(timeMs).replace(",", "") + " UTC";
    } catch {
        return `${new Date(timeMs).toISOString().replace("T", " ").replace("Z", " UTC")}`;
    }
}

function buildGeneratedSegmentNote(provenance) {
    if (!provenance) return "";
    if (provenance.uiNote) return provenance.uiNote;
    return `After ${formatUtcDateTime(provenance.sourceEndMs)}, the final descent to splashdown is app-generated ballistic continuation data and not JPL HORIZONS vector data.`;
}

function unwrapTimedTrackPoints(points) {
    const unwrapped = [];
    let previousLon = null;
    for (const point of points) {
        const lat = point?.lat;
        let lon = point?.lon;
        const timeMs = point?.timeMs;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(timeMs)) continue;
        if (Number.isFinite(previousLon)) {
            while ((lon - previousLon) > 180) lon -= 360;
            while ((lon - previousLon) < -180) lon += 360;
        }
        unwrapped.push({ lat, lon, timeMs });
        previousLon = lon;
    }
    return unwrapped;
}

function timedPointsToSegments(points) {
    if (!Array.isArray(points) || points.length < 2) return [];
    return [[...points.map((point) => [point.lat, point.lon])]];
}

function resolveGeneratedTrackSegments(points, sourceEndMs) {
    if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(sourceEndMs)) return [];
    const firstGeneratedIndex = points.findIndex((point) => point.timeMs > sourceEndMs);
    if (firstGeneratedIndex < 0) return [];
    const startIndex = Math.max(0, firstGeneratedIndex - 1);
    return timedPointsToSegments(points.slice(startIndex));
}

function latLonToVector3(latDeg, lonDeg, radius = GLOBE_RADIUS) {
    const lat = THREE.MathUtils.degToRad(latDeg);
    const lon = THREE.MathUtils.degToRad(lonDeg);
    const cosLat = Math.cos(lat);
    return new THREE.Vector3(
        radius * cosLat * Math.cos(lon),
        radius * Math.sin(lat),
        -radius * cosLat * Math.sin(lon),
    );
}

function resolveNorthUpTrackQuaternion(targetVector) {
    if (!(targetVector instanceof THREE.Vector3)) {
        return new THREE.Quaternion();
    }
    const front = GLOBE_VIEW_FRONT.clone();
    const north = GLOBE_WORLD_NORTH.clone();
    const qFaceTarget = new THREE.Quaternion().setFromUnitVectors(targetVector.clone().normalize(), front);
    const rotatedNorth = north.applyQuaternion(qFaceTarget);
    const projectedNorth = rotatedNorth.sub(front.clone().multiplyScalar(rotatedNorth.dot(front)));
    if (projectedNorth.lengthSq() <= 1e-10) {
        return qFaceTarget;
    }
    projectedNorth.normalize();
    const signedAngle = Math.atan2(
        front.dot(new THREE.Vector3().crossVectors(projectedNorth, GLOBE_VIEW_UP)),
        projectedNorth.dot(GLOBE_VIEW_UP),
    );
    const qNorthUp = new THREE.Quaternion().setFromAxisAngle(front, signedAngle);
    return qNorthUp.multiply(qFaceTarget);
}

function disposeObject3D(object) {
    if (!object) return;
    if (object.geometry?.dispose) object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
        material.forEach((entry) => entry?.dispose?.());
    } else {
        material?.dispose?.();
    }
}
export {
    buildGeneratedSegmentNote,
    unwrapTimedTrackPoints,
    timedPointsToSegments,
    resolveGeneratedTrackSegments,
    latLonToVector3,
    resolveNorthUpTrackQuaternion,
    disposeObject3D,
};
