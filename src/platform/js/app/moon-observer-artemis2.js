import { TIME_CONSTANTS } from "../core/constants.js";
import { getPositionFromChebyshev } from "../core/domain/ephemeris-core.js";
import { buildMediaThumbnailKey } from "../core/domain/media-manifest.js";

export const ARTEMIS2_MOON_REFERENCE_IDS = Object.freeze([
    "art002e009277",
    "art002e009278",
    "art002e009279",
    "art002e010208",
    "art002e009281",
    "art002e009283",
    "art002e009287",
    "art002e009289",
]);

// Crater-feature camera fits; see docs/research/moon-rendering/artemis-reference-calibration.md.
// Errors are measured in a 1497 x 998 comparison frame.
const REFERENCE_REGISTRATION = Object.freeze({
    art002e009277: Object.freeze({
        targetMode: "surface",
        targetLatitude: -23.840551,
        targetLongitude: -89.073070,
        rollDegrees: -165.517498,
        verticalFovDegrees: 6.263701,
        comparisonFovDegrees: 6.263701,
        matchedFeatures: 2868,
        medianReprojectionErrorPixels: 1.138,
    }),
    art002e009278: Object.freeze({
        targetMode: "surface",
        targetLatitude: -34.332229,
        targetLongitude: -41.811398,
        rollDegrees: 40.161465,
        verticalFovDegrees: 9.615388,
        comparisonFovDegrees: 9.615388,
        matchedFeatures: 931,
        medianReprojectionErrorPixels: 1.415,
    }),
    art002e009279: Object.freeze({
        targetMode: "surface",
        targetLatitude: 0.581248,
        targetLongitude: -121.314855,
        rollDegrees: 24.778944,
        verticalFovDegrees: 7.789263,
        comparisonFovDegrees: 7.789263,
        matchedFeatures: 3385,
        medianReprojectionErrorPixels: 0.805,
    }),
    art002e010208: Object.freeze({
        targetMode: "surface",
        targetLatitude: 0.100086,
        targetLongitude: -118.313771,
        rollDegrees: -90.846345,
        verticalFovDegrees: 16.680493,
        comparisonFovDegrees: 16.680493,
        matchedFeatures: 3311,
        medianReprojectionErrorPixels: 0.435,
    }),
    art002e009281: Object.freeze({
        targetMode: "surface",
        targetLatitude: 34.724673,
        targetLongitude: -143.191383,
        rollDegrees: -28.511341,
        verticalFovDegrees: 6.645702,
        comparisonFovDegrees: 6.645702,
        matchedFeatures: 1423,
        medianReprojectionErrorPixels: 0.931,
    }),
    art002e009283: Object.freeze({
        targetMode: "surface",
        targetLatitude: -55.010704,
        targetLongitude: -134.868381,
        rollDegrees: -37.892542,
        verticalFovDegrees: 3.461792,
        comparisonFovDegrees: 3.461792,
        matchedFeatures: 614,
        medianReprojectionErrorPixels: 1.296,
    }),
    art002e009287: Object.freeze({
        targetMode: "surface",
        targetLatitude: -3.546541,
        targetLongitude: -143.077811,
        rollDegrees: 94.437300,
        verticalFovDegrees: 16.682829,
        comparisonFovDegrees: 16.682829,
        matchedFeatures: 1235,
        medianReprojectionErrorPixels: 0.486,
    }),
    art002e009289: Object.freeze({
        targetMode: "surface",
        targetLatitude: 17.3461,
        targetLongitude: -125.3453,
        rollDegrees: 91.14,
        verticalFovDegrees: 6.146,
        comparisonFovDegrees: 8.0,
    }),
});

// Display exposure corrections verified against the processed reference JPEGs.
// Raw shutter/aperture ratios alone worsened several photos and are not applied.
const REFERENCE_DISPLAY_EXPOSURE = Object.freeze({
    art002e010208: 1.00,
    art002e009281: 1.05,
    art002e009283: 0.60,
});

export function resolveArtemisReferenceExposure(referenceId) {
    return REFERENCE_DISPLAY_EXPOSURE[referenceId] || 0.40;
}

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

export function resolveReferenceAngularScale(sourceFovDegrees, comparisonFovDegrees) {
    const sourceFov = Number(sourceFovDegrees);
    const comparisonFov = Number(comparisonFovDegrees);
    if (
        !Number.isFinite(sourceFov)
        || !Number.isFinite(comparisonFov)
        || sourceFov <= 0
        || comparisonFov <= 0
    ) {
        return 1;
    }
    const sourceTangent = Math.tan(sourceFov * Math.PI / 360);
    const comparisonTangent = Math.tan(comparisonFov * Math.PI / 360);
    return sourceTangent / comparisonTangent;
}

function resolveReferenceAssetUrl(fileName, mediaBase) {
    const base = String(mediaBase || "").replace(/\/?$/, "/");
    return `${base}web/${encodeURIComponent(String(fileName || ""))}`;
}

function resolveReferenceThumbnailUrl(fileName, thumbnails = null) {
    const config = thumbnails && typeof thumbnails === "object" ? thumbnails : {};
    const key = buildMediaThumbnailKey(fileName);
    const pattern = String(config.imagePattern || "images/{key}.webp")
        .replaceAll("{key}", key)
        .replaceAll("{file}", key)
        .replaceAll("{id}", key)
        .replaceAll("{kind}", "image");
    const basePath = String(config.basePath || "../media/thumbnails").replace(/\/?$/, "/");
    const manifestUrl = new URL(
        "assets/artemis2/data/media-manifest.json",
        "https://moon-observer.invalid/",
    );
    return new URL(`${basePath}${pattern}`, manifestUrl).pathname.replace(/^\//, "");
}

function utcMillisecondsToJulianDateTdb(timeMs) {
    return (timeMs + TIME_CONSTANTS.TDB_OFFSET_MS) / MS_PER_DAY + JD_UNIX_EPOCH;
}

export function mergeArtemisReferenceRegistration(reference, state, explicitParams = new Set()) {
    const has = (key) => explicitParams?.has?.(key) === true;
    return {
        ...state,
        cameraFovDegrees: has("fov")
            ? state.cameraFovDegrees
            : (reference.comparisonFovDegrees || reference.verticalFovDegrees),
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
            thumbnailUrl: resolveReferenceThumbnailUrl(photo.file, manifest?.thumbnails),
            verticalFovDegrees: Number(registration.verticalFovDegrees)
                || resolveReferenceVerticalFovDegrees(photo.settings),
            comparisonFovDegrees: Number(registration.comparisonFovDegrees)
                || Number(registration.verticalFovDegrees)
                || resolveReferenceVerticalFovDegrees(photo.settings),
            targetMode: registration.targetMode || "center",
            targetLatitude: Number(registration.targetLatitude) || 0,
            targetLongitude: Number(registration.targetLongitude) || 0,
            rollDegrees: Number(registration.rollDegrees) || 0,
            registrationStatus: registration.targetMode ? "registered" : "unregistered",
            displayExposure: resolveArtemisReferenceExposure(referenceId),
            registrationMatchedFeatures: registration.matchedFeatures || null,
            registrationMedianErrorPixels: registration.medianReprojectionErrorPixels || null,
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
