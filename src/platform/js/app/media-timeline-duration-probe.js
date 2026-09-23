import { isForegroundPlayableMediaItem, resolvePlayableDurationSeconds } from "../core/domain/media-playback-policy.js";

export function createMediaDurationProbe({
    findCurrentManifestItemById,
    invalidateMediaDataCaches,
    callMediaMethod,
    rerender,
    isDisposed,
}) {
    let durationProbeState = {
        itemId: "",
        element: null,
        cleanup: null,
    };

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
            if (isDisposed()) return;
            const changed = applyMeasuredPlayableDurationSeconds(item.id, Number(mediaElement.duration));
            if (changed) {
                releaseDurationProbe();
            }
        };
        const onFailure = () => {
            if (isDisposed()) return;
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

    return { applyMeasuredPlayableDurationSeconds, releaseDurationProbe, ensurePlayableDurationProbe };
}
