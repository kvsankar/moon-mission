import { formatDateTimeLocal, formatDateTimeUTC, formatDuration } from "../utils/time-utils.js";

const backgroundCandidatesCache = new WeakMap();
let hlsLibraryPromise = null;
const MAX_PLAYBACK_RATE = 4;
const MEDIA_PLAY_SYMBOL = "▶";
const MEDIA_PAUSE_SYMBOL = "⏸";

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
export {
    MAX_PLAYBACK_RATE,
    clamp,
    isLikelyHlsSource,
    canPlayHlsNatively,
    loadHlsLibrary,
    isBackgroundVideoItem,
    resolveVideoSourceType,
    resolveBackgroundCandidates,
    isItemActiveAtTime,
    resolveActiveBackgroundItem,
    resolveActiveBackgroundCandidate,
    resolveBackgroundPlaybackMode,
    shouldUseBackgroundTransportPlayback,
    resolveBackgroundPlaybackButtonState,
    resolveNearestInactiveBackgroundItem,
    resolveNearestInactiveBackgroundCandidate,
    resolveItemEndTimeMs,
    resolvePlaybackOffsetSeconds,
    pad,
    formatMissionElapsedTime,
    formatVideoRangeInfo,
    formatCompactLocalTime,
    formatCompactUtcTime,
    formatShortMissionElapsedTime,
    formatBroadcastTimingNotes,
    formatRangeDelta,
    formatStatusTime,
};
