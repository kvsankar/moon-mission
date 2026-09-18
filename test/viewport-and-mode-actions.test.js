import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeDom } from "./helpers/fake-dom.js";
import { createAnimationActions } from "../src/platform/js/app/animation-actions.js";
import { createLockActions } from "../src/platform/js/app/lock-actions.js";
import { createModeActions } from "../src/platform/js/app/mode-actions.js";
import { createNavigationActions } from "../src/platform/js/app/navigation-actions.js";
import { createScene2DFrameActions } from "../src/platform/js/app/scene-2d-frame-actions.js";
import { createZoomActions } from "../src/platform/js/app/zoom-actions.js";

let dom = null;

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("animation actions", () => {
    function makeController() {
        return {
            toggle: vi.fn(),
            play: vi.fn(),
            pause: vi.fn(),
            fastBackward: vi.fn(),
            stepBackward: vi.fn(),
            stepForward: vi.fn(),
            fastForward: vi.fn(),
            goToStart: vi.fn(),
            goToEnd: vi.fn(),
            goToNow: vi.fn(),
            goToEvent: vi.fn(),
            faster: vi.fn(),
            slower: vi.fn(),
            resetSpeed: vi.fn(),
            setRealtimeSpeed: vi.fn(),
        };
    }

    function makeActions(overrides = {}) {
        const animationController = makeController();
        const setMissionStartCalled = vi.fn();
        const clearLegacyTimeout = vi.fn();
        const actions = createAnimationActions({
            animationController,
            getAnimTime: () => 1_700_000,
            getTimeTransLunarInjection: () => 2_000_000,
            getTimeLunarOrbitInsertion: () => 3_000_000,
            setMissionStartCalled,
            clearLegacyTimeout,
            ...overrides,
        });
        return { actions, animationController, setMissionStartCalled, clearLegacyTimeout };
    }

    it("maps each transport action onto the controller", () => {
        const { actions, animationController } = makeActions();

        actions.toggleAnimation();
        actions.playAnimation();
        actions.fastBackward();
        actions.backward();
        actions.forward();
        actions.fastForward();
        actions.missionEnd();
        actions.missionNow();
        actions.faster();
        actions.slower();
        actions.resetspeed();
        actions.realtime();

        expect(animationController.toggle).toHaveBeenCalledTimes(1);
        expect(animationController.play).toHaveBeenCalledTimes(1);
        expect(animationController.fastBackward).toHaveBeenCalledTimes(1);
        expect(animationController.stepBackward).toHaveBeenCalledTimes(1);
        expect(animationController.stepForward).toHaveBeenCalledTimes(1);
        expect(animationController.fastForward).toHaveBeenCalledTimes(1);
        expect(animationController.goToEnd).toHaveBeenCalledTimes(1);
        expect(animationController.goToNow).toHaveBeenCalledTimes(1);
        expect(animationController.faster).toHaveBeenCalledTimes(1);
        expect(animationController.slower).toHaveBeenCalledTimes(1);
        expect(animationController.resetSpeed).toHaveBeenCalledTimes(1);
        expect(animationController.setRealtimeSpeed).toHaveBeenCalledTimes(1);
    });

    it("keeps the legacy CY3 alias pointed at the toggle", () => {
        const { actions, animationController } = makeActions();

        actions.cy3Animate();

        expect(animationController.toggle).toHaveBeenCalledTimes(1);
        expect(actions.cy3Animate).toBe(actions.toggleAnimation);
    });

    it("clears the legacy timeout when playback stops", () => {
        const { actions, animationController, clearLegacyTimeout } = makeActions();

        actions.stopAnimation();

        expect(animationController.pause).toHaveBeenCalledTimes(1);
        expect(clearLegacyTimeout).toHaveBeenCalledTimes(1);
    });

    it("stops cleanly when no legacy timeout hook is supplied", () => {
        const { actions, animationController } = makeActions({ clearLegacyTimeout: undefined });

        expect(() => actions.stopAnimation()).not.toThrow();
        expect(animationController.pause).toHaveBeenCalledTimes(1);
    });

    it("records that mission start was requested explicitly", () => {
        const { actions, animationController, setMissionStartCalled } = makeActions();

        actions.missionStart();

        expect(setMissionStartCalled).toHaveBeenCalledWith(true);
        expect(animationController.goToStart).toHaveBeenCalledTimes(1);
    });

    it("tags each seek with the control that requested it", () => {
        const { actions, animationController } = makeActions();

        actions.missionSetTime();
        actions.missionTLI();
        actions.missionLunar();

        expect(animationController.goToEvent.mock.calls).toEqual([
            [1_700_000, { source: "mission-set-time" }],
            [2_000_000, { source: "mission-tli" }],
            [3_000_000, { source: "mission-lunar" }],
        ]);
    });
});

describe("lock actions", () => {
    function makeHarness(initial = {}) {
        const scene = {
            lockOnSC: false,
            lockOnMoon: false,
            lockOnEarth: false,
            ...initial,
        };
        const setChecked = vi.fn();
        const reset = vi.fn();
        const actions = createLockActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            reset,
            setChecked,
        });
        return { actions, scene, setChecked, reset };
    }

    it("locks onto the craft and clears the other locks", () => {
        const { actions, scene, setChecked, reset } = makeHarness({ lockOnMoon: true });

        actions.toggleLockSC();

        expect(scene.lockOnSC).toBe(true);
        expect(scene.lockOnMoon).toBe(false);
        expect(scene.lockOnEarth).toBe(false);
        expect(setChecked).toHaveBeenCalledWith("#checkbox-lock-moon", false);
        expect(setChecked).toHaveBeenCalledWith("#checkbox-lock-earth", false);
        expect(reset).toHaveBeenCalledTimes(1);
    });

    it("remembers the previous lock state for each toggle", () => {
        const { actions, scene } = makeHarness({ lockOnMoon: true });

        actions.toggleLockSC();

        expect(scene.previousLockOnSC).toBe(false);
        expect(scene.previousLockOnMoon).toBe(true);
        expect(scene.previousLockOnEarth).toBe(false);
    });

    it("unlocks the craft on a second toggle", () => {
        const { actions, scene } = makeHarness({ lockOnSC: true });

        actions.toggleLockSC();

        expect(scene.lockOnSC).toBe(false);
    });

    it("locks onto the Moon exclusively", () => {
        const { actions, scene, setChecked } = makeHarness({ lockOnSC: true, lockOnEarth: true });

        actions.toggleLockMoon();

        expect(scene.lockOnMoon).toBe(true);
        expect(scene.lockOnSC).toBe(false);
        expect(scene.lockOnEarth).toBe(false);
        expect(setChecked).toHaveBeenCalledWith("#checkbox-lock-sc", false);
    });

    it("locks onto Earth exclusively", () => {
        const { actions, scene, setChecked } = makeHarness({ lockOnSC: true, lockOnMoon: true });

        actions.toggleLockEarth();

        expect(scene.lockOnEarth).toBe(true);
        expect(scene.lockOnSC).toBe(false);
        expect(scene.lockOnMoon).toBe(false);
        expect(setChecked).toHaveBeenCalledWith("#checkbox-lock-moon", false);
    });
});

describe("navigation actions", () => {
    function makeHarness() {
        const state = { panX: 7, panY: -3, zoomFactor: 4 };
        const zoomChange = vi.fn();
        const zoomEnd = vi.fn();
        const render = vi.fn();
        const toggleInfo = vi.fn();
        const actions = createNavigationActions({
            getPanX: () => state.panX,
            setPanX: (value) => { state.panX = value; },
            getPanY: () => state.panY,
            setPanY: (value) => { state.panY = value; },
            getZoomFactor: () => state.zoomFactor,
            setZoomFactor: (value) => { state.zoomFactor = value; },
            zoomChange,
            zoomEnd,
            render,
            getZoomTimeoutMs: () => 250,
            getZoomScale: () => 2,
            toggleInfo,
        });
        return { actions, state, zoomChange, zoomEnd, render, toggleInfo };
    }

    it("returns the 2D view to its unzoomed, uncentred state", () => {
        const { actions, state, zoomChange, zoomEnd } = makeHarness();

        actions.reset();

        expect(state).toEqual({ panX: 0, panY: 0, zoomFactor: 1 });
        expect(zoomChange).toHaveBeenCalledWith(250);
        expect(zoomEnd).toHaveBeenCalledTimes(1);
    });

    it("multiplies and divides the zoom factor by the configured scale", () => {
        const { actions, state } = makeHarness();

        actions.zoomIn();
        expect(state.zoomFactor).toBe(8);

        actions.zoomOut();
        expect(state.zoomFactor).toBe(4);
    });

    it("pans by ten units in each direction", () => {
        const { actions, state } = makeHarness();

        actions.panLeft();
        expect(state.panX).toBe(17);
        actions.panRight();
        expect(state.panX).toBe(7);
        actions.panUp();
        expect(state.panY).toBe(7);
        actions.panDown();
        expect(state.panY).toBe(-3);
    });

    it("redraws each pan and zoom with the configured transition time", () => {
        const { actions, zoomChange } = makeHarness();

        actions.panUp();
        actions.zoomIn();

        expect(zoomChange.mock.calls).toEqual([[250], [250]]);
    });

    it("redraws after toggling the info overlay", () => {
        const { actions, toggleInfo, render } = makeHarness();

        actions.toggleInfo();

        expect(toggleInfo).toHaveBeenCalledTimes(1);
        expect(render).toHaveBeenCalledTimes(1);
    });
});

describe("zoom actions", () => {
    function makeHarness({ dimension = "2D", scene = {}, svgContainer = undefined } = {}) {
        const attributes = new Map();
        const container = svgContainer === undefined
            ? {
                attr: vi.fn((name, value) => {
                    if (value === undefined) return attributes.get(name) ?? null;
                    attributes.set(name, value);
                    return container;
                }),
            }
            : svgContainer;
        const elements = new Map();
        const d3 = {
            select: vi.fn((selector) => elements.get(selector) || { empty: () => true }),
        };
        const sceneEntry = { lockOnSC: false, lockOnMoon: false, lockOnEarth: false, ...scene };
        const adjustLabelLocations = vi.fn();
        const showGreenwichLongitude = vi.fn();
        const state = { zoomFactor: 2, panX: 10, panY: 20 };
        const actions = createZoomActions({
            d3,
            getSvgContainer: () => container,
            getCurrentDimension: () => dimension,
            animationScenes: { geo: sceneEntry },
            getConfig: () => "geo",
            getZoomFactor: () => state.zoomFactor,
            setZoomFactor: (value) => { state.zoomFactor = value; },
            getPanX: () => state.panX,
            setPanX: (value) => { state.panX = value; },
            getPanY: () => state.panY,
            setPanY: (value) => { state.panY = value; },
            getOffsetX: () => 100,
            getOffsetY: () => 200,
            adjustLabelLocations,
            showGreenwichLongitude,
            getOrbitStyle: () => "classic",
        });
        const addElement = (selector, cx, cy) => {
            elements.set(selector, {
                empty: () => false,
                attr: (name) => (name === "cx" ? String(cx) : String(cy)),
            });
        };
        return {
            actions,
            container,
            sceneEntry,
            state,
            attributes,
            addElement,
            adjustLabelLocations,
            showGreenwichLongitude,
        };
    }

    it("writes an offset-only transform when nothing is locked", () => {
        const { actions, attributes } = makeHarness();

        actions.zoomChangeTransform(0);

        expect(attributes.get("transform")).toBe("matrix(2, 0, 0, 2, 110, 220)");
    });

    it("keeps a locked craft anchored while zooming", () => {
        const harness = makeHarness({ scene: { lockOnSC: true, activeCraftId: "ORION" } });
        harness.addElement("#ORION", 30, 40);

        harness.actions.zoomChangeTransform(0);

        // Anchoring subtracts the extra offset the scale introduced at the lock point.
        expect(harness.attributes.get("transform")).toBe("matrix(2, 0, 0, 2, 50, 140)");
    });

    it("falls back to the default craft id when none is active", () => {
        const harness = makeHarness({ scene: { lockOnSC: true } });
        harness.addElement("#SC", 30, 40);

        harness.actions.zoomChangeTransform(0);

        expect(harness.attributes.get("transform")).toBe("matrix(2, 0, 0, 2, 50, 140)");
    });

    it("ignores a lock whose element is missing from the SVG", () => {
        const harness = makeHarness({ scene: { lockOnMoon: true } });

        harness.actions.zoomChangeTransform(0);

        expect(harness.attributes.get("transform")).toBe("matrix(2, 0, 0, 2, 110, 220)");
    });

    it("lets an Earth lock win over a craft lock", () => {
        const harness = makeHarness({ scene: { lockOnSC: true, lockOnEarth: true } });
        harness.addElement("#SC", 30, 40);
        harness.addElement("#EARTH", 0, 0);

        harness.actions.zoomChangeTransform(0);

        expect(harness.attributes.get("transform")).toBe("matrix(2, 0, 0, 2, 110, 220)");
    });

    it("mirrors the applied transform onto the scene", () => {
        const { actions, sceneEntry } = makeHarness();

        actions.zoomChangeTransform(0);

        expect(sceneEntry.orbitSvgTransformMatrix).toBe("matrix(2, 0, 0, 2, 110, 220)");
    });

    it("does nothing in 3D mode", () => {
        const { actions, attributes } = makeHarness({ dimension: "3D" });

        actions.zoomChangeTransform(0);

        expect(attributes.size).toBe(0);
    });

    it("does nothing without an SVG container", () => {
        const { actions, showGreenwichLongitude } = makeHarness({ svgContainer: null });

        actions.zoomChange(0);

        // The Greenwich line still follows, because it is independent of the transform.
        expect(showGreenwichLongitude).toHaveBeenCalledTimes(1);
    });

    it("redraws the Greenwich meridian with every zoom change", () => {
        const { actions, showGreenwichLongitude } = makeHarness();

        actions.zoomChange(0);

        expect(showGreenwichLongitude).toHaveBeenCalledTimes(1);
    });

    it("reads the modern d3 zoom event transform", () => {
        const { actions, state, attributes } = makeHarness();

        actions.handleZoomNew({ transform: { x: 150, y: 260, k: 3 } });

        expect(state).toEqual({ zoomFactor: 3, panX: 50, panY: 60 });
        expect(attributes.get("transform")).toBe("matrix(3, 0, 0, 3, 150, 260)");
    });

    it("defaults a d3 transform with missing fields to the identity scale", () => {
        const { actions, state } = makeHarness();

        actions.handleZoomNew({ transform: {} });

        expect(state).toEqual({ zoomFactor: 1, panX: -100, panY: -200 });
    });

    it("re-places labels once a zoom gesture ends", () => {
        const { actions, adjustLabelLocations } = makeHarness();

        actions.zoomEnd();

        expect(adjustLabelLocations).toHaveBeenCalledTimes(1);
    });
});

describe("2D frame rendering actions", () => {
    function makeHarness({ controller = undefined, craftData = null } = {}) {
        const calls = [];
        const activeController = controller === undefined
            ? {
                setPlaneConfig: vi.fn((config) => calls.push(["plane", config])),
                setZoomPan: vi.fn((...args) => calls.push(["zoomPan", args])),
                render: vi.fn((...args) => calls.push(["render", args])),
                getCraftData: craftData === null ? undefined : vi.fn(() => craftData),
            }
            : controller;
        const setCraftData = vi.fn();
        const setLabelLocation = vi.fn();
        const zoomChangeTransform = vi.fn();
        const showGreenwichLongitude = vi.fn();
        const actions = createScene2DFrameActions({
            animation2DControllers: { geo: activeController },
            animationScenes: { geo: { planetsForLocations: ["EARTH", "MOON"] } },
            getConfig: () => "geo",
            getPlaneVariables: () => ({
                xVariable: "x",
                yVariable: "y",
                zVariable: "z",
                xFactor: 1,
                yFactor: -1,
                zFactor: 1,
            }),
            getZoomFactor: () => 3,
            getPanX: () => 11,
            getPanY: () => 12,
            setCraftData,
            setLabelLocation,
            zoomChangeTransform,
            showGreenwichLongitude,
        });
        return {
            actions,
            activeController,
            calls,
            setCraftData,
            setLabelLocation,
            zoomChangeTransform,
            showGreenwichLongitude,
        };
    }

    const sceneState = { bodies: { EARTH: { available: true }, MOON: { available: false } } };

    it("pushes the plane and viewport onto the controller before rendering", () => {
        const { actions, calls } = makeHarness();

        actions.render2DFrame({ sceneState, renderOptions: { trail: true } });

        expect(calls.map(([name]) => name)).toEqual(["plane", "zoomPan", "render"]);
        expect(calls[0][1]).toEqual({
            xVariable: "x",
            yVariable: "y",
            zVariable: "z",
            xFactor: 1,
            yFactor: -1,
            zFactor: 1,
        });
        expect(calls[1][1]).toEqual([3, 11, 12]);
        expect(calls[2][1]).toEqual([sceneState, { trail: true }]);
    });

    it("re-places one label per tracked body using the computed state", () => {
        const { actions, setLabelLocation } = makeHarness();

        actions.render2DFrame({ sceneState, renderOptions: {} });

        expect(setLabelLocation.mock.calls).toEqual([
            ["EARTH", sceneState.bodies.EARTH],
            ["MOON", sceneState.bodies.MOON],
        ]);
    });

    it("publishes finite craft data back to the legacy holder", () => {
        const { actions, setCraftData } = makeHarness({ craftData: { x: 5, y: 6, angle: 30 } });

        actions.render2DFrame({ sceneState, renderOptions: {} });

        expect(setCraftData).toHaveBeenCalledWith({ x: 5, y: 6, angle: 30 });
    });

    it("ignores non-finite craft data", () => {
        const { actions, setCraftData } = makeHarness({ craftData: { x: Number.NaN, y: 6 } });

        actions.render2DFrame({ sceneState, renderOptions: {} });

        expect(setCraftData).not.toHaveBeenCalled();
    });

    it("still re-places labels and chrome without a 2D controller", () => {
        const harness = makeHarness({ controller: null });

        harness.actions.render2DFrame({ sceneState, renderOptions: {} });

        expect(harness.setLabelLocation).toHaveBeenCalledTimes(2);
        expect(harness.zoomChangeTransform).toHaveBeenCalledWith(0);
        expect(harness.showGreenwichLongitude).toHaveBeenCalledTimes(1);
    });
});

describe("mode actions", () => {
    let harness = null;

    beforeEach(() => {
        dom = installFakeDom([
            { id: "joyridebutton", tag: "button" },
            { id: "landingbutton", tag: "button", className: "header-pill__segment-button" },
            { id: "joyride", tag: "input" },
            { id: "landing", tag: "input" },
            { id: "view-orbit", tag: "input" },
            { id: "view-sky", tag: "input" },
        ]);

        const scene = {
            craft: { visible: true },
            craftInner: { visible: true },
            craftEdges: { visible: true },
            craftAxesHelper: { visible: true },
            craftsById: { ORION: { visible: true } },
            craftInnersById: { ORION: { visible: true } },
            craftEdgesById: { ORION: { visible: true } },
            craftAxesHelpersById: { ORION: { visible: true } },
            dronesById: { DRONE: { visible: true } },
            motherContainer: { position: { set: vi.fn() } },
        };
        const flags = { joyRide: false, landing: false };
        const render = vi.fn();
        const updateCraftScale = vi.fn();
        const setView = vi.fn();
        const actions = createModeActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            getGlobalConfig: () => ({ landing: { enabled: true } }),
            render,
            updateCraftScale,
            getLandingFlag: () => flags.landing,
            setLandingFlag: (value) => { flags.landing = value; },
            getJoyRideFlag: () => flags.joyRide,
            setJoyRideFlag: (value) => { flags.joyRide = value; },
            setView,
        });
        harness = { actions, scene, flags, render, updateCraftScale, setView };
    });

    it("hides every craft collection when Joy Ride starts", () => {
        harness.actions.toggleJoyRide();

        expect(harness.flags.joyRide).toBe(true);
        expect(harness.scene.craft.visible).toBe(false);
        expect(harness.scene.craftsById.ORION.visible).toBe(false);
        expect(harness.scene.craftInnersById.ORION.visible).toBe(false);
        expect(harness.scene.craftAxesHelpersById.ORION.visible).toBe(false);
        expect(harness.scene.dronesById.DRONE.visible).toBe(false);
        expect(harness.scene.craftVisible).toBe(false);
    });

    it("keeps the craft edge locator off even when the plan asks for it", () => {
        harness.actions.toggleJoyRide();
        harness.actions.toggleJoyRide();

        // Leaving Joy Ride restores craft visibility, but the edge overlay
        // stays gated off by the hotfix flag.
        expect(harness.scene.craft.visible).toBe(true);
        expect(harness.scene.craftEdges.visible).toBe(false);
        expect(harness.scene.craftEdgesById.ORION.visible).toBe(false);
    });

    it("recentres the mother container when entering a camera mode", () => {
        harness.actions.toggleJoyRide();

        expect(harness.scene.motherContainer.position.set).toHaveBeenCalledWith(0, 0, 0);
    });

    it("leaves the mother container alone when leaving a camera mode", () => {
        harness.actions.toggleJoyRide();
        harness.scene.motherContainer.position.set.mockClear();

        harness.actions.toggleJoyRide();

        expect(harness.scene.motherContainer.position.set).not.toHaveBeenCalled();
    });

    it("mirrors the mode into the button and checkbox controls", () => {
        harness.actions.toggleJoyRide();

        const joyrideButton = dom.document.getElementById("joyridebutton");
        expect(joyrideButton.classList.contains("down")).toBe(true);
        expect(joyrideButton.getAttribute("aria-pressed")).toBe("true");
        expect(dom.document.getElementById("joyride").checked).toBe(true);
        expect(dom.document.getElementById("landing").checked).toBe(false);
    });

    it("also shades segmented header pills with is-active", () => {
        harness.actions.toggleLanding();

        const landingButton = dom.document.getElementById("landingbutton");
        expect(landingButton.classList.contains("down")).toBe(true);
        expect(landingButton.classList.contains("is-active")).toBe(true);
    });

    it("applies the mode's view settings and redraws", () => {
        harness.actions.toggleJoyRide();

        expect(harness.setView).toHaveBeenCalledTimes(1);
        expect(harness.updateCraftScale).toHaveBeenCalledTimes(1);
        expect(harness.render).toHaveBeenCalledTimes(1);
    });

    it("leaves Joy Ride when Landing is selected", () => {
        harness.actions.toggleJoyRide();

        harness.actions.toggleLanding();

        expect(harness.flags.joyRide).toBe(false);
        expect(harness.flags.landing).toBe(true);
        expect(harness.scene.craft.visible).toBe(true);
    });

    it("refuses Landing for a mission that does not define it", () => {
        const scene = { motherContainer: { position: { set: vi.fn() } } };
        const flags = { joyRide: false, landing: false };
        const render = vi.fn();
        const actions = createModeActions({
            animationScenes: { geo: scene },
            getConfig: () => "geo",
            getGlobalConfig: () => ({}),
            render,
            updateCraftScale: vi.fn(),
            getLandingFlag: () => flags.landing,
            setLandingFlag: (value) => { flags.landing = value; },
            getJoyRideFlag: () => flags.joyRide,
            setJoyRideFlag: (value) => { flags.joyRide = value; },
            setView: vi.fn(),
        });

        actions.toggleLanding();

        expect(flags.landing).toBe(false);
        expect(render).not.toHaveBeenCalled();
    });
});
