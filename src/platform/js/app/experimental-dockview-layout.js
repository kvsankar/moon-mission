import { MAIN_VIEW_PANEL_ID } from "./dockview-workflow-panels.js";

const DEFAULT_OPEN_DOCKVIEW_PANEL_IDS = [
    "workflow:background-media",
    "workflow:background-transcript",
    "workflow:media-browser",
    "aux:earth-rise-composer",
    "aux:moon",
    "aux:earth",
    "aux:earth-origin-orbit-xy",
];
const DEFAULT_CLOSED_DOCKVIEW_PANEL_IDS = [
    "aux:earth-rise-composer-controls",
    "aux:earth-to-moon",
    "workflow:splashdown",
];
const DEFAULT_WORKSPACE_PANEL_IDS = [
    MAIN_VIEW_PANEL_ID,
    ...DEFAULT_OPEN_DOCKVIEW_PANEL_IDS,
];
function clampWorkspaceSize(value, min, max) {
    return Math.min(Math.max(Math.round(Number(value) || min), min), max);
}

function shrinkWorkspaceRailSizes(sizes, targetMain, width) {
    let { leftRail, frameShoot, auxRail } = sizes;
    const currentMain = width - leftRail - frameShoot - auxRail;
    const deficit = Math.max(0, targetMain - currentMain);
    if (deficit <= 0) {
        return { leftRail, frameShoot, auxRail };
    }

    const compactMinimums = {
        leftRail: 180,
        frameShoot: 200,
        auxRail: 130,
    };
    let remainingDeficit = deficit;

    for (const key of ["leftRail", "frameShoot", "auxRail"]) {
        const current = key === "leftRail" ? leftRail : key === "frameShoot" ? frameShoot : auxRail;
        const shrink = Math.min(current - compactMinimums[key], Math.ceil(remainingDeficit / 3));
        if (shrink <= 0) {
            continue;
        }
        if (key === "leftRail") {
            leftRail -= shrink;
        } else if (key === "frameShoot") {
            frameShoot -= shrink;
        } else {
            auxRail -= shrink;
        }
        remainingDeficit -= shrink;
    }

    return { leftRail, frameShoot, auxRail };
}

function calculateDefaultDockviewWorkspaceSizes(width, height) {
    const initialSizes = {
        leftRail: clampWorkspaceSize(width * 0.255, 320, 500),
        frameShoot: clampWorkspaceSize(width * 0.34, 360, 680),
        auxRail: clampWorkspaceSize(width * 0.113, 170, 240),
    };
    const targetMain = Math.min(width - 420, 560);
    const railSizes = shrinkWorkspaceRailSizes(initialSizes, targetMain, width);
    return {
        ...railSizes,
        main: Math.max(360, width - railSizes.leftRail - railSizes.frameShoot - railSizes.auxRail),
    };
}

function applyDefaultDockviewWorkspaceLayout(layoutHost, isCurrent = () => true) {
    if (!isCurrent()) return false;
    const api = layoutHost?.api;
    if (!api?.fromJSON || !api?.toJSON) {
        return false;
    }
    if (!DEFAULT_WORKSPACE_PANEL_IDS.every((panelId) => api.getPanel?.(panelId))) {
        return false;
    }
    const current = api.toJSON();
    const width = Math.max(900, Math.round(Number(api.width) || globalThis?.innerWidth || 1440));
    const height = Math.max(520, Math.round(Number(api.height) || globalThis?.innerHeight || 760));
    const {
        leftRail,
        frameShoot,
        auxRail,
        main,
    } = calculateDefaultDockviewWorkspaceSizes(width, height);
    const broadcastHeight = clampWorkspaceSize((leftRail * 9 / 16) + 48, 220, Math.max(260, Math.round(height * 0.48)));
    const transcriptHeight = Math.max(220, height - broadcastHeight);
    const frameShootHeight = clampWorkspaceSize(Math.round(height * 0.51), 260, Math.max(280, height - 260));
    const mediaHeight = Math.max(240, height - frameShootHeight);
    const auxThirdHeight = Math.max(160, Math.round(height / 3));

    api.fromJSON({
        grid: {
            root: {
                type: "branch",
                data: [
                    {
                        type: "branch",
                        data: [
                            {
                                type: "leaf",
                                data: {
                                    views: ["workflow:background-media"],
                                    activeView: "workflow:background-media",
                                    id: "left-broadcast",
                                },
                                size: broadcastHeight,
                            },
                            {
                                type: "leaf",
                                data: {
                                    views: ["workflow:background-transcript"],
                                    activeView: "workflow:background-transcript",
                                    id: "left-broadcast-transcript",
                                },
                                size: transcriptHeight,
                            },
                        ],
                        size: leftRail,
                    },
                    {
                        type: "leaf",
                        data: {
                            views: [MAIN_VIEW_PANEL_ID],
                            activeView: MAIN_VIEW_PANEL_ID,
                            id: "main-view",
                        },
                        size: main,
                    },
                    {
                        type: "branch",
                        data: [
                            {
                                type: "leaf",
                                data: {
                                    views: ["aux:earth-rise-composer"],
                                    activeView: "aux:earth-rise-composer",
                                    id: "right-frame-shoot",
                                },
                                size: frameShootHeight,
                            },
                            {
                                type: "leaf",
                                data: {
                                    views: ["workflow:media-browser"],
                                    activeView: "workflow:media-browser",
                                    id: "right-media",
                                },
                                size: mediaHeight,
                            },
                        ],
                        size: frameShoot,
                    },
                    {
                        type: "branch",
                        data: [
                            {
                                type: "leaf",
                                data: {
                                    views: ["aux:moon"],
                                    activeView: "aux:moon",
                                    id: "right-craft-moon",
                                },
                                size: auxThirdHeight,
                            },
                            {
                                type: "leaf",
                                data: {
                                    views: ["aux:earth"],
                                    activeView: "aux:earth",
                                    id: "right-craft-earth",
                                },
                                size: auxThirdHeight,
                            },
                            {
                                type: "leaf",
                                data: {
                                    views: ["aux:earth-origin-orbit-xy"],
                                    activeView: "aux:earth-origin-orbit-xy",
                                    id: "right-orbit",
                                },
                                size: auxThirdHeight,
                            },
                        ],
                        size: auxRail,
                    },
                ],
                size: height,
            },
            width,
            height,
            orientation: "HORIZONTAL",
        },
        panels: current.panels,
        activeGroup: "main-view",
    }, { reuseExistingPanels: true });
    if (!isCurrent()) return false;
    api.layout?.(width, height, true);
    if (!isCurrent()) return false;
    layoutHost.focusPanel?.(MAIN_VIEW_PANEL_ID);
    if (!isCurrent()) return false;
    layoutHost.saveLayout?.();
    return true;
}

const DEFAULT_DOCKVIEW_SPIKE_PANELS = [
    {
        id: MAIN_VIEW_PANEL_ID,
        component: "mission-main-view",
        title: "Main View",
        minimumWidth: 560,
        minimumHeight: 260,
        params: {
            required: true,
        },
    },
    {
        id: "workflow:background-transcript",
        component: "mounted-element",
        title: "Broadcast Transcript",
        minimumWidth: 280,
        minimumHeight: 160,
        params: {
            mountElementId: "background-media-transcript",
            mountClassName: "background-media-panel__transcript--dockview",
            fallbackParentId: "background-media-panel",
        },
    },
];

export {
    DEFAULT_CLOSED_DOCKVIEW_PANEL_IDS,
    DEFAULT_DOCKVIEW_SPIKE_PANELS,
    DEFAULT_OPEN_DOCKVIEW_PANEL_IDS,
    applyDefaultDockviewWorkspaceLayout,
    calculateDefaultDockviewWorkspaceSizes,
};
