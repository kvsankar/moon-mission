import { resolveRangeValueAtClientX } from "./media-browser-policy.js";

export function bindMediaBrowserPlayerEvents({
    getNode,
    onIntent,
    toggleVideoPopout,
    syncVideoPopoutButton,
}) {
    let suppressNativeMediaSeekEvents = 0;

    getNode("media-browser-manifest-retry")?.addEventListener?.("click", () => {
        onIntent?.({ type: "retryManifest" });
    });

    getNode("media-browser-filter-prev")?.addEventListener?.("click", () => {
        onIntent?.({ type: "selectAdjacentItem", value: "previous" });
    });

    getNode("media-browser-filter-next")?.addEventListener?.("click", () => {
        onIntent?.({ type: "selectAdjacentItem", value: "next" });
    });

    getNode("media-browser-media-play")?.addEventListener?.("click", () => {
        onIntent?.({ type: "toggleActiveMediaPlayback" });
    });
    getNode("media-browser-media-mute")?.addEventListener?.("click", () => {
        onIntent?.({ type: "toggleMediaMuted" });
    });

    getNode("media-browser-media-restart")?.addEventListener?.("click", () => {
        onIntent?.({ type: "startActiveMediaFromBeginning" });
    });
    getNode("media-browser-media-resync")?.addEventListener?.("click", () => {
        onIntent?.({ type: "forceResyncActiveMedia" });
    });
    getNode("media-browser-media-popout")?.addEventListener?.("click", () => {
        toggleVideoPopout();
    });
    const mediaTimelineSlider = getNode("media-browser-media-timeline");
    let mediaTimelinePointerState = null;
    const seekMediaTimelineFromPointer = (event, finalize = false) => {
        const value = resolveRangeValueAtClientX(mediaTimelineSlider, Number(event?.clientX));
        if (!Number.isFinite(value)) return false;
        mediaTimelineSlider.value = String(value);
        suppressNativeMediaSeekEvents = Math.max(suppressNativeMediaSeekEvents, finalize === true ? 2 : 1);
        onIntent?.({
            type: "mediaSeekTime",
            value,
            finalize: finalize === true,
        });
        return true;
    };
    mediaTimelineSlider?.addEventListener?.("pointerdown", (event) => {
        if (mediaTimelineSlider.disabled === true || mediaTimelineSlider.hidden === true) return;
        if (event?.isPrimary === false) return;
        if (event?.pointerType === "mouse" && event?.button !== 0) return;
        if (!seekMediaTimelineFromPointer(event, false)) return;
        event?.preventDefault?.();
        mediaTimelinePointerState = {
            pointerId: Number(event?.pointerId),
        };
        if (Number.isFinite(mediaTimelinePointerState.pointerId)) {
            mediaTimelineSlider.setPointerCapture?.(mediaTimelinePointerState.pointerId);
        }
    });
    mediaTimelineSlider?.addEventListener?.("pointermove", (event) => {
        if (!mediaTimelinePointerState) return;
        const pointerId = Number(event?.pointerId);
        if (
            Number.isFinite(mediaTimelinePointerState.pointerId)
            && Number.isFinite(pointerId)
            && pointerId !== mediaTimelinePointerState.pointerId
        ) {
            return;
        }
        if (seekMediaTimelineFromPointer(event, false)) {
            event?.preventDefault?.();
        }
    });
    mediaTimelineSlider?.addEventListener?.("pointerup", (event) => {
        if (!mediaTimelinePointerState) return;
        const pointerId = Number(event?.pointerId);
        if (
            Number.isFinite(mediaTimelinePointerState.pointerId)
            && Number.isFinite(pointerId)
            && pointerId !== mediaTimelinePointerState.pointerId
        ) {
            return;
        }
        seekMediaTimelineFromPointer(event, true);
        if (Number.isFinite(mediaTimelinePointerState.pointerId)) {
            mediaTimelineSlider.releasePointerCapture?.(mediaTimelinePointerState.pointerId);
        }
        mediaTimelinePointerState = null;
        event?.preventDefault?.();
    });
    mediaTimelineSlider?.addEventListener?.("pointercancel", () => {
        if (
            mediaTimelinePointerState
            && Number.isFinite(mediaTimelinePointerState.pointerId)
        ) {
            mediaTimelineSlider.releasePointerCapture?.(mediaTimelinePointerState.pointerId);
        }
        mediaTimelinePointerState = null;
    });
    mediaTimelineSlider?.addEventListener?.("input", () => {
        if (suppressNativeMediaSeekEvents > 0) {
            suppressNativeMediaSeekEvents -= 1;
            return;
        }
        onIntent?.({
            type: "mediaSeekTime",
            value: Number(mediaTimelineSlider?.value),
            finalize: false,
        });
    });
    mediaTimelineSlider?.addEventListener?.("change", () => {
        if (suppressNativeMediaSeekEvents > 0) {
            suppressNativeMediaSeekEvents -= 1;
            return;
        }
        onIntent?.({
            type: "mediaSeekTime",
            value: Number(mediaTimelineSlider?.value),
            finalize: true,
        });
    });

    const mediaSearchInput = getNode("media-browser-search");
    mediaSearchInput?.addEventListener?.("input", () => {
        onIntent?.({
            type: "setSearchQuery",
            value: mediaSearchInput?.value || "",
        });
    });

    const video = getNode("media-browser-video");
    const getVideoItemId = () => String(video?.dataset?.mediaItemId || "").trim();
    video?.addEventListener?.("playing", () => {
        onIntent?.({
            type: "mediaPlaybackStarted",
            value: getVideoItemId(),
            mediaElement: video,
            mediaKind: "videoClip",
            currentTime: Number(video?.currentTime),
        });
    });
    for (const eventName of ["waiting", "stalled"]) {
        video?.addEventListener?.(eventName, () => {
            onIntent?.({
                type: "mediaPlaybackBuffering",
                value: getVideoItemId(),
                mediaElement: video,
                mediaKind: "videoClip",
                currentTime: Number(video?.currentTime),
            });
        });
    }
    video?.addEventListener?.("pause", () => {
        if (video?.ended === true) return;
        onIntent?.({
            type: "mediaPlaybackPaused",
            value: getVideoItemId(),
            mediaKind: "videoClip",
            currentTime: Number(video?.currentTime),
            mediaElement: video,
        });
    });
    video?.addEventListener?.("ended", () => {
        onIntent?.({ type: "mediaPlaybackEnded", value: getVideoItemId(), mediaKind: "videoClip", mediaElement: video });
    });
    for (const eventName of ["abort", "error"]) {
        video?.addEventListener?.(eventName, () => {
            onIntent?.({
                type: "mediaPlaybackFailed",
                value: getVideoItemId(),
                mediaElement: video,
                mediaKind: "videoClip",
            });
        });
    }
    video?.addEventListener?.("timeupdate", () => {
        onIntent?.({
            type: "mediaPlaybackTimeUpdate",
            value: getVideoItemId(),
            mediaElement: video,
            mediaKind: "videoClip",
            currentTime: Number(video?.currentTime),
        });
    });
    for (const eventName of ["loadedmetadata", "durationchange"]) {
        video?.addEventListener?.(eventName, () => {
            onIntent?.({
                type: "mediaDurationKnown",
                value: getVideoItemId(),
                mediaKind: "videoClip",
                duration: Number(video?.duration),
            });
        });
    }
    for (const eventName of ["enterpictureinpicture", "leavepictureinpicture", "loadedmetadata", "emptied"]) {
        video?.addEventListener?.(eventName, () => {
            syncVideoPopoutButton({
                hasVideo: video?.hidden !== true && !!video?.dataset?.mediaSourceUrl,
            });
        });
    }
    video?.addEventListener?.("canplay", () => {
        onIntent?.({
            type: "mediaVideoSourceReady",
            value: getVideoItemId(),
            mediaElement: video,
            mediaKind: "videoClip",
            currentTime: Number(video?.currentTime),
        });
    });
}
