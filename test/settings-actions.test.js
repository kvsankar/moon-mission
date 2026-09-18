import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeDom } from "./helpers/fake-dom.js";
import { createSettingsActions } from "../src/platform/js/app/settings-actions.js";
import {
    resolveHeadOpacity2D,
    resolveTailOpacity2D,
    resolveTailVisualStyle,
    resolveTrackOpacity2D,
} from "../src/platform/js/app/orbit-trail-style.js";

const ADD_CURVE_DONE = "add-curve-done";

let dom = null;

const ORBIT_TRAIL_CLASSES = [
    "orbit-classic-path",
    "orbit-trail-background",
    "orbit-trail-tail",
    "orbit-trail-mid",
    "orbit-trail-head-glow",
    "orbit-trail-head",
];

/** Builds the SVG orbit group shape the 2D renderer emits for one body. */
function mountOrbitGroup(bodyId) {
    const group = dom.document.createElement("g");
    group.id = `orbit-${bodyId}`;
    for (const className of ORBIT_TRAIL_CLASSES) {
        const path = dom.document.createElement("path");
        path.className = className;
        group.appendChild(path);
    }
    dom.document.body.appendChild(group);
    return group;
}

function pathOf(group, className) {
    return group.children.find((child) => child.classList.contains(className));
}

function makeMaterial() {
    return { opacity: 0, needsUpdate: false };
}

function makeTrailBundle() {
    return {
        tailLine: { material: makeMaterial() },
        midLine: { material: makeMaterial() },
        headGlowLine: { material: makeMaterial() },
        headLine: { material: makeMaterial() },
    };
}

function makeScene({ bodyIds = ["SC"], state = ADD_CURVE_DONE } = {}) {
    return {
        state,
        initialized3D: false,
        planetsForLocations: bodyIds,
        orbitSvgPointsByBodyId: Object.fromEntries(bodyIds.map((id) => [id, []])),
        orbitTrailLinesByBodyId: Object.fromEntries(bodyIds.map((id) => [id, makeTrailBundle()])),
        stopCreation: vi.fn(),
        dispose: vi.fn(),
    };
}

function defaultViewSettings(overrides = {}) {
    return {
        viewOrbit: true,
        viewOrbitDescent: true,
        viewCraters: true,
        viewBodyHalos: true,
        viewFPS: false,
        orbitStyle: "classic",
        trailTrackBrightness2D: 1,
        trailTailBrightness2D: 1,
        trailTrackBrightness3D: 1,
        trailTailBrightness3D: 1,
        ...overrides,
    };
}

function makeActions({
    config = "geo",
    originMode = "geo",
    scenes = {},
    viewSettings = defaultViewSettings(),
    globalConfig = { crafts: [{ id: "SC", primary: true }] },
} = {}) {
    const state = { config, originMode, viewSettings };
    const calls = {
        setConfig: vi.fn((next) => { state.config = next; }),
        initAnimation: vi.fn(),
        setFPSCounterVisibility: vi.fn(),
        render: vi.fn(),
        setViewFlags: vi.fn(),
        setDimension: vi.fn(),
        onConfigChanged: vi.fn(),
        syncViewIdentity: vi.fn(),
    };
    const actions = createSettingsActions({
        getConfig: () => state.config,
        setConfig: calls.setConfig,
        animationScenes: scenes,
        AnimationScene: { SCENE_STATE_ADD_CURVE_DONE: ADD_CURVE_DONE },
        initAnimation: calls.initAnimation,
        readOriginMode: () => state.originMode,
        readViewSettings: () => state.viewSettings,
        setFPSCounterVisibility: calls.setFPSCounterVisibility,
        render: calls.render,
        getGlobalConfig: () => globalConfig,
        getAnimationRunning: () => false,
        setViewFlags: calls.setViewFlags,
        setDimension: calls.setDimension,
        onConfigChanged: calls.onConfigChanged,
        syncViewIdentity: calls.syncViewIdentity,
    });
    return { actions, calls, state, scenes };
}

beforeEach(() => {
    dom = installFakeDom([
        { id: "locators-pill", tag: "button" },
        { id: "origin-relative", tag: "input" },
    ]);
});

afterEach(() => {
    dom?.restore();
    dom = null;
    vi.restoreAllMocks();
});

describe("switching the origin frame", () => {
    it("does nothing when the requested frame is already active", () => {
        const scene = makeScene();
        const { actions, calls } = makeActions({ scenes: { geo: scene } });

        actions.toggleMode();

        expect(calls.setConfig).not.toHaveBeenCalled();
        expect(calls.initAnimation).not.toHaveBeenCalled();
        expect(scene.dispose).not.toHaveBeenCalled();
    });

    it("rebuilds the animation on the newly requested frame", () => {
        const scene = makeScene();
        const { actions, calls } = makeActions({
            originMode: "lunar",
            scenes: { geo: scene },
        });

        actions.toggleMode();

        expect(calls.setConfig).toHaveBeenCalledWith("lunar");
        expect(calls.initAnimation).toHaveBeenCalledWith({ reset: false });
        expect(calls.onConfigChanged).toHaveBeenCalledWith("lunar", "geo");
    });

    it("tears down a scene that has not finished building its curves", () => {
        const scene = makeScene({ state: "loading" });
        const scenes = { geo: scene };
        const { actions } = makeActions({ originMode: "lunar", scenes });

        actions.toggleMode();

        expect(scene.stopCreation).toHaveBeenCalledTimes(1);
        expect(scene.dispose).toHaveBeenCalledTimes(1);
        expect("geo" in scenes).toBe(false);
    });

    it("keeps a fully built scene alive and only hides its body halos", () => {
        // Scenes are reused across origin switches in steady state; the halos
        // would otherwise linger over the frame that is being left behind.
        const scene = makeScene();
        scene.sceneHelpers = { updateBodyHalos: vi.fn() };
        const scenes = { geo: scene };
        const { actions } = makeActions({ originMode: "lunar", scenes });

        actions.toggleMode();

        expect(scene.dispose).not.toHaveBeenCalled();
        expect(scenes.geo).toBe(scene);
        expect(scene.sceneHelpers.updateBodyHalos).toHaveBeenCalledWith({ visible: false });
    });

    it("switches cleanly when there is no scene to leave behind", () => {
        const { actions, calls } = makeActions({ originMode: "lunar", scenes: {} });

        actions.toggleMode();

        expect(calls.setConfig).toHaveBeenCalledWith("lunar");
    });

    it("works without a config-changed hook", () => {
        const actions = createSettingsActions({
            getConfig: () => "geo",
            setConfig: () => {},
            animationScenes: {},
            AnimationScene: { SCENE_STATE_ADD_CURVE_DONE: ADD_CURVE_DONE },
            initAnimation: () => {},
            readOriginMode: () => "lunar",
            readViewSettings: () => defaultViewSettings(),
            setFPSCounterVisibility: () => {},
            render: () => {},
            getGlobalConfig: () => ({}),
            getAnimationRunning: () => false,
            setViewFlags: () => {},
            setDimension: () => {},
        });

        expect(() => actions.toggleMode()).not.toThrow();
    });
});

describe("the dimension control", () => {
    it("drops back to the two-dimensional view", () => {
        const { actions, calls } = makeActions();

        actions.setDimensionTop();

        expect(calls.setDimension).toHaveBeenCalledWith(false);
    });
});

describe("applying the view settings", () => {
    it("publishes the requested flags and refreshes the frame", () => {
        const { actions, calls, state } = makeActions();

        actions.setView();

        expect(calls.syncViewIdentity).toHaveBeenCalledTimes(1);
        expect(calls.setViewFlags).toHaveBeenCalledWith(state.viewSettings);
        expect(calls.setFPSCounterVisibility).toHaveBeenCalledWith(false);
        expect(calls.render).toHaveBeenCalledTimes(1);
    });

    it("announces the locators pill state to assistive technology", () => {
        const { actions } = makeActions({ viewSettings: defaultViewSettings({ viewBodyHalos: true }) });

        actions.setView();
        expect(dom.document.getElementById("locators-pill").getAttribute("aria-pressed")).toBe("true");

        const off = makeActions({ viewSettings: defaultViewSettings({ viewBodyHalos: false }) });
        off.actions.setView();
        expect(dom.document.getElementById("locators-pill").getAttribute("aria-pressed")).toBe("false");
    });

    it("works without a view-identity hook", () => {
        const actions = createSettingsActions({
            getConfig: () => "geo",
            setConfig: () => {},
            animationScenes: {},
            AnimationScene: { SCENE_STATE_ADD_CURVE_DONE: ADD_CURVE_DONE },
            initAnimation: () => {},
            readOriginMode: () => "geo",
            readViewSettings: () => defaultViewSettings(),
            setFPSCounterVisibility: () => {},
            render: () => {},
            getGlobalConfig: () => ({}),
            getAnimationRunning: () => false,
            setViewFlags: () => {},
            setDimension: () => {},
            syncViewIdentity: null,
        });

        expect(() => actions.setView()).not.toThrow();
    });

    it("survives having no scenes built yet", () => {
        const { actions, calls } = makeActions({ scenes: {} });

        actions.setView();

        expect(calls.render).toHaveBeenCalledTimes(1);
    });
});

describe("the two-dimensional orbit style", () => {
    it("shows the classic path and hides the trail layers in classic style", () => {
        const group = mountOrbitGroup("SC");
        const { actions } = makeActions({
            scenes: { geo: makeScene() },
            viewSettings: defaultViewSettings({ orbitStyle: "classic" }),
        });

        actions.setView();

        expect(group.getAttribute("data-orbit-style")).toBe("classic");
        expect(pathOf(group, "orbit-classic-path").getAttribute("visibility")).toBe("inherit");
        expect(pathOf(group, "orbit-trail-tail").getAttribute("visibility")).toBe("hidden");
        expect(pathOf(group, "orbit-trail-head").getAttribute("visibility")).toBe("hidden");
    });

    it("still renders classic when trail is requested", () => {
        // `resolveEffectiveOrbitStyle` is pinned to "classic" by a hotfix, so a
        // stored trail preference must not reach the SVG. This is the guard on
        // that pin: if the pin is lifted, this expectation is what should change.
        const group = mountOrbitGroup("SC");
        const { actions } = makeActions({
            scenes: { geo: makeScene() },
            viewSettings: defaultViewSettings({ orbitStyle: "trail" }),
        });

        actions.setView();

        expect(group.getAttribute("data-orbit-style")).toBe("classic");
        expect(pathOf(group, "orbit-classic-path").getAttribute("visibility")).toBe("inherit");
        expect(pathOf(group, "orbit-trail-background").getAttribute("visibility")).toBe("hidden");
    });

    it("derives the track, tail and head opacities from the brightness controls", () => {
        const group = mountOrbitGroup("SC");
        const { actions } = makeActions({
            scenes: { geo: makeScene() },
            viewSettings: defaultViewSettings({
                trailTrackBrightness2D: 0.4,
                trailTailBrightness2D: 0.7,
            }),
        });

        actions.setView();

        expect(pathOf(group, "orbit-trail-background").getAttribute("stroke-opacity"))
            .toBe(String(resolveTrackOpacity2D(0.4)));
        expect(pathOf(group, "orbit-trail-tail").getAttribute("stroke-opacity"))
            .toBe(String(resolveTailOpacity2D(0.7)));
        expect(pathOf(group, "orbit-trail-head").getAttribute("stroke-opacity"))
            .toBe(String(resolveHeadOpacity2D(0.7)));
    });

    it("zeroes the mid and glow layers in classic style", () => {
        const group = mountOrbitGroup("SC");
        const { actions } = makeActions({
            scenes: { geo: makeScene() },
            viewSettings: defaultViewSettings({ orbitStyle: "classic" }),
        });

        actions.setView();

        expect(pathOf(group, "orbit-trail-mid").getAttribute("stroke-opacity")).toBe("0");
        expect(pathOf(group, "orbit-trail-head-glow").getAttribute("stroke-opacity")).toBe("0");
    });

    it("leaves bodies with no orbit group in the page alone", () => {
        const { actions, calls } = makeActions({
            scenes: { geo: makeScene({ bodyIds: ["SC", "MOON"] }) },
        });

        expect(() => actions.setView()).not.toThrow();
        expect(calls.render).toHaveBeenCalledTimes(1);
    });
});

describe("the trail tail prominence", () => {
    it("sizes and fades every two-dimensional trail layer", () => {
        const group = mountOrbitGroup("SC");
        const { actions } = makeActions({
            scenes: { geo: makeScene() },
            viewSettings: defaultViewSettings({ trailTailBrightness2D: 0.6 }),
        });

        actions.setView();
        const style = resolveTailVisualStyle({ dimension: "2D", prominence: 0.6 });

        expect(pathOf(group, "orbit-trail-tail").getAttribute("stroke-width"))
            .toBe(String(style.tailWidth));
        expect(pathOf(group, "orbit-trail-mid").getAttribute("stroke-width"))
            .toBe(String(style.midWidth));
        expect(pathOf(group, "orbit-trail-head-glow").getAttribute("stroke-width"))
            .toBe(String(style.headGlowWidth));
        expect(pathOf(group, "orbit-trail-head").getAttribute("stroke-width"))
            .toBe(String(style.headWidth));
    });

    it("fades the three-dimensional trail line materials to match", () => {
        const scene = makeScene();
        const { actions } = makeActions({
            scenes: { geo: scene },
            viewSettings: defaultViewSettings({ trailTailBrightness3D: 0.3 }),
        });

        actions.setView();
        const style = resolveTailVisualStyle({ dimension: "3D", prominence: 0.3 });
        const bundle = scene.orbitTrailLinesByBodyId.SC;

        expect(bundle.tailLine.material.opacity).toBe(style.tailOpacity);
        expect(bundle.midLine.material.opacity).toBe(style.midOpacity);
        expect(bundle.headGlowLine.material.opacity).toBe(style.headGlowOpacity);
        expect(bundle.headLine.material.opacity).toBe(style.headOpacity);
        expect(bundle.tailLine.material.needsUpdate).toBe(true);
    });

    it("tolerates a trail bundle with missing lines", () => {
        const scene = makeScene();
        scene.orbitTrailLinesByBodyId.SC = { tailLine: null, midLine: { material: null } };
        const { actions } = makeActions({ scenes: { geo: scene } });

        expect(() => actions.setView()).not.toThrow();
    });
});

describe("the relative origin control", () => {
    it("treats a checked origin-relative control as the relative frame", () => {
        dom.document.getElementById("origin-relative").checked = true;
        const { actions, calls } = makeActions({ scenes: { geo: makeScene() } });

        actions.setView();

        expect(calls.render).toHaveBeenCalledTimes(1);
    });
});
