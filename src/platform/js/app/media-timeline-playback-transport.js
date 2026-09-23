import { isForegroundPlayableMediaItem } from "../core/domain/media-playback-policy.js";
import { resolvePlayableAssetUrl, resolveVideoSourceType } from "./media-timeline-items.js";
import { MEDIA_TRANSPORT_MAX_SIM_SECONDS_PER_REAL_SECOND, MEDIA_TIME_SYNC_EPSILON_SECONDS, MEDIA_TRANSPORT_RESYNC_TOLERANCE_SECONDS, MEDIA_SCRUB_SYNC_INTERVAL_MS, MEDIA_PLAY_RETRY_COOLDOWN_MS, PLAYBACK_AUTHORITY_MEDIA } from "./media-timeline-constants.js";
import { resolvePlaybackOffsetSeconds } from "./media-timeline-browser-effects.js";

export function createMediaPlaybackTransport({
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
}) {
    let pendingPlayRequest = null;
    const lastAppliedMediaRateByElement = typeof WeakMap === "function" ? new WeakMap() : null;

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

    function attachAudioPlaybackEvents(audio, item) {
        if (!audio || typeof audio.addEventListener !== "function" || !item) return;
        transportSession.releaseAudioPlaybackEvents?.();
        const session = ensurePlaybackSession(audio, item.id, "audioClip");
        const listeners = [];
        const listen = (type, callback, transport = true) => {
            const handler = () => {
                if (!isCurrentPlaybackSession(session) || (transport && !session.transportAllowed)) return;
                callback();
            };
            listeners.push([type, handler]);
            audio.addEventListener(type, handler);
        };
        transportSession.releaseAudioPlaybackEvents = () => {
            for (const [type, handler] of listeners) audio.removeEventListener?.(type, handler);
        };
        listen("playing", () => {
            if (audio.paused === true) return;
            handlePlayableMediaStarted(item.id, "audioClip", Number(audio.currentTime));
        });
        for (const eventName of ["loadedmetadata", "durationchange"]) {
            listen(eventName, () => {
                applyMeasuredPlayableDurationSeconds(item.id, Number(audio.duration));
            }, false);
        }
        listen("pause", () => {
            if (audio.ended === true) return;
            handlePlayableMediaPaused(item.id, audio, Number(audio.currentTime));
        });
        listen("ended", () => handlePlayableMediaEnded(item.id));
        listen("timeupdate", () => {
            syncMissionTimeFromMedia(item.id, Number(audio.currentTime));
        });
        for (const eventName of ["waiting", "stalled"]) {
            listen(eventName, () => {
                handlePlayableMediaBuffering(item.id, Number(audio.currentTime));
            });
        }
        for (const eventName of ["abort", "error"]) {
            listen(eventName, () => {
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
        if (published.playbackAuthority === PLAYBACK_AUTHORITY_MEDIA) {
            return true;
        }
        const rateContext = getAnimationRateContext();
        if (rateContext.realtime) return true;
        return Number.isFinite(rateContext.simSecondsPerRealSecond)
            && rateContext.simSecondsPerRealSecond <= MEDIA_TRANSPORT_MAX_SIM_SECONDS_PER_REAL_SECOND;
    }

    function invalidatePlayRequest() {
        pendingPlayRequest = null;
        transportSession.mediaPlayRequestPending = false;
    }

    function suspendPlaybackTransport() {
        if (transportSession.playbackSession) transportSession.playbackSession.transportAllowed = false;
        invalidatePlayRequest();
    }

    function isCurrentPlaybackSession(session) {
        return session === transportSession.playbackSession && session &&
            session.element === (session.kind === "audioClip" ? transportSession.currentAudio : getVideoElement());
    }

    function ensurePlaybackSession(element, itemId, kind) {
        if (!transportSession.playbackSession || transportSession.playbackSession.element !== element ||
            transportSession.playbackSession.itemId !== itemId || transportSession.playbackSession.kind !== kind) {
            invalidatePlayRequest();
            transportSession.playbackSession = { element, itemId, kind, transportAllowed: true };
        }
        return transportSession.playbackSession;
    }

    function playMediaElement(mediaElement, itemId = "", kind = "", {
        force = false,
    } = {}) {
        if (!mediaElement) return;
        const normalizedItemId = String(itemId || "").trim();
        const normalizedKind = String(kind || "").trim();
        const nowMs = Date.now();
        if (transportSession.mediaPlayRequestPending === true) return;
        if (
            force !== true
            && mediaElement.paused === true
            && normalizedItemId
            && transportSession.lastMediaPlayAttempt.itemId === normalizedItemId
            && transportSession.lastMediaPlayAttempt.kind === normalizedKind
            && (nowMs - Number(transportSession.lastMediaPlayAttempt.atMs)) < MEDIA_PLAY_RETRY_COOLDOWN_MS
        ) {
            return;
        }
        if (kind === "audioClip" || kind === "videoClip") {
            try {
                mediaElement.muted = published.missionMediaMuted === true;
            } catch {
                // Some media shims expose read-only properties in tests.
            }
        }
        transportSession.lastMediaPlayAttempt = {
            itemId: normalizedItemId,
            kind: normalizedKind,
            atMs: nowMs,
        };
        const session = ensurePlaybackSession(mediaElement, itemId, kind);
        session.transportAllowed = true;
        const request = {};
        pendingPlayRequest = request;
        const ownsRequest = () => pendingPlayRequest === request &&
            isCurrentPlaybackSession(session) && session.transportAllowed;
        transportSession.mediaPlayRequestPending = true;
        try {
            const playResult = mediaElement?.play?.();
            if (playResult && typeof playResult.then === "function") {
                Promise.resolve(playResult).then(() => {
                    if (!ownsRequest()) return;
                    pendingPlayRequest = null;
                    transportSession.mediaPlayRequestPending = false;
                    if (published.mediaPlaybackState.itemId !== itemId || published.mediaPlaybackState.playing === true) return;
                    if (mediaElement?.paused === true) return;
                    handlePlayableMediaStarted(itemId, kind, Number(mediaElement?.currentTime) || 0);
                }).catch((error) => {
                    if (!ownsRequest()) return;
                    pendingPlayRequest = null;
                    transportSession.mediaPlayRequestPending = false;
                    if (isAbortLikeMediaPlayError(error)) {
                        return;
                    }
                    handlePlayableMediaFailed(itemId, mediaElement);
                });
                return;
            }
            if (ownsRequest()) invalidatePlayRequest();
        } catch {
            if (!ownsRequest()) return;
            invalidatePlayRequest();
            handlePlayableMediaFailed(itemId, mediaElement);
        }
    }

    function handleVideoSourceReady(itemId, currentTimeSeconds = Number.NaN) {
        const normalizedId = String(itemId || "").trim();
        if (!normalizedId || normalizedId !== published.mediaPlaybackState.itemId) return;
        if (published.mediaPlaybackState.kind !== "videoClip" || published.mediaPlaybackState.buffering !== true) return;
        const item = findCurrentManifestItemById(normalizedId);
        if (!item || !isForegroundPlayableMediaItem(item)) return;
        const video = getVideoElement();
        if (!video) return;
        const desiredSeconds = Number.isFinite(Number(published.mediaPlaybackState.currentTimeSeconds))
            ? Number(published.mediaPlaybackState.currentTimeSeconds)
            : (Number.isFinite(Number(currentTimeSeconds)) ? Number(currentTimeSeconds) : 0);
        setMediaPlaybackRate(video, getMediaPlaybackRate());
        const currentSeconds = Number(video.currentTime);
        if (!Number.isFinite(currentSeconds) || Math.abs(currentSeconds - desiredSeconds) >= MEDIA_TIME_SYNC_EPSILON_SECONDS) {
            setMediaElementCurrentTime(video, desiredSeconds);
        }
        if (isAnimationClockDrivingMedia()) {
            if (video.paused === true && transportSession.mediaPlayRequestPending !== true) {
                playMediaElement(video, item.id, "videoClip", { force: true });
            }
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
                active: true,
                playing: true,
                buffering: false,
            };
            rerender();
            return;
        }
        if (transportSession.mediaPlayRequestPending !== true) {
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
                published.mediaPlaybackState = {
                    ...published.mediaPlaybackState,
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
            transportSession.currentAudio = new globalThis.Audio(item.assetUrl);
            transportSession.currentAudio.volume = 0.7;
            transportSession.currentAudio.muted = published.missionMediaMuted === true;
            transportSession.currentAudio.loop = false;
            transportSession.currentAudioClipId = item.id;
            attachAudioPlaybackEvents(transportSession.currentAudio, item);
            setMediaPlaybackRate(transportSession.currentAudio, getMediaPlaybackRate());
            setMediaElementCurrentTime(transportSession.currentAudio, offsetSeconds);
            playMediaElement(transportSession.currentAudio, item.id, "audioClip");
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
            video.muted = published.missionMediaMuted === true;
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
                published.mediaPlaybackState = {
                    ...published.mediaPlaybackState,
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
        if (published.mediaPlaybackState.playing === true) return false;
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
        if (published.mediaPlaybackState.kind === "videoClip") {
            return getVideoElement();
        }
        if (published.mediaPlaybackState.kind === "audioClip") {
            return transportSession.currentAudio;
        }
        return null;
    }

    function pauseMediaElementSilently(mediaElement) {
        if (!mediaElement || typeof mediaElement.pause !== "function") return;
        markSilentMediaPause(mediaElement);
        transportSession.suppressMediaEvents = true;
        callMediaMethod(mediaElement, "pause");
        transportSession.suppressMediaEvents = false;
    }

    function syncActivePlayableMediaToMissionTime(item, missionTimeMs) {
        if (!item || !isForegroundPlayableMediaItem(item) || !Number.isFinite(missionTimeMs)) return;
        if (published.mediaPlaybackState.itemId !== item.id || published.mediaPlaybackState.active !== true) return;
        const itemEndTimeMs = resolveMediaItemEndTimeMs(item);
        if (Number.isFinite(itemEndTimeMs) && missionTimeMs >= itemEndTimeMs) {
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
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
            published.playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            && (
                published.mediaPlaybackState.playing === true
                || published.mediaPlaybackState.buffering === true
                || transportSession.mediaPlayRequestPending === true
            )
            && animationRunning
        ) {
            return;
        }

        if (transportMode && animationRunning) {
            transportSession.scrubSyncState.itemId = item.id;
            transportSession.scrubSyncState.lastAppliedAtMs = nowMs;

            if (!Number.isFinite(currentSeconds) || Math.abs(currentSeconds - targetSeconds) > MEDIA_TRANSPORT_RESYNC_TOLERANCE_SECONDS) {
                setMediaElementCurrentTime(mediaElement, targetSeconds);
            }
            if (mediaElement.paused === true && transportSession.mediaPlayRequestPending !== true) {
                playMediaElement(mediaElement, item.id, item.kind);
            }
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
                active: true,
                playing: published.mediaPlaybackState.playing === true || published.mediaPlaybackState.buffering === true,
                buffering: published.mediaPlaybackState.buffering === true,
                syncedTimeMs: item.startTimeMs + targetSeconds * 1000,
                currentTimeSeconds: targetSeconds,
            };
            return;
        }

        if (
            published.playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
            && published.mediaPlaybackState.buffering === true
        ) {
            if (!Number.isFinite(currentSeconds) || Math.abs(currentSeconds - targetSeconds) >= MEDIA_TIME_SYNC_EPSILON_SECONDS) {
                setMediaElementCurrentTime(mediaElement, targetSeconds);
            }
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
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
            transportSession.scrubSyncState.itemId !== item.id
            || !Number.isFinite(transportSession.scrubSyncState.lastAppliedAtMs)
            || (nowMs - transportSession.scrubSyncState.lastAppliedAtMs) >= MEDIA_SCRUB_SYNC_INTERVAL_MS
            || !Number.isFinite(currentSeconds)
            || Math.abs(currentSeconds - targetSeconds) >= MEDIA_TIME_SYNC_EPSILON_SECONDS
        ) {
            setMediaElementCurrentTime(mediaElement, targetSeconds);
            transportSession.scrubSyncState = {
                itemId: item.id,
                lastAppliedAtMs: nowMs,
            };
        }
        published.mediaPlaybackState = {
            ...published.mediaPlaybackState,
            active: true,
            playing: false,
            buffering: false,
            syncedTimeMs: item.startTimeMs + targetSeconds * 1000,
        };
    }

    function forceResyncActiveMedia() {
        const activePlaybackItem = findCurrentManifestItemById(published.mediaPlaybackState.itemId);
        const focusedItem = getCurrentFocusedMediaItem();
        const targetItem = (activePlaybackItem && isForegroundPlayableMediaItem(activePlaybackItem))
            ? activePlaybackItem
            : ((focusedItem && isForegroundPlayableMediaItem(focusedItem)) ? focusedItem : null);
        if (!targetItem) return false;

        const missionTimeMs = readCurrentMissionTimeMs();
        const animationRunning = getAnimationRunning() === true;
        const hasActiveTarget = published.mediaPlaybackState.itemId === targetItem.id && published.mediaPlaybackState.active === true;

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
            published.mediaPlaybackState = {
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

    return {
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
    };
}
