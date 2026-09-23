import { filterMediaItems, resolveMediaFilterIntent } from "../core/domain/media-filter-state.js";
import { resolveNearestMediaIndex } from "../core/domain/media-selection-state.js";
import { isBackgroundPlaybackMediaItem, isForegroundPlayableMediaItem, isMediaItemActiveAtTime as isMediaItemActiveAtTimeCore, planMissionMediaSelectionSync as planMissionMediaSelectionSyncCore, resolveMediaItemEndTimeMs as resolveMediaItemEndTimeMsCore } from "../core/domain/media-playback-policy.js";
import { getPlayableDurationFallbackSeconds, buildSelectableMediaItems, findMediaItemById } from "./media-timeline-items.js";
import { buildExplicitMediaFocusState, buildTimeProximityMediaFocusState, clampIndex } from "./media-timeline-focus.js";
import { MEDIA_EXPLICIT_FOCUS_TOLERANCE_MS, VIDEO_ESTIMATED_SEGMENT_DURATION_SECONDS, PLAYBACK_AUTHORITY_ANIMATION, PLAYBACK_AUTHORITY_MEDIA } from "./media-timeline-constants.js";
import { dispatchDocumentCustomEvent } from "./media-timeline-browser-effects.js";

export function createMediaSelectionRuntime({
    published,
    playback,
    isMediaPanelOpen,
    isDisposed,
    runtimeMediaState,
    getAnimationRunning,
    getIsCompareMode,
    pauseAnimation,
    ensureManifestLoaded,
    seekMissionTimelineTime,
    findCurrentManifestItemById,
    isMediaBrowserEnabled,
    applyMeasuredPlayableDurationSeconds,
    rerender,
    update,
}) {
    let timelineUserSeekState = {
        active: false,
        animationWasRunning: false,
        stoppedForOutOfRange: false,
    };

    function getFilteredSelectableItems() {
        const manifest = runtimeMediaState.getManifest();
        if (!manifest) return [];
        const filters = runtimeMediaState.getFilters();
        return buildSelectableMediaItems(
            filterMediaItems(manifest.mediaItems || [], filters),
            filterMediaItems(manifest.audioItems || [], filters),
        );
    }

    function resolveMediaItemEndTimeMs(item) {
        return resolveMediaItemEndTimeMsCore(item, {
            fallbackDurationSeconds: getPlayableDurationFallbackSeconds(item),
        });
    }

    function isMediaItemActiveAtTime(item, timeMs) {
        return isMediaItemActiveAtTimeCore(item, timeMs, {
            fallbackDurationSeconds: getPlayableDurationFallbackSeconds(item),
        });
    }

    function isActivePlayableMarkerSeekTime(item, timeMs) {
        if (isMediaItemActiveAtTime(item, timeMs)) return true;
        if (!item || !isForegroundPlayableMediaItem(item) || item.kind !== "videoClip") return false;
        const startTimeMs = Number(item.startTimeMs);
        const markerTimeMs = Number(timeMs);
        if (!Number.isFinite(startTimeMs) || !Number.isFinite(markerTimeMs) || markerTimeMs < startTimeMs) {
            return false;
        }
        const knownEndTimeMs = resolveMediaItemEndTimeMs(item);
        if (Number.isFinite(knownEndTimeMs)) return false;
        const estimatedEndTimeMs = startTimeMs + (VIDEO_ESTIMATED_SEGMENT_DURATION_SECONDS * 1000);
        return markerTimeMs <= estimatedEndTimeMs;
    }

    function planMissionMediaSelectionSync({
        item,
        currentMissionTimeMs = Number.NaN,
        seekTimeline = true,
        preserveCurrentPlayableOffset = false,
        autoStartPlayable = false,
        forceTransportPlayback = false,
    } = {}) {
        return planMissionMediaSelectionSyncCore({
            item,
            currentMissionTimeMs,
            seekTimeline,
            preserveCurrentPlayableOffset,
            autoStartPlayable,
            frameScrubMode: forceTransportPlayback !== true && playback.isFrameScrubMode(),
            fallbackDurationSeconds: getPlayableDurationFallbackSeconds(item),
        });
    }

    function resolvePlayableItemAtTime(timeMs) {
        if (!Number.isFinite(timeMs)) return null;
        const selectableItems = getFilteredSelectableItems();
        const candidates = selectableItems
            .filter((item) => isForegroundPlayableMediaItem(item) && isMediaItemActiveAtTime(item, timeMs));
        if (candidates.length === 0) return null;

        const preferredIds = [
            String(published.mediaPlaybackState.itemId || "").trim(),
            String(runtimeMediaState.getActiveItemId() || "").trim(),
        ].filter(Boolean);
        for (const preferredId of preferredIds) {
            const preferred = candidates.find((item) => item.id === preferredId);
            if (preferred) return preferred;
        }

        let bestItem = candidates[0];
        let bestDelta = Math.abs(timeMs - bestItem.startTimeMs);
        for (let index = 1; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            const delta = Math.abs(timeMs - candidate.startTimeMs);
            if (delta < bestDelta) {
                bestItem = candidate;
                bestDelta = delta;
            }
        }
        return bestItem;
    }

    function keepPlaybackSynchronizedAtTime(timeMs, {
        animationWasRunning = false,
    } = {}) {
        if (isMediaPanelOpen() !== true || animationWasRunning !== true || !Number.isFinite(timeMs)) {
            return false;
        }
        const nextPlayableItem = resolvePlayableItemAtTime(timeMs);
        if (nextPlayableItem) {
            runtimeMediaState.setActiveItemId(nextPlayableItem.id, {
                anchorTimeMs: timeMs,
            });
            const restarted = playback.startPlayableMediaItem(nextPlayableItem, {
                fromBeginning: false,
                seekTimeline: false,
                keepAnimationRunning: animationWasRunning === true,
            });
            if (restarted) {
                return true;
            }
        }
        pauseAnimation();
        return false;
    }

    function handleTimelineUserSeek(eventDetail = {}) {
        const phase = String(eventDetail.phase || "").trim().toLowerCase();
        const source = String(eventDetail.source || "").trim();
        const timeMs = Number(eventDetail.timeMs);
        const commit = eventDetail.commit === true;
        if (!Number.isFinite(timeMs)) return;
        if (source === "media-sync") return;
        playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_ANIMATION);

        if (phase === "start") {
            timelineUserSeekState = {
                active: true,
                animationWasRunning: getAnimationRunning() === true,
                stoppedForOutOfRange: false,
            };
        } else if (!timelineUserSeekState.active) {
            timelineUserSeekState = {
                active: true,
                animationWasRunning: getAnimationRunning() === true,
                stoppedForOutOfRange: false,
            };
        }

        const currentPlayableItem = findCurrentManifestItemById(published.mediaPlaybackState.itemId);
        const currentPlayableActive = !!currentPlayableItem
            && isForegroundPlayableMediaItem(currentPlayableItem)
            && isActivePlayableMarkerSeekTime(currentPlayableItem, timeMs);
        const missionSeekWasPlaying = published.mediaPlaybackState.playing === true || published.mediaPlaybackState.buffering === true;
        if (
            (published.mediaPlaybackState.active === true || published.mediaPlaybackState.playing === true || published.mediaPlaybackState.buffering === true)
            && !currentPlayableActive
        ) {
            playback.stopPlayableMedia({ pauseClock: false });
            timelineUserSeekState.stoppedForOutOfRange = true;
        }
        if (
            currentPlayableActive
            && (published.mediaPlaybackState.active === true || published.mediaPlaybackState.playing === true || published.mediaPlaybackState.buffering === true)
        ) {
            if (published.lastRenderContext) {
                published.lastRenderContext = {
                    ...published.lastRenderContext,
                    animTime: timeMs,
                };
            }
            if (playback.isMissionDrivenSeekSource(source)) {
                playback.startMissionDrivenMediaSeek(currentPlayableItem, timeMs, {
                    source,
                    wasPlaying: missionSeekWasPlaying,
                });
                playback.syncActivePlayableMediaToMissionTime(currentPlayableItem, timeMs);
                rerender();
            } else if (playback.seekActivePlayableMediaToMissionTime(timeMs)) {
                rerender();
            }
        }

        const shouldFinalize = phase === "commit" || phase === "end" || commit;
        if (
            shouldFinalize
            && timelineUserSeekState.animationWasRunning
            && timelineUserSeekState.stoppedForOutOfRange
        ) {
            keepPlaybackSynchronizedAtTime(timeMs, {
                animationWasRunning: true,
            });
        }

        if (phase === "end" || phase === "cancel" || phase === "commit") {
            timelineUserSeekState = {
                active: false,
                animationWasRunning: false,
                stoppedForOutOfRange: false,
            };
            return;
        }

        if (source === "timeline-slider" && phase === "update") {
            // Leave the session open while the user drags/keys through the slider.
            return;
        }
    }

    function getPlaybackFocusItemId() {
        return published.mediaPlaybackState.active === true || published.mediaPlaybackState.playing === true || published.mediaPlaybackState.buffering === true
            ? published.mediaPlaybackState.itemId
            : "";
    }

    function isExplicitFocusCurrent(timeMs) {
        const anchorTimeMs = Number(runtimeMediaState.getActiveItemAnchorTimeMs?.());
        if (!Number.isFinite(anchorTimeMs) || !Number.isFinite(Number(timeMs))) return true;
        return Math.abs(Number(timeMs) - anchorTimeMs) <= MEDIA_EXPLICIT_FOCUS_TOLERANCE_MS;
    }

    function shouldKeepExplicitSelectionActive(activeItem, timeMs) {
        if (!activeItem) return false;
        if (!Number.isFinite(Number(timeMs))) return true;
        return isMediaItemActiveAtTime(activeItem, Number(timeMs));
    }

    function buildCurrentMediaFocusState(items, timeMs) {
        const selectableItems = Array.isArray(items) ? items : getFilteredSelectableItems();
        const playbackItemId = getPlaybackFocusItemId();
        if (playbackItemId) {
            const playbackFocus = buildExplicitMediaFocusState({
                items: selectableItems,
                activeItemId: playbackItemId,
                timeMs,
                nearbyRadius: 3,
                focusSource: "media-playback",
            });
            if (playbackFocus.activeItem) {
                return playbackFocus;
            }
        }

        const activeItemId = runtimeMediaState.getActiveItemId();
        const explicitActiveItem = activeItemId
            ? selectableItems.find((item) => item?.id === activeItemId) || null
            : null;
        if (
            activeItemId &&
            (
                isExplicitFocusCurrent(timeMs)
                || shouldKeepExplicitSelectionActive(explicitActiveItem, timeMs)
            )
        ) {
            const explicitFocus = buildExplicitMediaFocusState({
                items: selectableItems,
                activeItemId,
                timeMs,
                nearbyRadius: 3,
                focusSource: "user-selection",
            });
            if (explicitFocus.activeItem) {
                return explicitFocus;
            }
        }

        if (activeItemId) {
            runtimeMediaState.setActiveItemId("");
        }
        return buildTimeProximityMediaFocusState({
            items: selectableItems,
            timeMs,
            nearbyRadius: 3,
        });
    }

    function getCurrentFocusedMediaItem() {
        return buildCurrentMediaFocusState(
            getFilteredSelectableItems(),
            Number(published.lastRenderContext?.animTime),
        ).activeItem;
    }

    function getPanelSeekMediaItem() {
        const selectableItems = getFilteredSelectableItems();
        const playbackItem = findMediaItemById(selectableItems, published.mediaPlaybackState.itemId);
        if (playbackItem && isForegroundPlayableMediaItem(playbackItem)) {
            return playbackItem;
        }
        const activeItem = findMediaItemById(selectableItems, runtimeMediaState.getActiveItemId());
        if (activeItem && isForegroundPlayableMediaItem(activeItem)) {
            return activeItem;
        }
        const focusedItem = buildCurrentMediaFocusState(
            selectableItems,
            playback.readCurrentMissionTimeMs(),
        ).activeItem;
        return focusedItem && isForegroundPlayableMediaItem(focusedItem) ? focusedItem : null;
    }

    function previewMediaItem(item, {
        seekTimeline = true,
        preserveCurrentPlayableOffset = false,
        autoStartPlayable = false,
        forceTransportPlayback = false,
    } = {}) {
        if (!item) return false;
        if (isBackgroundPlaybackMediaItem(item)) return false;
        const currentMissionTimeMs = playback.readCurrentMissionTimeMs();
        const syncPlan = planMissionMediaSelectionSync({
            item,
            currentMissionTimeMs,
            seekTimeline,
            preserveCurrentPlayableOffset,
            autoStartPlayable,
            forceTransportPlayback,
        });
        if (syncPlan.canApply !== true) return false;

        dispatchDocumentCustomEvent("mission-media-item-select", {
            item,
        });

        if (syncPlan.shouldStopExistingPlayable) {
            playback.stopPlayableMedia({ pauseClock: false });
        }
        if (!syncPlan.shouldSeekTimeline) {
            runtimeMediaState.setActiveItemId(item.id, {
                anchorTimeMs: playback.readCurrentMissionTimeMs(),
            });
            if (syncPlan.shouldStartPlayable) {
                return playback.startPlayableMediaItem(item, {
                    fromBeginning: false,
                    seekTimeline: false,
                    keepAnimationRunning: syncPlan.keepAnimationRunning,
                    forceTransportPlayback,
                });
            }
            rerender();
            return true;
        }
        seekMissionTimelineTime(syncPlan.targetTimeMs, true);
        const anchorTimeMs = playback.readCurrentMissionTimeMs();
        runtimeMediaState.setActiveItemId(item.id, {
            anchorTimeMs: Number.isFinite(anchorTimeMs) ? anchorTimeMs : item.startTimeMs,
        });
        if (Number.isFinite(anchorTimeMs) && published.lastRenderContext) {
            published.lastRenderContext = {
                ...published.lastRenderContext,
                animTime: anchorTimeMs,
            };
        }
        if (syncPlan.shouldStartPlayable) {
            return playback.startPlayableMediaItem(item, {
                fromBeginning: false,
                seekTimeline: false,
                keepAnimationRunning: syncPlan.keepAnimationRunning,
                forceTransportPlayback,
            });
        }
        rerender();
        return true;
    }

    function isCurrentVideoIntent(intent) {
        const item = getCurrentFocusedMediaItem();
        if (!item || item.kind !== "videoClip" || item.id !== intent.value) return false;
        const video = playback.getVideoElement();
        if (intent.mediaElement && intent.mediaElement !== video) return false;
        if (video?.dataset?.mediaItemId && video.dataset.mediaItemId !== item.id) return false;
        if (intent.type !== "mediaPlaybackStarted" && playback.getPlaybackSession()?.element === video &&
            playback.getPlaybackSession()?.kind === "videoClip" &&
            playback.getPlaybackSession()?.transportAllowed !== true) return false;
        // Dataset identity alone cannot identify queued native events on a reused node.
        if (intent.mediaElement) {
            if (intent.type === "mediaPlaybackStarted" && video.paused === true) return false;
            if (intent.type === "mediaPlaybackEnded" && video.ended === false) return false;
        }
        if (intent.type === "mediaPlaybackStarted") {
            if (published.mediaPlaybackState.itemId !== item.id || published.mediaPlaybackState.active !== true) {
                playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            }
            if (video) playback.ensurePlaybackSession(video, item.id, "videoClip").transportAllowed = true;
        }
        return true;
    }

    function handlePanelIntent(intent) {
        if (isDisposed()) return;
        const type = String(intent?.type || "").trim();
        if (!type) return;
        if (type === "retryManifest") {
            if (!published.lastRenderContext || getIsCompareMode() === true ||
                !isMediaBrowserEnabled(published.lastRenderContext.globalConfig) || runtimeMediaState.getLoadState() !== "error") return;
            ensureManifestLoaded({ retry: true }).then(() => rerender());
            rerender();
            return;
        }
        if ((type.startsWith("mediaPlayback") || type === "mediaVideoSourceReady") &&
            !isCurrentVideoIntent(intent)) return;

        const filterIntent = resolveMediaFilterIntent(intent, runtimeMediaState.getFilters());
        if (filterIntent.handled) {
            if (filterIntent.patch) {
                runtimeMediaState.patchFilters(filterIntent.patch);
                if (filterIntent.stopAudioIfExcluded && published.mediaPlaybackState.kind === "audioClip") {
                    playback.stopPlayableMedia({ pauseClock: playback.isMediaPlaybackBusy() });
                }
                rerender();
            }
            return;
        }
        if (type === "selectItem") {
            const selectableItems = getFilteredSelectableItems();
            const selectedItem = selectableItems.find((item) => item.id === intent.value) || null;
            if (!selectedItem) return;
            const autoStartPlayable = getAnimationRunning() === true;
            const forceTransportPlayback = autoStartPlayable && isForegroundPlayableMediaItem(selectedItem);
            if (forceTransportPlayback) {
                playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            }
            previewMediaItem(selectedItem, {
                preserveCurrentPlayableOffset: true,
                autoStartPlayable,
                forceTransportPlayback,
            });
            return;
        }
        if (type === "selectAdjacentItem") {
            const direction = String(intent.value || "").trim() === "previous" ? -1 : 1;
            const selectableItems = getFilteredSelectableItems();
            if (selectableItems.length === 0) {
                runtimeMediaState.setActiveItemId("");
                rerender();
                return;
            }
            const currentFocus = buildCurrentMediaFocusState(
                selectableItems,
                Number(published.lastRenderContext?.animTime),
            );
            const focusedIndex = Number(currentFocus.activeIndex);
            const targetIndex = Number.isInteger(focusedIndex) && focusedIndex >= 0
                ? clampIndex(focusedIndex + direction, selectableItems.length - 1)
                : resolveNearestMediaIndex(selectableItems, Number(published.lastRenderContext?.animTime));
            const selectedItem = selectableItems[targetIndex] || selectableItems[0];
            const autoStartPlayable = getAnimationRunning() === true;
            const forceTransportPlayback = autoStartPlayable && isForegroundPlayableMediaItem(selectedItem);
            if (forceTransportPlayback) {
                playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            }
            previewMediaItem(selectedItem, {
                preserveCurrentPlayableOffset: true,
                autoStartPlayable,
                forceTransportPlayback,
            });
            return;
        }
        if (type === "previewItem") {
            const selectableItems = getFilteredSelectableItems();
            const selectedItem = selectableItems.find((item) => item.id === intent.value) || null;
            const autoStartPlayable = getAnimationRunning() === true;
            const forceTransportPlayback = autoStartPlayable && isForegroundPlayableMediaItem(selectedItem);
            if (forceTransportPlayback) {
                playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            }
            previewMediaItem(selectedItem, {
                preserveCurrentPlayableOffset: true,
                autoStartPlayable,
                forceTransportPlayback,
            });
            return;
        }
        if (type === "mediaSeekTime") {
            const activeItem = getPanelSeekMediaItem();
            if (!activeItem || !isForegroundPlayableMediaItem(activeItem)) return;
            playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            published.mediaPlaybackState = {
                ...published.mediaPlaybackState,
                pauseAnimationOnEnd: true,
            };
            playback.seekPlayableMediaToSeconds(
                activeItem,
                Number(intent.value),
                intent.finalize === true,
            );
            return;
        }
        if (type === "toggleActiveMediaPlayback") {
            if (published.mediaPlaybackState.buffering === true) {
                playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
                published.mediaPlaybackState = {
                    ...published.mediaPlaybackState,
                    pauseAnimationOnEnd: true,
                };
                const activeItem = findCurrentManifestItemById(published.mediaPlaybackState.itemId);
                const mediaElement = playback.getActivePlayableMediaElement();
                if (activeItem && mediaElement) {
                    playback.setMediaPlaybackRate(mediaElement, playback.getMediaPlaybackRate());
                    playback.playMediaElement(mediaElement, activeItem.id, activeItem.kind);
                }
                rerender();
                return;
            }
            if (published.mediaPlaybackState.playing === true) {
                playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
                playback.pauseActivePlayableMedia();
                return;
            }
            const keepAnimationRunning = getAnimationRunning() === true;
            playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            playback.startFocusedPlayableMediaFromMissionTime({
                keepAnimationRunning,
                forceTransportPlayback: true,
                pauseAnimationOnEnd: true,
            });
            return;
        }
        if (type === "toggleMediaMuted") {
            playback.setMissionMediaMuted(!published.missionMediaMuted);
            return;
        }
        if (type === "startActiveMedia" || type === "startActiveMediaFromBeginning") {
            const activeItem = getCurrentFocusedMediaItem();
            if (!activeItem || !isForegroundPlayableMediaItem(activeItem)) return;
            const keepAnimationRunning = getAnimationRunning() === true;
            playback.setPlaybackAuthority(PLAYBACK_AUTHORITY_MEDIA);
            playback.startPlayableMediaItem(activeItem, {
                fromBeginning: type === "startActiveMediaFromBeginning",
                seekTimeline: true,
                keepAnimationRunning,
                forceTransportPlayback: true,
                pauseAnimationOnEnd: true,
            });
            return;
        }
        if (type === "forceResyncActiveMedia") {
            playback.forceResyncActiveMedia();
            return;
        }
        if (type === "mediaPlaybackStarted") {
            playback.handlePlayableMediaStarted(intent.value, intent.mediaKind, intent.currentTime);
            return;
        }
        if (type === "mediaPlaybackBuffering") {
            playback.handlePlayableMediaBuffering(intent.value, intent.currentTime);
            return;
        }
        if (type === "mediaPlaybackPaused") {
            playback.handlePlayableMediaPaused(intent.value, intent.mediaElement || null, intent.currentTime);
            return;
        }
        if (type === "mediaPlaybackEnded") {
            playback.handlePlayableMediaEnded(intent.value);
            return;
        }
        if (type === "mediaPlaybackFailed") {
            playback.handlePlayableMediaFailed(intent.value);
            return;
        }
        if (type === "mediaVideoSourceReady") {
            playback.handleVideoSourceReady(intent.value, intent.currentTime);
            return;
        }
        if (type === "mediaDurationKnown") {
            applyMeasuredPlayableDurationSeconds(intent.value, intent.duration);
            return;
        }
        if (type === "mediaPlaybackTimeUpdate") {
            playback.syncMissionTimeFromMedia(intent.value, intent.currentTime);
        }
    }

    return {
        getFilteredSelectableItems,
        resolveMediaItemEndTimeMs,
        isMediaItemActiveAtTime,
        isActivePlayableMarkerSeekTime,
        planMissionMediaSelectionSync,
        handleTimelineUserSeek,
        buildCurrentMediaFocusState,
        getCurrentFocusedMediaItem,
        handlePanelIntent,
        resetTimelineUserSeekState() {
            timelineUserSeekState = { active: false, animationWasRunning: false, stoppedForOutOfRange: false };
        },
    };
}
