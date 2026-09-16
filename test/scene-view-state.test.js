import { describe, expect, it, vi } from "vitest";

import { createSceneViewStateActions } from "../src/platform/js/app/scene-view-state.js";

const defaultViewState = {
    planeSelection: "DEFAULT",
    plane: "xy",
    xFactor: 1,
    yFactor: 2,
    zFactor: 3,
    xVariable: "x",
    yVariable: "y",
    zVariable: "z",
    vxVariable: "vx",
    vyVariable: "vy",
    vzVariable: "vz",
    zoomFactor: 4,
    panx: 5,
    pany: 6,
};

function createActions({
    currentConfig = { id: "current" },
    scenes = new Map(),
    legacyZoomFactor = 1,
    legacyPanX = 2,
    legacyPanY = 3,
    syncPlaneSelectionControls = (value) => value,
    getPlaneVariablesForSelection = vi.fn(selection => ({ ...defaultViewState, plane: selection })),
} = {}) {
    const setters = {
        planeSelection: vi.fn(), planeVariables: vi.fn(), zoom: vi.fn(), panX: vi.fn(), panY: vi.fn(), checked: vi.fn(),
    };
    const actions = createSceneViewStateActions({
        defaultViewState,
        getConfig: () => currentConfig,
        getGlobalConfig: () => ({}),
        getSceneForConfig: (cfg) => scenes.get(cfg) || null,
        normalizePlaneSelection: (value) => value,
        getPlaneVariablesForSelection,
        syncPlaneSelectionControls,
        setChecked: setters.checked,
        getLegacyPlaneSelection: () => defaultViewState.planeSelection,
        setLegacyPlaneSelection: setters.planeSelection,
        getLegacyPlaneVariables: () => null,
        setLegacyPlaneVariables: setters.planeVariables,
        getLegacyZoomFactor: () => legacyZoomFactor,
        setLegacyZoomFactor: setters.zoom,
        getLegacyPanX: () => legacyPanX,
        setLegacyPanX: setters.panX,
        getLegacyPanY: () => legacyPanY,
        setLegacyPanY: setters.panY,
    });
    actions.__test = { setters, getPlaneVariablesForSelection };
    return actions;
}

describe("scene-view-state", () => {
    it("reads zoom and pan from the active scene before falling back to legacy globals", () => {
        const currentConfig = { id: "current" };
        const scene = {
            zoomFactor: 12,
            panx: 13,
            pany: 14,
        };
        const actions = createActions({
            currentConfig,
            scenes: new Map([[currentConfig, scene]]),
            legacyZoomFactor: 1,
            legacyPanX: 2,
            legacyPanY: 3,
        });

        expect(actions.getZoomFactorState(currentConfig)).toBe(12);
        expect(actions.getPanXState(currentConfig)).toBe(13);
        expect(actions.getPanYState(currentConfig)).toBe(14);
    });

    it("falls back to legacy globals when no scene state exists", () => {
        const actions = createActions({
            legacyZoomFactor: 21,
            legacyPanX: 22,
            legacyPanY: 23,
        });

        expect(actions.getZoomFactorState()).toBe(21);
        expect(actions.getPanXState()).toBe(22);
        expect(actions.getPanYState()).toBe(23);
    });

    it("writes inactive scene transforms without changing active legacy mirrors", () => {
        const active = { id: "geo" }, inactive = { id: "lunar" }, inactiveScene = {};
        const actions = createActions({ currentConfig: active, scenes: new Map([[inactive, inactiveScene]]) });
        actions.setZoomFactorState(9, inactive);
        actions.setPanXState(10, inactive);
        actions.setPanYState(11, inactive);
        expect(inactiveScene).toMatchObject({ zoomFactor: 9, panx: 10, pany: 11 });
        expect(actions.__test.setters.zoom).not.toHaveBeenCalled();
        expect(actions.__test.setters.panX).not.toHaveBeenCalled();
        expect(actions.__test.setters.panY).not.toHaveBeenCalled();
    });

    it("uses defaults for a missing inactive scene and never mutates the active mirror", () => {
        const active = { id: "geo" }, inactive = { id: "lunar" };
        const actions = createActions({ currentConfig: active, legacyZoomFactor: 21, legacyPanX: 22, legacyPanY: 23 });
        expect(actions.getZoomFactorState(inactive)).toBe(defaultViewState.zoomFactor);
        expect(actions.getPanXState(inactive)).toBe(defaultViewState.panx);
        expect(actions.getPanYState(inactive)).toBe(defaultViewState.pany);
        actions.setZoomFactorState(9, inactive);
        actions.setPanXState(10, inactive);
        actions.setPanYState(11, inactive);
        expect(actions.__test.setters.zoom).not.toHaveBeenCalled();
        expect(actions.__test.setters.panX).not.toHaveBeenCalled();
        expect(actions.__test.setters.panY).not.toHaveBeenCalled();
    });

    it("preserves active startup fallback and mirrors active writes before a scene exists", () => {
        const active = { id: "geo" };
        const actions = createActions({ currentConfig: active, legacyZoomFactor: 21 });
        expect(actions.getZoomFactorState(active)).toBe(21);
        actions.setZoomFactorState(8, active);
        expect(actions.__test.setters.zoom).toHaveBeenCalledExactlyOnceWith(8);
    });

    it("syncs an inactive plane into its scene without writing active controls or legacy mirrors", () => {
        const active = { id: "geo" }, inactive = { id: "lunar" };
        const scene = { planeSelection: "YZ" };
        const syncControls = vi.fn(value => value);
        const actions = createActions({ currentConfig: active, scenes: new Map([[inactive, scene]]),
            syncPlaneSelectionControls: syncControls });
        actions.syncPlaneStateForConfig(inactive);
        expect(syncControls).not.toHaveBeenCalled();
        expect(scene.planeSelection).toBe("YZ");
        expect(scene.plane).toBe("YZ");
        expect(actions.__test.setters.planeSelection).not.toHaveBeenCalled();
        expect(actions.__test.setters.planeVariables).not.toHaveBeenCalled();
    });

    it("keeps active plane controls and compatibility mirrors synchronized", () => {
        const active = { id: "geo" }, scene = { planeSelection: "XZ" };
        const syncControls = vi.fn(value => value);
        const actions = createActions({ currentConfig: active, scenes: new Map([[active, scene]]),
            syncPlaneSelectionControls: syncControls });
        actions.syncPlaneStateForConfig(active);
        expect(syncControls).toHaveBeenCalledOnce();
        expect(actions.__test.setters.planeSelection).toHaveBeenCalledWith("XZ");
        expect(actions.__test.setters.planeVariables).toHaveBeenCalledOnce();
        expect(scene).toMatchObject({ planeSelection: "XZ", plane: "XZ" });
    });
});
