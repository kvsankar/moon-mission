import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
    AuxiliaryCameraViewsManager,
    isComposerPlanetVisibleForMagnitudeLimit,
    isComposerSkyLabelPointOccluded,
    resolveComposerSeeThroughMarkers,
    resolveComposerSkyLabelOccluders,
    selectComposerSkyLabelCandidates,
} from "../src/platform/js/app/auxiliary-camera-views.js";
import { LIGHT_SETTINGS as LT } from "../src/platform/js/core/constants.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("selectComposerSkyLabelCandidates", () => {
    it("selects the brightest 20 percent of projected in-view stars", () => {
        const candidates = [
            { text: "dim", magnitude: 5, point: { x: 10, y: 10 } },
            { text: "brightest", magnitude: -1, point: { x: 20, y: 20 } },
            { text: "mid", magnitude: 2, point: { x: 30, y: 30 } },
            { text: "bright", magnitude: 0, point: { x: 40, y: 40 } },
            { text: "faint", magnitude: 4, point: { x: 50, y: 50 } },
            { text: "middle", magnitude: 3, point: { x: 60, y: 60 } },
            { text: "fainter", magnitude: 4.5, point: { x: 70, y: 70 } },
            { text: "middim", magnitude: 3.5, point: { x: 80, y: 80 } },
            { text: "barely", magnitude: 5.5, point: { x: 90, y: 90 } },
            { text: "very dim", magnitude: 6, point: { x: 100, y: 100 } },
        ];

        expect(selectComposerSkyLabelCandidates(candidates).map((candidate) => candidate.text)).toEqual([
            "brightest",
            "bright",
        ]);
    });

    it("ignores non-projectable candidates and respects the label cap", () => {
        const candidates = [
            { text: "bad point", magnitude: -2, point: { x: Number.NaN, y: 10 } },
            { text: "", magnitude: -1, point: { x: 10, y: 10 } },
            { text: "A", magnitude: 0, point: { x: 10, y: 10 } },
            { text: "B", magnitude: 1, point: { x: 10, y: 10 } },
            { text: "C", magnitude: 2, point: { x: 10, y: 10 } },
        ];

        expect(
            selectComposerSkyLabelCandidates(candidates, {
                visibleFraction: 1,
                maxCount: 2,
            }).map((candidate) => candidate.text),
        ).toEqual(["A", "B"]);
    });

    it("ranks planet and star label candidates in one brightness order", () => {
        const candidates = [
            { text: "Sirius", style: "star", magnitude: -1.46, point: { x: 10, y: 10 } },
            { text: "Venus", style: "planet", magnitude: -4.4, point: { x: 20, y: 20 } },
            { text: "Jupiter", style: "planet", magnitude: -2.7, point: { x: 30, y: 30 } },
            { text: "Canopus", style: "star", magnitude: -0.74, point: { x: 40, y: 40 } },
        ];

        const selected = selectComposerSkyLabelCandidates(candidates, {
            visibleFraction: 1,
            maxCount: 4,
        });

        expect(selected.map((candidate) => candidate.text)).toEqual([
            "Venus",
            "Jupiter",
            "Sirius",
            "Canopus",
        ]);
        expect(selected[0].style).toBe("planet");
    });
});

describe("Frame and Shoot sky label occlusion", () => {
    it("treats label anchors inside a foreground body disk as occluded", () => {
        const occluders = [{ x: 100, y: 120, radiusPx: 24 }];

        expect(isComposerSkyLabelPointOccluded({ x: 110, y: 130 }, occluders)).toBe(true);
        expect(isComposerSkyLabelPointOccluded({ x: 140, y: 120 }, occluders)).toBe(false);
    });

    it("projects Earth and Moon world positions into screen-space label occluders", () => {
        const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        const occluders = resolveComposerSkyLabelOccluders({
            THREE,
            camera,
            width: 1000,
            height: 500,
            bodies: [
                { bodyId: "earth", centerWorld: new THREE.Vector3(0, 0, -10), radius: 1 },
                { bodyId: "behind-camera", centerWorld: new THREE.Vector3(0, 0, 10), radius: 1 },
            ],
            paddingPx: 0,
        });

        expect(occluders).toHaveLength(1);
        expect(occluders[0].bodyId).toBe("earth");
        expect(occluders[0].x).toBeCloseTo(500, 6);
        expect(occluders[0].y).toBeCloseTo(250, 6);
        expect(occluders[0].radiusPx).toBeGreaterThan(40);
    });
});

describe("Frame and Shoot see-through markers", () => {
    it("returns a dotted Sun marker when the Sun is behind Earth/Moon occluders", () => {
        const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        const skyContainer = new THREE.Object3D();
        skyContainer.updateMatrixWorld(true);

        const position = new Float32Array([
            0, 0, -1,
            0.6, 0, -0.8,
        ]);
        const alpha = new Float32Array([1, 1]);
        const size = new Float32Array([6.2, 4.3]);
        const color = new Float32Array([
            1, 0.95, 0.74,
            1, 0.56, 0.40,
        ]);
        const planetRenderer = {
            bodySlots: ["Sun", "Mars"],
            geometry: {
                getAttribute(name) {
                    if (name === "position") return { array: position, count: 2 };
                    if (name === "aAlpha") return { array: alpha, count: 2 };
                    if (name === "aSize") return { array: size, count: 2 };
                    if (name === "aColor") return { array: color, count: 2 };
                    return null;
                },
            },
        };

        const occluders = resolveComposerSkyLabelOccluders({
            THREE,
            camera,
            width: 1000,
            height: 500,
            bodies: [
                { bodyId: "earth", centerWorld: new THREE.Vector3(0, 0, -10), radius: 1 },
            ],
            paddingPx: 0,
        });

        const markers = resolveComposerSeeThroughMarkers({
            THREE,
            camera,
            width: 1000,
            height: 500,
            skyContainer,
            planetRenderer,
            occluders,
        });

        expect(markers).toHaveLength(1);
        expect(markers[0].label).toBe("Sun");
        expect(markers[0].x).toBeCloseTo(500, 6);
        expect(markers[0].y).toBeCloseTo(250, 6);
        expect(markers[0].radiusPx).toBeGreaterThan(5);
    });

    it("excludes Earth/Moon and only returns actually occluded bodies", () => {
        const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
        camera.position.set(0, 0, 0);
        camera.lookAt(0, 0, -1);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();

        const skyContainer = new THREE.Object3D();
        skyContainer.updateMatrixWorld(true);

        const position = new Float32Array([
            0, 0, -1,
            0, 0, -1,
            0.75, 0, -0.66,
        ]);
        const alpha = new Float32Array([1, 1, 1]);
        const size = new Float32Array([4.9, 4.6, 4.3]);
        const planetRenderer = {
            bodySlots: ["Earth", "Moon", "Mars"],
            geometry: {
                getAttribute(name) {
                    if (name === "position") return { array: position, count: 3 };
                    if (name === "aAlpha") return { array: alpha, count: 3 };
                    if (name === "aSize") return { array: size, count: 3 };
                    return null;
                },
            },
        };

        const occluders = resolveComposerSkyLabelOccluders({
            THREE,
            camera,
            width: 1000,
            height: 500,
            bodies: [
                { bodyId: "earth", centerWorld: new THREE.Vector3(0, 0, -10), radius: 1 },
            ],
            paddingPx: 0,
        });

        const markers = resolveComposerSeeThroughMarkers({
            THREE,
            camera,
            width: 1000,
            height: 500,
            skyContainer,
            planetRenderer,
            occluders,
        });

        expect(markers).toHaveLength(0);
    });
});

describe("Frame and Shoot body ambient controls", () => {
    function createManagerForAmbientTests() {
        return Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });
    }

    function createBodyWithMaterial(material) {
        return {
            traverse(callback) {
                callback({
                    isMesh: true,
                    material,
                });
            },
        };
    }

    it("applies Earth ambient to the Earth nightside shader uniform", () => {
        const manager = createManagerForAmbientTests();
        const material = {
            map: {},
            userData: {
                earthNightsideLift: 0,
            },
        };
        const uniform = { value: 0 };
        material.userData.refreshEarthShaderUniforms = () => {
            uniform.value = material.userData.earthNightsideLift;
        };

        const restore = manager.applyComposerBodyAmbientLighting({
            panelState: {
                composerEarthAmbient: 1.25,
                composerMoonAmbient: 0,
                composerEarthshineGain: 2.4,
            },
            earth: createBodyWithMaterial(material),
        });

        expect(material.userData.earthNightsideLift).toBeCloseTo(1.25, 6);
        expect(uniform.value).toBeCloseTo(1.25, 6);

        restore();

        expect(material.userData.earthNightsideLift).toBe(0);
        expect(uniform.value).toBe(0);
    });

    it("applies Frame and Shoot Earth ambient as shared panel-render lighting", () => {
        const manager = createManagerForAmbientTests();
        manager.panels = [
            {
                mode: "composer",
                composerEarthAmbient: 1.75,
                composerMoonAmbient: 0,
                composerMoonshineGain: 0,
            },
        ];
        const material = {
            map: {},
            userData: {
                earthNightsideLift: 0,
            },
        };
        const uniform = { value: 0 };
        material.userData.refreshEarthShaderUniforms = () => {
            uniform.value = material.userData.earthNightsideLift;
        };

        const restore = manager.applySharedComposerBodyAmbientLighting({
            earth: createBodyWithMaterial(material),
        });

        expect(material.userData.earthNightsideLift).toBeCloseTo(1.75, 6);
        expect(uniform.value).toBeCloseTo(1.75, 6);

        restore();

        expect(material.userData.earthNightsideLift).toBe(0);
        expect(uniform.value).toBe(0);
    });

    it("applies Moonshine gain to the Earth night-side shader as shared panel lighting", () => {
        const manager = createManagerForAmbientTests();
        manager.panels = [
            {
                mode: "composer",
                composerEarthAmbient: 0,
                composerMoonAmbient: 0,
                composerMoonshineGain: 2,
            },
        ];
        const material = {
            map: {},
            userData: {
                earthNightsideLift: 0,
                earthMoonshineLift: 0,
            },
        };
        const uniforms = {
            ambient: 0,
            moonshine: 0,
        };
        material.userData.refreshEarthShaderUniforms = () => {
            uniforms.ambient = material.userData.earthNightsideLift;
            uniforms.moonshine = material.userData.earthMoonshineLift;
        };

        const restore = manager.applySharedComposerBodyAmbientLighting({
            earth: createBodyWithMaterial(material),
        });

        expect(material.userData.earthNightsideLift).toBe(0);
        const expectedMoonshineLift = 2 * 0.65 * LT.MOONSHINE_TO_EARTHSHINE_INTENSITY_RATIO;
        expect(material.userData.earthMoonshineLift).toBeCloseTo(expectedMoonshineLift, 6);
        expect(uniforms.ambient).toBe(0);
        expect(uniforms.moonshine).toBeCloseTo(expectedMoonshineLift, 6);

        restore();

        expect(material.userData.earthNightsideLift).toBe(0);
        expect(material.userData.earthMoonshineLift).toBe(0);
        expect(uniforms.ambient).toBe(0);
        expect(uniforms.moonshine).toBe(0);
    });

    it("keeps Moon creative fill at zero when the Moon Fill slider is zero", () => {
        const manager = createManagerForAmbientTests();
        const material = {
            map: {},
            userData: {
                moonShadowLift: 0.42,
            },
        };
        const uniform = { value: 0.42 };
        material.userData.refreshMoonShaderUniforms = () => {
            uniform.value = material.userData.moonShadowLift;
        };

        const restore = manager.applyComposerBodyAmbientLighting({
            panelState: {
                composerEarthAmbient: 0,
                composerMoonAmbient: 0,
                composerEarthshineGain: 2.4,
            },
            moon: createBodyWithMaterial(material),
        });

        expect(material.userData.moonShadowLift).toBe(0);
        expect(uniform.value).toBe(0);

        restore();

        expect(material.userData.moonShadowLift).toBeCloseTo(0.42, 6);
        expect(uniform.value).toBeCloseTo(0.42, 6);
    });
});

describe("Frame and Shoot constellation line rendering", () => {
    function createManagerForExposureTests() {
        return Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });
    }

    it("persists Frame and Shoot exposure controls with the panel state", () => {
        const storage = new Map();
        vi.stubGlobal("localStorage", {
            getItem(key) {
                return storage.get(key) || null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            },
        });
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            panels: [
                {
                    id: "composer",
                    mode: "composer",
                    panelRegistryId: "composer",
                    missionEnabled: true,
                    camera: { fov: 42 },
                    autoFovEnabled: false,
                    composerControlsCollapsed: false,
                    composerExposureEv: 1.5,
                    composerAutoExposureEnabled: false,
                    panel: {
                        offsetLeft: 0,
                        offsetTop: 0,
                        offsetWidth: 640,
                        offsetHeight: 360,
                    },
                    restoreFrame: null,
                    maximized: false,
                    layoutPresetVersion: "",
                },
            ],
        });

        manager.persistPanelState();

        const persisted = JSON.parse(storage.get("moon-mission:aux-camera-panels:v1"));
        expect(persisted.composer).not.toHaveProperty("autoFovEnabled");
        expect(persisted.composer.composerExposureEv).toBe(1.5);
        expect(persisted.composer.composerAutoExposureEnabled).toBe(false);
    });

    it("applies manual Frame and Shoot exposure EV and restores renderer exposure", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1.14 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerExposureEv: 1,
            composerAutoExposureEnabled: false,
            composerEarthshineGain: 2.4,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, null);

        expect(panelState.renderer.toneMappingExposure).toBeCloseTo(0.98 * 2, 6);

        restore();

        expect(panelState.renderer.toneMappingExposure).toBeCloseTo(1.14, 6);
    });

    it("adds auto exposure only during Frame and Shoot eclipse renders", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerExposureEv: 0,
            composerAutoExposureEnabled: true,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };

        const restoreEclipse = manager.applyComposerExposureProfile({}, panelState, null, { eclipseActive: true });

        expect(panelState.renderer.toneMappingExposure).toBeCloseTo(0.98 * 32, 6);

        restoreEclipse();

        const restoreNormal = manager.applyComposerExposureProfile({}, panelState, null, { eclipseActive: false });

        expect(panelState.renderer.toneMappingExposure).toBeCloseTo(0.98, 6);

        restoreNormal();
    });

    it("temporarily enables the Milky Way sky layer for the composer render", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };
        const skyRenderer = {
            container: { visible: false },
            starRenderer: { container: { visible: false } },
            skyMesh: {
                visible: false,
                material: { opacity: 0.18 },
            },
            constellationMesh: {
                visible: false,
                material: { opacity: 0.06 },
            },
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, null, { skyRenderer });

        expect(skyRenderer.container.visible).toBe(true);
        expect(skyRenderer.skyMesh.visible).toBe(true);
        expect(skyRenderer.skyMesh.material.opacity).toBeCloseTo(0.03);
        expect(skyRenderer.starRenderer.container.visible).toBe(true);
        expect(skyRenderer.constellationMesh.visible).toBe(false);

        restore();

        expect(skyRenderer.container.visible).toBe(false);
        expect(skyRenderer.skyMesh.visible).toBe(false);
        expect(skyRenderer.skyMesh.material.opacity).toBeCloseTo(0.18);
        expect(skyRenderer.starRenderer.container.visible).toBe(false);
        expect(skyRenderer.constellationMesh.visible).toBe(false);
    });

    it("temporarily enables the sky constellation layer only when the composer checkbox is on", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: true,
        };
        const skyRenderer = {
            container: { visible: false },
            skyMesh: {
                visible: false,
                material: { opacity: 0.18 },
            },
            constellationMesh: {
                visible: false,
                material: { opacity: 0.06 },
            },
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, null, { skyRenderer });

        expect(skyRenderer.container.visible).toBe(true);
        expect(skyRenderer.skyMesh.visible).toBe(true);
        expect(skyRenderer.constellationMesh.visible).toBe(true);
        expect(skyRenderer.constellationMesh.material.opacity).toBeCloseTo(0.06);

        restore();

        expect(skyRenderer.container.visible).toBe(false);
        expect(skyRenderer.skyMesh.visible).toBe(false);
        expect(skyRenderer.constellationMesh.visible).toBe(false);
        expect(skyRenderer.constellationMesh.material.opacity).toBeCloseTo(0.06);
    });

    it("keeps regular Sun optics controls active outside eclipse", () => {
        const manager = createManagerForExposureTests();

        const profile = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
        });

        expect(profile.sunVisualState.haloOpacity).toBeGreaterThan(0.3);
        expect(profile.sunVisualState.haloScaleMul).toBeLessThan(12);
        expect(profile.sunVisualState.starburstOpacity).toBeGreaterThan(0);
        expect(profile.sunVisualState.flareOpacity).toBeGreaterThan(0);
        expect(profile.sunVisualState.coronaOpacity).toBe(0);
        expect(profile.sunVisualState.coronaFlowOpacity).toBe(0);
    });

    it("uses the composer magnitude limit for planet markers too", () => {
        expect(isComposerPlanetVisibleForMagnitudeLimit("Venus", -3)).toBe(true);
        expect(isComposerPlanetVisibleForMagnitudeLimit("Mars", -3)).toBe(false);
        expect(isComposerPlanetVisibleForMagnitudeLimit("Uranus", 6)).toBe(true);
        expect(isComposerPlanetVisibleForMagnitudeLimit("Neptune", 6)).toBe(false);
    });

    it("temporarily filters composer planet markers by magnitude during render presentation", () => {
        const manager = createManagerForExposureTests();
        const alphas = new Float32Array([1, 0.8, 0.6, 0.4]);
        const alphaAttr = { array: alphas, needsUpdate: false };
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: -3,
        };
        const skyRenderer = {
            planetRenderer: {
                bodySlots: ["Venus", "Mars", "Sun", "Neptune"],
                geometry: {
                    getAttribute: (name) => (name === "aAlpha" ? alphaAttr : null),
                },
            },
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, null, { skyRenderer });

        expect(alphas[0]).toBeCloseTo(1);
        expect(alphas[1]).toBeCloseTo(0);
        expect(alphas[2]).toBeCloseTo(0.6);
        expect(alphas[3]).toBeCloseTo(0);
        expect(alphaAttr.needsUpdate).toBe(true);

        restore();

        expect(alphas[0]).toBeCloseTo(1);
        expect(alphas[1]).toBeCloseTo(0.8);
        expect(alphas[2]).toBeCloseTo(0.6);
        expect(alphas[3]).toBeCloseTo(0.4);
    });

    it("ignores regular Sun optics controls during eclipse and uses corona controls instead", () => {
        const manager = createManagerForExposureTests();

        const lowRegularOptics = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerSunStrength: 0,
            composerSunHaloGain: 0,
            composerSunStarburstGain: 0,
            composerSunFlareGain: 0,
            composerEclipseCoronaIntensity: 1.3,
            composerEclipseCoronaMotion: 0.8,
            composerEclipseCoronaStructure: 1.4,
        }, { eclipseActive: true });
        const highRegularOptics = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerSunStrength: 2.4,
            composerSunHaloGain: 2.5,
            composerSunStarburstGain: 2.5,
            composerSunFlareGain: 2.5,
            composerEclipseCoronaIntensity: 1.3,
            composerEclipseCoronaMotion: 0.8,
            composerEclipseCoronaStructure: 1.4,
        }, { eclipseActive: true });

        expect(lowRegularOptics.sunVisualState).toMatchObject(highRegularOptics.sunVisualState);
        expect(lowRegularOptics.sunVisualState.haloOpacity).toBe(0);
        expect(lowRegularOptics.sunVisualState.starburstOpacity).toBe(0);
        expect(lowRegularOptics.sunVisualState.flareOpacity).toBe(0);
        expect(lowRegularOptics.sunVisualState.coronaOpacity).toBeGreaterThan(0.9);
        expect(lowRegularOptics.sunVisualState.coronaFlowOpacity).toBeGreaterThan(0.25);
        expect(lowRegularOptics.sunVisualState.coronaMotionMul).toBeCloseTo(0.8);
    });

    it("scales eclipse corona intensity and motion from separate controls", () => {
        const manager = createManagerForExposureTests();

        const dim = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerEclipseCoronaIntensity: 0.5,
            composerEclipseCoronaMotion: 0.25,
            composerEclipseCoronaStructure: 0.5,
        }, { eclipseActive: true });
        const bright = manager.resolveComposerSunOpticsProfile({
            mode: "composer",
            composerSunProfile: "camera",
            composerEclipseCoronaIntensity: 1.5,
            composerEclipseCoronaMotion: 1.75,
            composerEclipseCoronaStructure: 1.5,
        }, { eclipseActive: true });

        expect(bright.sunVisualState.coronaOpacity).toBeGreaterThan(dim.sunVisualState.coronaOpacity);
        expect(bright.sunVisualState.coronaFlowOpacity).toBeGreaterThan(dim.sunVisualState.coronaFlowOpacity);
        expect(bright.sunVisualState.coronaMotionMul).toBeCloseTo(1.75);
        expect(dim.sunVisualState.coronaMotionMul).toBeCloseTo(0.25);
    });

    it("detects craft-view solar eclipse geometry only at full Sun occultation", () => {
        const manager = Object.assign(createManagerForExposureTests(), {
            sunDirectionCraftWorld: {
                x: 1,
                y: 0,
                z: 0,
                length: () => 1,
            },
        });

        const fullyEclipsed = manager.resolveComposerSolarEclipseState({
            craftWorld: { x: 0, y: 0, z: 0 },
            moonWorld: { x: 100, y: 0, z: 0 },
            moonRadius: 4,
            earthWorld: { x: 0, y: 100, z: 0 },
            earthRadius: 10,
        });
        const partial = manager.resolveComposerSolarEclipseState({
            craftWorld: { x: 0, y: 0, z: 0 },
            moonWorld: { x: 10000, y: 5, z: 0 },
            moonRadius: 4,
            earthWorld: { x: 0, y: 100, z: 0 },
            earthRadius: 10,
        });
        const clear = manager.resolveComposerSolarEclipseState({
            craftWorld: { x: 0, y: 0, z: 0 },
            moonWorld: { x: 100, y: 30, z: 0 },
            moonRadius: 4,
            earthWorld: { x: 0, y: 100, z: 0 },
            earthRadius: 10,
        });

        expect(fullyEclipsed.active).toBe(true);
        expect(fullyEclipsed.occluder).toBe("moon");
        expect(fullyEclipsed.fullyObscured).toBe(true);
        expect(partial.coverage).toBeGreaterThan(0);
        expect(partial.active).toBe(false);
        expect(clear.active).toBe(false);
    });

    it("updates animated corona appearance when applying eclipse Sun state", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEclipseCoronaIntensity: 1,
            composerEclipseCoronaMotion: 1,
            composerEclipseCoronaStructure: 1,
            composerSolarEclipseActive: true,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };
        const sunRenderer = {
            getVisualState: vi.fn(() => ({ haloOpacity: 0.36, coronaOpacity: 0, starburstOpacity: 0, flareOpacity: 0 })),
            setVisualState: vi.fn(),
            updateAppearance: vi.fn(),
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, sunRenderer, { eclipseActive: true });
        const appliedState = sunRenderer.setVisualState.mock.calls[0][0];

        expect(appliedState.haloOpacity).toBe(0);
        expect(appliedState.starburstOpacity).toBe(0);
        expect(appliedState.flareOpacity).toBe(0);
        expect(appliedState.coronaFlowOpacity).toBeGreaterThan(0.15);
        expect(sunRenderer.updateAppearance).toHaveBeenCalledTimes(1);

        restore();
    });

    it("applies regular Sun optics when applying non-eclipse Sun state", () => {
        const manager = createManagerForExposureTests();
        const panelState = {
            mode: "composer",
            renderer: { toneMappingExposure: 1 },
            composerSunProfile: "camera",
            composerSunStrength: 1,
            composerSunHaloGain: 1,
            composerSunStarburstGain: 1,
            composerSunFlareGain: 1,
            composerEclipseCoronaIntensity: 1,
            composerEclipseCoronaMotion: 1,
            composerEclipseCoronaStructure: 1,
            composerSolarEclipseActive: false,
            composerEarthshineGain: 1,
            composerStarMagnitudeLimit: 6,
            composerConstellationLinesEnabled: false,
        };
        const sunRenderer = {
            getVisualState: vi.fn(() => ({ haloOpacity: 0.36, coronaOpacity: 0, starburstOpacity: 0, flareOpacity: 0 })),
            setVisualState: vi.fn(),
            updateAppearance: vi.fn(),
        };

        const restore = manager.applyComposerExposureProfile({}, panelState, sunRenderer, { eclipseActive: false });
        const appliedState = sunRenderer.setVisualState.mock.calls[0][0];

        expect(appliedState.starburstOpacity).toBeGreaterThan(0);
        expect(appliedState.flareOpacity).toBeGreaterThan(0);
        expect(appliedState.coronaFlowOpacity).toBe(0);
        expect(sunRenderer.updateAppearance).toHaveBeenCalledTimes(1);

        restore();
    });

    it("schedules one follow-up render frame for animated composer corona", () => {
        let queuedCallback = null;
        const requestRender = vi.fn();
        const requestAnimationFrameMock = vi.fn((callback) => {
            queuedCallback = callback;
            return 42;
        });
        vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            requestRender,
            composerCoronaAnimationRaf: null,
        });

        manager.requestComposerCoronaAnimationFrame();
        manager.requestComposerCoronaAnimationFrame();

        expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
        expect(manager.composerCoronaAnimationRaf).toBe(42);

        queuedCallback();

        expect(manager.composerCoronaAnimationRaf).toBeNull();
        expect(requestRender).toHaveBeenCalledTimes(1);
    });
});

describe("Frame and Shoot reflected-light gain controls", () => {
    function createManagerForLightTests() {
        return Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });
    }

    it("scales Earthshine reflected light during composer renders and restores it", () => {
        const manager = createManagerForLightTests();
        const scene = {
            lightFill: {
                intensity: 0.02,
            },
        };

        const restore = manager.applyComposerEarthshineGain({
            composerEarthshineGain: 2.4,
        }, scene);

        expect(scene.lightFill.intensity).toBeCloseTo(0.048, 8);

        restore();

        expect(scene.lightFill.intensity).toBeCloseTo(0.02, 8);
    });

    it("keeps Earthshine dark when the physical phase light is dark", () => {
        const manager = createManagerForLightTests();
        const scene = {
            lightFill: {
                intensity: 0,
            },
        };

        const restore = manager.applyComposerEarthshineGain({
            composerEarthshineGain: 2.4,
        }, scene);

        expect(scene.lightFill.intensity).toBe(0);

        restore();

        expect(scene.lightFill.intensity).toBe(0);
    });

    it("scales Moonshine reflected light during composer renders and restores it", () => {
        const manager = createManagerForLightTests();
        const scene = {
            lightMoonshine: {
                intensity: 0.0005,
            },
        };

        const restore = manager.applyComposerMoonshineGain({
            composerMoonshineGain: 2.4,
        }, scene);

        expect(scene.lightMoonshine.intensity).toBeCloseTo(0.0012, 8);

        restore();

        expect(scene.lightMoonshine.intensity).toBeCloseTo(0.0005, 8);
    });

    it("keeps Moonshine dark when the physical phase light is dark", () => {
        const manager = createManagerForLightTests();
        const scene = {
            lightMoonshine: {
                intensity: 0,
            },
        };

        const restore = manager.applyComposerMoonshineGain({
            composerMoonshineGain: 2.4,
        }, scene);

        expect(scene.lightMoonshine.intensity).toBe(0);

        restore();

        expect(scene.lightMoonshine.intensity).toBe(0);
    });
});
