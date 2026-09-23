
import { clampMediaCurrentTimeSeconds } from "./media-timeline-items.js";

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
export {
    readStoredBooleanPreference,
    writeStoredBooleanPreference,
    dispatchDocumentCustomEvent,
    seekMainTimelineTime,
    readMainTimelineTimeMs,
    resolvePlaybackOffsetSeconds,
};
