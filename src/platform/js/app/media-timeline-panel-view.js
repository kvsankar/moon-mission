import { isForegroundPlayableMediaItem, resolvePlayableDurationSeconds } from "../core/domain/media-playback-policy.js";
import { formatDateTimeLocal, formatDateTimeUTC } from "../utils/time-utils.js";
import { buildMediaNavigationModel } from "./media-timeline-focus.js";
import { resolveThumbnailWindowStart, buildThumbnailViewItems } from "./media-timeline-thumbnails.js";
import { resolvePlaybackOffsetSeconds } from "./media-timeline-browser-effects.js";
import {
    formatPlaybackRateLabel,
    formatSyncRateLabel,
    clampMediaCurrentTimeSeconds,
    resolvePreviewAssetUrl,
    resolvePlayableAssetUrl,
    resolveVideoSourceType,
    buildMediaExifLabel,
    buildStageBadge,
    buildTimingNote,
} from "./media-timeline-items.js";

const PLAYBACK_AUTHORITY_MEDIA = "media";

function buildPanelViewModel({
    manifest,
    items,
    selectionItems,
    selection,
    timeMs,
    filterModel,
    missionElapsedStartTimeMs = Number.NaN,
}, {
    mediaPlaybackState,
    previousThumbnailWindowStartIndex,
    requestedAnimationRate,
    frameScrubMode,
    isAnimationRunning,
    currentRateContext,
    playbackAuthority,
    mediaPlaybackRate,
    transportPlayback,
    missionMediaMuted,
    thumbnailQuery,
}) {
    const activeItem = selection.activeItem;
    const seedNote = String(manifest?.ui?.seedNote || "").trim();
    const navigationModel = buildMediaNavigationModel(selectionItems, selection);
    const thumbnailWindowStartIndex = resolveThumbnailWindowStart(
        selectionItems,
        selection,
        timeMs,
        previousThumbnailWindowStartIndex,
    );
    const statusText = items.length === 0
        ? "No media matches the current filters."
        : "";
    const activePlayable = isForegroundPlayableMediaItem(activeItem);
    const activePlaybackSelected = activeItem?.id === mediaPlaybackState.itemId;
    const activePlaybackPlaying = activePlaybackSelected && mediaPlaybackState.playing === true;
    const activePlaybackBuffering = activePlaybackSelected && mediaPlaybackState.buffering === true;
    const activeDurationSeconds = resolvePlayableDurationSeconds(activeItem);
    const activeElapsedSeconds = activePlaybackSelected
        ? clampMediaCurrentTimeSeconds(activeItem, Number(mediaPlaybackState.currentTimeSeconds) || 0)
        : (Number.isFinite(activeDurationSeconds)
            ? resolvePlaybackOffsetSeconds(activeItem, timeMs, false)
            : 0);
    const activeRequestedRate = requestedAnimationRate;
    const frameScrubActive = activePlayable
        && activeItem?.kind === "videoClip"
        && frameScrubMode === true
        && isAnimationRunning === true;
    const activeMediaKindLabel = activeItem?.kind === "videoClip"
        ? "Video"
        : (activeItem?.kind === "audioClip" ? "Audio" : "Media");
    const animationRunning = isAnimationRunning === true;
    const rateContext = currentRateContext;
    const syncRateLabel = formatSyncRateLabel(rateContext);
    const mediaRateLabel = playbackAuthority === PLAYBACK_AUTHORITY_MEDIA
        ? formatPlaybackRateLabel(mediaPlaybackRate)
        : syncRateLabel;
    const transportMode = transportPlayback;
    const syncModeLabel = transportMode ? "transport" : "timeline";
    const activeMediaStatus = activePlaybackBuffering
        ? `${activeMediaKindLabel} buffering`
        : (frameScrubActive
            ? `${activeMediaKindLabel} frame preview (${formatPlaybackRateLabel(activeRequestedRate)} animation)`
            : (!animationRunning
            ? `${activeMediaKindLabel} paused (${syncRateLabel})`
            : (transportMode
                ? (activePlaybackPlaying
                    ? `${activeMediaKindLabel} playing (${mediaRateLabel})`
                    : `${activeMediaKindLabel} ready (${mediaRateLabel})`)
                : `${activeMediaKindLabel} ${syncModeLabel}-synced (${syncRateLabel})`)));
    const stageEmptyText = items.length === 0
        ? "No media matches the current filters."
        : (activeItem
            ? "No preview available for this media item."
            : "Select a filtered media item to preview.");

    const viewModel = {
        panelTitle: String(manifest?.ui?.panelTitle || manifest?.title || "Mission Media").trim(),
        mediaCountLabel: String(items.length),
        descriptionEmptyText: items.length === 0
            ? "No media matches the current filters."
            : "--",
        stageEmptyText,
        seedNote,
        statusText,
        filterModel,
        playbackModel: {
            playable: activePlayable,
            playing: activePlaybackPlaying,
            buffering: activePlaybackBuffering,
            muted: missionMediaMuted === true,
            showControls: activePlayable,
            playLabel: activePlaybackBuffering
                ? "▶"
                : (activePlaybackPlaying ? "⏸" : "▶"),
            playTitle: activePlaybackBuffering
                ? "Resume media playback"
                : (activePlaybackPlaying
                    ? "Pause media playback"
                    : "Play focused media from the current mission time"),
            restartTitle: "Restart media from beginning",
            resyncTitle: "Force resync media with animation",
            statusLabel: activePlayable ? activeMediaStatus : "",
            elapsedSeconds: activePlayable ? activeElapsedSeconds : 0,
            durationSeconds: activePlayable ? activeDurationSeconds : Number.NaN,
            seekEnabled: activePlayable && Number.isFinite(activeDurationSeconds) && activeDurationSeconds > 0,
            sliderTitle: frameScrubActive
                ? "Scrub media while animation is running in high-speed preview mode"
                : "Seek selected media",
        },
        navigationModel,
        focusSource: selection.focusSource || "none",
        activeItem: activeItem
            ? {
                id: activeItem.id,
                kind: activeItem.kind,
                focusSource: selection.focusSource || "none",
                explicit: selection.explicit === true,
                title: activeItem.title,
                description: activeItem.description,
                assetUrl: resolvePreviewAssetUrl(activeItem),
                videoAssetUrl: activeItem.kind === "videoClip" && isForegroundPlayableMediaItem(activeItem)
                    ? resolvePlayableAssetUrl(activeItem)
                    : "",
                sourceType: activeItem.kind === "videoClip" ? resolveVideoSourceType(activeItem) : "",
                mediaStream: activeItem.mediaStream === true,
                posterAssetUrl: activeItem.posterAssetUrl || "",
                playable: activePlayable,
                timeLabel: `${formatDateTimeLocal(activeItem.startTimeMs, { includeOffset: false })} • ${formatDateTimeUTC(activeItem.startTimeMs)}`,
                cameraLabel: activeItem.cameraLabel || (activeItem.kind === "audioClip" ? "Audio" : ""),
                photographer: activeItem.photographer,
                location: activeItem.location,
                sourceLabel: activeItem.sourceLabel || activeItem.fileName,
                settings: activeItem.settings || "",
                shortDescription: activeItem.shortDescription || "",
                tags: activeItem.tags || [],
                subjects: activeItem.subjects || [],
                bodies: activeItem.bodies || [],
                mainBody: activeItem.mainBody || "",
                sceneType: activeItem.sceneType || "",
                compositionHints: activeItem.compositionHints || null,
                qualityNotes: activeItem.qualityNotes || "",
                exifLabel: buildMediaExifLabel(activeItem),
                stageBadge: buildStageBadge(activeItem),
                timingNote: buildTimingNote(activeItem, selection.activeDeltaMs),
            }
            : null,
        thumbnailItems: buildThumbnailViewItems(
            selectionItems,
            selection,
            thumbnailWindowStartIndex,
            thumbnailQuery,
            missionElapsedStartTimeMs,
        ),
        currentTimeMs: timeMs,
    };
    return { viewModel, thumbnailWindowStartIndex };
}

function buildPanelRenderSignature({
    manifest,
    filteredCollections,
    selection,
    timeMs,
}, {
    mediaPlaybackState,
    thumbnailWindowStartIndex,
    playbackFocusId,
    playbackAuthority,
    missionMediaMuted,
    isAnimationRunning,
    frameScrubMode,
    currentRateContext,
}, stableJson) {
    const activeItem = selection?.activeItem || null;
    const playable = isForegroundPlayableMediaItem(activeItem);
    const durationSeconds = playable ? resolvePlayableDurationSeconds(activeItem) : Number.NaN;
    const elapsedSeconds = playable && activeItem
        ? (activeItem.id === mediaPlaybackState.itemId
            ? Number(mediaPlaybackState.currentTimeSeconds) || 0
            : resolvePlaybackOffsetSeconds(activeItem, timeMs, false))
        : 0;
    return stableJson({
        title: manifest?.ui?.panelTitle || manifest?.title || "",
        count: filteredCollections?.filteredSelectableItems?.length || 0,
        filters: filteredCollections?.filterSignature || "",
        thumbnailStart: thumbnailWindowStartIndex,
        activeId: activeItem?.id || "",
        focusSource: selection?.focusSource || "",
        explicit: selection?.explicit === true,
        deltaSecond: Math.round((Number(selection?.activeDeltaMs) || 0) / 1000),
        playbackItemId: mediaPlaybackState.itemId || "",
        playbackKind: mediaPlaybackState.kind || "",
        playbackActive: mediaPlaybackState.active === true,
        playbackPlaying: mediaPlaybackState.playing === true,
        playbackBuffering: mediaPlaybackState.buffering === true,
        playbackAuthority,
        playbackFocusId: playbackFocusId || "",
        muted: missionMediaMuted === true,
        animationRunning: isAnimationRunning === true,
        frameScrubMode: frameScrubMode === true,
        elapsedQuarterSecond: Math.round(elapsedSeconds * 4),
        durationSeconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 4) / 4 : "",
        rate: formatSyncRateLabel(currentRateContext),
    });
}

export { buildPanelViewModel, buildPanelRenderSignature };
