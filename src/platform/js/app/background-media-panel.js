import { registerMissionPanel, updateMissionPanel } from "./panel-registry.js";
import { readMissionPanelState, writeMissionPanelState } from "./panel-layout-store.js";
import { getMissionPanelDefaultState, isMissionPanelEnabled } from "./panel-defaults.js";
import {
    getDockviewSpikeLayoutHost,
    focusDockviewWorkflowPanel,
    resolveDockedWorkflowPanelPosition,
} from "./dockview-workflow-panels.js";
import { bringPanelElementToFront } from "./panel-z-order.js";
import { buildMediaStreamSyncPlan } from "../core/domain/media-stream-sync.js";
import { createBackgroundVideoTransport } from "./background-media-transport.js";
import { createBackgroundPanelGeometry } from "./background-media-panel-geometry.js";
import { createBackgroundTranscriptPresenter } from "./background-media-transcript.js";
import {
    getDocumentRef,
    getWindowRef,
    getNode,
    setText,
    setHidden,
    setNodeText,
    setNodeHidden,
    setNodeTitle,
    setNodeAttribute,
    setDatasetValue,
    setClassToggled,
    syncTimeOverlay,
} from "./background-media-dom.js";
import {
    setCaptionText,
    syncCaptionAttribution,
    syncRenderedCaption,
} from "./background-media-captions.js";
import {
    clamp,
    loadHlsLibrary,
    isBackgroundVideoItem,
    resolveBackgroundCandidates,
    resolveActiveBackgroundItem,
    resolveActiveBackgroundCandidate,
    resolveBackgroundPlaybackMode,
    shouldUseBackgroundTransportPlayback,
    resolveBackgroundPlaybackButtonState,
    resolveNearestInactiveBackgroundItem,
    resolveNearestInactiveBackgroundCandidate,
    resolveItemEndTimeMs,
    resolvePlaybackOffsetSeconds,
    formatVideoRangeInfo,
    formatBroadcastTimingNotes,
    formatRangeDelta,
    formatStatusTime,
} from "./background-media-policy.js";
import {
    PANEL_EDGE_MARGIN_PX,
    getDefaultPanelRect,
    applyPanelRect,
} from "./background-media-layout.js";

const BACKGROUND_MEDIA_PANEL_ID = "workflow:background-media";
const BACKGROUND_MEDIA_LAYOUT_PRESET_VERSION = "background-media-v10-transcript-panel";
const STREAM_HARD_SEEK_THRESHOLD_SECONDS = 6;
const STREAM_SOFT_CORRECTION_THRESHOLD_SECONDS = 0.75;
const BACKGROUND_STATUS_TOAST_DURATION_MS = 3200;

function createBackgroundMediaPanelActions({
    getAnimationRunning = () => false,
    getAnimationSpeedMultiplier = () => 1,
    getAnimationRealtime = () => true,
    getMissionStartTime = () => Number.NaN,
    onJumpToTime = () => {},
    onRequestPlay = () => {},
    onRequestPause = () => {},
    loadHlsLibraryFn = loadHlsLibrary,
} = {}) {
    let missionConfigData = null;
    let panelAvailable = false;
    let panelState = "closed";
    let panelEventsBound = false;
    let playbackEnabled = false;
    let muted = true;
    let captionsEnabled = true;
    let hasStoredMutedPreference = false;
    let expanded = false;
    let animationPlayStateEventBound = false;
    let backgroundStatusToastTimerId = null;
    let lastForegroundEffect = "";
    let storedLayoutMatchesPreset = false;
    let panelLayoutApplied = false;
    let effectiveAudioMuted = true;
    let mutedForForegroundMedia = false;
    let playbackTimelineRunning = false;
    let lastPlaybackMode = "";
    let lastRenderModel = {
        items: [],
        timeMs: Number.NaN,
        animationRunning: false,
    };
    let timelineSeekItem = null;

    const videoTransport = createBackgroundVideoTransport({
        getVideo,
        getMuted: () => muted,
        getCaptionsEnabled: () => captionsEnabled,
        getAnimationRealtime,
        getAnimationSpeedMultiplier,
        loadHlsLibraryFn,
        onSourceReady: () => render(lastRenderModel),
    });
    const {
        clearVideoSource,
        configureVideoSource,
        pauseVideo,
        keepHlsLoadingForFramePreview,
        playVideo,
        setVideoCurrentTime,
        setVideoPlaybackRate,
    } = videoTransport;

    const geometry = createBackgroundPanelGeometry({
        getPanel,
        isBackgroundMediaPanelDocked,
        getExpanded: () => expanded,
        onPersistRect: (rect) => persistState({ rect }),
        onManualResize: () => { panelLayoutApplied = true; },
    });
    const { bindPanelDragging, bindPanelResizing } = geometry;

    const { clearTranscriptPanel, syncTranscriptPanel } = createBackgroundTranscriptPresenter({
        getPanel,
        isDockviewBackgroundMediaPanelEnabled,
        isTimelineRunning: () => playbackTimelineRunning,
        onJumpToTime,
    });

    function requestWorkflowStackLayout() {
        const documentRef = getDocumentRef();
        if (!documentRef?.dispatchEvent || typeof CustomEvent !== "function") return;
        documentRef.dispatchEvent(new CustomEvent("moon-mission:workflow-panel-stack-layout"));
    }

    function getPanel() {
        return getNode("background-media-panel");
    }

    function getWrapper() {
        return getNode("background-media-panel-wrapper");
    }

    function isDockviewBackgroundMediaPanelEnabled() {
        return !!getDockviewSpikeLayoutHost();
    }

    function isBackgroundMediaPanelDocked(panel = getPanel()) {
        return !!panel?.classList?.contains?.("background-media-panel--dockview");
    }

    function ensureBackgroundMediaPanelDocked(panel = getPanel()) {
        if (!panel) return false;
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        if (layoutHost.focusPanel(BACKGROUND_MEDIA_PANEL_ID)) {
            return true;
        }
        layoutHost.addPanel({
            id: BACKGROUND_MEDIA_PANEL_ID,
            component: "mounted-element",
            title: "Flyby Broadcast",
            position: resolveDockedWorkflowPanelPosition(layoutHost, BACKGROUND_MEDIA_PANEL_ID),
            params: {
                mountElementId: "background-media-panel",
                mountClassName: "background-media-panel--dockview",
                fallbackParentId: "background-media-panel-wrapper",
            },
            initialWidth: 300,
            minimumWidth: 260,
            minimumHeight: 160,
        });
        layoutHost.focusPanel(BACKGROUND_MEDIA_PANEL_ID);
        return true;
    }

    function closeDockedBackgroundMediaPanel() {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        return layoutHost.closePanel(BACKGROUND_MEDIA_PANEL_ID);
    }

    function getVideo() {
        return getNode("background-media-video");
    }

    function persistState(patch = {}) {
        writeMissionPanelState(BACKGROUND_MEDIA_PANEL_ID, {
            state: panelState,
            playbackEnabled,
            muted,
            captionsEnabled,
            mutedPreferenceSet: hasStoredMutedPreference === true,
            expanded,
            layoutPresetVersion: BACKGROUND_MEDIA_LAYOUT_PRESET_VERSION,
            ...patch,
        });
    }

    function showBackgroundStatusToast(message) {
        const status = getNode("background-video-status");
        const text = getNode("background-video-status-text");
        if (!status || !text) return;
        setNodeText(text, String(message || "").trim() || "Background video updated");
        setNodeHidden(status, false);
        setDatasetValue(status, "status", "done");
        setClassToggled(status, "background-video-status--hidden", false);
        if (backgroundStatusToastTimerId != null) {
            getWindowRef()?.clearTimeout?.(backgroundStatusToastTimerId);
            backgroundStatusToastTimerId = null;
        }
        backgroundStatusToastTimerId = getWindowRef()?.setTimeout?.(() => {
            setClassToggled(status, "background-video-status--hidden", true);
            setNodeHidden(status, true);
            backgroundStatusToastTimerId = null;
        }, BACKGROUND_STATUS_TOAST_DURATION_MS) ?? null;
    }

    function getPanelRegistryState() {
        if (!panelAvailable) return "closed";
        return panelState;
    }

    function syncPanelRegistry() {
        const panelStateName = getPanelRegistryState();
        updateMissionPanel(BACKGROUND_MEDIA_PANEL_ID, {
            available: panelAvailable,
            state: panelStateName,
            actions: {
                open: panelAvailable ? openPanel : null,
                restore: panelAvailable ? openPanel : null,
                focus: panelAvailable ? () => focusPanel({ reveal: true }) : null,
                close: panelAvailable ? closePanel : null,
                delete: panelAvailable && panelStateName !== "deleted" ? confirmDeletePanel : null,
            },
        });
    }

    function syncButtons() {
        const enableButton = getNode("background-media-enable");
        if (enableButton) {
            const buttonState = resolveBackgroundPlaybackButtonState({
                playbackEnabled,
                animationRunning: playbackTimelineRunning,
            });
            setClassToggled(enableButton, "is-active", playbackEnabled);
            setNodeAttribute(enableButton, "aria-pressed", buttonState.pressed ? "true" : "false");
            setNodeText(enableButton, buttonState.label);
            setNodeTitle(enableButton, buttonState.title);
            setNodeAttribute(enableButton, "aria-label", enableButton.title);
        }
        const muteButton = getNode("background-media-mute");
        if (muteButton) {
            const buttonMuted = effectiveAudioMuted === true;
            const audioStatus = mutedForForegroundMedia === true
                ? "foreground-muted"
                : (buttonMuted ? "muted" : "audible");
            setNodeText(muteButton, "");
            setNodeAttribute(muteButton, "aria-pressed", muted ? "true" : "false");
            setDatasetValue(muteButton, "icon", buttonMuted ? "speaker-muted" : "speaker");
            setDatasetValue(muteButton, "audioStatus", audioStatus);
            setNodeTitle(muteButton, mutedForForegroundMedia === true
                ? "Muted for foreground media"
                : (muted ? "Unmute background video" : "Mute background video"));
            setNodeAttribute(muteButton, "aria-label", muteButton.title);
        }
        const captionsButton = getNode("background-media-captions");
        if (captionsButton) {
            setNodeText(captionsButton, "");
            setNodeAttribute(captionsButton, "aria-pressed", captionsEnabled ? "true" : "false");
            setDatasetValue(captionsButton, "icon", "captions");
            setDatasetValue(captionsButton, "captionStatus", captionsEnabled ? "shown" : "hidden");
            setNodeTitle(captionsButton, captionsEnabled ? "Hide subtitles" : "Show subtitles");
            setNodeAttribute(captionsButton, "aria-label", captionsButton.title);
        }
        const expandButton = getNode("background-media-panel-expand");
        if (expandButton) {
            setNodeAttribute(expandButton, "aria-pressed", expanded ? "true" : "false");
            setDatasetValue(expandButton, "icon", expanded ? "restore" : "expand");
            setNodeTitle(expandButton, expanded ? "Restore" : "Expand");
        }
    }

    function syncPanelVisibility({
        forceLayout = false,
    } = {}) {
        const wrapper = getWrapper();
        const panel = getPanel();
        if (!wrapper || !panel) return;
        const visible = panelAvailable && panelState === "open";
        if (isDockviewBackgroundMediaPanelEnabled()) {
            if (visible) {
                ensureBackgroundMediaPanelDocked(panel);
            } else if (isBackgroundMediaPanelDocked(panel)) {
                closeDockedBackgroundMediaPanel();
            }
        }
        const docked = isBackgroundMediaPanelDocked(panel);
        if (docked) {
            expanded = false;
        }
        setNodeHidden(wrapper, docked || !visible);
        setClassToggled(panel, "background-media-panel--hidden", !visible);
        setClassToggled(panel, "is-maximized", expanded);
        if (!visible) {
            panelLayoutApplied = false;
        }
        if (visible && docked) {
            panelLayoutApplied = true;
        } else if (visible) {
            if (expanded) {
                const expandedRect = {
                    left: `${PANEL_EDGE_MARGIN_PX}px`,
                    top: `${PANEL_EDGE_MARGIN_PX}px`,
                    width: `calc(100vw - ${PANEL_EDGE_MARGIN_PX * 2}px)`,
                    height: `calc(100vh - ${PANEL_EDGE_MARGIN_PX * 2}px)`,
                };
                for (const [name, value] of Object.entries(expandedRect)) {
                    if (panel.style[name] !== value) panel.style[name] = value;
                }
            } else if (!geometry.isDragging() && (forceLayout === true || panelLayoutApplied !== true)) {
                const saved = readMissionPanelState(BACKGROUND_MEDIA_PANEL_ID);
                const useSavedRect = storedLayoutMatchesPreset === true && saved?.rect;
                const appliedRect = applyPanelRect(
                    panel,
                    useSavedRect ? saved.rect : getDefaultPanelRect(),
                );
                panelLayoutApplied = true;
                if (!useSavedRect) {
                    persistState({ rect: appliedRect });
                    storedLayoutMatchesPreset = true;
                }
                requestWorkflowStackLayout();
            }
        }
        syncButtons();
        syncPanelRegistry();
    }

    function bringPanelToFront() {
        if (isBackgroundMediaPanelDocked()) return;
        bringPanelElementToFront(getWrapper());
    }

    function confirmDeletePanel() {
        const confirmFn = globalThis?.confirm;
        if (typeof confirmFn === "function") {
            const accepted = confirmFn(
                'Delete "Flyby Broadcast" from this mission layout? You can add it back from the Panels menu.',
            );
            if (!accepted) return false;
        }
        panelState = "deleted";
        panelLayoutApplied = false;
        playbackEnabled = false;
        pauseVideo();
        clearVideoSource();
        persistState();
        syncPanelVisibility();
        return true;
    }

    function setControlsHidden(hidden) {
        const controls = getNode("background-media-controls");
        setNodeHidden(controls, hidden === true);
    }

    function getTimelineDurationSeconds(item) {
        const durationSeconds = Number(item?.durationSeconds);
        if (Number.isFinite(durationSeconds) && durationSeconds > 0) return durationSeconds;
        const startTimeMs = Number(item?.startTimeMs);
        const endTimeMs = resolveItemEndTimeMs(item);
        if (!Number.isFinite(startTimeMs) || !Number.isFinite(endTimeMs) || endTimeMs <= startTimeMs) {
            return Number.NaN;
        }
        return (endTimeMs - startTimeMs) / 1000;
    }

    function syncTimelineSlider(item, offsetSeconds = Number.NaN) {
        const slider = getNode("background-media-timeline");
        if (!slider) return;
        timelineSeekItem = item || null;
        const durationSeconds = getTimelineDurationSeconds(item);
        const safeOffsetSeconds = Number(offsetSeconds);
        const hasTimeline = Number.isFinite(durationSeconds) && durationSeconds > 0;
        slider.disabled = !hasTimeline;
        setNodeAttribute(slider, "aria-disabled", hasTimeline ? "false" : "true");
        slider.min = "0";
        slider.max = hasTimeline ? String(Math.max(0.25, durationSeconds)) : "0";
        slider.step = "0.25";
        const value = hasTimeline && Number.isFinite(safeOffsetSeconds)
            ? clamp(safeOffsetSeconds, 0, durationSeconds)
            : 0;
        slider.value = String(value);
        setNodeAttribute(slider, "aria-valuetext", hasTimeline ? formatStatusTime(value) : "Unavailable");
    }

    function seekToTimelineValue() {
        const slider = getNode("background-media-timeline");
        const item = timelineSeekItem;
        const startTimeMs = Number(item?.startTimeMs);
        const valueSeconds = Number(slider?.value);
        if (!slider || !item || !Number.isFinite(startTimeMs) || !Number.isFinite(valueSeconds)) return;
        const timeOffsetSeconds = Number(item?.timeOffsetSeconds);
        const missionOffsetSeconds = valueSeconds - (Number.isFinite(timeOffsetSeconds) ? timeOffsetSeconds : 0);
        onJumpToTime(startTimeMs + missionOffsetSeconds * 1000, item);
    }

    function openPanel() {
        if (!panelAvailable) return;
        panelState = "open";
        panelLayoutApplied = false;
        persistState();
        syncPanelVisibility();
        bringPanelToFront();
        focusPanel();
    }

    function closePanel() {
        panelState = "closed";
        panelLayoutApplied = false;
        persistState();
        clearVideoSource();
        syncPanelVisibility();
    }

    function focusPanel({ reveal = false } = {}) {
        const panel = getPanel();
        if (!panel || panel.classList.contains("background-media-panel--hidden")) return;
        if (isBackgroundMediaPanelDocked(panel)) {
            if (reveal) {
                focusDockviewWorkflowPanel(BACKGROUND_MEDIA_PANEL_ID);
            } else {
                getDockviewSpikeLayoutHost()?.focusPanel?.(BACKGROUND_MEDIA_PANEL_ID);
            }
        }
        panel.focus?.();
    }

    function toggleExpanded() {
        if (isBackgroundMediaPanelDocked()) {
            expanded = false;
            persistState();
            syncPanelVisibility();
            return;
        }
        const wasExpanded = expanded === true;
        expanded = !expanded;
        persistState();
        syncPanelVisibility({ forceLayout: wasExpanded && expanded !== true });
    }

    function togglePlaybackEnabled() {
        if (playbackEnabled === true && getAnimationRunning() !== true) {
            onRequestPlay();
            syncButtons();
            render(lastRenderModel);
            return;
        }
        playbackEnabled = !playbackEnabled;
        persistState();
        if (!playbackEnabled) {
            pauseVideo();
            setText("background-media-status", "Paused");
            onRequestPause();
        } else {
            onRequestPlay();
        }
        syncButtons();
        render(lastRenderModel);
    }

    function toggleMuted() {
        muted = !muted;
        hasStoredMutedPreference = true;
        effectiveAudioMuted = muted;
        mutedForForegroundMedia = false;
        const video = getVideo();
        if (video && video.muted !== muted) video.muted = muted;
        persistState();
        syncButtons();
        render(lastRenderModel);
    }

    function toggleCaptions() {
        captionsEnabled = !captionsEnabled;
        persistState();
        if (!captionsEnabled) {
            setCaptionText("");
            syncCaptionAttribution(null, captionsEnabled);
        }
        syncButtons();
        render(lastRenderModel);
    }

    function renderEmptyState(lines = []) {
        const empty = getNode("background-media-empty");
        if (!empty) return;
        empty.replaceChildren();
        const normalizedLines = lines.map((line) => String(line || "").trim()).filter(Boolean);
        if (normalizedLines.length === 0) {
            empty.textContent = "No background video at this mission time.";
            return;
        }
        normalizedLines.forEach((line, index) => {
            const row = getDocumentRef()?.createElement?.(index === 0 ? "strong" : "span");
            if (!row) return;
            row.textContent = line;
            empty.appendChild(row);
        });
    }

    function appendEmptyStateText(parent, tagName, className, text) {
        const node = getDocumentRef()?.createElement?.(tagName);
        if (!node) return null;
        if (className) node.className = className;
        node.textContent = text;
        parent.appendChild(node);
        return node;
    }

    function jumpToBackgroundItemStart(item) {
        const startTimeMs = Number(item?.startTimeMs);
        if (!Number.isFinite(startTimeMs)) return;
        playbackEnabled = true;
        persistState();
        syncButtons();
        onJumpToTime(startTimeMs, item);
        onRequestPlay();
    }

    function renderBroadcastAvailabilityState(nearest) {
        const empty = getNode("background-media-empty");
        if (!empty || !nearest?.item) return false;
        empty.replaceChildren();
        const item = nearest.item;
        const deltaLabel = formatRangeDelta(nearest.deltaMs);
        const isBefore = nearest.relation === "before";
        appendEmptyStateText(
            empty,
            "span",
            "background-media-panel__empty-kicker",
            "Lunar flyby broadcast",
        );
        appendEmptyStateText(
            empty,
            "strong",
            "background-media-panel__empty-headline",
            "Broadcast video is available for the flyby.",
        );
        appendEmptyStateText(
            empty,
            "span",
            "background-media-panel__empty-copy",
            isBefore
                ? `It starts in ${deltaLabel}.`
                : `This point is after the broadcast; it ended ${deltaLabel} ago.`,
        );
        const button = getDocumentRef()?.createElement?.("button");
        if (button) {
            button.type = "button";
            button.className = "background-media-panel__jump-button";
            button.textContent = "Jump to broadcast start";
            button.addEventListener?.("click", () => jumpToBackgroundItemStart(item));
            empty.appendChild(button);
        }
        formatBroadcastTimingNotes(item, getMissionStartTime()).forEach((line) => {
            appendEmptyStateText(empty, "span", "background-media-panel__empty-note", line);
        });
        return true;
    }

    function renderOutOfRangeState(candidates, timeMs) {
        const nearest = resolveNearestInactiveBackgroundCandidate(candidates, timeMs);
        if (!nearest?.item) {
            renderEmptyState(["No background video at this mission time."]);
            setText("background-media-title", candidates.length > 0 ? "No background video in range" : "No background videos configured");
            setText("background-media-status", "Not in range");
            return;
        }
        const title = nearest.item.title || "Background video";
        const deltaLabel = formatRangeDelta(nearest.deltaMs);
        if (!renderBroadcastAvailabilityState(nearest)) {
            renderEmptyState([
                "Broadcast video is available for the flyby.",
                ...formatVideoRangeInfo(nearest.item, getMissionStartTime()),
            ]);
        }
        setText("background-media-title", title);
        setText(
            "background-media-status",
            nearest.relation === "before" ? `Available in ${deltaLabel}` : "Available at flyby",
        );
    }

    function ensurePanelEventsBound() {
        if (panelEventsBound) return;
        const panel = getPanel();
        if (!panel) return;
        panelEventsBound = true;
        const headerControls = panel.querySelector?.(".background-media-panel__header-controls");
        const closeButton = getNode("background-media-panel-close");
        closeButton?.setAttribute?.("aria-label", "Close Broadcast panel");
        if (closeButton) closeButton.title = "Close";
        let deleteButton = getNode("background-media-panel-delete");
        if (!deleteButton && headerControls?.appendChild) {
            deleteButton = getDocumentRef()?.createElement?.("button") || null;
            if (deleteButton) {
                deleteButton.id = "background-media-panel-delete";
                deleteButton.className = "background-media-panel__icon-button mission-panel-shell__button mission-panel-shell__button--icon mission-panel-shell__button--danger";
                deleteButton.type = "button";
                deleteButton.title = "Delete";
                deleteButton.setAttribute?.("aria-label", "Delete Broadcast panel");
                deleteButton.dataset.icon = "delete";
                deleteButton.textContent = "";
                headerControls.appendChild(deleteButton);
            }
        }

        closeButton?.addEventListener?.("click", closePanel);
        deleteButton?.addEventListener?.("click", confirmDeletePanel);
        getNode("background-media-panel-expand")?.addEventListener?.("click", toggleExpanded);
        getNode("background-media-enable")?.addEventListener?.("click", togglePlaybackEnabled);
        getNode("background-media-mute")?.addEventListener?.("click", toggleMuted);
        getNode("background-media-captions")?.addEventListener?.("click", toggleCaptions);
        getNode("background-media-timeline")?.addEventListener?.("input", seekToTimelineValue);
        getDocumentRef()?.addEventListener?.("moon-mission:dockview-panel-mounted", (event) => {
            if (event?.detail?.mountElementId === "background-media-transcript") {
                render(lastRenderModel);
            }
        });
        panel.addEventListener?.("pointerdown", bringPanelToFront, true);
        bindPanelDragging();
        bindPanelResizing();
        const video = getVideo();
        ["loadedmetadata", "canplay"].forEach((eventName) => {
            video?.addEventListener?.(eventName, () => render(lastRenderModel));
        });
        getWindowRef()?.addEventListener?.("resize", () => {
            if (panelState === "open") syncPanelVisibility({ forceLayout: true });
        }, { passive: true });
    }

    function ensureAnimationPlayStateEventBound() {
        if (!animationPlayStateEventBound && typeof getDocumentRef()?.addEventListener === "function") {
            animationPlayStateEventBound = true;
            getDocumentRef().addEventListener("animation-play-state-updated", (event) => {
                render({
                    ...lastRenderModel,
                    animationRunning: event?.detail?.isPlaying === true,
                });
            });
        }
    }

    function restoreStoredState() {
        const stored = readMissionPanelState(BACKGROUND_MEDIA_PANEL_ID);
        storedLayoutMatchesPreset = String(stored?.layoutPresetVersion || "").trim()
            === BACKGROUND_MEDIA_LAYOUT_PRESET_VERSION;
        const useStoredState = storedLayoutMatchesPreset === true;
        if (useStoredState && typeof stored?.playbackEnabled === "boolean") {
            playbackEnabled = stored.playbackEnabled;
        }
        if (
            useStoredState
            && stored?.mutedPreferenceSet === true
            && typeof stored?.muted === "boolean"
        ) {
            muted = stored.muted;
            hasStoredMutedPreference = true;
        } else {
            hasStoredMutedPreference = false;
        }
        if (useStoredState && typeof stored?.expanded === "boolean") {
            expanded = stored.expanded;
        }
        captionsEnabled = useStoredState && typeof stored?.captionsEnabled === "boolean"
            ? stored.captionsEnabled
            : true;
        panelState = (useStoredState ? stored?.state : "") || getMissionPanelDefaultState(
            missionConfigData,
            BACKGROUND_MEDIA_PANEL_ID,
            { fallbackState: "closed" },
        );
    }

    function setMissionContext({
        configData,
        available,
    } = {}) {
        missionConfigData = configData || missionConfigData;
        const enabledByMission = missionConfigData
            ? isMissionPanelEnabled(missionConfigData, BACKGROUND_MEDIA_PANEL_ID, { fallbackEnabled: false })
            : false;
        panelAvailable = available === true && enabledByMission;
        ensurePanelEventsBound();
        if (panelAvailable) {
            ensureAnimationPlayStateEventBound();
        }
        restoreStoredState();
        if (!panelAvailable) {
            clearVideoSource();
        }
        syncPanelVisibility();
    }

    function render({
        items = [],
        timeMs = Number.NaN,
        animationRunning = false,
        foregroundMediaState = null,
    } = {}) {
        ensurePanelEventsBound();
        lastRenderModel = {
            items,
            timeMs,
            animationRunning,
            foregroundMediaState,
        };
        const candidates = resolveBackgroundCandidates(items);
        const activeItem = resolveActiveBackgroundCandidate(candidates, timeMs);
        const available = panelAvailable && candidates.length > 0;
        playbackTimelineRunning = playbackEnabled === true && animationRunning === true;
        if (!available || !activeItem) {
            const nearest = available ? resolveNearestInactiveBackgroundCandidate(candidates, timeMs) : null;
            lastPlaybackMode = "";
            lastForegroundEffect = "";
            setControlsHidden(true);
            syncTimeOverlay(Number.NaN, true);
            syncTimelineSlider(null);
            setCaptionText("");
            if (nearest?.item) {
                syncTranscriptPanel(nearest.item, Number.NaN, () => render(lastRenderModel));
            } else {
                clearTranscriptPanel();
            }
            setHidden("background-media-empty", false);
            setHidden("background-media-live", true);
            if (available) {
                renderOutOfRangeState(candidates, timeMs);
            } else {
                renderEmptyState(["No background videos configured."]);
                setText("background-media-title", "No background videos configured");
                setText("background-media-status", "Unavailable");
            }
            clearVideoSource();
            return;
        }

        setControlsHidden(false);
        setHidden("background-media-empty", true);
        setText("background-media-title", activeItem.title || "Background video");
        const video = getVideo();
        const foregroundMediaActive = foregroundMediaState?.active === true;
        const foregroundMediaKind = String(foregroundMediaState?.kind || "").trim();
        const playbackMode = resolveBackgroundPlaybackMode({
            panelState,
            playbackEnabled,
            animationRunning,
            foregroundMediaActive,
            foregroundMediaKind,
        });
        const sourceChanged = !videoTransport.matchesSource(activeItem);
        const offsetSeconds = resolvePlaybackOffsetSeconds(activeItem, timeMs);
        syncTimeOverlay(offsetSeconds, false, timeMs, getMissionStartTime());
        syncTimelineSlider(activeItem, offsetSeconds);
        syncCaptionAttribution(activeItem, captionsEnabled);
        syncRenderedCaption(activeItem, offsetSeconds, () => render(lastRenderModel), captionsEnabled);
        syncTranscriptPanel(activeItem, offsetSeconds, () => render(lastRenderModel));

        if (playbackMode === "ready") {
            const keepPausedSource = panelState === "open" && playbackEnabled === true;
            if (keepPausedSource) {
                if (sourceChanged) {
                    configureVideoSource(activeItem);
                }
                setVideoCurrentTime(offsetSeconds, { force: sourceChanged });
                if (!hasStoredMutedPreference) {
                    muted = activeItem.backgroundPlayback?.muted !== false;
                }
                effectiveAudioMuted = muted;
                mutedForForegroundMedia = false;
                if (video && video.muted !== muted) video.muted = muted;
                pauseVideo();
                lastPlaybackMode = playbackMode;
                setHidden("background-media-live", true);
                setText("background-media-status", `Paused ${formatStatusTime(offsetSeconds)}`);
                syncButtons();
                return;
            }
            if (lastPlaybackMode !== "ready") {
                pauseVideo();
            }
            clearVideoSource();
            lastPlaybackMode = playbackMode;
            setHidden("background-media-live", true);
            setText(
                "background-media-status",
                playbackEnabled ? `Paused ${formatStatusTime(offsetSeconds)}` : "Paused",
            );
            syncButtons();
            return;
        }

        if (sourceChanged) {
            configureVideoSource(activeItem);
        }

        const streamSyncPlan = buildMediaStreamSyncPlan({
            stream: activeItem,
            missionTimeMs: timeMs,
            isMissionPlaying: playbackMode === "playing" || playbackMode === "muted-for-foreground",
            currentPlaybackTimeSeconds: Number(video?.currentTime),
            hardSeekThresholdSeconds: STREAM_HARD_SEEK_THRESHOLD_SECONDS,
            softCorrectionThresholdSeconds: STREAM_SOFT_CORRECTION_THRESHOLD_SECONDS,
        });
        const resumingAfterForegroundMedia = playbackMode === "playing"
            && (lastPlaybackMode === "muted-for-foreground" || lastPlaybackMode === "paused-for-foreground-video");
        if (
            sourceChanged
            || streamSyncPlan.mode === "hard-seek"
            || playbackMode === "paused-for-foreground-video"
            || resumingAfterForegroundMedia
        ) {
            setVideoCurrentTime(offsetSeconds, {
                force: sourceChanged || resumingAfterForegroundMedia,
                transportPlayback: playbackMode === "playing" || playbackMode === "muted-for-foreground",
            });
        }
        const basePlaybackRate = getAnimationRealtime() === true ? 1 : Number(getAnimationSpeedMultiplier());
        const correctionPlaybackRate = Number(streamSyncPlan.playbackRate);
        const useTransportPlayback = shouldUseBackgroundTransportPlayback({
            animationRealtime: getAnimationRealtime() === true,
            animationSpeedMultiplier: basePlaybackRate,
        });
        setVideoPlaybackRate(useTransportPlayback
            ? (Number.isFinite(basePlaybackRate) && basePlaybackRate > 0 ? basePlaybackRate : 1)
                * (Number.isFinite(correctionPlaybackRate) && correctionPlaybackRate > 0 ? correctionPlaybackRate : 1)
            : 1);
        if (!hasStoredMutedPreference) {
            muted = activeItem.backgroundPlayback?.muted !== false;
        }
        const effectiveMuted = muted || playbackMode === "muted-for-foreground";
        effectiveAudioMuted = effectiveMuted;
        mutedForForegroundMedia = playbackMode === "muted-for-foreground";
        if (video && video.muted !== effectiveMuted) video.muted = effectiveMuted;

        if (!useTransportPlayback && (playbackMode === "playing" || playbackMode === "muted-for-foreground")) {
            pauseVideo({ stopHlsLoad: false });
            keepHlsLoadingForFramePreview(offsetSeconds);
            setVideoCurrentTime(offsetSeconds, { force: sourceChanged });
            setHidden("background-media-live", true);
            setText("background-media-status", playbackMode === "muted-for-foreground"
                ? "Muted for Foreground Media"
                : `Frame preview ${formatStatusTime(offsetSeconds)}`);
            lastForegroundEffect = playbackMode === "muted-for-foreground" ? "muted" : "";
        } else if (playbackMode === "playing") {
            const playStarted = playVideo();
            setHidden("background-media-live", !playStarted);
            setText("background-media-status", playStarted
                ? `Playing ${formatStatusTime(offsetSeconds)}`
                : "Loading broadcast");
            if (lastForegroundEffect === "muted") {
                showBackgroundStatusToast(muted ? "Foreground media ended; background video remains muted" : "Background video audio restored");
            } else if (lastForegroundEffect === "paused") {
                showBackgroundStatusToast("Foreground video ended; broadcast resumed");
            }
            lastForegroundEffect = "";
        } else if (playbackMode === "muted-for-foreground") {
            const playStarted = playVideo();
            setHidden("background-media-live", !playStarted);
            setText("background-media-status", playStarted ? "Muted for Foreground Media" : "Loading broadcast");
            lastForegroundEffect = "muted";
        } else if (playbackMode === "paused-for-foreground-video") {
            if (lastPlaybackMode !== playbackMode) {
                pauseVideo();
            }
            setHidden("background-media-live", true);
            setText("background-media-status", "Paused for Foreground Media");
            lastForegroundEffect = "paused";
        } else {
            if (lastPlaybackMode !== playbackMode) {
                pauseVideo();
            }
            setHidden("background-media-live", true);
            setText(
                "background-media-status",
                playbackEnabled ? `Paused ${formatStatusTime(offsetSeconds)}` : "Paused",
            );
        }
        lastPlaybackMode = playbackMode;
        syncButtons();
    }

    registerMissionPanel({
        id: BACKGROUND_MEDIA_PANEL_ID,
        title: "Flyby Broadcast",
        kind: "workflow",
        panelType: "background-media",
        builtIn: true,
        available: panelAvailable,
        state: getPanelRegistryState(),
        sortOrder: 44,
        actions: {},
    });
    syncPanelRegistry();

    return {
        render,
        setMissionContext,
        setPanelState(nextState) {
            const wasOpen = panelState === "open";
            panelState = nextState || "closed";
            if (panelState !== "open" || wasOpen !== true) {
                panelLayoutApplied = false;
            }
            persistState();
            syncPanelVisibility();
            if (panelState === "open") {
                bringPanelToFront();
            }
        },
    };
}

export {
    BACKGROUND_MEDIA_PANEL_ID,
    createBackgroundMediaPanelActions,
    isBackgroundVideoItem,
    resolveActiveBackgroundItem,
    resolveBackgroundCandidates,
    resolveBackgroundPlaybackButtonState,
    resolveBackgroundPlaybackMode,
    resolveNearestInactiveBackgroundItem,
    shouldUseBackgroundTransportPlayback,
};
