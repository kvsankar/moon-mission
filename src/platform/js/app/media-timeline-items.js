import {
    clampMediaCurrentTimeSeconds as clampMediaCurrentTimeSecondsCore,
    isBackgroundPlaybackMediaItem,
} from "../core/domain/media-playback-policy.js";
import { formatDuration } from "../utils/time-utils.js";

function formatSignedDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds === 0) return "0s";
    const sign = seconds > 0 ? "+" : "-";
    return `${sign}${formatDuration(Math.abs(seconds) * 1000, { compact: true })}`;
}

function formatPlaybackRateLabel(rate) {
    const numericRate = Number(rate);
    if (!Number.isFinite(numericRate) || numericRate <= 0) return "1x";
    if (Math.abs(numericRate - Math.round(numericRate)) < 1e-6) {
        return `${Math.round(numericRate)}x`;
    }
    return `${numericRate.toFixed(2)}x`;
}

function buildStageBadge(item) {
    if (!item) return "";
    const parts = [];
    if (item.kind === "audioClip") {
        parts.push("Audio");
    }
    if (item.mediaStream === true) {
        parts.push("Stream");
    }
    if (item.kind === "videoClip") {
        parts.push("Video");
    }
    if (item.crewCaptured === true) {
        parts.push("Crew capture");
    }
    if (item.external === true) {
        parts.push("Exterior");
    }
    if (Number.isFinite(item.effectiveTimeOffsetSeconds) && item.effectiveTimeOffsetSeconds !== 0) {
        parts.push(`Shift ${formatSignedDuration(item.effectiveTimeOffsetSeconds)}`);
    }
    return parts.join(" • ");
}

function resolvePreviewAssetUrl(item) {
    if (!item) return "";
    if (item.kind === "audioClip") {
        return "";
    }
    if (item.kind === "videoClip") {
        return item.posterAssetUrl || item.thumbnailAssetUrl || "";
    }
    return item.assetUrl || item.thumbnailAssetUrl || item.posterAssetUrl || "";
}

function resolvePlayableAssetUrl(item) {
    if (!item) return "";
    if (item.kind === "videoClip" || item.kind === "audioClip") {
        return item.assetUrl || "";
    }
    return "";
}

function getPlayableDurationFallbackSeconds() {
    return Number.NaN;
}

function clampMediaCurrentTimeSeconds(item, currentTimeSeconds) {
    return clampMediaCurrentTimeSecondsCore(
        item,
        currentTimeSeconds,
        getPlayableDurationFallbackSeconds(item),
    );
}

function resolveVideoSourceType(item) {
    const explicitType = String(item?.streamSourceType || item?.settings || "")
        .trim()
        .toLowerCase();
    if (explicitType === "hls") return "hls";
    if (explicitType === "mp4") return "mp4";
    const assetUrl = String(item?.assetUrl || "").trim();
    if (/\.m3u8(?:$|[?#])/i.test(assetUrl)) return "hls";
    return "mp4";
}

function isHlsMediaItem(item) {
    const sourceType = String(item?.sourceType || "").trim().toLowerCase();
    const sourceUrl = String(resolvePlayableAssetUrl(item) || "").trim().toLowerCase();
    return sourceType === "hls" || sourceUrl.includes(".m3u8");
}

function buildSelectableMediaItems(mediaItems, audioItems) {
    return [
        ...(Array.isArray(mediaItems) ? mediaItems : []),
        ...(Array.isArray(audioItems) ? audioItems : []),
    ]
        .filter((item) => !isBackgroundPlaybackMediaItem(item))
        .sort((a, b) => a.startTimeMs - b.startTimeMs);
}

function buildTimelineMarkerItems(mediaItems, audioItems) {
    return buildSelectableMediaItems(mediaItems, audioItems);
}

function buildTimingNote(item, deltaMs) {
    if (!item) return "";
    const parts = [];
    if (item.timeSource === "captureTime+offset" && Number.isFinite(item.effectiveTimeOffsetSeconds)) {
        parts.push(`Timeline time uses the capture timestamp with a ${formatSignedDuration(item.effectiveTimeOffsetSeconds)} camera correction.`);
    }
    if (item.timeOffsetNote) {
        parts.push(item.timeOffsetNote);
    }
    if (Number.isFinite(deltaMs) && Math.abs(deltaMs) >= 60000) {
        const relation = deltaMs > 0 ? "after" : "before";
        parts.push(`Current mission time is ${formatDuration(Math.abs(deltaMs), { compact: true, includeSeconds: false })} ${relation} this item.`);
    }
    return parts.join(" ");
}

function formatSyncRateLabel(rateContext = {}) {
    if (rateContext?.realtime === true) return "1x";
    const rate = Number(rateContext?.simSecondsPerRealSecond);
    if (!Number.isFinite(rate) || rate <= 0) return "--";
    return `${rate.toFixed(rate >= 10 ? 0 : 1).replace(/\.0$/, "")}x`;
}

function buildMediaExifLabel(item) {
    if (!item) return "";
    const parts = [
        item.cameraLabel,
        item.settings,
    ].map((part) => String(part || "").trim()).filter(Boolean);
    return [...new Set(parts)].join(" - ");
}

function findManifestMediaItemById(manifest, itemId) {
    const normalizedId = String(itemId || "").trim();
    if (!manifest || !normalizedId) return null;
    return [
        ...(manifest.mediaItems || []),
        ...(manifest.audioItems || []),
    ].find((item) => item?.id === normalizedId) || null;
}

function findMediaItemById(items, itemId) {
    const normalizedId = String(itemId || "").trim();
    if (!normalizedId) return null;
    return (Array.isArray(items) ? items : []).find((item) => item?.id === normalizedId) || null;
}

function buildNearbyMediaItems(items, activeIndex, nearbyRadius = 3) {
    const normalizedItems = Array.isArray(items) ? items : [];
    if (activeIndex < 0 || activeIndex >= normalizedItems.length) return [];
    const radius = Math.max(0, nearbyRadius);
    const startIndex = Math.max(0, activeIndex - radius);
    const endIndex = Math.min(normalizedItems.length, activeIndex + radius + 1);
    return normalizedItems.slice(startIndex, endIndex);
}
export {
    formatPlaybackRateLabel,
    buildStageBadge,
    resolvePreviewAssetUrl,
    resolvePlayableAssetUrl,
    getPlayableDurationFallbackSeconds,
    clampMediaCurrentTimeSeconds,
    resolveVideoSourceType,
    isHlsMediaItem,
    buildSelectableMediaItems,
    buildTimelineMarkerItems,
    buildTimingNote,
    formatSyncRateLabel,
    buildMediaExifLabel,
    findManifestMediaItemById,
    findMediaItemById,
    buildNearbyMediaItems,
};
