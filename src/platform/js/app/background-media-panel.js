import {
    registerMissionPanel,
    updateMissionPanel,
} from "./panel-registry.js";
import {
    readMissionPanelState,
    writeMissionPanelState,
} from "./panel-layout-store.js";
import {
    getMissionPanelDefaultState,
    isMissionPanelEnabled,
} from "./panel-defaults.js";
import {
    getDockviewSpikeLayoutHost,
    resolveDockedWorkflowPanelPosition,
} from "./dockview-workflow-panels.js";
import { bringPanelElementToFront } from "./panel-z-order.js";
import {
    formatDateTimeLocal,
    formatDateTimeUTC,
    formatDuration,
} from "../utils/time-utils.js";
import { buildMediaStreamSyncPlan } from "../core/domain/media-stream-sync.js";
import {
    findTranscriptSegmentForHighlight,
    findTranscriptSegmentAtTime,
    formatTranscriptSegmentCaption,
    normalizeTranscriptDocument,
} from "../core/domain/media-transcript.js";

const BACKGROUND_MEDIA_PANEL_ID = "workflow:background-media";
const BACKGROUND_MEDIA_LAYOUT_PRESET_VERSION = "background-media-v10-transcript-panel";
const PANEL_EDGE_MARGIN_PX = 8;
const PANEL_TRANSPORT_CLEARANCE_PX = 14;
const PANEL_STACK_LEFT_PX = 32;
const PANEL_STACK_TOP_FALLBACK_PX = 36;
const PANEL_STACK_GAP_PX = 8;
const DEFAULT_PANEL_WIDTH_PX = 546;
const DEFAULT_PANEL_HEADER_HEIGHT_PX = 31;
const DEFAULT_PANEL_CONTROLS_HEIGHT_PX = 46;
const DEFAULT_TRANSCRIPT_PANEL_HEIGHT_PX = 176;
const DEFAULT_MEDIA_PANEL_HEIGHT_RESERVE_PX = 260;
const MIN_PANEL_WIDTH_PX = 300;
const MIN_PANEL_HEIGHT_PX = 360;
const PANEL_RESIZE_HIT_PX = 28;
const MAX_PLAYBACK_RATE = 4;
const SEEK_SYNC_EPSILON_SECONDS = 0.35;
const TRANSPORT_SEEK_SYNC_EPSILON_SECONDS = 3;
const STREAM_HARD_SEEK_THRESHOLD_SECONDS = 6;
const STREAM_SOFT_CORRECTION_THRESHOLD_SECONDS = 0.75;
const BACKGROUND_STATUS_TOAST_DURATION_MS = 3200;
const HLS_FRAME_PREVIEW_LOAD_BUCKET_SECONDS = 4;
const MEDIA_PLAY_SYMBOL = "▶";
const MEDIA_PAUSE_SYMBOL = "⏸";

let hlsLibraryPromise = null;
const backgroundCandidatesCache = new WeakMap();
const nodeAttributeCache = new WeakMap();
const nodeClassToggleCache = new WeakMap();
const captionCueCache = new Map();
const transcriptDocumentCache = new Map();

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getDocumentRef() {
    return globalThis.document || null;
}

function getWindowRef() {
    return globalThis.window || null;
}

function getNode(id) {
    return getDocumentRef()?.getElementById?.(id) || null;
}

function callMediaMethod(mediaElement, methodName) {
    try {
        return mediaElement?.[methodName]?.();
    } catch {
        return null;
    }
}

function setText(id, text) {
    const node = getNode(id);
    if (node && node.textContent !== text) node.textContent = text;
}

function setHidden(id, hidden) {
    const node = getNode(id);
    const nextHidden = hidden === true;
    if (node && node.hidden !== nextHidden) node.hidden = nextHidden;
}

function setNodeText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
}

function setNodeHidden(node, hidden) {
    const nextHidden = hidden === true;
    if (node && node.hidden !== nextHidden) node.hidden = nextHidden;
}

function setNodeTitle(node, title) {
    if (node && node.title !== title) node.title = title;
}

function getCachedNodeAttributes(node) {
    if (!node) return null;
    let attributes = nodeAttributeCache.get(node);
    if (!attributes) {
        attributes = new Map();
        nodeAttributeCache.set(node, attributes);
    }
    return attributes;
}

function setNodeAttribute(node, name, value) {
    if (!node || typeof node.setAttribute !== "function") return;
    const nextValue = String(value);
    const currentValue = typeof node.getAttribute === "function"
        ? node.getAttribute(name)
        : getCachedNodeAttributes(node)?.get(name);
    if (currentValue === nextValue) return;
    node.setAttribute(name, nextValue);
    getCachedNodeAttributes(node)?.set(name, nextValue);
}

function setDatasetValue(node, name, value) {
    if (!node?.dataset) return;
    const nextValue = String(value);
    if (node.dataset[name] !== nextValue) {
        node.dataset[name] = nextValue;
    }
}

function setClassToggled(node, className, enabled) {
    if (!node?.classList?.toggle) return;
    const nextEnabled = enabled === true;
    let classStates = nodeClassToggleCache.get(node);
    if (!classStates) {
        classStates = new Map();
        nodeClassToggleCache.set(node, classStates);
    }
    const actualEnabled = typeof node.classList.contains === "function"
        ? node.classList.contains(className)
        : null;
    if (actualEnabled === nextEnabled) {
        classStates.set(className, nextEnabled);
        return;
    }
    if (actualEnabled == null && classStates.get(className) === nextEnabled) return;
    node.classList.toggle(className, nextEnabled);
    classStates.set(className, nextEnabled);
}

function syncTimeOverlay(
    seconds = Number.NaN,
    hidden = false,
    missionTimeMs = Number.NaN,
    missionStartTimeMs = Number.NaN,
) {
    const overlay = getNode("background-media-time-overlay");
    if (!overlay) return;
    const safeSeconds = Number(seconds);
    const hasTime = Number.isFinite(safeSeconds) && safeSeconds >= 0;
    setNodeHidden(overlay, hidden === true || !hasTime);
    if (!hasTime) return;
    const label = formatStatusTime(safeSeconds);
    const metLabel = formatShortMissionElapsedTime(missionTimeMs, missionStartTimeMs);
    const combinedLabel = `${label}\n${metLabel}`;
    setNodeText(overlay, combinedLabel);
    setNodeTitle(overlay, `Broadcast time ${label}; ${metLabel}`);
}

function parseVttTimestamp(value = "") {
    const match = String(value || "").trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/);
    if (!match) return Number.NaN;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const milliseconds = Number(match[4]);
    if (![hours, minutes, seconds, milliseconds].every(Number.isFinite)) return Number.NaN;
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function decodeCaptionText(value = "") {
    return String(value || "")
        .replace(/<[^>]+>/g, "")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&")
        .replace(/\s+/g, " ")
        .trim();
}

function parseWebVttCues(value = "") {
    return String(value || "")
        .replace(/^\uFEFF/u, "")
        .split(/\r?\n\r?\n/u)
        .map((block) => block.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean))
        .map((lines) => {
            const timingIndex = lines.findIndex((line) => line.includes("-->"));
            if (timingIndex < 0) return null;
            const [startText, endAndSettings] = lines[timingIndex].split("-->");
            const endText = String(endAndSettings || "").trim().split(/\s+/u)[0];
            const startSeconds = parseVttTimestamp(startText);
            const endSeconds = parseVttTimestamp(endText);
            const text = decodeCaptionText(lines.slice(timingIndex + 1).join(" "));
            if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds || !text) {
                return null;
            }
            return {
                startSeconds,
                endSeconds,
                text,
            };
        })
        .filter(Boolean);
}

function getDefaultCaptionTrack(item) {
    const tracks = Array.isArray(item?.captionTracks) ? item.captionTracks : [];
    return tracks.find((track) => track?.default === true) || tracks[0] || null;
}

function findCaptionCue(cues, seconds) {
    const safeSeconds = Number(seconds);
    if (!Array.isArray(cues) || !Number.isFinite(safeSeconds)) return null;
    return cues.find((cue) => safeSeconds >= cue.startSeconds && safeSeconds < cue.endSeconds) || null;
}

function setCaptionText(text = "") {
    const node = getNode("background-media-caption-text");
    if (!node) return;
    const normalized = String(text || "").trim();
    setNodeText(node, normalized);
    setNodeHidden(node, !normalized);
}

function getTranscriptSegmentKey(segment) {
    const id = segment?.id;
    if (id != null && String(id).trim()) return String(id);
    return `${Number(segment?.displayStartSeconds ?? segment?.startSeconds) || 0}`;
}

function getTranscriptSegmentStartSeconds(segment) {
    const displayStartSeconds = Number(segment?.displayStartSeconds);
    if (Number.isFinite(displayStartSeconds)) return displayStartSeconds;
    const startSeconds = Number(segment?.startSeconds);
    return Number.isFinite(startSeconds) ? startSeconds : Number.NaN;
}

function getTranscriptSpeakerLabel(segment) {
    return String(segment?.displaySpeaker || segment?.speaker || "Unidentified").trim()
        || "Unidentified";
}

function ensureCaptionCuesLoaded(sourceUrl, onLoaded) {
    const url = String(sourceUrl || "").trim();
    if (!url) return null;
    const cached = captionCueCache.get(url);
    if (cached) return cached;

    const entry = {
        status: "loading",
        cues: [],
    };
    captionCueCache.set(url, entry);
    if (typeof globalThis.fetch !== "function") {
        entry.status = "error";
        return entry;
    }
    const request = globalThis.fetch(url);
    if (!request || typeof request.then !== "function") {
        entry.status = "error";
        captionCueCache.delete(url);
        return entry;
    }
    request
        .then((response) => (response?.ok === true ? response.text() : ""))
        .then((text) => {
            entry.cues = parseWebVttCues(text);
            entry.status = "ready";
            if (typeof onLoaded === "function") onLoaded();
        })
        .catch(() => {
            entry.status = "error";
            captionCueCache.delete(url);
        });
    return entry;
}

function ensureTranscriptDocumentLoaded(sourceUrl, onLoaded) {
    const url = String(sourceUrl || "").trim();
    if (!url) return null;
    const cached = transcriptDocumentCache.get(url);
    if (cached) return cached;

    const entry = {
        status: "loading",
        document: normalizeTranscriptDocument(null),
    };
    transcriptDocumentCache.set(url, entry);
    if (typeof globalThis.fetch !== "function") {
        entry.status = "error";
        return entry;
    }
    const request = globalThis.fetch(url);
    if (!request || typeof request.then !== "function") {
        entry.status = "error";
        transcriptDocumentCache.delete(url);
        return entry;
    }
    request
        .then((response) => (response?.ok === true ? response.json() : null))
        .then((data) => {
            entry.document = normalizeTranscriptDocument(data);
            entry.status = "ready";
            if (typeof onLoaded === "function") onLoaded();
        })
        .catch(() => {
            entry.status = "error";
            transcriptDocumentCache.delete(url);
        });
    return entry;
}

function removeCaptionTrackNodes(video) {
    const existingTracks = Array.from(
        video?.querySelectorAll?.('track[data-background-media-caption-track="true"]') || [],
    );
    existingTracks.forEach((track) => {
        if (typeof track.remove === "function") {
            track.remove();
        } else if (track.parentNode && typeof track.parentNode.removeChild === "function") {
            track.parentNode.removeChild(track);
        }
    });
}

function getCaptionTrackAttribution(item) {
    const tracks = Array.isArray(item?.captionTracks) ? item.captionTracks : [];
    return tracks.map((track) => String(track?.attribution || "").trim()).find(Boolean) || "";
}

function syncCaptionAttribution(item = null, captionsEnabled = true) {
    const attribution = String(item?.transcriptDoc?.attribution || "").trim()
        || getCaptionTrackAttribution(item);
    const overlay = getNode("background-media-caption-attribution");
    if (overlay) {
        setNodeText(overlay, "");
        setNodeHidden(overlay, true);
    }
    const note = getNode("background-media-transcript-note");
    if (!note) return;
    setNodeText(note, attribution);
    setNodeHidden(note, captionsEnabled !== true || !attribution);
}

function syncRenderedTranscriptCaption(item, offsetSeconds, onLoaded) {
    const sourceUrl = String(item?.transcriptDoc?.sourceUrl || "").trim();
    if (!sourceUrl) return false;
    const entry = ensureTranscriptDocumentLoaded(sourceUrl, onLoaded);
    if (entry?.status !== "ready") return false;
    const segment = findTranscriptSegmentAtTime(entry.document?.segments, offsetSeconds);
    setCaptionText(formatTranscriptSegmentCaption(segment));
    return true;
}

function syncRenderedCaption(item, offsetSeconds, onLoaded, captionsEnabled = true) {
    if (captionsEnabled !== true) {
        setCaptionText("");
        return;
    }
    if (syncRenderedTranscriptCaption(item, offsetSeconds, onLoaded)) {
        return;
    }
    const track = getDefaultCaptionTrack(item);
    if (!track?.sourceUrl) {
        setCaptionText("");
        return;
    }
    const entry = ensureCaptionCuesLoaded(track.sourceUrl, onLoaded);
    if (entry?.status !== "ready") {
        setCaptionText("");
        return;
    }
    setCaptionText(findCaptionCue(entry.cues, offsetSeconds)?.text || "");
}

function syncVideoCaptionTracks(video, item, captionsEnabled = true) {
    if (!video) return;
    removeCaptionTrackNodes(video);
    const tracks = Array.isArray(item?.captionTracks) ? item.captionTracks : [];
    if (tracks.length === 0) {
        syncCaptionAttribution(null, captionsEnabled);
        return;
    }

    // The app renders captions itself so it can include speaker labels and match the panel layout.
    // Avoid attaching native <track> nodes, otherwise browsers render a second subtitle layer.
    syncCaptionAttribution(item, captionsEnabled);
}

function isLikelyHlsSource(url = "", sourceType = "") {
    const normalizedSourceType = String(sourceType || "").trim().toLowerCase();
    const normalizedUrl = String(url || "").trim().toLowerCase();
    return normalizedSourceType === "hls" || normalizedUrl.includes(".m3u8");
}

function canPlayHlsNatively(video) {
    if (typeof video?.canPlayType !== "function") return false;
    return Boolean(
        video.canPlayType("application/vnd.apple.mpegurl")
            || video.canPlayType("application/x-mpegURL"),
    );
}

function loadHlsLibrary() {
    if (!hlsLibraryPromise) {
        hlsLibraryPromise = import("hls.js")
            .then((module) => module.default || module.Hls || module)
            .catch(() => null);
    }
    return hlsLibraryPromise;
}

function isBackgroundVideoItem(item) {
    if (!item || item.kind !== "videoClip" || item.enabled === false) return false;
    if (!item.assetUrl) return false;
    const roles = Array.isArray(item.playbackRoles) ? item.playbackRoles : [];
    return roles.includes("background") || item.backgroundPlayback?.enabled === true;
}

function resolveVideoSourceType(item) {
    const sourceType = String(item?.sourceType || item?.streamSourceType || "").trim().toLowerCase();
    if (sourceType === "hls") return "hls";
    const assetUrl = String(item?.assetUrl || "").trim();
    return /\.m3u8(?:$|[?#])/i.test(assetUrl) ? "hls" : "mp4";
}

function resolveBackgroundCandidates(items = []) {
    if (!Array.isArray(items)) return [];
    const cached = backgroundCandidatesCache.get(items);
    if (cached) return cached;
    const candidates = items
        .filter(isBackgroundVideoItem)
        .sort((a, b) => {
            const priorityA = Number(a.backgroundPlayback?.priority) || 0;
            const priorityB = Number(b.backgroundPlayback?.priority) || 0;
            if (priorityA !== priorityB) return priorityB - priorityA;
            return Number(a.startTimeMs) - Number(b.startTimeMs);
        });
    backgroundCandidatesCache.set(items, candidates);
    return candidates;
}

function isItemActiveAtTime(item, timeMs) {
    const startTimeMs = Number(item?.startTimeMs);
    const endTimeMs = Number(item?.endTimeMs);
    const missionTimeMs = Number(timeMs);
    if (!Number.isFinite(startTimeMs) || !Number.isFinite(missionTimeMs)) return false;
    if (missionTimeMs < startTimeMs) return false;
    if (Number.isFinite(endTimeMs) && endTimeMs >= startTimeMs) {
        return missionTimeMs <= endTimeMs;
    }
    const durationSeconds = Number(item?.durationSeconds);
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        return missionTimeMs <= startTimeMs + durationSeconds * 1000;
    }
    return true;
}

function resolveActiveBackgroundItem(items, timeMs) {
    return resolveActiveBackgroundCandidate(resolveBackgroundCandidates(items), timeMs);
}

function resolveActiveBackgroundCandidate(candidates, timeMs) {
    return (Array.isArray(candidates) ? candidates : [])
        .find((item) => isItemActiveAtTime(item, timeMs)) || null;
}

function resolveBackgroundPlaybackMode({
    panelState = "closed",
    playbackEnabled = false,
    animationRunning = false,
    foregroundMediaActive = false,
    foregroundMediaKind = "",
} = {}) {
    if (panelState !== "open" || playbackEnabled !== true) {
        return "ready";
    }
    if (animationRunning !== true) {
        return "ready";
    }
    if (foregroundMediaActive === true) {
        if (foregroundMediaKind === "videoClip") {
            return "paused-for-foreground-video";
        }
        return "muted-for-foreground";
    }
    return "playing";
}

function shouldUseBackgroundTransportPlayback({
    animationRealtime = true,
    animationSpeedMultiplier = 1,
} = {}) {
    if (animationRealtime === true) return true;
    const multiplier = Number(animationSpeedMultiplier);
    return Number.isFinite(multiplier) && multiplier > 0 && multiplier <= MAX_PLAYBACK_RATE;
}

function resolveBackgroundPlaybackButtonState({
    playbackEnabled = false,
    animationRunning = false,
} = {}) {
    if (playbackEnabled === true && animationRunning === true) {
        return {
            label: MEDIA_PAUSE_SYMBOL,
            title: "Pause the broadcast video",
            pressed: true,
        };
    }
    if (playbackEnabled === true) {
        return {
            label: MEDIA_PLAY_SYMBOL,
            title: "Resume the broadcast video at the current mission time",
            pressed: true,
        };
    }
    return {
        label: MEDIA_PLAY_SYMBOL,
        title: "Play the broadcast video at the current mission time",
        pressed: false,
    };
}

function resolveNearestInactiveBackgroundItem(items, timeMs) {
    return resolveNearestInactiveBackgroundCandidate(resolveBackgroundCandidates(items), timeMs);
}

function resolveNearestInactiveBackgroundCandidate(candidates, timeMs) {
    const missionTimeMs = Number(timeMs);
    if (!Number.isFinite(missionTimeMs)) return null;
    const nextItems = (Array.isArray(candidates) ? candidates : [])
        .filter((item) => Number(item.startTimeMs) > missionTimeMs)
        .sort((a, b) => Number(a.startTimeMs) - Number(b.startTimeMs));
    if (nextItems.length > 0) {
        return {
            item: nextItems[0],
            relation: "before",
            deltaMs: Number(nextItems[0].startTimeMs) - missionTimeMs,
        };
    }
    const previousItems = (Array.isArray(candidates) ? candidates : [])
        .filter((item) => {
            const endTimeMs = resolveItemEndTimeMs(item);
            return Number.isFinite(endTimeMs) && endTimeMs < missionTimeMs;
        })
        .sort((a, b) => Number(resolveItemEndTimeMs(b)) - Number(resolveItemEndTimeMs(a)));
    if (previousItems.length > 0) {
        const item = previousItems[0];
        return {
            item,
            relation: "after",
            deltaMs: missionTimeMs - resolveItemEndTimeMs(item),
        };
    }
    return null;
}

function resolveItemEndTimeMs(item) {
    const startTimeMs = Number(item?.startTimeMs);
    const endTimeMs = Number(item?.endTimeMs);
    if (Number.isFinite(endTimeMs) && endTimeMs >= startTimeMs) return endTimeMs;
    const durationSeconds = Number(item?.durationSeconds);
    if (Number.isFinite(startTimeMs) && Number.isFinite(durationSeconds) && durationSeconds > 0) {
        return startTimeMs + durationSeconds * 1000;
    }
    return Number.NaN;
}

function resolvePlaybackOffsetSeconds(item, timeMs) {
    const startTimeMs = Number(item?.startTimeMs);
    const missionTimeMs = Number(timeMs);
    if (!Number.isFinite(startTimeMs) || !Number.isFinite(missionTimeMs)) return 0;
    const timeOffsetSeconds = Number(item?.timeOffsetSeconds);
    const rawSeconds = Math.max(
        0,
        ((missionTimeMs - startTimeMs) / 1000)
            + (Number.isFinite(timeOffsetSeconds) ? timeOffsetSeconds : 0),
    );
    const durationSeconds = Number(item?.durationSeconds);
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        return clamp(rawSeconds, 0, durationSeconds);
    }
    return rawSeconds;
}

function pad(value, length = 2) {
    return String(Math.max(0, Math.floor(value))).padStart(length, "0");
}

function formatMissionElapsedTime(timeMs, missionStartTimeMs) {
    const targetMs = Number(timeMs);
    const startMs = Number(missionStartTimeMs);
    if (!Number.isFinite(targetMs) || !Number.isFinite(startMs)) return "MET --";
    const elapsedMs = targetMs - startMs;
    const sign = elapsedMs < 0 ? "-" : "+";
    const absoluteSeconds = Math.floor(Math.abs(elapsedMs) / 1000);
    const days = Math.floor(absoluteSeconds / 86400);
    const hours = Math.floor((absoluteSeconds % 86400) / 3600);
    const minutes = Math.floor((absoluteSeconds % 3600) / 60);
    const seconds = absoluteSeconds % 60;
    return `MET ${sign}${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function formatVideoRangeInfo(item, missionStartTimeMs) {
    const startTimeMs = Number(item?.startTimeMs);
    const endTimeMs = resolveItemEndTimeMs(item);
    if (!Number.isFinite(startTimeMs) || !Number.isFinite(endTimeMs)) {
        return [];
    }
    return [
        `Local: ${formatDateTimeLocal(startTimeMs)} to ${formatDateTimeLocal(endTimeMs)}`,
        `MET: ${formatMissionElapsedTime(startTimeMs, missionStartTimeMs)} to ${formatMissionElapsedTime(endTimeMs, missionStartTimeMs)}`,
        `UTC: ${formatDateTimeUTC(startTimeMs)} to ${formatDateTimeUTC(endTimeMs)}`,
    ];
}

function formatCompactLocalTime(timeMs) {
    const date = new Date(Number(timeMs));
    return date.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatCompactUtcTime(timeMs) {
    const date = new Date(Number(timeMs));
    return date.toLocaleString("en-GB", {
        timeZone: "UTC",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatShortMissionElapsedTime(timeMs, missionStartTimeMs) {
    const targetMs = Number(timeMs);
    const startMs = Number(missionStartTimeMs);
    if (!Number.isFinite(targetMs) || !Number.isFinite(startMs)) return "MET --";
    const elapsedMs = targetMs - startMs;
    const sign = elapsedMs < 0 ? "-" : "+";
    const absoluteMinutes = Math.floor(Math.abs(elapsedMs) / 60000);
    const days = Math.floor(absoluteMinutes / 1440);
    const hours = Math.floor((absoluteMinutes % 1440) / 60);
    const minutes = absoluteMinutes % 60;
    return `MET ${sign}${days}d ${pad(hours)}h ${pad(minutes)}m`;
}

function formatBroadcastTimingNotes(item, missionStartTimeMs) {
    const startTimeMs = Number(item?.startTimeMs);
    const endTimeMs = resolveItemEndTimeMs(item);
    if (!Number.isFinite(startTimeMs) || !Number.isFinite(endTimeMs)) {
        return [];
    }
    return [
        `Runs ${formatCompactLocalTime(startTimeMs)} to ${formatCompactLocalTime(endTimeMs)} local.`,
        `${formatShortMissionElapsedTime(startTimeMs, missionStartTimeMs)} to ${formatShortMissionElapsedTime(endTimeMs, missionStartTimeMs)}; UTC ${formatCompactUtcTime(startTimeMs)} to ${formatCompactUtcTime(endTimeMs)}.`,
    ];
}

function formatRangeDelta(deltaMs) {
    return formatDuration(deltaMs, {
        compact: true,
        includeSeconds: true,
    });
}

function formatStatusTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getDefaultPanelRect() {
    const stackTop = getWorkflowPanelStackTopPx();
    const maxWidth = Math.max(
        MIN_PANEL_WIDTH_PX,
        (getWindowRef()?.innerWidth || 1024) - PANEL_STACK_LEFT_PX - PANEL_EDGE_MARGIN_PX,
    );
    let width = Math.min(DEFAULT_PANEL_WIDTH_PX, maxWidth);
    const timelineSafeBottom = getTimelineSafeBottomPx();
    const availableHeight = Math.max(
        MIN_PANEL_HEIGHT_PX,
        timelineSafeBottom
            - stackTop
            - PANEL_STACK_GAP_PX
            - DEFAULT_MEDIA_PANEL_HEIGHT_RESERVE_PX,
    );
    if (getDefaultPanelHeightForWidth(width) > availableHeight) {
        const fixedPanelHeight = DEFAULT_PANEL_HEADER_HEIGHT_PX
            + DEFAULT_TRANSCRIPT_PANEL_HEIGHT_PX
            + DEFAULT_PANEL_CONTROLS_HEIGHT_PX;
        const widthForAvailableHeight = Math.floor(
            Math.max(0, availableHeight - fixedPanelHeight) * 16 / 9,
        );
        width = clamp(widthForAvailableHeight, MIN_PANEL_WIDTH_PX, width);
    }
    const height = getDefaultPanelHeightForWidth(width);
    return {
        left: PANEL_STACK_LEFT_PX,
        top: stackTop,
        width,
        height,
    };
}

function getDefaultPanelHeightForWidth(width) {
    const stageHeight = Math.round((Number(width) || DEFAULT_PANEL_WIDTH_PX) * 9 / 16);
    return Math.max(
        MIN_PANEL_HEIGHT_PX,
        DEFAULT_PANEL_HEADER_HEIGHT_PX
            + stageHeight
            + DEFAULT_TRANSCRIPT_PANEL_HEIGHT_PX
            + DEFAULT_PANEL_CONTROLS_HEIGHT_PX,
    );
}

function getVisibleElementBottomPx(selector) {
    const node = getDocumentRef()?.querySelector?.(selector) || null;
    if (!node || node.hidden === true) return Number.NaN;
    const style = getWindowRef()?.getComputedStyle?.(node) || null;
    if (style?.display === "none" || style?.visibility === "hidden") return Number.NaN;
    const rect = node.getBoundingClientRect?.() || null;
    const bottom = Number(rect?.bottom);
    return Number.isFinite(bottom) && bottom > 0 ? bottom : Number.NaN;
}

function getWorkflowPanelStackTopPx() {
    const headerBottom = [
        getVisibleElementBottomPx(".header"),
        getVisibleElementBottomPx(".mission-floating-collapse-btn"),
    ].filter(Number.isFinite).reduce((max, value) => Math.max(max, value), 0);
    if (Number.isFinite(headerBottom) && headerBottom > 0) {
        return Math.max(
            PANEL_EDGE_MARGIN_PX,
            Math.round(headerBottom + PANEL_EDGE_MARGIN_PX - getPanelWrapperTopPx("background-media-panel-wrapper")),
        );
    }
    return PANEL_STACK_TOP_FALLBACK_PX;
}

function getPanelWrapperTopPx(id) {
    const rect = getDocumentRef()?.getElementById?.(id)?.getBoundingClientRect?.() || null;
    const top = Number(rect?.top);
    return Number.isFinite(top) && top > 0 ? top : 0;
}

function getTimelineSafeBottomPx() {
    const resolveVisibleTop = (selector) => {
        const node = getDocumentRef()?.querySelector?.(selector) || null;
        if (!node || node.hidden === true) return Number.NaN;
        const style = getWindowRef()?.getComputedStyle?.(node) || null;
        if (style?.display === "none" || style?.visibility === "hidden") return Number.NaN;
        const rect = node.getBoundingClientRect?.() || null;
        const top = Number(rect?.top);
        const height = Number(rect?.height);
        return Number.isFinite(top) && Number.isFinite(height) && height > 0 ? top : Number.NaN;
    };
    const controlTop = resolveVisibleTop("#control-panel");
    const timelineTop = resolveVisibleTop(".timeline-dock");
    const boundaryTop = Math.min(
        Number.isFinite(controlTop) ? controlTop : Infinity,
        Number.isFinite(timelineTop) ? timelineTop : Infinity,
    );
    if (Number.isFinite(boundaryTop) && boundaryTop > PANEL_EDGE_MARGIN_PX) {
        return Math.round(
            boundaryTop
            - PANEL_TRANSPORT_CLEARANCE_PX
            - getPanelWrapperTopPx("background-media-panel-wrapper"),
        );
    }
    return (Number(getWindowRef()?.innerHeight) || 768) - PANEL_EDGE_MARGIN_PX;
}

function clampPanelRect(rect = {}) {
    const windowRef = getWindowRef();
    const viewportWidth = Number(windowRef?.innerWidth) || 1024;
    const viewportHeight = Number(windowRef?.innerHeight) || 768;
    const width = clamp(
        Number(rect.width) || DEFAULT_PANEL_WIDTH_PX,
        MIN_PANEL_WIDTH_PX,
        Math.max(MIN_PANEL_WIDTH_PX, viewportWidth - PANEL_EDGE_MARGIN_PX * 2),
    );
    const height = clamp(
        Number(rect.height) || getDefaultPanelHeightForWidth(width),
        MIN_PANEL_HEIGHT_PX,
        Math.max(MIN_PANEL_HEIGHT_PX, viewportHeight - PANEL_EDGE_MARGIN_PX * 2),
    );
    return {
        left: clamp(Number(rect.left) || PANEL_EDGE_MARGIN_PX, PANEL_EDGE_MARGIN_PX, viewportWidth - width - PANEL_EDGE_MARGIN_PX),
        top: clamp(Number(rect.top) || PANEL_EDGE_MARGIN_PX, PANEL_EDGE_MARGIN_PX, viewportHeight - height - PANEL_EDGE_MARGIN_PX),
        width,
        height,
    };
}

function applyPanelRect(panel, rect) {
    const nextRect = clampPanelRect(rect);
    panel.style.left = `${Math.round(nextRect.left)}px`;
    panel.style.top = `${Math.round(nextRect.top)}px`;
    panel.style.width = `${Math.round(nextRect.width)}px`;
    panel.style.height = `${Math.round(nextRect.height)}px`;
    return nextRect;
}

function createBackgroundMediaPanelActions({
    getAnimationRunning = () => false,
    getAnimationSpeedMultiplier = () => 1,
    getAnimationRealtime = () => true,
    getMissionStartTime = () => Number.NaN,
    onJumpToTime = () => {},
    onRequestPlay = () => {},
    onRequestPause = () => {},
    loadHlsLibraryFn = loadHlsLibrary,
} = {}) {
    let missionConfigData = null;
    let panelAvailable = false;
    let panelState = "closed";
    let panelEventsBound = false;
    let playbackEnabled = false;
    let muted = true;
    let captionsEnabled = true;
    let hasStoredMutedPreference = false;
    let expanded = false;
    let activeItemId = "";
    let videoSourceUrl = "";
    let hlsInstance = null;
    let hlsSourceUrl = "";
    let hlsReadySourceUrl = "";
    let hlsAttachToken = 0;
    let hlsUnsupportedSourceUrl = "";
    let animationPlayStateEventBound = false;
    let backgroundStatusToastTimerId = null;
    let lastForegroundEffect = "";
    let playRequestPending = false;
    let lastVideoCurrentTimeWriteSeconds = Number.NaN;
    let lastVideoCurrentTimeWriteSourceUrl = "";
    let lastFramePreviewHlsLoadSourceUrl = "";
    let lastFramePreviewHlsLoadBucket = Number.NaN;
    let panelResizeDragState = null;
    let storedLayoutMatchesPreset = false;
    let panelLayoutApplied = false;
    let dragState = null;
    let effectiveAudioMuted = true;
    let mutedForForegroundMedia = false;
    let playbackTimelineRunning = false;
    let lastPlaybackMode = "";
    let lastAppliedPlaybackRate = Number.NaN;
    let lastRenderModel = {
        items: [],
        timeMs: Number.NaN,
        animationRunning: false,
    };
    let transcriptRenderSourceUrl = "";
    let transcriptRowsByKey = new Map();
    let activeTranscriptRow = null;
    let activeTranscriptSegmentKey = "";
    let transcriptSeekItem = null;
    let timelineSeekItem = null;

    function requestWorkflowStackLayout() {
        const documentRef = getDocumentRef();
        if (!documentRef?.dispatchEvent || typeof CustomEvent !== "function") return;
        documentRef.dispatchEvent(new CustomEvent("moon-mission:workflow-panel-stack-layout"));
    }

    function getPanel() {
        return getNode("background-media-panel");
    }

    function getWrapper() {
        return getNode("background-media-panel-wrapper");
    }

    function isDockviewBackgroundMediaPanelEnabled() {
        return !!getDockviewSpikeLayoutHost();
    }

    function isBackgroundMediaPanelDocked(panel = getPanel()) {
        return !!panel?.classList?.contains?.("background-media-panel--dockview");
    }

    function ensureBackgroundMediaPanelDocked(panel = getPanel()) {
        if (!panel) return false;
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        if (layoutHost.focusPanel(BACKGROUND_MEDIA_PANEL_ID)) {
            return true;
        }
        layoutHost.addPanel({
            id: BACKGROUND_MEDIA_PANEL_ID,
            component: "mounted-element",
            title: "Flyby Broadcast",
            position: resolveDockedWorkflowPanelPosition(layoutHost, BACKGROUND_MEDIA_PANEL_ID),
            params: {
                mountElementId: "background-media-panel",
                mountClassName: "background-media-panel--dockview",
                fallbackParentId: "background-media-panel-wrapper",
            },
            initialWidth: 300,
            minimumWidth: 260,
            minimumHeight: 160,
        });
        layoutHost.focusPanel(BACKGROUND_MEDIA_PANEL_ID);
        return true;
    }

    function closeDockedBackgroundMediaPanel() {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        return layoutHost.closePanel(BACKGROUND_MEDIA_PANEL_ID);
    }

    function getVideo() {
        return getNode("background-media-video");
    }

    function getTranscriptPanel() {
        return getNode("background-media-transcript");
    }

    function getTranscriptList() {
        return getNode("background-media-transcript-list");
    }

    function getTranscriptStatus() {
        return getNode("background-media-transcript-status");
    }

    function persistState(patch = {}) {
        writeMissionPanelState(BACKGROUND_MEDIA_PANEL_ID, {
            state: panelState,
            playbackEnabled,
            muted,
            captionsEnabled,
            mutedPreferenceSet: hasStoredMutedPreference === true,
            expanded,
            layoutPresetVersion: BACKGROUND_MEDIA_LAYOUT_PRESET_VERSION,
            ...patch,
        });
    }

    function showBackgroundStatusToast(message) {
        const status = getNode("background-video-status");
        const text = getNode("background-video-status-text");
        if (!status || !text) return;
        setNodeText(text, String(message || "").trim() || "Background video updated");
        setNodeHidden(status, false);
        setDatasetValue(status, "status", "done");
        setClassToggled(status, "background-video-status--hidden", false);
        if (backgroundStatusToastTimerId != null) {
            getWindowRef()?.clearTimeout?.(backgroundStatusToastTimerId);
            backgroundStatusToastTimerId = null;
        }
        backgroundStatusToastTimerId = getWindowRef()?.setTimeout?.(() => {
            setClassToggled(status, "background-video-status--hidden", true);
            setNodeHidden(status, true);
            backgroundStatusToastTimerId = null;
        }, BACKGROUND_STATUS_TOAST_DURATION_MS) ?? null;
    }

    function getPanelRegistryState() {
        if (!panelAvailable) return "closed";
        return panelState;
    }

    function syncPanelRegistry() {
        const panelStateName = getPanelRegistryState();
        updateMissionPanel(BACKGROUND_MEDIA_PANEL_ID, {
            available: panelAvailable,
            state: panelStateName,
            actions: {
                open: panelAvailable ? openPanel : null,
                restore: panelAvailable ? openPanel : null,
                focus: panelAvailable ? focusPanel : null,
                close: panelAvailable ? closePanel : null,
                delete: panelAvailable && panelStateName !== "deleted" ? confirmDeletePanel : null,
            },
        });
    }

    function destroyHlsInstance() {
        if (!hlsInstance) return;
        try {
            hlsInstance.destroy?.();
        } catch {
            // hls.js can throw while tearing down a partial stream attachment.
        }
        hlsInstance = null;
        hlsSourceUrl = "";
        hlsReadySourceUrl = "";
        lastFramePreviewHlsLoadSourceUrl = "";
        lastFramePreviewHlsLoadBucket = Number.NaN;
    }

    function clearVideoSource() {
        const video = getVideo();
        const hadSource = Boolean(
            activeItemId
            || videoSourceUrl
            || hlsInstance
            || video?.getAttribute?.("src")
            || video?.currentSrc,
        );
        if (!hadSource) {
            playRequestPending = false;
            return;
        }
        hlsAttachToken += 1;
        destroyHlsInstance();
        hlsUnsupportedSourceUrl = "";
        activeItemId = "";
        videoSourceUrl = "";
        setCaptionText("");
        if (video) {
            callMediaMethod(video, "pause");
            removeCaptionTrackNodes(video);
            video.removeAttribute?.("src");
            video.removeAttribute?.("poster");
            callMediaMethod(video, "load");
            if (video.dataset) {
                setDatasetValue(video, "mediaItemId", "");
                setDatasetValue(video, "mediaSourceUrl", "");
                setDatasetValue(video, "sourceType", "");
            }
        }
        playRequestPending = false;
        lastAppliedPlaybackRate = Number.NaN;
        lastVideoCurrentTimeWriteSeconds = Number.NaN;
        lastVideoCurrentTimeWriteSourceUrl = "";
        syncCaptionAttribution(null, captionsEnabled);
    }

    function setNativeVideoSource(video, item, sourceUrl) {
        destroyHlsInstance();
        hlsUnsupportedSourceUrl = "";
        hlsReadySourceUrl = isLikelyHlsSource(sourceUrl, resolveVideoSourceType(item)) ? sourceUrl : "";
        if (videoSourceUrl !== sourceUrl || video.getAttribute?.("src") !== sourceUrl) {
            videoSourceUrl = sourceUrl;
            video.src = sourceUrl;
            callMediaMethod(video, "load");
            lastVideoCurrentTimeWriteSeconds = Number.NaN;
            lastVideoCurrentTimeWriteSourceUrl = sourceUrl;
        }
        if (item.posterAssetUrl) {
            video.poster = item.posterAssetUrl;
        }
    }

    function attachHlsVideoSource(video, item, sourceUrl) {
        if (hlsUnsupportedSourceUrl === sourceUrl) return;
        if (hlsInstance && hlsSourceUrl === sourceUrl && videoSourceUrl === sourceUrl) return;
        hlsAttachToken += 1;
        const attachToken = hlsAttachToken;
        destroyHlsInstance();
        videoSourceUrl = sourceUrl;
        lastVideoCurrentTimeWriteSeconds = Number.NaN;
        lastVideoCurrentTimeWriteSourceUrl = sourceUrl;
        hlsReadySourceUrl = "";
        video.removeAttribute?.("src");
        if (item.posterAssetUrl) {
            video.poster = item.posterAssetUrl;
        }
        callMediaMethod(video, "load");

        loadHlsLibraryFn().then((Hls) => {
            if (attachToken !== hlsAttachToken || videoSourceUrl !== sourceUrl) return;
            if (!Hls || typeof Hls.isSupported !== "function" || !Hls.isSupported()) {
                if (canPlayHlsNatively(video)) {
                    setNativeVideoSource(video, item, sourceUrl);
                    return;
                }
                hlsUnsupportedSourceUrl = sourceUrl;
                setText("background-media-status", "HLS unavailable");
                return;
            }

            const instance = new Hls({
                autoStartLoad: false,
                enableWorker: true,
                lowLatencyMode: false,
            });
            hlsInstance = instance;
            hlsSourceUrl = sourceUrl;
            if (getWindowRef()?.__moonMissionDebugHls === true) {
                Object.values(Hls.Events || {}).forEach((eventName) => {
                    instance.on(eventName, (_event, data) => {
                        getWindowRef()?.console?.debug?.("background-hls", eventName, data || {});
                    });
                });
            }
            instance.on(Hls.Events.MEDIA_ATTACHED, () => {
                if (attachToken !== hlsAttachToken || hlsInstance !== instance) return;
                instance.loadSource(sourceUrl);
            });
            const retryRender = () => {
                if (attachToken !== hlsAttachToken || hlsInstance !== instance) return;
                hlsReadySourceUrl = sourceUrl;
                playRequestPending = false;
                render(lastRenderModel);
            };
            instance.on(Hls.Events.MANIFEST_PARSED, retryRender);
            instance.on(Hls.Events.LEVEL_LOADED, retryRender);
            instance.on(Hls.Events.ERROR, (_event, data = {}) => {
                if (hlsInstance !== instance || data.fatal !== true) return;
                if (data.details === "manifestIncompatibleCodecsError") {
                    destroyHlsInstance();
                    setText("background-media-status", "Video codec unsupported");
                    return;
                }
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    instance.startLoad();
                    return;
                }
                if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    instance.recoverMediaError();
                    return;
                }
                destroyHlsInstance();
                setText("background-media-status", "Playback error");
            });
            instance.attachMedia(video);
        });
    }

    function configureVideoSource(item) {
        const video = getVideo();
        if (!video || !item) return;
        const sourceUrl = item.assetUrl || "";
        if (!sourceUrl) {
            clearVideoSource();
            return;
        }
        activeItemId = item.id;
        if (video.crossOrigin !== "anonymous") video.crossOrigin = "anonymous";
        if (video.muted !== muted) video.muted = muted;
        if (video.loop !== false) video.loop = false;
        video.removeAttribute?.("loop");
        setClassToggled(video, "background-media-panel__video--cover", item.backgroundPlayback?.fit === "cover");
        syncVideoCaptionTracks(video, item, captionsEnabled);
        if (video.dataset) {
            setDatasetValue(video, "mediaItemId", item.id || "");
            setDatasetValue(video, "mediaSourceUrl", sourceUrl);
            setDatasetValue(video, "sourceType", resolveVideoSourceType(item));
        }
        if (isLikelyHlsSource(sourceUrl, resolveVideoSourceType(item))) {
            attachHlsVideoSource(video, item, sourceUrl);
            return;
        }
        setNativeVideoSource(video, item, sourceUrl);
    }

    function pauseVideo({
        stopHlsLoad = true,
    } = {}) {
        const video = getVideo();
        const alreadyPaused = video?.paused === true && playRequestPending !== true;
        if (stopHlsLoad === true) {
            lastFramePreviewHlsLoadSourceUrl = "";
            lastFramePreviewHlsLoadBucket = Number.NaN;
            try {
                hlsInstance?.stopLoad?.();
            } catch {
                // Ignore HLS loader state races during media transitions.
            }
        }
        if (alreadyPaused) return;
        callMediaMethod(video, "pause");
        playRequestPending = false;
    }

    function keepHlsLoadingForFramePreview(offsetSeconds) {
        const video = getVideo();
        if (!isLikelyHlsSource(videoSourceUrl, video?.dataset?.sourceType)) return;
        if (typeof hlsInstance?.startLoad !== "function") return;
        const safeOffsetSeconds = Number.isFinite(offsetSeconds)
            ? Math.max(0, offsetSeconds)
            : (Number(video?.currentTime) || 0);
        const loadBucket = Math.floor(safeOffsetSeconds / HLS_FRAME_PREVIEW_LOAD_BUCKET_SECONDS);
        if (
            lastFramePreviewHlsLoadSourceUrl === videoSourceUrl
            && lastFramePreviewHlsLoadBucket === loadBucket
        ) {
            return;
        }
        try {
            hlsInstance.startLoad(safeOffsetSeconds);
            lastFramePreviewHlsLoadSourceUrl = videoSourceUrl;
            lastFramePreviewHlsLoadBucket = loadBucket;
        } catch {
            // hls.js can reject loader restarts while it is attaching media.
        }
    }

    function playVideo() {
        const video = getVideo();
        if (!video) return false;
        if (video.paused === false) return true;
        if (playRequestPending === true) return false;
        if (isLikelyHlsSource(videoSourceUrl, video?.dataset?.sourceType) && hlsReadySourceUrl !== videoSourceUrl) {
            setText("background-media-status", "Loading broadcast");
            return false;
        }
        try {
            hlsInstance?.startLoad?.(Number(video.currentTime) || 0);
        } catch {
            // hls.js can reject loader restarts while it is attaching media.
        }
        playRequestPending = true;
        const result = callMediaMethod(video, "play");
        if (result && typeof result.catch === "function") {
            Promise.resolve(result).then(() => {
                playRequestPending = false;
            }).catch(() => {
                playRequestPending = false;
                setText("background-media-status", muted ? "Tap play to start" : "Autoplay blocked");
            });
            return true;
        }
        playRequestPending = false;
        return true;
    }

    function setVideoCurrentTime(seconds, {
        transportPlayback = false,
        force = false,
    } = {}) {
        const video = getVideo();
        if (!video || !Number.isFinite(seconds)) return;
        const targetSeconds = Math.max(0, seconds);
        const currentSeconds = Number(video.currentTime);
        const toleranceSeconds = transportPlayback
            ? TRANSPORT_SEEK_SYNC_EPSILON_SECONDS
            : SEEK_SYNC_EPSILON_SECONDS;
        if (
            force !== true
            && Number.isFinite(currentSeconds)
            && Math.abs(currentSeconds - targetSeconds) < toleranceSeconds
        ) {
            return;
        }
        if (
            force !== true
            && !Number.isFinite(currentSeconds)
            && lastVideoCurrentTimeWriteSourceUrl === videoSourceUrl
            && Number.isFinite(lastVideoCurrentTimeWriteSeconds)
            && Math.abs(lastVideoCurrentTimeWriteSeconds - targetSeconds) < toleranceSeconds
        ) {
            return;
        }
        try {
            video.currentTime = targetSeconds;
            lastVideoCurrentTimeWriteSeconds = targetSeconds;
            lastVideoCurrentTimeWriteSourceUrl = videoSourceUrl;
        } catch {
            // Metadata may not be loaded yet; the next update will retry.
        }
    }

    function setVideoPlaybackRate(rate = Number.NaN) {
        const video = getVideo();
        if (!video) return;
        const requestedRate = Number(rate);
        const multiplier = Number.isFinite(requestedRate) && requestedRate > 0
            ? requestedRate
            : (getAnimationRealtime() === true ? 1 : Number(getAnimationSpeedMultiplier()));
        const safeRate = Number.isFinite(multiplier) && multiplier > 0
            ? clamp(multiplier, 0.1, MAX_PLAYBACK_RATE)
            : 1;
        if (Number.isFinite(lastAppliedPlaybackRate) && Math.abs(lastAppliedPlaybackRate - safeRate) < 0.001) {
            return;
        }
        try {
            video.playbackRate = safeRate;
            lastAppliedPlaybackRate = safeRate;
        } catch {
            // Some browsers reject rates for particular media types.
        }
    }

    function syncButtons() {
        const enableButton = getNode("background-media-enable");
        if (enableButton) {
            const buttonState = resolveBackgroundPlaybackButtonState({
                playbackEnabled,
                animationRunning: playbackTimelineRunning,
            });
            setClassToggled(enableButton, "is-active", playbackEnabled);
            setNodeAttribute(enableButton, "aria-pressed", buttonState.pressed ? "true" : "false");
            setNodeText(enableButton, buttonState.label);
            setNodeTitle(enableButton, buttonState.title);
            setNodeAttribute(enableButton, "aria-label", enableButton.title);
        }
        const muteButton = getNode("background-media-mute");
        if (muteButton) {
            const buttonMuted = effectiveAudioMuted === true;
            const audioStatus = mutedForForegroundMedia === true
                ? "foreground-muted"
                : (buttonMuted ? "muted" : "audible");
            setNodeText(muteButton, "");
            setNodeAttribute(muteButton, "aria-pressed", muted ? "true" : "false");
            setDatasetValue(muteButton, "icon", buttonMuted ? "speaker-muted" : "speaker");
            setDatasetValue(muteButton, "audioStatus", audioStatus);
            setNodeTitle(muteButton, mutedForForegroundMedia === true
                ? "Muted for foreground media"
                : (muted ? "Unmute background video" : "Mute background video"));
            setNodeAttribute(muteButton, "aria-label", muteButton.title);
        }
        const captionsButton = getNode("background-media-captions");
        if (captionsButton) {
            setNodeText(captionsButton, "");
            setNodeAttribute(captionsButton, "aria-pressed", captionsEnabled ? "true" : "false");
            setDatasetValue(captionsButton, "icon", "captions");
            setDatasetValue(captionsButton, "captionStatus", captionsEnabled ? "shown" : "hidden");
            setNodeTitle(captionsButton, captionsEnabled ? "Hide subtitles" : "Show subtitles");
            setNodeAttribute(captionsButton, "aria-label", captionsButton.title);
        }
        const expandButton = getNode("background-media-panel-expand");
        if (expandButton) {
            setNodeAttribute(expandButton, "aria-pressed", expanded ? "true" : "false");
            setDatasetValue(expandButton, "icon", expanded ? "restore" : "expand");
            setNodeTitle(expandButton, expanded ? "Restore" : "Expand");
        }
    }

    function syncPanelVisibility({
        forceLayout = false,
    } = {}) {
        const wrapper = getWrapper();
        const panel = getPanel();
        if (!wrapper || !panel) return;
        const visible = panelAvailable && panelState === "open";
        if (isDockviewBackgroundMediaPanelEnabled()) {
            if (visible) {
                ensureBackgroundMediaPanelDocked(panel);
            } else if (isBackgroundMediaPanelDocked(panel)) {
                closeDockedBackgroundMediaPanel();
            }
        }
        const docked = isBackgroundMediaPanelDocked(panel);
        if (docked) {
            expanded = false;
        }
        setNodeHidden(wrapper, docked || !visible);
        setClassToggled(panel, "background-media-panel--hidden", !visible);
        setClassToggled(panel, "is-maximized", expanded);
        if (!visible) {
            panelLayoutApplied = false;
        }
        if (visible && docked) {
            panelLayoutApplied = true;
        } else if (visible) {
            if (expanded) {
                const expandedRect = {
                    left: `${PANEL_EDGE_MARGIN_PX}px`,
                    top: `${PANEL_EDGE_MARGIN_PX}px`,
                    width: `calc(100vw - ${PANEL_EDGE_MARGIN_PX * 2}px)`,
                    height: `calc(100vh - ${PANEL_EDGE_MARGIN_PX * 2}px)`,
                };
                for (const [name, value] of Object.entries(expandedRect)) {
                    if (panel.style[name] !== value) panel.style[name] = value;
                }
            } else if (dragState == null && (forceLayout === true || panelLayoutApplied !== true)) {
                const saved = readMissionPanelState(BACKGROUND_MEDIA_PANEL_ID);
                const useSavedRect = storedLayoutMatchesPreset === true && saved?.rect;
                const appliedRect = applyPanelRect(
                    panel,
                    useSavedRect ? saved.rect : getDefaultPanelRect(),
                );
                panelLayoutApplied = true;
                if (!useSavedRect) {
                    persistState({ rect: appliedRect });
                    storedLayoutMatchesPreset = true;
                }
                requestWorkflowStackLayout();
            }
        }
        syncButtons();
        syncPanelRegistry();
    }

    function bringPanelToFront() {
        if (isBackgroundMediaPanelDocked()) return;
        bringPanelElementToFront(getWrapper());
    }

    function capturePanelRect(panel = getPanel()) {
        if (!panel) return null;
        const rect = panel.getBoundingClientRect?.() || null;
        return {
            left: Math.round(Number(rect?.left) || panel.offsetLeft || PANEL_EDGE_MARGIN_PX),
            top: Math.round(Number(rect?.top) || panel.offsetTop || PANEL_EDGE_MARGIN_PX),
            width: Math.round(Number(rect?.width) || panel.offsetWidth || DEFAULT_PANEL_WIDTH_PX),
            height: Math.round(Number(rect?.height) || panel.offsetHeight || getDefaultPanelHeightForWidth(DEFAULT_PANEL_WIDTH_PX)),
        };
    }

    function persistPanelRect(panel = getPanel()) {
        const rect = capturePanelRect(panel);
        if (rect) persistState({ rect });
    }

    function shouldStartPanelDrag(event) {
        if (isBackgroundMediaPanelDocked()) return false;
        if (event.button !== 0 || expanded === true) return false;
        const target = event?.target;
        if (!target || typeof target.closest !== "function") return true;
        return !target.closest("button, input, select, option, label, output, a");
    }

    function bindPanelDragging() {
        const panel = getPanel();
        const header = panel?.querySelector?.(".background-media-panel__header");
        if (!panel || !header) return;

        header.addEventListener?.("pointerdown", (event) => {
            if (!shouldStartPanelDrag(event)) return;
            const rect = capturePanelRect(panel);
            if (!rect) return;
            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                rect,
            };
            header.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        const handlePointerMove = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const dx = event.clientX - dragState.startX;
            const dy = event.clientY - dragState.startY;
            applyPanelRect(panel, {
                ...dragState.rect,
                left: dragState.rect.left + dx,
                top: dragState.rect.top + dy,
            });
            event.preventDefault();
        };

        const releaseDrag = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            if (typeof header.hasPointerCapture !== "function" || header.hasPointerCapture(event.pointerId)) {
                header.releasePointerCapture?.(event.pointerId);
            }
            dragState = null;
            persistPanelRect(panel);
            event.preventDefault();
        };

        const documentRef = getDocumentRef();
        documentRef?.addEventListener?.("pointermove", handlePointerMove, true);
        documentRef?.addEventListener?.("pointerup", releaseDrag, true);
        documentRef?.addEventListener?.("pointercancel", releaseDrag, true);
        header.addEventListener?.("pointermove", handlePointerMove);
        header.addEventListener?.("pointerup", releaseDrag);
        header.addEventListener?.("pointercancel", releaseDrag);
        header.addEventListener?.("lostpointercapture", releaseDrag);
    }

    function ensurePanelResizeGrips(panel = getPanel()) {
        if (!panel) return;
        for (const corner of ["nw", "ne", "sw", "se"]) {
            if (panel.querySelector?.(`.background-media-panel__resize-grip--${corner}`)) {
                continue;
            }
            const grip = getDocumentRef()?.createElement?.("div");
            if (!grip) continue;
            grip.className = `background-media-panel__resize-grip background-media-panel__resize-grip--${corner}`;
            grip.dataset.resizeCorner = corner;
            grip.setAttribute?.("aria-hidden", "true");
            panel.appendChild?.(grip);
        }
    }

    function resolvePanelResizeCorner(panel, event) {
        const grip = event?.target?.closest?.(".background-media-panel__resize-grip") || null;
        const gripCorner = String(grip?.dataset?.resizeCorner || "").trim();
        if (gripCorner) return gripCorner;

        const rect = panel?.getBoundingClientRect?.() || null;
        if (!rect) return "";
        const nearLeft = event.clientX >= rect.left - 2 && event.clientX <= rect.left + PANEL_RESIZE_HIT_PX;
        const nearRight = event.clientX >= rect.right - PANEL_RESIZE_HIT_PX && event.clientX <= rect.right + 2;
        const nearTop = event.clientY >= rect.top - 2 && event.clientY <= rect.top + PANEL_RESIZE_HIT_PX;
        const nearBottom = event.clientY >= rect.bottom - PANEL_RESIZE_HIT_PX && event.clientY <= rect.bottom + 2;
        if (nearLeft && nearTop) return "nw";
        if (nearRight && nearTop) return "ne";
        if (nearLeft && nearBottom) return "sw";
        if (nearRight && nearBottom) return "se";
        return "";
    }

    function resolvePanelResizeRect(resizeState, event) {
        const dx = event.clientX - resizeState.startX;
        const dy = event.clientY - resizeState.startY;
        const corner = resizeState.corner || "se";
        let left = resizeState.left;
        let top = resizeState.top;
        let right = resizeState.left + resizeState.width;
        let bottom = resizeState.top + resizeState.height;
        const bounds = {
            left: PANEL_EDGE_MARGIN_PX,
            top: PANEL_EDGE_MARGIN_PX,
            right: (Number(getWindowRef()?.innerWidth) || 1024) - PANEL_EDGE_MARGIN_PX,
            bottom: (Number(getWindowRef()?.innerHeight) || 768) - PANEL_EDGE_MARGIN_PX,
        };

        if (corner.includes("w")) {
            left = clamp(left + dx, bounds.left, right - MIN_PANEL_WIDTH_PX);
        } else {
            right = clamp(right + dx, left + MIN_PANEL_WIDTH_PX, bounds.right);
        }

        if (corner.includes("n")) {
            top = clamp(top + dy, bounds.top, bottom - MIN_PANEL_HEIGHT_PX);
        } else {
            bottom = clamp(bottom + dy, top + MIN_PANEL_HEIGHT_PX, bounds.bottom);
        }

        return {
            left,
            top,
            width: right - left,
            height: bottom - top,
        };
    }

    function bindPanelResizing() {
        const panel = getPanel();
        if (!panel) return;
        ensurePanelResizeGrips(panel);

        const startResize = (event, corner) => {
            const rect = capturePanelRect(panel);
            if (!rect) return;
            panelResizeDragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                ...rect,
                corner,
            };
            panel.setPointerCapture?.(event.pointerId);
            event.preventDefault?.();
            event.stopPropagation?.();
        };

        panel.addEventListener?.("pointerdown", (event) => {
            if (isBackgroundMediaPanelDocked(panel)) return;
            if (event.button !== 0 || expanded === true) return;
            if (event.target?.closest?.("input, button, select, option, label, output, a")) {
                return;
            }
            const corner = resolvePanelResizeCorner(panel, event);
            if (!corner) return;
            startResize(event, corner);
        }, true);

        panel.addEventListener?.("pointermove", (event) => {
            if (!panelResizeDragState || panelResizeDragState.pointerId !== event.pointerId) return;
            applyPanelRect(panel, resolvePanelResizeRect(panelResizeDragState, event));
            panelLayoutApplied = true;
            event.preventDefault?.();
        });

        const releaseResize = (event) => {
            if (!panelResizeDragState || panelResizeDragState.pointerId !== event.pointerId) return;
            if (typeof panel.hasPointerCapture !== "function" || panel.hasPointerCapture(event.pointerId)) {
                panel.releasePointerCapture?.(event.pointerId);
            }
            panelResizeDragState = null;
            persistPanelRect(panel);
            event.preventDefault?.();
        };

        panel.addEventListener?.("pointerup", releaseResize);
        panel.addEventListener?.("pointercancel", releaseResize);
        panel.addEventListener?.("lostpointercapture", releaseResize);
    }

    function confirmDeletePanel() {
        const confirmFn = globalThis?.confirm;
        if (typeof confirmFn === "function") {
            const accepted = confirmFn(
                'Delete "Flyby Broadcast" from this mission layout? You can add it back from the Panels menu.',
            );
            if (!accepted) return false;
        }
        panelState = "deleted";
        panelLayoutApplied = false;
        playbackEnabled = false;
        pauseVideo();
        clearVideoSource();
        persistState();
        syncPanelVisibility();
        return true;
    }

    function setControlsHidden(hidden) {
        const controls = getNode("background-media-controls");
        setNodeHidden(controls, hidden === true);
    }

    function getTimelineDurationSeconds(item) {
        const durationSeconds = Number(item?.durationSeconds);
        if (Number.isFinite(durationSeconds) && durationSeconds > 0) return durationSeconds;
        const startTimeMs = Number(item?.startTimeMs);
        const endTimeMs = resolveItemEndTimeMs(item);
        if (!Number.isFinite(startTimeMs) || !Number.isFinite(endTimeMs) || endTimeMs <= startTimeMs) {
            return Number.NaN;
        }
        return (endTimeMs - startTimeMs) / 1000;
    }

    function syncTimelineSlider(item, offsetSeconds = Number.NaN) {
        const slider = getNode("background-media-timeline");
        if (!slider) return;
        timelineSeekItem = item || null;
        const durationSeconds = getTimelineDurationSeconds(item);
        const safeOffsetSeconds = Number(offsetSeconds);
        const hasTimeline = Number.isFinite(durationSeconds) && durationSeconds > 0;
        slider.disabled = !hasTimeline;
        setNodeAttribute(slider, "aria-disabled", hasTimeline ? "false" : "true");
        slider.min = "0";
        slider.max = hasTimeline ? String(Math.max(0.25, durationSeconds)) : "0";
        slider.step = "0.25";
        const value = hasTimeline && Number.isFinite(safeOffsetSeconds)
            ? clamp(safeOffsetSeconds, 0, durationSeconds)
            : 0;
        slider.value = String(value);
        setNodeAttribute(slider, "aria-valuetext", hasTimeline ? formatStatusTime(value) : "Unavailable");
    }

    function seekToTimelineValue() {
        const slider = getNode("background-media-timeline");
        const item = timelineSeekItem;
        const startTimeMs = Number(item?.startTimeMs);
        const valueSeconds = Number(slider?.value);
        if (!slider || !item || !Number.isFinite(startTimeMs) || !Number.isFinite(valueSeconds)) return;
        const timeOffsetSeconds = Number(item?.timeOffsetSeconds);
        const missionOffsetSeconds = valueSeconds - (Number.isFinite(timeOffsetSeconds) ? timeOffsetSeconds : 0);
        onJumpToTime(startTimeMs + missionOffsetSeconds * 1000, item);
    }

    function openPanel() {
        if (!panelAvailable) return;
        panelState = "open";
        panelLayoutApplied = false;
        persistState();
        syncPanelVisibility();
        bringPanelToFront();
        focusPanel();
    }

    function closePanel() {
        panelState = "closed";
        panelLayoutApplied = false;
        persistState();
        clearVideoSource();
        syncPanelVisibility();
    }

    function focusPanel() {
        const panel = getPanel();
        if (!panel || panel.classList.contains("background-media-panel--hidden")) return;
        if (isBackgroundMediaPanelDocked(panel)) {
            getDockviewSpikeLayoutHost()?.focusPanel?.(BACKGROUND_MEDIA_PANEL_ID);
        }
        panel.focus?.();
    }

    function toggleExpanded() {
        if (isBackgroundMediaPanelDocked()) {
            expanded = false;
            persistState();
            syncPanelVisibility();
            return;
        }
        const wasExpanded = expanded === true;
        expanded = !expanded;
        persistState();
        syncPanelVisibility({ forceLayout: wasExpanded && expanded !== true });
    }

    function togglePlaybackEnabled() {
        if (playbackEnabled === true && getAnimationRunning() !== true) {
            onRequestPlay();
            syncButtons();
            render(lastRenderModel);
            return;
        }
        playbackEnabled = !playbackEnabled;
        persistState();
        if (!playbackEnabled) {
            pauseVideo();
            setText("background-media-status", "Paused");
            onRequestPause();
        } else {
            onRequestPlay();
        }
        syncButtons();
        render(lastRenderModel);
    }

    function toggleMuted() {
        muted = !muted;
        hasStoredMutedPreference = true;
        effectiveAudioMuted = muted;
        mutedForForegroundMedia = false;
        const video = getVideo();
        if (video && video.muted !== muted) video.muted = muted;
        persistState();
        syncButtons();
        render(lastRenderModel);
    }

    function toggleCaptions() {
        captionsEnabled = !captionsEnabled;
        persistState();
        if (!captionsEnabled) {
            setCaptionText("");
            syncCaptionAttribution(null, captionsEnabled);
        }
        syncButtons();
        render(lastRenderModel);
    }

    function renderEmptyState(lines = []) {
        const empty = getNode("background-media-empty");
        if (!empty) return;
        empty.replaceChildren();
        const normalizedLines = lines.map((line) => String(line || "").trim()).filter(Boolean);
        if (normalizedLines.length === 0) {
            empty.textContent = "No background video at this mission time.";
            return;
        }
        normalizedLines.forEach((line, index) => {
            const row = getDocumentRef()?.createElement?.(index === 0 ? "strong" : "span");
            if (!row) return;
            row.textContent = line;
            empty.appendChild(row);
        });
    }

    function appendEmptyStateText(parent, tagName, className, text) {
        const node = getDocumentRef()?.createElement?.(tagName);
        if (!node) return null;
        if (className) node.className = className;
        node.textContent = text;
        parent.appendChild(node);
        return node;
    }

    function jumpToBackgroundItemStart(item) {
        const startTimeMs = Number(item?.startTimeMs);
        if (!Number.isFinite(startTimeMs)) return;
        playbackEnabled = true;
        persistState();
        syncButtons();
        onJumpToTime(startTimeMs, item);
        onRequestPlay();
    }

    function clearActiveTranscriptRow() {
        if (activeTranscriptRow) {
            activeTranscriptRow.classList?.remove?.("background-media-panel__transcript-row--active");
            activeTranscriptRow.removeAttribute?.("aria-current");
            if (activeTranscriptRow.dataset) activeTranscriptRow.dataset.active = "false";
        }
        activeTranscriptRow = null;
        activeTranscriptSegmentKey = "";
    }

    function clearTranscriptPanel() {
        const panel = getTranscriptPanel();
        setNodeHidden(panel, true);
        setClassToggled(getPanel(), "background-media-panel--with-transcript", false);
        setNodeText(getTranscriptStatus(), "");
        getTranscriptList()?.replaceChildren?.();
        transcriptRenderSourceUrl = "";
        transcriptRowsByKey = new Map();
        transcriptSeekItem = null;
        clearActiveTranscriptRow();
    }

    function seekToTranscriptSegment(segment) {
        const startSeconds = getTranscriptSegmentStartSeconds(segment);
        const startTimeMs = Number(transcriptSeekItem?.startTimeMs);
        if (!Number.isFinite(startSeconds) || !Number.isFinite(startTimeMs)) return;
        onJumpToTime(startTimeMs + startSeconds * 1000, transcriptSeekItem);
    }

    function appendTranscriptCell(row, className, text) {
        const node = getDocumentRef()?.createElement?.("span");
        if (!node) return null;
        node.className = className;
        node.textContent = text;
        row.appendChild?.(node);
        return node;
    }

    function createTranscriptRow(segment) {
        const row = getDocumentRef()?.createElement?.("button");
        if (!row) return null;
        const key = getTranscriptSegmentKey(segment);
        const startSeconds = getTranscriptSegmentStartSeconds(segment);
        row.type = "button";
        row.className = "background-media-panel__transcript-row";
        row.dataset.segmentId = key;
        row.dataset.startSeconds = Number.isFinite(startSeconds) ? String(startSeconds) : "";
        row.setAttribute?.("role", "listitem");
        row.setAttribute?.("aria-current", "false");
        row.addEventListener?.("click", () => seekToTranscriptSegment(segment));
        appendTranscriptCell(row, "background-media-panel__transcript-time", formatStatusTime(startSeconds));
        appendTranscriptCell(row, "background-media-panel__transcript-speaker", getTranscriptSpeakerLabel(segment));
        appendTranscriptCell(row, "background-media-panel__transcript-text", String(segment?.text || "").trim());
        return row;
    }

    function renderTranscriptRows(sourceUrl, transcriptDocument) {
        const list = getTranscriptList();
        if (!list || transcriptRenderSourceUrl === sourceUrl) return;
        const segments = Array.isArray(transcriptDocument?.segments) ? transcriptDocument.segments : [];
        const rowsByKey = new Map();
        const rows = segments
            .map((segment) => {
                const row = createTranscriptRow(segment);
                if (row) rowsByKey.set(getTranscriptSegmentKey(segment), row);
                return row;
            })
            .filter(Boolean);
        if (typeof list.replaceChildren === "function") {
            list.replaceChildren(...rows);
        } else {
            while (list.firstChild) list.removeChild?.(list.firstChild);
            rows.forEach((row) => list.appendChild?.(row));
        }
        transcriptRenderSourceUrl = sourceUrl;
        transcriptRowsByKey = rowsByKey;
        activeTranscriptRow = null;
        activeTranscriptSegmentKey = "";
    }

    function syncActiveTranscriptRow(segment) {
        const key = segment ? getTranscriptSegmentKey(segment) : "";
        if (key && key === activeTranscriptSegmentKey) return;
        clearActiveTranscriptRow();
        if (!key) return;
        const row = transcriptRowsByKey.get(key) || null;
        if (!row) return;
        row.classList?.add?.("background-media-panel__transcript-row--active");
        row.setAttribute?.("aria-current", "true");
        if (row.dataset) row.dataset.active = "true";
        activeTranscriptRow = row;
        activeTranscriptSegmentKey = key;
        row.scrollIntoView?.({
            block: "center",
            behavior: playbackTimelineRunning ? "smooth" : "auto",
        });
    }

    function syncTranscriptPanel(item, offsetSeconds, onLoaded) {
        const sourceUrl = String(item?.transcriptDoc?.sourceUrl || "").trim();
        transcriptSeekItem = item || null;
        if (!sourceUrl) {
            clearTranscriptPanel();
            return;
        }
        const panel = getTranscriptPanel();
        const status = getTranscriptStatus();
        setNodeHidden(panel, false);
        setClassToggled(
            getPanel(),
            "background-media-panel--with-transcript",
            !isDockviewBackgroundMediaPanelEnabled(),
        );
        const entry = ensureTranscriptDocumentLoaded(sourceUrl, onLoaded);
        if (entry?.status !== "ready") {
            setNodeText(status, entry?.status === "error" ? "Transcript unavailable" : "Loading transcript");
            syncActiveTranscriptRow(null);
            return;
        }
        const segments = Array.isArray(entry.document?.segments) ? entry.document.segments : [];
        renderTranscriptRows(sourceUrl, entry.document);
        setNodeText(status, `${segments.length.toLocaleString()} lines`);
        syncActiveTranscriptRow(findTranscriptSegmentForHighlight(segments, offsetSeconds));
    }

    function renderBroadcastAvailabilityState(nearest) {
        const empty = getNode("background-media-empty");
        if (!empty || !nearest?.item) return false;
        empty.replaceChildren();
        const item = nearest.item;
        const deltaLabel = formatRangeDelta(nearest.deltaMs);
        const isBefore = nearest.relation === "before";
        appendEmptyStateText(
            empty,
            "span",
            "background-media-panel__empty-kicker",
            "Lunar flyby broadcast",
        );
        appendEmptyStateText(
            empty,
            "strong",
            "background-media-panel__empty-headline",
            "Broadcast video is available for the flyby.",
        );
        appendEmptyStateText(
            empty,
            "span",
            "background-media-panel__empty-copy",
            isBefore
                ? `It starts in ${deltaLabel}.`
                : `This point is after the broadcast; it ended ${deltaLabel} ago.`,
        );
        const button = getDocumentRef()?.createElement?.("button");
        if (button) {
            button.type = "button";
            button.className = "background-media-panel__jump-button";
            button.textContent = "Jump to broadcast start";
            button.addEventListener?.("click", () => jumpToBackgroundItemStart(item));
            empty.appendChild(button);
        }
        formatBroadcastTimingNotes(item, getMissionStartTime()).forEach((line) => {
            appendEmptyStateText(empty, "span", "background-media-panel__empty-note", line);
        });
        return true;
    }

    function renderOutOfRangeState(candidates, timeMs) {
        const nearest = resolveNearestInactiveBackgroundCandidate(candidates, timeMs);
        if (!nearest?.item) {
            renderEmptyState(["No background video at this mission time."]);
            setText("background-media-title", candidates.length > 0 ? "No background video in range" : "No background videos configured");
            setText("background-media-status", "Not in range");
            return;
        }
        const title = nearest.item.title || "Background video";
        const deltaLabel = formatRangeDelta(nearest.deltaMs);
        if (!renderBroadcastAvailabilityState(nearest)) {
            renderEmptyState([
                "Broadcast video is available for the flyby.",
                ...formatVideoRangeInfo(nearest.item, getMissionStartTime()),
            ]);
        }
        setText("background-media-title", title);
        setText(
            "background-media-status",
            nearest.relation === "before" ? `Available in ${deltaLabel}` : "Available at flyby",
        );
    }

    function ensurePanelEventsBound() {
        if (panelEventsBound) return;
        const panel = getPanel();
        if (!panel) return;
        panelEventsBound = true;
        const headerControls = panel.querySelector?.(".background-media-panel__header-controls");
        const closeButton = getNode("background-media-panel-close");
        closeButton?.setAttribute?.("aria-label", "Close Broadcast panel");
        if (closeButton) closeButton.title = "Close";
        let deleteButton = getNode("background-media-panel-delete");
        if (!deleteButton && headerControls?.appendChild) {
            deleteButton = getDocumentRef()?.createElement?.("button") || null;
            if (deleteButton) {
                deleteButton.id = "background-media-panel-delete";
                deleteButton.className = "background-media-panel__icon-button mission-panel-shell__button mission-panel-shell__button--icon mission-panel-shell__button--danger";
                deleteButton.type = "button";
                deleteButton.title = "Delete";
                deleteButton.setAttribute?.("aria-label", "Delete Broadcast panel");
                deleteButton.dataset.icon = "delete";
                deleteButton.textContent = "";
                headerControls.appendChild(deleteButton);
            }
        }

        closeButton?.addEventListener?.("click", closePanel);
        deleteButton?.addEventListener?.("click", confirmDeletePanel);
        getNode("background-media-panel-expand")?.addEventListener?.("click", toggleExpanded);
        getNode("background-media-enable")?.addEventListener?.("click", togglePlaybackEnabled);
        getNode("background-media-mute")?.addEventListener?.("click", toggleMuted);
        getNode("background-media-captions")?.addEventListener?.("click", toggleCaptions);
        getNode("background-media-timeline")?.addEventListener?.("input", seekToTimelineValue);
        getDocumentRef()?.addEventListener?.("moon-mission:dockview-panel-mounted", (event) => {
            if (event?.detail?.mountElementId === "background-media-transcript") {
                render(lastRenderModel);
            }
        });
        panel.addEventListener?.("pointerdown", bringPanelToFront, true);
        bindPanelDragging();
        bindPanelResizing();
        const video = getVideo();
        ["loadedmetadata", "canplay"].forEach((eventName) => {
            video?.addEventListener?.(eventName, () => render(lastRenderModel));
        });
        getWindowRef()?.addEventListener?.("resize", () => {
            if (panelState === "open") syncPanelVisibility({ forceLayout: true });
        }, { passive: true });
    }

    function ensureAnimationPlayStateEventBound() {
        if (!animationPlayStateEventBound && typeof getDocumentRef()?.addEventListener === "function") {
            animationPlayStateEventBound = true;
            getDocumentRef().addEventListener("animation-play-state-updated", (event) => {
                render({
                    ...lastRenderModel,
                    animationRunning: event?.detail?.isPlaying === true,
                });
            });
        }
    }

    function restoreStoredState() {
        const stored = readMissionPanelState(BACKGROUND_MEDIA_PANEL_ID);
        storedLayoutMatchesPreset = String(stored?.layoutPresetVersion || "").trim()
            === BACKGROUND_MEDIA_LAYOUT_PRESET_VERSION;
        const useStoredState = storedLayoutMatchesPreset === true;
        if (useStoredState && typeof stored?.playbackEnabled === "boolean") {
            playbackEnabled = stored.playbackEnabled;
        }
        if (
            useStoredState
            && stored?.mutedPreferenceSet === true
            && typeof stored?.muted === "boolean"
        ) {
            muted = stored.muted;
            hasStoredMutedPreference = true;
        } else {
            hasStoredMutedPreference = false;
        }
        if (useStoredState && typeof stored?.expanded === "boolean") {
            expanded = stored.expanded;
        }
        captionsEnabled = useStoredState && typeof stored?.captionsEnabled === "boolean"
            ? stored.captionsEnabled
            : true;
        panelState = (useStoredState ? stored?.state : "") || getMissionPanelDefaultState(
            missionConfigData,
            BACKGROUND_MEDIA_PANEL_ID,
            { fallbackState: "closed" },
        );
    }

    function setMissionContext({
        configData,
        available,
    } = {}) {
        missionConfigData = configData || missionConfigData;
        const enabledByMission = missionConfigData
            ? isMissionPanelEnabled(missionConfigData, BACKGROUND_MEDIA_PANEL_ID, { fallbackEnabled: false })
            : false;
        panelAvailable = available === true && enabledByMission;
        ensurePanelEventsBound();
        if (panelAvailable) {
            ensureAnimationPlayStateEventBound();
        }
        restoreStoredState();
        if (!panelAvailable) {
            clearVideoSource();
        }
        syncPanelVisibility();
    }

    function render({
        items = [],
        timeMs = Number.NaN,
        animationRunning = false,
        foregroundMediaState = null,
    } = {}) {
        ensurePanelEventsBound();
        lastRenderModel = {
            items,
            timeMs,
            animationRunning,
            foregroundMediaState,
        };
        const candidates = resolveBackgroundCandidates(items);
        const activeItem = resolveActiveBackgroundCandidate(candidates, timeMs);
        const available = panelAvailable && candidates.length > 0;
        playbackTimelineRunning = playbackEnabled === true && animationRunning === true;
        if (!available || !activeItem) {
            const nearest = available ? resolveNearestInactiveBackgroundCandidate(candidates, timeMs) : null;
            lastPlaybackMode = "";
            lastForegroundEffect = "";
            setControlsHidden(true);
            syncTimeOverlay(Number.NaN, true);
            syncTimelineSlider(null);
            setCaptionText("");
            if (nearest?.item) {
                syncTranscriptPanel(nearest.item, Number.NaN, () => render(lastRenderModel));
            } else {
                clearTranscriptPanel();
            }
            setHidden("background-media-empty", false);
            setHidden("background-media-live", true);
            if (available) {
                renderOutOfRangeState(candidates, timeMs);
            } else {
                renderEmptyState(["No background videos configured."]);
                setText("background-media-title", "No background videos configured");
                setText("background-media-status", "Unavailable");
            }
            clearVideoSource();
            return;
        }

        setControlsHidden(false);
        setHidden("background-media-empty", true);
        setText("background-media-title", activeItem.title || "Background video");
        const video = getVideo();
        const foregroundMediaActive = foregroundMediaState?.active === true;
        const foregroundMediaKind = String(foregroundMediaState?.kind || "").trim();
        const playbackMode = resolveBackgroundPlaybackMode({
            panelState,
            playbackEnabled,
            animationRunning,
            foregroundMediaActive,
            foregroundMediaKind,
        });
        const sourceChanged = activeItem.id !== activeItemId || activeItem.assetUrl !== videoSourceUrl;
        const offsetSeconds = resolvePlaybackOffsetSeconds(activeItem, timeMs);
        syncTimeOverlay(offsetSeconds, false, timeMs, getMissionStartTime());
        syncTimelineSlider(activeItem, offsetSeconds);
        syncCaptionAttribution(activeItem, captionsEnabled);
        syncRenderedCaption(activeItem, offsetSeconds, () => render(lastRenderModel), captionsEnabled);
        syncTranscriptPanel(activeItem, offsetSeconds, () => render(lastRenderModel));

        if (playbackMode === "ready") {
            const keepPausedSource = panelState === "open" && playbackEnabled === true;
            if (keepPausedSource) {
                if (sourceChanged) {
                    configureVideoSource(activeItem);
                }
                setVideoCurrentTime(offsetSeconds, { force: sourceChanged });
                if (!hasStoredMutedPreference) {
                    muted = activeItem.backgroundPlayback?.muted !== false;
                }
                effectiveAudioMuted = muted;
                mutedForForegroundMedia = false;
                if (video && video.muted !== muted) video.muted = muted;
                pauseVideo();
                lastPlaybackMode = playbackMode;
                setHidden("background-media-live", true);
                setText("background-media-status", `Paused ${formatStatusTime(offsetSeconds)}`);
                syncButtons();
                return;
            }
            if (lastPlaybackMode !== "ready") {
                pauseVideo();
            }
            clearVideoSource();
            lastPlaybackMode = playbackMode;
            setHidden("background-media-live", true);
            setText(
                "background-media-status",
                playbackEnabled ? `Paused ${formatStatusTime(offsetSeconds)}` : "Paused",
            );
            syncButtons();
            return;
        }

        if (sourceChanged) {
            configureVideoSource(activeItem);
        }

        const streamSyncPlan = buildMediaStreamSyncPlan({
            stream: activeItem,
            missionTimeMs: timeMs,
            isMissionPlaying: playbackMode === "playing" || playbackMode === "muted-for-foreground",
            currentPlaybackTimeSeconds: Number(video?.currentTime),
            hardSeekThresholdSeconds: STREAM_HARD_SEEK_THRESHOLD_SECONDS,
            softCorrectionThresholdSeconds: STREAM_SOFT_CORRECTION_THRESHOLD_SECONDS,
        });
        const resumingAfterForegroundMedia = playbackMode === "playing"
            && (lastPlaybackMode === "muted-for-foreground" || lastPlaybackMode === "paused-for-foreground-video");
        if (
            sourceChanged
            || streamSyncPlan.mode === "hard-seek"
            || playbackMode === "paused-for-foreground-video"
            || resumingAfterForegroundMedia
        ) {
            setVideoCurrentTime(offsetSeconds, {
                force: sourceChanged || resumingAfterForegroundMedia,
                transportPlayback: playbackMode === "playing" || playbackMode === "muted-for-foreground",
            });
        }
        const basePlaybackRate = getAnimationRealtime() === true ? 1 : Number(getAnimationSpeedMultiplier());
        const correctionPlaybackRate = Number(streamSyncPlan.playbackRate);
        const useTransportPlayback = shouldUseBackgroundTransportPlayback({
            animationRealtime: getAnimationRealtime() === true,
            animationSpeedMultiplier: basePlaybackRate,
        });
        setVideoPlaybackRate(useTransportPlayback
            ? (Number.isFinite(basePlaybackRate) && basePlaybackRate > 0 ? basePlaybackRate : 1)
                * (Number.isFinite(correctionPlaybackRate) && correctionPlaybackRate > 0 ? correctionPlaybackRate : 1)
            : 1);
        if (!hasStoredMutedPreference) {
            muted = activeItem.backgroundPlayback?.muted !== false;
        }
        const effectiveMuted = muted || playbackMode === "muted-for-foreground";
        effectiveAudioMuted = effectiveMuted;
        mutedForForegroundMedia = playbackMode === "muted-for-foreground";
        if (video && video.muted !== effectiveMuted) video.muted = effectiveMuted;

        if (!useTransportPlayback && (playbackMode === "playing" || playbackMode === "muted-for-foreground")) {
            pauseVideo({ stopHlsLoad: false });
            keepHlsLoadingForFramePreview(offsetSeconds);
            setVideoCurrentTime(offsetSeconds, { force: sourceChanged });
            setHidden("background-media-live", true);
            setText("background-media-status", playbackMode === "muted-for-foreground"
                ? "Muted for Foreground Media"
                : `Frame preview ${formatStatusTime(offsetSeconds)}`);
            lastForegroundEffect = playbackMode === "muted-for-foreground" ? "muted" : "";
        } else if (playbackMode === "playing") {
            const playStarted = playVideo();
            setHidden("background-media-live", !playStarted);
            setText("background-media-status", playStarted
                ? `Playing ${formatStatusTime(offsetSeconds)}`
                : "Loading broadcast");
            if (lastForegroundEffect === "muted") {
                showBackgroundStatusToast(muted ? "Foreground media ended; background video remains muted" : "Background video audio restored");
            } else if (lastForegroundEffect === "paused") {
                showBackgroundStatusToast("Foreground video ended; broadcast resumed");
            }
            lastForegroundEffect = "";
        } else if (playbackMode === "muted-for-foreground") {
            const playStarted = playVideo();
            setHidden("background-media-live", !playStarted);
            setText("background-media-status", playStarted ? "Muted for Foreground Media" : "Loading broadcast");
            lastForegroundEffect = "muted";
        } else if (playbackMode === "paused-for-foreground-video") {
            if (lastPlaybackMode !== playbackMode) {
                pauseVideo();
            }
            setHidden("background-media-live", true);
            setText("background-media-status", "Paused for Foreground Media");
            lastForegroundEffect = "paused";
        } else {
            if (lastPlaybackMode !== playbackMode) {
                pauseVideo();
            }
            setHidden("background-media-live", true);
            setText(
                "background-media-status",
                playbackEnabled ? `Paused ${formatStatusTime(offsetSeconds)}` : "Paused",
            );
        }
        lastPlaybackMode = playbackMode;
        syncButtons();
    }

    registerMissionPanel({
        id: BACKGROUND_MEDIA_PANEL_ID,
        title: "Flyby Broadcast",
        kind: "workflow",
        panelType: "background-media",
        builtIn: true,
        available: panelAvailable,
        state: getPanelRegistryState(),
        sortOrder: 44,
        actions: {},
    });
    syncPanelRegistry();

    return {
        render,
        setMissionContext,
        setPanelState(nextState) {
            const wasOpen = panelState === "open";
            panelState = nextState || "closed";
            if (panelState !== "open" || wasOpen !== true) {
                panelLayoutApplied = false;
            }
            persistState();
            syncPanelVisibility();
            if (panelState === "open") {
                bringPanelToFront();
            }
        },
    };
}

export {
    BACKGROUND_MEDIA_PANEL_ID,
    createBackgroundMediaPanelActions,
    isBackgroundVideoItem,
    resolveActiveBackgroundItem,
    resolveBackgroundCandidates,
    resolveBackgroundPlaybackButtonState,
    resolveBackgroundPlaybackMode,
    resolveNearestInactiveBackgroundItem,
    shouldUseBackgroundTransportPlayback,
};
