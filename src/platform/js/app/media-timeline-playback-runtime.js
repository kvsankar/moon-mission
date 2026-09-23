import { buildForegroundMediaPlaybackState, isForegroundPlayableMediaItem, resolvePlayableDurationSeconds } from "../core/domain/media-playback-policy.js";
import { clampMediaCurrentTimeSeconds, isHlsMediaItem } from "./media-timeline-items.js";
import { MEDIA_CLOCK_OVERRIDE_TOLERANCE_MS, MEDIA_TIME_SYNC_EPSILON_SECONDS, MEDIA_PLAYBACK_RATE_MAX, MEDIA_FRAME_SCRUB_INTERVAL_MS, MEDIA_SILENT_PAUSE_SUPPRESSION_MS, MEDIA_MISSION_SEEK_SUPPRESSION_MS, PLAYBACK_AUTHORITY_ANIMATION, PLAYBACK_AUTHORITY_MEDIA, MISSION_MEDIA_MUTED_STORAGE_KEY } from "./media-timeline-constants.js";
import { writeStoredBooleanPreference, readMainTimelineTimeMs, resolvePlaybackOffsetSeconds } from "./media-timeline-browser-effects.js";
import { createMediaPlaybackTransport } from "./media-timeline-playback-transport.js";

export function createMediaPlaybackRuntime({
    published,
    runtimeMediaState,
    getAnimationRunning,
    getAnimationSpeedMultiplier,
    getAnimationRealtime,
    playAnimation,
    pauseAnimation,
    seekMissionTimelineTime,
    findCurrentManifestItemById,
    rerender,
    resolveMediaItemEndTimeMs,
    getCurrentFocusedMediaItem,
}) {
    let handlingMediaDrivenAnimationStateChange = false;
    const transportSession = {
        currentAudio: null,
        currentAudioClipId: "",
        playbackSession: null,
        releaseAudioPlaybackEvents: null,
        suppressMediaEvents: false,
        mediaPlayRequestPending: false,
        lastMediaPlayAttempt: { itemId: "", kind: "", atMs: 0 },
        scrubSyncState: { itemId: "", lastAppliedAtMs: 0 },
    };
    const silentPauseUntilByElement = typeof WeakMap === "function" ? new WeakMap() : null;
    let missionDrivenMediaSeekState = {
        active: false,
        itemId: "",
        source: "",
        targetTimeMs: Number.NaN,
        targetSeconds: Number.NaN,
        wasPlaying: false,
        expiresAtMs: 0,
    };
    let lastFrameScrubRealtimeMs = 0;
    let lastFrameScrubMode = null;

    const transport = createMediaPlaybackTransport({
        published,
        transportSession,
        getAnimationRunning,
        getAnimationSpeedMultiplier,
        getAnimationRealtime,
        seekMissionTimelineTime,
        findCurrentManifestItemById,
        rerender,
        resolveMediaItemEndTimeMs,
        getCurrentFocusedMediaItem,
        getVideoElement,
        isAnimationClockDrivingMedia,
        readCurrentMissionTimeMs,
        isFrameScrubMode,
        playAnimationFromMedia,
        pauseAnimationFromMedia,
        getMediaPlaybackRate,
        stopPlayableMedia,
        primePlayableMediaState,
        handlePlayableMediaStarted,
        markSilentMediaPause,
        handlePlayableMediaPaused,
        handlePlayableMediaEnded,
        handlePlayableMediaFailed,
        handlePlayableMediaBuffering,
        syncMissionTimeFromMedia,
    });
    const {
        callMediaMethod,
        setMediaPlaybackRate,
        attachAudioPlaybackEvents,
        setMediaElementCurrentTime,
        isAbortLikeMediaPlayError,
        ensureVideoPlaybackSource,
        getAnimationRateContext,
        shouldUseTransportPlayback,
        invalidatePlayRequest,
        suspendPlaybackTransport,
        isCurrentPlaybackSession,
        ensurePlaybackSession,
        playMediaElement,
        handleVideoSourceReady,
        startPlayableMediaItem,
        startFocusedPlayableMediaFromMissionTime,
        getActivePlayableMediaElement,
        pauseMediaElementSilently,
        syncActivePlayableMediaToMissionTime,
        forceResyncActiveMedia,
    } = transport;

    function resetMediaPlaybackState() {
        setMediaBufferingStatusVisible(false);
        published.mediaPlaybackState = {
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
        transportSession.scrubSyncState = {
            itemId: "",
            lastAppliedAtMs: 0,
        };
        transportSession.mediaPlayRequestPending = false;
        transportSession.lastMediaPlayAttempt = {
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
        if (video) video.muted = published.missionMediaMuted === true;
        if (transportSession.currentAudio) transportSession.currentAudio.muted = published.missionMediaMuted === true;
    }

    function setMissionMediaMuted(nextMuted) {
        published.missionMediaMuted = nextMuted === true;
        writeStoredBooleanPreference(MISSION_MEDIA_MUTED_STORAGE_KEY, published.missionMediaMuted);
        applyMissionMediaMuted();
        rerender();
    }

    function isMediaPlaybackBusy() {
        return published.mediaPlaybackState.playing === true || published.mediaPlaybackState.buffering === true;
    }

    function isAnimationClockDrivingMedia() {
        return published.playbackAuthority === PLAYBACK_AUTHORITY_ANIMATION && getAnimationRunning() === true;
    }

    function buildForegroundMediaState() {
        return buildForegroundMediaPlaybackState({
            playbackState: published.mediaPlaybackState,
            animationRunning: getAnimationRunning() === true,
            frameScrubMode: isFrameScrubMode() === true,
            item: findCurrentManifestItemById(published.mediaPlaybackState.itemId),
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

    function readCurrentMissionTimeMs() {
        const timelineTimeMs = readMainTimelineTimeMs();
        if (Number.isFinite(timelineTimeMs)) {
            return timelineTimeMs;
        }
        const renderTimeMs = Number(published.lastRenderContext?.animTime);
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
        published.playbackAuthority = authority === PLAYBACK_AUTHORITY_MEDIA
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
        if (published.playbackAuthority === PLAYBACK_AUTHORITY_MEDIA) {
            return 1;
        }
        return Math.max(0.1, Math.min(MEDIA_PLAYBACK_RATE_MAX, getRequestedAnimationRate()));
    }

    function stopAudioPlayback() {
        transportSession.releaseAudioPlaybackEvents?.();
        transportSession.releaseAudioPlaybackEvents = null;
        if (transportSession.currentAudio && typeof transportSession.currentAudio.pause === "function") {
            transportSession.suppressMediaEvents = true;
            transportSession.currentAudio.loop = false;
            callMediaMethod(transportSession.currentAudio, "pause");
            transportSession.suppressMediaEvents = false;
        }
        transportSession.currentAudio = null;
        transportSession.currentAudioClipId = "";
    }

    function stopVideoPlayback() {
        const video = getVideoElement();
        if (!video || typeof video.pause !== "function") return;
        transportSession.suppressMediaEvents = true;
        video.loop = false;
        video.removeAttribute?.("loop");
        callMediaMethod(video, "pause");
        transportSession.suppressMediaEvents = false;
    }

    function stopPlayableMedia({ pauseClock = false } = {}) {
        transportSession.playbackSession = null;
        invalidatePlayRequest();
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
        if (published.mediaPlaybackState.playing !== true && published.mediaPlaybackState.buffering !== true &&
            transportSession.mediaPlayRequestPending !== true) return false;
        suspendPlaybackTransport();
        transportSession.suppressMediaEvents = true;
        if (published.mediaPlaybackState.kind === "audioClip") {
            callMediaMethod(transportSession.currentAudio, "pause");
        } else if (published.mediaPlaybackState.kind === "videoClip") {
            callMediaMethod(getVideoElement(), "pause");
        }
        transportSession.suppressMediaEvents = false;
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
            active: true,
            playing: false,
            buffering: false,
        };
        rerender();
        return true;
    }

    function pauseActivePlayableMedia() {
        if (published.mediaPlaybackState.playing !== true && published.mediaPlaybackState.buffering !== true) return false;
        suspendPlaybackTransport();
        transportSession.suppressMediaEvents = true;
        if (published.mediaPlaybackState.kind === "audioClip") {
            callMediaMethod(transportSession.currentAudio, "pause");
        } else if (published.mediaPlaybackState.kind === "videoClip") {
            callMediaMethod(getVideoElement(), "pause");
        }
        transportSession.suppressMediaEvents = false;
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
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
        if (!Number.isFinite(timeMs) || !published.mediaPlaybackState.itemId) return false;
        const mediaItem = findCurrentManifestItemById(published.mediaPlaybackState.itemId) || published.mediaPlaybackState;
        if (!mediaItem || !isForegroundPlayableMediaItem(mediaItem) || !Number.isFinite(mediaItem.startTimeMs)) {
            return false;
        }
        const offsetSeconds = clampMediaCurrentTimeSeconds(
            mediaItem,
            (timeMs - mediaItem.startTimeMs) / 1000,
        );
        if (!Number.isFinite(offsetSeconds)) return false;
        if (published.mediaPlaybackState.kind === "audioClip") {
            if (!transportSession.currentAudio) return false;
            setMediaElementCurrentTime(transportSession.currentAudio, offsetSeconds);
        } else if (published.mediaPlaybackState.kind === "videoClip") {
            const video = getVideoElement();
            if (!video) return false;
            setMediaElementCurrentTime(video, offsetSeconds);
        } else {
            return false;
        }
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
            syncedTimeMs: mediaItem.startTimeMs + (offsetSeconds * 1000),
            currentTimeSeconds: offsetSeconds,
        };
        return true;
    }

    function seekPlayableMediaToSeconds(item, seconds, finalize = false) {
        if (!item || !isForegroundPlayableMediaItem(item) || !Number.isFinite(item.startTimeMs)) return false;
        const clampedSeconds = clampMediaCurrentTimeSeconds(item, seconds);
        if (item.kind === "audioClip") {
            setMediaElementCurrentTime(transportSession.currentAudio, clampedSeconds);
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
        if (published.lastRenderContext && Number.isFinite(anchoredTimeMs)) {
            published.lastRenderContext = {
                ...published.lastRenderContext,
                animTime: anchoredTimeMs,
            };
        }
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
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
            published.playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            && (published.mediaPlaybackState.playing === true || published.mediaPlaybackState.buffering === true)
        ) {
            return;
        }
        if (isFrameScrubMode() !== true || getAnimationRunning() !== true) return;
        const itemEndTimeMs = resolveMediaItemEndTimeMs(activeItem);
        if (Number.isFinite(itemEndTimeMs) && Number(timeMs) >= itemEndTimeMs) {
            if (published.mediaPlaybackState.itemId === activeItem.id) {
                published.mediaPlaybackState = {
                    ...published.mediaPlaybackState,
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
        const currentPreviewSeconds = Number(published.mediaPlaybackState.currentTimeSeconds);
        const shouldSeekPreview = !Number.isFinite(currentPreviewSeconds)
            || Math.abs(currentPreviewSeconds - offsetSeconds) >= MEDIA_TIME_SYNC_EPSILON_SECONDS;
        const nowMs = Date.now();
        if (!shouldSeekPreview && (nowMs - lastFrameScrubRealtimeMs) < MEDIA_FRAME_SCRUB_INTERVAL_MS) return;
        lastFrameScrubRealtimeMs = nowMs;
        if (video) {
            pauseMediaElementSilently(video);
            setMediaElementCurrentTime(video, offsetSeconds);
        }
        if (published.mediaPlaybackState.itemId === activeItem.id) {
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
                active: true,
                playing: false,
                buffering: false,
                currentTimeSeconds: offsetSeconds,
                syncedTimeMs: activeItem.startTimeMs + offsetSeconds * 1000,
            };
        }
    }

    function syncActivePlayingMediaRate() {
        if (published.mediaPlaybackState.playing !== true) return;
        if (isFrameScrubMode() === true) return;
        const rate = getMediaPlaybackRate();
        if (published.mediaPlaybackState.kind === "audioClip") {
            setMediaPlaybackRate(transportSession.currentAudio, rate);
            return;
        }
        if (published.mediaPlaybackState.kind === "videoClip") {
            setMediaPlaybackRate(getVideoElement(), rate);
        }
    }

    function syncPlaybackModeTransition(activeItem, timeMs) {
        if (!activeItem || !isForegroundPlayableMediaItem(activeItem)) return;
        if (
            published.playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            && (published.mediaPlaybackState.playing === true || published.mediaPlaybackState.buffering === true)
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
            suspendPlaybackTransport();
            transportSession.suppressMediaEvents = true;
            callMediaMethod(transportSession.currentAudio, "pause");
            callMediaMethod(getVideoElement(), "pause");
            transportSession.suppressMediaEvents = false;
            seekPlayableMediaToSeconds(activeItem, offsetSeconds, false);
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
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
            if (!transportSession.currentAudio || transportSession.currentAudioClipId !== activeItem.id) {
                transportSession.currentAudio = new globalThis.Audio(activeItem.assetUrl);
                transportSession.currentAudio.volume = 0.7;
                transportSession.currentAudio.muted = published.missionMediaMuted === true;
                transportSession.currentAudioClipId = activeItem.id;
                attachAudioPlaybackEvents(transportSession.currentAudio, activeItem);
            }
            setMediaPlaybackRate(transportSession.currentAudio, getMediaPlaybackRate());
            setMediaElementCurrentTime(transportSession.currentAudio, offsetSeconds);
            primePlayableMediaState(activeItem, {
                playing: false,
                syncedTimeMs,
                currentTimeSeconds: offsetSeconds,
            });
            playMediaElement(transportSession.currentAudio, activeItem.id, "audioClip", { force: true });
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
            video.muted = published.missionMediaMuted === true;
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
        published.mediaPlaybackState = {
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
        transportSession.mediaPlayRequestPending = false;
        const item = findCurrentManifestItemById(normalizedId);
        if (!item || !isForegroundPlayableMediaItem(item)) return;
        const missionSeekState = getActiveMissionDrivenMediaSeek(normalizedId);
        if (missionSeekState && isMissionDrivenMediaSeekClockStale(normalizedId, currentTimeSeconds)) {
            runtimeMediaState.setActiveItemId(item.id, {
                anchorTimeMs: missionSeekState.targetTimeMs,
            });
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
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
            if (published.mediaPlaybackState.kind === "audioClip") {
                setMediaPlaybackRate(transportSession.currentAudio, getMediaPlaybackRate());
            } else if (published.mediaPlaybackState.kind === "videoClip") {
                setMediaPlaybackRate(getVideoElement(), getMediaPlaybackRate());
            }
            if (missionSeekState.wasPlaying === true && getAnimationRunning() !== true) {
                playAnimationFromMedia();
            }
            rerender();
            return;
        }
        clearMissionDrivenMediaSeekState();
        const wasBuffering = published.mediaPlaybackState.buffering === true;
        const wasPlaying = published.mediaPlaybackState.playing === true;
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
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
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
        if (published.mediaPlaybackState.kind === "audioClip") {
            setMediaPlaybackRate(transportSession.currentAudio, getMediaPlaybackRate());
        } else if (published.mediaPlaybackState.kind === "videoClip") {
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
        if (transportSession.suppressMediaEvents) return;
        if (isSilentMediaPausePending(mediaElement)) return;
        if (transportSession.mediaPlayRequestPending === true) return;
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId || normalizedId !== published.mediaPlaybackState.itemId) return;
        const missionSeekState = getActiveMissionDrivenMediaSeek(normalizedId);
        if (missionSeekState && missionSeekState.wasPlaying === true) {
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
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
                transportSession.mediaPlayRequestPending !== true
            ) {
                playMediaElement(mediaElement, normalizedId, published.mediaPlaybackState.kind, { force: true });
            }
            rerender();
            return;
        }
        if (
            published.mediaPlaybackState.active !== true
            && published.mediaPlaybackState.playing !== true
            && published.mediaPlaybackState.buffering !== true
        ) {
            return;
        }
        if (published.mediaPlaybackState.buffering === true) return;
        if (
            published.mediaPlaybackState.playing === true &&
            (getAnimationRunning() === true || isMediaElementLikelyBuffering(mediaElement))
        ) {
            handlePlayableMediaBuffering(itemId, currentTimeSeconds);
            return;
        }
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
            active: true,
            playing: false,
            buffering: false,
        };
        setMediaBufferingStatusVisible(false);
        rerender();
    }

    function handlePlayableMediaEnded(itemId) {
        if (transportSession.suppressMediaEvents) return;
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId || normalizedId !== published.mediaPlaybackState.itemId) return;
        if (getActiveMissionDrivenMediaSeek(normalizedId)) return;
        if (
            published.mediaPlaybackState.active !== true
            && published.mediaPlaybackState.playing !== true
            && published.mediaPlaybackState.buffering !== true
        ) {
            return;
        }
        const mediaItem = findCurrentManifestItemById(normalizedId) || published.mediaPlaybackState;
        suspendPlaybackTransport();
        const durationSeconds = resolvePlayableDurationSeconds(mediaItem);
        const endedTimeMs = Number.isFinite(durationSeconds)
            ? syncMissionTimeToMediaOffset(mediaItem, durationSeconds, true)
            : published.mediaPlaybackState.syncedTimeMs;
        const mediaElement = getActivePlayableMediaElement();
        if (mediaElement) {
            mediaElement.loop = false;
            mediaElement.removeAttribute?.("loop");
            pauseMediaElementSilently(mediaElement);
        }
        transportSession.mediaPlayRequestPending = false;
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
            active: false,
            playing: false,
            buffering: false,
            syncedTimeMs: Number.isFinite(endedTimeMs) ? endedTimeMs : published.mediaPlaybackState.syncedTimeMs,
            currentTimeSeconds: Number.isFinite(durationSeconds)
                ? durationSeconds
                : published.mediaPlaybackState.currentTimeSeconds,
        };
        setMediaBufferingStatusVisible(false);
        if (published.mediaPlaybackState.pauseAnimationOnEnd === true) {
            pauseAnimationFromMedia();
        } else {
            setPlaybackAuthority(PLAYBACK_AUTHORITY_ANIMATION);
        }
        rerender();
    }

    function handlePlayableMediaFailed(itemId, mediaElement = null) {
        if (transportSession.suppressMediaEvents) return;
        const normalizedId = String(itemId || "").trim();
        if (normalizedId && normalizedId !== published.mediaPlaybackState.itemId) return;
        suspendPlaybackTransport();
        if (mediaElement && mediaElement === transportSession.currentAudio) {
            transportSession.currentAudio = null;
            transportSession.currentAudioClipId = "";
        }
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
            active: false,
            playing: false,
            buffering: false,
        };
        setMediaBufferingStatusVisible(false);
        if (published.mediaPlaybackState.pauseAnimationOnEnd === true) {
            pauseAnimationFromMedia();
        } else {
            setPlaybackAuthority(PLAYBACK_AUTHORITY_ANIMATION);
        }
        rerender();
    }

    function handlePlayableMediaBuffering(itemId, currentTimeSeconds = 0) {
        if (transportSession.suppressMediaEvents) return;
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId || normalizedId !== published.mediaPlaybackState.itemId) return;
        const missionSeekState = getActiveMissionDrivenMediaSeek(normalizedId);
        if (missionSeekState) {
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
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
        const mediaItem = findCurrentManifestItemById(normalizedId) || published.mediaPlaybackState;
        const animationClockDrivingMedia = isAnimationClockDrivingMedia();
        const syncedTimeMs = animationClockDrivingMedia
            ? readCurrentMissionTimeMs()
            : syncMissionTimeToMediaOffset(mediaItem, Number(currentTimeSeconds) || 0, false);
        const currentSeconds = animationClockDrivingMedia
            ? resolvePlaybackOffsetSeconds(mediaItem, syncedTimeMs, false)
            : Math.max(0, Number(currentTimeSeconds) || 0);
        const wasPlaying = published.mediaPlaybackState.playing === true;
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
            active: true,
            playing: wasPlaying,
            buffering: true,
            syncedTimeMs: Number.isFinite(syncedTimeMs) ? syncedTimeMs : published.mediaPlaybackState.syncedTimeMs,
            currentTimeSeconds: currentSeconds,
        };
        setMediaBufferingStatusVisible(true);
        rerender();
    }

    function syncMissionTimeFromMedia(itemId, currentTimeSeconds) {
        const normalizedId = String(itemId || "").trim();
        if (
            !normalizedId
            || normalizedId !== published.mediaPlaybackState.itemId
            || published.mediaPlaybackState.active !== true
            || !Number.isFinite(published.mediaPlaybackState.startTimeMs)
        ) {
            return;
        }
        const mediaSeconds = Number(currentTimeSeconds);
        if (!Number.isFinite(mediaSeconds) || mediaSeconds < 0) return;
        const mediaItem = findCurrentManifestItemById(published.mediaPlaybackState.itemId) || published.mediaPlaybackState;
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
        const nextTimeMs = published.mediaPlaybackState.startTimeMs + (mediaSeconds * 1000);
        const currentTimelineTimeMs = readMainTimelineTimeMs();
        if (isAnimationClockDrivingMedia()) {
            const syncedTimeMs = Number.isFinite(currentTimelineTimeMs) ? currentTimelineTimeMs : nextTimeMs;
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
                syncedTimeMs,
                currentTimeSeconds: mediaSeconds,
            };
            return;
        }
        const previousSyncedTimeMs = Number(published.mediaPlaybackState.syncedTimeMs);
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
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
                active: true,
                buffering: false,
                syncedTimeMs: currentTimelineTimeMs,
            };
            rerender();
            return;
        }
        const syncedTimeMs = syncMissionTimeToMediaOffset(mediaItem, mediaSeconds, false);
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
            syncedTimeMs: Number.isFinite(syncedTimeMs) ? syncedTimeMs : nextTimeMs,
            currentTimeSeconds: mediaSeconds,
        };
    }

    return {
        getVideoElement,
        setMissionMediaMuted,
        isMediaPlaybackBusy,
        buildForegroundMediaState,
        readCurrentMissionTimeMs,
        getRequestedAnimationRate,
        isFrameScrubMode,
        setPlaybackAuthority,
        isMissionDrivenSeekSource,
        startMissionDrivenMediaSeek,
        getMediaPlaybackRate,
        callMediaMethod,
        setMediaPlaybackRate,
        stopPlayableMedia,
        pausePlayableMediaForAnimationPause,
        pauseActivePlayableMedia,
        seekActivePlayableMediaToMissionTime,
        seekPlayableMediaToSeconds,
        syncFrameScrubPreview,
        syncActivePlayingMediaRate,
        syncPlaybackModeTransition,
        handlePlayableMediaStarted,
        handlePlayableMediaPaused,
        handlePlayableMediaEnded,
        handlePlayableMediaFailed,
        handlePlayableMediaBuffering,
        syncMissionTimeFromMedia,
        getAnimationRateContext,
        shouldUseTransportPlayback,
        ensurePlaybackSession,
        playMediaElement,
        handleVideoSourceReady,
        startPlayableMediaItem,
        startFocusedPlayableMediaFromMissionTime,
        getActivePlayableMediaElement,
        syncActivePlayableMediaToMissionTime,
        forceResyncActiveMedia,
        getPlaybackSession: () => transportSession.playbackSession,
        isHandlingMediaDrivenAnimationStateChange: () => handlingMediaDrivenAnimationStateChange === true,
        resetFrameScrubMode: () => { lastFrameScrubMode = null; },
    };
}
