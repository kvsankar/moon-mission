import { buildMediaFilterModel, filterMediaItems } from "../core/domain/media-filter-state.js";
import { resolveNearestMediaIndex } from "../core/domain/media-selection-state.js";
import { buildMediaTimelineMarkers } from "../core/domain/media-timeline-state.js";
import { isForegroundPlayableMediaItem } from "../core/domain/media-playback-policy.js";
import { createRuntimeMediaState } from "../core/state/runtime-media-state.js";
import { createMediaBrowserPanelActions, MEDIA_BROWSER_PANEL_ID } from "./media-browser-panel.js";
import { createBackgroundMediaPanelActions } from "./background-media-panel.js";
import { isMissionPanelEnabled } from "./panel-defaults.js";
import {
    buildSelectableMediaItems,
    buildTimelineMarkerItems,
    findManifestMediaItemById,
} from "./media-timeline-items.js";
import { resolveMissionElapsedStartTimeMs } from "./media-timeline-thumbnails.js";
import { buildPanelViewModel, buildPanelRenderSignature } from "./media-timeline-panel-view.js";
import { createMediaDurationProbe } from "./media-timeline-duration-probe.js";
import { createMediaManifestOwner } from "./media-timeline-manifest-owner.js";
import { createMediaPlaybackRuntime } from "./media-timeline-playback-runtime.js";
import { createMediaSelectionRuntime } from "./media-timeline-selection-runtime.js";
import { PLAYBACK_AUTHORITY_ANIMATION, MISSION_MEDIA_MUTED_STORAGE_KEY } from "./media-timeline-constants.js";
import { readStoredBooleanPreference, seekMainTimelineTime } from "./media-timeline-browser-effects.js";

function createMediaTimelineCoordination({
    getStartTime = () => Number.NaN,
    getLatestEndTime = () => Number.NaN,
    getAnimationRunning = () => false,
    getAnimationSpeedMultiplier = () => 1,
    getAnimationRealtime = () => true,
    getIsCompareMode = () => false,
    playAnimation = () => {},
    pauseAnimation = () => {},
    setTimelineMediaMarkers = () => {},
} = {}) {
    const runtimeMediaState = createRuntimeMediaState();
    let disposed = false;
    let selectionRuntime = null;
    const panelActions = createMediaBrowserPanelActions({
        onIntent: (...args) => selectionRuntime?.handlePanelIntent(...args),
    });
    const backgroundPanelActions = createBackgroundMediaPanelActions({
        getAnimationRunning,
        getAnimationSpeedMultiplier,
        getAnimationRealtime,
        getMissionStartTime: getStartTime,
        onJumpToTime(timeMs) {
            if (disposed) return;
            if (!Number.isFinite(Number(timeMs))) return;
            seekMissionTimelineTime(Number(timeMs), true);
            if (lastRenderContext) {
                lastRenderContext = {
                    ...lastRenderContext,
                    animTime: Number(timeMs),
                };
            }
            rerender();
        },
        onRequestPlay() {
            if (disposed) return;
            if (getAnimationRunning() !== true) {
                playAnimation();
            }
        },
        onRequestPause() {
            if (disposed) return;
            if (getAnimationRunning() === true) {
                pauseAnimation();
            }
        },
    });
    let lastRenderContext = null;
    let timelineEventBound = false;
    let onTimelineMarkerSelect = null;
    let onTimelineUserSeek = null;
    let onMediaPanelStateChanged = null;
    let animationPlayStateEventBound = false;
    let onAnimationPlayStateUpdated = null;
    let handlingAnimationPlayStateEvent = false;
    let playbackAuthority = PLAYBACK_AUTHORITY_ANIMATION;
    let missionMediaMuted = readStoredBooleanPreference(MISSION_MEDIA_MUTED_STORAGE_KEY, false);
    let thumbnailWindowStartIndex = 0;
    let mediaPlaybackState = {
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
    let lastPanelMissionContextSignature = "";
    let lastBackgroundMissionContextSignature = "";
    let filteredCollectionsCache = null;
    let timelineMarkersCache = null;
    let lastAppliedTimelineMediaMarkers = null;
    let mediaDataRevision = 0;
    let lastPanelRenderSignature = "";
    const objectSignatureIds = new WeakMap();
    let nextObjectSignatureId = 1;
    let mediaPanelOpen = false;

    const publishedPlayback = {
        get mediaPlaybackState() { return mediaPlaybackState; },
        set mediaPlaybackState(value) { mediaPlaybackState = value; },
        get playbackAuthority() { return playbackAuthority; },
        set playbackAuthority(value) { playbackAuthority = value; },
        get missionMediaMuted() { return missionMediaMuted; },
        set missionMediaMuted(value) { missionMediaMuted = value; },
        get lastRenderContext() { return lastRenderContext; },
        set lastRenderContext(value) { lastRenderContext = value; },
    };
    const playbackRuntime = createMediaPlaybackRuntime({
        published: publishedPlayback,
        runtimeMediaState,
        getAnimationRunning,
        getAnimationSpeedMultiplier,
        getAnimationRealtime,
        playAnimation,
        pauseAnimation,
        seekMissionTimelineTime,
        findCurrentManifestItemById,
        rerender,
        resolveMediaItemEndTimeMs: (...args) => selectionRuntime?.resolveMediaItemEndTimeMs(...args),
        getCurrentFocusedMediaItem: (...args) => selectionRuntime?.getCurrentFocusedMediaItem(...args),
    });
    const {
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
    } = playbackRuntime;

    const { applyMeasuredPlayableDurationSeconds, releaseDurationProbe, ensurePlayableDurationProbe } =
        createMediaDurationProbe({
            findCurrentManifestItemById,
            invalidateMediaDataCaches,
            callMediaMethod,
            rerender,
            isDisposed: () => disposed,
        });

    const { syncManifestOwner, ensureManifestLoaded } = createMediaManifestOwner({
        runtimeMediaState,
        invalidateMediaDataCaches,
        onOwnerReplaced: () => {
            stopPlayableMedia({ pauseClock: false });
            applyTimelineMediaMarkers([]);
            backgroundPanelActions.render({ items: [], timeMs: Number(lastRenderContext?.animTime),
                animationRunning: false, foregroundMediaState: buildForegroundMediaState() });
        },
        isDisposed: () => disposed,
    });

    selectionRuntime = createMediaSelectionRuntime({
        published: publishedPlayback,
        playback: playbackRuntime,
        isMediaPanelOpen: () => mediaPanelOpen,
        isDisposed: () => disposed,
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
    });
    const {
        getFilteredSelectableItems,
        resolveMediaItemEndTimeMs,
        isMediaItemActiveAtTime,
        isActivePlayableMarkerSeekTime,
        planMissionMediaSelectionSync,
        handleTimelineUserSeek,
        buildCurrentMediaFocusState,
        getCurrentFocusedMediaItem,
        handlePanelIntent,
    } = selectionRuntime;

    function seekMissionTimelineTime(timeMs, finalize = false) {
        return seekMainTimelineTime(timeMs, finalize, {
            startTimeMs: getStartTime(),
            endTimeMs: getLatestEndTime(),
        });
    }

    function findCurrentManifestItemById(itemId) {
        return findManifestMediaItemById(runtimeMediaState.getManifest(), itemId);
    }

    function stableJson(value) {
        try {
            return JSON.stringify(value ?? null);
        } catch {
            return String(value ?? "");
        }
    }

    function getObjectSignatureId(value) {
        if (!value || typeof value !== "object") return "";
        let id = objectSignatureIds.get(value);
        if (!id) {
            id = nextObjectSignatureId;
            nextObjectSignatureId += 1;
            objectSignatureIds.set(value, id);
        }
        return id;
    }

    function buildPanelMissionContextSignature({
        configData,
        available,
        title,
        nextMissionLabel,
        mediaCount,
    } = {}) {
        return stableJson({
            configId: getObjectSignatureId(configData),
            mission: configData?.mission_name_short || configData?.mission_name || "",
            available: available === true,
            title,
            nextMissionLabel,
            mediaCount,
        });
    }

    function invalidateMediaDataCaches() {
        mediaDataRevision += 1;
        filteredCollectionsCache = null;
        timelineMarkersCache = null;
    }

    function applyPanelMissionContext(context = {}) {
        const signature = buildPanelMissionContextSignature(context);
        if (signature === lastPanelMissionContextSignature) return;
        lastPanelMissionContextSignature = signature;
        panelActions.setMissionContext(context);
    }

    function applyBackgroundMissionContext(context = {}) {
        const signature = stableJson({
            configId: getObjectSignatureId(context.configData),
            mission: context.configData?.mission_name_short || context.configData?.mission_name || "",
            available: context.available === true,
        });
        if (signature === lastBackgroundMissionContextSignature) return;
        lastBackgroundMissionContextSignature = signature;
        backgroundPanelActions.setMissionContext(context);
    }

    function getFilteredMediaCollections(manifest, filters) {
        const mediaItems = Array.isArray(manifest?.mediaItems) ? manifest.mediaItems : [];
        const audioItems = Array.isArray(manifest?.audioItems) ? manifest.audioItems : [];
        const filterSignature = stableJson(filters);
        if (
            filteredCollectionsCache
            && filteredCollectionsCache.mediaItems === mediaItems
            && filteredCollectionsCache.audioItems === audioItems
            && filteredCollectionsCache.filterSignature === filterSignature
            && filteredCollectionsCache.mediaDataRevision === mediaDataRevision
        ) {
            return filteredCollectionsCache;
        }

        const filteredItems = filterMediaItems(mediaItems, filters);
        const filteredAudioItems = filterMediaItems(audioItems, filters);
        const filteredSelectableItems = buildSelectableMediaItems(filteredItems, filteredAudioItems);
        const selectableItems = buildTimelineMarkerItems(filteredItems, filteredAudioItems);
        const filterModel = buildMediaFilterModel(
            buildSelectableMediaItems(mediaItems, audioItems),
            filters,
        );
        filteredCollectionsCache = {
            mediaItems,
            audioItems,
            filterSignature,
            mediaDataRevision,
            filteredItems,
            filteredAudioItems,
            filteredSelectableItems,
            selectableItems,
            filterModel,
        };
        return filteredCollectionsCache;
    }

    function getTimelineMediaMarkers({
        items,
        selectedId,
        rangeStartMs,
        rangeEndMs,
        timeMs,
    }) {
        if (
            timelineMarkersCache
            && timelineMarkersCache.items === items
            && timelineMarkersCache.selectedId === selectedId
            && timelineMarkersCache.rangeStartMs === rangeStartMs
            && timelineMarkersCache.rangeEndMs === rangeEndMs
            && timelineMarkersCache.mediaDataRevision === mediaDataRevision
        ) {
            return timelineMarkersCache.markers;
        }
        const markers = buildMediaTimelineMarkers({
            items,
            timeMs,
            rangeStartMs,
            rangeEndMs,
        });
        timelineMarkersCache = {
            items,
            selectedId,
            rangeStartMs,
            rangeEndMs,
            mediaDataRevision,
            markers,
        };
        return markers;
    }

    function applyTimelineMediaMarkers(markers) {
        if (markers === lastAppliedTimelineMediaMarkers) return;
        lastAppliedTimelineMediaMarkers = markers;
        setTimelineMediaMarkers(markers);
    }

    function isMediaBrowserEnabled(globalConfig) {
        return isMissionPanelEnabled(globalConfig, MEDIA_BROWSER_PANEL_ID, {
            fallbackEnabled: false,
        });
    }

    function ensureTimelineEventBinding() {
        if (timelineEventBound) return;
        if (typeof document?.addEventListener !== "function") return;
        timelineEventBound = true;
        onTimelineMarkerSelect = (event) => {
            if (disposed) return;
            const markerId = String(event?.detail?.marker?.id || "").trim();
            const markerTimeMs = Number(event?.detail?.timeMs);
            panelActions.setPanelState?.("open");
            const markerItem = markerId ? findCurrentManifestItemById(markerId) : null;
            if (
                markerItem &&
                isForegroundPlayableMediaItem(markerItem) &&
                mediaPlaybackState.active === true &&
                mediaPlaybackState.itemId === markerItem.id &&
                Number.isFinite(markerTimeMs) &&
                isActivePlayableMarkerSeekTime(markerItem, markerTimeMs)
            ) {
                seekMissionTimelineTime(markerTimeMs, true);
                runtimeMediaState.setActiveItemId(markerItem.id, {
                    anchorTimeMs: markerTimeMs,
                });
                if (lastRenderContext) {
                    lastRenderContext = {
                        ...lastRenderContext,
                        animTime: markerTimeMs,
                    };
                }
                seekActivePlayableMediaToMissionTime(markerTimeMs);
                rerender();
                return;
            }
            handlePanelIntent({
                type: "selectItem",
                value: markerId,
            });
        };
        onTimelineUserSeek = (event) => {
            if (disposed) return;
            handleTimelineUserSeek(event?.detail || {});
        };
        onMediaPanelStateChanged = (event) => {
            if (disposed) return;
            const panelState = String(event?.detail?.state || "").trim().toLowerCase();
            if (!panelState) return;
            mediaPanelOpen = panelState === "open";
            if (mediaPanelOpen) return;
            stopPlayableMedia({ pauseClock: true });
            rerender();
        };
        document.addEventListener("mission-media-marker-select", onTimelineMarkerSelect);
        document.addEventListener("mission-timeline-user-seek", onTimelineUserSeek);
        document.addEventListener("mission-media-panel-state", onMediaPanelStateChanged);
    }

    function ensureAnimationPlayStateBinding() {
        if (animationPlayStateEventBound) return;
        if (typeof document?.addEventListener !== "function") return;
        animationPlayStateEventBound = true;
        onAnimationPlayStateUpdated = (event) => {
            if (disposed) return;
            if (handlingAnimationPlayStateEvent) return;
            handlingAnimationPlayStateEvent = true;
            try {
                const isPlaying = event?.detail?.isPlaying === true;
                const missionTimeMs = readCurrentMissionTimeMs();
                const manifest = runtimeMediaState.getManifest();
                const backgroundItems = Array.isArray(manifest?.mediaItems)
                    ? manifest.mediaItems
                    : [];
                if (backgroundItems.length > 0) {
                    backgroundPanelActions.render({
                        items: backgroundItems,
                        timeMs: missionTimeMs,
                        animationRunning: isPlaying,
                        foregroundMediaState: buildForegroundMediaState(),
                    });
                }
                if (!playbackRuntime.isHandlingMediaDrivenAnimationStateChange()) {
                    setPlaybackAuthority(PLAYBACK_AUTHORITY_ANIMATION);
                }
                if (isPlaying) {
                    if (mediaPlaybackState.active === true) {
                        const activePlaybackItem = findCurrentManifestItemById(mediaPlaybackState.itemId);
                        syncActivePlayableMediaToMissionTime(activePlaybackItem, missionTimeMs);
                        return;
                    }
                    const selectableItems = getFilteredSelectableItems();
                    const focusState = buildCurrentMediaFocusState(
                        selectableItems,
                        readCurrentMissionTimeMs(),
                    );
                    const activeItem = focusState?.activeItem;
                    const explicitSelection = focusState?.focusSource === "user-selection";
                    if (!explicitSelection || !activeItem || !isForegroundPlayableMediaItem(activeItem)) {
                        return;
                    }
                    startPlayableMediaItem(activeItem, {
                        fromBeginning: false,
                        seekTimeline: true,
                        keepAnimationRunning: true,
                    });
                    return;
                }
                pausePlayableMediaForAnimationPause();
            } finally {
                handlingAnimationPlayStateEvent = false;
            }
        };
        document.addEventListener("animation-play-state-updated", onAnimationPlayStateUpdated);
    }

    function releaseTimelineEventBinding() {
        if (timelineEventBound && onTimelineMarkerSelect && typeof document?.removeEventListener === "function") {
            document.removeEventListener("mission-media-marker-select", onTimelineMarkerSelect);
        }
        if (timelineEventBound && onTimelineUserSeek && typeof document?.removeEventListener === "function") {
            document.removeEventListener("mission-timeline-user-seek", onTimelineUserSeek);
        }
        if (timelineEventBound && onMediaPanelStateChanged && typeof document?.removeEventListener === "function") {
            document.removeEventListener("mission-media-panel-state", onMediaPanelStateChanged);
        }
        timelineEventBound = false;
        onTimelineMarkerSelect = null;
        onTimelineUserSeek = null;
        onMediaPanelStateChanged = null;
        selectionRuntime.resetTimelineUserSeekState();
        mediaPanelOpen = false;
    }

    function releaseAnimationPlayStateBinding() {
        if (
            animationPlayStateEventBound
            && onAnimationPlayStateUpdated
            && typeof document?.removeEventListener === "function"
        ) {
            document.removeEventListener("animation-play-state-updated", onAnimationPlayStateUpdated);
        }
        animationPlayStateEventBound = false;
        onAnimationPlayStateUpdated = null;
    }

    function rerender() {
        if (disposed || !lastRenderContext) return;
        update(lastRenderContext);
    }

    function renderPanelIfChanged(renderContext) {
        const signature = buildPanelRenderSignature(renderContext, {
            mediaPlaybackState,
            thumbnailWindowStartIndex,
            playbackFocusId: findCurrentManifestItemById(mediaPlaybackState.itemId)?.id || "",
            playbackAuthority,
            missionMediaMuted,
            isAnimationRunning: getAnimationRunning() === true,
            frameScrubMode: isFrameScrubMode() === true,
            currentRateContext: getAnimationRateContext(),
        }, stableJson);
        if (signature === lastPanelRenderSignature) return;
        lastPanelRenderSignature = signature;
        const projection = buildPanelViewModel({
            manifest: renderContext.manifest,
            items: renderContext.filteredCollections.filteredSelectableItems,
            selectionItems: renderContext.filteredCollections.selectableItems,
            selection: renderContext.selection,
            timeMs: renderContext.timeMs,
            filterModel: renderContext.filteredCollections.filterModel,
            missionElapsedStartTimeMs: renderContext.missionElapsedStartTimeMs,
        }, {
            mediaPlaybackState,
            previousThumbnailWindowStartIndex: thumbnailWindowStartIndex,
            requestedAnimationRate: getRequestedAnimationRate(),
            frameScrubMode: isFrameScrubMode(),
            isAnimationRunning: getAnimationRunning() === true,
            currentRateContext: getAnimationRateContext(),
            playbackAuthority,
            mediaPlaybackRate: getMediaPlaybackRate(),
            transportPlayback: shouldUseTransportPlayback(),
            missionMediaMuted,
            thumbnailQuery: runtimeMediaState.getFilters().query,
        });
        thumbnailWindowStartIndex = projection.thumbnailWindowStartIndex;
        panelActions.render(projection.viewModel);
    }

    function clearUi(globalConfig, {
        statusText = "No media manifest is available for this mission yet.",
    } = {}) {
        thumbnailWindowStartIndex = 0;
        playbackRuntime.resetFrameScrubMode();
        releaseTimelineEventBinding();
        releaseAnimationPlayStateBinding();
        stopPlayableMedia({ pauseClock: isMediaPlaybackBusy() });
        applyTimelineMediaMarkers([]);
        applyPanelMissionContext({
            configData: globalConfig,
            available: false,
            title: "Mission Media",
            nextMissionLabel: String(globalConfig?.mission_name_short || globalConfig?.mission_name || "Current mission").trim(),
            mediaCount: 0,
        });
        applyBackgroundMissionContext({
            configData: globalConfig,
            available: false,
        });
        backgroundPanelActions.render({
            items: [],
            timeMs: Number(lastRenderContext?.animTime),
            animationRunning: false,
            foregroundMediaState: buildForegroundMediaState(),
        });
        panelActions.render({
            panelTitle: "Mission Media",
            mediaCountLabel: "0",
            statusText,
            descriptionEmptyText: "No media available.",
            stageEmptyText: "No media available.",
            filterModel: buildMediaFilterModel([], runtimeMediaState.getFilters()),
            thumbnailItems: [],
        });
        lastPanelRenderSignature = "";
    }

    function update(context = {}) {
        if (disposed) return;
        lastRenderContext = context;

        const globalConfig = context.globalConfig || null;
        const missionName = String(
            globalConfig?.mission_name_short ||
            globalConfig?.mission_name ||
            "Current mission",
        ).trim();
        const compareMode = getIsCompareMode() === true;

        if (compareMode) {
            clearUi(globalConfig, {
                statusText: "Mission media is disabled in compare mode.",
            });
            return;
        }

        if (!isMediaBrowserEnabled(globalConfig)) {
            clearUi(globalConfig, {
                statusText: "Mission media is disabled for this mission.",
            });
            return;
        }

        syncManifestOwner();
        ensureTimelineEventBinding();
        ensureAnimationPlayStateBinding();
        const loadState = runtimeMediaState.getLoadState();
        if (loadState === "idle") {
            ensureManifestLoaded().then(() => rerender());
        }

        const manifest = runtimeMediaState.getManifest();
        const available = globalConfig != null;
        applyPanelMissionContext({
            configData: globalConfig,
            available,
            title: String(manifest?.ui?.panelTitle || manifest?.title || "Mission Media").trim(),
            nextMissionLabel: missionName,
            mediaCount: (Array.isArray(manifest?.mediaItems) ? manifest.mediaItems.length : 0)
                + (Array.isArray(manifest?.audioItems) ? manifest.audioItems.length : 0),
        });
        applyBackgroundMissionContext({
            configData: globalConfig,
            available,
        });

        if (loadState === "loading" || (loadState === "idle" && !manifest)) {
            applyTimelineMediaMarkers([]);
            panelActions.render({
                panelTitle: "Mission Media",
                mediaCountLabel: "--",
                statusText: "Loading mission media manifest...",
                descriptionEmptyText: "Loading mission media manifest...",
                stageEmptyText: "Loading mission media manifest...",
                filterModel: buildMediaFilterModel([], runtimeMediaState.getFilters()),
                thumbnailItems: [],
            });
            lastPanelRenderSignature = "";
            return;
        }

        if (loadState === "error") {
            applyTimelineMediaMarkers([]);
            panelActions.render({
                panelTitle: "Mission Media", mediaCountLabel: "--",
                statusText: "Mission media could not be loaded.",
                descriptionEmptyText: "Check your connection and retry loading mission media.",
                stageEmptyText: "Mission media could not be loaded.",
                manifestRetryAvailable: true,
                filterModel: buildMediaFilterModel([], runtimeMediaState.getFilters()), thumbnailItems: [],
            });
            lastPanelRenderSignature = "";
            return;
        }

        if (!manifest) {
            clearUi(globalConfig);
            return;
        }

        const timeMs = Number.isFinite(context.animTime) ? context.animTime : Date.now();
        const timelineStartMs = Number.isFinite(getStartTime()) ? getStartTime() : Number.NaN;
        const missionElapsedStartTimeMs = resolveMissionElapsedStartTimeMs(globalConfig, timelineStartMs);
        const timelineEndMs = Number.isFinite(getLatestEndTime()) ? getLatestEndTime() : Number.NaN;
        const filters = runtimeMediaState.getFilters();
        const filteredCollections = getFilteredMediaCollections(manifest, filters);
        const {
            filteredItems,
            filteredAudioItems,
            filteredSelectableItems,
            selectableItems,
        } = filteredCollections;
        const selection = buildCurrentMediaFocusState(selectableItems, timeMs);
        const nearestMarkerIndex = resolveNearestMediaIndex(selectableItems, timeMs);
        const selectedMarkerId = nearestMarkerIndex >= 0
            ? selectableItems[nearestMarkerIndex]?.id || ""
            : "";
        ensurePlayableDurationProbe(selection.activeItem);
        syncPlaybackModeTransition(selection.activeItem, timeMs);
        syncFrameScrubPreview(selection.activeItem, timeMs);
        syncActivePlayingMediaRate();
        const activePlaybackItem = findCurrentManifestItemById(mediaPlaybackState.itemId);
        const frameScrubPreviewActive = isFrameScrubMode() === true
            && getAnimationRunning() === true
            && activePlaybackItem?.kind === "videoClip";
        if (!frameScrubPreviewActive) {
            syncActivePlayableMediaToMissionTime(activePlaybackItem, timeMs);
        }
        const backgroundItems = Array.isArray(manifest?.mediaItems)
            ? manifest.mediaItems
            : [];
        backgroundPanelActions.render({
            items: backgroundItems,
            timeMs,
            animationRunning: getAnimationRunning() === true,
            foregroundMediaState: buildForegroundMediaState(),
        });

        applyTimelineMediaMarkers(getTimelineMediaMarkers({
            items: selectableItems,
            selectedId: selectedMarkerId,
            timeMs,
            rangeStartMs: timelineStartMs,
            rangeEndMs: timelineEndMs,
        }));

        renderPanelIfChanged({
            manifest,
            filteredCollections: {
                ...filteredCollections,
                filteredItems,
                filteredAudioItems,
                filteredSelectableItems,
                selectableItems,
            },
            selection,
            timeMs,
            missionElapsedStartTimeMs,
        });
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        const lastTimeMs = Number(lastRenderContext?.animTime);
        lastRenderContext = null;
        releaseTimelineEventBinding();
        releaseAnimationPlayStateBinding();
        releaseDurationProbe();
        stopPlayableMedia({ pauseClock: isMediaPlaybackBusy() });
        backgroundPanelActions.render({
            items: [],
            timeMs: lastTimeMs,
            animationRunning: false,
            foregroundMediaState: buildForegroundMediaState(),
        });
        applyTimelineMediaMarkers([]);
    }

    return {
        update,
        dispose,
    };
}

export {
    createMediaTimelineCoordination,
};
