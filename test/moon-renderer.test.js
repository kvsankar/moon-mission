import { describe, expect, it, vi, afterEach } from "vitest";
import * as THREE from "three";

import {
    getPhysicalTerrainShadowSampleDistance,
    MoonRenderer,
    PHYSICAL_TERRAIN_SHADOW_MAX_SAMPLES,
} from "../src/platform/js/rendering/moon-renderer.js";

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

    it("keeps physical horizon samples dense nearby and widens toward distant rims", () => {
        const distances = Array.from(
            { length: PHYSICAL_TERRAIN_SHADOW_MAX_SAMPLES },
            (_, index) => getPhysicalTerrainShadowSampleDistance(index + 1),
        );

        expect(distances.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(distances[8]).toBe(10);
        expect(distances[15]).toBe(24);
        expect(distances[31]).toBe(56);
        expect(distances.every((distance, index) => (
            index === 0 || distance > distances[index - 1]
        ))).toBe(true);
        expect(distances.every((distance, index) => (
            index === 0 || distance - distances[index - 1] <= 2
        ))).toBe(true);
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
        displacementTexture.image = { width: 2, height: 2 };
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
        displacementTexture.image = { width: 2, height: 2 };

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
        expect(createElement).toHaveBeenCalled();
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
        displacementTexture.image = { width: 2, height: 2 };
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
        expect(createElement).toHaveBeenCalled();
        expect(moonRenderer.generatedNormalMap).toBeTruthy();
        expect(moonRenderer.mesh.material.normalMap).toBe(moonRenderer.generatedNormalMap);
        expect(moonRenderer.mesh.material.bumpMap).toBeNull();

        moonRenderer.dispose();
    });

    it("initializes lunar photometric presentation defaults on the Moon material", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2 };
        const normalTexture = new THREE.Texture();

        moonRenderer.setTextures(colorTexture, displacementTexture, normalTexture);
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        expect(material.userData.moonHighlightBoost).toBeCloseTo(1.20, 4);
        expect(material.userData.moonTerminatorContrastBlend).toBe(0.0);
        expect(material.userData.moonTerminatorShadowFloor).toBeCloseTo(0.0, 4);
        expect(material.userData.moonTerminatorIndirectOcclusion).toBeCloseTo(1.0, 4);
        expect(material.userData.moonTerrainShadowStrength).toBeCloseTo(1.2, 4);
        expect(material.userData.moonTerrainReliefStrength).toBeCloseTo(2.2, 4);
        expect(material.userData.moonShadowCrushBlend).toBe(1.0);
        expect(material.userData.moonGeometricMask).toBe(0.0);
        expect(material.userData.moonTerrainShadowTexelStride).toBeCloseTo(7.0, 4);
        expect(material.userData.moonTerrainShadowSlopeBias).toBeCloseTo(0.0014, 4);
        expect(material.userData.moonTerrainShadowSamples).toBe(12);
        expect(material.userData.moonPhysicalModelBlend).toBe(0.0);
        expect(material.userData.moonHeightTexelSize.x).toBeCloseTo(0.5, 4);
        expect(material.userData.moonHeightTexelSize.y).toBeCloseTo(0.5, 4);

        moonRenderer.dispose();
    });

    it("creates a toggleable selenographic latitude and longitude grid", () => {
        stubCanvasDocument();
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2 };

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
        displacementTexture.image = { width: 2, height: 2 };

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
        displacementTexture.image = { width: 2, height: 2 };

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
        displacementTexture.image = { width: 2, height: 2 };

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
        displacementTexture.image = { width: 2, height: 2 };

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
        displacementTexture.image = { width: 2, height: 2 };

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
        displacementTexture.image = { width: 2, height: 2 };
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

    it("injects Moon artificial ambient outside the directional-light guard", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2 };
        const normalTexture = new THREE.Texture();

        moonRenderer.setTextures(colorTexture, displacementTexture, normalTexture);
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        const shader = {
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
        };

        material.onBeforeCompile(shader);

        expect(material.customProgramCacheKey()).toContain("moon-photometric-v37-physical-spherical-horizon");
        expect(shader.fragmentShader).toContain("float moonSunDiskVisibleFraction(float rawNdotL)");
        expect(shader.fragmentShader)
            .toContain("float moonSmoothRawNdotLForVis = dot( normalize( nonPerturbedNormal ), moonLightDir );");
        // Sun reconstruction must include the shadow factor — without it,
        // shadowed pixels (eclipses, occultations) get over-subtracted and
        // directDiffuse can go negative.
        expect(shader.fragmentShader).toContain("float moonSunShadowFactor = 1.0;");
        expect(shader.fragmentShader)
            .toContain("moonNdotL * directionalLights[0].color * moonSunShadowFactor");
        expect(shader.fragmentShader)
            .toContain("vec3 moonSunDiffuseUnit = directionalLights[0].color * moonSunShadowFactorForDiffuse");
        expect(shader.fragmentShader).toContain(`if ( moonPhysicalModelActive ) {
        moonSunShadowFactorForDiffuse = mix(
            1.0,
            moonSunShadowFactor,
            clamp( uMoonTerrainShadowStrength, 0.0, 1.0 )
        );
    }`);
        // Earthshine isolation: held aside and restored AFTER all Sun-side
        // terminator multipliers + the dark-side crush.
        expect(shader.fragmentShader)
            .toContain("moonEarthshineDirectKept = max( reflectedLight.directDiffuse - moonSunDirectContribution, vec3(0.0) );");
        expect(shader.fragmentShader)
            .toContain("reflectedLight.directDiffuse = moonSunDirectContribution * moonSunVisibility;");
        expect(shader.fragmentShader)
            .toContain("outgoingLight += moonEarthshineDirectKept * moonFinalTerrainTone * clamp( uMoonEarthshineBlend, 0.0, 1.0 );");
        expect(shader.fragmentShader).toContain("uniform float uMoonEarthshineBlend;");
        expect(shader.uniforms.uMoonEarthshineBlend.value).toBe(1.0);
        expect(shader.fragmentShader).toContain("uniform float uMoonTerrainReliefStrength;");
        expect(shader.fragmentShader).toContain("uniform float uMoonTerminatorContrastBlend;");
        expect(shader.fragmentShader).toContain("uniform float uMoonShadowCrushBlend;");
        expect(shader.fragmentShader).toContain("uniform float uMoonGeometricMask;");
        expect(shader.fragmentShader).toContain("uniform float uMoonPhysicalModelBlend;");
        expect(shader.fragmentShader).toContain("uniform float uMoonPhysicalToneGamma;");
        expect(shader.fragmentShader).toContain("float moonTerrainShadowBandCurrent");
        expect(shader.fragmentShader).toContain("bool moonPhysicalModelActive = uMoonPhysicalModelBlend > 0.5;");
        expect(shader.fragmentShader).toContain("if ( moonPhysicalModelActive ) {");
        expect(shader.fragmentShader).toContain("float moonPhysicalToneWeight = pow(");
        expect(shader.fragmentShader).toContain(`if ( moonPhysicalModelActive ) {
        // USGS lunar-Lambert: (1-L)*mu0 + 2*L*mu0/(mu0+mu).
        // Evaluate the reflectance directly so the single-scattering term can
        // preserve real low-incidence terrain without a divergent scale ratio.
        float moonPhysicalLsResponse = 2.0 * moonNdotL
            / max( moonNdotL + moonNdotV, 1e-4 );
        float moonPhysicalDiffuseResponse = mix(
            moonNdotL,
            moonPhysicalLsResponse,
            clamp( uMoonLsBlend, 0.0, 1.0 )
        );
        reflectedLight.directDiffuse = moonSunDiffuseUnit
            * moonPhysicalDiffuseResponse
            * moonSunVisibility;
    } else {
        // Preserve Current's established, deliberately bounded response.
        float moonLsScale = 1.0;
        if ( moonNdotL > 1e-4 ) {
            float moonLs = moonNdotL / max( moonNdotL + moonNdotV, 1e-4 );
            moonLsScale = moonLs / moonNdotL;
        } else {
            moonLsScale = 0.0;
        }
        moonLsScale = clamp( moonLsScale, min(uMoonLsClampMin, uMoonLsClampMax), max(uMoonLsClampMin, uMoonLsClampMax) );
        reflectedLight.directDiffuse *= mix( 1.0, moonLsScale, uMoonLsBlend );
    }`);
        expect(shader.fragmentShader).toContain("clamp( 1.0 - moonSmoothNdotL, 0.0, 1.0 )");
        expect(shader.fragmentShader).toContain("float moonShadowRiseStart = 0.0012;");
        expect(shader.fragmentShader).toContain("float moonShadowRiseFull = 0.0065;");
        expect(shader.fragmentShader).toContain(
            "if ( !moonPhysicalModelActive && uMoonTerrainShadowStrength > 0.0",
        );
        expect(shader.fragmentShader).toContain("uMoonPhysicalHeightScale > 0.0");
        expect(shader.fragmentShader).toContain(
            "float moonPhysicalBaseHeight = texture2D( uMoonHeightMap, moonHeightUv ).r",
        );
        expect(shader.fragmentShader).toContain(
            "float moonSampleRadialRise = moonSampleRadius * moonSampleAngleCos",
        );
        expect(shader.fragmentShader).toContain(
            "float moonSampleLongitudeOffset = atan(",
        );
        expect(shader.fragmentShader).toContain(
            "fract( moonHeightUv.x + moonSampleLongitudeOffset / 6.283185307179586 + 1.0 )",
        );
        expect(shader.fragmentShader).toContain(
            "for ( int moonSampleIndex = 1; moonSampleIndex <= 32; moonSampleIndex += 1 )",
        );
        expect(shader.fragmentShader).toContain(
            "float moonFarSampleIndex = max(",
        );
        expect(shader.fragmentShader).toContain(
            "+ moonFarSampleIndex * 2.0",
        );
        expect(shader.fragmentShader).toContain(
            "moonSampleRadius * moonSampleAngleCos",
        );
        expect(shader.fragmentShader).toContain(
            "moonSampleRadius * moonSampleAngleSin",
        );
        expect(shader.fragmentShader).toContain(
            "float moonTerrainShadowBandCurrent = moonTerrainReliefBand\n        * pow( 1.0 - moonSmoothNdotL, 1.4 );",
        );
        expect(shader.fragmentShader).not.toContain("moonTerrainShadowBand = pow(");
        expect(shader.vertexShader).toContain("varying vec3 vMoonGeometricNormalView;");
        expect(shader.fragmentShader)
            .toContain("step( 0.0001, dot( normalize( vMoonGeometricNormalView ), moonLightDir ) )");
        // Old approaches must not leak back in.
        expect(shader.fragmentShader).not.toContain("reflectedLight.directDiffuse *= moonSunVisibility");
        expect(shader.fragmentShader)
            .not.toContain("reflectedLight.directDiffuse += moonSunDirectContribution * (moonSunVisibility - 1.0);");
        expect(shader.uniforms.uMoonHeightMap.value).toBe(displacementTexture);
        expect(shader.fragmentShader).toContain("float moonLocalReliefDelta = moonNdotL - moonSmoothNdotL");
        expect(shader.fragmentShader).toContain("float moonTerrainReliefBand = 1.0 - smoothstep");
        expect(shader.fragmentShader).toContain("float moonTerrainCavity = max");
        expect(shader.fragmentShader).toContain("float moonFinalTerrainTone = clamp");
        expect(shader.fragmentShader).toContain("float moonTerrainHorizonLift = 0.0");
        expect(shader.vertexShader).toContain("varying vec3 vMoonDisplacedFromCenterView;");
        expect(shader.vertexShader).toContain("vMoonDisplacedFromCenterView = mat3( modelViewMatrix ) * transformed;");
        expect(shader.fragmentShader).toContain("float moonBaseToDisplacedRatio = clamp(");
        expect(shader.fragmentShader).toContain("float moonRaisedHorizonAngle = 3.141592653589793");
        expect(shader.fragmentShader).toContain("float moonMacroscopicRawNdotLForVis = moonSmoothRawNdotLForVis;");
        expect(shader.fragmentShader).toContain("moonRaisedHorizonAngle - moonSunFromRadialAngle");
        expect(shader.fragmentShader).toContain("float moonTerrainProminence = max");
        expect(shader.fragmentShader).toContain("float moonCurrentRawNdotLForVis = moonSmoothRawNdotLForVis + moonTerrainHorizonLift");
        expect(shader.fragmentShader).toContain("moonMacroscopicRawNdotLForVis,");
        expect(shader.fragmentShader).toContain("float moonSunVisibility = moonSunDiskVisibleFraction( moonEffectiveRawNdotLForVis );");
        expect(shader.fragmentShader).toContain("reflectedLight.indirectDiffuse *= 1.0 - moonFinalCavityDarkenFromHeight");
        expect(shader.fragmentShader).toContain("float moonTerrainSelfShadow = 0.0");
        expect(shader.fragmentShader).toContain("reflectedLight.directDiffuse *= 1.0 - moonTerrainShadow");
        expect(shader.fragmentShader).toContain("float moonShadowWeight = 1.0");
        expect(shader.fragmentShader)
            .toContain("float moonTerminatorScale = mix( 1.0, moonTerminatorScaleRaw, 0.42 );");
        expect(shader.fragmentShader).not.toContain("moonSunlitTerminatorToneFloor");
        expect(shader.fragmentShader)
            .toContain("float moonSunSlope = max( moonLightTangent.z, 0.0 ) / max( moonLightTangentPlanarLength, 1e-4 );");
        expect(shader.fragmentShader).toContain("for ( int moonSampleIndex = 1; moonSampleIndex <= 12; moonSampleIndex += 1 )");
        expect(shader.fragmentShader).toContain("float moonRequiredRise = moonSunSlope * moonSlopeScale * moonSampleDistance * 7.0;");
        expect(shader.fragmentShader).not.toContain("moonHorizonRise");
        expect(shader.fragmentShader)
            .toContain("smoothstep( -MOON_SUN_SIN_ALPHA, 0.025, moonEffectiveRawNdotLForVis )");
        expect(shader.fragmentShader).not.toContain("smoothstep( 0.045, 0.22, moonSmoothNdotL )");
        expect(shader.fragmentShader).not.toContain("smoothstep( 0.0, 0.055, moonSmoothNdotL )");
        expect(shader.fragmentShader).toContain("#endif\n    reflectedLight.indirectDiffuse += diffuseColor.rgb * ( uMoonShadowLift * moonShadowWeight * 0.72 );");

        moonRenderer.dispose();
    });

    it("can reduce the Moon to a smooth untextured baseline", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2 };

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
        expect(material.userData.moonLsBlend).toBe(0.0);
        expect(material.userData.moonTerrainShadowStrength).toBe(0.0);
        expect(material.userData.moonTerrainReliefStrength).toBe(0.0);
        expect(material.userData.moonShadowCrushBlend).toBe(0.0);
        expect(material.userData.moonGeometricMask).toBe(0.0);
        expect(material.userData.moonEarthshineBlend).toBe(0.0);

        moonRenderer.dispose();
    });

    it("keeps diagnostic lighting stages independently switchable", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2 };

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
        expect(material.userData.moonLsBlend).toBe(0.0);
        expect(material.userData.moonTerminatorContrast).toBeCloseTo(1.8, 4);
        expect(material.userData.moonTerminatorReliefStrength).toBe(0.0);
        expect(material.userData.moonTerminatorIndirectOcclusion).toBe(0.0);
        expect(material.userData.moonTerrainReliefStrength).toBe(0.0);
        expect(material.userData.moonTerrainShadowStrength).toBe(0.0);
        expect(material.userData.moonShadowCrushBlend).toBe(1.0);
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
        expect(material.userData.moonTerminatorContrast).toBeCloseTo(1.8, 4);
        expect(material.userData.moonTerminatorContrastBlend).toBe(0.0);
        expect(material.userData.moonTerminatorReliefStrength).toBeCloseTo(7.5, 4);

        moonRenderer.dispose();
    });

    it("uses the constrained physical DEM lighting stage set", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2 };

        moonRenderer.setRenderPipeline({
            lightingModel: "physical-dem",
            colorTexture: true,
            generatedNormalMap: true,
            displacement: true,
            photometric: false,
            terminatorContrast: true,
            terminatorRelief: true,
            terrainRelief: true,
            terrainShadows: true,
            indirectOcclusion: true,
            shadowCrush: true,
            earthshine: true,
            geometricMask: false,
        });
        moonRenderer.setTextures(colorTexture, displacementTexture);
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        expect(material.userData.moonPhysicalModelBlend).toBe(1.0);
        expect(material.userData.moonOppositionStrength).toBe(0.0);
        expect(material.userData.moonHighlightBoost).toBe(1.0);
        expect(material.userData.moonTerminatorContrastBlend).toBe(0.0);
        expect(material.userData.moonTerminatorReliefStrength).toBe(0.0);
        expect(material.userData.moonTerrainReliefStrength).toBe(0.0);
        expect(material.userData.moonTerminatorIndirectOcclusion).toBe(0.0);
        expect(material.userData.moonShadowCrushBlend).toBe(0.0);
        expect(material.userData.moonTerrainShadowStrength).toBeCloseTo(1.0, 4);
        expect(material.userData.moonPhysicalHeightScale).toBe(0);
        expect(material.userData.moonPhysicalExposure).toBeCloseTo(0.45, 4);
        expect(material.userData.moonPhysicalToneGamma).toBeCloseTo(1.00, 4);
        expect(material.shadowSide).toBe(THREE.FrontSide);
        expect(material.normalScale.x).toBeCloseTo(2.2, 4);
        expect(material.displacementScale).toBeCloseTo(0.013, 4);

        moonRenderer.dispose();
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
        });
        moonRenderer.setTextures(new THREE.Texture(), displacementTexture, new THREE.Texture());
        moonRenderer.create();

        const material = moonRenderer.mesh.material;
        expect(moonRenderer.mesh.geometry.parameters.widthSegments).toBe(1024);
        expect(moonRenderer.mesh.geometry.parameters.heightSegments).toBe(512);
        expect(material.displacementScale).toBeCloseTo(2 * 0.018860078277886497, 8);
        expect(material.displacementBias).toBeCloseTo(2 * -0.005755726948313572, 8);
        expect(material.normalScale.x).toBeCloseTo(1, 8);
        expect(material.shadowSide).toBe(THREE.FrontSide);
        expect(material.userData.moonPhysicalHeightScale).toBeCloseTo(0.018860078277886497, 8);
        expect(material.userData.moonPhysicalHeightBias).toBeCloseTo(-0.005755726948313572, 8);

        moonRenderer.dispose();
    });

    it("binds Physical's forced maps after a stored smooth preset", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2 };
        const legacyDisplacementTexture = new THREE.Texture();
        legacyDisplacementTexture.image = { width: 2, height: 2 };
        displacementTexture.userData.legacyTexture = legacyDisplacementTexture;
        const normalTexture = new THREE.Texture();
        moonRenderer.setRenderPipeline({
            lightingModel: "current",
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            terrainShadows: false,
        });
        moonRenderer.setTextures(colorTexture, displacementTexture, normalTexture);
        moonRenderer.create();

        moonRenderer.setRenderPipeline({
            ...moonRenderer.renderPipeline,
            lightingModel: "physical-dem",
        });

        expect(moonRenderer.mesh.material.map).toBe(colorTexture);
        expect(moonRenderer.mesh.material.normalMap).toBe(normalTexture);
        expect(moonRenderer.mesh.material.displacementMap).toBe(displacementTexture);
        expect(moonRenderer.mesh.material.userData.moonTerrainShadowStrength).toBe(1);

        moonRenderer.setRenderPipeline({
            ...moonRenderer.renderPipeline,
            lightingModel: "current",
            generatedNormalMap: true,
            displacement: true,
        });
        expect(moonRenderer.mesh.material.displacementMap).toBe(legacyDisplacementTexture);

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

    it("releases DEM-derived material maps when switching to the low tier", () => {
        const moonRenderer = new MoonRenderer(1);
        const colorTexture = new THREE.Texture();
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2 };
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
        displacementTexture.image = { width: 2, height: 2 };
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
        expect(material.userData.moonLsBlend).toBe(0.0);
        expect(material.userData.moonTerrainShadowStrength).toBe(0.0);

        moonRenderer.dispose();
    });
});
