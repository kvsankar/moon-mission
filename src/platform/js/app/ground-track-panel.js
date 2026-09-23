import { loadMissionConfig } from "../data/mission-data.js";
import { registerMissionPanel, updateMissionPanel } from "./panel-registry.js";
import { showMissionPanelInfo } from "./panel-info-popover.js";
import { readMissionPanelState, writeMissionPanelState } from "./panel-layout-store.js";
import { getMissionPanelDefaultState } from "./panel-defaults.js";
import {
    getDockviewSpikeLayoutHost,
    focusDockviewWorkflowPanel,
    resolveDockedWorkflowPanelPosition,
} from "./dockview-workflow-panels.js";
import { bringPanelElementToFront } from "./panel-z-order.js";
import { isDomInstance } from "../ui/dom-helpers.js";
import { createGroundTrackPresentation } from "./ground-track-presentation.js";
import { createGroundTrackDataSource } from "./ground-track-data-source.js";
import { createGroundTrackSurface } from "./ground-track-surface.js";
import { createGroundTrackPanelGeometry } from "./ground-track-panel-geometry.js";
import { GROUND_TRACK_PANEL_REGISTRY_ID, VIEW_MODE_2D, VIEW_MODE_3D } from "./ground-track-config.js";
import { eciToLatLonDegrees } from "./ground-track-geometry.js";
import {
    isSplashdownPanelMissionEnabled,
    shouldAutoOpenSplashdownPanel,
    resolvePostHorizonExtension,
} from "./ground-track-policy.js";
import { buildGeneratedSegmentNote } from "./ground-track-primitives.js";

function createGroundTrackPanelActions(options = {}) {
    const formatMetric = typeof options?.formatMetric === "function"
        ? options.formatMetric
        : ((value) => {
            if (!Number.isFinite(value)) return "--";
            const abs = Math.abs(value);
            if (abs >= 100) return value.toFixed(0);
            if (abs >= 10) return value.toFixed(1);
            return value.toFixed(2);
        });
    let initialized = false;
    let currentTrackKey = "";
    let currentSegments = [];
    let currentGeneratedSegments = [];
    let currentLocation = null;
    let resizeObserver = null;
    let latestPayload = null;
    let panelMode = VIEW_MODE_2D;
    let missionConfigData = null;
    let missionConfigReady = false;
    let missionConfigPromise = null;
    let panelPosition = null;
    let autoOpenScheduled = false;
    let panelVisibilityState = "closed";
    let dockedLayoutResizeFrame = 0;
    let restoredPanelLayout = readMissionPanelState(GROUND_TRACK_PANEL_REGISTRY_ID) || null;
    let hasRestoredPanelLayout = !!restoredPanelLayout;
    let panelExpanded = restoredPanelLayout?.maximized === true || hasRestoredPanelLayout !== true;
    let restorePanelFrame = restoredPanelLayout?.restoreFrame && typeof restoredPanelLayout.restoreFrame === "object"
        ? {
            x: Math.round(Number(restoredPanelLayout.restoreFrame.x) || 0),
            y: Math.round(Number(restoredPanelLayout.restoreFrame.y) || 0),
            width: Math.round(Number(restoredPanelLayout.restoreFrame.width) || 0),
            height: Math.round(Number(restoredPanelLayout.restoreFrame.height) || 0),
        }
        : null;
    let hasRestoredPanelVisibilityState = false;
    let defaultPanelStateApplied = false;

    const getNode = (id) => document.getElementById(id);
    const { formatLatLonPair, updateInfoStrip, seekMainTimelineTime,
        clickMainControlButton, syncTimelineCardUi, updateModeButtons } = createGroundTrackPresentation({
        getNode,
        formatMetric,
        getMissionConfigData: () => missionConfigData,
        getPanelMode: () => panelMode,
        setMetricValue,
        setTimelineLocalText,
    });

    const trackData = createGroundTrackDataSource({
        getMissionConfigData: () => missionConfigData,
        getLatestPayload: () => latestPayload,
        onTrackDataReady: (payload) => renderPayload(payload),
    });
    const { isRelativeFrameActive, resolveGroundTrackChebyshevDescriptor,
        resolveCurrentEarthCenteredVector, resolveCurrentEarthCenteredVelocity,
        resolveEarthDistanceKm, resolveEarthVelocityKmPerSec, resolveEarthAltitudeKm,
        resolveTrackSegments } = trackData;

    const surface = createGroundTrackSurface({ getNode });
    const {
        ensureShadowSurface,
        ensureMap,
        ensureGlobe,
        resizeGlobe,
        clearMapTrack,
        renderMapTrack,
        fitMapOverviewIfNeeded,
        centerMapOnLocation,
        updateMapMarker,
        clearGlobeTrack,
        renderGlobeTrack,
        updateGlobeMarker,
        orientGlobeToTrack,
        zoomGlobe,
    } = surface;

    const {
        capturePanelFrame,
        applyExpandedPanelRect,
        syncExpandButton,
        resetExpandedPanelForDelete,
        applyComposerPanelPlacement,
        applyPanelPosition,
        clampPanelPosition,
        ensurePanelPosition,
        bindPanelDragging,
    } = createGroundTrackPanelGeometry({
        getNode,
        isGroundTrackPanelDocked,
        persistPanelLayoutState,
        getPanelPosition: () => panelPosition,
        setPanelPosition: (value) => { panelPosition = value; },
        getPanelExpanded: () => panelExpanded,
        setPanelExpandedState: (value) => { panelExpanded = value; },
        getRestorePanelFrame: () => restorePanelFrame,
    });

    function isDockviewGroundTrackPanelEnabled() {
        return !!getDockviewSpikeLayoutHost();
    }

    function isGroundTrackPanelDocked(panel = getNode("ground-track-panel")) {
        return !!panel?.classList?.contains?.("ground-track-panel--dockview");
    }

    function ensureGroundTrackPanelDocked(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) return false;
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        if (layoutHost.focusPanel(GROUND_TRACK_PANEL_REGISTRY_ID)) {
            return true;
        }
        const position = resolveDockedWorkflowPanelPosition(layoutHost, GROUND_TRACK_PANEL_REGISTRY_ID);
        layoutHost.addPanel({
            id: GROUND_TRACK_PANEL_REGISTRY_ID,
            component: "mounted-element",
            title: "Splashdown in Spotlight",
            position,
            params: {
                mountElementId: "ground-track-panel",
                mountClassName: "ground-track-panel--dockview",
                fallbackParentId: "ground-track-panel-wrapper",
            },
            initialHeight: 300,
            minimumWidth: 300,
            minimumHeight: 220,
        });
        layoutHost.focusPanel(GROUND_TRACK_PANEL_REGISTRY_ID);
        return true;
    }

    function closeDockedGroundTrackPanel() {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) return false;
        return layoutHost.closePanel(GROUND_TRACK_PANEL_REGISTRY_ID);
    }

    function getPanelRegistryState() {
        if (!isSplashdownPanelMissionEnabled(missionConfigData)) {
            return "unavailable";
        }
        return panelVisibilityState;
    }

    function persistPanelLayoutState(panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) {
            return;
        }
        if (isGroundTrackPanelDocked(panel)) {
            writeMissionPanelState(GROUND_TRACK_PANEL_REGISTRY_ID, {
                state: panelVisibilityState,
                maximized: false,
            });
            return;
        }
        writeMissionPanelState(GROUND_TRACK_PANEL_REGISTRY_ID, {
            x: Math.round(panelPosition?.x ?? panel.offsetLeft ?? 0),
            y: Math.round(panelPosition?.y ?? panel.offsetTop ?? 0),
            width: Math.round(panel.offsetWidth || 0),
            height: Math.round(panel.offsetHeight || 0),
            state: panelVisibilityState,
            maximized: panelExpanded === true,
            restoreFrame: restorePanelFrame && typeof restorePanelFrame === "object"
                ? {
                    x: Math.round(Number(restorePanelFrame.x) || 0),
                    y: Math.round(Number(restorePanelFrame.y) || 0),
                    width: Math.round(Number(restorePanelFrame.width) || 0),
                    height: Math.round(Number(restorePanelFrame.height) || 0),
                }
                : null,
        });
    }

    function confirmDeletePanel() {
        const confirmFn = globalThis?.confirm;
        if (typeof confirmFn === "function") {
            const accepted = confirmFn(
                'Delete "Splashdown in Spotlight" from this mission layout? You can add it back from the Panels menu.',
            );
            if (!accepted) {
                return false;
            }
        }
        resetExpandedPanelForDelete();
        setPanelState("deleted");
        return true;
    }

    function syncPanelRegistry() {
        const panelStateName = getPanelRegistryState();
        const missionLabel = String(
            missionConfigData?.mission_name_short ||
            missionConfigData?.mission_name ||
            "Current mission",
        ).trim();
        updateMissionPanel(GROUND_TRACK_PANEL_REGISTRY_ID, {
            id: GROUND_TRACK_PANEL_REGISTRY_ID,
            title: "Splashdown in Spotlight",
            kind: "workflow",
            panelType: "splashdown",
            builtIn: true,
            available: isSplashdownPanelMissionEnabled(missionConfigData),
            state: panelStateName,
            sortOrder: 50,
            infoItems: [
                { label: "Panel Kind", value: "Splashdown workflow" },
                { label: "Mission", value: missionLabel || "Current mission" },
            ],
            actions: {
                open: () => setPanelState("open"),
                restore: () => setPanelState("open"),
                focus: panelStateName === "open"
                    ? () => { setPanelState("open"); focusDockviewWorkflowPanel(GROUND_TRACK_PANEL_REGISTRY_ID); }
                    : undefined,
                close: panelStateName === "open"
                    ? () => setPanelState("closed")
                    : undefined,
                delete: panelStateName !== "deleted"
                    ? () => confirmDeletePanel()
                    : undefined,
            },
        });
    }

    function applyConfiguredDefaultPanelState() {
        if (
            !missionConfigData ||
            hasRestoredPanelVisibilityState === true ||
            defaultPanelStateApplied === true
        ) {
            return;
        }
        const defaultState = getMissionPanelDefaultState(
            missionConfigData,
            GROUND_TRACK_PANEL_REGISTRY_ID,
            { fallbackState: "closed" },
        );
        defaultPanelStateApplied = true;
        setPanelState(defaultState);
    }

    function ensureMissionConfigData() {
        if (missionConfigReady) return Promise.resolve(missionConfigData);
        if (missionConfigPromise) return missionConfigPromise;
        missionConfigPromise = loadMissionConfig()
            .then((configData) => {
                missionConfigData = configData || null;
                missionConfigReady = true;
                applyConfiguredDefaultPanelState();
                syncPanelRegistry();
                return missionConfigData;
            })
            .catch(() => {
                missionConfigData = null;
                missionConfigReady = true;
                syncPanelRegistry();
                return null;
            })
            .finally(() => {
                missionConfigPromise = null;
            });
        return missionConfigPromise;
    }

    function setStatus(text) {
        const node = getNode("ground-track-status");
        if (node) node.textContent = text;
    }

    function setProvenanceNote({ visible, badgeText, text, active = false }) {
        const note = getNode("ground-track-provenance-note");
        if (!isDomInstance(note, "HTMLElement")) return;
        note.hidden = !visible;
        note.classList.toggle("is-active", !!active);
        const badge = getNode("ground-track-provenance-badge");
        if (badge) badge.textContent = badgeText || "Generated final descent";
        const label = getNode("ground-track-provenance-text");
        if (label) label.textContent = text || "";
    }

    function setCoords(text) {
        const node = getNode("ground-track-coords");
        if (node) node.textContent = text;
    }

    function setMetricValue(id, text) {
        const node = getNode(id);
        if (node) node.textContent = text;
    }

    function setTimelineLocalText(text) {
        const node = getNode("ground-track-timeline-local");
        if (node) node.textContent = text;
    }

    function syncPanelAvailability(enabled) {
        const wrapper = getNode("ground-track-panel-wrapper");
        if (isDomInstance(wrapper, "HTMLElement")) {
            wrapper.hidden = !enabled;
        }
        const panel = getNode("ground-track-panel");
        if (!isDomInstance(panel, "HTMLElement") || enabled) return;
        panelVisibilityState = "closed";
        if (!panel.classList.contains("ground-track-panel--hidden")) {
            panel.classList.add("ground-track-panel--hidden");
            document.dispatchEvent(new CustomEvent("ground-track-panel-visibilitychange", {
                detail: { visible: false, state: panelVisibilityState },
            }));
        }
        syncPanelRegistry();
    }

    function syncVisibleView() {
        const panel = getNode("ground-track-panel");
        if (!panel || panel.classList.contains("ground-track-panel--hidden")) return;
        const container = getNode("ground-track-map");
        ensureShadowSurface(container);
        updateModeButtons();
        const show2D = panelMode === VIEW_MODE_2D;
        if (surface.getMapHost()) surface.getMapHost().hidden = !show2D;
        if (surface.getGlobeHost()) surface.getGlobeHost().hidden = show2D;

        if (show2D) {
            const activeMap = ensureMap();
            if (!activeMap) return;
            activeMap.invalidateSize(false);
            renderMapTrack(currentSegments, currentGeneratedSegments);
            updateMapMarker(currentLocation);
            if (currentLocation) {
                centerMapOnLocation(currentLocation);
            } else {
                fitMapOverviewIfNeeded();
            }
            return;
        }

        ensureGlobe();
        resizeGlobe();
        renderGlobeTrack(currentSegments, currentGeneratedSegments);
        updateGlobeMarker(currentLocation);
        orientGlobeToTrack(currentLocation, currentSegments);
    }

    function scheduleDockedSurfaceResize() {
        if (dockedLayoutResizeFrame) {
            return;
        }
        const schedule = typeof requestAnimationFrame === "function"
            ? requestAnimationFrame
            : (callback) => setTimeout(callback, 0);
        dockedLayoutResizeFrame = schedule(() => {
            dockedLayoutResizeFrame = 0;
            surface.getMap()?.invalidateSize(false);
            resizeGlobe();
        });
    }

    function setViewMode(mode) {
        panelMode = mode === VIEW_MODE_3D ? VIEW_MODE_3D : VIEW_MODE_2D;
        syncVisibleView();
    }

    function setPanelExpanded(expanded, panel = getNode("ground-track-panel")) {
        if (!isDomInstance(panel, "HTMLElement")) {
            return;
        }
        if (isGroundTrackPanelDocked(panel)) {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            syncExpandButton();
            persistPanelLayoutState(panel);
            syncVisibleView();
            return;
        }
        const nextExpanded = expanded === true;
        if (nextExpanded === panelExpanded) {
            syncExpandButton();
            return;
        }
        if (nextExpanded) {
            restorePanelFrame = capturePanelFrame(panel);
            panelExpanded = true;
            panel.classList.add("is-maximized");
            applyExpandedPanelRect(panel);
        } else {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            if (restorePanelFrame && restorePanelFrame.width > 0 && restorePanelFrame.height > 0) {
                panel.style.width = `${restorePanelFrame.width}px`;
                panel.style.height = `${restorePanelFrame.height}px`;
                applyPanelPosition(panel, restorePanelFrame.x, restorePanelFrame.y);
            } else {
                ensurePanelPosition(panel);
            }
        }
        syncExpandButton();
        persistPanelLayoutState(panel);
        if (!panel.classList.contains("ground-track-panel--hidden")) {
            surface.getMap()?.invalidateSize(false);
            resizeGlobe();
            syncVisibleView();
        }
    }

    function bringPanelToFront() {
        if (isGroundTrackPanelDocked()) return;
        bringPanelElementToFront(getNode("ground-track-panel-wrapper"));
    }

    function setPanelState(nextState) {
        const previousState = panelVisibilityState;
        const resolvedState = nextState === "minimized"
            ? "closed"
            : (nextState === "deleted"
                ? "deleted"
                : (nextState === "open" ? "open" : "closed"));
        if (resolvedState === "open" && !isSplashdownPanelMissionEnabled(missionConfigData)) {
            syncPanelAvailability(false);
            return;
        }
        panelVisibilityState = resolvedState;
        const panel = getNode("ground-track-panel");
        if (!panel) return;
        const isVisible = resolvedState === "open";
        const shouldMaximizeOnOpen = isVisible && previousState !== "open";
        if (isDockviewGroundTrackPanelEnabled()) {
            if (isVisible) {
                ensureGroundTrackPanelDocked(panel);
            } else if (isGroundTrackPanelDocked(panel)) {
                closeDockedGroundTrackPanel();
            }
        }
        panel.classList.toggle("ground-track-panel--hidden", !isVisible);
        document.dispatchEvent(new CustomEvent("ground-track-panel-visibilitychange", {
            detail: {
                visible: isVisible,
                state: panelVisibilityState,
            },
        }));
        syncPanelRegistry();
        if (!isVisible) {
            persistPanelLayoutState(panel);
            return;
        }
        if (isGroundTrackPanelDocked(panel)) {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
            syncExpandButton();
            persistPanelLayoutState(panel);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    syncVisibleView();
                });
            });
            return;
        }
        bringPanelToFront();
        if (shouldMaximizeOnOpen && panelExpanded !== true) {
            setPanelExpanded(true, panel);
            return;
        }
        if (panelExpanded === true) {
            panel.classList.add("is-maximized");
            applyExpandedPanelRect(panel);
        } else {
            ensurePanelPosition(panel);
        }
        syncExpandButton();
        persistPanelLayoutState(panel);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                syncVisibleView();
            });
        });
    }

    function setPanelVisible(visible) {
        setPanelState(visible ? "open" : "closed");
    }

    function scheduleAutoOpenIfNeeded(config) {
        if (autoOpenScheduled || config === "relative" || !shouldAutoOpenSplashdownPanel(missionConfigData)) return;
        if (hasRestoredPanelLayout) return;
        const panel = getNode("ground-track-panel");
        if (!panel) return;
        autoOpenScheduled = true;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setPanelVisible(true);
                requestAnimationFrame(() => {
                    applyComposerPanelPlacement(panel);
                    syncVisibleView();
                });
            });
        });
    }

    function ensurePanelEventsBound() {
        if (initialized) return;

        const toggleButton = getNode("ground-track-button");
        const zoomInButton = getNode("ground-track-zoom-in");
        const zoomOutButton = getNode("ground-track-zoom-out");
        const style2dButton = getNode("ground-track-style-2d");
        const style3dButton = getNode("ground-track-style-3d");
        const playButton = getNode("ground-track-play");
        const stepBackSecondButton = getNode("ground-track-step-back-second");
        const stepForwardSecondButton = getNode("ground-track-step-forward-second");
        const stepBackMinuteButton = getNode("ground-track-step-back-minute");
        const stepForwardMinuteButton = getNode("ground-track-step-forward-minute");
        const slowerButton = getNode("ground-track-slower");
        const speedButton = getNode("ground-track-speed");
        const fasterButton = getNode("ground-track-faster");
        const timelineSlider = getNode("ground-track-timeline-slider");
        const panel = getNode("ground-track-panel");
        const header = panel?.querySelector(".ground-track-panel__header");
        const headerControls = panel?.querySelector(".ground-track-panel__header-controls");
        let closeButton = getNode("ground-track-panel-close");
        const minimizeButton = getNode("ground-track-panel-minimize");
        let expandButton = getNode("ground-track-panel-expand");
        let infoButton = getNode("ground-track-panel-info");
        let deleteButton = getNode("ground-track-panel-delete");

        if (!isDomInstance(panel, "HTMLElement")) {
            return;
        }
        initialized = true;

        if (isDomInstance(panel, "HTMLElement")) {
            const persistedWidth = Number(restoredPanelLayout?.width);
            const persistedHeight = Number(restoredPanelLayout?.height);
            if (Number.isFinite(persistedWidth) && persistedWidth > 0) {
                panel.style.width = `${Math.round(persistedWidth)}px`;
            }
            if (Number.isFinite(persistedHeight) && persistedHeight > 0) {
                panel.style.height = `${Math.round(persistedHeight)}px`;
            }
            const persistedX = Number(restoredPanelLayout?.x);
            const persistedY = Number(restoredPanelLayout?.y);
            if (Number.isFinite(persistedX) && Number.isFinite(persistedY)) {
                panelPosition = {
                    x: Math.round(persistedX),
                    y: Math.round(persistedY),
                };
            }
            const persistedState = String(restoredPanelLayout?.state || "").trim().toLowerCase();
            if (persistedState === "open" || persistedState === "minimized" || persistedState === "closed" || persistedState === "deleted") {
                panelVisibilityState = persistedState === "minimized" ? "closed" : persistedState;
                hasRestoredPanelVisibilityState = true;
                defaultPanelStateApplied = true;
            }
            panel.classList.toggle("is-maximized", panelExpanded === true);
        }

        if (!infoButton && isDomInstance(headerControls, "HTMLElement")) {
            infoButton = document.createElement("button");
            infoButton.id = "ground-track-panel-info";
            infoButton.className = "ground-track-panel__icon-button ground-track-panel__info mission-panel-shell__button mission-panel-shell__button--icon";
            infoButton.type = "button";
            infoButton.title = "Info";
            infoButton.setAttribute("aria-label", "Show panel info");
            infoButton.dataset.icon = "info";
            infoButton.textContent = "";
            infoButton.dataset.panelInfoTrigger = "true";
            headerControls.insertBefore(infoButton, closeButton || null);
        }

        if (minimizeButton && typeof minimizeButton.remove === "function") {
            minimizeButton.remove();
        }

        if (!expandButton && isDomInstance(headerControls, "HTMLElement")) {
            expandButton = document.createElement("button");
            expandButton.id = "ground-track-panel-expand";
            expandButton.className = "ground-track-panel__icon-button ground-track-panel__expand mission-panel-shell__button mission-panel-shell__button--icon";
            expandButton.type = "button";
            expandButton.dataset.icon = "expand";
            expandButton.textContent = "";
            if (isDomInstance(closeButton, "HTMLElement")) {
                headerControls.insertBefore(expandButton, closeButton);
            } else {
                headerControls.appendChild(expandButton);
            }
        }

        if (!deleteButton && isDomInstance(headerControls, "HTMLElement")) {
            deleteButton = document.createElement("button");
            deleteButton.id = "ground-track-panel-delete";
            deleteButton.className = "ground-track-panel__delete mission-panel-shell__button mission-panel-shell__button--icon mission-panel-shell__button--danger";
            deleteButton.type = "button";
            deleteButton.title = "Delete";
            deleteButton.setAttribute("aria-label", "Delete");
            deleteButton.dataset.icon = "delete";
            deleteButton.textContent = "";
            headerControls.appendChild(deleteButton);
        }

        bindPanelDragging(panel, header);
        panel?.addEventListener?.("pointerdown", bringPanelToFront, true);
        if (panelVisibilityState === "open" && isDockviewGroundTrackPanelEnabled()) {
            ensureGroundTrackPanelDocked(panel);
        }
        if (isGroundTrackPanelDocked(panel)) {
            panelExpanded = false;
            panel.classList.remove("is-maximized");
        } else if (panelExpanded === true) {
            applyExpandedPanelRect(panel);
        } else {
            clampPanelPosition(panel);
        }
        panel?.classList.toggle("ground-track-panel--hidden", panelVisibilityState !== "open");
        syncExpandButton(expandButton);
        panel?.addEventListener?.("moon-mission:dockview-panel-layout", () => {
            if (panel.classList.contains("ground-track-panel--hidden")) return;
            scheduleDockedSurfaceResize();
        });

        if (toggleButton && panel) {
            toggleButton.addEventListener("click", () => {
                const hidden = panel.classList.contains("ground-track-panel--hidden");
                setPanelVisible(hidden);
            });
        }
        document.addEventListener("ground-track-panel-open", () => {
            setPanelVisible(true);
        });
        infoButton?.addEventListener("click", () => showMissionPanelInfo(GROUND_TRACK_PANEL_REGISTRY_ID, infoButton));
        expandButton?.addEventListener("click", () => setPanelExpanded(panelExpanded !== true, panel));
        closeButton?.addEventListener("click", () => setPanelVisible(false));
        deleteButton?.addEventListener("click", () => confirmDeletePanel());
        playButton?.addEventListener("click", () => {
            clickMainControlButton("animate");
        });
        stepBackSecondButton?.addEventListener("click", () => {
            const slider = getNode("ground-track-timeline-slider");
            const min = Number(slider?.min);
            const value = Number(slider?.value);
            if (!Number.isFinite(min) || !Number.isFinite(value)) return;
            seekMainTimelineTime(Math.max(min, value - 1000), true);
        });
        stepForwardSecondButton?.addEventListener("click", () => {
            const slider = getNode("ground-track-timeline-slider");
            const max = Number(slider?.max);
            const value = Number(slider?.value);
            if (!Number.isFinite(max) || !Number.isFinite(value)) return;
            seekMainTimelineTime(Math.min(max, value + 1000), true);
        });
        stepBackMinuteButton?.addEventListener("click", () => {
            const slider = getNode("ground-track-timeline-slider");
            const min = Number(slider?.min);
            const value = Number(slider?.value);
            if (!Number.isFinite(min) || !Number.isFinite(value)) return;
            seekMainTimelineTime(Math.max(min, value - 60000), true);
        });
        stepForwardMinuteButton?.addEventListener("click", () => {
            const slider = getNode("ground-track-timeline-slider");
            const max = Number(slider?.max);
            const value = Number(slider?.value);
            if (!Number.isFinite(max) || !Number.isFinite(value)) return;
            seekMainTimelineTime(Math.min(max, value + 60000), true);
        });
        slowerButton?.addEventListener("click", () => {
            clickMainControlButton("slower");
        });
        speedButton?.addEventListener("click", () => {
            clickMainControlButton("realtime");
        });
        fasterButton?.addEventListener("click", () => {
            clickMainControlButton("faster");
        });
        if (timelineSlider instanceof HTMLInputElement) {
            timelineSlider.addEventListener("input", () => {
                const value = Number(timelineSlider.value);
                if (!Number.isFinite(value)) return;
                seekMainTimelineTime(value, false);
            });
            timelineSlider.addEventListener("change", () => {
                const value = Number(timelineSlider.value);
                if (!Number.isFinite(value)) return;
                seekMainTimelineTime(value, true);
            });
        }
        zoomInButton?.addEventListener("click", () => {
            if (panelMode === VIEW_MODE_2D) {
                surface.getMap()?.zoomIn();
                surface.setMapUserView(true);
            } else {
                zoomGlobe(0.86);
            }
        });
        zoomOutButton?.addEventListener("click", () => {
            if (panelMode === VIEW_MODE_2D) {
                surface.getMap()?.zoomOut();
                surface.setMapUserView(true);
            } else {
                zoomGlobe(1.16);
            }
        });
        style2dButton?.addEventListener("click", () => setViewMode(VIEW_MODE_2D));
        style3dButton?.addEventListener("click", () => setViewMode(VIEW_MODE_3D));

        if (panel && typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(() => {
                if (panel.classList.contains("ground-track-panel--hidden")) return;
                if (isGroundTrackPanelDocked(panel)) {
                    persistPanelLayoutState(panel);
                    scheduleDockedSurfaceResize();
                    return;
                }
                if (panelExpanded === true) {
                    applyExpandedPanelRect(panel);
                } else {
                    clampPanelPosition(panel);
                }
                persistPanelLayoutState(panel);
                surface.getMap()?.invalidateSize(false);
                resizeGlobe();
            });
            resizeObserver.observe(panel);
        }

        window.addEventListener("resize", () => {
            if (!panel) return;
            if (!panel.classList.contains("ground-track-panel--hidden")) {
                if (isGroundTrackPanelDocked(panel)) {
                    persistPanelLayoutState(panel);
                    scheduleDockedSurfaceResize();
                    return;
                }
                if (panelExpanded === true) {
                    applyExpandedPanelRect(panel);
                } else {
                    clampPanelPosition(panel);
                }
                persistPanelLayoutState(panel);
            }
            surface.getMap()?.invalidateSize(false);
            resizeGlobe();
        });

        updateModeButtons();
    }

    function clearTrackVisuals() {
        currentSegments = [];
        currentGeneratedSegments = [];
        currentLocation = null;
        currentTrackKey = "";
        clearMapTrack();
        clearGlobeTrack();
    }

    function renderPayload({ sceneState, config, animTime }) {
        if (!sceneState || !Number.isFinite(animTime) || !config) return;

        const relativeFrameActive = isRelativeFrameActive(config);

        const {
            key,
            segments,
            generatedSegments,
            lastLocation,
            startMs,
            endMs,
            sourceEndMs,
            loading = false,
        } = resolveTrackSegments(config, relativeFrameActive);
        if (key !== currentTrackKey) {
            currentTrackKey = key;
            currentSegments = segments;
            currentGeneratedSegments = generatedSegments;
            surface.setMapUserView(false);
            surface.setGlobeUserView(false);
        }
        if (loading === true) {
            clearTrackVisuals();
            setStatus("Loading ground track trajectory...");
            setProvenanceNote({ visible: false, badgeText: "", text: "", active: false });
            setCoords("--");
            syncTimelineCardUi(config, animTime, Number.NaN, Number.NaN);
            updateInfoStrip({
                earthDistanceKm: Number.NaN,
                earthSpeedKmPerSec: Number.NaN,
                earthAltitudeKm: Number.NaN,
                location: null,
            });
            syncVisibleView();
            return;
        }
        const provenance = resolvePostHorizonExtension(missionConfigData, config);
        const generatedSegmentActive = Number.isFinite(sourceEndMs) && animTime > sourceEndMs;
        setProvenanceNote({
            visible: !!provenance,
            badgeText: provenance?.shortLabel || "Generated final descent",
            text: buildGeneratedSegmentNote(provenance),
            active: generatedSegmentActive,
        });

        const descriptor = resolveGroundTrackChebyshevDescriptor(config, relativeFrameActive);
        const vector = resolveCurrentEarthCenteredVector(sceneState, config, animTime, descriptor);
        const velocity = resolveCurrentEarthCenteredVelocity(sceneState, config, animTime, descriptor);
        const earthDistanceKm = resolveEarthDistanceKm(sceneState, config, vector);
        const earthSpeedKmPerSec = resolveEarthVelocityKmPerSec(sceneState, config, velocity);
        const earthAltitudeKm = resolveEarthAltitudeKm(sceneState, config, earthDistanceKm);
        const liveLocation = eciToLatLonDegrees(vector, animTime);
        if (Number.isFinite(startMs) && animTime < startMs) {
            currentLocation = null;
            setStatus("Ground track window starts at RTC-3.");
            setCoords("--");
        } else if (Number.isFinite(endMs) && animTime > endMs) {
            currentLocation = lastLocation || null;
            setStatus("Ground track window ends after the modeled splashdown continuation.");
            setCoords(formatLatLonPair(currentLocation));
        } else if (!liveLocation) {
            currentLocation = null;
            setStatus("Current ground location unavailable.");
            setCoords("--");
        } else {
            currentLocation = liveLocation;
            setStatus(generatedSegmentActive
                ? "Current marker is on the modeled post-HORIZONS splashdown continuation."
                : "Ground track window: RTC-3 to splashdown.");
            setCoords(formatLatLonPair(currentLocation));
        }

        updateInfoStrip({
            earthDistanceKm,
            earthSpeedKmPerSec,
            earthAltitudeKm,
            location: currentLocation,
        });
        syncTimelineCardUi(config, animTime, startMs, endMs);
        syncVisibleView();
    }

    function update({ sceneState, config, animTime }) {
        const panelEnabled = isSplashdownPanelMissionEnabled(missionConfigData);
        syncPanelAvailability(panelEnabled);
        if (!panelEnabled) {
            latestPayload = null;
            clearTrackVisuals();
            return;
        }
        ensurePanelEventsBound();
        scheduleAutoOpenIfNeeded(config);
        latestPayload = { sceneState, config, animTime };
        if (!missionConfigReady && !missionConfigPromise) {
            ensureMissionConfigData().then(() => {
                trackData.clearCache();
                currentTrackKey = "";
                if (latestPayload) {
                    scheduleAutoOpenIfNeeded(latestPayload.config);
                }
                if (latestPayload) {
                    renderPayload(latestPayload);
                }
            });
        }
        if (missionConfigReady) {
            scheduleAutoOpenIfNeeded(config);
        }
        renderPayload(latestPayload);
    }

    registerMissionPanel({
        id: GROUND_TRACK_PANEL_REGISTRY_ID,
        title: "Splashdown in Spotlight",
        kind: "workflow",
        panelType: "splashdown",
        builtIn: true,
        available: isSplashdownPanelMissionEnabled(missionConfigData),
        state: getPanelRegistryState(),
        sortOrder: 50,
        actions: {},
    });
    syncPanelRegistry();

    return { update, setPanelVisible };
}

export { createGroundTrackPanelActions, shouldAutoOpenSplashdownPanel };
