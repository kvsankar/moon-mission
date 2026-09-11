import { TIME_CONSTANTS } from "../core/constants.js";
import { getPositionFromChebyshev } from "../core/domain/ephemeris-core.js";

export const ARTEMIS2_MOON_REFERENCE_IDS = Object.freeze([
    "art002e009277",
    "art002e009279",
    "art002e009289",
    "art002e009582",
    "art002e010208",
]);

const REFERENCE_REGISTRATION = Object.freeze({
    art002e009289: Object.freeze({
        targetMode: "surface",
        targetLatitude: 17.3461,
        targetLongitude: -125.3453,
        rollDegrees: 91.14,
        verticalFovDegrees: 6.146,
    }),
});

const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 86400000;
const NIKON_D5_SENSOR_HEIGHT_MM = 23.9;

function normalizeVector(vector) {
    const length = Math.hypot(vector?.x, vector?.y, vector?.z);
    if (!Number.isFinite(length) || length <= 1e-12) return null;
    return {
        x: vector.x / length,
        y: vector.y / length,
        z: vector.z / length,
    };
}

function parseReferenceId(photo) {
    return String(photo?.flickr_desc || "").match(/\bart\d{3}e\d{6}\b/i)?.[0]?.toLowerCase() || "";
}

export function parseArtemis2ReferenceTime(timeText, timezoneOffset = "-04:00") {
    const normalized = String(timeText || "").trim().replace(" ", "T");
    const offset = /^[+-]\d{2}:\d{2}$/.test(String(timezoneOffset || ""))
        ? timezoneOffset
        : "-04:00";
    const date = new Date(`${normalized}${offset}`);
    return Number.isFinite(date.getTime()) ? date : null;
}

export function resolveReferenceVerticalFovDegrees(settingsText, sensorHeightMm = NIKON_D5_SENSOR_HEIGHT_MM) {
    const focalLengthMm = Number(String(settingsText || "").match(/([\d.]+)\s*mm/i)?.[1]);
    if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) return 12;
    return 2 * Math.atan(Number(sensorHeightMm) / (2 * focalLengthMm)) * 180 / Math.PI;
}

function resolveReferenceAssetUrl(fileName, mediaBase) {
    const base = String(mediaBase || "").replace(/\/?$/, "/");
    return `${base}web/${encodeURIComponent(String(fileName || ""))}`;
}

function utcMillisecondsToJulianDateTdb(timeMs) {
    return (timeMs + TIME_CONSTANTS.TDB_OFFSET_MS) / MS_PER_DAY + JD_UNIX_EPOCH;
}

export function mergeArtemisReferenceRegistration(reference, state, explicitParams = new Set()) {
    const has = (key) => explicitParams?.has?.(key) === true;
    return {
        ...state,
        cameraFovDegrees: has("fov") ? state.cameraFovDegrees : reference.verticalFovDegrees,
        targetMode: has("target") ? state.targetMode : reference.targetMode,
        targetLatitude: has("targetLat") ? state.targetLatitude : reference.targetLatitude,
        targetLongitude: has("targetLon") ? state.targetLongitude : reference.targetLongitude,
        rollDegrees: has("roll") ? state.rollDegrees : reference.rollDegrees,
    };
}

export function createArtemis2MoonReferencePresets({ manifest, ephemeris }) {
    const photos = Array.isArray(manifest?.photos) ? manifest.photos : [];
    const photosByReferenceId = new Map(
        photos
            .map((photo) => [parseReferenceId(photo), photo])
            .filter(([referenceId]) => ARTEMIS2_MOON_REFERENCE_IDS.includes(referenceId)),
    );
    return ARTEMIS2_MOON_REFERENCE_IDS.map((referenceId) => {
        const photo = photosByReferenceId.get(referenceId);
        const date = parseArtemis2ReferenceTime(
            photo?.time,
            manifest?.timelineTimezoneOffset,
        );
        if (!photo || !date) return null;
        const jdTdb = utcMillisecondsToJulianDateTdb(date.getTime());
        const spacecraftPositionKm = getPositionFromChebyshev(ephemeris?.SC, jdTdb);
        const sunPositionKm = getPositionFromChebyshev(ephemeris?.SUN, jdTdb);
        const earthPositionKm = getPositionFromChebyshev(ephemeris?.EARTH, jdTdb);
        if (!spacecraftPositionKm || !sunPositionKm || !earthPositionKm) return null;
        const registration = REFERENCE_REGISTRATION[referenceId] || {};
        return {
            id: referenceId,
            title: String(photo.title || referenceId),
            timeIso: date.toISOString(),
            localTime: String(photo.time || ""),
            timezoneOffset: String(manifest?.timelineTimezoneOffset || "-04:00"),
            location: String(photo.location || "Orion Spacecraft"),
            camera: String(photo.camera || ""),
            settings: String(photo.settings || ""),
            fileName: String(photo.file || ""),
            assetUrl: resolveReferenceAssetUrl(photo.file, manifest?.mediaBase),
            verticalFovDegrees: Number(registration.verticalFovDegrees)
                || resolveReferenceVerticalFovDegrees(photo.settings),
            targetMode: registration.targetMode || "center",
            targetLatitude: Number(registration.targetLatitude) || 0,
            targetLongitude: Number(registration.targetLongitude) || 0,
            rollDegrees: Number(registration.rollDegrees) || 0,
            registrationStatus: registration.targetMode ? "registered" : "unregistered",
            spacecraftPositionKm,
            sunPositionKm,
            earthPositionKm,
            observerDirection: normalizeVector(spacecraftPositionKm),
            sunDirection: normalizeVector(sunPositionKm),
        };
    }).filter(Boolean);
}

export async function loadArtemis2MoonReferencePresets({ fetchImpl = fetch } = {}) {
    const [manifestResponse, ephemerisResponse] = await Promise.all([
        fetchImpl("assets/artemis2/data/media-manifest.json"),
        fetchImpl("assets/artemis2/data/lunar-ORION-cheb.json"),
    ]);
    if (!manifestResponse.ok || !ephemerisResponse.ok) {
        throw new Error("Unable to load Artemis II Moon reference data.");
    }
    return createArtemis2MoonReferencePresets({
        manifest: await manifestResponse.json(),
        ephemeris: await ephemerisResponse.json(),
    });
}
