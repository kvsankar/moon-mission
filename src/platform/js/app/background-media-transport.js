import { getWindowRef, callMediaMethod, setText, setDatasetValue, setClassToggled } from "./background-media-dom.js";
import { setCaptionText, removeCaptionTrackNodes, syncCaptionAttribution, syncVideoCaptionTracks } from "./background-media-captions.js";
import { clamp, MAX_PLAYBACK_RATE, isLikelyHlsSource, canPlayHlsNatively, resolveVideoSourceType } from "./background-media-policy.js";

const SEEK_SYNC_EPSILON_SECONDS = 0.35;
const TRANSPORT_SEEK_SYNC_EPSILON_SECONDS = 3;
const HLS_FRAME_PREVIEW_LOAD_BUCKET_SECONDS = 4;

export function createBackgroundVideoTransport({
    getVideo,
    getMuted,
    getCaptionsEnabled,
    getAnimationRealtime,
    getAnimationSpeedMultiplier,
    loadHlsLibraryFn,
    onSourceReady,
}) {
    let activeItemId = "";
    let videoSourceUrl = "";
    let hlsInstance = null;
    let hlsSourceUrl = "";
    let hlsReadySourceUrl = "";
    let hlsAttachToken = 0;
    let hlsUnsupportedSourceUrl = "";
    let playRequestPending = false;
    let lastVideoCurrentTimeWriteSeconds = Number.NaN;
    let lastVideoCurrentTimeWriteSourceUrl = "";
    let lastFramePreviewHlsLoadSourceUrl = "";
    let lastFramePreviewHlsLoadBucket = Number.NaN;
    let lastAppliedPlaybackRate = Number.NaN;

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
        syncCaptionAttribution(null, getCaptionsEnabled());
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
                onSourceReady();
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
        if (video.muted !== getMuted()) video.muted = getMuted();
        if (video.loop !== false) video.loop = false;
        video.removeAttribute?.("loop");
        setClassToggled(video, "background-media-panel__video--cover", item.backgroundPlayback?.fit === "cover");
        syncVideoCaptionTracks(video, item, getCaptionsEnabled());
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
                setText("background-media-status", getMuted() ? "Tap play to start" : "Autoplay blocked");
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

    return {
        matchesSource(item) {
            return item?.id === activeItemId && item?.assetUrl === videoSourceUrl;
        },
        clearVideoSource,
        configureVideoSource,
        pauseVideo,
        keepHlsLoadingForFramePreview,
        playVideo,
        setVideoCurrentTime,
        setVideoPlaybackRate,
    };
}
