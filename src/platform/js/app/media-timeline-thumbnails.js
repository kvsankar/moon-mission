import { resolveNearestMediaIndex } from "../core/domain/media-selection-state.js";
import { resolveMediaThumbnailAssetUrl, resolveMediaThumbnailFallbackAssetUrl } from "../core/domain/media-thumbnail-assets.js";
import { formatDateTimeLocal, formatDateTimeUTC, padZero, parseConfigTimestamp } from "../utils/time-utils.js";
import { buildStageBadge } from "./media-timeline-items.js";
import { clampIndex } from "./media-timeline-focus.js";

const MAX_THUMBNAIL_RENDER_ITEMS = 64;
const THUMBNAIL_WINDOW_EDGE_MARGIN = 8;
function normalizeThumbnailSearchQuery(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function collectThumbnailMetadataValues(item) {
    const values = [
        item.mainBody,
        ...(Array.isArray(item.bodies) ? item.bodies : []),
        item.sceneType,
        ...(Array.isArray(item.metadataTags) && item.metadataTags.length ? item.metadataTags : (item.tags || [])),
        ...(Array.isArray(item.subjects) ? item.subjects : []),
        item.shortDescription,
        item.qualityNotes,
    ];
    const seen = new Set();
    return values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .filter((value) => {
            const key = value.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function formatThumbnailMetadataValue(value) {
    const text = String(value || "").trim();
    return text.length > 46 ? `${text.slice(0, 43).trimEnd()}...` : text;
}

function buildThumbnailMetadataLabel(item, searchQuery = "") {
    const metadataValues = collectThumbnailMetadataValues(item);
    if (metadataValues.length === 0) return "";
    const queryTerms = normalizeThumbnailSearchQuery(searchQuery).split(" ").filter(Boolean);
    const matchingValues = queryTerms.length > 0
        ? metadataValues.filter((value) => {
            const normalizedValue = value.toLowerCase();
            return queryTerms.some((term) => normalizedValue.includes(term));
        })
        : [];
    const selectedValues = (matchingValues.length > 0 ? matchingValues : metadataValues)
        .slice(0, 4)
        .map(formatThumbnailMetadataValue);
    return selectedValues.length ? `AI: ${selectedValues.join(" · ")}` : "";
}

function formatThumbnailMissionElapsedLabel(timeMs, missionStartTimeMs, { includeSeconds = false } = {}) {
    const targetMs = Number(timeMs);
    const startMs = Number(missionStartTimeMs);
    if (!Number.isFinite(targetMs) || !Number.isFinite(startMs)) return "";
    const elapsedMs = targetMs - startMs;
    const sign = elapsedMs < 0 ? "-" : "";
    const absoluteSeconds = Math.floor(Math.abs(elapsedMs) / 1000);
    const days = Math.floor(absoluteSeconds / 86400);
    const hours = Math.floor((absoluteSeconds % 86400) / 3600);
    const minutes = Math.floor((absoluteSeconds % 3600) / 60);
    const seconds = absoluteSeconds % 60;
    const base = `${String(days).padStart(3, "0")}:${padZero(hours)}:${padZero(minutes)}`;
    return `MET ${sign}${base}${includeSeconds ? `:${padZero(seconds)}` : ""}`;
}

function resolveMissionElapsedStartTimeMs(globalConfig, fallbackStartTimeMs = Number.NaN) {
    const events = globalConfig?.events || {};
    const eventTimeScale = String(events?.time_scale || "UTC").toUpperCase();
    const candidates = [
        events?.missionStart,
        events?.mission_start,
        globalConfig?.missionStart,
    ];
    for (const candidate of candidates) {
        const startTime = candidate?.startTime || candidate?.time || candidate;
        if (typeof startTime !== "string" || !startTime.trim()) continue;
        const parsed = parseConfigTimestamp(startTime, String(candidate?.time_scale || eventTimeScale).toUpperCase());
        if (Number.isFinite(parsed)) return parsed;
    }
    const fallback = Number(fallbackStartTimeMs);
    return Number.isFinite(fallback) ? fallback : Number.NaN;
}

function buildThumbnailViewItem(item, activeItem, searchQuery = "", missionStartTimeMs = Number.NaN) {
    const metLabel = formatThumbnailMissionElapsedLabel(item.startTimeMs, missionStartTimeMs);
    const metFullLabel = formatThumbnailMissionElapsedLabel(item.startTimeMs, missionStartTimeMs, {
        includeSeconds: true,
    });
    const localTimeLabel = Number.isFinite(Number(item.startTimeMs))
        ? formatDateTimeLocal(item.startTimeMs)
        : "";
    const utcTimeLabel = Number.isFinite(Number(item.startTimeMs))
        ? formatDateTimeUTC(item.startTimeMs)
        : "";
    const cameraLabel = item.cameraLabel || (item.kind === "audioClip" ? "Audio" : "");
    return {
        id: item.id,
        kind: item.kind,
        active: item.id === activeItem?.id,
        title: item.title,
        thumbnailAssetUrl: resolveMediaThumbnailAssetUrl(item),
        fallbackAssetUrl: resolveMediaThumbnailFallbackAssetUrl(item),
        meta: metLabel || formatDateTimeLocal(item.startTimeMs, { includeOffset: false }),
        metaFull: metFullLabel || localTimeLabel,
        thumbnailLabel: metLabel || metFullLabel || "MET --",
        localTimeLabel,
        utcTimeLabel,
        cameraLabel,
        photographer: item.photographer || "",
        location: item.location || "",
        sourceLabel: item.sourceLabel || item.fileName || "",
        stageBadge: buildStageBadge(item),
        metadataLabel: buildThumbnailMetadataLabel(item, searchQuery),
    };
}

function resolveThumbnailWindowStart(items, selection = {}, timeMs = Number.NaN, previousStartIndex = 0) {
    const normalizedItems = Array.isArray(items) ? items : [];
    if (normalizedItems.length <= MAX_THUMBNAIL_RENDER_ITEMS) {
        return 0;
    }

    const activeIndex = Number(selection.activeIndex);
    const targetIndex = Number.isInteger(activeIndex) && activeIndex >= 0
        ? activeIndex
        : resolveNearestMediaIndex(normalizedItems, Number(timeMs));
    const clampedTargetIndex = clampIndex(
        Number.isInteger(targetIndex) ? targetIndex : 0,
        normalizedItems.length - 1,
    );
    const maxStartIndex = normalizedItems.length - MAX_THUMBNAIL_RENDER_ITEMS;
    const currentStartIndex = clampIndex(Number(previousStartIndex) || 0, maxStartIndex);
    const safeStartIndex = currentStartIndex + THUMBNAIL_WINDOW_EDGE_MARGIN;
    const safeEndIndex = currentStartIndex + MAX_THUMBNAIL_RENDER_ITEMS - THUMBNAIL_WINDOW_EDGE_MARGIN - 1;
    if (clampedTargetIndex >= safeStartIndex && clampedTargetIndex <= safeEndIndex) {
        return currentStartIndex;
    }

    const halfWindow = Math.floor(MAX_THUMBNAIL_RENDER_ITEMS / 2);
    return clampIndex(clampedTargetIndex - halfWindow, maxStartIndex);
}

function buildThumbnailViewItems(items, selection = {}, startIndex = 0, searchQuery = "", missionStartTimeMs = Number.NaN) {
    const normalizedItems = Array.isArray(items) ? items : [];
    const clampedStartIndex = normalizedItems.length > MAX_THUMBNAIL_RENDER_ITEMS
        ? clampIndex(Number(startIndex) || 0, normalizedItems.length - MAX_THUMBNAIL_RENDER_ITEMS)
        : 0;
    const windowItems = normalizedItems.slice(
        clampedStartIndex,
        clampedStartIndex + MAX_THUMBNAIL_RENDER_ITEMS,
    );
    return windowItems.map((item) => buildThumbnailViewItem(
        item,
        selection.activeItem,
        searchQuery,
        missionStartTimeMs,
    ));
}
export {
    resolveMissionElapsedStartTimeMs,
    resolveThumbnailWindowStart,
    buildThumbnailViewItems,
};
