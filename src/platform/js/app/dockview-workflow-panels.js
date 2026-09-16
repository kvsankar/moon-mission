const DOCKED_WORKFLOW_PANEL_IDS = [
    "workflow:media-browser",
    "workflow:background-media",
    "workflow:background-transcript",
    "workflow:splashdown",
    "aux:earth-rise-composer-controls",
    "aux:earth-rise-composer",
    "aux:moon",
    "aux:earth",
    "aux:earth-to-moon",
    "aux:earth-origin-orbit-xy",
];
const MAIN_VIEW_PANEL_ID = "mission:main-view";

function getDockviewSpikeLayoutHost() {
    return globalThis?.__moonMissionDockviewSpike?.layoutHost || null;
}

// Explicit workflow Focus is also a disclosure command. Automatic docking and
// default-layout focus keep using the raw host API so they do not select tools.
function focusDockviewWorkflowPanel(panelId) {
    const workspace = globalThis?.__moonMissionDockviewSpike;
    const id = String(panelId || "").trim();
    if (!workspace || !id) return false;
    if (typeof workspace.progressiveWorkspace?.revealPanel === "function") {
        return workspace.progressiveWorkspace.revealPanel(id);
    }
    return workspace.layoutHost?.focusPanel?.(id) === true;
}

function hasDockviewPanel(layoutHost, panelId) {
    return !!layoutHost?.api?.getPanel?.(panelId);
}

function resolveDockedWorkflowPanelPosition(layoutHost, panelId) {
    if (!layoutHost) return undefined;
    const id = String(panelId || "").trim();
    if (id === "workflow:media-browser") {
        if (hasDockviewPanel(layoutHost, "workflow:background-media")) {
            return {
                direction: "below",
                referencePanel: "workflow:background-media",
            };
        }
        if (hasDockviewPanel(layoutHost, "workflow:splashdown")) {
            return {
                direction: "above",
                referencePanel: "workflow:splashdown",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "left",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
        return undefined;
    }
    if (id === "workflow:background-media") {
        if (hasDockviewPanel(layoutHost, "workflow:media-browser")) {
            return {
                direction: "above",
                referencePanel: "workflow:media-browser",
            };
        }
        if (hasDockviewPanel(layoutHost, "workflow:splashdown")) {
            return {
                direction: "within",
                referencePanel: "workflow:splashdown",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "left",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
        return undefined;
    }
    if (id === "workflow:background-transcript") {
        if (hasDockviewPanel(layoutHost, "workflow:background-media")) {
            return {
                direction: "below",
                referencePanel: "workflow:background-media",
            };
        }
        if (hasDockviewPanel(layoutHost, "workflow:media-browser")) {
            return {
                direction: "above",
                referencePanel: "workflow:media-browser",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "left",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
        return undefined;
    }
    if (id === "workflow:splashdown") {
        if (hasDockviewPanel(layoutHost, "workflow:media-browser")) {
            return {
                direction: "below",
                referencePanel: "workflow:media-browser",
            };
        }
        if (hasDockviewPanel(layoutHost, "workflow:background-media")) {
            return {
                direction: "below",
                referencePanel: "workflow:background-media",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "right",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
    }
    if (id === "aux:earth-rise-composer") {
        if (hasDockviewPanel(layoutHost, "aux:moon")) {
            return {
                direction: "left",
                referencePanel: "aux:moon",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth")) {
            return {
                direction: "left",
                referencePanel: "aux:earth",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth-origin-orbit-xy")) {
            return {
                direction: "left",
                referencePanel: "aux:earth-origin-orbit-xy",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "right",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
        return undefined;
    }
    if (id === "aux:earth-rise-composer-controls") {
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "right",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth-rise-composer")) {
            return {
                direction: "left",
                referencePanel: "aux:earth-rise-composer",
            };
        }
        return undefined;
    }
    if (id === "aux:earth") {
        if (hasDockviewPanel(layoutHost, "aux:moon")) {
            return {
                direction: "below",
                referencePanel: "aux:moon",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth-origin-orbit-xy")) {
            return {
                direction: "above",
                referencePanel: "aux:earth-origin-orbit-xy",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth-rise-composer")) {
            return {
                direction: "right",
                referencePanel: "aux:earth-rise-composer",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "right",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
        return undefined;
    }
    if (id === "aux:moon") {
        if (hasDockviewPanel(layoutHost, "aux:earth")) {
            return {
                direction: "above",
                referencePanel: "aux:earth",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth-origin-orbit-xy")) {
            return {
                direction: "above",
                referencePanel: "aux:earth-origin-orbit-xy",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth-rise-composer")) {
            return {
                direction: "right",
                referencePanel: "aux:earth-rise-composer",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "right",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
        return undefined;
    }
    if (id === "aux:earth-to-moon") {
        if (hasDockviewPanel(layoutHost, "aux:moon")) {
            return {
                direction: "within",
                referencePanel: "aux:moon",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth")) {
            return {
                direction: "within",
                referencePanel: "aux:earth",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth-origin-orbit-xy")) {
            return {
                direction: "left",
                referencePanel: "aux:earth-origin-orbit-xy",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "right",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
        return undefined;
    }
    if (id === "aux:earth-origin-orbit-xy") {
        if (hasDockviewPanel(layoutHost, "aux:earth")) {
            return {
                direction: "below",
                referencePanel: "aux:earth",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:moon")) {
            return {
                direction: "below",
                referencePanel: "aux:moon",
            };
        }
        if (hasDockviewPanel(layoutHost, "aux:earth-rise-composer")) {
            return {
                direction: "right",
                referencePanel: "aux:earth-rise-composer",
            };
        }
        if (hasDockviewPanel(layoutHost, MAIN_VIEW_PANEL_ID)) {
            return {
                direction: "right",
                referencePanel: MAIN_VIEW_PANEL_ID,
            };
        }
    }
    return undefined;
}

export {
    DOCKED_WORKFLOW_PANEL_IDS,
    MAIN_VIEW_PANEL_ID,
    getDockviewSpikeLayoutHost,
    focusDockviewWorkflowPanel,
    resolveDockedWorkflowPanelPosition,
};
