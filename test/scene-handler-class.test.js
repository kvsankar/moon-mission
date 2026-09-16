import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const {
    auxiliaryManagerInstances,
    auxiliaryManagerConstructor,
} = vi.hoisted(() => {
    const instances = [];
    return {
        auxiliaryManagerInstances: instances,
        auxiliaryManagerConstructor: vi.fn(function (options) {
            const restoreSharedComposerBodyAmbientLighting = vi.fn();
            const instance = {
                render: vi.fn(),
                dispose: vi.fn(),
                restoreSharedComposerBodyAmbientLighting,
                applySharedComposerBodyAmbientLighting: vi.fn(() => restoreSharedComposerBodyAmbientLighting),
            };
            instances.push(instance);
            options?.requestRender?.();
            return instance;
        }),
    };
});

vi.mock("../src/platform/js/app/auxiliary-camera-views.js", () => ({
    AuxiliaryCameraViewsManager: auxiliaryManagerConstructor,
}));

vi.mock("../src/platform/js/app/panel-manager.js", () => ({
    DesktopPanelManager: vi.fn(function () {
        return { dispose: vi.fn() };
    }),
}));

import { createSceneHandlerClass } from "../src/platform/js/app/scene-handler-class.js";

describe("SceneHandler auxiliary panels", () => {
    beforeEach(() => {
        auxiliaryManagerConstructor.mockClear();
        auxiliaryManagerInstances.length = 0;
        globalThis.window = {
            innerWidth: 1280,
            requestAnimationFrame: vi.fn(() => 1),
        };
        globalThis.document = {
            body: {},
            getElementById: () => null,
        };
    });

    it("does not recursively construct auxiliary panel managers during requestRender re-entry", () => {
        const renderer = {
            autoClear: true,
            render: vi.fn(),
            clearDepth: vi.fn(),
        };

        const SceneHandler = createSceneHandlerClass({
            THREE,
            d3: {},
            bindSettingsPanel: vi.fn(),
            initSceneHandlerDom: vi.fn(() => ({
                renderer,
                canvasNode: {},
            })),
            computeSVGDimensions: vi.fn(),
            getSvgWidth: vi.fn(() => 100),
            getSvgHeight: vi.fn(() => 100),
            isTestMode: false,
            onWindowResize: vi.fn(),
            updateCraftScale: vi.fn(),
            getRuntimeState: vi.fn(() => ({
                globalConfig: null,
                joyRideFlag: false,
                landingFlag: false,
                viewAuxiliaryPanels: true,
                earthRadius: 1,
                moonRadius: 1,
                timelineEventInfos: [],
            })),
        });

        const handler = new SceneHandler();
        handler.lastAnimationScene = {
            initialized3D: true,
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera(),
            earthContainer: new THREE.Object3D(),
            moonContainer: new THREE.Object3D(),
            refreshBodyHalos: vi.fn(),
            stateSunDirection: null,
            stateSunDirections: null,
        };

        const manager = handler.ensureAuxiliaryCameraViews();

        expect(auxiliaryManagerConstructor).toHaveBeenCalledTimes(1);
        expect(manager).toBe(auxiliaryManagerInstances[0]);
        expect(handler.auxiliaryCameraViews).toBe(auxiliaryManagerInstances[0]);
    });

    it("coalesces auxiliary requestRender onto the next animation frame", () => {
        const rafCallbacks = [];
        globalThis.window.requestAnimationFrame = vi.fn((callback) => {
            rafCallbacks.push(callback);
            return rafCallbacks.length;
        });
        const renderer = {
            autoClear: true,
            render: vi.fn(),
            clearDepth: vi.fn(),
        };
        const animationScene = {
            initialized3D: true,
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera(),
            earthContainer: new THREE.Object3D(),
            moonContainer: new THREE.Object3D(),
            refreshBodyHalos: vi.fn(),
            stateSunDirection: null,
            stateSunDirections: null,
        };

        const SceneHandler = createSceneHandlerClass({
            THREE,
            d3: {},
            bindSettingsPanel: vi.fn(),
            initSceneHandlerDom: vi.fn(() => ({
                renderer,
                canvasNode: {},
            })),
            computeSVGDimensions: vi.fn(),
            getSvgWidth: vi.fn(() => 100),
            getSvgHeight: vi.fn(() => 100),
            isTestMode: false,
            onWindowResize: vi.fn(),
            updateCraftScale: vi.fn(),
            getRuntimeState: vi.fn(() => ({
                globalConfig: null,
                joyRideFlag: false,
                landingFlag: false,
                viewAuxiliaryPanels: true,
                earthRadius: 1,
                moonRadius: 1,
                timelineEventInfos: [],
            })),
        });

        const handler = new SceneHandler();
        handler.lastAnimationScene = animationScene;
        handler.ensureAuxiliaryCameraViews();
        const requestRender = auxiliaryManagerConstructor.mock.calls.at(-1)?.[0]?.requestRender;

        expect(typeof requestRender).toBe("function");
        expect(rafCallbacks).toHaveLength(1);
        requestRender();
        expect(rafCallbacks).toHaveLength(1);
        expect(renderer.render).not.toHaveBeenCalled();

        rafCallbacks.shift()();

        expect(handler.auxiliaryCameraRenderRaf).toBeNull();
        expect(renderer.render).toHaveBeenCalled();
    });

    it("applies Frame and Shoot ambient while rendering the main camera", () => {
        const renderer = {
            autoClear: true,
            render: vi.fn(),
            clearDepth: vi.fn(),
        };
        const earthContainer = new THREE.Object3D();
        const moonContainer = new THREE.Object3D();
        const camera = new THREE.PerspectiveCamera();

        const SceneHandler = createSceneHandlerClass({
            THREE,
            d3: {},
            bindSettingsPanel: vi.fn(),
            initSceneHandlerDom: vi.fn(() => ({
                renderer,
                canvasNode: {},
            })),
            computeSVGDimensions: vi.fn(),
            getSvgWidth: vi.fn(() => 100),
            getSvgHeight: vi.fn(() => 100),
            isTestMode: false,
            onWindowResize: vi.fn(),
            updateCraftScale: vi.fn(),
            getRuntimeState: vi.fn(() => ({
                globalConfig: null,
                joyRideFlag: false,
                landingFlag: false,
                viewPhotoMode: false,
                viewAuxiliaryPanels: true,
                earthRadius: 1,
                moonRadius: 1,
                timelineEventInfos: [],
            })),
        });

        const handler = new SceneHandler();
        const manager = handler.ensureAuxiliaryCameraViews();
        manager.applySharedComposerBodyAmbientLighting.mockClear();
        manager.restoreSharedComposerBodyAmbientLighting.mockClear();
        renderer.render.mockClear();

        handler.render({
            initialized3D: true,
            scene: new THREE.Scene(),
            camera,
            earthContainer,
            moonContainer,
            refreshBodyHalos: vi.fn(),
            stateSunDirection: null,
            stateSunDirections: null,
        });

        expect(manager.applySharedComposerBodyAmbientLighting).toHaveBeenCalledWith({
            earth: earthContainer,
            moon: moonContainer,
        });
        expect(manager.restoreSharedComposerBodyAmbientLighting).toHaveBeenCalledTimes(1);
        expect(manager.applySharedComposerBodyAmbientLighting.mock.invocationCallOrder[0])
            .toBeLessThan(renderer.render.mock.invocationCallOrder[0]);
        expect(manager.restoreSharedComposerBodyAmbientLighting.mock.invocationCallOrder[0])
            .toBeGreaterThan(renderer.render.mock.invocationCallOrder.at(-1));
    });

    it("freezes lunar label scaling during main canvas drag and refreshes after release", () => {
        const rafCallbacks = [];
        const windowListeners = {};
        globalThis.window = {
            innerWidth: 1280,
            requestAnimationFrame: vi.fn((callback) => {
                rafCallbacks.push(callback);
                return rafCallbacks.length;
            }),
            addEventListener: vi.fn((type, handler) => {
                windowListeners[type] = handler;
            }),
        };
        const domListeners = {};
        const domElement = {
            addEventListener: vi.fn((type, handler) => {
                domListeners[type] = handler;
            }),
        };
        const renderer = {
            autoClear: true,
            domElement,
            render: vi.fn(),
            clearDepth: vi.fn(),
        };
        const camera = new THREE.PerspectiveCamera();
        const animationScene = {
            initialized3D: true,
            scene: new THREE.Scene(),
            camera,
            earthContainer: new THREE.Object3D(),
            moonContainer: new THREE.Object3D(),
            refreshBodyHalos: vi.fn(),
            stateSunDirection: null,
            stateSunDirections: null,
            updateLunarCraterLabelScales: vi.fn(),
        };

        const SceneHandler = createSceneHandlerClass({
            THREE,
            d3: {},
            bindSettingsPanel: vi.fn(),
            initSceneHandlerDom: vi.fn(() => ({
                renderer,
                canvasNode: domElement,
            })),
            computeSVGDimensions: vi.fn(),
            getSvgWidth: vi.fn(() => 100),
            getSvgHeight: vi.fn(() => 100),
            isTestMode: false,
            onWindowResize: vi.fn(),
            updateCraftScale: vi.fn(),
            getRuntimeState: vi.fn(() => ({
                globalConfig: null,
                joyRideFlag: false,
                landingFlag: false,
                viewPhotoMode: false,
                viewAuxiliaryPanels: false,
                earthRadius: 1,
                moonRadius: 1,
                timelineEventInfos: [],
            })),
        });

        const handler = new SceneHandler();
        domListeners.pointerdown({ button: 0 });
        handler.render(animationScene);

        expect(animationScene.updateLunarCraterLabelScales).toHaveBeenLastCalledWith({
            camera,
            rendererDomElement: domElement,
            freezeScale: true,
        });

        windowListeners.pointerup({});
        expect(rafCallbacks).toHaveLength(1);
        rafCallbacks[0]();

        expect(animationScene.updateLunarCraterLabelScales).toHaveBeenLastCalledWith({
            camera,
            rendererDomElement: domElement,
            freezeScale: false,
        });
    });
});
