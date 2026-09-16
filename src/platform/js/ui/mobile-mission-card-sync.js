import {
    AUXILIARY_VIEW_CAMERA_PRESETS,
    resolveLunarFlybyTimeMs,
    resolveLunarFlybyWindowMs,
} from "../app/auxiliary-camera-views.js";
import { createMobileComposeControlsSync } from "./mobile-compose-controls-sync.js";
import { createMobileComposeLockSync } from "./mobile-compose-lock-sync.js";
import { createMobileComposeTimelineSync } from "./mobile-compose-timeline-sync.js";
import { createMobileMoonVisibilitySync } from "./mobile-moon-visibility-sync.js";
import { createMobileShellLayoutSync } from "./mobile-shell-layout-sync.js";
import { createMobileShellTabSync } from "./mobile-shell-tab-sync.js";
import { createMobileViewFovSync } from "./mobile-view-fov-sync.js";
import { createMobileViewPresetSync } from "./mobile-view-preset-sync.js";
import { createSharedControlBackend } from "./shared-control-backend.js";
import { bindMobileTransportSync } from "./mobile-transport-sync.js";

const MISSION_PANEL_COLLAPSE_STORAGE_KEY = "moon-mission:mobile-mission-panel-collapsed:v1";
const VIEWS_PANEL_COLLAPSE_STORAGE_KEY = "moon-mission:mobile-views-panel-collapsed:v1";
const COMPOSE_TIMELINE_RESOLUTION = 1000;
const COMPOSE_TIMELINE_WINDOW_MS = 2 * 60 * 60 * 1000;
const COMPOSE_DEFAULT_FOV = 110;
const MOBILE_ALWAYS_SUPPRESSED_VIEW_IDS = [
    "view-aux-camera-panels",
];
const MOBILE_VIEWS_SUPPRESSED_VIEW_IDS = [];
const MOBILE_EARTHRISE_ENABLED = false;

function extractTimelineEventMetadataFromButtons(documentRef) {
    const buttons = documentRef?.querySelectorAll?.("#burnbuttons button[data-event-index]") || [];
    if (!buttons.length) return [];
    const events = [];
    buttons.forEach((button) => {
        const startTime = Number(button?.dataset?.eventTimeMs);
        if (!Number.isFinite(startTime)) return;
        const key = button.dataset?.eventKey || "";
        const label = (button.textContent || "").trim();
        const hoverText = button.getAttribute?.("title") || "";
        const burnFlag = button.dataset?.burnFlag === "true";
        events.push({
            startTime,
            key,
            label,
            hoverText,
            infoText: hoverText,
            burnFlag,
        });
    });
    return events;
}

function formatLocalDateTimeShort(timeMs) {
    if (!Number.isFinite(timeMs)) {
        return "--";
    }
    try {
        const datePart = new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "2-digit",
        }).format(timeMs);
        const timePart = new Intl.DateTimeFormat(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZoneName: "short",
        }).format(timeMs);
        return `${datePart} ${timePart}`;
    } catch {
        return new Date(timeMs).toLocaleString();
    }
}

function bindMobileMissionCardSync(deps = {}) {
    const {
        documentRef = globalThis?.document,
        windowRef = globalThis?.window || globalThis,
        performanceRef = globalThis?.performance,
        localStorageRef = windowRef?.localStorage,
        dispatchSyntheticPress,
        isMobileViewport = () => false,
        resetSettingsPanelForMobileMode = () => {},
        setHeaderPillStripAutoCollapsedState = () => {},
        changeCameraFromTo = () => {},
        getCameraState = () => ({ positionMode: "manual", lookMode: "manual" }),
        auxiliaryViewCameraPresets = AUXILIARY_VIEW_CAMERA_PRESETS,
        readTimelineEventMetadata = () => extractTimelineEventMetadataFromButtons(documentRef),
        formatLocalDateTimeShortImpl = formatLocalDateTimeShort,
        resolveFlybyWindowMsImpl = resolveLunarFlybyWindowMs,
        resolveFlybyTimeMsImpl = resolveLunarFlybyTimeMs,
        createSharedControlBackendImpl = createSharedControlBackend,
        createMobileComposeControlsSyncImpl = createMobileComposeControlsSync,
        createMobileComposeLockSyncImpl = createMobileComposeLockSync,
        createMobileComposeTimelineSyncImpl = createMobileComposeTimelineSync,
        createMobileMoonVisibilitySyncImpl = createMobileMoonVisibilitySync,
        createMobileShellLayoutSyncImpl = createMobileShellLayoutSync,
        createMobileShellTabSyncImpl = createMobileShellTabSync,
        createMobileViewFovSyncImpl = createMobileViewFovSync,
        createMobileViewPresetSyncImpl = createMobileViewPresetSync,
        bindMobileTransportSyncImpl = bindMobileTransportSync,
    } = deps;

    const shell = documentRef?.getElementById?.("mobile-shell");
    if (!shell) return null;
    if (shell.dataset?.bound === "true") return null;
    shell.dataset.bound = "true";

    const missionCard = documentRef.getElementById("mobile-card-mission");
    const missionCardBody = documentRef.getElementById("mobile-mission-body");
    const viewsCard = documentRef.getElementById("mobile-card-views");
    const viewsCardBody = documentRef.getElementById("mobile-views-body");
    const panelCollapseButton = documentRef.getElementById("mobile-views-collapse");
    const composeCard = documentRef.getElementById("mobile-card-compose");
    const missionControls = {
        play: documentRef.getElementById("mobile-control-play"),
        slower: documentRef.getElementById("mobile-control-slower"),
        faster: documentRef.getElementById("mobile-control-faster"),
        speed: documentRef.getElementById("mobile-control-speed"),
        now: documentRef.getElementById("mobile-control-realtime"),
    };
    const viewsControls = {
        play: documentRef.getElementById("mobile-views-control-play"),
        slower: documentRef.getElementById("mobile-views-control-slower"),
        faster: documentRef.getElementById("mobile-views-control-faster"),
        speed: documentRef.getElementById("mobile-views-control-speed"),
        now: documentRef.getElementById("mobile-views-control-realtime"),
    };
    const composeControls = {
        play: documentRef.getElementById("mobile-compose-control-play"),
        slower: documentRef.getElementById("mobile-compose-control-slower"),
        faster: documentRef.getElementById("mobile-compose-control-faster"),
        speed: documentRef.getElementById("mobile-compose-control-speed"),
        now: documentRef.getElementById("mobile-compose-control-realtime"),
    };
    const mobileTransportSets = [missionControls, viewsControls, composeControls];

    const mobileViewButtons = Array.from(documentRef.querySelectorAll?.(".mobile-shell__view-btn") || []);
    const mobileComposeLockButtons = Array.from(documentRef.querySelectorAll?.(".mobile-shell__compose-lock-btn") || []);
    const mobileComposeTimelineSlider = documentRef.getElementById("mobile-compose-timeline-slider");
    const mobileComposeTimelineValue = documentRef.getElementById("mobile-compose-timeline-value");
    const mobileComposeTimelineLocal = documentRef.getElementById("mobile-compose-timeline-local");
    const mobileComposeEarthshineSlider = documentRef.getElementById("mobile-compose-earthshine-slider");
    const mobileComposeEarthshineValue = documentRef.getElementById("mobile-compose-earthshine-value");
    const mobileComposeRollSlider = documentRef.getElementById("mobile-compose-roll-slider");
    const mobileComposeRollValue = documentRef.getElementById("mobile-compose-roll-value");
    const mobileComposeFovSlider = documentRef.getElementById("mobile-compose-fov-slider");
    const mobileComposeFovValue = documentRef.getElementById("mobile-compose-fov-value");
    const mobileComposeFovAuto = documentRef.getElementById("mobile-compose-fov-auto");
    const mobileViewsFovSlider = documentRef.getElementById("mobile-views-fov-slider");
    const mobileViewsFovValue = documentRef.getElementById("mobile-views-fov-value");
    const mobileViewsFovAuto = documentRef.getElementById("mobile-views-fov-auto");
    const mobileViewsMoonVisibility = documentRef.getElementById("mobile-views-moon-visibility");
    const mobileViewsMoonVisibilitySummary = documentRef.getElementById("mobile-views-moon-visibility-summary");
    const mobileViewsMoonVisibilityHead =
        mobileViewsMoonVisibilitySummary?.querySelector?.(".mobile-shell__views-visibility-head");
    const mobileViewsMoonVisibilityValues =
        mobileViewsMoonVisibilitySummary?.querySelector?.(".mobile-shell__views-visibility-values");
    const mobileViewsFarSideToggle = documentRef.getElementById("mobile-views-farside-toggle");
    const mobileMoonFarSideOverlay = documentRef.getElementById("mobile-moon-farside-overlay");
    const contentWrapper = documentRef.getElementById("content-wrapper");
    const missionEvent = documentRef.getElementById("mobile-mission-event");
    const mobileShellNav = shell.querySelector?.(".mobile-shell__nav") || null;
    const navButtons = Array.from(documentRef.querySelectorAll?.(".mobile-shell__nav-btn") || []);
    const composeNavButton =
        shell.querySelector?.('.mobile-shell__nav-btn[data-mobile-tab="compose"]') || null;

    const mobileViewPresetById = new Map(
        auxiliaryViewCameraPresets.map((preset) => [preset.id, preset]),
    );
    const mobileComposePresetById = new Map([
        ["free", { positionMode: "spacecraft", lookMode: "manual" }],
        ["earth", { positionMode: "spacecraft", lookMode: "earth" }],
        ["moon", { positionMode: "spacecraft", lookMode: "moon" }],
    ]);
    const mobileTabCards = {
        mission: missionCard,
        views: viewsCard,
        compose: composeCard,
    };

    let activeMobileTab = "mission";
    let activeMobileViewPresetId = "moon";
    let activeMobileComposeLockPresetId = "free";
    let mobileViewsPresetInitialized = false;
    let mobileViewsSavedViewState = null;
    let mobileAlwaysSuppressedViewState = null;
    let mobileSavedMissionCameraModes = null;
    let mobileViewPresetEnforceInProgress = false;
    let mobileMissionLocatorBaseline = null;
    let mobileViewFovSync = null;
    let mobileMoonVisibilitySync = null;
    let mobileShellLayoutSync = null;
    const cameraControlBackend = createSharedControlBackendImpl({
        changeCameraFromTo,
        getCameraState,
    });

    function readCurrentCameraPositionMode() {
        return getCameraState().positionMode;
    }

    function readCurrentCameraLookMode() {
        return getCameraState().lookMode;
    }

    function commitCameraPair(positionMode, lookMode, options = {}) {
        cameraControlBackend.commitCameraPair?.(positionMode, lookMode, options);
    }

    const composeFeatureEnabled = (() => {
        if (!MOBILE_EARTHRISE_ENABLED) return false;
        const dataPath = String(windowRef?.missionConfig?.dataPath || "").toLowerCase();
        return dataPath.includes("/artemis2/") || dataPath.includes("\\artemis2\\");
    })();
    const isViewsVisualSimplificationTab = (tabName) => tabName === "views" || tabName === "compose";
    const shouldEnableMobileTapPlaybackToggle = () => {
        if (!isMobileViewport()) return false;
        return activeMobileTab === "mission" || activeMobileTab === "views";
    };

    if (!composeFeatureEnabled) {
        if (composeCard) {
            composeCard.hidden = true;
        }
        if (composeNavButton) {
            composeNavButton.hidden = true;
            composeNavButton.disabled = true;
        }
    }

    function setMissionEventMessage(message) {
        if (!missionEvent) return;
        const text = typeof message === "string" ? message.trim() : "";
        missionEvent.hidden = text.length === 0;
        missionEvent.textContent = text;
    }

    function resolveActiveOriginConfig() {
        const selectedMode = documentRef.querySelector?.('input[name="mode"]:checked');
        const mode = (selectedMode?.value || "geo").trim();
        if (mode === "geo" || mode === "lunar" || mode === "relative") return mode;
        return "geo";
    }

    function resolveActiveScene() {
        const scenes = windowRef?.animationScenes;
        if (!scenes || typeof scenes !== "object") return null;
        return scenes[resolveActiveOriginConfig()] || null;
    }

    function resolveActiveCraft(scene) {
        return scene?.craft ||
            Object.values(scene?.craftsById || {}).find((craft) => !!craft) ||
            null;
    }

    function resolveSceneObject(scene, mode) {
        if (!scene) return null;
        if (mode === "earth") return scene.earthContainer || scene.earth || null;
        if (mode === "moon") return scene.moonContainer || scene.moon || null;
        if (mode === "spacecraft") return resolveActiveCraft(scene);
        return null;
    }

    function setCheckboxState(id, checked) {
        const input = documentRef.getElementById(id);
        if (!input || input.disabled) return;
        if (input.checked === checked) return;
        const activeScene = resolveActiveScene();
        const sceneReady = !!activeScene?.initialized3D;
        if (!sceneReady) {
            input.checked = checked;
            return;
        }
        input.click?.();
    }

    function captureViewsState() {
        const snapshot = {};
        MOBILE_VIEWS_SUPPRESSED_VIEW_IDS.forEach((id) => {
            const input = documentRef.getElementById(id);
            if (!input) return;
            snapshot[id] = !!input.checked;
        });
        return snapshot;
    }

    function applyMobileAlwaysSuppressedViews() {
        if (mobileAlwaysSuppressedViewState === null) {
            mobileAlwaysSuppressedViewState = {};
            MOBILE_ALWAYS_SUPPRESSED_VIEW_IDS.forEach((id) => {
                const input = documentRef.getElementById(id);
                if (!input) return;
                mobileAlwaysSuppressedViewState[id] = !!input.checked;
            });
        }
        MOBILE_ALWAYS_SUPPRESSED_VIEW_IDS.forEach((id) => setCheckboxState(id, false));
    }

    function restoreMobileAlwaysSuppressedViews() {
        if (!mobileAlwaysSuppressedViewState) return;
        Object.entries(mobileAlwaysSuppressedViewState).forEach(([id, checked]) => {
            setCheckboxState(id, checked);
        });
        mobileAlwaysSuppressedViewState = null;
    }

    function applyViewsVisualSimplification() {
        if (mobileViewsSavedViewState === null) {
            mobileViewsSavedViewState = captureViewsState();
        }
        MOBILE_VIEWS_SUPPRESSED_VIEW_IDS.forEach((id) => setCheckboxState(id, false));
    }

    function restoreViewsVisualSimplification() {
        if (!mobileViewsSavedViewState) return;
        Object.entries(mobileViewsSavedViewState).forEach(([id, checked]) => {
            if (isMobileViewport() && MOBILE_ALWAYS_SUPPRESSED_VIEW_IDS.includes(id)) return;
            setCheckboxState(id, checked);
        });
        mobileViewsSavedViewState = null;
    }

    function proxyDesktopClick(id) {
        const target = documentRef.getElementById(id);
        if (!target || target.disabled) return;
        target.click?.();
    }

    let transportSync = null;
    function queueTransportSync() {
        if (typeof windowRef?.requestAnimationFrame !== "function") {
            transportSync?.syncTransportState?.();
            return;
        }
        windowRef.requestAnimationFrame(() => {
            windowRef.requestAnimationFrame(() => {
                transportSync?.syncTransportState?.();
            });
        });
    }

    setMissionEventMessage("");

    const timelineSlider = documentRef.getElementById("timeline-slider");
    const burnButtonsHost = documentRef.getElementById("burnbuttons");
    const mobileComposeTimelineSync = createMobileComposeTimelineSyncImpl({
        mobileComposeTimelineSlider,
        mobileComposeTimelineValue,
        mobileComposeTimelineLocal,
        timelineSlider,
        burnButtonsHost,
        composeTimelineResolution: COMPOSE_TIMELINE_RESOLUTION,
        composeTimelineWindowMs: COMPOSE_TIMELINE_WINDOW_MS,
        getActiveTab: () => activeMobileTab,
        readEventInfos: readTimelineEventMetadata,
        resolveFlybyWindowMs: resolveFlybyWindowMsImpl,
        resolveFlybyTimeMs: resolveFlybyTimeMsImpl,
        formatLocalDateTimeShort: formatLocalDateTimeShortImpl,
    });
    mobileComposeTimelineSync.bind();

    let mobileComposeControlsSync = null;
    const mobileComposeLockSync = createMobileComposeLockSyncImpl({
        documentRef,
        mobileComposeLockButtons,
        mobileComposePresetById,
        readCameraPositionMode: readCurrentCameraPositionMode,
        readCameraLookMode: readCurrentCameraLookMode,
        commitCameraPair,
        resolveActiveScene,
        getActivePresetId: () => activeMobileComposeLockPresetId,
        setActivePresetId: (presetId) => {
            activeMobileComposeLockPresetId = presetId;
        },
        onAfterApply: () => {
            mobileComposeControlsSync?.syncPresentation?.();
        },
        onAfterButtonClick: () => {
            mobileComposeTimelineSync.sync();
        },
    });
    mobileComposeLockSync.bind();

    mobileComposeControlsSync = createMobileComposeControlsSyncImpl({
        mobileComposeEarthshineSlider,
        mobileComposeEarthshineValue,
        mobileComposeRollSlider,
        mobileComposeRollValue,
        readCameraPositionMode: readCurrentCameraPositionMode,
        readCameraLookMode: readCurrentCameraLookMode,
        commitCameraPair,
        mobileComposePresetById,
        mobileComposeLockSync,
        mobileComposeTimelineSync,
        resolveActiveScene,
        resolveActiveCraft,
        resolveSceneObject,
        getActiveTab: () => activeMobileTab,
        isMobileViewport,
        getComposeFeatureEnabled: () => composeFeatureEnabled,
        getActivePresetId: () => activeMobileComposeLockPresetId,
        storage: localStorageRef,
    });
    mobileComposeControlsSync.bind();

    mobileViewFovSync = createMobileViewFovSyncImpl({
        mobileViewsFovSlider,
        mobileComposeFovSlider,
        mobileViewsFovValue,
        mobileComposeFovValue,
        mobileViewsFovAuto,
        mobileComposeFovAuto,
        contentWrapper,
        mobileViewPresetById,
        mobileComposePresetById,
        resolveActiveScene,
        resolveSceneObject,
        getActiveTab: () => activeMobileTab,
        getActiveViewPresetId: () => activeMobileViewPresetId,
        getActiveComposePresetId: () => activeMobileComposeLockPresetId,
        getComposeFeatureEnabled: () => composeFeatureEnabled,
        isMobileViewport,
        getTapPlaybackEnabled: shouldEnableMobileTapPlaybackToggle,
        onTapPlaybackToggle: () => {
            proxyDesktopClick("animate");
            queueTransportSync();
        },
        onMoonVisibilityRefresh: (options = {}) => {
            mobileMoonVisibilitySync?.sync?.(options);
        },
        onComposePresentationSync: () => {
            mobileComposeControlsSync?.syncPresentation?.();
        },
        composeDefaultFov: COMPOSE_DEFAULT_FOV,
    });
    mobileViewFovSync.bind();

    mobileMoonVisibilitySync = createMobileMoonVisibilitySyncImpl({
        mobileViewsMoonVisibility,
        mobileViewsMoonVisibilitySummary,
        mobileViewsMoonVisibilityHead,
        mobileViewsMoonVisibilityValues,
        mobileViewsFarSideToggle,
        mobileMoonFarSideOverlay,
        resolveActiveScene,
        resolveSceneObject,
        isMobileViewport,
        getActiveTab: () => activeMobileTab,
        getActiveViewPresetId: () => activeMobileViewPresetId,
        getIsThreeD: () => !!documentRef.getElementById("dimension-3D")?.checked,
        onLoopFrame: () => {
            mobileComposeControlsSync?.syncPresentation?.();
            mobileViewFovSync?.applyAutoFovForActivePreset?.();
            if (activeMobileTab === "views" || activeMobileTab === "compose") {
                mobileViewFovSync?.syncDisplayFromScene?.();
            }
        },
        requestSceneRender: () => {
            mobileViewFovSync?.requestSceneRender?.();
        },
        windowRef,
        performanceRef,
    });
    mobileMoonVisibilitySync.bind();

    const syncMobileComposeControls = () => {
        mobileComposeControlsSync?.syncControls?.();
    };

    mobileShellLayoutSync = createMobileShellLayoutSyncImpl({
        panelCollapseButton,
        missionCard,
        missionCardBody,
        viewsCard,
        viewsCardBody,
        mobileShellNav,
        navButtons,
        contentWrapper,
        mobileTabCards,
        getActiveTab: () => activeMobileTab,
        isMobileViewport,
        missionPanelCollapseStorageKey: MISSION_PANEL_COLLAPSE_STORAGE_KEY,
        viewsPanelCollapseStorageKey: VIEWS_PANEL_COLLAPSE_STORAGE_KEY,
        windowRef,
        documentRef,
        localStorageRef,
        onEnterMobileMode: () => {
            setHeaderPillStripAutoCollapsedState(true);
            const bodyHaloToggle = documentRef.getElementById("view-body-halos");
            if (mobileMissionLocatorBaseline === null && bodyHaloToggle) {
                mobileMissionLocatorBaseline = !!bodyHaloToggle.checked;
            }
            resetSettingsPanelForMobileMode();
            applyMobileAlwaysSuppressedViews();
            if (isViewsVisualSimplificationTab(activeMobileTab)) {
                applyViewsVisualSimplification();
                mobileMoonVisibilitySync?.startLoop?.();
            }
            mobileMoonVisibilitySync?.sync?.({ force: true });
            mobileComposeControlsSync?.syncControls?.();
        },
        onExitMobileMode: () => {
            setHeaderPillStripAutoCollapsedState(false);
            if (isViewsVisualSimplificationTab(activeMobileTab)) {
                restoreViewsVisualSimplification();
                if (mobileSavedMissionCameraModes) {
                    commitCameraPair(
                        mobileSavedMissionCameraModes.positionMode || "manual",
                        mobileSavedMissionCameraModes.lookMode || "manual",
                    );
                    mobileSavedMissionCameraModes = null;
                }
            }
            restoreMobileAlwaysSuppressedViews();
            if (mobileMissionLocatorBaseline !== null) {
                setCheckboxState("view-body-halos", mobileMissionLocatorBaseline);
                mobileMissionLocatorBaseline = null;
            }
            mobileMoonVisibilitySync?.stopLoop?.();
            mobileMoonVisibilitySync?.sync?.({ force: true });
            mobileComposeControlsSync?.syncPresentation?.();
        },
    });
    mobileShellLayoutSync.syncNavLayout();

    const mobileViewPresetSync = createMobileViewPresetSyncImpl({
        documentRef,
        mobileViewButtons,
        mobileViewPresetById,
        readCameraPositionMode: readCurrentCameraPositionMode,
        readCameraLookMode: readCurrentCameraLookMode,
        commitCameraPair,
        getActivePresetId: () => activeMobileViewPresetId,
        setActivePresetId: (presetId) => {
            activeMobileViewPresetId = presetId;
        },
        getEnforceInProgress: () => mobileViewPresetEnforceInProgress,
        setEnforceInProgress: (inProgress) => {
            mobileViewPresetEnforceInProgress = inProgress;
        },
        isMobileViewport,
        getActiveTab: () => activeMobileTab,
        onAfterApply: () => {
            mobileMoonVisibilitySync?.sync?.({ force: true });
        },
        onAfterEnforcedSync: () => {
            mobileMoonVisibilitySync?.sync?.({ force: true });
        },
        onAfterButtonClick: () => {
            mobileViewFovSync?.applyAutoFovForActivePreset?.();
        },
        onAfterDesktopChange: () => {
            mobileComposeControlsSync?.syncPresentation?.();
            mobileViewFovSync?.applyAutoFovForActivePreset?.();
            if (activeMobileTab === "compose") {
                mobileComposeTimelineSync.sync();
            }
            mobileMoonVisibilitySync?.sync?.({ force: true });
        },
    });
    mobileViewPresetSync.bind();

    const mobileShellTabSync = createMobileShellTabSyncImpl({
        navButtons,
        mobileTabCards,
        getActiveTab: () => activeMobileTab,
        setActiveTab: (tabName) => {
            activeMobileTab = tabName;
        },
        isComposeFeatureEnabled: () => composeFeatureEnabled,
        isMobileViewport,
        isViewsVisualSimplificationTab,
        setMissionEventMessage,
        onEnterSimplifiedTab: () => {
            applyViewsVisualSimplification();
            if (!mobileSavedMissionCameraModes) {
                mobileSavedMissionCameraModes = {
                    positionMode: readCurrentCameraPositionMode(),
                    lookMode: readCurrentCameraLookMode(),
                };
            }
        },
        onExitSimplifiedTab: () => {
            restoreViewsVisualSimplification();
            if (mobileSavedMissionCameraModes) {
                commitCameraPair(
                    mobileSavedMissionCameraModes.positionMode || "manual",
                    mobileSavedMissionCameraModes.lookMode || "manual",
                );
                mobileSavedMissionCameraModes = null;
            }
        },
        onEnterMission: () => {
            setCheckboxState("view-body-halos", true);
        },
        onEnterViews: () => {
            if (!mobileViewsPresetInitialized || !mobileViewPresetById.has(activeMobileViewPresetId)) {
                activeMobileViewPresetId = "moon";
                mobileViewPresetSync.applyPreset(activeMobileViewPresetId);
                mobileViewsPresetInitialized = true;
            }
            mobileViewPresetSync.syncState();
            if (mobileViewFovSync?.isAutoFovEnabled?.()) {
                mobileViewFovSync.applyAutoFovForActivePreset();
                mobileViewFovSync.scheduleAutoFovRefresh();
            }
            mobileViewFovSync?.syncDisplayFromScene?.();
            mobileMoonVisibilitySync?.startLoop?.();
            mobileMoonVisibilitySync?.sync?.({ force: true });
        },
        onEnterCompose: () => {
            mobileViewFovSync?.ensureComposeDefaultFov?.();
            syncMobileComposeControls();
            if (mobileViewFovSync?.isAutoFovEnabled?.()) {
                mobileViewFovSync.applyAutoFovForActivePreset();
                mobileViewFovSync.scheduleAutoFovRefresh();
            }
            mobileViewFovSync?.syncDisplayFromScene?.();
            mobileMoonVisibilitySync?.stopLoop?.();
            mobileMoonVisibilitySync?.sync?.({ force: true });
        },
        onLeaveViews: () => {
            mobileMoonVisibilitySync?.sync?.({ force: true });
        },
        onLeaveCompose: () => {
            mobileMoonVisibilitySync?.sync?.({ force: true });
        },
        onAfterTransition: () => {
            mobileComposeControlsSync?.syncPresentation?.();
            mobileShellLayoutSync?.applyRenderViewportCentering?.();
            mobileShellLayoutSync?.syncPanelCollapseButton?.();
        },
    });

    if (panelCollapseButton) {
        panelCollapseButton.addEventListener("click", function () {
            if (activeMobileTab === "mission") {
                const collapsed = missionCard?.classList.contains("mobile-shell__card--collapsed");
                mobileShellLayoutSync?.setMissionCardCollapsed?.(!collapsed);
            } else if (activeMobileTab === "views") {
                const collapsed = viewsCard?.classList.contains("mobile-shell__card--collapsed");
                mobileShellLayoutSync?.setViewsCardCollapsed?.(!collapsed);
            }
            mobileShellLayoutSync?.applyRenderViewportCentering?.();
        });
    }

    mobileComposeControlsSync.initialize();
    mobileShellLayoutSync.initializeCollapsedState();

    mobileViewFovSync.setAutoFovEnabled(true);
    mobileShellTabSync.setActiveTab("mission");
    mobileShellLayoutSync.syncPanelCollapseButton();
    mobileViewPresetSync.syncState();
    syncMobileComposeControls();
    mobileViewFovSync.syncDisplayFromScene();
    mobileShellLayoutSync.toggleMode({ disableTransition: true });
    mobileMoonVisibilitySync.startLoop();
    mobileMoonVisibilitySync.sync({ force: true });
    mobileShellLayoutSync.applyRenderViewportCentering();

    function handleViewportResize() {
        mobileShellLayoutSync?.toggleMode?.({
            disableTransition: true,
        });
        mobileViewFovSync?.scheduleAutoFovRefresh?.();
    }

    windowRef.addEventListener?.("resize", handleViewportResize);

    transportSync = bindMobileTransportSyncImpl({
        mobileTransportSets,
        documentRef,
        windowRef,
        dispatchSyntheticPress,
    });

    mobileShellTabSync.bind();

    return {
        mobileComposeControlsSync,
        mobileComposeLockSync,
        mobileComposeTimelineSync,
        mobileMoonVisibilitySync,
        mobileShellLayoutSync,
        mobileShellTabSync,
        mobileViewFovSync,
        mobileViewPresetSync,
        transportSync,
    };
}

export { bindMobileMissionCardSync };
