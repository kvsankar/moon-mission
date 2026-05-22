import { normalizeMissionMediaManifest } from "../core/domain/media-manifest.js";
import {
    buildMediaFilterModel,
    filterMediaItems,
    MEDIA_KIND_FILTER_IDS,
    MEDIA_SUBJECT_FILTER_IDS,
} from "../core/domain/media-filter-state.js";
import {
    resolveMediaSelectionState,
    resolveNearestMediaIndex,
} from "../core/domain/media-selection-state.js";
import { buildMediaTimelineMarkers } from "../core/domain/media-timeline-state.js";
import {
    resolveMediaThumbnailAssetUrl,
    resolveMediaThumbnailFallbackAssetUrl,
} from "../core/domain/media-thumbnail-assets.js";
import {
    buildForegroundMediaPlaybackState,
    clampMediaCurrentTimeSeconds as clampMediaCurrentTimeSecondsCore,
    isBackgroundPlaybackMediaItem,
    isForegroundPlayableMediaItem,
    isMediaItemActiveAtTime as isMediaItemActiveAtTimeCore,
    planMissionMediaSelectionSync as planMissionMediaSelectionSyncCore,
    resolveMediaItemEndTimeMs as resolveMediaItemEndTimeMsCore,
    resolvePlayableDurationSeconds,
} from "../core/domain/media-playback-policy.js";
import { createRuntimeMediaState } from "../core/state/runtime-media-state.js";
import { getMissionDataPath } from "../data/mission-data.js";
import { getMissionMediaDataPath, loadMissionMediaManifest } from "../data/mission-media.js";
import {
    formatDateTimeLocal,
    formatDateTimeUTC,
    formatDuration,
    padZero,
    parseConfigTimestamp,
} from "../utils/time-utils.js";
import {
    createMediaBrowserPanelActions,
    MEDIA_BROWSER_PANEL_ID,
} from "./media-browser-panel.js";
import {
    createBackgroundMediaPanelActions,
} from "./background-media-panel.js";
import { isMissionPanelEnabled } from "./panel-defaults.js";

const MAX_THUMBNAIL_RENDER_ITEMS = 64;
const THUMBNAIL_WINDOW_EDGE_MARGIN = 8;
const MEDIA_CLOCK_OVERRIDE_TOLERANCE_MS = 5000;
const MEDIA_EXPLICIT_FOCUS_TOLERANCE_MS = 1000;
const MEDIA_TRANSPORT_MAX_SIM_SECONDS_PER_REAL_SECOND = 4;
const MEDIA_TIME_SYNC_EPSILON_SECONDS = 0.2;
const MEDIA_TRANSPORT_RESYNC_TOLERANCE_SECONDS = 3;
const MEDIA_SCRUB_SYNC_INTERVAL_MS = 120;
const MEDIA_PLAYBACK_RATE_MAX = 4;
const MEDIA_FRAME_SCRUB_INTERVAL_MS = 180;
const MEDIA_SILENT_PAUSE_SUPPRESSION_MS = 500;
const MEDIA_MISSION_SEEK_SUPPRESSION_MS = 1500;
const MEDIA_PLAY_RETRY_COOLDOWN_MS = 750;
const VIDEO_ESTIMATED_SEGMENT_DURATION_SECONDS = 30;
const PLAYBACK_AUTHORITY_ANIMATION = "animation";
const PLAYBACK_AUTHORITY_MEDIA = "media";
const MISSION_MEDIA_MUTED_STORAGE_KEY = "moonMission.missionMediaMuted";

function readStoredBooleanPreference(key, fallbackValue = false) {
    try {
        const value = globalThis.localStorage?.getItem?.(key);
        if (value === "true") return true;
        if (value === "false") return false;
    } catch {
        // Storage may be unavailable in privacy modes or unit tests.
    }
    return fallbackValue;
}

function writeStoredBooleanPreference(key, value) {
    try {
        globalThis.localStorage?.setItem?.(key, value === true ? "true" : "false");
    } catch {
        // Preference persistence is best-effort.
    }
}

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

function buildExplicitMediaFocusState({
    items,
    activeItemId,
    timeMs,
    nearbyRadius = 3,
    focusSource = "user-selection",
} = {}) {
    const normalizedItems = Array.isArray(items) ? items : [];
    const activeItem = findMediaItemById(normalizedItems, activeItemId);
    const activeIndex = activeItem
        ? normalizedItems.findIndex((item) => item?.id === activeItem.id)
        : -1;

    if (!activeItem || activeIndex < 0) {
        const nearestSelection = resolveMediaSelectionState({
            items: normalizedItems,
            timeMs,
            nearbyRadius,
        });
        return {
            hasItems: normalizedItems.length > 0,
            activeIndex: -1,
            activeItem: null,
            previousItem: null,
            nextItem: null,
            nearbyItems: nearestSelection.nearbyItems,
            activeDeltaMs: Number.NaN,
            focusSource: "none",
            explicit: false,
        };
    }

    return {
        hasItems: normalizedItems.length > 0,
        activeIndex,
        activeItem,
        previousItem: activeIndex > 0 ? normalizedItems[activeIndex - 1] : null,
        nextItem: activeIndex < (normalizedItems.length - 1) ? normalizedItems[activeIndex + 1] : null,
        nearbyItems: buildNearbyMediaItems(normalizedItems, activeIndex, nearbyRadius),
        activeDeltaMs: Number.isFinite(timeMs) ? timeMs - activeItem.startTimeMs : Number.NaN,
        focusSource,
        explicit: focusSource !== "time-proximity",
    };
}

function buildTimeProximityMediaFocusState({
    items,
    timeMs,
    nearbyRadius = 3,
} = {}) {
    const focusState = resolveMediaSelectionState({
        items,
        timeMs,
        nearbyRadius,
    });
    return {
        ...focusState,
        focusSource: focusState.activeItem ? "time-proximity" : "none",
        explicit: false,
    };
}

function clampIndex(index, maxIndex) {
    return Math.max(0, Math.min(maxIndex, index));
}

function buildMediaNavigationModel(items, selection = {}) {
    const count = Array.isArray(items) ? items.length : 0;
    const activeIndex = Number(selection.activeIndex);
    if (count <= 0) {
        return {
            available: false,
            previousEnabled: false,
            nextEnabled: false,
            positionLabel: "No media focused",
        };
    }
    if (!Number.isInteger(activeIndex) || activeIndex < 0) {
        return {
            available: true,
            previousEnabled: false,
            nextEnabled: true,
            positionLabel: `${count} filtered - none focused`,
            previousTitle: "Focus a filtered media item first",
            nextTitle: "Focus nearest filtered media",
        };
    }
    return {
        available: true,
        previousEnabled: activeIndex > 0,
        nextEnabled: activeIndex < (count - 1),
        positionLabel: `${activeIndex + 1} of ${count}`,
        previousTitle: "Previous filtered media",
        nextTitle: "Next filtered media",
    };
}

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

function dispatchDocumentCustomEvent(type, detail) {
    if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") {
        return;
    }
    if (typeof CustomEvent === "function") {
        document.dispatchEvent(new CustomEvent(type, { detail }));
        return;
    }
    document.dispatchEvent({ type, detail });
}

function seekMainTimelineTime(timeMs, finalize = false, {
    startTimeMs = Number.NaN,
    endTimeMs = Number.NaN,
} = {}) {
    const slider = document.getElementById("timeline-slider");
    if (!(slider instanceof HTMLInputElement)) return false;
    const viewMin = Math.min(Number(slider.min), Number(slider.max));
    const viewMax = Math.max(Number(slider.min), Number(slider.max));
    if (!Number.isFinite(viewMin) || !Number.isFinite(viewMax) || !Number.isFinite(timeMs)) {
        return false;
    }
    const rangeStart = Number(startTimeMs);
    const rangeEnd = Number(endTimeMs);
    const hasFullRange = Number.isFinite(rangeStart) && Number.isFinite(rangeEnd);
    const min = hasFullRange ? Math.min(rangeStart, rangeEnd) : viewMin;
    const max = hasFullRange ? Math.max(rangeStart, rangeEnd) : viewMax;
    const clamped = Math.max(min, Math.min(max, timeMs));
    slider.value = String(Math.max(viewMin, Math.min(viewMax, clamped)));
    const dataset = slider.dataset || (slider.dataset = {});
    dataset.currentTimeMs = String(clamped);
    dataset.programmaticSeekTimeMs = String(clamped);
    dataset.programmaticSeekSource = "media-sync";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    if (finalize) {
        dataset.programmaticSeekTimeMs = String(clamped);
        dataset.programmaticSeekSource = "media-sync";
        slider.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return clamped === timeMs;
}

function readMainTimelineTimeMs() {
    const slider = document.getElementById("timeline-slider");
    const datasetTimeMs = Number(slider?.dataset?.currentTimeMs);
    if (Number.isFinite(datasetTimeMs)) {
        return datasetTimeMs;
    }
    const sliderValueMs = slider?.value === "" || slider?.value == null ? Number.NaN : Number(slider.value);
    if (Number.isFinite(sliderValueMs)) {
        return sliderValueMs;
    }
    return Number.NaN;
}

function resolvePlaybackOffsetSeconds(item, currentTimeMs, fromBeginning = false) {
    if (fromBeginning) {
        return 0;
    }
    const startTimeMs = Number(item?.startTimeMs);
    const missionTimeMs = Number(currentTimeMs);
    if (!Number.isFinite(startTimeMs) || !Number.isFinite(missionTimeMs) || missionTimeMs < startTimeMs) {
        return 0;
    }
    return clampMediaCurrentTimeSeconds(item, (missionTimeMs - startTimeMs) / 1000);
}

function createMediaTimelineCoordination({
    getStartTime = () => Number.NaN,
    getLatestEndTime = () => Number.NaN,
    getAnimationRunning = () => false,
    getAnimationSpeedMultiplier = () => 1,
    getAnimationRealtime = () => true,
    getIsCompareMode = () => false,
    playAnimation = () => {},
    pauseAnimation = () => {},
    setTimelineMediaMarkers = () => {},
} = {}) {
    const runtimeMediaState = createRuntimeMediaState();
    const panelActions = createMediaBrowserPanelActions({
        onIntent: handlePanelIntent,
    });
    const backgroundPanelActions = createBackgroundMediaPanelActions({
        getAnimationRunning,
        getAnimationSpeedMultiplier,
        getAnimationRealtime,
        getMissionStartTime: getStartTime,
        onJumpToTime(timeMs) {
            if (!Number.isFinite(Number(timeMs))) return;
            seekMissionTimelineTime(Number(timeMs), true);
            if (lastRenderContext) {
                lastRenderContext = {
                    ...lastRenderContext,
                    animTime: Number(timeMs),
                };
            }
            rerender();
        },
        onRequestPlay() {
            if (getAnimationRunning() !== true) {
                playAnimation();
            }
        },
        onRequestPause() {
            if (getAnimationRunning() === true) {
                pauseAnimation();
            }
        },
    });
    let manifestPromise = null;
    let lastRenderContext = null;
    let timelineEventBound = false;
    let onTimelineMarkerSelect = null;
    let onTimelineUserSeek = null;
    let onMediaPanelStateChanged = null;
    let animationPlayStateEventBound = false;
    let onAnimationPlayStateUpdated = null;
    let handlingAnimationPlayStateEvent = false;
    let handlingMediaDrivenAnimationStateChange = false;
    let playbackAuthority = PLAYBACK_AUTHORITY_ANIMATION;
    let currentAudio = null;
    let currentAudioClipId = "";
    let missionMediaMuted = readStoredBooleanPreference(MISSION_MEDIA_MUTED_STORAGE_KEY, false);
    let thumbnailWindowStartIndex = 0;
    let mediaPlaybackState = {
        itemId: "",
        kind: "",
        active: false,
        playing: false,
        buffering: false,
        startTimeMs: Number.NaN,
        syncedTimeMs: Number.NaN,
        currentTimeSeconds: 0,
        pauseAnimationOnEnd: false,
    };
    let suppressMediaEvents = false;
    const silentPauseUntilByElement = typeof WeakMap === "function" ? new WeakMap() : null;
    let mediaPlayRequestPending = false;
    let lastMediaPlayAttempt = {
        itemId: "",
        kind: "",
        atMs: 0,
    };
    const lastAppliedMediaRateByElement = typeof WeakMap === "function" ? new WeakMap() : null;
    let scrubSyncState = {
        itemId: "",
        lastAppliedAtMs: 0,
    };
    let missionDrivenMediaSeekState = {
        active: false,
        itemId: "",
        source: "",
        targetTimeMs: Number.NaN,
        targetSeconds: Number.NaN,
        wasPlaying: false,
        expiresAtMs: 0,
    };
    let durationProbeState = {
        itemId: "",
        element: null,
        cleanup: null,
    };
    let lastFrameScrubRealtimeMs = 0;
    let lastFrameScrubMode = null;
    let lastPanelMissionContextSignature = "";
    let lastBackgroundMissionContextSignature = "";
    let filteredCollectionsCache = null;
    let timelineMarkersCache = null;
    let lastAppliedTimelineMediaMarkers = null;
    let mediaDataRevision = 0;
    let lastPanelRenderSignature = "";
    const objectSignatureIds = new WeakMap();
    let nextObjectSignatureId = 1;
    let timelineUserSeekState = {
        active: false,
        animationWasRunning: false,
        stoppedForOutOfRange: false,
    };
    let mediaPanelOpen = false;

    function seekMissionTimelineTime(timeMs, finalize = false) {
        return seekMainTimelineTime(timeMs, finalize, {
            startTimeMs: getStartTime(),
            endTimeMs: getLatestEndTime(),
        });
    }

    function resetMediaPlaybackState() {
        setMediaBufferingStatusVisible(false);
        mediaPlaybackState = {
            itemId: "",
            kind: "",
            active: false,
            playing: false,
            buffering: false,
            startTimeMs: Number.NaN,
            syncedTimeMs: Number.NaN,
            currentTimeSeconds: 0,
            pauseAnimationOnEnd: false,
        };
        scrubSyncState = {
            itemId: "",
            lastAppliedAtMs: 0,
        };
        mediaPlayRequestPending = false;
        lastMediaPlayAttempt = {
            itemId: "",
            kind: "",
            atMs: 0,
        };
    }

    function getVideoElement() {
        return globalThis.document?.getElementById?.("media-browser-video") || null;
    }

    function applyMissionMediaMuted() {
        const video = getVideoElement();
        if (video) video.muted = missionMediaMuted === true;
        if (currentAudio) currentAudio.muted = missionMediaMuted === true;
    }

    function setMissionMediaMuted(nextMuted) {
        missionMediaMuted = nextMuted === true;
        writeStoredBooleanPreference(MISSION_MEDIA_MUTED_STORAGE_KEY, missionMediaMuted);
        applyMissionMediaMuted();
        rerender();
    }

    function isMediaPlaybackBusy() {
        return mediaPlaybackState.playing === true || mediaPlaybackState.buffering === true;
    }

    function isAnimationClockDrivingMedia() {
        return playbackAuthority === PLAYBACK_AUTHORITY_ANIMATION && getAnimationRunning() === true;
    }

    function buildForegroundMediaState() {
        return buildForegroundMediaPlaybackState({
            playbackState: mediaPlaybackState,
            animationRunning: getAnimationRunning() === true,
            frameScrubMode: isFrameScrubMode() === true,
            item: findCurrentManifestItemById(mediaPlaybackState.itemId),
        });
    }

    function setMediaBufferingStatusVisible(visible) {
        const status = globalThis.document?.getElementById?.("media-buffering-status");
        if (!status) return;
        status.hidden = visible !== true;
        status.dataset.status = visible === true ? "buffering" : "";
        status.classList?.toggle?.("media-buffering-status--hidden", visible !== true);
        const text = globalThis.document?.getElementById?.("media-buffering-status-text");
        if (text && visible === true) {
            text.textContent = "Media buffering; holding sync until playback recovers.";
        }
    }

    function findCurrentManifestItemById(itemId) {
        return findManifestMediaItemById(runtimeMediaState.getManifest(), itemId);
    }

    function stableJson(value) {
        try {
            return JSON.stringify(value ?? null);
        } catch {
            return String(value ?? "");
        }
    }

    function getObjectSignatureId(value) {
        if (!value || typeof value !== "object") return "";
        let id = objectSignatureIds.get(value);
        if (!id) {
            id = nextObjectSignatureId;
            nextObjectSignatureId += 1;
            objectSignatureIds.set(value, id);
        }
        return id;
    }

    function buildPanelMissionContextSignature({
        configData,
        available,
        title,
        nextMissionLabel,
        mediaCount,
    } = {}) {
        return stableJson({
            configId: getObjectSignatureId(configData),
            mission: configData?.mission_name_short || configData?.mission_name || "",
            available: available === true,
            title,
            nextMissionLabel,
            mediaCount,
        });
    }

    function invalidateMediaDataCaches() {
        mediaDataRevision += 1;
        filteredCollectionsCache = null;
        timelineMarkersCache = null;
    }

    function applyPanelMissionContext(context = {}) {
        const signature = buildPanelMissionContextSignature(context);
        if (signature === lastPanelMissionContextSignature) return;
        lastPanelMissionContextSignature = signature;
        panelActions.setMissionContext(context);
    }

    function applyBackgroundMissionContext(context = {}) {
        const signature = stableJson({
            configId: getObjectSignatureId(context.configData),
            mission: context.configData?.mission_name_short || context.configData?.mission_name || "",
            available: context.available === true,
        });
        if (signature === lastBackgroundMissionContextSignature) return;
        lastBackgroundMissionContextSignature = signature;
        backgroundPanelActions.setMissionContext(context);
    }

    function getFilteredMediaCollections(manifest, filters) {
        const mediaItems = Array.isArray(manifest?.mediaItems) ? manifest.mediaItems : [];
        const audioItems = Array.isArray(manifest?.audioItems) ? manifest.audioItems : [];
        const filterSignature = stableJson(filters);
        if (
            filteredCollectionsCache
            && filteredCollectionsCache.mediaItems === mediaItems
            && filteredCollectionsCache.audioItems === audioItems
            && filteredCollectionsCache.filterSignature === filterSignature
            && filteredCollectionsCache.mediaDataRevision === mediaDataRevision
        ) {
            return filteredCollectionsCache;
        }

        const filteredItems = filterMediaItems(mediaItems, filters);
        const filteredAudioItems = filterMediaItems(audioItems, filters);
        const filteredSelectableItems = buildSelectableMediaItems(filteredItems, filteredAudioItems);
        const selectableItems = buildTimelineMarkerItems(filteredItems, filteredAudioItems);
        const filterModel = buildMediaFilterModel(
            buildSelectableMediaItems(mediaItems, audioItems),
            filters,
        );
        filteredCollectionsCache = {
            mediaItems,
            audioItems,
            filterSignature,
            mediaDataRevision,
            filteredItems,
            filteredAudioItems,
            filteredSelectableItems,
            selectableItems,
            filterModel,
        };
        return filteredCollectionsCache;
    }

    function getTimelineMediaMarkers({
        items,
        selectedId,
        rangeStartMs,
        rangeEndMs,
        timeMs,
    }) {
        if (
            timelineMarkersCache
            && timelineMarkersCache.items === items
            && timelineMarkersCache.selectedId === selectedId
            && timelineMarkersCache.rangeStartMs === rangeStartMs
            && timelineMarkersCache.rangeEndMs === rangeEndMs
            && timelineMarkersCache.mediaDataRevision === mediaDataRevision
        ) {
            return timelineMarkersCache.markers;
        }
        const markers = buildMediaTimelineMarkers({
            items,
            timeMs,
            rangeStartMs,
            rangeEndMs,
        });
        timelineMarkersCache = {
            items,
            selectedId,
            rangeStartMs,
            rangeEndMs,
            mediaDataRevision,
            markers,
        };
        return markers;
    }

    function applyTimelineMediaMarkers(markers) {
        if (markers === lastAppliedTimelineMediaMarkers) return;
        lastAppliedTimelineMediaMarkers = markers;
        setTimelineMediaMarkers(markers);
    }

    function applyMeasuredPlayableDurationSeconds(itemId, durationSeconds) {
        const normalizedId = String(itemId || "").trim();
        const safeDurationSeconds = Number(durationSeconds);
        if (!normalizedId || !Number.isFinite(safeDurationSeconds) || safeDurationSeconds <= 0) {
            return false;
        }
        const item = findCurrentManifestItemById(normalizedId);
        if (!item || !isForegroundPlayableMediaItem(item)) return false;
        const existingDurationSeconds = Number(item.durationSeconds);
        if (Number.isFinite(existingDurationSeconds) && Math.abs(existingDurationSeconds - safeDurationSeconds) < 0.01) {
            return false;
        }
        item.durationSeconds = safeDurationSeconds;
        if (Number.isFinite(Number(item.startTimeMs))) {
            item.endTimeMs = Number(item.startTimeMs) + safeDurationSeconds * 1000;
        }
        invalidateMediaDataCaches();
        rerender();
        return true;
    }

    function releaseDurationProbe() {
        durationProbeState.cleanup?.();
        durationProbeState = {
            itemId: "",
            element: null,
            cleanup: null,
        };
    }

    function ensurePlayableDurationProbe(item) {
        if (!item || !isForegroundPlayableMediaItem(item) || Number.isFinite(resolvePlayableDurationSeconds(item))) {
            releaseDurationProbe();
            return;
        }
        if (durationProbeState.itemId === item.id) return;
        releaseDurationProbe();

        let mediaElement = null;
        if (item.kind === "audioClip" && typeof globalThis.Audio === "function") {
            mediaElement = new globalThis.Audio(item.assetUrl);
        } else {
            mediaElement = globalThis.document?.createElement?.(item.kind === "videoClip" ? "video" : "audio") || null;
            if (mediaElement) {
                mediaElement.src = item.assetUrl;
            }
        }
        if (!mediaElement || typeof mediaElement.addEventListener !== "function") return;

        try {
            mediaElement.preload = "metadata";
            mediaElement.muted = true;
        } catch {
            // Metadata probes should stay silent and non-invasive when the browser allows it.
        }

        const readDuration = () => {
            const changed = applyMeasuredPlayableDurationSeconds(item.id, Number(mediaElement.duration));
            if (changed) {
                releaseDurationProbe();
            }
        };
        const onFailure = () => {
            if (durationProbeState.itemId === item.id) {
                releaseDurationProbe();
            }
        };
        for (const eventName of ["loadedmetadata", "durationchange"]) {
            mediaElement.addEventListener(eventName, readDuration);
        }
        for (const eventName of ["abort", "error"]) {
            mediaElement.addEventListener(eventName, onFailure);
        }
        durationProbeState = {
            itemId: item.id,
            element: mediaElement,
            cleanup: () => {
                for (const eventName of ["loadedmetadata", "durationchange"]) {
                    mediaElement.removeEventListener?.(eventName, readDuration);
                }
                for (const eventName of ["abort", "error"]) {
                    mediaElement.removeEventListener?.(eventName, onFailure);
                }
                mediaElement.removeAttribute?.("src");
                callMediaMethod(mediaElement, "load");
            },
        };
        callMediaMethod(mediaElement, "load");
        readDuration();
    }

    function readCurrentMissionTimeMs() {
        const timelineTimeMs = readMainTimelineTimeMs();
        if (Number.isFinite(timelineTimeMs)) {
            return timelineTimeMs;
        }
        const renderTimeMs = Number(lastRenderContext?.animTime);
        return Number.isFinite(renderTimeMs) ? renderTimeMs : Number.NaN;
    }

    function getRequestedAnimationRate() {
        if (getAnimationRealtime() === true) return 1;
        const multiplier = Number(getAnimationSpeedMultiplier());
        if (!Number.isFinite(multiplier) || multiplier <= 0) return 1;
        return multiplier;
    }

    function isFrameScrubMode() {
        return getRequestedAnimationRate() > MEDIA_PLAYBACK_RATE_MAX;
    }

    function setPlaybackAuthority(authority) {
        playbackAuthority = authority === PLAYBACK_AUTHORITY_MEDIA
            ? PLAYBACK_AUTHORITY_MEDIA
            : PLAYBACK_AUTHORITY_ANIMATION;
    }

    function runMediaDrivenAnimationStateChange(callback) {
        handlingMediaDrivenAnimationStateChange = true;
        try {
            callback?.();
        } finally {
            handlingMediaDrivenAnimationStateChange = false;
        }
    }

    function playAnimationFromMedia() {
        runMediaDrivenAnimationStateChange(() => {
            playAnimation();
        });
    }

    function pauseAnimationFromMedia() {
        runMediaDrivenAnimationStateChange(() => {
            pauseAnimation();
        });
    }

    function clearMissionDrivenMediaSeekState() {
        missionDrivenMediaSeekState = {
            active: false,
            itemId: "",
            source: "",
            targetTimeMs: Number.NaN,
            targetSeconds: Number.NaN,
            wasPlaying: false,
            expiresAtMs: 0,
        };
    }

    function isMissionDrivenSeekSource(source) {
        const normalizedSource = String(source || "").trim();
        return normalizedSource !== "" && normalizedSource !== "media-sync";
    }

    function getActiveMissionDrivenMediaSeek(itemId = "") {
        if (missionDrivenMediaSeekState.active !== true) return null;
        if (Date.now() > Number(missionDrivenMediaSeekState.expiresAtMs)) {
            clearMissionDrivenMediaSeekState();
            return null;
        }
        const normalizedId = String(itemId || "").trim();
        if (normalizedId && normalizedId !== missionDrivenMediaSeekState.itemId) return null;
        return missionDrivenMediaSeekState;
    }

    function startMissionDrivenMediaSeek(item, timeMs, {
        source = "",
        wasPlaying = false,
    } = {}) {
        if (!item || !isMissionDrivenSeekSource(source) || !Number.isFinite(timeMs)) {
            clearMissionDrivenMediaSeekState();
            return null;
        }
        const targetSeconds = resolvePlaybackOffsetSeconds(item, timeMs, false);
        if (!Number.isFinite(targetSeconds)) {
            clearMissionDrivenMediaSeekState();
            return null;
        }
        missionDrivenMediaSeekState = {
            active: true,
            itemId: item.id,
            source,
            targetTimeMs: timeMs,
            targetSeconds,
            wasPlaying: wasPlaying === true,
            expiresAtMs: Date.now() + MEDIA_MISSION_SEEK_SUPPRESSION_MS,
        };
        return missionDrivenMediaSeekState;
    }

    function isMissionDrivenMediaSeekClockStale(itemId, currentTimeSeconds) {
        const seekState = getActiveMissionDrivenMediaSeek(itemId);
        if (!seekState) return false;
        const mediaSeconds = Number(currentTimeSeconds);
        return !Number.isFinite(mediaSeconds) ||
            Math.abs(mediaSeconds - seekState.targetSeconds) > MEDIA_TIME_SYNC_EPSILON_SECONDS;
    }

    function getMediaPlaybackRate() {
        if (playbackAuthority === PLAYBACK_AUTHORITY_MEDIA) {
            return 1;
        }
        return Math.max(0.1, Math.min(MEDIA_PLAYBACK_RATE_MAX, getRequestedAnimationRate()));
    }

    function callMediaMethod(mediaElement, methodName) {
        try {
            return mediaElement?.[methodName]?.();
        } catch {
            return null;
        }
    }

    function setMediaPlaybackRate(mediaElement, rate = 1) {
        if (!mediaElement) return;
        const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
        const previousRate = Number(lastAppliedMediaRateByElement?.get?.(mediaElement));
        if (Number.isFinite(previousRate) && Math.abs(previousRate - safeRate) < 0.001) {
            return;
        }
        try {
            mediaElement.playbackRate = safeRate;
            lastAppliedMediaRateByElement?.set?.(mediaElement, safeRate);
        } catch {
            // Some engines can reject unsupported playback rates.
        }
    }

    function stopAudioPlayback() {
        if (currentAudio && typeof currentAudio.pause === "function") {
            suppressMediaEvents = true;
            currentAudio.loop = false;
            callMediaMethod(currentAudio, "pause");
            suppressMediaEvents = false;
        }
        currentAudio = null;
        currentAudioClipId = "";
    }

    function stopVideoPlayback() {
        const video = getVideoElement();
        if (!video || typeof video.pause !== "function") return;
        suppressMediaEvents = true;
        video.loop = false;
        video.removeAttribute?.("loop");
        callMediaMethod(video, "pause");
        suppressMediaEvents = false;
    }

    function stopPlayableMedia({ pauseClock = false } = {}) {
        clearMissionDrivenMediaSeekState();
        stopAudioPlayback();
        stopVideoPlayback();
        resetMediaPlaybackState();
        lastFrameScrubRealtimeMs = 0;
        if (pauseClock) {
            pauseAnimationFromMedia();
        }
    }

    function pausePlayableMediaForAnimationPause() {
        if (mediaPlaybackState.playing !== true) return false;
        suppressMediaEvents = true;
        if (mediaPlaybackState.kind === "audioClip") {
            callMediaMethod(currentAudio, "pause");
        } else if (mediaPlaybackState.kind === "videoClip") {
            callMediaMethod(getVideoElement(), "pause");
        }
        suppressMediaEvents = false;
        mediaPlaybackState = {
            ...mediaPlaybackState,
            active: true,
            playing: false,
            buffering: false,
        };
        rerender();
        return true;
    }

    function pauseActivePlayableMedia() {
        if (mediaPlaybackState.playing !== true && mediaPlaybackState.buffering !== true) return false;
        suppressMediaEvents = true;
        if (mediaPlaybackState.kind === "audioClip") {
            callMediaMethod(currentAudio, "pause");
        } else if (mediaPlaybackState.kind === "videoClip") {
            callMediaMethod(getVideoElement(), "pause");
        }
        suppressMediaEvents = false;
        mediaPlaybackState = {
            ...mediaPlaybackState,
            active: true,
            playing: false,
            buffering: false,
        };
        pauseAnimationFromMedia();
        rerender();
        return true;
    }

    function syncMissionTimeToMediaOffset(item, currentTimeSeconds = 0, finalize = false) {
        if (!item || !Number.isFinite(item.startTimeMs)) return Number.NaN;
        const offsetSeconds = clampMediaCurrentTimeSeconds(item, currentTimeSeconds);
        const timelineTimeMs = item.startTimeMs + offsetSeconds * 1000;
        seekMissionTimelineTime(timelineTimeMs, finalize);
        return timelineTimeMs;
    }

    function seekActivePlayableMediaToMissionTime(timeMs) {
        if (!Number.isFinite(timeMs) || !mediaPlaybackState.itemId) return false;
        const mediaItem = findCurrentManifestItemById(mediaPlaybackState.itemId) || mediaPlaybackState;
        if (!mediaItem || !isForegroundPlayableMediaItem(mediaItem) || !Number.isFinite(mediaItem.startTimeMs)) {
            return false;
        }
        const offsetSeconds = clampMediaCurrentTimeSeconds(
            mediaItem,
            (timeMs - mediaItem.startTimeMs) / 1000,
        );
        if (!Number.isFinite(offsetSeconds)) return false;
        if (mediaPlaybackState.kind === "audioClip") {
            if (!currentAudio) return false;
            setMediaElementCurrentTime(currentAudio, offsetSeconds);
        } else if (mediaPlaybackState.kind === "videoClip") {
            const video = getVideoElement();
            if (!video) return false;
            setMediaElementCurrentTime(video, offsetSeconds);
        } else {
            return false;
        }
        mediaPlaybackState = {
            ...mediaPlaybackState,
            syncedTimeMs: mediaItem.startTimeMs + (offsetSeconds * 1000),
            currentTimeSeconds: offsetSeconds,
        };
        return true;
    }

    function seekPlayableMediaToSeconds(item, seconds, finalize = false) {
        if (!item || !isForegroundPlayableMediaItem(item) || !Number.isFinite(item.startTimeMs)) return false;
        const clampedSeconds = clampMediaCurrentTimeSeconds(item, seconds);
        if (item.kind === "audioClip") {
            setMediaElementCurrentTime(currentAudio, clampedSeconds);
        } else if (item.kind === "videoClip") {
            setMediaElementCurrentTime(getVideoElement(), clampedSeconds);
        } else {
            return false;
        }
        const timelineTimeMs = syncMissionTimeToMediaOffset(item, clampedSeconds, finalize === true);
        const anchoredTimeMs = Number.isFinite(timelineTimeMs)
            ? timelineTimeMs
            : (item.startTimeMs + clampedSeconds * 1000);
        runtimeMediaState.setActiveItemId(item.id, {
            anchorTimeMs: anchoredTimeMs,
        });
        if (lastRenderContext && Number.isFinite(anchoredTimeMs)) {
            lastRenderContext = {
                ...lastRenderContext,
                animTime: anchoredTimeMs,
            };
        }
        mediaPlaybackState = {
            ...mediaPlaybackState,
            itemId: item.id,
            kind: item.kind,
            active: true,
            syncedTimeMs: anchoredTimeMs,
            currentTimeSeconds: clampedSeconds,
        };
        rerender();
        return true;
    }

    function syncFrameScrubPreview(activeItem, timeMs) {
        if (!activeItem || activeItem.kind !== "videoClip" || !isForegroundPlayableMediaItem(activeItem)) return;
        if (
            playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            && (mediaPlaybackState.playing === true || mediaPlaybackState.buffering === true)
        ) {
            return;
        }
        if (isFrameScrubMode() !== true || getAnimationRunning() !== true) return;
        const itemEndTimeMs = resolveMediaItemEndTimeMs(activeItem);
        if (Number.isFinite(itemEndTimeMs) && Number(timeMs) >= itemEndTimeMs) {
            if (mediaPlaybackState.itemId === activeItem.id) {
                mediaPlaybackState = {
                    ...mediaPlaybackState,
                    active: false,
                    playing: false,
                    buffering: false,
                    syncedTimeMs: itemEndTimeMs,
                    currentTimeSeconds: resolvePlaybackOffsetSeconds(activeItem, itemEndTimeMs, false),
                };
            }
            return;
        }
        const offsetSeconds = resolvePlaybackOffsetSeconds(activeItem, timeMs, false);
        const video = getVideoElement();
        const currentPreviewSeconds = Number(mediaPlaybackState.currentTimeSeconds);
        const shouldSeekPreview = !Number.isFinite(currentPreviewSeconds)
            || Math.abs(currentPreviewSeconds - offsetSeconds) >= MEDIA_TIME_SYNC_EPSILON_SECONDS;
        const nowMs = Date.now();
        if (!shouldSeekPreview && (nowMs - lastFrameScrubRealtimeMs) < MEDIA_FRAME_SCRUB_INTERVAL_MS) return;
        lastFrameScrubRealtimeMs = nowMs;
        if (video) {
            pauseMediaElementSilently(video);
            setMediaElementCurrentTime(video, offsetSeconds);
        }
        if (mediaPlaybackState.itemId === activeItem.id) {
            mediaPlaybackState = {
                ...mediaPlaybackState,
                active: true,
                playing: false,
                buffering: false,
                currentTimeSeconds: offsetSeconds,
                syncedTimeMs: activeItem.startTimeMs + offsetSeconds * 1000,
            };
        }
    }

    function syncActivePlayingMediaRate() {
        if (mediaPlaybackState.playing !== true) return;
        if (isFrameScrubMode() === true) return;
        const rate = getMediaPlaybackRate();
        if (mediaPlaybackState.kind === "audioClip") {
            setMediaPlaybackRate(currentAudio, rate);
            return;
        }
        if (mediaPlaybackState.kind === "videoClip") {
            setMediaPlaybackRate(getVideoElement(), rate);
        }
    }

    function syncPlaybackModeTransition(activeItem, timeMs) {
        if (!activeItem || !isForegroundPlayableMediaItem(activeItem)) return;
        if (
            playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            && (mediaPlaybackState.playing === true || mediaPlaybackState.buffering === true)
        ) {
            lastFrameScrubMode = isFrameScrubMode() === true;
            return;
        }
        const nextFrameScrubMode = isFrameScrubMode() === true;
        if (lastFrameScrubMode == null) {
            lastFrameScrubMode = nextFrameScrubMode;
            return;
        }
        if (lastFrameScrubMode === nextFrameScrubMode) {
            return;
        }
        lastFrameScrubMode = nextFrameScrubMode;

        const offsetSeconds = resolvePlaybackOffsetSeconds(activeItem, timeMs, false);
        const syncedTimeMs = activeItem.startTimeMs + offsetSeconds * 1000;

        if (nextFrameScrubMode) {
            suppressMediaEvents = true;
            callMediaMethod(currentAudio, "pause");
            callMediaMethod(getVideoElement(), "pause");
            suppressMediaEvents = false;
            seekPlayableMediaToSeconds(activeItem, offsetSeconds, false);
            mediaPlaybackState = {
                ...mediaPlaybackState,
                itemId: activeItem.id,
                kind: activeItem.kind,
                active: true,
                playing: false,
                buffering: false,
                startTimeMs: activeItem.startTimeMs,
                syncedTimeMs,
                currentTimeSeconds: offsetSeconds,
            };
            return;
        }

        if (getAnimationRunning() !== true) return;

        if (activeItem.kind === "audioClip") {
            if (typeof globalThis.Audio !== "function") return;
            if (!currentAudio || currentAudioClipId !== activeItem.id) {
                currentAudio = new globalThis.Audio(activeItem.assetUrl);
                currentAudio.volume = 0.7;
                currentAudio.muted = missionMediaMuted === true;
                currentAudioClipId = activeItem.id;
                attachAudioPlaybackEvents(currentAudio, activeItem);
            }
            setMediaPlaybackRate(currentAudio, getMediaPlaybackRate());
            setMediaElementCurrentTime(currentAudio, offsetSeconds);
            primePlayableMediaState(activeItem, {
                playing: false,
                syncedTimeMs,
                currentTimeSeconds: offsetSeconds,
            });
            playMediaElement(currentAudio, activeItem.id, "audioClip", { force: true });
            rerender();
            return;
        }

        if (activeItem.kind === "videoClip") {
            const video = getVideoElement();
            if (!video) return;
            if (!isHlsMediaItem(activeItem) && video.getAttribute?.("src") !== activeItem.assetUrl) {
                video.src = activeItem.assetUrl;
                if (activeItem.posterAssetUrl) {
                    video.poster = activeItem.posterAssetUrl;
                }
                callMediaMethod(video, "load");
            }
            video.muted = missionMediaMuted === true;
            if (video.dataset) {
                video.dataset.mediaItemId = activeItem.id;
                video.dataset.mediaSourceUrl = activeItem.assetUrl;
                video.dataset.sourceType = activeItem.sourceType || "";
            }
            setMediaPlaybackRate(video, getMediaPlaybackRate());
            setMediaElementCurrentTime(video, offsetSeconds);
            primePlayableMediaState(activeItem, {
                playing: false,
                syncedTimeMs,
                currentTimeSeconds: offsetSeconds,
            });
            playMediaElement(video, activeItem.id, "videoClip", { force: true });
            rerender();
        }
    }

    function primePlayableMediaState(item, {
        playing = false,
        syncedTimeMs = Number.NaN,
        currentTimeSeconds = 0,
        pauseAnimationOnEnd = false,
    } = {}) {
        if (!item || !isForegroundPlayableMediaItem(item)) return false;
        runtimeMediaState.setActiveItemId(item.id, {
            anchorTimeMs: item.startTimeMs,
        });
        mediaPlaybackState = {
            itemId: item.id,
            kind: item.kind,
            active: true,
            playing: playing === true,
            buffering: playing !== true,
            startTimeMs: item.startTimeMs,
            syncedTimeMs: Number.isFinite(syncedTimeMs) ? syncedTimeMs : item.startTimeMs,
            currentTimeSeconds: Number.isFinite(currentTimeSeconds) ? Math.max(0, currentTimeSeconds) : 0,
            pauseAnimationOnEnd: pauseAnimationOnEnd === true,
        };
        return true;
    }

    function handlePlayableMediaStarted(itemId, kind, currentTimeSeconds = 0) {
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId) return;
        mediaPlayRequestPending = false;
        const item = findCurrentManifestItemById(normalizedId);
        if (!item || !isForegroundPlayableMediaItem(item)) return;
        const missionSeekState = getActiveMissionDrivenMediaSeek(normalizedId);
        if (missionSeekState && isMissionDrivenMediaSeekClockStale(normalizedId, currentTimeSeconds)) {
            runtimeMediaState.setActiveItemId(item.id, {
                anchorTimeMs: missionSeekState.targetTimeMs,
            });
            mediaPlaybackState = {
                ...mediaPlaybackState,
                itemId: item.id,
                kind: kind || item.kind,
                active: true,
                playing: missionSeekState.wasPlaying === true,
                buffering: false,
                startTimeMs: item.startTimeMs,
                syncedTimeMs: missionSeekState.targetTimeMs,
                currentTimeSeconds: missionSeekState.targetSeconds,
            };
            setMediaBufferingStatusVisible(false);
            if (mediaPlaybackState.kind === "audioClip") {
                setMediaPlaybackRate(currentAudio, getMediaPlaybackRate());
            } else if (mediaPlaybackState.kind === "videoClip") {
                setMediaPlaybackRate(getVideoElement(), getMediaPlaybackRate());
            }
            if (missionSeekState.wasPlaying === true && getAnimationRunning() !== true) {
                playAnimationFromMedia();
            }
            rerender();
            return;
        }
        clearMissionDrivenMediaSeekState();
        const wasBuffering = mediaPlaybackState.buffering === true;
        const wasPlaying = mediaPlaybackState.playing === true;
        const animationClockDrivingMedia = isAnimationClockDrivingMedia();
        const timelineTimeMs = animationClockDrivingMedia
            ? readCurrentMissionTimeMs()
            : syncMissionTimeToMediaOffset(item, Number(currentTimeSeconds) || 0, false);
        const syncedSeconds = animationClockDrivingMedia
            ? resolvePlaybackOffsetSeconds(item, timelineTimeMs, false)
            : Math.max(0, Number(currentTimeSeconds) || 0);
        runtimeMediaState.setActiveItemId(item.id, {
            anchorTimeMs: item.startTimeMs,
        });
        mediaPlaybackState = {
            ...mediaPlaybackState,
            itemId: item.id,
            kind: kind || item.kind,
            active: true,
            playing: true,
            buffering: false,
            startTimeMs: item.startTimeMs,
            syncedTimeMs: Number.isFinite(timelineTimeMs) ? timelineTimeMs : item.startTimeMs,
            currentTimeSeconds: syncedSeconds,
        };
        setMediaBufferingStatusVisible(false);
        if (mediaPlaybackState.kind === "audioClip") {
            setMediaPlaybackRate(currentAudio, getMediaPlaybackRate());
        } else if (mediaPlaybackState.kind === "videoClip") {
            setMediaPlaybackRate(getVideoElement(), getMediaPlaybackRate());
        }
        if (getAnimationRunning() !== true) {
            if (!wasBuffering || !wasPlaying) {
                playAnimationFromMedia();
            }
        }
        rerender();
    }

    function isMediaElementLikelyBuffering(mediaElement) {
        if (!mediaElement || mediaElement.ended === true) return false;
        const readyState = Number(mediaElement.readyState);
        const networkState = Number(mediaElement.networkState);
        return (
            (Number.isFinite(readyState) && readyState < 3)
            || (Number.isFinite(networkState) && networkState === 2)
            || mediaElement.seeking === true
        );
    }

    function markSilentMediaPause(mediaElement) {
        if (!mediaElement || !silentPauseUntilByElement) return;
        silentPauseUntilByElement.set(mediaElement, Date.now() + MEDIA_SILENT_PAUSE_SUPPRESSION_MS);
    }

    function isSilentMediaPausePending(mediaElement) {
        if (!mediaElement || !silentPauseUntilByElement) return false;
        const silentUntilMs = Number(silentPauseUntilByElement.get(mediaElement));
        if (!Number.isFinite(silentUntilMs)) return false;
        if (Date.now() <= silentUntilMs) return true;
        silentPauseUntilByElement.delete(mediaElement);
        return false;
    }

    function handlePlayableMediaPaused(itemId, mediaElement = null, currentTimeSeconds = 0) {
        if (suppressMediaEvents) return;
        if (isSilentMediaPausePending(mediaElement)) return;
        if (mediaPlayRequestPending === true) return;
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId || normalizedId !== mediaPlaybackState.itemId) return;
        const missionSeekState = getActiveMissionDrivenMediaSeek(normalizedId);
        if (missionSeekState && missionSeekState.wasPlaying === true) {
            mediaPlaybackState = {
                ...mediaPlaybackState,
                active: true,
                playing: true,
                buffering: true,
                syncedTimeMs: missionSeekState.targetTimeMs,
                currentTimeSeconds: missionSeekState.targetSeconds,
            };
            setMediaBufferingStatusVisible(true);
            if (
                shouldUseTransportPlayback() &&
                getAnimationRunning() === true &&
                mediaPlayRequestPending !== true
            ) {
                playMediaElement(mediaElement, normalizedId, mediaPlaybackState.kind, { force: true });
            }
            rerender();
            return;
        }
        if (
            mediaPlaybackState.active !== true
            && mediaPlaybackState.playing !== true
            && mediaPlaybackState.buffering !== true
        ) {
            return;
        }
        if (mediaPlaybackState.buffering === true) return;
        if (
            mediaPlaybackState.playing === true &&
            (getAnimationRunning() === true || isMediaElementLikelyBuffering(mediaElement))
        ) {
            handlePlayableMediaBuffering(itemId, currentTimeSeconds);
            return;
        }
        mediaPlaybackState = {
            ...mediaPlaybackState,
            active: true,
            playing: false,
            buffering: false,
        };
        setMediaBufferingStatusVisible(false);
        rerender();
    }

    function handlePlayableMediaEnded(itemId) {
        if (suppressMediaEvents) return;
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId || normalizedId !== mediaPlaybackState.itemId) return;
        if (getActiveMissionDrivenMediaSeek(normalizedId)) return;
        if (
            mediaPlaybackState.active !== true
            && mediaPlaybackState.playing !== true
            && mediaPlaybackState.buffering !== true
        ) {
            return;
        }
        const mediaItem = findCurrentManifestItemById(normalizedId) || mediaPlaybackState;
        const durationSeconds = resolvePlayableDurationSeconds(mediaItem);
        const endedTimeMs = Number.isFinite(durationSeconds)
            ? syncMissionTimeToMediaOffset(mediaItem, durationSeconds, true)
            : mediaPlaybackState.syncedTimeMs;
        const mediaElement = getActivePlayableMediaElement();
        if (mediaElement) {
            mediaElement.loop = false;
            mediaElement.removeAttribute?.("loop");
            pauseMediaElementSilently(mediaElement);
        }
        mediaPlayRequestPending = false;
        mediaPlaybackState = {
            ...mediaPlaybackState,
            active: false,
            playing: false,
            buffering: false,
            syncedTimeMs: Number.isFinite(endedTimeMs) ? endedTimeMs : mediaPlaybackState.syncedTimeMs,
            currentTimeSeconds: Number.isFinite(durationSeconds)
                ? durationSeconds
                : mediaPlaybackState.currentTimeSeconds,
        };
        setMediaBufferingStatusVisible(false);
        if (mediaPlaybackState.pauseAnimationOnEnd === true) {
            pauseAnimationFromMedia();
        } else {
            setPlaybackAuthority(PLAYBACK_AUTHORITY_ANIMATION);
        }
        rerender();
    }

    function handlePlayableMediaFailed(itemId, mediaElement = null) {
        if (suppressMediaEvents) return;
        const normalizedId = String(itemId || "").trim();
        if (normalizedId && normalizedId !== mediaPlaybackState.itemId) return;
        if (mediaElement && mediaElement === currentAudio) {
            currentAudio = null;
            currentAudioClipId = "";
        }
        mediaPlaybackState = {
            ...mediaPlaybackState,
            active: false,
            playing: false,
            buffering: false,
        };
        setMediaBufferingStatusVisible(false);
        if (mediaPlaybackState.pauseAnimationOnEnd === true) {
            pauseAnimationFromMedia();
        } else {
            setPlaybackAuthority(PLAYBACK_AUTHORITY_ANIMATION);
        }
        rerender();
    }

    function handlePlayableMediaBuffering(itemId, currentTimeSeconds = 0) {
        if (suppressMediaEvents) return;
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId || normalizedId !== mediaPlaybackState.itemId) return;
        const missionSeekState = getActiveMissionDrivenMediaSeek(normalizedId);
        if (missionSeekState) {
            mediaPlaybackState = {
                ...mediaPlaybackState,
                active: true,
                playing: missionSeekState.wasPlaying,
                buffering: true,
                syncedTimeMs: missionSeekState.targetTimeMs,
                currentTimeSeconds: missionSeekState.targetSeconds,
            };
            setMediaBufferingStatusVisible(true);
            rerender();
            return;
        }
        const mediaItem = findCurrentManifestItemById(normalizedId) || mediaPlaybackState;
        const animationClockDrivingMedia = isAnimationClockDrivingMedia();
        const syncedTimeMs = animationClockDrivingMedia
            ? readCurrentMissionTimeMs()
            : syncMissionTimeToMediaOffset(mediaItem, Number(currentTimeSeconds) || 0, false);
        const currentSeconds = animationClockDrivingMedia
            ? resolvePlaybackOffsetSeconds(mediaItem, syncedTimeMs, false)
            : Math.max(0, Number(currentTimeSeconds) || 0);
        const wasPlaying = mediaPlaybackState.playing === true;
        mediaPlaybackState = {
            ...mediaPlaybackState,
            active: true,
            playing: wasPlaying,
            buffering: true,
            syncedTimeMs: Number.isFinite(syncedTimeMs) ? syncedTimeMs : mediaPlaybackState.syncedTimeMs,
            currentTimeSeconds: currentSeconds,
        };
        setMediaBufferingStatusVisible(true);
        rerender();
    }

    function syncMissionTimeFromMedia(itemId, currentTimeSeconds) {
        const normalizedId = String(itemId || "").trim();
        if (
            !normalizedId
            || normalizedId !== mediaPlaybackState.itemId
            || mediaPlaybackState.active !== true
            || !Number.isFinite(mediaPlaybackState.startTimeMs)
        ) {
            return;
        }
        const mediaSeconds = Number(currentTimeSeconds);
        if (!Number.isFinite(mediaSeconds) || mediaSeconds < 0) return;
        const mediaItem = findCurrentManifestItemById(mediaPlaybackState.itemId) || mediaPlaybackState;
        const missionSeekState = getActiveMissionDrivenMediaSeek(normalizedId);
        if (missionSeekState) {
            if (isMissionDrivenMediaSeekClockStale(normalizedId, mediaSeconds)) {
                return;
            }
            clearMissionDrivenMediaSeekState();
        }
        const durationSeconds = resolvePlayableDurationSeconds(mediaItem);
        if (Number.isFinite(durationSeconds) && mediaSeconds >= Math.max(0, durationSeconds - 0.05)) {
            handlePlayableMediaEnded(normalizedId);
            return;
        }
        const nextTimeMs = mediaPlaybackState.startTimeMs + (mediaSeconds * 1000);
        const currentTimelineTimeMs = readMainTimelineTimeMs();
        if (isAnimationClockDrivingMedia()) {
            const syncedTimeMs = Number.isFinite(currentTimelineTimeMs) ? currentTimelineTimeMs : nextTimeMs;
            mediaPlaybackState = {
                ...mediaPlaybackState,
                syncedTimeMs,
                currentTimeSeconds: mediaSeconds,
            };
            return;
        }
        const previousSyncedTimeMs = Number(mediaPlaybackState.syncedTimeMs);
        if (
            Number.isFinite(currentTimelineTimeMs)
            && Number.isFinite(previousSyncedTimeMs)
            && (
                Math.abs(currentTimelineTimeMs - previousSyncedTimeMs) > MEDIA_CLOCK_OVERRIDE_TOLERANCE_MS
                || Math.abs(currentTimelineTimeMs - nextTimeMs) > MEDIA_CLOCK_OVERRIDE_TOLERANCE_MS
            )
        ) {
            // Timeline jumps (e.g. frame-and-shoot +/- step controls) should
            // force media to follow mission time instead of dropping playback state.
            syncActivePlayableMediaToMissionTime(mediaItem, currentTimelineTimeMs);
            mediaPlaybackState = {
                ...mediaPlaybackState,
                active: true,
                buffering: false,
                syncedTimeMs: currentTimelineTimeMs,
            };
            rerender();
            return;
        }
        const syncedTimeMs = syncMissionTimeToMediaOffset(mediaItem, mediaSeconds, false);
        mediaPlaybackState = {
            ...mediaPlaybackState,
            syncedTimeMs: Number.isFinite(syncedTimeMs) ? syncedTimeMs : nextTimeMs,
            currentTimeSeconds: mediaSeconds,
        };
    }

    function attachAudioPlaybackEvents(audio, item) {
        if (!audio || typeof audio.addEventListener !== "function" || !item) return;
        audio.addEventListener("playing", () => handlePlayableMediaStarted(item.id, "audioClip", Number(audio.currentTime)));
        for (const eventName of ["loadedmetadata", "durationchange"]) {
            audio.addEventListener(eventName, () => {
                applyMeasuredPlayableDurationSeconds(item.id, Number(audio.duration));
            });
        }
        audio.addEventListener("pause", () => {
            if (audio.ended === true) return;
            handlePlayableMediaPaused(item.id, audio, Number(audio.currentTime));
        });
        audio.addEventListener("ended", () => handlePlayableMediaEnded(item.id));
        audio.addEventListener("timeupdate", () => {
            syncMissionTimeFromMedia(item.id, Number(audio.currentTime));
        });
        for (const eventName of ["waiting", "stalled"]) {
            audio.addEventListener(eventName, () => {
                handlePlayableMediaBuffering(item.id, Number(audio.currentTime));
            });
        }
        for (const eventName of ["abort", "error"]) {
            audio.addEventListener(eventName, () => {
                handlePlayableMediaFailed(item.id, audio);
            });
        }
    }

    function setMediaElementCurrentTime(mediaElement, seconds) {
        if (!mediaElement || !Number.isFinite(seconds)) return;
        try {
            mediaElement.currentTime = Math.max(0, seconds);
        } catch {
            // Media metadata may not be loaded yet; the play event will still align from the start.
        }
    }

    function isAbortLikeMediaPlayError(error) {
        const name = String(error?.name || "").toLowerCase();
        if (name === "aborterror") return true;
        const message = String(error?.message || "").toLowerCase();
        return message.includes("aborted");
    }

    function ensureVideoPlaybackSource(video, item) {
        if (!video || !item || item.kind !== "videoClip") {
            return {
                readyForImmediatePlay: true,
            };
        }
        const sourceType = resolveVideoSourceType(item);
        const sourceUrl = resolvePlayableAssetUrl(item);
        if (!sourceUrl) {
            return {
                readyForImmediatePlay: true,
            };
        }

        if (sourceType === "hls") {
            const attachedSource = String(video?.currentSrc || video?.src || "").trim();
            const declaredSource = String(video?.dataset?.mediaSourceUrl || "").trim();
            return {
                readyForImmediatePlay: declaredSource === sourceUrl && attachedSource !== "",
            };
        }

        if (video.getAttribute?.("src") !== sourceUrl) {
            video.src = sourceUrl;
            callMediaMethod(video, "load");
        }
        return {
            readyForImmediatePlay: true,
        };
    }

    function getAnimationRateContext() {
        const realtime = getAnimationRealtime() === true;
        const configuredMultiplier = Number(getAnimationSpeedMultiplier());
        const simSecondsPerRealSecond = realtime
            ? 1
            : (Number.isFinite(configuredMultiplier) && configuredMultiplier > 0
                ? configuredMultiplier
                : Number.NaN);
        return {
            realtime,
            simSecondsPerRealSecond,
        };
    }

    function shouldUseTransportPlayback() {
        if (playbackAuthority === PLAYBACK_AUTHORITY_MEDIA) {
            return true;
        }
        const rateContext = getAnimationRateContext();
        if (rateContext.realtime) return true;
        return Number.isFinite(rateContext.simSecondsPerRealSecond)
            && rateContext.simSecondsPerRealSecond <= MEDIA_TRANSPORT_MAX_SIM_SECONDS_PER_REAL_SECOND;
    }

    function playMediaElement(mediaElement, itemId = "", kind = "", {
        force = false,
    } = {}) {
        if (!mediaElement) return;
        const normalizedItemId = String(itemId || "").trim();
        const normalizedKind = String(kind || "").trim();
        const nowMs = Date.now();
        if (mediaPlayRequestPending === true) return;
        if (
            force !== true
            && mediaElement.paused === true
            && normalizedItemId
            && lastMediaPlayAttempt.itemId === normalizedItemId
            && lastMediaPlayAttempt.kind === normalizedKind
            && (nowMs - Number(lastMediaPlayAttempt.atMs)) < MEDIA_PLAY_RETRY_COOLDOWN_MS
        ) {
            return;
        }
        if (kind === "audioClip" || kind === "videoClip") {
            try {
                mediaElement.muted = missionMediaMuted === true;
            } catch {
                // Some media shims expose read-only properties in tests.
            }
        }
        lastMediaPlayAttempt = {
            itemId: normalizedItemId,
            kind: normalizedKind,
            atMs: nowMs,
        };
        mediaPlayRequestPending = true;
        try {
            const playResult = mediaElement?.play?.();
            if (playResult && typeof playResult.then === "function") {
                Promise.resolve(playResult).then(() => {
                    mediaPlayRequestPending = false;
                    if (mediaPlaybackState.itemId !== itemId || mediaPlaybackState.playing === true) return;
                    if (mediaElement?.paused === true) return;
                    handlePlayableMediaStarted(itemId, kind, Number(mediaElement?.currentTime) || 0);
                }).catch((error) => {
                    mediaPlayRequestPending = false;
                    if (isAbortLikeMediaPlayError(error)) {
                        return;
                    }
                    handlePlayableMediaFailed(itemId, mediaElement);
                });
                return;
            }
            mediaPlayRequestPending = false;
        } catch {
            mediaPlayRequestPending = false;
            handlePlayableMediaFailed(itemId, mediaElement);
        }
    }

    function handleVideoSourceReady(itemId, currentTimeSeconds = Number.NaN) {
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId || normalizedId !== mediaPlaybackState.itemId) return;
        if (mediaPlaybackState.kind !== "videoClip" || mediaPlaybackState.buffering !== true) return;
        const item = findCurrentManifestItemById(normalizedId);
        if (!item || !isForegroundPlayableMediaItem(item)) return;
        const video = getVideoElement();
        if (!video) return;
        const desiredSeconds = Number.isFinite(Number(mediaPlaybackState.currentTimeSeconds))
            ? Number(mediaPlaybackState.currentTimeSeconds)
            : (Number.isFinite(Number(currentTimeSeconds)) ? Number(currentTimeSeconds) : 0);
        setMediaPlaybackRate(video, getMediaPlaybackRate());
        const currentSeconds = Number(video.currentTime);
        if (!Number.isFinite(currentSeconds) || Math.abs(currentSeconds - desiredSeconds) >= MEDIA_TIME_SYNC_EPSILON_SECONDS) {
            setMediaElementCurrentTime(video, desiredSeconds);
        }
        if (isAnimationClockDrivingMedia()) {
            if (video.paused === true && mediaPlayRequestPending !== true) {
                playMediaElement(video, item.id, "videoClip", { force: true });
            }
            mediaPlaybackState = {
                ...mediaPlaybackState,
                active: true,
                playing: true,
                buffering: false,
            };
            rerender();
            return;
        }
        if (mediaPlayRequestPending !== true) {
            playMediaElement(video, item.id, "videoClip");
        }
    }

    function startPlayableMediaItem(item, {
        fromBeginning = true,
        seekTimeline = true,
        keepAnimationRunning = false,
        forceTransportPlayback = false,
        pauseAnimationOnEnd = false,
    } = {}) {
        if (!isForegroundPlayableMediaItem(item)) return false;
        const offsetSeconds = resolvePlaybackOffsetSeconds(item, readCurrentMissionTimeMs(), fromBeginning);
        const timelineTimeMs = item.startTimeMs + offsetSeconds * 1000;
        const frameScrubMode = forceTransportPlayback !== true && isFrameScrubMode();

        stopPlayableMedia({ pauseClock: false });
        primePlayableMediaState(item, {
            playing: false,
            syncedTimeMs: timelineTimeMs,
            currentTimeSeconds: offsetSeconds,
            pauseAnimationOnEnd,
        });

        if (seekTimeline) {
            seekMissionTimelineTime(timelineTimeMs, true);
        }

        if (item.kind === "audioClip") {
            if (frameScrubMode) {
                mediaPlaybackState = {
                    ...mediaPlaybackState,
                    active: true,
                    playing: false,
                    buffering: false,
                };
                rerender();
                if (getAnimationRunning() !== true) {
                    playAnimationFromMedia();
                }
                return true;
            }
            if (keepAnimationRunning !== true) {
                pauseAnimationFromMedia();
            }
            rerender();
            if (typeof globalThis.Audio !== "function") {
                handlePlayableMediaStarted(item.id, "audioClip");
                return true;
            }
            currentAudio = new globalThis.Audio(item.assetUrl);
            currentAudio.volume = 0.7;
            currentAudio.muted = missionMediaMuted === true;
            currentAudio.loop = false;
            currentAudioClipId = item.id;
            attachAudioPlaybackEvents(currentAudio, item);
            setMediaPlaybackRate(currentAudio, getMediaPlaybackRate());
            setMediaElementCurrentTime(currentAudio, offsetSeconds);
            playMediaElement(currentAudio, item.id, "audioClip");
            return true;
        }

        if (item.kind === "videoClip") {
            const video = getVideoElement();
            if (!video) {
                handlePlayableMediaStarted(item.id, "videoClip");
                return true;
            }
            if (item.posterAssetUrl) {
                video.poster = item.posterAssetUrl;
            }
            const sourceSetup = ensureVideoPlaybackSource(video, item);
            video.muted = missionMediaMuted === true;
            video.loop = false;
            video.removeAttribute?.("loop");
            if (video.dataset) {
                video.dataset.mediaItemId = item.id;
                video.dataset.mediaSourceUrl = item.assetUrl;
                video.dataset.sourceType = item.sourceType || "";
            }
            if (frameScrubMode) {
                pauseMediaElementSilently(video);
                setMediaElementCurrentTime(video, offsetSeconds);
                mediaPlaybackState = {
                    ...mediaPlaybackState,
                    active: true,
                    playing: false,
                    buffering: false,
                };
                rerender();
                if (getAnimationRunning() !== true) {
                    playAnimationFromMedia();
                }
                return true;
            }
            if (keepAnimationRunning !== true) {
                pauseAnimationFromMedia();
            }
            rerender();
            setMediaPlaybackRate(video, getMediaPlaybackRate());
            setMediaElementCurrentTime(video, offsetSeconds);
            if (sourceSetup?.readyForImmediatePlay !== false) {
                playMediaElement(video, item.id, "videoClip");
            }
            return true;
        }

        return false;
    }

    function startFocusedPlayableMediaFromMissionTime({
        seekTimeline = true,
        keepAnimationRunning = false,
        forceTransportPlayback = false,
        pauseAnimationOnEnd = false,
    } = {}) {
        if (mediaPlaybackState.playing === true) return false;
        const activeItem = getCurrentFocusedMediaItem();
        if (!activeItem || !isForegroundPlayableMediaItem(activeItem)) return false;
        return startPlayableMediaItem(activeItem, {
            fromBeginning: false,
            seekTimeline,
            keepAnimationRunning,
            forceTransportPlayback,
            pauseAnimationOnEnd,
        });
    }

    function getActivePlayableMediaElement() {
        if (mediaPlaybackState.kind === "videoClip") {
            return getVideoElement();
        }
        if (mediaPlaybackState.kind === "audioClip") {
            return currentAudio;
        }
        return null;
    }

    function pauseMediaElementSilently(mediaElement) {
        if (!mediaElement || typeof mediaElement.pause !== "function") return;
        markSilentMediaPause(mediaElement);
        suppressMediaEvents = true;
        callMediaMethod(mediaElement, "pause");
        suppressMediaEvents = false;
    }

    function syncActivePlayableMediaToMissionTime(item, missionTimeMs) {
        if (!item || !isForegroundPlayableMediaItem(item) || !Number.isFinite(missionTimeMs)) return;
        if (mediaPlaybackState.itemId !== item.id || mediaPlaybackState.active !== true) return;
        const itemEndTimeMs = resolveMediaItemEndTimeMs(item);
        if (Number.isFinite(itemEndTimeMs) && missionTimeMs >= itemEndTimeMs) {
            mediaPlaybackState = {
                ...mediaPlaybackState,
                active: false,
                playing: false,
                buffering: false,
                syncedTimeMs: itemEndTimeMs,
                currentTimeSeconds: resolvePlaybackOffsetSeconds(item, itemEndTimeMs, false),
            };
            return;
        }
        const mediaElement = getActivePlayableMediaElement();
        if (!mediaElement) return;

        const targetSeconds = resolvePlaybackOffsetSeconds(item, missionTimeMs, false);
        const currentSeconds = Number(mediaElement.currentTime);
        const nowMs = Date.now();
        const transportMode = shouldUseTransportPlayback();
        const animationRunning = getAnimationRunning() === true;

        if (
            playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            && (
                mediaPlaybackState.playing === true
                || mediaPlaybackState.buffering === true
                || mediaPlayRequestPending === true
            )
            && animationRunning
        ) {
            return;
        }

        if (transportMode && animationRunning) {
            scrubSyncState.itemId = item.id;
            scrubSyncState.lastAppliedAtMs = nowMs;

            if (!Number.isFinite(currentSeconds) || Math.abs(currentSeconds - targetSeconds) > MEDIA_TRANSPORT_RESYNC_TOLERANCE_SECONDS) {
                setMediaElementCurrentTime(mediaElement, targetSeconds);
            }
            if (mediaElement.paused === true && mediaPlayRequestPending !== true) {
                playMediaElement(mediaElement, item.id, item.kind);
            }
            mediaPlaybackState = {
                ...mediaPlaybackState,
                active: true,
                playing: mediaPlaybackState.playing === true || mediaPlaybackState.buffering === true,
                buffering: mediaPlaybackState.buffering === true,
                syncedTimeMs: item.startTimeMs + targetSeconds * 1000,
                currentTimeSeconds: targetSeconds,
            };
            return;
        }

        if (
            playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            && mediaPlaybackState.buffering === true
        ) {
            if (!Number.isFinite(currentSeconds) || Math.abs(currentSeconds - targetSeconds) >= MEDIA_TIME_SYNC_EPSILON_SECONDS) {
                setMediaElementCurrentTime(mediaElement, targetSeconds);
            }
            mediaPlaybackState = {
                ...mediaPlaybackState,
                active: true,
                playing: false,
                buffering: true,
                syncedTimeMs: item.startTimeMs + targetSeconds * 1000,
                currentTimeSeconds: targetSeconds,
            };
            return;
        }

        pauseMediaElementSilently(mediaElement);
        if (
            scrubSyncState.itemId !== item.id
            || !Number.isFinite(scrubSyncState.lastAppliedAtMs)
            || (nowMs - scrubSyncState.lastAppliedAtMs) >= MEDIA_SCRUB_SYNC_INTERVAL_MS
            || !Number.isFinite(currentSeconds)
            || Math.abs(currentSeconds - targetSeconds) >= MEDIA_TIME_SYNC_EPSILON_SECONDS
        ) {
            setMediaElementCurrentTime(mediaElement, targetSeconds);
            scrubSyncState = {
                itemId: item.id,
                lastAppliedAtMs: nowMs,
            };
        }
        mediaPlaybackState = {
            ...mediaPlaybackState,
            active: true,
            playing: false,
            buffering: false,
            syncedTimeMs: item.startTimeMs + targetSeconds * 1000,
        };
    }

    function forceResyncActiveMedia() {
        const activePlaybackItem = findCurrentManifestItemById(mediaPlaybackState.itemId);
        const focusedItem = getCurrentFocusedMediaItem();
        const targetItem = (activePlaybackItem && isForegroundPlayableMediaItem(activePlaybackItem))
            ? activePlaybackItem
            : ((focusedItem && isForegroundPlayableMediaItem(focusedItem)) ? focusedItem : null);
        if (!targetItem) return false;

        const missionTimeMs = readCurrentMissionTimeMs();
        const animationRunning = getAnimationRunning() === true;
        const hasActiveTarget = mediaPlaybackState.itemId === targetItem.id && mediaPlaybackState.active === true;

        if (!hasActiveTarget) {
            startPlayableMediaItem(targetItem, {
                fromBeginning: false,
                seekTimeline: false,
                keepAnimationRunning: true,
            });
        }

        syncActivePlayableMediaToMissionTime(targetItem, missionTimeMs);

        if (!animationRunning) {
            const mediaElement = getActivePlayableMediaElement();
            const targetSeconds = resolvePlaybackOffsetSeconds(targetItem, missionTimeMs, false);
            pauseMediaElementSilently(mediaElement);
            setMediaElementCurrentTime(mediaElement, targetSeconds);
            mediaPlaybackState = {
                itemId: targetItem.id,
                kind: targetItem.kind,
                active: true,
                playing: false,
                buffering: false,
                startTimeMs: targetItem.startTimeMs,
                syncedTimeMs: targetItem.startTimeMs + targetSeconds * 1000,
            };
        }

        rerender();
        return true;
    }

    function isMediaBrowserEnabled(globalConfig) {
        return isMissionPanelEnabled(globalConfig, MEDIA_BROWSER_PANEL_ID, {
            fallbackEnabled: false,
        });
    }

    function ensureTimelineEventBinding() {
        if (timelineEventBound) return;
        if (typeof document?.addEventListener !== "function") return;
        timelineEventBound = true;
        onTimelineMarkerSelect = (event) => {
            const markerId = String(event?.detail?.marker?.id || "").trim();
            const markerTimeMs = Number(event?.detail?.timeMs);
            panelActions.setPanelState?.("open");
            const markerItem = markerId ? findCurrentManifestItemById(markerId) : null;
            if (
                markerItem &&
                isForegroundPlayableMediaItem(markerItem) &&
                mediaPlaybackState.active === true &&
                mediaPlaybackState.itemId === markerItem.id &&
                Number.isFinite(markerTimeMs) &&
                isActivePlayableMarkerSeekTime(markerItem, markerTimeMs)
            ) {
                seekMissionTimelineTime(markerTimeMs, true);
                runtimeMediaState.setActiveItemId(markerItem.id, {
                    anchorTimeMs: markerTimeMs,
                });
                if (lastRenderContext) {
                    lastRenderContext = {
                        ...lastRenderContext,
                        animTime: markerTimeMs,
                    };
                }
                seekActivePlayableMediaToMissionTime(markerTimeMs);
                rerender();
                return;
            }
            handlePanelIntent({
                type: "selectItem",
                value: markerId,
            });
        };
        onTimelineUserSeek = (event) => {
            handleTimelineUserSeek(event?.detail || {});
        };
        onMediaPanelStateChanged = (event) => {
            const panelState = String(event?.detail?.state || "").trim().toLowerCase();
            if (!panelState) return;
            mediaPanelOpen = panelState === "open";
            if (mediaPanelOpen) return;
            stopPlayableMedia({ pauseClock: true });
            rerender();
        };
        document.addEventListener("mission-media-marker-select", onTimelineMarkerSelect);
        document.addEventListener("mission-timeline-user-seek", onTimelineUserSeek);
        document.addEventListener("mission-media-panel-state", onMediaPanelStateChanged);
    }

    function ensureAnimationPlayStateBinding() {
        if (animationPlayStateEventBound) return;
        if (typeof document?.addEventListener !== "function") return;
        animationPlayStateEventBound = true;
        onAnimationPlayStateUpdated = (event) => {
            if (handlingAnimationPlayStateEvent) return;
            handlingAnimationPlayStateEvent = true;
            try {
                const isPlaying = event?.detail?.isPlaying === true;
                const missionTimeMs = readCurrentMissionTimeMs();
                const manifest = runtimeMediaState.getManifest();
                const backgroundItems = Array.isArray(manifest?.mediaItems)
                    ? manifest.mediaItems
                    : [];
                if (backgroundItems.length > 0) {
                    backgroundPanelActions.render({
                        items: backgroundItems,
                        timeMs: missionTimeMs,
                        animationRunning: isPlaying,
                        foregroundMediaState: buildForegroundMediaState(),
                    });
                }
                if (handlingMediaDrivenAnimationStateChange !== true) {
                    setPlaybackAuthority(PLAYBACK_AUTHORITY_ANIMATION);
                }
                if (isPlaying) {
                    if (mediaPlaybackState.active === true) {
                        const activePlaybackItem = findCurrentManifestItemById(mediaPlaybackState.itemId);
                        syncActivePlayableMediaToMissionTime(activePlaybackItem, missionTimeMs);
                        return;
                    }
                    const selectableItems = getFilteredSelectableItems();
                    const focusState = buildCurrentMediaFocusState(
                        selectableItems,
                        readCurrentMissionTimeMs(),
                    );
                    const activeItem = focusState?.activeItem;
                    const explicitSelection = focusState?.focusSource === "user-selection";
                    if (!explicitSelection || !activeItem || !isForegroundPlayableMediaItem(activeItem)) {
                        return;
                    }
                    startPlayableMediaItem(activeItem, {
                        fromBeginning: false,
                        seekTimeline: true,
                        keepAnimationRunning: true,
                    });
                    return;
                }
                pausePlayableMediaForAnimationPause();
            } finally {
                handlingAnimationPlayStateEvent = false;
            }
        };
        document.addEventListener("animation-play-state-updated", onAnimationPlayStateUpdated);
    }

    function releaseTimelineEventBinding() {
        if (timelineEventBound && onTimelineMarkerSelect && typeof document?.removeEventListener === "function") {
            document.removeEventListener("mission-media-marker-select", onTimelineMarkerSelect);
        }
        if (timelineEventBound && onTimelineUserSeek && typeof document?.removeEventListener === "function") {
            document.removeEventListener("mission-timeline-user-seek", onTimelineUserSeek);
        }
        if (timelineEventBound && onMediaPanelStateChanged && typeof document?.removeEventListener === "function") {
            document.removeEventListener("mission-media-panel-state", onMediaPanelStateChanged);
        }
        timelineEventBound = false;
        onTimelineMarkerSelect = null;
        onTimelineUserSeek = null;
        onMediaPanelStateChanged = null;
        timelineUserSeekState = {
            active: false,
            animationWasRunning: false,
            stoppedForOutOfRange: false,
        };
        mediaPanelOpen = false;
    }

    function releaseAnimationPlayStateBinding() {
        if (
            animationPlayStateEventBound
            && onAnimationPlayStateUpdated
            && typeof document?.removeEventListener === "function"
        ) {
            document.removeEventListener("animation-play-state-updated", onAnimationPlayStateUpdated);
        }
        animationPlayStateEventBound = false;
        onAnimationPlayStateUpdated = null;
    }

    async function ensureManifestLoaded() {
        const loadState = runtimeMediaState.getLoadState();
        if (loadState === "ready" || loadState === "unavailable") {
            return runtimeMediaState.getManifest();
        }
        if (manifestPromise) {
            return manifestPromise;
        }

        runtimeMediaState.setLoadState("loading");
        manifestPromise = loadMissionMediaManifest()
            .then((manifestData) => {
                if (!manifestData) {
                    runtimeMediaState.setManifest(null);
                    runtimeMediaState.setLoadState("unavailable");
                    invalidateMediaDataCaches();
                    return null;
                }
                const normalizedManifest = normalizeMissionMediaManifest(manifestData, {
                    dataPath: getMissionMediaDataPath() || getMissionDataPath() || "",
                });
                runtimeMediaState.setManifest(normalizedManifest);
                runtimeMediaState.setLoadState("ready");
                invalidateMediaDataCaches();
                return normalizedManifest;
            })
            .catch(() => {
                runtimeMediaState.setManifest(null);
                runtimeMediaState.setLoadState("unavailable");
                invalidateMediaDataCaches();
                return null;
            })
            .finally(() => {
                manifestPromise = null;
            });

        return manifestPromise;
    }

    function rerender() {
        if (!lastRenderContext) return;
        update(lastRenderContext);
    }

    function getFilteredSelectableItems() {
        const manifest = runtimeMediaState.getManifest();
        if (!manifest) return [];
        const filters = runtimeMediaState.getFilters();
        return buildSelectableMediaItems(
            filterMediaItems(manifest.mediaItems || [], filters),
            filterMediaItems(manifest.audioItems || [], filters),
        );
    }

    function resolveMediaItemEndTimeMs(item) {
        return resolveMediaItemEndTimeMsCore(item, {
            fallbackDurationSeconds: getPlayableDurationFallbackSeconds(item),
        });
    }

    function isMediaItemActiveAtTime(item, timeMs) {
        return isMediaItemActiveAtTimeCore(item, timeMs, {
            fallbackDurationSeconds: getPlayableDurationFallbackSeconds(item),
        });
    }

    function isActivePlayableMarkerSeekTime(item, timeMs) {
        if (isMediaItemActiveAtTime(item, timeMs)) return true;
        if (!item || !isForegroundPlayableMediaItem(item) || item.kind !== "videoClip") return false;
        const startTimeMs = Number(item.startTimeMs);
        const markerTimeMs = Number(timeMs);
        if (!Number.isFinite(startTimeMs) || !Number.isFinite(markerTimeMs) || markerTimeMs < startTimeMs) {
            return false;
        }
        const knownEndTimeMs = resolveMediaItemEndTimeMs(item);
        if (Number.isFinite(knownEndTimeMs)) return false;
        const estimatedEndTimeMs = startTimeMs + (VIDEO_ESTIMATED_SEGMENT_DURATION_SECONDS * 1000);
        return markerTimeMs <= estimatedEndTimeMs;
    }

    function planMissionMediaSelectionSync({
        item,
        currentMissionTimeMs = Number.NaN,
        seekTimeline = true,
        preserveCurrentPlayableOffset = false,
        autoStartPlayable = false,
        forceTransportPlayback = false,
    } = {}) {
        return planMissionMediaSelectionSyncCore({
            item,
            currentMissionTimeMs,
            seekTimeline,
            preserveCurrentPlayableOffset,
            autoStartPlayable,
            frameScrubMode: forceTransportPlayback !== true && isFrameScrubMode(),
            fallbackDurationSeconds: getPlayableDurationFallbackSeconds(item),
        });
    }

    function resolvePlayableItemAtTime(timeMs) {
        if (!Number.isFinite(timeMs)) return null;
        const selectableItems = getFilteredSelectableItems();
        const candidates = selectableItems
            .filter((item) => isForegroundPlayableMediaItem(item) && isMediaItemActiveAtTime(item, timeMs));
        if (candidates.length === 0) return null;

        const preferredIds = [
            String(mediaPlaybackState.itemId || "").trim(),
            String(runtimeMediaState.getActiveItemId() || "").trim(),
        ].filter(Boolean);
        for (const preferredId of preferredIds) {
            const preferred = candidates.find((item) => item.id === preferredId);
            if (preferred) return preferred;
        }

        let bestItem = candidates[0];
        let bestDelta = Math.abs(timeMs - bestItem.startTimeMs);
        for (let index = 1; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            const delta = Math.abs(timeMs - candidate.startTimeMs);
            if (delta < bestDelta) {
                bestItem = candidate;
                bestDelta = delta;
            }
        }
        return bestItem;
    }

    function keepPlaybackSynchronizedAtTime(timeMs, {
        animationWasRunning = false,
    } = {}) {
        if (mediaPanelOpen !== true || animationWasRunning !== true || !Number.isFinite(timeMs)) {
            return false;
        }
        const nextPlayableItem = resolvePlayableItemAtTime(timeMs);
        if (nextPlayableItem) {
            runtimeMediaState.setActiveItemId(nextPlayableItem.id, {
                anchorTimeMs: timeMs,
            });
            const restarted = startPlayableMediaItem(nextPlayableItem, {
                fromBeginning: false,
                seekTimeline: false,
                keepAnimationRunning: animationWasRunning === true,
            });
            if (restarted) {
                return true;
            }
        }
        pauseAnimation();
        return false;
    }

    function handleTimelineUserSeek(eventDetail = {}) {
        const phase = String(eventDetail.phase || "").trim().toLowerCase();
        const source = String(eventDetail.source || "").trim();
        const timeMs = Number(eventDetail.timeMs);
        const commit = eventDetail.commit === true;
        if (!Number.isFinite(timeMs)) return;
        if (source === "media-sync") return;
        setPlaybackAuthority(PLAYBACK_AUTHORITY_ANIMATION);

        if (phase === "start") {
            timelineUserSeekState = {
                active: true,
                animationWasRunning: getAnimationRunning() === true,
                stoppedForOutOfRange: false,
            };
        } else if (!timelineUserSeekState.active) {
            timelineUserSeekState = {
                active: true,
                animationWasRunning: getAnimationRunning() === true,
                stoppedForOutOfRange: false,
            };
        }

        const currentPlayableItem = findCurrentManifestItemById(mediaPlaybackState.itemId);
        const currentPlayableActive = !!currentPlayableItem
            && isForegroundPlayableMediaItem(currentPlayableItem)
            && isActivePlayableMarkerSeekTime(currentPlayableItem, timeMs);
        const missionSeekWasPlaying = mediaPlaybackState.playing === true || mediaPlaybackState.buffering === true;
        if (
            (mediaPlaybackState.active === true || mediaPlaybackState.playing === true || mediaPlaybackState.buffering === true)
            && !currentPlayableActive
        ) {
            stopPlayableMedia({ pauseClock: false });
            timelineUserSeekState.stoppedForOutOfRange = true;
        }
        if (
            currentPlayableActive
            && (mediaPlaybackState.active === true || mediaPlaybackState.playing === true || mediaPlaybackState.buffering === true)
        ) {
            if (lastRenderContext) {
                lastRenderContext = {
                    ...lastRenderContext,
                    animTime: timeMs,
                };
            }
            if (isMissionDrivenSeekSource(source)) {
                startMissionDrivenMediaSeek(currentPlayableItem, timeMs, {
                    source,
                    wasPlaying: missionSeekWasPlaying,
                });
                syncActivePlayableMediaToMissionTime(currentPlayableItem, timeMs);
                rerender();
            } else if (seekActivePlayableMediaToMissionTime(timeMs)) {
                rerender();
            }
        }

        const shouldFinalize = phase === "commit" || phase === "end" || commit;
        if (
            shouldFinalize
            && timelineUserSeekState.animationWasRunning
            && timelineUserSeekState.stoppedForOutOfRange
        ) {
            keepPlaybackSynchronizedAtTime(timeMs, {
                animationWasRunning: true,
            });
        }

        if (phase === "end" || phase === "cancel" || phase === "commit") {
            timelineUserSeekState = {
                active: false,
                animationWasRunning: false,
                stoppedForOutOfRange: false,
            };
            return;
        }

        if (source === "timeline-slider" && phase === "update") {
            // Leave the session open while the user drags/keys through the slider.
            return;
        }
    }

    function getPlaybackFocusItemId() {
        return mediaPlaybackState.active === true || mediaPlaybackState.playing === true || mediaPlaybackState.buffering === true
            ? mediaPlaybackState.itemId
            : "";
    }

    function isExplicitFocusCurrent(timeMs) {
        const anchorTimeMs = Number(runtimeMediaState.getActiveItemAnchorTimeMs?.());
        if (!Number.isFinite(anchorTimeMs) || !Number.isFinite(Number(timeMs))) return true;
        return Math.abs(Number(timeMs) - anchorTimeMs) <= MEDIA_EXPLICIT_FOCUS_TOLERANCE_MS;
    }

    function shouldKeepExplicitSelectionActive(activeItem, timeMs) {
        if (!activeItem) return false;
        if (!Number.isFinite(Number(timeMs))) return true;
        return isMediaItemActiveAtTime(activeItem, Number(timeMs));
    }

    function buildCurrentMediaFocusState(items, timeMs) {
        const selectableItems = Array.isArray(items) ? items : getFilteredSelectableItems();
        const playbackItemId = getPlaybackFocusItemId();
        if (playbackItemId) {
            const playbackFocus = buildExplicitMediaFocusState({
                items: selectableItems,
                activeItemId: playbackItemId,
                timeMs,
                nearbyRadius: 3,
                focusSource: "media-playback",
            });
            if (playbackFocus.activeItem) {
                return playbackFocus;
            }
        }

        const activeItemId = runtimeMediaState.getActiveItemId();
        const explicitActiveItem = activeItemId
            ? selectableItems.find((item) => item?.id === activeItemId) || null
            : null;
        if (
            activeItemId &&
            (
                isExplicitFocusCurrent(timeMs)
                || shouldKeepExplicitSelectionActive(explicitActiveItem, timeMs)
            )
        ) {
            const explicitFocus = buildExplicitMediaFocusState({
                items: selectableItems,
                activeItemId,
                timeMs,
                nearbyRadius: 3,
                focusSource: "user-selection",
            });
            if (explicitFocus.activeItem) {
                return explicitFocus;
            }
        }

        if (activeItemId) {
            runtimeMediaState.setActiveItemId("");
        }
        return buildTimeProximityMediaFocusState({
            items: selectableItems,
            timeMs,
            nearbyRadius: 3,
        });
    }

    function getCurrentFocusedMediaItem() {
        return buildCurrentMediaFocusState(
            getFilteredSelectableItems(),
            Number(lastRenderContext?.animTime),
        ).activeItem;
    }

    function getPanelSeekMediaItem() {
        const selectableItems = getFilteredSelectableItems();
        const playbackItem = findMediaItemById(selectableItems, mediaPlaybackState.itemId);
        if (playbackItem && isForegroundPlayableMediaItem(playbackItem)) {
            return playbackItem;
        }
        const activeItem = findMediaItemById(selectableItems, runtimeMediaState.getActiveItemId());
        if (activeItem && isForegroundPlayableMediaItem(activeItem)) {
            return activeItem;
        }
        const focusedItem = buildCurrentMediaFocusState(
            selectableItems,
            readCurrentMissionTimeMs(),
        ).activeItem;
        return focusedItem && isForegroundPlayableMediaItem(focusedItem) ? focusedItem : null;
    }

    function previewMediaItem(item, {
        seekTimeline = true,
        preserveCurrentPlayableOffset = false,
        autoStartPlayable = false,
        forceTransportPlayback = false,
    } = {}) {
        if (!item) return false;
        if (isBackgroundPlaybackMediaItem(item)) return false;
        const currentMissionTimeMs = readCurrentMissionTimeMs();
        const syncPlan = planMissionMediaSelectionSync({
            item,
            currentMissionTimeMs,
            seekTimeline,
            preserveCurrentPlayableOffset,
            autoStartPlayable,
            forceTransportPlayback,
        });
        if (syncPlan.canApply !== true) return false;

        dispatchDocumentCustomEvent("mission-media-item-select", {
            item,
        });

        if (syncPlan.shouldStopExistingPlayable) {
            stopPlayableMedia({ pauseClock: false });
        }
        if (!syncPlan.shouldSeekTimeline) {
            runtimeMediaState.setActiveItemId(item.id, {
                anchorTimeMs: readCurrentMissionTimeMs(),
            });
            if (syncPlan.shouldStartPlayable) {
                return startPlayableMediaItem(item, {
                    fromBeginning: false,
                    seekTimeline: false,
                    keepAnimationRunning: syncPlan.keepAnimationRunning,
                    forceTransportPlayback,
                });
            }
            rerender();
            return true;
        }
        seekMissionTimelineTime(syncPlan.targetTimeMs, true);
        const anchorTimeMs = readCurrentMissionTimeMs();
        runtimeMediaState.setActiveItemId(item.id, {
            anchorTimeMs: Number.isFinite(anchorTimeMs) ? anchorTimeMs : item.startTimeMs,
        });
        if (Number.isFinite(anchorTimeMs) && lastRenderContext) {
            lastRenderContext = {
                ...lastRenderContext,
                animTime: anchorTimeMs,
            };
        }
        if (syncPlan.shouldStartPlayable) {
            return startPlayableMediaItem(item, {
                fromBeginning: false,
                seekTimeline: false,
                keepAnimationRunning: syncPlan.keepAnimationRunning,
                forceTransportPlayback,
            });
        }
        rerender();
        return true;
    }

    function handlePanelIntent(intent) {
        const type = String(intent?.type || "").trim();
        if (!type) return;

        if (type === "setAudienceFilter") {
            const value = String(intent.value || "").trim();
            runtimeMediaState.patchFilters({
                quick: "all",
                subjects: value === "crew"
                    ? ["crew"]
                    : (value === "external" ? ["space"] : []),
                cameraIds: [],
                cameraId: "all",
            });
            rerender();
            return;
        }
        if (type === "setCameraFilter") {
            const value = String(intent.value || "").trim();
            runtimeMediaState.patchFilters({
                quick: "all",
                cameraIds: value && value !== "all" ? [value] : [],
                cameraId: value || "all",
            });
            rerender();
            return;
        }
        if (type === "setQuickFilter") {
            const value = String(intent.value || "").trim();
            const mediaKinds = value === "videos"
                ? ["videoClip"]
                : (value === "all" ? [...MEDIA_KIND_FILTER_IDS] : undefined);
            const subject = value === "crew" || value === "new"
                ? "crew"
                : (value === "exterior" || value === "external" || value === "space" ? "space" : "");
            const subjectPatch = subject
                ? { subjects: [subject] }
                : (value === "all" ? { subjects: [] } : {});
            runtimeMediaState.patchFilters({
                quick: value === "space" || subject ? value : "all",
                cameraIds: [],
                cameraId: "all",
                ...(mediaKinds ? { mediaKinds } : {}),
                ...subjectPatch,
            });
            rerender();
            return;
        }
        if (type === "toggleSubject") {
            const value = String(intent.value || "").trim();
            if (value === "all") {
                runtimeMediaState.patchFilters({
                    quick: "all",
                    subjects: [],
                });
                rerender();
                return;
            }
            if (!MEDIA_SUBJECT_FILTER_IDS.includes(value)) return;
            const filters = runtimeMediaState.getFilters();
            const active = new Set(filters.subjects || []);
            if (active.has(value)) {
                active.delete(value);
            } else {
                active.add(value);
            }
            runtimeMediaState.patchFilters({
                quick: "all",
                subjects: MEDIA_SUBJECT_FILTER_IDS.filter((subjectId) => active.has(subjectId)),
            });
            rerender();
            return;
        }
        if (type === "toggleMediaKind") {
            const value = String(intent.value || "").trim();
            const filters = runtimeMediaState.getFilters();
            if (value === "all") {
                runtimeMediaState.patchFilters({
                    quick: "all",
                    kind: "all",
                    mediaKinds: [...MEDIA_KIND_FILTER_IDS],
                });
                rerender();
                return;
            }
            if (!MEDIA_KIND_FILTER_IDS.includes(value)) return;
            const active = new Set(filters.mediaKinds || MEDIA_KIND_FILTER_IDS);
            const currentlyUnrestricted = MEDIA_KIND_FILTER_IDS.every((kindId) => active.has(kindId));
            if (currentlyUnrestricted) {
                active.clear();
                active.add(value);
            } else if (active.has(value)) {
                active.delete(value);
            } else {
                active.add(value);
            }
            const selectedKinds = MEDIA_KIND_FILTER_IDS.filter((kindId) => active.has(kindId));
            const mediaKinds = selectedKinds.length === 0 || selectedKinds.length === MEDIA_KIND_FILTER_IDS.length
                ? [...MEDIA_KIND_FILTER_IDS]
                : selectedKinds;
            runtimeMediaState.patchFilters({
                quick: filters.quick === "videos" ? "all" : filters.quick,
                kind: "all",
                mediaKinds,
            });
            if (!mediaKinds.includes("audioClip") && mediaPlaybackState.kind === "audioClip") {
                stopPlayableMedia({ pauseClock: isMediaPlaybackBusy() });
            }
            rerender();
            return;
        }
        if (type === "toggleCameraFilter") {
            const value = String(intent.value || "").trim();
            if (!value) return;
            if (value === "all") {
                runtimeMediaState.patchFilters({
                    quick: "all",
                    cameraIds: [],
                    cameraId: "all",
                });
                rerender();
                return;
            }
            const filters = runtimeMediaState.getFilters();
            const active = new Set(filters.cameraIds || []);
            if (active.has(value)) {
                active.delete(value);
            } else {
                active.add(value);
            }
            const cameraIds = [...active];
            runtimeMediaState.patchFilters({
                quick: "all",
                cameraIds,
                cameraId: cameraIds.length === 1 ? cameraIds[0] : "all",
            });
            rerender();
            return;
        }
        if (type === "setSearchQuery") {
            runtimeMediaState.patchFilters({
                query: String(intent.value || "").trim(),
            });
            rerender();
            return;
        }
        if (type === "selectItem") {
            const selectableItems = getFilteredSelectableItems();
            const selectedItem = selectableItems.find((item) => item.id === intent.value) || null;
            if (!selectedItem) return;
            const autoStartPlayable = getAnimationRunning() === true;
            const forceTransportPlayback = autoStartPlayable && isForegroundPlayableMediaItem(selectedItem);
            if (forceTransportPlayback) {
                setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            }
            previewMediaItem(selectedItem, {
                preserveCurrentPlayableOffset: true,
                autoStartPlayable,
                forceTransportPlayback,
            });
            return;
        }
        if (type === "selectAdjacentItem") {
            const direction = String(intent.value || "").trim() === "previous" ? -1 : 1;
            const selectableItems = getFilteredSelectableItems();
            if (selectableItems.length === 0) {
                runtimeMediaState.setActiveItemId("");
                rerender();
                return;
            }
            const currentFocus = buildCurrentMediaFocusState(
                selectableItems,
                Number(lastRenderContext?.animTime),
            );
            const focusedIndex = Number(currentFocus.activeIndex);
            const targetIndex = Number.isInteger(focusedIndex) && focusedIndex >= 0
                ? clampIndex(focusedIndex + direction, selectableItems.length - 1)
                : resolveNearestMediaIndex(selectableItems, Number(lastRenderContext?.animTime));
            const selectedItem = selectableItems[targetIndex] || selectableItems[0];
            const autoStartPlayable = getAnimationRunning() === true;
            const forceTransportPlayback = autoStartPlayable && isForegroundPlayableMediaItem(selectedItem);
            if (forceTransportPlayback) {
                setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            }
            previewMediaItem(selectedItem, {
                preserveCurrentPlayableOffset: true,
                autoStartPlayable,
                forceTransportPlayback,
            });
            return;
        }
        if (type === "previewItem") {
            const selectableItems = getFilteredSelectableItems();
            const selectedItem = selectableItems.find((item) => item.id === intent.value) || null;
            const autoStartPlayable = getAnimationRunning() === true;
            const forceTransportPlayback = autoStartPlayable && isForegroundPlayableMediaItem(selectedItem);
            if (forceTransportPlayback) {
                setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            }
            previewMediaItem(selectedItem, {
                preserveCurrentPlayableOffset: true,
                autoStartPlayable,
                forceTransportPlayback,
            });
            return;
        }
        if (type === "mediaSeekTime") {
            const activeItem = getPanelSeekMediaItem();
            if (!activeItem || !isForegroundPlayableMediaItem(activeItem)) return;
            setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            mediaPlaybackState = {
                ...mediaPlaybackState,
                pauseAnimationOnEnd: true,
            };
            seekPlayableMediaToSeconds(
                activeItem,
                Number(intent.value),
                intent.finalize === true,
            );
            return;
        }
        if (type === "toggleActiveMediaPlayback") {
            if (mediaPlaybackState.buffering === true) {
                setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
                mediaPlaybackState = {
                    ...mediaPlaybackState,
                    pauseAnimationOnEnd: true,
                };
                const activeItem = findCurrentManifestItemById(mediaPlaybackState.itemId);
                const mediaElement = getActivePlayableMediaElement();
                if (activeItem && mediaElement) {
                    setMediaPlaybackRate(mediaElement, getMediaPlaybackRate());
                    playMediaElement(mediaElement, activeItem.id, activeItem.kind);
                }
                rerender();
                return;
            }
            if (mediaPlaybackState.playing === true) {
                setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
                pauseActivePlayableMedia();
                return;
            }
            const keepAnimationRunning = getAnimationRunning() === true;
            setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            startFocusedPlayableMediaFromMissionTime({
                keepAnimationRunning,
                forceTransportPlayback: true,
                pauseAnimationOnEnd: true,
            });
            return;
        }
        if (type === "toggleMediaMuted") {
            setMissionMediaMuted(!missionMediaMuted);
            return;
        }
        if (type === "startActiveMedia" || type === "startActiveMediaFromBeginning") {
            const activeItem = getCurrentFocusedMediaItem();
            if (!activeItem || !isForegroundPlayableMediaItem(activeItem)) return;
            const keepAnimationRunning = getAnimationRunning() === true;
            setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            startPlayableMediaItem(activeItem, {
                fromBeginning: type === "startActiveMediaFromBeginning",
                seekTimeline: true,
                keepAnimationRunning,
                forceTransportPlayback: true,
                pauseAnimationOnEnd: true,
            });
            return;
        }
        if (type === "forceResyncActiveMedia") {
            forceResyncActiveMedia();
            return;
        }
        if (type === "mediaPlaybackStarted") {
            handlePlayableMediaStarted(intent.value, intent.mediaKind, intent.currentTime);
            return;
        }
        if (type === "mediaPlaybackBuffering") {
            handlePlayableMediaBuffering(intent.value, intent.currentTime);
            return;
        }
        if (type === "mediaPlaybackPaused") {
            handlePlayableMediaPaused(intent.value, intent.mediaElement || null, intent.currentTime);
            return;
        }
        if (type === "mediaPlaybackEnded") {
            handlePlayableMediaEnded(intent.value);
            return;
        }
        if (type === "mediaPlaybackFailed") {
            handlePlayableMediaFailed(intent.value);
            return;
        }
        if (type === "mediaVideoSourceReady") {
            handleVideoSourceReady(intent.value, intent.currentTime);
            return;
        }
        if (type === "mediaDurationKnown") {
            applyMeasuredPlayableDurationSeconds(intent.value, intent.duration);
            return;
        }
        if (type === "mediaPlaybackTimeUpdate") {
            syncMissionTimeFromMedia(intent.value, intent.currentTime);
        }
    }

    function buildPanelViewModel({
        manifest,
        items,
        selectionItems,
        selection,
        timeMs,
        filterModel,
        missionElapsedStartTimeMs = Number.NaN,
    }) {
        const activeItem = selection.activeItem;
        const seedNote = String(manifest?.ui?.seedNote || "").trim();
        const navigationModel = buildMediaNavigationModel(selectionItems, selection);
        thumbnailWindowStartIndex = resolveThumbnailWindowStart(
            selectionItems,
            selection,
            timeMs,
            thumbnailWindowStartIndex,
        );
        const statusText = items.length === 0
            ? "No media matches the current filters."
            : "";
        const activePlayable = isForegroundPlayableMediaItem(activeItem);
        const activePlaybackSelected = activeItem?.id === mediaPlaybackState.itemId;
        const activePlaybackPlaying = activePlaybackSelected && mediaPlaybackState.playing === true;
        const activePlaybackBuffering = activePlaybackSelected && mediaPlaybackState.buffering === true;
        const activeDurationSeconds = resolvePlayableDurationSeconds(activeItem);
        const activeElapsedSeconds = activePlaybackSelected
            ? clampMediaCurrentTimeSeconds(activeItem, Number(mediaPlaybackState.currentTimeSeconds) || 0)
            : (Number.isFinite(activeDurationSeconds)
                ? resolvePlaybackOffsetSeconds(activeItem, timeMs, false)
                : 0);
        const activeRequestedRate = getRequestedAnimationRate();
        const frameScrubActive = activePlayable
            && activeItem?.kind === "videoClip"
            && isFrameScrubMode() === true
            && getAnimationRunning() === true;
        const activeMediaKindLabel = activeItem?.kind === "videoClip"
            ? "Video"
            : (activeItem?.kind === "audioClip" ? "Audio" : "Media");
        const animationRunning = getAnimationRunning() === true;
        const rateContext = getAnimationRateContext();
        const syncRateLabel = formatSyncRateLabel(rateContext);
        const mediaRateLabel = playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            ? formatPlaybackRateLabel(getMediaPlaybackRate())
            : syncRateLabel;
        const transportMode = shouldUseTransportPlayback();
        const syncModeLabel = transportMode ? "transport" : "timeline";
        const activeMediaStatus = activePlaybackBuffering
            ? `${activeMediaKindLabel} buffering`
            : (frameScrubActive
                ? `${activeMediaKindLabel} frame preview (${formatPlaybackRateLabel(activeRequestedRate)} animation)`
                : (!animationRunning
                ? `${activeMediaKindLabel} paused (${syncRateLabel})`
                : (transportMode
                    ? (activePlaybackPlaying
                        ? `${activeMediaKindLabel} playing (${mediaRateLabel})`
                        : `${activeMediaKindLabel} ready (${mediaRateLabel})`)
                    : `${activeMediaKindLabel} ${syncModeLabel}-synced (${syncRateLabel})`)));
        const stageEmptyText = items.length === 0
            ? "No media matches the current filters."
            : (activeItem
                ? "No preview available for this media item."
                : "Select a filtered media item to preview.");

        return {
            panelTitle: String(manifest?.ui?.panelTitle || manifest?.title || "Mission Media").trim(),
            mediaCountLabel: String(items.length),
            descriptionEmptyText: items.length === 0
                ? "No media matches the current filters."
                : "--",
            stageEmptyText,
            seedNote,
            statusText,
            filterModel,
            playbackModel: {
                playable: activePlayable,
                playing: activePlaybackPlaying,
                buffering: activePlaybackBuffering,
                muted: missionMediaMuted === true,
                showControls: activePlayable,
                playLabel: activePlaybackBuffering
                    ? "▶"
                    : (activePlaybackPlaying ? "⏸" : "▶"),
                playTitle: activePlaybackBuffering
                    ? "Resume media playback"
                    : (activePlaybackPlaying
                        ? "Pause media playback"
                        : "Play focused media from the current mission time"),
                restartTitle: "Restart media from beginning",
                resyncTitle: "Force resync media with animation",
                statusLabel: activePlayable ? activeMediaStatus : "",
                elapsedSeconds: activePlayable ? activeElapsedSeconds : 0,
                durationSeconds: activePlayable ? activeDurationSeconds : Number.NaN,
                seekEnabled: activePlayable && Number.isFinite(activeDurationSeconds) && activeDurationSeconds > 0,
                sliderTitle: frameScrubActive
                    ? "Scrub media while animation is running in high-speed preview mode"
                    : "Seek selected media",
            },
            navigationModel,
            focusSource: selection.focusSource || "none",
            activeItem: activeItem
                ? {
                    id: activeItem.id,
                    kind: activeItem.kind,
                    focusSource: selection.focusSource || "none",
                    explicit: selection.explicit === true,
                    title: activeItem.title,
                    description: activeItem.description,
                    assetUrl: resolvePreviewAssetUrl(activeItem),
                    videoAssetUrl: activeItem.kind === "videoClip" && isForegroundPlayableMediaItem(activeItem)
                        ? resolvePlayableAssetUrl(activeItem)
                        : "",
                    sourceType: activeItem.kind === "videoClip" ? resolveVideoSourceType(activeItem) : "",
                    mediaStream: activeItem.mediaStream === true,
                    posterAssetUrl: activeItem.posterAssetUrl || "",
                    playable: activePlayable,
                    timeLabel: `${formatDateTimeLocal(activeItem.startTimeMs, { includeOffset: false })} • ${formatDateTimeUTC(activeItem.startTimeMs)}`,
                    cameraLabel: activeItem.cameraLabel || (activeItem.kind === "audioClip" ? "Audio" : ""),
                    photographer: activeItem.photographer,
                    location: activeItem.location,
                    sourceLabel: activeItem.sourceLabel || activeItem.fileName,
                    settings: activeItem.settings || "",
                    shortDescription: activeItem.shortDescription || "",
                    tags: activeItem.tags || [],
                    subjects: activeItem.subjects || [],
                    bodies: activeItem.bodies || [],
                    mainBody: activeItem.mainBody || "",
                    sceneType: activeItem.sceneType || "",
                    compositionHints: activeItem.compositionHints || null,
                    qualityNotes: activeItem.qualityNotes || "",
                    exifLabel: buildMediaExifLabel(activeItem),
                    stageBadge: buildStageBadge(activeItem),
                    timingNote: buildTimingNote(activeItem, selection.activeDeltaMs),
                }
                : null,
            thumbnailItems: buildThumbnailViewItems(
                selectionItems,
                selection,
                thumbnailWindowStartIndex,
                runtimeMediaState.getFilters().query,
                missionElapsedStartTimeMs,
            ),
            currentTimeMs: timeMs,
        };
    }

    function buildPanelRenderSignature({
        manifest,
        filteredCollections,
        selection,
        timeMs,
    }) {
        const activeItem = selection?.activeItem || null;
        const playbackItem = findCurrentManifestItemById(mediaPlaybackState.itemId);
        const playable = isForegroundPlayableMediaItem(activeItem);
        const durationSeconds = playable ? resolvePlayableDurationSeconds(activeItem) : Number.NaN;
        const elapsedSeconds = playable && activeItem
            ? (activeItem.id === mediaPlaybackState.itemId
                ? Number(mediaPlaybackState.currentTimeSeconds) || 0
                : resolvePlaybackOffsetSeconds(activeItem, timeMs, false))
            : 0;
        return stableJson({
            title: manifest?.ui?.panelTitle || manifest?.title || "",
            count: filteredCollections?.filteredSelectableItems?.length || 0,
            filters: filteredCollections?.filterSignature || "",
            thumbnailStart: thumbnailWindowStartIndex,
            activeId: activeItem?.id || "",
            focusSource: selection?.focusSource || "",
            explicit: selection?.explicit === true,
            deltaSecond: Math.round((Number(selection?.activeDeltaMs) || 0) / 1000),
            playbackItemId: mediaPlaybackState.itemId || "",
            playbackKind: mediaPlaybackState.kind || "",
            playbackActive: mediaPlaybackState.active === true,
            playbackPlaying: mediaPlaybackState.playing === true,
            playbackBuffering: mediaPlaybackState.buffering === true,
            playbackAuthority,
            playbackFocusId: playbackItem?.id || "",
            muted: missionMediaMuted === true,
            animationRunning: getAnimationRunning() === true,
            frameScrubMode: isFrameScrubMode() === true,
            elapsedQuarterSecond: Math.round(elapsedSeconds * 4),
            durationSeconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 4) / 4 : "",
            rate: formatSyncRateLabel(getAnimationRateContext()),
        });
    }

    function renderPanelIfChanged(renderContext) {
        const signature = buildPanelRenderSignature(renderContext);
        if (signature === lastPanelRenderSignature) return;
        lastPanelRenderSignature = signature;
        panelActions.render(buildPanelViewModel({
            manifest: renderContext.manifest,
            items: renderContext.filteredCollections.filteredSelectableItems,
            selectionItems: renderContext.filteredCollections.selectableItems,
            selection: renderContext.selection,
            timeMs: renderContext.timeMs,
            filterModel: renderContext.filteredCollections.filterModel,
            missionElapsedStartTimeMs: renderContext.missionElapsedStartTimeMs,
        }));
    }

    function clearUi(globalConfig, {
        statusText = "No media manifest is available for this mission yet.",
    } = {}) {
        thumbnailWindowStartIndex = 0;
        lastFrameScrubMode = null;
        releaseTimelineEventBinding();
        releaseAnimationPlayStateBinding();
        stopPlayableMedia({ pauseClock: isMediaPlaybackBusy() });
        applyTimelineMediaMarkers([]);
        applyPanelMissionContext({
            configData: globalConfig,
            available: false,
            title: "Mission Media",
            nextMissionLabel: String(globalConfig?.mission_name_short || globalConfig?.mission_name || "Current mission").trim(),
            mediaCount: 0,
        });
        applyBackgroundMissionContext({
            configData: globalConfig,
            available: false,
        });
        backgroundPanelActions.render({
            items: [],
            timeMs: Number(lastRenderContext?.animTime),
            animationRunning: false,
            foregroundMediaState: buildForegroundMediaState(),
        });
        panelActions.render({
            panelTitle: "Mission Media",
            mediaCountLabel: "0",
            statusText,
            descriptionEmptyText: "No media available.",
            stageEmptyText: "No media available.",
            filterModel: buildMediaFilterModel([], runtimeMediaState.getFilters()),
            thumbnailItems: [],
        });
        lastPanelRenderSignature = "";
    }

    function update(context = {}) {
        lastRenderContext = context;

        const globalConfig = context.globalConfig || null;
        const missionName = String(
            globalConfig?.mission_name_short ||
            globalConfig?.mission_name ||
            "Current mission",
        ).trim();
        const compareMode = getIsCompareMode() === true;

        if (compareMode) {
            clearUi(globalConfig, {
                statusText: "Mission media is disabled in compare mode.",
            });
            return;
        }

        if (!isMediaBrowserEnabled(globalConfig)) {
            clearUi(globalConfig, {
                statusText: "Mission media is disabled for this mission.",
            });
            return;
        }

        ensureTimelineEventBinding();
        ensureAnimationPlayStateBinding();
        const loadState = runtimeMediaState.getLoadState();
        if (loadState === "idle") {
            ensureManifestLoaded().then(() => rerender());
        }

        const manifest = runtimeMediaState.getManifest();
        const available = globalConfig != null;
        applyPanelMissionContext({
            configData: globalConfig,
            available,
            title: String(manifest?.ui?.panelTitle || manifest?.title || "Mission Media").trim(),
            nextMissionLabel: missionName,
            mediaCount: (Array.isArray(manifest?.mediaItems) ? manifest.mediaItems.length : 0)
                + (Array.isArray(manifest?.audioItems) ? manifest.audioItems.length : 0),
        });
        applyBackgroundMissionContext({
            configData: globalConfig,
            available,
        });

        if (loadState === "loading" || (loadState === "idle" && !manifest)) {
            applyTimelineMediaMarkers([]);
            panelActions.render({
                panelTitle: "Mission Media",
                mediaCountLabel: "--",
                statusText: "Loading mission media manifest...",
                descriptionEmptyText: "Loading mission media manifest...",
                stageEmptyText: "Loading mission media manifest...",
                filterModel: buildMediaFilterModel([], runtimeMediaState.getFilters()),
                thumbnailItems: [],
            });
            lastPanelRenderSignature = "";
            return;
        }

        if (!manifest) {
            clearUi(globalConfig);
            return;
        }

        const timeMs = Number.isFinite(context.animTime) ? context.animTime : Date.now();
        const timelineStartMs = Number.isFinite(getStartTime()) ? getStartTime() : Number.NaN;
        const missionElapsedStartTimeMs = resolveMissionElapsedStartTimeMs(globalConfig, timelineStartMs);
        const timelineEndMs = Number.isFinite(getLatestEndTime()) ? getLatestEndTime() : Number.NaN;
        const filters = runtimeMediaState.getFilters();
        const filteredCollections = getFilteredMediaCollections(manifest, filters);
        const {
            filteredItems,
            filteredAudioItems,
            filteredSelectableItems,
            selectableItems,
        } = filteredCollections;
        const selection = buildCurrentMediaFocusState(selectableItems, timeMs);
        const nearestMarkerIndex = resolveNearestMediaIndex(selectableItems, timeMs);
        const selectedMarkerId = nearestMarkerIndex >= 0
            ? selectableItems[nearestMarkerIndex]?.id || ""
            : "";
        ensurePlayableDurationProbe(selection.activeItem);
        syncPlaybackModeTransition(selection.activeItem, timeMs);
        syncFrameScrubPreview(selection.activeItem, timeMs);
        syncActivePlayingMediaRate();
        const activePlaybackItem = findCurrentManifestItemById(mediaPlaybackState.itemId);
        const frameScrubPreviewActive = isFrameScrubMode() === true
            && getAnimationRunning() === true
            && activePlaybackItem?.kind === "videoClip";
        if (!frameScrubPreviewActive) {
            syncActivePlayableMediaToMissionTime(activePlaybackItem, timeMs);
        }
        const backgroundItems = Array.isArray(manifest?.mediaItems)
            ? manifest.mediaItems
            : [];
        backgroundPanelActions.render({
            items: backgroundItems,
            timeMs,
            animationRunning: getAnimationRunning() === true,
            foregroundMediaState: buildForegroundMediaState(),
        });

        applyTimelineMediaMarkers(getTimelineMediaMarkers({
            items: selectableItems,
            selectedId: selectedMarkerId,
            timeMs,
            rangeStartMs: timelineStartMs,
            rangeEndMs: timelineEndMs,
        }));

        renderPanelIfChanged({
            manifest,
            filteredCollections: {
                ...filteredCollections,
                filteredItems,
                filteredAudioItems,
                filteredSelectableItems,
                selectableItems,
            },
            selection,
            timeMs,
            missionElapsedStartTimeMs,
        });
    }

    function dispose() {
        releaseTimelineEventBinding();
        releaseAnimationPlayStateBinding();
        releaseDurationProbe();
        stopPlayableMedia({ pauseClock: isMediaPlaybackBusy() });
        backgroundPanelActions.render({
            items: [],
            timeMs: Number(lastRenderContext?.animTime),
            animationRunning: false,
            foregroundMediaState: buildForegroundMediaState(),
        });
        applyTimelineMediaMarkers([]);
    }

    return {
        update,
        dispose,
    };
}

export {
    createMediaTimelineCoordination,
};
