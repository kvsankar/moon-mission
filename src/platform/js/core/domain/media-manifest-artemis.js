import { resolveDataPathUrl } from "./mission-asset-resolver.js";
import {
    asTrimmedString,
    parseMediaTimestamp,
    normalizeBackgroundPlayback,
    resolveMediaAssetUrl,
    normalizeSourceMetadata,
    toFiniteNumber,
    parseDurationSeconds,
    resolveThumbnailConventionAssetUrl,
    normalizePlaybackRoles,
    buildMediaThumbnailKey,
    normalizeTextArray,
    applyMediaMetadata,
    resolveMediaMetadata,
} from "./media-manifest-fields.js";

const ARTEMIS_TIMELINE_DEFAULT_TIMEZONE_OFFSET = "-04:00";

function ensureTrailingSlash(value) {
    const normalized = asTrimmedString(value);
    if (!normalized) return "";
    return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function normalizeArtemisTimelineCameraId(photo) {
    const explicitCameraId = asTrimmedString(photo?.camera_id || photo?.cameraId);
    if (explicitCameraId) return explicitCameraId;

    const cameraText = asTrimmedString(photo?.camera).toUpperCase();
    if (!cameraText) return "";
    if (cameraText.includes("Z 9") || cameraText.includes("Z9")) return "z9";
    if (cameraText.includes("HERO")) return "gopro";
    if (cameraText.includes("IPHONE")) return "iphone";
    return "";
}

function isArtemisTimelineExteriorPhoto(photo) {
    if (photo?.exterior === true) return true;
    return asTrimmedString(photo?.camera).toUpperCase().includes("HERO");
}

function resolveArtemisTimelineWebAssetUrl(fileName, mediaBase, dataPath) {
    const normalizedFileName = asTrimmedString(fileName);
    if (!normalizedFileName) return "";

    const normalizedMediaBase = ensureTrailingSlash(mediaBase);
    if (normalizedMediaBase) {
        return `${normalizedMediaBase}web/${encodeURIComponent(normalizedFileName)}`;
    }

    return resolveDataPathUrl(dataPath, `web/${normalizedFileName}`) || "";
}

function encodePathSegments(value) {
    return asTrimmedString(value)
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}

function resolveArtemisTimelineDirectAssetUrl(fileName, mediaBase, dataPath) {
    const normalizedFileName = asTrimmedString(fileName);
    if (!normalizedFileName) return "";

    const normalizedMediaBase = ensureTrailingSlash(mediaBase);
    if (normalizedMediaBase) {
        return `${normalizedMediaBase}${encodePathSegments(normalizedFileName)}`;
    }

    return resolveDataPathUrl(dataPath, normalizedFileName) || "";
}

function resolveArtemisTimelinePosterAssetUrl(fileName, mediaBase, dataPath) {
    const normalizedFileName = asTrimmedString(fileName);
    if (!normalizedFileName || !/\.mp4$/i.test(normalizedFileName)) {
        return "";
    }
    const posterFileName = normalizedFileName.replace(/\.mp4$/i, "-poster.jpg");
    return resolveArtemisTimelineWebAssetUrl(posterFileName, mediaBase, dataPath);
}

function normalizeArtemisTimelinePhoto(photo, index, {
    mediaBase = "",
    dataPath = "",
    timezoneOffset = ARTEMIS_TIMELINE_DEFAULT_TIMEZONE_OFFSET,
    cameraProfilesById = {},
    thumbnailConfig = {},
    metadataByKey = new Map(),
} = {}) {
    if (!photo || typeof photo !== "object" || Array.isArray(photo)) {
        return null;
    }

    const fileName = asTrimmedString(photo.file);
    const startTimeMs = parseMediaTimestamp(photo.time, { timezoneOffset });
    if (!fileName || !Number.isFinite(startTimeMs)) {
        return null;
    }

    const isVideo = photo.video === true;
    const backgroundPlayback = normalizeBackgroundPlayback(photo.backgroundPlayback);
    const assetUrl = resolveArtemisTimelineWebAssetUrl(fileName, mediaBase, dataPath);
    const posterAssetUrl = isVideo
        ? (
            resolveMediaAssetUrl(photo.posterAsset, dataPath) ||
            resolveArtemisTimelinePosterAssetUrl(fileName, mediaBase, dataPath)
        )
        : "";
    const source = normalizeSourceMetadata(photo.source);
    const cameraId = normalizeArtemisTimelineCameraId(photo);
    const cameraProfile = cameraId ? cameraProfilesById[cameraId] : null;
    const batch = toFiniteNumber(photo.batch);
    const durationSeconds = isVideo
        ? parseDurationSeconds(photo.durationSeconds || photo.duration || photo.settings)
        : Number.NaN;
    const endTimeMs = Number.isFinite(durationSeconds)
        ? startTimeMs + (durationSeconds * 1000)
        : Number.NaN;
    const id = asTrimmedString(photo.id || fileName) || `media-item-${index + 1}`;
    const explicitThumbnailAssetUrl = resolveMediaAssetUrl(
        photo.thumbnailAsset || photo.thumbnail,
        dataPath,
    );
    const conventionThumbnailAssetUrl = resolveThumbnailConventionAssetUrl(thumbnailConfig, {
        id,
        kind: isVideo ? "videoClip" : "image",
        fileName,
        thumbnailKey: photo.thumbnailKey,
    }, dataPath);

    const normalizedItem = {
        id,
        kind: isVideo ? "videoClip" : "image",
        playbackRoles: normalizePlaybackRoles(photo.playbackRoles, { backgroundPlayback }),
        backgroundPlayback,
        enabled: photo.enabled !== false,
        startTimeMs,
        endTimeMs,
        durationSeconds,
        captureTimeMs: Number.NaN,
        effectiveTimeOffsetSeconds: 0,
        timeOffsetNote: "",
        timeSource: "timelineTime",
        title: asTrimmedString(photo.title || fileName),
        description: asTrimmedString(photo.flickr_desc || photo.desc),
        sourceLabel: source.label || fileName,
        sourceUrl: source.url,
        assetUrl,
        posterAssetUrl,
        thumbnailAssetUrl: explicitThumbnailAssetUrl
            || conventionThumbnailAssetUrl
            || posterAssetUrl
            || assetUrl,
        thumbnailKey: buildMediaThumbnailKey(photo.thumbnailKey, id, fileName),
        photographer: asTrimmedString(photo.photographer),
        cameraId,
        cameraLabel: asTrimmedString(cameraProfile?.label || photo.camera),
        location: asTrimmedString(photo.location),
        fileName,
        settings: asTrimmedString(photo.settings),
        tags: normalizeTextArray(photo.tags),
        crewCaptured: photo.spacecraft === true,
        external: isArtemisTimelineExteriorPhoto(photo),
        batch: Number.isFinite(batch) ? batch : 0,
        availabilityStartPolicy: "",
    };
    return applyMediaMetadata(
        normalizedItem,
        resolveMediaMetadata(metadataByKey, {
            id,
            fileName,
            thumbnailKey: photo.thumbnailKey,
        }),
    );
}

function normalizeArtemisTimelineMediaItems(manifest, dataPath, cameraProfilesById, thumbnailConfig = {}, metadataByKey = new Map()) {
    const photos = Array.isArray(manifest?.photos) ? manifest.photos : [];
    if (photos.length === 0) return [];

    const mediaBase = asTrimmedString(manifest?.mediaBase);
    const timezoneOffset = asTrimmedString(manifest?.timelineTimezoneOffset)
        || ARTEMIS_TIMELINE_DEFAULT_TIMEZONE_OFFSET;

    return photos
        .map((photo, index) => normalizeArtemisTimelinePhoto(photo, index, {
            mediaBase,
            dataPath,
            timezoneOffset,
            cameraProfilesById,
            thumbnailConfig,
            metadataByKey,
        }))
        .filter(Boolean);
}

function normalizeArtemisTimelineAudioItem(audio, index, {
    mediaBase = "",
    dataPath = "",
    timezoneOffset = ARTEMIS_TIMELINE_DEFAULT_TIMEZONE_OFFSET,
    thumbnailConfig = {},
    metadataByKey = new Map(),
} = {}) {
    if (!audio || typeof audio !== "object" || Array.isArray(audio)) {
        return null;
    }

    const fileName = asTrimmedString(audio.file);
    const startTimeMs = parseMediaTimestamp(audio.time, { timezoneOffset });
    if (!fileName || !Number.isFinite(startTimeMs)) {
        return null;
    }

    const description = asTrimmedString(audio.desc || audio.title || fileName);
    const backgroundPlayback = normalizeBackgroundPlayback(audio.backgroundPlayback);
    const durationSeconds = parseDurationSeconds(audio.durationSeconds || audio.duration || audio.settings);
    const endTimeMs = Number.isFinite(durationSeconds)
        ? startTimeMs + (durationSeconds * 1000)
        : Number.NaN;
    const id = asTrimmedString(audio.id) || `audio:${fileName}`;
    const explicitThumbnailAssetUrl = resolveMediaAssetUrl(
        audio.thumbnailAsset || audio.thumbnail,
        dataPath,
    );
    const normalizedItem = {
        id,
        kind: "audioClip",
        playbackRoles: normalizePlaybackRoles(audio.playbackRoles, { backgroundPlayback }),
        backgroundPlayback,
        enabled: audio.enabled !== false,
        startTimeMs,
        endTimeMs,
        durationSeconds,
        title: description,
        description,
        sourceLabel: fileName,
        sourceUrl: "",
        assetUrl: resolveArtemisTimelineDirectAssetUrl(fileName, mediaBase, dataPath),
        thumbnailAssetUrl: explicitThumbnailAssetUrl
            || resolveThumbnailConventionAssetUrl(thumbnailConfig, {
                id,
                kind: "audioClip",
                fileName,
                thumbnailKey: audio.thumbnailKey,
            }, dataPath),
        thumbnailKey: buildMediaThumbnailKey(audio.thumbnailKey, id, fileName),
        fileName,
    };
    return applyMediaMetadata(
        normalizedItem,
        resolveMediaMetadata(metadataByKey, {
            id,
            fileName,
            thumbnailKey: audio.thumbnailKey,
        }),
    );
}

function normalizeArtemisTimelineAudioItems(manifest, dataPath, thumbnailConfig = {}, metadataByKey = new Map()) {
    const audio = Array.isArray(manifest?.audio) ? manifest.audio : [];
    if (audio.length === 0) return [];

    const mediaBase = asTrimmedString(manifest?.mediaBase);
    const timezoneOffset = asTrimmedString(manifest?.timelineTimezoneOffset)
        || ARTEMIS_TIMELINE_DEFAULT_TIMEZONE_OFFSET;

    return audio
        .map((item, index) => normalizeArtemisTimelineAudioItem(item, index, {
            mediaBase,
            dataPath,
            timezoneOffset,
            thumbnailConfig,
            metadataByKey,
        }))
        .filter(Boolean)
        .sort((a, b) => a.startTimeMs - b.startTimeMs);
}

export {
    normalizeArtemisTimelineMediaItems,
    normalizeArtemisTimelineAudioItems,
};
