import { formatDuration } from "../utils/time-utils.js";

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function computePercent(value, min, max) {
    const span = max - min;
    if (!Number.isFinite(span) || span <= 0) return 0;
    return ((value - min) / span) * 100;
}

function normalizeWheelDelta(delta, deltaMode, pixelFallback = 720) {
    if (!Number.isFinite(delta)) return 0;
    if (deltaMode === 1) return delta * 16;
    if (deltaMode === 2) return delta * pixelFallback;
    return delta;
}

function resolveWheelZoomFactor(deltaY) {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
    const magnitude = clamp(Math.abs(deltaY), 12, 240);
    const direction = deltaY > 0 ? 1 : -1;
    return Math.exp(direction * magnitude * 0.0028);
}

function buildEventSignature(eventInfos) {
    if (!Array.isArray(eventInfos) || eventInfos.length === 0) return "";
    return eventInfos
        .map((eventInfo) => {
            const timeMs = eventInfo?.startTime instanceof Date
                ? eventInfo.startTime.getTime()
                : Number.NaN;
            return [
                eventInfo?.key || "",
                Number.isFinite(timeMs) ? String(timeMs) : "NaN",
                eventInfo?.label || "",
                eventInfo?.burnFlag ? "1" : "0",
                eventInfo?.clickable === false ? "0" : "1",
                eventInfo?.generated ? "1" : "0",
                eventInfo?.generatedLabel || "",
                eventInfo?.burnDirection || "",
                eventInfo?.burnTypeLabel || "",
                String(eventInfo?.durationSeconds ?? ""),
                eventInfo?.hoverText || "",
                eventInfo?.timelineLabel || "",
                eventInfo?.timelineHoverText || "",
                eventInfo?.timelineRole || "",
            ].join("|");
        })
        .join(";");
}

function buildMediaSignature(mediaMarkers) {
    if (!Array.isArray(mediaMarkers) || mediaMarkers.length === 0) return "";
    return mediaMarkers
        .map((marker) => {
            const timeMs = marker?.startTime instanceof Date
                ? marker.startTime.getTime()
                : Number(marker?.startTimeMs);
            return [
                marker?.id || "",
                Number.isFinite(timeMs) ? String(timeMs) : "NaN",
                marker?.label || "",
                marker?.hoverText || "",
                marker?.mediaKind || "",
                marker?.mediaDisplayMode || "",
                String(marker?.endTimeMs ?? ""),
                marker?.durationEstimated ? "1" : "0",
                marker?.selected ? "1" : "0",
                marker?.clickable === false ? "0" : "1",
                marker?.preEphemeris ? "1" : "0",
                marker?.postEphemeris ? "1" : "0",
            ].join("|");
        })
        .join(";");
}

function formatComparisonElapsedLabel(timeMs, rangeStartMs) {
    const elapsedMs = Math.max(0, Number(timeMs) - Number(rangeStartMs || 0));
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
        return "T+0";
    }
    if (elapsedMs < 60000) {
        return "T+<1m";
    }
    return `T+${formatDuration(elapsedMs, {
        compact: true,
        includeSeconds: false,
    })}`;
}

function formatMissionElapsedLabel(timeMs, rangeStartMs) {
    const elapsedMs = Number(timeMs) - Number(rangeStartMs);
    if (!Number.isFinite(elapsedMs)) return "";
    const sign = elapsedMs < 0 ? "-" : "+";
    const absoluteMs = Math.abs(elapsedMs);
    const totalSeconds = Math.floor(absoluteMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, "0");
    return `MET ${sign}${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

function formatUtcYearElapsedLabel(timeMs) {
    if (!Number.isFinite(timeMs)) return "";
    const date = new Date(timeMs);
    const yearStartMs = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    const elapsedMs = timeMs - yearStartMs;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "";
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value, length = 2) => String(value).padStart(length, "0");
    return `UTC ${pad(days, 3)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export {
    clamp,
    computePercent,
    normalizeWheelDelta,
    resolveWheelZoomFactor,
    buildEventSignature,
    buildMediaSignature,
    formatComparisonElapsedLabel,
    formatMissionElapsedLabel,
    formatUtcYearElapsedLabel,
};
