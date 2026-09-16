import { resolveMissionMediaManifestUrl } from "../core/domain/mission-asset-resolver.js";
import { getMissionDataPath } from "./mission-data.js";

// Only known absence and valid manifests are durable. Failed requests remain
// retryable, and a completion can populate only its captured URL's entry.
const mediaManifestValues = new Map();
const mediaManifestPromises = new Map();

class MediaManifestLoadError extends Error {
    constructor(kind, { status = null, cause } = {}) {
        super("Mission media could not be loaded.", { cause });
        this.name = "MediaManifestLoadError";
        this.kind = kind;
        this.status = status;
    }
}

function validateMediaManifest(manifest) {
    const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const invalid = field => {
        throw new MediaManifestLoadError("shape", { cause: new Error(`Invalid media manifest field: ${field}`) });
    };
    if (!isRecord(manifest)) invalid("manifest");
    // Validate supplied collection containers, preserving the normalizer's
    // tolerant per-item handling and its supported camera-profile formats.
    for (const field of ["mediaItems", "audioItems", "mediaStreams", "photos", "audio", "mediaMetadata"]) {
        if (Object.hasOwn(manifest, field) && !Array.isArray(manifest[field])) invalid(field);
    }
    for (const field of ["ui", "filters", "provenance", "thumbnails"]) {
        if (Object.hasOwn(manifest, field) && !isRecord(manifest[field])) invalid(field);
    }
    if (Object.hasOwn(manifest, "cameraProfiles") &&
        !isRecord(manifest.cameraProfiles) && !Array.isArray(manifest.cameraProfiles)) {
        invalid("cameraProfiles");
    }
    return manifest;
}

async function fetchMediaManifest(url) {
    let response;
    try {
        response = await fetch(url, { cache: "no-store" });
    } catch (cause) {
        throw new MediaManifestLoadError("network", { cause });
    }
    if (response?.status === 404) return null;
    if (!response?.ok) {
        const status = Number.isInteger(response?.status) ? response.status : null;
        throw new MediaManifestLoadError("http", { status,
            cause: new Error("Media manifest request was unsuccessful.") });
    }
    let manifest;
    try {
        manifest = await response.json();
    } catch (cause) {
        throw new MediaManifestLoadError("parse", { cause });
    }
    return validateMediaManifest(manifest);
}

function isLocalDevHost(hostname) {
    const normalized = String(hostname || "").trim().toLowerCase();
    return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function resolveLocalDevMediaManifestUrl(manifestUrl, windowRef = globalThis.window) {
    if (!manifestUrl || !isLocalDevHost(windowRef?.location?.hostname)) {
        return manifestUrl;
    }
    let parsed;
    try {
        parsed = new URL(manifestUrl, windowRef.location.href);
    } catch {
        return manifestUrl;
    }
    if (isLocalDevHost(parsed.hostname)) {
        return parsed.toString();
    }
    const match = parsed.pathname.match(/\/(?:moon-mission\/)?(assets\/[^?#]+\/data\/media-manifest\.json)$/i);
    if (!match) {
        return manifestUrl;
    }
    return new URL(`/${match[1]}`, windowRef.location.origin).toString();
}

function getMissionMediaManifestUrl() {
    return resolveLocalDevMediaManifestUrl(resolveMissionMediaManifestUrl(getMissionDataPath()));
}

function getMissionMediaDataPath() {
    const manifestUrl = getMissionMediaManifestUrl();
    if (!manifestUrl) return getMissionDataPath() || "";
    return manifestUrl.replace(/media-manifest\.json(?:[?#].*)?$/i, "");
}

async function loadMissionMediaManifest() {
    const url = getMissionMediaManifestUrl();
    if (!url) return null;
    if (mediaManifestValues.has(url)) return mediaManifestValues.get(url);
    if (mediaManifestPromises.has(url)) return mediaManifestPromises.get(url);

    // Install the pending owner before invoking the fetch effect.
    const promise = Promise.resolve().then(() => fetchMediaManifest(url))
        .then(manifest => {
            mediaManifestValues.set(url, manifest);
            return manifest;
        })
        .finally(() => {
            if (mediaManifestPromises.get(url) === promise) mediaManifestPromises.delete(url);
        });
    mediaManifestPromises.set(url, promise);
    return promise;
}

export {
    getMissionMediaDataPath,
    getMissionMediaManifestUrl,
    loadMissionMediaManifest,
    MediaManifestLoadError,
    resolveLocalDevMediaManifestUrl,
};
