import { resolveDataPathUrl } from "./mission-asset-resolver.js";

const MEDIA_ITEM_KINDS = new Set(["image", "videoClip", "audioClip"]);
const MEDIA_STREAM_SOURCE_TYPES = new Set(["mp4", "hls", "youtube", "iframe"]);
const MEDIA_PLAYBACK_ROLES = new Set(["panel", "background"]);

function asTrimmedString(value) {
    if (typeof value !== "string") return "";
    return value.trim();
}

function normalizeTextArray(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => asTrimmedString(entry))
        .filter(Boolean);
}

function normalizeMetadataKey(value) {
    return buildMediaThumbnailKey(value).toLowerCase();
}

function normalizeMediaCompositionHints(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
            suggestedLockTarget: "",
            confidence: Number.NaN,
            reason: "",
        };
    }
    const suggestedLockTarget = asTrimmedString(
        value.suggestedLockTarget || value.suggested_lock_target,
    ).toLowerCase();
    return {
        suggestedLockTarget,
        confidence: toFiniteNumber(value.confidence),
        reason: asTrimmedString(value.reason),
    };
}

function normalizeMediaMainBody(value) {
    const normalized = asTrimmedString(value).toLowerCase();
    if (normalized === "earth") return "Earth";
    if (normalized === "moon") return "Moon";
    if (normalized === "sun") return "Sun";
    return "";
}

function normalizeMediaMetadataEntry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return {
        id: asTrimmedString(value.id),
        fileName: asTrimmedString(value.file || value.fileName || value.filename),
        thumbnail: asTrimmedString(value.thumbnail || value.thumbnailAsset),
        shortDescription: asTrimmedString(value.shortDescription || value.short_description),
        tags: normalizeTextArray(value.tags),
        subjects: normalizeTextArray(value.subjects),
        sceneType: asTrimmedString(value.sceneType || value.scene_type),
        bodies: normalizeTextArray(value.bodies),
        mainBody: normalizeMediaMainBody(value.mainBody || value.main_body || value.primaryBody || value.primary_body),
        compositionHints: normalizeMediaCompositionHints(value.compositionHints || value.composition_hints),
        qualityNotes: asTrimmedString(value.qualityNotes || value.quality_notes),
    };
}

function normalizeMediaMetadataMap(entries = []) {
    const metadataByKey = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
        const normalized = normalizeMediaMetadataEntry(entry);
        if (!normalized) continue;
        const keys = [
            normalized.id,
            normalized.fileName,
            normalized.thumbnail,
        ].map(normalizeMetadataKey).filter(Boolean);
        for (const key of keys) {
            metadataByKey.set(key, normalized);
        }
    }
    return metadataByKey;
}

function resolveMediaMetadata(metadataByKey, {
    id = "",
    fileName = "",
    thumbnailKey = "",
} = {}) {
    if (!(metadataByKey instanceof Map) || metadataByKey.size === 0) return null;
    const keys = [
        id,
        fileName,
        thumbnailKey,
    ].map(normalizeMetadataKey).filter(Boolean);
    for (const key of keys) {
        const metadata = metadataByKey.get(key);
        if (metadata) return metadata;
    }
    return null;
}

function applyMediaMetadata(item, metadata) {
    const normalizedItem = item || {};
    if (!metadata) {
        return {
            ...normalizedItem,
            tags: normalizeTextArray(normalizedItem.tags),
            metadataTags: [],
            subjects: normalizeTextArray(normalizedItem.subjects),
            bodies: normalizeTextArray(normalizedItem.bodies),
            mainBody: normalizeMediaMainBody(
                normalizedItem.mainBody || normalizedItem.main_body || normalizedItem.primaryBody || normalizedItem.primary_body,
            ),
            sceneType: asTrimmedString(normalizedItem.sceneType || normalizedItem.scene_type),
            shortDescription: asTrimmedString(normalizedItem.shortDescription || normalizedItem.short_description),
            compositionHints: normalizeMediaCompositionHints(
                normalizedItem.compositionHints || normalizedItem.composition_hints,
            ),
            qualityNotes: asTrimmedString(normalizedItem.qualityNotes || normalizedItem.quality_notes),
        };
    }
    const metadataTags = normalizeTextArray(metadata.tags);
    const itemTags = normalizeTextArray(normalizedItem.tags);
    return {
        ...normalizedItem,
        description: normalizedItem.description || metadata.shortDescription || "",
        shortDescription: metadata.shortDescription || asTrimmedString(normalizedItem.shortDescription),
        tags: [...new Set([...itemTags, ...metadataTags])],
        metadataTags,
        subjects: normalizeTextArray(metadata.subjects),
        bodies: normalizeTextArray(metadata.bodies),
        mainBody: metadata.mainBody || normalizeMediaMainBody(normalizedItem.mainBody),
        sceneType: metadata.sceneType || asTrimmedString(normalizedItem.sceneType),
        compositionHints: metadata.compositionHints,
        qualityNotes: metadata.qualityNotes,
    };
}

function toFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function parseDurationSeconds(value) {
    const numeric = toFiniteNumber(value);
    if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
    }
    const text = asTrimmedString(value);
    if (!text) return Number.NaN;
    const match = text.match(/(?:^|[\s,;|·])(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i);
    if (!match) return Number.NaN;
    const seconds = Number(match[1]);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : Number.NaN;
}

function parseFixedOffsetTimestamp(value, timezoneOffset = "") {
    const text = asTrimmedString(value);
    const offset = asTrimmedString(timezoneOffset);
    if (!text || !offset) return Number.NaN;
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
        return Number.NaN;
    }
    const parsed = Date.parse(`${text.replace(" ", "T")}${offset}`);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseMediaTimestamp(value, { timezoneOffset = "" } = {}) {
    const text = asTrimmedString(value);
    if (!text) return Number.NaN;

    const fixedOffsetParsed = parseFixedOffsetTimestamp(text, timezoneOffset);
    if (Number.isFinite(fixedOffsetParsed)) {
        return fixedOffsetParsed;
    }

    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeMediaItemKind(value) {
    const normalized = asTrimmedString(value);
    return MEDIA_ITEM_KINDS.has(normalized) ? normalized : "image";
}

function normalizeStreamSourceType(value) {
    const normalized = asTrimmedString(value);
    return MEDIA_STREAM_SOURCE_TYPES.has(normalized) ? normalized : "mp4";
}

function normalizePlaybackRoles(value, { backgroundPlayback = null } = {}) {
    const roles = Array.isArray(value)
        ? value
        : (asTrimmedString(value) ? [value] : []);
    const normalizedRoles = roles
        .map((role) => asTrimmedString(role).toLowerCase())
        .filter((role) => MEDIA_PLAYBACK_ROLES.has(role));
    if (backgroundPlayback?.enabled === true) {
        normalizedRoles.push("background");
    }
    return [...new Set(normalizedRoles)];
}

function normalizeBackgroundPlayback(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
            enabled: false,
            muted: true,
            priority: 0,
            fit: "contain",
        };
    }
    const fit = asTrimmedString(value.fit).toLowerCase();
    return {
        enabled: value.enabled === true,
        muted: value.muted !== false,
        priority: Number.isFinite(toFiniteNumber(value.priority)) ? toFiniteNumber(value.priority) : 0,
        fit: fit === "cover" ? "cover" : "contain",
    };
}

function resolveMediaAssetUrl(value, dataPath) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return resolveMediaAssetUrl(value.url, dataPath);
    }
    return resolveDataPathUrl(dataPath, value);
}

function stripMediaFileExtension(value) {
    return asTrimmedString(value).replace(/\.[A-Za-z0-9]{2,5}$/u, "");
}

function buildMediaThumbnailKey(...values) {
    const source = values.map(asTrimmedString).find(Boolean);
    if (!source) return "";
    return stripMediaFileExtension(source)
        .replace(/\\/g, "/")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        || "media";
}

function normalizeThumbnailConfig(thumbnails = {}) {
    if (!thumbnails || typeof thumbnails !== "object" || Array.isArray(thumbnails)) {
        return {};
    }
    return {
        basePath: asTrimmedString(thumbnails.basePath),
        imagePattern: asTrimmedString(thumbnails.imagePattern),
        videoPattern: asTrimmedString(thumbnails.videoPattern),
        audioPattern: asTrimmedString(thumbnails.audioPattern),
        audioFallbackAsset: asTrimmedString(thumbnails.audioFallbackAsset),
    };
}

function resolveThumbnailPattern(pattern, {
    id = "",
    key = "",
    fileName = "",
    kind = "",
} = {}) {
    const normalizedPattern = asTrimmedString(pattern);
    if (!normalizedPattern) return "";
    return normalizedPattern
        .replaceAll("{id}", buildMediaThumbnailKey(id))
        .replaceAll("{key}", buildMediaThumbnailKey(key || id || fileName))
        .replaceAll("{file}", buildMediaThumbnailKey(fileName || id))
        .replaceAll("{kind}", buildMediaThumbnailKey(kind));
}

function joinRelativePath(basePath, relativePath) {
    const base = asTrimmedString(basePath).replace(/\/+$/g, "");
    const relative = asTrimmedString(relativePath).replace(/^\/+/g, "");
    if (!relative) return "";
    if (/^(https?:)?\/\//.test(relative) || relative.startsWith("/")) {
        return relative;
    }
    return base ? `${base}/${relative}` : relative;
}

function resolveThumbnailConventionAssetUrl(thumbnailConfig, {
    id = "",
    kind = "",
    fileName = "",
    thumbnailKey = "",
} = {}, dataPath) {
    const config = normalizeThumbnailConfig(thumbnailConfig);
    if (!Object.keys(config).length) return "";
    const key = buildMediaThumbnailKey(thumbnailKey, id, fileName);
    const pattern = kind === "videoClip"
        ? config.videoPattern
        : (kind === "audioClip" ? config.audioPattern : config.imagePattern);
    const relativeAsset = kind === "audioClip" && config.audioFallbackAsset
        ? config.audioFallbackAsset
        : resolveThumbnailPattern(pattern, {
            id,
            key,
            fileName,
            kind,
        });
    return resolveMediaAssetUrl(joinRelativePath(config.basePath, relativeAsset), dataPath) || "";
}

function normalizeSourceMetadata(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        const label = asTrimmedString(value);
        return {
            label,
            url: "",
        };
    }
    return {
        label: asTrimmedString(value.label || value.name),
        url: asTrimmedString(value.url || value.href),
    };
}

function normalizeCaptionTrack(track, index, dataPath) {
    if (!track || typeof track !== "object" || Array.isArray(track)) {
        return null;
    }
    const sourceUrl = resolveMediaAssetUrl(track.sourceUrl || track.src || track.url, dataPath);
    if (!sourceUrl) return null;
    const kind = asTrimmedString(track.kind).toLowerCase();
    const srclang = asTrimmedString(track.srclang || track.lang || track.language).toLowerCase();
    return {
        id: asTrimmedString(track.id) || `caption-track-${index + 1}`,
        kind: kind || "subtitles",
        label: asTrimmedString(track.label || track.title) || "Subtitles",
        srclang: srclang || "en",
        sourceUrl,
        default: track.default === true,
        attribution: asTrimmedString(track.attribution || track.sourceAttribution),
    };
}

function normalizeCaptionTracks(value, dataPath) {
    if (!Array.isArray(value)) return [];
    return value
        .map((track, index) => normalizeCaptionTrack(track, index, dataPath))
        .filter(Boolean);
}

function normalizeMediaResourceRef(value, dataPath, defaultId = "") {
    if (!value) return null;
    if (typeof value === "string") {
        const sourceUrl = resolveMediaAssetUrl(value, dataPath);
        return sourceUrl
            ? {
                id: asTrimmedString(defaultId),
                sourceUrl,
                label: "",
                attribution: "",
            }
            : null;
    }
    if (typeof value !== "object" || Array.isArray(value)) return null;
    const sourceUrl = resolveMediaAssetUrl(value.sourceUrl || value.src || value.url || value.path, dataPath);
    if (!sourceUrl) return null;
    return {
        id: asTrimmedString(value.id) || asTrimmedString(defaultId),
        sourceUrl,
        label: asTrimmedString(value.label || value.title),
        attribution: asTrimmedString(value.attribution || value.sourceAttribution),
    };
}

function normalizeStreamPartOffsets(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const [rawKey, rawOffset] of Object.entries(value)) {
        const key = asTrimmedString(rawKey);
        if (!key || !rawOffset || typeof rawOffset !== "object" || Array.isArray(rawOffset)) continue;
        const start = toFiniteNumber(rawOffset.start);
        const end = toFiniteNumber(rawOffset.end);
        if (!Number.isFinite(start)) continue;
        result[key] = {
            start,
            end: Number.isFinite(end) ? end : Number.NaN,
            durationHms: asTrimmedString(rawOffset.durationHms),
        };
    }
    return result;
}

function normalizeCameraProfiles(cameraProfiles = {}) {
    const normalizedProfiles = {};

    const entries = Array.isArray(cameraProfiles)
        ? cameraProfiles.map((entry) => [entry?.id, entry])
        : Object.entries(cameraProfiles || {});

    for (const [rawId, rawProfile] of entries) {
        const id = asTrimmedString(rawId || rawProfile?.id);
        if (!id) continue;
        const profile = rawProfile && typeof rawProfile === "object" ? rawProfile : {};
        normalizedProfiles[id] = {
            id,
            label: asTrimmedString(profile.label || profile.camera || id),
            timeOffsetSeconds: Number.isFinite(toFiniteNumber(profile.timeOffsetSeconds))
                ? toFiniteNumber(profile.timeOffsetSeconds)
                : 0,
            timeOffsetNote: asTrimmedString(profile.timeOffsetNote || profile.note),
        };
    }

    return normalizedProfiles;
}

function resolveMediaStartTimeMs(item, cameraProfile) {
    const explicitStartMs = parseMediaTimestamp(item?.startTime);
    if (Number.isFinite(explicitStartMs)) {
        return {
            startTimeMs: explicitStartMs,
            captureTimeMs: parseMediaTimestamp(item?.captureTime),
            effectiveTimeOffsetSeconds: 0,
            timeSource: "timelineTime",
        };
    }

    const captureTimeMs = parseMediaTimestamp(item?.captureTime);
    if (!Number.isFinite(captureTimeMs)) {
        return {
            startTimeMs: Number.NaN,
            captureTimeMs: Number.NaN,
            effectiveTimeOffsetSeconds: 0,
            timeSource: "",
        };
    }

    const itemOffset = toFiniteNumber(item?.timeOffsetSeconds);
    const effectiveTimeOffsetSeconds = Number.isFinite(itemOffset)
        ? itemOffset
        : Number(cameraProfile?.timeOffsetSeconds || 0);
    return {
        startTimeMs: captureTimeMs + (effectiveTimeOffsetSeconds * 1000),
        captureTimeMs,
        effectiveTimeOffsetSeconds,
        timeSource: effectiveTimeOffsetSeconds !== 0
            ? "captureTime+offset"
            : "captureTime",
    };
}

function normalizeMediaItem(item, index, cameraProfilesById, dataPath, thumbnailConfig = {}, metadataByKey = new Map()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
    }

    const id = asTrimmedString(item.id) || `media-item-${index + 1}`;
    const cameraId = asTrimmedString(item.cameraId);
    const cameraProfile = cameraId ? cameraProfilesById[cameraId] : null;
    const timeState = resolveMediaStartTimeMs(item, cameraProfile);
    if (!Number.isFinite(timeState.startTimeMs)) {
        return null;
    }

    const kind = normalizeMediaItemKind(item.kind);
    const backgroundPlayback = normalizeBackgroundPlayback(item.backgroundPlayback);
    const explicitEndMs = parseMediaTimestamp(item.endTime);
    const durationSeconds = toFiniteNumber(item.durationSeconds);
    const endTimeMs = Number.isFinite(explicitEndMs)
        ? explicitEndMs
        : (Number.isFinite(durationSeconds) && durationSeconds > 0
            ? timeState.startTimeMs + (durationSeconds * 1000)
            : Number.NaN);
    const source = normalizeSourceMetadata(item.source);
    const fileName = asTrimmedString(item.file || item.filename);
    const batch = toFiniteNumber(item.batch);
    const explicitThumbnailAssetUrl = resolveMediaAssetUrl(
        item.thumbnailAsset || item.thumbnail,
        dataPath,
    );
    const conventionThumbnailAssetUrl = resolveThumbnailConventionAssetUrl(thumbnailConfig, {
        id,
        kind,
        fileName,
        thumbnailKey: item.thumbnailKey,
    }, dataPath);

    const normalizedItem = {
        id,
        kind,
        playbackRoles: normalizePlaybackRoles(item.playbackRoles, { backgroundPlayback }),
        backgroundPlayback,
        enabled: item.enabled !== false,
        startTimeMs: timeState.startTimeMs,
        endTimeMs,
        durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0
            ? durationSeconds
            : Number.NaN,
        captureTimeMs: timeState.captureTimeMs,
        effectiveTimeOffsetSeconds: timeState.effectiveTimeOffsetSeconds,
        timeOffsetNote: asTrimmedString(item.timeOffsetNote || cameraProfile?.timeOffsetNote),
        timeSource: timeState.timeSource,
        title: asTrimmedString(item.title || item.label || fileName || id),
        description: asTrimmedString(item.description || item.summary),
        sourceLabel: source.label,
        sourceUrl: source.url,
        assetUrl: resolveMediaAssetUrl(item.asset, dataPath),
        posterAssetUrl: resolveMediaAssetUrl(item.posterAsset, dataPath),
        thumbnailAssetUrl: explicitThumbnailAssetUrl
            || conventionThumbnailAssetUrl
            || resolveMediaAssetUrl(item.posterAsset, dataPath)
            || resolveMediaAssetUrl(item.asset, dataPath),
        thumbnailKey: buildMediaThumbnailKey(item.thumbnailKey, id, fileName),
        photographer: asTrimmedString(item.photographer),
        cameraId,
        cameraLabel: asTrimmedString(item.camera || cameraProfile?.label || cameraId),
        location: asTrimmedString(item.location),
        fileName,
        settings: asTrimmedString(item.settings),
        tags: normalizeTextArray(item.tags),
        crewCaptured: item.crewCaptured === true,
        external: item.external === true,
        batch: Number.isFinite(batch) ? batch : 0,
        availabilityStartPolicy: asTrimmedString(item.availabilityStartPolicy),
    };
    return applyMediaMetadata(
        normalizedItem,
        resolveMediaMetadata(metadataByKey, {
            id,
            fileName,
            thumbnailKey: item.thumbnailKey,
        }),
    );
}

export {
    asTrimmedString,
    normalizeTextArray,
    normalizeMediaMainBody,
    normalizeMediaCompositionHints,
    toFiniteNumber,
    parseDurationSeconds,
    parseMediaTimestamp,
    normalizeBackgroundPlayback,
    resolveMediaAssetUrl,
    normalizeSourceMetadata,
    resolveThumbnailConventionAssetUrl,
    normalizePlaybackRoles,
    buildMediaThumbnailKey,
    applyMediaMetadata,
    resolveMediaMetadata,
    normalizeCaptionTracks,
    normalizeMediaResourceRef,
    normalizeStreamPartOffsets,
    normalizeStreamSourceType,
    normalizeCameraProfiles,
    normalizeThumbnailConfig,
    normalizeMediaMetadataMap,
    normalizeMediaItem,
};
