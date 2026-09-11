import { describe, expect, it, vi, afterEach } from "vitest";
import * as THREE from "three";

import { MoonRenderer } from "../src/platform/js/rendering/moon-renderer.js";

function stubCanvasDocument() {
    const originalDocument = globalThis.document;
    const context2d = {
        font: "",
        textAlign: "",
        textBaseline: "",
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        measureText: vi.fn((text) => ({ width: String(text).length * 12 })),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
    };
    vi.stubGlobal("document", {
        ...originalDocument,
        createElement: vi.fn(() => ({
            width: 0,
            height: 0,
            getContext: vi.fn(() => context2d),
        })),
    });
    return context2d;
}

describe("MoonRenderer", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("does not rebuild normals for material-only settings", () => {
        const moon = new MoonRenderer(1);
        moon.create(false, false, { deferGeneratedNormalMap: true });
        const rebuild = vi.spyOn(moon, "_refreshGeneratedNormalMap");
        moon.setRenderSettings({ ...moon.renderSettings, roughness: 0.8 });
        expect(rebuild).not.toHaveBeenCalled();
        moon.setRenderSettings({ ...moon.renderSettings, physicalNormalSlopeBoost: moon.renderSettings.physicalNormalSlopeBoost + 0.1 });
        expect(rebuild).toHaveBeenCalledOnce();
        moon.dispose();
    });

    it("reuses shader programs across uniform-only tuning and distinguishes physical displacement", () => {
        const moon = new MoonRenderer(1);
        moon.create(false, false, { deferGeneratedNormalMap: true });
        const material = moon.mesh.material;
        const key = material.customProgramCacheKey();
        material.userData.moonPhysicalExposure = 0.8;
        material.userData.moonLsBlend = 0.4;
        expect(material.customProgramCacheKey()).toBe(key);
        material.displacementMap = new THREE.Texture();
        material.userData.moonPhysicalModelBlend = 1;
        expect(material.customProgramCacheKey()).not.toBe(key);
        material.displacementMap.dispose();
        material.displacementMap = null;
        moon.dispose();
    });

    it("keeps generated normal-map flipY aligned with the source displacement texture", () => {
        const originalDocument = globalThis.document;
        const pixelData = new Uint8ClampedArray([
            0, 0, 0, 255,
            255, 255, 255, 255,
            255, 255, 255, 255,
            0, 0, 0, 255,
        ]);
        const context2d = {
            drawImage: vi.fn(),
            getImageData: vi.fn(() => ({ data: pixelData })),
        };
        vi.stubGlobal("document", {
            ...originalDocument,
            createElement: vi.fn(() => ({
                width: 0,
                height: 0,
                getContext: vi.fn(() => context2d),
            })),
        });

        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };
        displacementTexture.flipY = true;
        displacementTexture.wrapS = THREE.RepeatWrapping;
        displacementTexture.wrapT = THREE.MirroredRepeatWrapping;

        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create();

        expect(moonRenderer.generatedNormalMap).toBeTruthy();
        expect(moonRenderer.generatedNormalMap.flipY).toBe(true);
        expect(moonRenderer.generatedNormalMap.wrapS).toBe(THREE.RepeatWrapping);
        expect(moonRenderer.generatedNormalMap.wrapT).toBe(THREE.MirroredRepeatWrapping);

        moonRenderer.dispose();
    });

    it("does not build the generated normal map during setRenderSettings before create() runs", () => {
        // Regression for the addMoon() call sequence:
        //   setTextures(...) -> setRenderSettings(...) -> create(..., defer=true)
        // The defer flag on create() is useless if setRenderSettings already
        // triggered the build. Before this fix, _refreshGeneratedNormalMap fired
        // inside setRenderSettings even when this.mesh was null, paying the
        // full ~300-500ms canvas+Float32 cost on the first-frame path.
        const originalDocument = globalThis.document;
        const createElement = vi.fn(() => ({
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
                drawImage: vi.fn(),
                getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16) })),
            })),
        }));
        vi.stubGlobal("document", { ...originalDocument, createElement });

        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        // Mirror the real addMoon() sequence.
        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.setRenderSettings({ normalMapMaxWidth: 64 });

        // setRenderSettings must not have built the normal map (no mesh yet).
        expect(createElement).not.toHaveBeenCalled();
        expect(moonRenderer.generatedNormalMap).toBeNull();

        moonRenderer.create(false, false, { deferGeneratedNormalMap: true });

        // create(defer=true) must not build either.
        expect(createElement).not.toHaveBeenCalled();
        expect(moonRenderer.generatedNormalMap).toBeNull();
        expect(moonRenderer.mesh.material.bumpMap).toBe(displacementTexture);
        expect(moonRenderer.mesh.material.normalMap).toBeNull();

        // Now upgrade explicitly (simulates the requestIdleCallback in addMoon).
        moonRenderer.refreshGeneratedNormalMap();
        expect(createElement).not.toHaveBeenCalled();
        expect(moonRenderer.generatedNormalMap).toBeTruthy();
        expect(moonRenderer.mesh.material.normalMap).toBe(moonRenderer.generatedNormalMap);
        expect(moonRenderer.mesh.material.bumpMap).toBeNull();

        moonRenderer.dispose();
    });

    it("skips the synchronous generated normal-map build when deferGeneratedNormalMap is set", () => {
        const originalDocument = globalThis.document;
        // Spy on createElement to prove no canvas is constructed (which is the
        // expensive step inside buildMoonNormalMapFromHeightTexture).
        const createElement = vi.fn(() => ({
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
                drawImage: vi.fn(),
                getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16) })),
            })),
        }));
        vi.stubGlobal("document", { ...originalDocument, createElement });

        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };
        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create(false, false, { deferGeneratedNormalMap: true });

        expect(createElement).not.toHaveBeenCalled();
        expect(moonRenderer.generatedNormalMap).toBeNull();
        // The mesh material should fall back to bumpMap-based shading until
        // refreshGeneratedNormalMap is called.
        expect(moonRenderer.mesh.material.bumpMap).toBe(displacementTexture);
        expect(moonRenderer.mesh.material.normalMap).toBeNull();

        // Now upgrade and confirm the normal map is actually built.
        moonRenderer.refreshGeneratedNormalMap();
        expect(createElement).not.toHaveBeenCalled();
        expect(moonRenderer.generatedNormalMap).toBeTruthy();
        expect(moonRenderer.mesh.material.normalMap).toBe(moonRenderer.generatedNormalMap);
        expect(moonRenderer.mesh.material.bumpMap).toBeNull();

        moonRenderer.dispose();
    });

    it("initializes the shared Physical material with real terrain units", () => {
        const moon = new MoonRenderer(1);
        const dem = new THREE.DataTexture(new Float32Array([0.3,0.4,0.5,0.6]), 2,2,THREE.RedFormat,THREE.FloatType);
        moon.setTextures(new THREE.Texture(), dem);
        moon.create();
        expect(moon.renderPipeline.lightingModel).toBe("physical-dem");
        expect(moon.mesh.material.userData.moonPhysicalHeightScale).toBeCloseTo(0.018860078277886497,12);
        expect(moon.mesh.material.userData.moonPhysicalExposure).toBe(0.4);
        expect(moon.mesh.material.userData).not.toHaveProperty("moonShadowCrushBlend");
        moon.dispose();
    });

    it("creates a toggleable selenographic latitude and longitude grid", () => {
        stubCanvasDocument();
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create(false, false, {
            deferGeneratedNormalMap: true,
            latLonGridVisible: true,
        });

        expect(moonRenderer.latLonGrid).toBeTruthy();
        expect(moonRenderer.latLonGrid.name).toBe("moon-lat-lon-grid");
        expect(moonRenderer.latLonGrid.visible).toBe(true);
        expect(moonRenderer.latLonGrid.children).toHaveLength(3);
        expect(moonRenderer.latLonLabels).toBeTruthy();
        expect(moonRenderer.latLonLabels.visible).toBe(true);
        expect(moonRenderer.latLonLabels.children.length).toBeGreaterThan(0);
        expect(moonRenderer.container.children).toContain(moonRenderer.latLonGrid);
        expect(moonRenderer.container.children).toContain(moonRenderer.latLonLabels);

        moonRenderer.setLatLonGridVisible(false);
        expect(moonRenderer.latLonGrid.visible).toBe(false);
        expect(moonRenderer.latLonLabels.visible).toBe(false);

        moonRenderer.setLatLonGridVisible(true);
        moonRenderer.setLatLonLabelsVisible(false);
        expect(moonRenderer.latLonGrid.visible).toBe(true);
        expect(moonRenderer.latLonLabels.visible).toBe(false);

        moonRenderer.dispose();
    });

    it("adapts the selenographic grid granularity from camera zoom", () => {
        stubCanvasDocument();
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create(false, false, {
            deferGeneratedNormalMap: true,
            latLonGridVisible: true,
        });

        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        camera.position.set(0, 0, 40);
        camera.updateMatrixWorld(true);
        moonRenderer.updateLatLonGridForCamera({
            camera,
            rendererDomElement: { clientHeight: 400 },
        });
        expect(moonRenderer.latLonGridStepDegrees).toBe(30);

        camera.position.set(0, 0, 1.2);
        camera.updateMatrixWorld(true);
        moonRenderer.updateLatLonGridForCamera({
            camera,
            rendererDomElement: { clientHeight: 800 },
        });
        expect(moonRenderer.latLonGridStepDegrees).toBe(5);

        moonRenderer.dispose();
    });

    it("skips selenographic grid camera updates while the overlay is inactive", () => {
        stubCanvasDocument();
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create(false, false, {
            deferGeneratedNormalMap: true,
        });

        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        camera.position.set(0, 0, 1.2);
        camera.updateMatrixWorld(true);
        const updatedWhileHidden = moonRenderer.updateLatLonGridForCamera({
            camera,
            rendererDomElement: { clientHeight: 800 },
        });

        expect(updatedWhileHidden).toBe(false);
        expect(moonRenderer.latLonGridStepDegrees).toBe(10);
        expect(moonRenderer.latLonLabels).toBeNull();

        moonRenderer.setLatLonGridVisible(true);
        const updatedWhileVisible = moonRenderer.updateLatLonGridForCamera({
            camera,
            rendererDomElement: { clientHeight: 800 },
        });

        expect(updatedWhileVisible).toBe(true);
        expect(moonRenderer.latLonGridStepDegrees).toBe(5);

        moonRenderer.dispose();
    });

    it("hides grid labels when the Moon is too small on screen", () => {
        stubCanvasDocument();
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create(false, false, {
            deferGeneratedNormalMap: true,
            latLonGridVisible: true,
            latLonLabelsVisible: true,
        });

        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);

        moonRenderer.updateLatLonGridForCamera({
            camera,
            rendererDomElement: { clientHeight: 800 },
        });

        expect(moonRenderer.latLonGrid.visible).toBe(true);
        expect(moonRenderer.latLonLabels.visible).toBe(false);

        moonRenderer.dispose();
    });

    it("moves grid labels onto visible portions of their own latitude and longitude curves", () => {
        stubCanvasDocument();
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create(false, false, {
            deferGeneratedNormalMap: true,
            latLonGridVisible: true,
        });

        const findLabel = (text) => moonRenderer.latLonLabels.children.find(
            (label) => label.userData.labelText === text,
        );
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);

        camera.position.set(0, 5, 0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        moonRenderer.updateLatLonGridForCamera({
            camera,
            rendererDomElement: { clientHeight: 800 },
        });
        let latitudeLabel = findLabel("30°N");
        let longitudeLabel = findLabel("60°E");
        expect(latitudeLabel.position.x).toBeCloseTo(0, 4);
        expect(latitudeLabel.position.y).toBeGreaterThan(0.7);
        expect(longitudeLabel.visible).toBe(true);

        camera.position.set(5, 0, 0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        moonRenderer.updateLatLonGridForCamera({
            camera,
            rendererDomElement: { clientHeight: 800 },
        });
        latitudeLabel = findLabel("30°N");
        expect(latitudeLabel.position.x).toBeGreaterThan(0.7);
        expect(Math.abs(latitudeLabel.position.y)).toBeLessThan(0.01);

        moonRenderer.dispose();
    });

    it("keeps hover labels close and adds coordinate decimals only when zoomed in", () => {
        stubCanvasDocument();
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create(false, false, {
            deferGeneratedNormalMap: true,
            latLonHoverEnabled: true,
        });

        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        camera.position.set(0, 0, 6);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        moonRenderer.updateLatLonHoverFromPointer({
            camera,
            rendererDomElement: {
                clientHeight: 800,
                clientWidth: 800,
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }),
            },
            clientX: 400,
            clientY: 400,
        });
        expect(moonRenderer.latLonHoverLabel.visible).toBe(true);
        expect(moonRenderer.latLonHoverLabel.userData.labelText).not.toMatch(/\d+\.\d/);
        const farSurfacePoint = moonRenderer.latLonHoverPoint.clone()
            .normalize()
            .multiplyScalar(moonRenderer.radius * 1.018);
        expect(moonRenderer.latLonHoverLabel.position.distanceTo(farSurfacePoint)).toBeLessThan(0.08);

        camera.position.set(0, 0, 1.2);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        moonRenderer.updateLatLonHoverFromPointer({
            camera,
            rendererDomElement: {
                clientHeight: 800,
                clientWidth: 800,
                getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }),
            },
            clientX: 430,
            clientY: 370,
        });
        expect(moonRenderer.latLonHoverLabel.userData.labelText).toMatch(/\d+\.\d/);

        moonRenderer.dispose();
    });

    it("refreshes Moon shader uniforms from mesh onBeforeRender after userData changes", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };
        const normalTexture = new THREE.Texture();

        moonRenderer.setTextures(colorTexture, displacementTexture, normalTexture);
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        material.userData.moonPhotometricShader = {
            uniforms: {
                uMoonShadowLift: { value: 0 },
                uMoonTerminatorShadowFloor: { value: 0 },
                uMoonHeightMap: { value: null },
                uMoonHeightTexelSize: { value: new THREE.Vector2() },
                uMoonTerrainShadowStrength: { value: 0 },
                uMoonTerrainShadowTexelStride: { value: 0 },
                uMoonTerrainShadowSlopeBias: { value: 0 },
            },
        };
        material.userData.moonShadowLift = 0.37;
        material.userData.moonTerminatorShadowFloor = 0.22;
        material.userData.moonTerrainShadowStrength = 0.77;
        material.userData.moonTerrainShadowTexelStride = 4.5;
        material.userData.moonTerrainShadowSlopeBias = 0.031;

        moonRenderer.mesh.onBeforeRender();

        expect(material.userData.moonPhotometricShader.uniforms.uMoonShadowLift.value).toBe(0.37);
        expect(material.userData.moonPhotometricShader.uniforms.uMoonTerminatorShadowFloor.value).toBe(0.22);
        expect(material.userData.moonPhotometricShader.uniforms.uMoonHeightMap.value).toBe(displacementTexture);
        expect(material.userData.moonPhotometricShader.uniforms.uMoonTerrainShadowStrength.value).toBe(0.77);
        expect(material.userData.moonPhotometricShader.uniforms.uMoonTerrainShadowTexelStride.value).toBe(4.5);
        expect(material.userData.moonPhotometricShader.uniforms.uMoonTerrainShadowSlopeBias.value).toBe(0.031);

        moonRenderer.dispose();
    });

    it("refreshes every renderer-specific Moon shader instance", () => {
        const moonRenderer = new MoonRenderer(1);
        moonRenderer.setTextures(new THREE.Texture(), null);
        moonRenderer.create();
        const material = moonRenderer.mesh.material;
        const makeShader = () => ({
            uniforms: {},
            vertexShader: [
                "#include <common>",
                "#include <beginnormal_vertex>",
                "#include <displacementmap_vertex>",
            ].join("\n"),
            fragmentShader: [
                "#include <common>",
                "#include <lights_fragment_begin>",
                "#include <lights_fragment_end>",
                "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;",
            ].join("\n"),
        });
        const mainShader = makeShader();
        const auxiliaryShader = makeShader();
        const mainRenderer = { name: "main-renderer" };
        const auxiliaryRenderer = { name: "auxiliary-renderer" };

        material.onBeforeCompile(mainShader, mainRenderer);
        material.onBeforeCompile(auxiliaryShader, auxiliaryRenderer);
        material.userData.moonGeometricMask = 1;
        material.userData.refreshMoonShaderUniforms();

        for (const shader of [mainShader, auxiliaryShader]) {
            expect(shader.uniforms.uMoonGeometricMask.value).toBe(1);
        }
        expect(moonRenderer.unregisterShaderRenderer(auxiliaryRenderer)).toBe(true);
        expect(material.userData.moonPhotometricShaders.size).toBe(1);
        expect(moonRenderer.unregisterShaderRenderer(auxiliaryRenderer)).toBe(false);

        moonRenderer.dispose();
    });

    it("retains the Physical horizon, signed shadow rays and isolated Earthshine in one shader", () => {
        const moon = new MoonRenderer(1);
        const dem = new THREE.DataTexture(new Float32Array([0.3,0.4,0.5,0.6]),2,2,THREE.RedFormat,THREE.FloatType);
        moon.setTextures(new THREE.Texture(), dem);
        moon.create();
        const shader={uniforms:{},vertexShader:"#include <common>\n#include <beginnormal_vertex>\n#include <displacementmap_vertex>",fragmentShader:"#include <common>\n#include <lights_fragment_begin>\n#include <lights_fragment_end>\nvec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;"};
        moon.mesh.material.onBeforeCompile(shader);
        expect(shader.fragmentShader).toContain("#define MOON_PHYSICAL_DISPLACEMENT");
        expect(shader.vertexShader).toContain("vMoonHeightUv = vDisplacementMapUv");
        expect(shader.fragmentShader).toContain("moonRaisedHorizonAngle - moonSunFromRadialAngle");
        expect(shader.fragmentShader).toContain("moonSunAltitude = atan(");
        expect(shader.fragmentShader).toContain("moonSampleRadialRise = moonSampleRadius * cos( moonSampleAngle )");
        expect(shader.fragmentShader).toContain("moonEarthshineDirectKept = max( reflectedLight.directDiffuse - moonSunDirectContribution");
        expect(shader.fragmentShader).toContain("moonSunShadowFactor");
        for(const removed of ["moonPhysicalModelActive", "moonCurrentRawNdotLForVis", "moonFinalShadowCrush", "moonTerrainCavity"]) expect(shader.fragmentShader).not.toContain(removed);
        moon.dispose();
    });

    it("can reduce the Moon to a smooth untextured baseline", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        moonRenderer.setRenderPipeline({
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorContrast: false,
            terminatorRelief: false,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: false,
            shadowCrush: false,
            earthshine: false,
            geometricMask: false,
        });
        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        expect(material.map).toBeNull();
        expect(material.normalMap).toBeNull();
        expect(material.bumpMap).toBeNull();
        expect(material.displacementMap).toBeNull();
        expect(material.color.getHex()).toBe(0x8f969e);
        expect(material.userData.moonLsBlend).toBe(0.2);
        expect(material.userData.moonTerrainShadowStrength).toBe(0.0);
        expect(material.userData.moonGeometricMask).toBe(0.0);
        expect(material.userData.moonEarthshineBlend).toBe(0.0);

        moonRenderer.dispose();
    });

    it("keeps diagnostic lighting stages independently switchable", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };

        moonRenderer.setRenderPipeline({
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorContrast: true,
            terminatorRelief: false,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: false,
            shadowCrush: true,
            earthshine: false,
            geometricMask: true,
        });
        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        expect(material.userData.moonLsBlend).toBe(0.2);
        expect(material.userData.moonTerrainShadowStrength).toBe(0.0);
        expect(material.userData.moonGeometricMask).toBe(1.0);

        moonRenderer.setRenderPipeline({
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            photometric: false,
            terminatorContrast: false,
            terminatorRelief: true,
            terrainRelief: false,
            terrainShadows: false,
            indirectOcclusion: false,
            shadowCrush: false,
            earthshine: false,
            geometricMask: false,
        });

        moonRenderer.dispose();
    });

    it("ignores obsolete darkening controls on the Physical core", () => {
        const moon = new MoonRenderer(1);
        moon.setRenderPipeline({ lightingModel: "current", shadowCrush: true, terminatorContrast: true });
        moon.create();
        expect(moon.renderPipeline.lightingModel).toBe("physical-dem");
        expect(moon.renderPipeline).not.toHaveProperty("shadowCrush");
        expect(moon.mesh.material.shadowSide).toBe(THREE.FrontSide);
        moon.dispose();
    });

    it("uses NASA DEM units and denser geometry for the Detailed Physical path", () => {
        const moonRenderer = new MoonRenderer(2);
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 5760, height: 2880 };
        moonRenderer.setRenderPipeline({ lightingModel: "physical-dem" });
        moonRenderer.setRenderSettings({
            physicalGeometryWidthSegments: 1024,
            physicalGeometryHeightSegments: 512,
            physicalDisplacementScale: 0.018860078277886497,
            physicalDisplacementBias: -0.005755726948313572,
            physicalNormalHeightScale: 0.018860078277886497,
            physicalNormalResolutionCompensation: 2,
        });
        moonRenderer.setTextures(new THREE.Texture(), displacementTexture, new THREE.Texture());
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        expect(moonRenderer.mesh.geometry.parameters.widthSegments).toBe(1024);
        expect(moonRenderer.mesh.geometry.parameters.heightSegments).toBe(512);
        expect(material.displacementScale).toBeCloseTo(2 * 0.018860078277886497, 8);
        expect(material.displacementBias).toBeCloseTo(2 * -0.005755726948313572, 8);
        expect(material.normalScale.x).toBeCloseTo(2, 8);
        expect(material.shadowSide).toBe(THREE.FrontSide);
        expect(material.userData.moonPhysicalHeightScale).toBeCloseTo(0.018860078277886497, 8);
        expect(material.userData.moonPhysicalHeightBias).toBeCloseTo(-0.005755726948313572, 8);

        moonRenderer.dispose();
    });

    it("binds Physical's forced maps after a stored smooth preset", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };
        const legacyDisplacementTexture = new THREE.Texture();
        legacyDisplacementTexture.image = { width: 2, height: 2 };
        displacementTexture.userData.legacyTexture = legacyDisplacementTexture;
        const normalTexture = new THREE.Texture();
        moonRenderer.setRenderPipeline({ schemaVersion: 6,
            lightingModel: "current",
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            terrainShadows: false,
        });
        moonRenderer.setTextures(colorTexture, displacementTexture, normalTexture);
        moonRenderer.create();

        moonRenderer.setRenderPipeline({ schemaVersion: 6,
            ...moonRenderer.renderPipeline,
            lightingModel: "physical-dem",
        });

        expect(moonRenderer.mesh.material.map).toBe(colorTexture);
        expect(moonRenderer.mesh.material.normalMap).toBe(normalTexture);
        expect(moonRenderer.mesh.material.displacementMap).toBe(displacementTexture);
        expect(moonRenderer.mesh.material.userData.moonTerrainShadowStrength).toBe(1);

        moonRenderer.setRenderPipeline({ schemaVersion: 6,
            ...moonRenderer.renderPipeline,
            lightingModel: "current",
            generatedNormalMap: true,
            displacement: true,
        });
        expect(moonRenderer.mesh.material.displacementMap).toBe(displacementTexture);

        moonRenderer.dispose();
    });

    it("defers a High model-switch normal rebuild and never reuses the legacy map", () => {
        let idleCallback = null;
        vi.stubGlobal("requestIdleCallback", vi.fn((callback) => {
            idleCallback = callback;
            return 17;
        }));
        vi.stubGlobal("cancelIdleCallback", vi.fn());
        const moonRenderer = new MoonRenderer(1);
        const requestRender = vi.fn();
        moonRenderer.setRenderInvalidationCallback(requestRender);
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = {
            data: new Float32Array([0.3, 0.4, 0.5, 0.6]),
            width: 2,
            height: 2,
        };
        moonRenderer.setRenderSettings({
            physicalNormalHeightScale: 0.018860078277886497,
        });
        moonRenderer.setTextures(new THREE.Texture(), displacementTexture);
        moonRenderer.create(false, false, { deferGeneratedNormalMap: true });
        const legacyNormalMap = new THREE.Texture();
        const disposeLegacy = vi.spyOn(legacyNormalMap, "dispose");
        moonRenderer.generatedNormalMap = legacyNormalMap;
        moonRenderer.generatedNormalMapMode = "legacy-artistic";

        moonRenderer.setRenderPipeline({ lightingModel: "physical-dem" });

        expect(globalThis.requestIdleCallback).toHaveBeenCalledOnce();
        expect(disposeLegacy).toHaveBeenCalledOnce();
        expect(moonRenderer.generatedNormalMap).toBeNull();
        expect(moonRenderer.mesh.material.normalMap).toBeNull();
        expect(moonRenderer.mesh.material.bumpMap).toBe(displacementTexture);

        idleCallback();

        expect(moonRenderer.generatedNormalMapMode).toBe("physical-spherical");
        expect(moonRenderer.mesh.material.normalMap).toBe(moonRenderer.generatedNormalMap);
        expect(requestRender).toHaveBeenCalledOnce();

        moonRenderer.dispose();
        vi.unstubAllGlobals();
    });

    it("rebuilds Moon geometry when the resource budget changes", () => {
        const moonRenderer = new MoonRenderer(1);
        moonRenderer.setRenderSettings({
            geometryWidthSegments: 128,
            geometryHeightSegments: 64,
        });
        moonRenderer.setTextures(new THREE.Texture(), null);
        moonRenderer.create();

        expect(moonRenderer.mesh.geometry.parameters.widthSegments).toBe(128);
        expect(moonRenderer.mesh.geometry.parameters.heightSegments).toBe(64);
        const lowGeometry = moonRenderer.mesh.geometry;
        const disposeLowGeometry = vi.spyOn(lowGeometry, "dispose");

        moonRenderer.setRenderSettings({
            geometryWidthSegments: 768,
            geometryHeightSegments: 384,
        });

        expect(disposeLowGeometry).toHaveBeenCalledOnce();
        expect(moonRenderer.mesh.geometry).not.toBe(lowGeometry);
        expect(moonRenderer.mesh.geometry.parameters.widthSegments).toBe(768);
        expect(moonRenderer.mesh.geometry.parameters.heightSegments).toBe(384);

        moonRenderer.dispose();
    });

    it("releases DEM-derived material maps when returning to the preview", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };
        const generatedNormal = new THREE.Texture();

        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create(false, false, { deferGeneratedNormalMap: true });
        moonRenderer.generatedNormalMap = generatedNormal;
        moonRenderer.refreshGeneratedNormalMap = vi.fn();

        moonRenderer.updateTextures(new THREE.Texture(), null, null, {
            disposePrevious: true,
            deferGeneratedNormalMap: false,
            renderSettings: {
                geometryWidthSegments: 128,
                geometryHeightSegments: 64,
                terrainShadowSamples: 0,
            },
        });

        expect(moonRenderer.generatedNormalMap).toBeNull();
        expect(moonRenderer.mesh.material.normalMap).toBeNull();
        expect(moonRenderer.mesh.material.bumpMap).toBeNull();
        expect(moonRenderer.mesh.material.displacementMap).toBeNull();
        expect(moonRenderer.mesh.geometry.parameters.widthSegments).toBe(128);

        moonRenderer.dispose();
    });

    it("drops the previous tier normal while a deferred replacement is pending", () => {
        const moonRenderer = new MoonRenderer(1);
        const highDem = new THREE.Texture();
        highDem.image = { width: 4, height: 2 };
        const highNormal = new THREE.Texture();
        highDem.userData.physicalNormalTexture = highNormal;
        moonRenderer.setRenderPipeline({ lightingModel: "physical-dem" });
        moonRenderer.setRenderSettings({
            physicalNormalHeightScale: 0.018860078277886497,
        });
        moonRenderer.setTextures(new THREE.Texture(), highDem);
        moonRenderer.create(false, false, { deferGeneratedNormalMap: true });
        moonRenderer.refreshGeneratedNormalMap({ disposePrevious: true });
        expect(moonRenderer.mesh.material.normalMap).toBe(highNormal);

        const mediumDem = new THREE.Texture();
        mediumDem.image = { width: 2, height: 2 };
        moonRenderer.updateTextures(new THREE.Texture(), mediumDem, null, {
            disposePrevious: true,
            deferGeneratedNormalMap: true,
            renderSettings: {
                physicalNormalHeightScale: 0,
            },
        });

        expect(moonRenderer.generatedNormalMap).toBeNull();
        expect(moonRenderer.generatedNormalMapMode).toBeNull();
        expect(moonRenderer.mesh.material.normalMap).toBeNull();
        expect(moonRenderer.mesh.material.bumpMap).toBe(mediumDem);

        moonRenderer.dispose();
    });

    it("applies the normal-map stage without forcing texture or displacement stages", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: new Float32Array([0.3, 0.4, 0.5, 0.6]) };
        const normalTexture = new THREE.Texture();

        moonRenderer.setRenderPipeline({
            colorTexture: false,
            generatedNormalMap: true,
            displacement: false,
            photometric: false,
            terminatorRelief: false,
            terrainShadows: false,
            earthshine: false,
        });
        moonRenderer.setTextures(colorTexture, displacementTexture, normalTexture);
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        expect(material.map).toBeNull();
        expect(material.normalMap).toBe(normalTexture);
        expect(material.bumpMap).toBeNull();
        expect(material.displacementMap).toBeNull();
        expect(material.userData.moonLsBlend).toBe(0.2);
        expect(material.userData.moonTerrainShadowStrength).toBe(0.0);

        moonRenderer.dispose();
    });
});
