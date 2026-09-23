import { callMediaMethod, isLikelyHlsSource, canPlayHlsNatively, loadHlsLibrary } from "./media-browser-dom.js";

export function createMediaBrowserVideoSource({ onIntent, loadHlsLibraryFn = loadHlsLibrary } = {}) {
    let videoViewAssetUrl = "";
    let hlsInstance = null;
    let hlsSourceUrl = "";
    let hlsAttachToken = 0;
    let hlsUnsupportedSourceUrl = "";

    function destroyHlsInstance() {
        if (!hlsInstance) return;
        try {
            hlsInstance.destroy?.();
        } catch {
            // hls.js can throw while tearing down a partially attached stream.
        }
        hlsInstance = null;
        hlsSourceUrl = "";
    }

    function setVideoPoster(video, posterAssetUrl = "") {
        if (posterAssetUrl) {
            video.poster = posterAssetUrl;
        } else {
            video.removeAttribute?.("poster");
        }
    }

    function setNativeVideoSource(video, activeItem, nextVideoUrl) {
        destroyHlsInstance();
        hlsUnsupportedSourceUrl = "";
        if (video.getAttribute?.("src") === nextVideoUrl) {
            videoViewAssetUrl = nextVideoUrl;
        } else {
            videoViewAssetUrl = nextVideoUrl;
            video.src = nextVideoUrl;
            callMediaMethod(video, "load");
        }
        setVideoPoster(video, activeItem.posterAssetUrl || "");
    }

    function attachHlsVideoSource(video, activeItem, nextVideoUrl) {
        if (hlsUnsupportedSourceUrl === nextVideoUrl) {
            setVideoPoster(video, activeItem.posterAssetUrl || "");
            return;
        }
        if (hlsInstance && hlsSourceUrl === nextVideoUrl && videoViewAssetUrl === nextVideoUrl) {
            setVideoPoster(video, activeItem.posterAssetUrl || "");
            return;
        }
        hlsAttachToken += 1;
        const attachToken = hlsAttachToken;
        destroyHlsInstance();
        videoViewAssetUrl = nextVideoUrl;
        video.removeAttribute?.("src");
        setVideoPoster(video, activeItem.posterAssetUrl || "");
        callMediaMethod(video, "load");

        loadHlsLibraryFn().then((Hls) => {
            if (attachToken !== hlsAttachToken || videoViewAssetUrl !== nextVideoUrl) return;
            if (!Hls || typeof Hls.isSupported !== "function" || !Hls.isSupported()) {
                if (canPlayHlsNatively(video)) {
                    setNativeVideoSource(video, activeItem, nextVideoUrl);
                    return;
                }
                hlsUnsupportedSourceUrl = nextVideoUrl;
                video.removeAttribute?.("src");
                callMediaMethod(video, "load");
                onIntent?.({
                    type: "mediaPlaybackFailed",
                    value: activeItem.id || "",
                    mediaElement: video,
                    mediaKind: "videoClip",
                });
                return;
            }

            hlsUnsupportedSourceUrl = "";
            const instance = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
            });
            hlsInstance = instance;
            hlsSourceUrl = nextVideoUrl;
            instance.on(Hls.Events.MEDIA_ATTACHED, () => {
                if (attachToken !== hlsAttachToken || hlsInstance !== instance) return;
                instance.loadSource(nextVideoUrl);
                instance.startLoad?.(0);
            });
            instance.on(Hls.Events.MANIFEST_PARSED, () => {
                if (attachToken !== hlsAttachToken || hlsInstance !== instance) return;
                onIntent?.({
                    type: "mediaVideoSourceReady",
                    value: activeItem.id || "",
                    mediaElement: video,
                    mediaKind: "videoClip",
                    currentTime: Number(video?.currentTime),
                });
            });
            instance.on(Hls.Events.ERROR, (_event, data = {}) => {
                if (hlsInstance !== instance || data.fatal !== true) return;
                if (data.details === "manifestIncompatibleCodecsError") {
                    destroyHlsInstance();
                    onIntent?.({
                        type: "mediaPlaybackFailed",
                        value: activeItem.id || "",
                        mediaElement: video,
                        mediaKind: "videoClip",
                    });
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
            });
            instance.attachMedia(video);
        });
    }

    function configureVideoSource(video, activeItem) {
        const nextVideoUrl = activeItem.videoAssetUrl;
        const sourceType = activeItem.sourceType || "";
        const isHlsSource = isLikelyHlsSource(nextVideoUrl, sourceType);

        if (video.dataset) {
            video.dataset.mediaItemId = activeItem.id || "";
            video.dataset.mediaSourceUrl = nextVideoUrl || "";
            video.dataset.sourceType = sourceType;
        }

        if (isHlsSource) {
            attachHlsVideoSource(video, activeItem, nextVideoUrl);
            return;
        }

        hlsAttachToken += 1;
        setNativeVideoSource(video, activeItem, nextVideoUrl);
    }

    function clearVideoSource(video) {
        hlsAttachToken += 1;
        destroyHlsInstance();
        hlsUnsupportedSourceUrl = "";
        if (videoViewAssetUrl) {
            callMediaMethod(video, "pause");
            video.removeAttribute?.("src");
            video.removeAttribute?.("poster");
            callMediaMethod(video, "load");
        }
        videoViewAssetUrl = "";
        if (video.dataset) {
            video.dataset.mediaItemId = "";
            video.dataset.mediaSourceUrl = "";
            video.dataset.sourceType = "";
        }
    }

    return { configureVideoSource, clearVideoSource };
}
