import "dockview-core/dist/styles/dockview.css";
import { createProgressiveWorkspace } from "./progressive-workspace.js";
import { resolveDockviewEnabled } from "../core/domain/dockview-policy.js";
import { createPanelLayoutHost, readPanelLayoutHostState } from "./panel-layout-host.js";
import {
    getMissionPanelSnapshot,
    invokeMissionPanelAction,
    subscribeMissionPanels,
} from "./panel-registry.js";
import { DOCKED_WORKFLOW_PANEL_IDS, MAIN_VIEW_PANEL_ID } from "./dockview-workflow-panels.js";
import { resolveMissionKeyFromWindow } from "./panel-layout-store.js";
import {
    applyShellRect,
    clampShellRect,
    createHostRoot,
    getDockviewSpikeShellStorageKey,
    getDockviewSpikeStorageKey,
    getDefaultShellRect,
    readDockviewSpikeShellRect,
} from "./experimental-dockview-shell.js";
import {
    createDeferredWorkspaceWork,
    createDockviewHeaderActionsRenderer,
    createDockviewPanelLaunchStrip,
    createDockviewTabContextMenuItems,
    createFullscreenToggleButton,
    enableAuxiliaryPanelsForDockviewDefaults,
    resolveDockviewPopoutUrl,
} from "./experimental-dockview-controls.js";
import {
    DEFAULT_CLOSED_DOCKVIEW_PANEL_IDS,
    DEFAULT_DOCKVIEW_SPIKE_PANELS,
    DEFAULT_OPEN_DOCKVIEW_PANEL_IDS,
    applyDefaultDockviewWorkspaceLayout,
    calculateDefaultDockviewWorkspaceSizes,
} from "./experimental-dockview-layout.js";
import { renderExperimentalPanel } from "./experimental-dockview-panel-renderers.js";

const DOCKVIEW_SPIKE_PARAM = "dockPanels";

function isDesktopDockviewViewport(windowRef = globalThis?.window) {
    return (Number(windowRef?.innerWidth) || 0) > 600;
}

function isDockviewSpikeEnabled(urlSearch = globalThis?.location?.search || "", windowRef = globalThis?.window, missionConfig = null) {
    return resolveDockviewEnabled({ urlSearch, viewportWidth: Number(windowRef?.innerWidth) || 0, missionConfig });
}

let latestWorkspaceInitialization = 0;

function initializeExperimentalDockviewHost({ missionConfig = null } = {}) {
    if (!isDockviewSpikeEnabled(undefined, undefined, missionConfig)) {
        return null;
    }

    const documentRef = globalThis?.document;
    if (!documentRef?.body) {
        return null;
    }

    const initialization = ++latestWorkspaceInitialization;
    globalThis.__moonMissionDockviewSpike?.dispose?.();
    if (initialization !== latestWorkspaceInitialization) return globalThis.__moonMissionDockviewSpike || null;
    let disposed = false;
    let workspace = null;
    const work = createDeferredWorkspaceWork(() => !disposed &&
        (!workspace || globalThis.__moonMissionDockviewSpike === workspace));
    const rendererCleanups = new Set();
    documentRef.getElementById("experimental-dockview-host")?.remove();
    documentRef.body.classList?.add?.("dockview-panels-enabled");
    const panelLaunchStrip = createDockviewPanelLaunchStrip(documentRef, work.active);

    const storageKey = getDockviewSpikeStorageKey();
    const shellStorageKey = getDockviewSpikeShellStorageKey(storageKey);
    const savedExpandedLayout = readPanelLayoutHostState(storageKey);
    const { root, toolbar, dockRoot, resetButton, resizeGrip } = createHostRoot(documentRef, { shellStorageKey });
    let suppressPanelCloseSync = false;
    let progressiveWorkspace = null;
    let layoutHost;
    try {
    layoutHost = createPanelLayoutHost({
        container: dockRoot,
        missionKey: resolveMissionKeyFromWindow(),
        panels: DEFAULT_DOCKVIEW_SPIKE_PANELS,
        storageKey,
        dockviewOptions: {
            floatingGroupBounds: "boundedWithinViewport",
            popoutUrl: resolveDockviewPopoutUrl(),
            createRightHeaderActionComponent() {
                return createDockviewHeaderActionsRenderer({
                    popoutUrl: resolveDockviewPopoutUrl(),
                });
            },
            getTabContextMenuItems: createDockviewTabContextMenuItems,
        },
        renderPanel(context) {
            if (!work.active()) return { element: documentRef.createElement("div"), dispose() {} };
            const renderer = renderExperimentalPanel(context, work.active);
            if (!work.active()) {
                renderer?.dispose?.();
                return { element: documentRef.createElement("div"), dispose() {} };
            }
            if (typeof renderer?.dispose !== "function") return renderer;
            let retired = false;
            const disposeRenderer = () => {
                if (retired) return;
                retired = true;
                rendererCleanups.delete(disposeRenderer);
                renderer.dispose();
            };
            rendererCleanups.add(disposeRenderer);
            return { ...renderer, dispose: disposeRenderer,
                layout: (...args) => { if (!retired && work.active()) renderer.layout?.(...args); } };
        },
        onPanelClose(panelId) {
            if (!work.active()) return;
            if (panelId === MAIN_VIEW_PANEL_ID) {
                work.microtask(() => {
                    layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[0]);
                    if (!work.active()) return;
                    layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
                    if (!work.active()) return;
                    layoutHost.saveLayout();
                });
                return;
            }
            if (suppressPanelCloseSync || !DOCKED_WORKFLOW_PANEL_IDS.includes(panelId)) {
                return;
            }
            work.microtask(() => {
                const panel = getMissionPanelSnapshot().find((entry) => entry.id === panelId);
                if (panel?.state === "open") {
                    invokeMissionPanelAction(panelId, "close");
                }
            });
        },
    });
    } catch (error) {
        disposed = true;
        work.dispose();
        for (const cleanup of [...rendererCleanups, () => root.remove(), () => panelLaunchStrip.dispose()]) {
            try { cleanup(); } catch (cleanupError) { console.warn("Dockview workspace cleanup failed", cleanupError); }
        }
        rendererCleanups.clear();
        if (initialization === latestWorkspaceInitialization) documentRef.body.classList?.remove?.("dockview-panels-enabled");
        throw error;
    }
    const hadSavedLayout = layoutHost.didRestoreInitialLayout;
    const unbindShellInteractions = () => {};
    if (!layoutHost.api?.getPanel?.(MAIN_VIEW_PANEL_ID)) {
        layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[0]);
    }
    if (!layoutHost.api?.getPanel?.("workflow:background-transcript")) {
        layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[1]);
    }
    layoutHost.closePanel("aux:earth-rise-composer-controls");
    layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
    let unsubscribeDefaultPanelOpen = null;
    let resetWorkspaceRetryHandle = null;

    const resetDockviewWorkspaceLayout = () => {
        if (!work.active()) return;
        enableAuxiliaryPanelsForDockviewDefaults(documentRef);
        for (const panel of getMissionPanelSnapshot() || []) {
            if (!work.active()) return;
            if (
                DEFAULT_CLOSED_DOCKVIEW_PANEL_IDS.includes(panel.id) &&
                panel.available !== false &&
                panel.state === "open"
            ) {
                invokeMissionPanelAction(panel.id, "close");
            }
        }
        if (!work.active()) return;
        if (!layoutHost.api?.getPanel?.(MAIN_VIEW_PANEL_ID)) {
            layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[0]);
        }
        if (!layoutHost.api?.getPanel?.("workflow:background-transcript")) {
            layoutHost.addPanel(DEFAULT_DOCKVIEW_SPIKE_PANELS[1]);
        }
        for (const panelId of DEFAULT_OPEN_DOCKVIEW_PANEL_IDS) {
            if (!work.active()) return;
            if (layoutHost.api?.getPanel?.(panelId)) {
                continue;
            }
            invokeMissionPanelAction(panelId, "restore") ||
                invokeMissionPanelAction(panelId, "open") ||
                invokeMissionPanelAction(panelId, "focus");
        }
        const applyWithRetry = (attempt = 0) => {
            if (!work.active()) return;
            if (resetWorkspaceRetryHandle != null) {
                work.clearTimeout(resetWorkspaceRetryHandle);
                resetWorkspaceRetryHandle = null;
            }
            const applied = applyDefaultDockviewWorkspaceLayout(layoutHost, work.active);
            if (!work.active()) return;
            if (applied) {
                progressiveWorkspace?.captureExpandedLayout();
                progressiveWorkspace?.revealPanel(MAIN_VIEW_PANEL_ID);
                return;
            }
            if (attempt >= 16) {
                if (progressiveWorkspace?.revealPanel) {
                    progressiveWorkspace.revealPanel(MAIN_VIEW_PANEL_ID);
                } else {
                    layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
                }
                if (!work.active()) return;
                layoutHost.saveLayout?.();
                return;
            }
            resetWorkspaceRetryHandle = work.timeout(() => applyWithRetry(attempt + 1), 250);
        };
        suppressPanelCloseSync = true;
        try {
            applyWithRetry();
        } finally {
            suppressPanelCloseSync = false;
        }
    };
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        workspace.disposed = true;
        work.dispose();
        unsubscribeDefaultPanelOpen?.();
        unsubscribeDefaultPanelOpen = null;
        if (globalThis.__moonMissionDockviewSpike === workspace) {
            delete globalThis.__moonMissionDockviewSpike;
            documentRef.body.classList?.remove?.("dockview-panels-enabled");
        }
        if (globalThis.__moonMissionResetDockviewWorkspace === resetDockviewWorkspaceLayout) {
            delete globalThis.__moonMissionResetDockviewWorkspace;
        }
        // Complete all owner cleanup even if an adapter's cleanup fails.
        const cleanups = [() => progressiveWorkspace?.dispose(), unbindShellInteractions,
            () => layoutHost.dispose(), ...rendererCleanups,
            () => root.remove(), () => panelLaunchStrip.dispose()];
        for (const cleanup of cleanups) {
            try { cleanup(); } catch (error) { console.warn("Dockview workspace cleanup failed", error); }
        }
        rendererCleanups.clear();
    };
    // Registry subscriptions run immediately. Their actions must be able to
    // discover this host before they try to dock already-available panels.
    workspace = { api: layoutHost.api, layoutHost, root, storageKey, shellStorageKey,
        resetWorkspaceLayout: resetDockviewWorkspaceLayout, dispose, disposed: false };
    globalThis.__moonMissionDockviewSpike = workspace;
    globalThis.__moonMissionResetDockviewWorkspace = resetDockviewWorkspaceLayout;

    try {
    if (!hadSavedLayout) {
        const pendingDefaultPanelIds = new Set(DEFAULT_OPEN_DOCKVIEW_PANEL_IDS);
        const pendingClosedPanelIds = new Set(DEFAULT_CLOSED_DOCKVIEW_PANEL_IDS);
        let defaultWorkspaceLayoutApplied = false;
        let opening = false;
        let recheckQueued = false;
        enableAuxiliaryPanelsForDockviewDefaults(documentRef);
        const openDefaultPanels = (snapshot = getMissionPanelSnapshot()) => {
            if (!work.active()) return;
            if (opening) {
                if (!recheckQueued) {
                    recheckQueued = true;
                    work.microtask(() => { recheckQueued = false; openDefaultPanels(); });
                }
                return;
            }
            opening = true;
            let openedPanel = false;
            try {
            for (const panelId of Array.from(pendingDefaultPanelIds)) {
                if (layoutHost.api?.getPanel?.(panelId)) {
                    pendingDefaultPanelIds.delete(panelId);
                    openedPanel = true;
                }
            }
            for (const panel of snapshot || []) {
                if (!work.active()) return;
                if (!pendingClosedPanelIds.has(panel.id) || panel.available === false) continue;
                pendingClosedPanelIds.delete(panel.id);
                if (panel.state === "open") {
                    invokeMissionPanelAction(panel.id, "close");
                }
            }
            for (const panel of snapshot || []) {
                if (!work.active()) return;
                if (!pendingDefaultPanelIds.has(panel.id) || panel.available === false) {
                    continue;
                }
                if (layoutHost.api?.getPanel?.(panel.id)) {
                    pendingDefaultPanelIds.delete(panel.id);
                    openedPanel = true;
                    continue;
                }
                invokeMissionPanelAction(panel.id, "restore") ||
                    invokeMissionPanelAction(panel.id, "open") ||
                    invokeMissionPanelAction(panel.id, "focus");
                if (layoutHost.api?.getPanel?.(panel.id)) {
                    pendingDefaultPanelIds.delete(panel.id);
                    openedPanel = true;
                }
            }
            if (!work.active()) return;
            if (!defaultWorkspaceLayoutApplied) {
                defaultWorkspaceLayoutApplied = applyDefaultDockviewWorkspaceLayout(layoutHost, work.active);
                if (defaultWorkspaceLayoutApplied) progressiveWorkspace?.captureExpandedLayout();
            }
            if (!work.active()) return;
            if (openedPanel && !defaultWorkspaceLayoutApplied) layoutHost.focusPanel(MAIN_VIEW_PANEL_ID);
            if (pendingDefaultPanelIds.size === 0) {
                unsubscribeDefaultPanelOpen?.();
                unsubscribeDefaultPanelOpen = null;
            }
            } finally { opening = false; }
        };
        unsubscribeDefaultPanelOpen = subscribeMissionPanels(openDefaultPanels);
        // A synchronous first notification can finish before subscribe returns
        // its unsubscribe function. Readiness, not a deadline, ends ownership.
        if (!work.active() || pendingDefaultPanelIds.size === 0) {
            unsubscribeDefaultPanelOpen?.();
            unsubscribeDefaultPanelOpen = null;
        }
    }

    resetButton.addEventListener("click", resetDockviewWorkspaceLayout);

    if (!work.active()) return workspace;
    progressiveWorkspace = createProgressiveWorkspace({
        layoutHost, root, documentRef,
        savedExpandedLayout: hadSavedLayout ? savedExpandedLayout : null,
    });
    workspace.progressiveWorkspace = progressiveWorkspace;

    return workspace;
    } catch (error) {
        dispose();
        throw error;
    }
}

export {
    DOCKVIEW_SPIKE_PARAM,
    DEFAULT_DOCKVIEW_SPIKE_PANELS,
    DEFAULT_OPEN_DOCKVIEW_PANEL_IDS,
    MAIN_VIEW_PANEL_ID,
    applyDefaultDockviewWorkspaceLayout,
    applyShellRect,
    calculateDefaultDockviewWorkspaceSizes,
    clampShellRect,
    getDockviewSpikeStorageKey,
    getDockviewSpikeShellStorageKey,
    getDefaultShellRect,
    resolveDockviewPopoutUrl,
    createDockviewHeaderActionsRenderer,
    createDockviewPanelLaunchStrip,
    createFullscreenToggleButton,
    createDockviewTabContextMenuItems,
    initializeExperimentalDockviewHost,
    isDesktopDockviewViewport,
    isDockviewSpikeEnabled,
    readDockviewSpikeShellRect,
};
