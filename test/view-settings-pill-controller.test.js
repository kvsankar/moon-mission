import { describe, expect, it, vi } from "vitest";

import { createViewSettingsPillController } from "../src/platform/js/ui/view-settings-pill-controller.js";

function createClassList(initial = []) {
    const values = new Set(initial);
    return {
        add(value) {
            values.add(value);
        },
        remove(value) {
            values.delete(value);
        },
        contains(value) {
            return values.has(value);
        },
        toggle(value, force) {
            if (force === true) {
                values.add(value);
                return true;
            }
            if (force === false) {
                values.delete(value);
                return false;
            }
            if (values.has(value)) {
                values.delete(value);
                return false;
            }
            values.add(value);
            return true;
        },
    };
}

function createElement(id, options = {}) {
    const listeners = new Map();
    const attributes = new Map();
    return {
        id,
        checked: options.checked === true,
        disabled: options.disabled === true,
        hidden: options.hidden === true,
        value: options.value || "",
        textContent: options.textContent || "",
        title: options.title || "",
        dataset: {},
        style: {
            display: options.display || "",
            visibility: options.visibility || "",
        },
        classList: createClassList(options.classes || []),
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        dispatchEvent(event) {
            const handlers = listeners.get(event.type) || [];
            handlers.forEach((handler) => handler(event));
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
            this[name] = String(value);
        },
        getAttribute(name) {
            return attributes.get(name) || "";
        },
        contains(target) {
            return target === this;
        },
        getBoundingClientRect() {
            return options.rect || { left: 12, top: 20, bottom: 44, width: 120 };
        },
        offsetWidth: options.offsetWidth || 220,
        offsetParent: options.offsetParent || null,
        closest(selector) {
            if (selector === ".settings-option" || selector === "label") {
                return options.closestSettingsOption || null;
            }
            return null;
        },
    };
}

function createHarness(options = {}) {
    const rafQueue = [];
    const observerInstances = [];
    let moonProfile = options.moonProfile || "fast";
    let photoMode = options.photoMode === true;

    class FakeMutationObserver {
        constructor(callback) {
            this.callback = callback;
            this.targets = [];
            observerInstances.push(this);
        }

        observe(target, config) {
            this.targets.push({ config, target });
        }
    }

    const landingOptionRow = createElement("landing-option-row");
    const originEarthInput = createElement("origin-earth", { checked: true });
    const originMoonInput = createElement("origin-moon");
    const originRelativeInput = createElement("origin-relative");
    const originEarthPill = createElement("origin-pill-earth");
    const originMoonPill = createElement("origin-pill-moon");
    const originRelativePill = createElement("origin-pill-relative");
    const dimension2DInput = createElement("dimension-2D", { checked: true });
    const dimension3DInput = createElement("dimension-3D");
    const dimension2DPill = createElement("dimension-pill-2d");
    const dimension3DPill = createElement("dimension-pill-3d");
    const viewOrbitInput = createElement("view-orbit", { checked: true });
    const viewCratersInput = createElement("view-craters");
    const viewLunarCratersInput = createElement("view-lunar-craters");
    const viewMoonLatLonGridInput = createElement("view-moon-lat-lon-grid");
    const viewMoonLatLonLabelsInput = createElement("view-moon-lat-lon-labels", { checked: true });
    const viewMoonLatLonHoverInput = createElement("view-moon-lat-lon-hover");
    const lunarGridPanel = createElement("lunar-grid-controls-panel", { hidden: true });
    const lunarGridClose = createElement("lunar-grid-close");
    const lunarGridLinesToggle = createElement("lunar-grid-lines-toggle");
    const lunarGridLabelsToggle = createElement("lunar-grid-labels-toggle", { checked: true });
    const lunarGridHoverToggle = createElement("lunar-grid-hover-toggle");
    const viewMoonOrbitInput = createElement("view-moon-osculating-orbit", {
        closestSettingsOption: createElement("secondary-orbit-row"),
    });
    const bodyHaloToggle = createElement("view-body-halos", { checked: true });
    const lunarCraterPanel = createElement("lunar-crater-controls-panel", { hidden: true });
    const lunarCraterVisibleToggle = createElement("lunar-crater-visible-toggle");
    const lunarCraterHoverInput = createElement("lunar-crater-hover-labels", { checked: true });
    const lunarCraterDisplayMode = createElement("lunar-crater-display-mode", { value: "hover" });
    const lunarCraterOffToggle = createElement("lunar-crater-off-toggle");
    const lunarCraterHoverToggle = createElement("lunar-crater-hover-toggle");
    const lunarCraterMinDiameter = createElement("lunar-crater-min-diameter", { value: "80" });
    const lunarCraterMinDiameterStepDown = createElement("lunar-crater-min-diameter-step-down");
    const lunarCraterMinDiameterStepUp = createElement("lunar-crater-min-diameter-step-up");
    const lunarCraterMaxDiameter = createElement("lunar-crater-max-diameter", { value: "600" });
    const lunarCraterMaxDiameterStepDown = createElement("lunar-crater-max-diameter-step-down");
    const lunarCraterMaxDiameterStepUp = createElement("lunar-crater-max-diameter-step-up");
    const lunarCraterDiameterValue = createElement("lunar-crater-diameter-value");
    const lunarCraterCountValue = createElement("lunar-crater-count-value");
    const lunarCraterBusyIndicator = createElement("lunar-crater-busy-indicator", { hidden: true });
    const lunarCraterNudge = createElement("lunar-crater-nudge", { hidden: true });
    const locatorsPill = createElement("locators-pill");
    const orbitPill = createElement("toggle-pill-orbit");
    const cratersPill = createElement("toggle-pill-craters");
    const lunarCratersPill = createElement("toggle-pill-lunar-craters");
    const moonGridPill = createElement("toggle-pill-moon-grid");
    const landingPill = createElement("toggle-pill-landing");
    const moonOrbitPill = createElement("toggle-pill-moon-orbit");
    const descentPill = createElement("toggle-pill-descent");
    const orbitDescentOption = createElement("orbit-descent-option");
    const landingToggle = createElement("landing", { closestSettingsOption: landingOptionRow });
    const landingButton = createElement("landingbutton");
    const orbitLabel = createElement("label-orbit");
    const secondaryOrbitLabel = createElement("label-secondary-body-orbit");
    const fastPill = createElement("moon-profile-pill-fast");
    const qualityPill = createElement("moon-profile-pill-quality");
    const photoModePill = createElement("photo-mode-pill");
    const moonRenderPill = createElement("moon-render-pill");
    const moonRenderPanel = createElement("moon-render-pipeline-panel", { hidden: true });
    const moonRenderPanelHome = {
        appendChild(element) {
            element.parentElement = this;
        },
        insertBefore(element) {
            element.parentElement = this;
        },
    };
    moonRenderPanel.parentElement = moonRenderPanelHome;
    const moonRenderClose = createElement("moon-render-pipeline-close");
    const moonRenderAuxTrigger = createElement("composer-moon-render");
    moonRenderAuxTrigger.dataset.moonRenderPanelTrigger = "true";
    const moonRenderCurrentModel = createElement("moon-render-model-current");
    const moonRenderPhysicalModel = createElement("moon-render-model-physical-dem");
    const moonRenderLowTier = createElement("moon-render-tier-low");
    const moonRenderMediumTier = createElement("moon-render-tier-medium");
    const moonRenderHighTier = createElement("moon-render-tier-high");
    const moonPhysicalBrdf = createElement("moon-render-physical-physicalBrdfBlend", { value: "0.2" });
    const moonPhysicalBrdfValue = createElement("moon-render-physical-physicalBrdfBlend-value");
    const moonPhysicalNormal = createElement("moon-render-physical-physicalNormalScale", { value: "1" });
    const moonPhysicalNormalValue = createElement("moon-render-physical-physicalNormalScale-value");
    const moonPhysicalRelief = createElement("moon-render-physical-physicalReliefScale", { value: "1" });
    const moonPhysicalReliefValue = createElement("moon-render-physical-physicalReliefScale-value");
    const moonPhysicalShadows = createElement("moon-render-physical-physicalShadowStrength", { value: "1" });
    const moonPhysicalShadowsValue = createElement("moon-render-physical-physicalShadowStrength-value");
    const moonPhysicalExposure = createElement("moon-render-physical-physicalExposure", { value: "0.45" });
    const moonPhysicalExposureValue = createElement("moon-render-physical-physicalExposure-value");
    const moonPhysicalToneGamma = createElement("moon-render-physical-physicalToneGamma", { value: "1" });
    const moonPhysicalToneGammaValue = createElement("moon-render-physical-physicalToneGamma-value");
    const moonRenderSmoothPreset = createElement("moon-render-preset-smooth");
    const moonRenderNormalPreset = createElement("moon-render-preset-normal");
    const moonRenderTexturePreset = createElement("moon-render-preset-texture");
    const moonRenderTextureNormalPreset = createElement("moon-render-preset-textureNormal");
    const moonRenderPhotometricPreset = createElement("moon-render-preset-photometric");
    const moonRenderGeometricPreset = createElement("moon-render-preset-geometric");
    const moonRenderFullPreset = createElement("moon-render-preset-full");
    const moonRenderColorTextureStage = createElement("moon-render-stage-colorTexture", { checked: true });
    const moonRenderNormalMapStage = createElement("moon-render-stage-generatedNormalMap", { checked: true });
    const moonRenderDisplacementStage = createElement("moon-render-stage-displacement", { checked: true });
    const moonRenderPhotometricStage = createElement("moon-render-stage-photometric", { checked: true });
    const moonRenderTerminatorContrastStage = createElement("moon-render-stage-terminatorContrast");
    const moonRenderTerminatorStage = createElement("moon-render-stage-terminatorRelief", { checked: true });
    const moonRenderTerrainReliefStage = createElement("moon-render-stage-terrainRelief", { checked: true });
    const moonRenderTerrainShadowsStage = createElement("moon-render-stage-terrainShadows", { checked: true });
    const moonRenderIndirectOcclusionStage = createElement("moon-render-stage-indirectOcclusion", { checked: true });
    const moonRenderShadowCrushStage = createElement("moon-render-stage-shadowCrush", { checked: true });
    const moonRenderEarthshineStage = createElement("moon-render-stage-earthshine", { checked: true });
    const moonRenderGeometricMaskStage = createElement("moon-render-stage-geometricMask");
    let moonRenderPipeline = options.moonRenderPipeline || {
        colorTexture: true,
        generatedNormalMap: true,
        displacement: true,
        photometric: true,
        terminatorContrast: false,
        terminatorRelief: true,
        terrainRelief: true,
        terrainShadows: true,
        indirectOcclusion: true,
        shadowCrush: true,
        earthshine: true,
        geometricMask: false,
    };
    const surfacePointsPill = createElement("toggle-pill-surface-points");
    const surfacePointsPanel = createElement("surface-points-controls-panel", { hidden: true });
    const surfacePointsClose = createElement("surface-points-close");
    const viewSubSolarEarthInput = createElement("view-subsolar-earth");
    const surfacePointsSubSolarEarthToggle = createElement("surface-points-subsolar-earth-toggle");
    const viewSubMoonEarthInput = createElement("view-submoon-earth");
    const surfacePointsSubMoonEarthToggle = createElement("surface-points-submoon-earth-toggle");
    const viewSolarGlintEarthInput = createElement("view-solar-glint-earth");
    const surfacePointsSolarGlintEarthToggle = createElement("surface-points-solar-glint-earth-toggle");
    const viewLunarGlintEarthInput = createElement("view-lunar-glint-earth");
    const surfacePointsLunarGlintEarthToggle = createElement("surface-points-lunar-glint-earth-toggle");
    const viewSubCraftEarthInput = createElement("view-subcraft-earth");
    const surfacePointsSubCraftEarthToggle = createElement("surface-points-subcraft-earth-toggle");
    const geoScene = {
        surfacePointViewState: {},
        setSurfacePointMarkersVisible: vi.fn(),
    };
    const lunarScene = {
        surfacePointViewState: {},
        setSurfacePointMarkersVisible: vi.fn(),
    };

    const byId = new Map([
        ["origin-earth", originEarthInput],
        ["origin-moon", originMoonInput],
        ["origin-relative", originRelativeInput],
        ["origin-pill-earth", originEarthPill],
        ["origin-pill-moon", originMoonPill],
        ["origin-pill-relative", originRelativePill],
        ["dimension-2D", dimension2DInput],
        ["dimension-3D", dimension3DInput],
        ["dimension-pill-2d", dimension2DPill],
        ["dimension-pill-3d", dimension3DPill],
        ["view-orbit", viewOrbitInput],
        ["view-craters", viewCratersInput],
        ["view-lunar-craters", viewLunarCratersInput],
        ["view-moon-lat-lon-grid", viewMoonLatLonGridInput],
        ["view-moon-lat-lon-labels", viewMoonLatLonLabelsInput],
        ["view-moon-lat-lon-hover", viewMoonLatLonHoverInput],
        ["lunar-grid-controls-panel", lunarGridPanel],
        ["lunar-grid-close", lunarGridClose],
        ["lunar-grid-lines-toggle", lunarGridLinesToggle],
        ["lunar-grid-labels-toggle", lunarGridLabelsToggle],
        ["lunar-grid-hover-toggle", lunarGridHoverToggle],
        ["view-moon-osculating-orbit", viewMoonOrbitInput],
        ["view-body-halos", bodyHaloToggle],
        ["lunar-crater-controls-panel", lunarCraterPanel],
        ["lunar-crater-off-toggle", lunarCraterOffToggle],
        ["lunar-crater-visible-toggle", lunarCraterVisibleToggle],
        ["lunar-crater-hover-labels", lunarCraterHoverInput],
        ["lunar-crater-display-mode", lunarCraterDisplayMode],
        ["lunar-crater-hover-toggle", lunarCraterHoverToggle],
        ["lunar-crater-min-diameter", lunarCraterMinDiameter],
        ["lunar-crater-min-diameter-step-down", lunarCraterMinDiameterStepDown],
        ["lunar-crater-min-diameter-step-up", lunarCraterMinDiameterStepUp],
        ["lunar-crater-max-diameter", lunarCraterMaxDiameter],
        ["lunar-crater-max-diameter-step-down", lunarCraterMaxDiameterStepDown],
        ["lunar-crater-max-diameter-step-up", lunarCraterMaxDiameterStepUp],
        ["lunar-crater-diameter-value", lunarCraterDiameterValue],
        ["lunar-crater-count-value", lunarCraterCountValue],
        ["lunar-crater-busy-indicator", lunarCraterBusyIndicator],
        ["lunar-crater-nudge", lunarCraterNudge],
        ["locators-pill", locatorsPill],
        ["toggle-pill-orbit", orbitPill],
        ["toggle-pill-craters", cratersPill],
        ["toggle-pill-lunar-craters", lunarCratersPill],
        ["toggle-pill-moon-grid", moonGridPill],
        ["toggle-pill-landing", landingPill],
        ["toggle-pill-moon-orbit", moonOrbitPill],
        ["toggle-pill-descent", descentPill],
        ["orbit-descent-option", orbitDescentOption],
        ["landing", landingToggle],
        ["landingbutton", landingButton],
        ["label-orbit", orbitLabel],
        ["label-secondary-body-orbit", secondaryOrbitLabel],
        ["moon-profile-pill-fast", fastPill],
        ["moon-profile-pill-quality", qualityPill],
        ["photo-mode-pill", photoModePill],
        ["moon-render-pill", moonRenderPill],
        ["moon-render-pipeline-panel", moonRenderPanel],
        ["moon-render-pipeline-close", moonRenderClose],
        ["moon-render-model-current", moonRenderCurrentModel],
        ["moon-render-model-physical-dem", moonRenderPhysicalModel],
        ["moon-render-tier-low", moonRenderLowTier],
        ["moon-render-tier-medium", moonRenderMediumTier],
        ["moon-render-tier-high", moonRenderHighTier],
        ["moon-render-physical-physicalBrdfBlend", moonPhysicalBrdf],
        ["moon-render-physical-physicalBrdfBlend-value", moonPhysicalBrdfValue],
        ["moon-render-physical-physicalNormalScale", moonPhysicalNormal],
        ["moon-render-physical-physicalNormalScale-value", moonPhysicalNormalValue],
        ["moon-render-physical-physicalReliefScale", moonPhysicalRelief],
        ["moon-render-physical-physicalReliefScale-value", moonPhysicalReliefValue],
        ["moon-render-physical-physicalShadowStrength", moonPhysicalShadows],
        ["moon-render-physical-physicalShadowStrength-value", moonPhysicalShadowsValue],
        ["moon-render-physical-physicalExposure", moonPhysicalExposure],
        ["moon-render-physical-physicalExposure-value", moonPhysicalExposureValue],
        ["moon-render-physical-physicalToneGamma", moonPhysicalToneGamma],
        ["moon-render-physical-physicalToneGamma-value", moonPhysicalToneGammaValue],
        ["moon-render-preset-smooth", moonRenderSmoothPreset],
        ["moon-render-preset-normal", moonRenderNormalPreset],
        ["moon-render-preset-texture", moonRenderTexturePreset],
        ["moon-render-preset-textureNormal", moonRenderTextureNormalPreset],
        ["moon-render-preset-photometric", moonRenderPhotometricPreset],
        ["moon-render-preset-geometric", moonRenderGeometricPreset],
        ["moon-render-preset-full", moonRenderFullPreset],
        ["moon-render-stage-colorTexture", moonRenderColorTextureStage],
        ["moon-render-stage-generatedNormalMap", moonRenderNormalMapStage],
        ["moon-render-stage-displacement", moonRenderDisplacementStage],
        ["moon-render-stage-photometric", moonRenderPhotometricStage],
        ["moon-render-stage-terminatorContrast", moonRenderTerminatorContrastStage],
        ["moon-render-stage-terminatorRelief", moonRenderTerminatorStage],
        ["moon-render-stage-terrainRelief", moonRenderTerrainReliefStage],
        ["moon-render-stage-terrainShadows", moonRenderTerrainShadowsStage],
        ["moon-render-stage-indirectOcclusion", moonRenderIndirectOcclusionStage],
        ["moon-render-stage-shadowCrush", moonRenderShadowCrushStage],
        ["moon-render-stage-earthshine", moonRenderEarthshineStage],
        ["moon-render-stage-geometricMask", moonRenderGeometricMaskStage],
        ["toggle-pill-surface-points", surfacePointsPill],
        ["surface-points-controls-panel", surfacePointsPanel],
        ["surface-points-close", surfacePointsClose],
        ["view-subsolar-earth", viewSubSolarEarthInput],
        ["surface-points-subsolar-earth-toggle", surfacePointsSubSolarEarthToggle],
        ["view-submoon-earth", viewSubMoonEarthInput],
        ["surface-points-submoon-earth-toggle", surfacePointsSubMoonEarthToggle],
        ["view-solar-glint-earth", viewSolarGlintEarthInput],
        ["surface-points-solar-glint-earth-toggle", surfacePointsSolarGlintEarthToggle],
        ["view-lunar-glint-earth", viewLunarGlintEarthInput],
        ["surface-points-lunar-glint-earth-toggle", surfacePointsLunarGlintEarthToggle],
        ["view-subcraft-earth", viewSubCraftEarthInput],
        ["surface-points-subcraft-earth-toggle", surfacePointsSubCraftEarthToggle],
    ]);

    const documentListeners = new Map();
    const documentBody = {
        dataset: {
            mobileActiveTab: options.mobileActiveTab || "",
        },
        appendChild(element) {
            element.parentElement = this;
        },
    };
    const documentRef = {
        body: documentBody,
        addEventListener(type, handler) {
            if (!documentListeners.has(type)) documentListeners.set(type, []);
            documentListeners.get(type).push(handler);
        },
        getElementById(id) {
            return byId.get(id) || null;
        },
    };

    const windowRef = {
        innerWidth: options.innerWidth || 1024,
        animationScenes: options.animationScenes || {
            geo: geoScene,
            lunar: lunarScene,
        },
        getComputedStyle(element) {
            return {
                display: element.style.display || "",
                visibility: element.style.visibility || "",
            };
        },
    };

    const controlBackend = {
        commitDimensionSelection: vi.fn(),
        commitOriginMode: vi.fn(),
        commitViewPatch: vi.fn(),
        commitViewSetting: vi.fn(),
        toggleLandingMode: vi.fn(),
    };
    const setMoonRenderPipeline = vi.fn((pipeline) => {
        moonRenderPipeline = pipeline;
        return moonRenderPipeline;
    });

    const controller = createViewSettingsPillController({
        controlBackend,
        documentRef,
        windowRef,
        requestAnimationFrameImpl(callback) {
            rafQueue.push(callback);
        },
        MutationObserverImpl: FakeMutationObserver,
        getMoonRenderProfile() {
            return moonProfile;
        },
        setMoonRenderProfile(profile) {
            moonProfile = profile;
            return Promise.resolve(profile);
        },
        getPhotoMode() {
            return photoMode;
        },
        setPhotoMode(value) {
            photoMode = value === true;
            return Promise.resolve(photoMode);
        },
        getMoonRenderPipeline() {
            return moonRenderPipeline;
        },
        setMoonRenderPipeline,
        originPillPairs: [
            ["origin-pill-earth", "origin-earth", "geo"],
            ["origin-pill-moon", "origin-moon", "lunar"],
            ["origin-pill-relative", "origin-relative", "relative"],
        ],
        dimensionPillPairs: [
            ["dimension-pill-3d", "dimension-3D", "3D"],
            ["dimension-pill-2d", "dimension-2D", "2D"],
        ],
        moonProfilePillPairs: [
            ["moon-profile-pill-fast", "fast"],
            ["moon-profile-pill-quality", "quality"],
        ],
        togglePillPairs: [
            ["toggle-pill-orbit", "view-orbit", "viewOrbit"],
        ],
    });

    function flushRaf() {
        while (rafQueue.length) {
            const callback = rafQueue.shift();
            callback();
        }
    }

    function dispatchDocumentEvent(type, event) {
        (documentListeners.get(type) || []).forEach((handler) => handler(event));
    }

    return {
        bodyHaloToggle,
        controlBackend,
        controller,
        cratersPill,
        dispatchDocumentEvent,
        documentRef,
        documentBody,
        fastPill,
        flushRaf,
        landingOptionRow,
        landingPill,
        landingToggle,
        lunarCraterMinDiameter,
        lunarCraterMinDiameterStepDown,
        lunarCraterMinDiameterStepUp,
        lunarCraterMaxDiameter,
        lunarCraterMaxDiameterStepDown,
        lunarCraterMaxDiameterStepUp,
        lunarCraterDiameterValue,
        lunarCraterCountValue,
        lunarCraterBusyIndicator,
        lunarCraterNudge,
        lunarCraterDisplayMode,
        lunarCraterHoverInput,
        lunarCraterHoverToggle,
        lunarCraterOffToggle,
        lunarCraterPanel,
        lunarCratersPill,
        lunarCraterVisibleToggle,
        lunarGridClose,
        lunarGridHoverToggle,
        lunarGridLabelsToggle,
        lunarGridLinesToggle,
        lunarGridPanel,
        locatorsPill,
        moonGridPill,
        moonOrbitPill,
        moonRenderClose,
        moonRenderAuxTrigger,
        moonRenderColorTextureStage,
        moonRenderCurrentModel,
        moonRenderEarthshineStage,
        moonRenderFullPreset,
        moonRenderGeometricMaskStage,
        moonRenderGeometricPreset,
        moonRenderHighTier,
        moonRenderLowTier,
        moonRenderMediumTier,
        moonRenderPanel,
        moonRenderPanelHome,
        moonRenderPhotometricStage,
        moonRenderPill,
        moonRenderPipelineSetter: setMoonRenderPipeline,
        moonRenderPhysicalModel,
        moonPhysicalBrdf,
        moonPhysicalBrdfValue,
        moonPhysicalNormal,
        moonPhysicalNormalValue,
        moonPhysicalRelief,
        moonPhysicalReliefValue,
        moonPhysicalShadows,
        moonPhysicalShadowsValue,
        moonPhysicalToneGamma,
        moonPhysicalToneGammaValue,
        moonRenderSmoothPreset,
        moonRenderShadowCrushStage,
        moonRenderTerminatorContrastStage,
        moonRenderTerminatorStage,
        moonRenderTerrainReliefStage,
        moonRenderIndirectOcclusionStage,
        observerInstances,
        orbitLabel,
        orbitPill,
        photoModePill,
        originEarthPill,
        originMoonPill,
        originMoonInput,
        originRelativeInput,
        qualityPill,
        secondaryOrbitLabel,
        surfacePointsPanel,
        surfacePointsPill,
        surfacePointsClose,
        surfacePointsSubSolarEarthToggle,
        surfacePointsSolarGlintEarthToggle,
        geoScene,
        lunarScene,
        viewLunarCratersInput,
        viewMoonLatLonGridInput,
        viewMoonLatLonHoverInput,
        viewMoonLatLonLabelsInput,
        viewMoonOrbitInput,
        viewOrbitInput,
    };
}

describe("createViewSettingsPillController", function () {
    it("syncs the initial pill states and orbit labels", function () {
        const harness = createHarness();

        harness.controller.bind();

        expect(harness.originEarthPill.classList.contains("is-active")).toBe(true);
        expect(harness.originEarthPill["aria-pressed"]).toBe("true");
        expect(harness.orbitPill.textContent).toBe("Craft Orbit");
        expect(harness.secondaryOrbitLabel.textContent).toBe("Moon Orbit");
        expect(harness.locatorsPill["aria-pressed"]).toBe("true");
    });

    it("ignores disabled origin pills", function () {
        const harness = createHarness();
        harness.originMoonInput.disabled = true;
        harness.originMoonPill.disabled = true;
        harness.originMoonPill.setAttribute("aria-disabled", "true");

        harness.controller.bind();
        harness.originMoonPill.dispatchEvent({ type: "click", target: harness.originMoonPill });
        harness.originMoonInput.checked = false;
        harness.originMoonInput.dispatchEvent({ type: "click", target: harness.originMoonInput });
        harness.originMoonInput.dispatchEvent({ type: "change", target: harness.originMoonInput });

        expect(harness.controlBackend.commitOriginMode).not.toHaveBeenCalledWith("lunar");
    });

    it("commits relative origin changes and hides secondary orbit controls", function () {
        const harness = createHarness();

        harness.controller.bind();
        harness.originMoonInput.checked = false;
        harness.originRelativeInput.checked = true;
        harness.originRelativeInput.dispatchEvent({ type: "click" });

        expect(harness.controlBackend.commitOriginMode).toHaveBeenCalledWith("relative");
        expect(harness.viewMoonOrbitInput.disabled).toBe(true);
        expect(harness.viewMoonOrbitInput.checked).toBe(false);
        expect(harness.moonOrbitPill.hidden).toBe(true);
        expect(harness.secondaryOrbitLabel.textContent).toBe("Moon Orbit");
    });

    it("forces locators off on mobile views and commits the false setting", function () {
        const harness = createHarness({
            innerWidth: 480,
            mobileActiveTab: "views",
        });

        harness.controller.bind();
        harness.locatorsPill.dispatchEvent({ type: "click" });

        expect(harness.controlBackend.commitViewSetting).toHaveBeenCalledWith(
            "viewBodyHalos",
            false,
            { sourceId: "locators-pill" },
        );
    });

    it("switches moon profile pills through the async setter", async function () {
        const harness = createHarness();

        harness.controller.bind();
        harness.qualityPill.dispatchEvent({ type: "click" });
        await Promise.resolve();
        await Promise.resolve();

        expect(harness.qualityPill.disabled).toBe(false);
        expect(harness.qualityPill.classList.contains("is-active")).toBe(true);
        expect(harness.fastPill.classList.contains("is-active")).toBe(false);
    });

    it("allows a moon profile pill to toggle back to its off profile", async function () {
        const harness = createHarness({ moonProfile: "quality" });
        harness.qualityPill.dataset.toggleProfileOff = "fast";

        harness.controller.bind();
        harness.qualityPill.dispatchEvent({ type: "click" });
        await Promise.resolve();
        await Promise.resolve();

        expect(harness.qualityPill.classList.contains("is-active")).toBe(false);
        expect(harness.fastPill.classList.contains("is-active")).toBe(true);
    });

    it("toggles the photo mode pill through the async setter", async function () {
        const harness = createHarness();

        harness.controller.bind();
        expect(harness.photoModePill.classList.contains("is-active")).toBe(false);

        harness.photoModePill.dispatchEvent({ type: "click" });
        await Promise.resolve();
        await Promise.resolve();

        expect(harness.photoModePill.classList.contains("is-active")).toBe(true);
        expect(harness.photoModePill["aria-pressed"]).toBe("true");
    });

    it("opens Moon Render controls and commits pipeline presets", function () {
        const harness = createHarness();

        harness.controller.bind();
        expect(harness.moonRenderFullPreset["aria-pressed"]).toBe("true");
        expect(harness.moonRenderPill["aria-pressed"]).toBe("false");

        harness.moonRenderPill.dispatchEvent({ type: "click", target: harness.moonRenderPill });
        expect(harness.moonRenderPanel.hidden).toBe(false);
        expect(harness.moonRenderPill["aria-expanded"]).toBe("true");

        harness.moonRenderSmoothPreset.dispatchEvent({
            type: "click",
            target: harness.moonRenderSmoothPreset,
        });

        expect(harness.moonRenderPipelineSetter).toHaveBeenCalledWith({
            schemaVersion: 5,
            lightingModel: "current",
            physicalBrdfBlend: 0.2,
            physicalNormalScale: 1,
            physicalReliefScale: 1,
            physicalShadowStrength: 1,
            physicalExposure: 0.45,
            physicalToneGamma: 1,
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
        expect(harness.moonRenderSmoothPreset["aria-pressed"]).toBe("true");
        expect(harness.moonRenderFullPreset["aria-pressed"]).toBe("false");
        expect(harness.moonRenderPill["aria-pressed"]).toBe("true");
        expect(harness.moonRenderColorTextureStage.checked).toBe(false);
        expect(harness.moonRenderEarthshineStage.checked).toBe(false);
        expect(harness.moonRenderGeometricMaskStage.checked).toBe(false);

        harness.moonRenderGeometricPreset.dispatchEvent({
            type: "click",
            target: harness.moonRenderGeometricPreset,
        });
        expect(harness.moonRenderGeometricMaskStage.checked).toBe(true);
        expect(harness.moonRenderGeometricPreset["aria-pressed"]).toBe("true");
    });

    it("switches Moon lighting model and resource tier independently", async function () {
        const harness = createHarness();
        harness.controller.bind();

        expect(harness.moonRenderCurrentModel["aria-pressed"]).toBe("true");
        expect(harness.moonRenderMediumTier["aria-pressed"]).toBe("true");

        harness.moonRenderPhysicalModel.dispatchEvent({
            type: "click",
            target: harness.moonRenderPhysicalModel,
        });
        expect(harness.moonRenderPipelineSetter).toHaveBeenLastCalledWith(
            expect.objectContaining({ lightingModel: "physical-dem" }),
        );
        expect(harness.moonRenderPhysicalModel["aria-pressed"]).toBe("true");
        expect(harness.moonRenderCurrentModel["aria-pressed"]).toBe("false");
        expect(harness.moonRenderTerminatorContrastStage.disabled).toBe(true);
        expect(harness.moonRenderFullPreset.disabled).toBe(true);
        expect(harness.moonRenderPhotometricStage.checked).toBe(true);
        expect(harness.moonRenderTerminatorStage.checked).toBe(false);
        expect(harness.moonRenderTerrainReliefStage.checked).toBe(false);
        expect(harness.moonRenderIndirectOcclusionStage.checked).toBe(false);
        expect(harness.moonRenderShadowCrushStage.checked).toBe(false);
        expect(harness.moonRenderGeometricMaskStage.checked).toBe(false);
        expect(harness.moonPhysicalBrdf.disabled).toBe(false);

        harness.moonPhysicalBrdf.value = "0.4";
        harness.moonPhysicalBrdf.dispatchEvent({
            type: "input",
            target: harness.moonPhysicalBrdf,
        });
        expect(harness.moonRenderPipelineSetter).toHaveBeenLastCalledWith(
            expect.objectContaining({ physicalBrdfBlend: 0.4 }),
        );
        expect(harness.moonPhysicalBrdfValue.textContent).toBe("0.40");

        harness.moonPhysicalNormal.value = "0.9";
        harness.moonPhysicalNormal.dispatchEvent({
            type: "input",
            target: harness.moonPhysicalNormal,
        });
        expect(harness.moonRenderPipelineSetter).toHaveBeenLastCalledWith(
            expect.objectContaining({ physicalNormalScale: 0.9 }),
        );
        expect(harness.moonPhysicalNormalValue.textContent).toBe("0.90");

        harness.moonPhysicalRelief.value = "0.75";
        harness.moonPhysicalRelief.dispatchEvent({
            type: "input",
            target: harness.moonPhysicalRelief,
        });
        expect(harness.moonRenderPipelineSetter).toHaveBeenLastCalledWith(
            expect.objectContaining({ physicalReliefScale: 0.75 }),
        );
        expect(harness.moonPhysicalReliefValue.textContent).toBe("0.75");

        harness.moonPhysicalShadows.value = "0";
        harness.moonPhysicalShadows.dispatchEvent({
            type: "input",
            target: harness.moonPhysicalShadows,
        });
        expect(harness.moonRenderPipelineSetter).toHaveBeenLastCalledWith(
            expect.objectContaining({ physicalShadowStrength: 0 }),
        );
        expect(harness.moonPhysicalShadowsValue.textContent).toBe("0.00");

        harness.moonPhysicalToneGamma.value = "0.76";
        harness.moonPhysicalToneGamma.dispatchEvent({
            type: "input",
            target: harness.moonPhysicalToneGamma,
        });
        expect(harness.moonRenderPipelineSetter).toHaveBeenLastCalledWith(
            expect.objectContaining({ physicalToneGamma: 0.76 }),
        );
        expect(harness.moonPhysicalToneGammaValue.textContent).toBe("0.76");

        harness.moonRenderLowTier.dispatchEvent({
            type: "click",
            target: harness.moonRenderLowTier,
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(harness.moonRenderLowTier["aria-pressed"]).toBe("true");
        expect(harness.moonRenderMediumTier["aria-pressed"]).toBe("false");

        harness.moonRenderCurrentModel.dispatchEvent({
            type: "click",
            target: harness.moonRenderCurrentModel,
        });
        expect(harness.moonRenderTerminatorStage.checked).toBe(true);
        expect(harness.moonRenderFullPreset.disabled).toBe(false);
        expect(harness.moonRenderTerrainReliefStage.checked).toBe(true);
        expect(harness.moonRenderIndirectOcclusionStage.checked).toBe(true);
        expect(harness.moonRenderShadowCrushStage.checked).toBe(true);
    });

    it("portals Moon Render controls when opened from an auxiliary panel", function () {
        const harness = createHarness();
        harness.controller.bind();

        harness.dispatchDocumentEvent("moon-mission:moon-render-panel-request", {
            detail: {
                trigger: harness.moonRenderAuxTrigger,
            },
        });

        expect(harness.moonRenderPanel.hidden).toBe(false);
        expect(harness.moonRenderPanel.parentElement).toBe(harness.documentBody);
        expect(harness.moonRenderPanel.dataset.portaled).toBe("true");
        expect(harness.moonRenderPanel.style.position).toBe("fixed");
        expect(harness.moonRenderAuxTrigger["aria-expanded"]).toBe("true");

        harness.dispatchDocumentEvent("moon-mission:moon-render-panel-dismiss", {});
        expect(harness.moonRenderPanel.hidden).toBe(true);
        expect(harness.moonRenderAuxTrigger["aria-expanded"]).toBe("false");

        harness.moonRenderPill.dispatchEvent({ type: "click", target: harness.moonRenderPill });
        expect(harness.moonRenderPanel.parentElement).toBe(harness.moonRenderPanelHome);
        expect(harness.moonRenderPanel.dataset.portaled).toBeUndefined();
        expect(harness.moonRenderPanel.style.position).toBe("fixed");
    });

    it("shows the corrected Full preset for a stored seven-stage full state", function () {
        const harness = createHarness({
            moonRenderPipeline: {
                colorTexture: true,
                generatedNormalMap: true,
                displacement: true,
                photometric: true,
                terminatorRelief: true,
                terrainShadows: true,
                earthshine: true,
            },
        });

        harness.controller.bind();

        expect(harness.moonRenderFullPreset["aria-pressed"]).toBe("true");
        expect(harness.moonRenderTerminatorContrastStage.checked).toBe(false);
    });

    it("opens the lunar grid panel and commits grid overlay controls", function () {
        const harness = createHarness();

        harness.controller.bind();
        harness.moonGridPill.dispatchEvent({ type: "click", target: harness.moonGridPill });

        expect(harness.lunarGridPanel.hidden).toBe(false);
        expect(harness.moonGridPill["aria-expanded"]).toBe("true");
        expect(harness.lunarGridLabelsToggle.checked).toBe(true);

        harness.lunarGridLinesToggle.checked = true;
        harness.lunarGridLinesToggle.dispatchEvent({
            type: "click",
            target: harness.lunarGridLinesToggle,
        });
        expect(harness.controlBackend.commitViewSetting).toHaveBeenCalledWith(
            "viewMoonLatLonGrid",
            true,
            { sourceId: "lunar-grid-lines-toggle" },
        );
        expect(harness.viewMoonLatLonGridInput.checked).toBe(true);
        expect(harness.moonGridPill["aria-pressed"]).toBe("true");

        harness.lunarGridLabelsToggle.checked = false;
        harness.lunarGridLabelsToggle.dispatchEvent({
            type: "click",
            target: harness.lunarGridLabelsToggle,
        });
        expect(harness.controlBackend.commitViewSetting).toHaveBeenCalledWith(
            "viewMoonLatLonLabels",
            false,
            { sourceId: "lunar-grid-labels-toggle" },
        );
        expect(harness.viewMoonLatLonLabelsInput.checked).toBe(false);

        harness.lunarGridHoverToggle.checked = true;
        harness.lunarGridHoverToggle.dispatchEvent({
            type: "click",
            target: harness.lunarGridHoverToggle,
        });
        expect(harness.controlBackend.commitViewSetting).toHaveBeenCalledWith(
            "viewMoonLatLonHover",
            true,
            { sourceId: "lunar-grid-hover-toggle" },
        );
        expect(harness.viewMoonLatLonHoverInput.checked).toBe(true);

        harness.lunarGridClose.dispatchEvent({ type: "click", target: harness.lunarGridClose });
        expect(harness.lunarGridPanel.hidden).toBe(true);
        expect(harness.moonGridPill["aria-expanded"]).toBe("false");
    });

    it("keeps surface point toggles scoped to the active scene", function () {
        const harness = createHarness();

        harness.controller.bind();
        harness.surfacePointsPill.dispatchEvent({ type: "click", target: harness.surfacePointsPill });

        expect(harness.surfacePointsPanel.hidden).toBe(false);
        expect(harness.surfacePointsPill["aria-expanded"]).toBe("true");

        harness.surfacePointsSubSolarEarthToggle.checked = true;
        harness.surfacePointsSubSolarEarthToggle.dispatchEvent({
            type: "click",
            target: harness.surfacePointsSubSolarEarthToggle,
        });

        expect(harness.controlBackend.commitViewSetting).not.toHaveBeenCalledWith(
            "viewSubSolarEarth",
            true,
            expect.anything(),
        );
        expect(harness.geoScene.surfacePointViewState.viewSubSolarEarth).toBe(true);
        expect(harness.geoScene.setSurfacePointMarkersVisible).toHaveBeenLastCalledWith(
            expect.objectContaining({ viewSubSolarEarth: true }),
        );
        expect(harness.lunarScene.setSurfacePointMarkersVisible).not.toHaveBeenCalled();

        harness.originEarthPill.classList.remove("is-active");
        harness.originMoonInput.checked = true;
        harness.originEarthPill.dispatchEvent({ type: "click", target: harness.originEarthPill });
        harness.originMoonInput.dispatchEvent({ type: "click", target: harness.originMoonInput });
        harness.originMoonInput.dispatchEvent({ type: "change", target: harness.originMoonInput });

        expect(harness.surfacePointsSubSolarEarthToggle.checked).toBe(false);

        harness.surfacePointsSolarGlintEarthToggle.checked = true;
        harness.surfacePointsSolarGlintEarthToggle.dispatchEvent({
            type: "click",
            target: harness.surfacePointsSolarGlintEarthToggle,
        });

        expect(harness.lunarScene.surfacePointViewState.viewSolarGlintEarth).toBe(true);
        expect(harness.geoScene.surfacePointViewState.viewSolarGlintEarth).toBe(false);
    });

    it("opens the crater panel and commits dense crater controls", function () {
        vi.useFakeTimers();
        const harness = createHarness();

        try {
            harness.controller.bind();
            harness.lunarCratersPill.dispatchEvent({ type: "click", target: harness.lunarCratersPill });

            expect(harness.lunarCraterPanel.hidden).toBe(false);
            expect(harness.lunarCratersPill["aria-expanded"]).toBe("true");
            expect(harness.lunarCraterOffToggle["aria-pressed"]).toBe("true");
            expect(harness.lunarCraterMinDiameter.disabled).toBe(false);
            expect(harness.lunarCraterMinDiameterStepDown.disabled).toBe(false);
            expect(harness.lunarCraterMaxDiameter.disabled).toBe(false);
            expect(harness.lunarCraterMaxDiameterStepUp.disabled).toBe(false);
            expect(harness.lunarCraterCountValue.textContent).toBe("Features not loaded");

            harness.lunarCraterVisibleToggle.dispatchEvent({
                type: "click",
                target: harness.lunarCraterVisibleToggle,
            });
            expect(harness.controlBackend.commitViewPatch).toHaveBeenCalledWith(
                {
                    viewLunarCraters: true,
                    lunarCraterDisplayMode: "always",
                    lunarCraterHoverLabels: true,
                },
                { sourceId: "lunar-crater-visible-toggle" },
            );
            expect(harness.lunarCraterDisplayMode.value).toBe("always");
            expect(harness.lunarCraterOffToggle["aria-pressed"]).toBe("false");
            expect(harness.lunarCraterMinDiameter.disabled).toBe(false);
            expect(harness.lunarCraterMinDiameterStepDown.disabled).toBe(false);
            expect(harness.lunarCraterMaxDiameter.disabled).toBe(false);
            expect(harness.lunarCraterMaxDiameterStepUp.disabled).toBe(false);

            harness.lunarCraterHoverToggle.dispatchEvent({
                type: "click",
                target: harness.lunarCraterHoverToggle,
            });
            expect(harness.controlBackend.commitViewPatch).toHaveBeenCalledWith(
                {
                    viewLunarCraters: true,
                    lunarCraterDisplayMode: "hover",
                    lunarCraterHoverLabels: true,
                },
                { sourceId: "lunar-crater-hover-toggle" },
            );
            expect(harness.lunarCraterDisplayMode.value).toBe("hover");
            expect(harness.lunarCraterMinDiameter.disabled).toBe(false);
            expect(harness.lunarCraterMaxDiameter.disabled).toBe(false);

            harness.lunarCraterOffToggle.dispatchEvent({
                type: "click",
                target: harness.lunarCraterOffToggle,
            });
            expect(harness.controlBackend.commitViewPatch).toHaveBeenCalledWith(
                { viewLunarCraters: false },
                { sourceId: "lunar-crater-off-toggle" },
            );
            expect(harness.viewLunarCratersInput.checked).toBe(false);
            expect(harness.lunarCraterOffToggle["aria-pressed"]).toBe("true");
            expect(harness.lunarCraterMinDiameter.disabled).toBe(false);
            expect(harness.lunarCraterMinDiameterStepDown.disabled).toBe(false);
            expect(harness.lunarCraterMaxDiameter.disabled).toBe(false);
            expect(harness.lunarCraterMaxDiameterStepUp.disabled).toBe(false);

            const commitsBeforeInput = harness.controlBackend.commitViewPatch.mock.calls.length;
            harness.lunarCraterMinDiameter.value = "40";
            harness.lunarCraterMinDiameter.dispatchEvent({
                type: "input",
                target: harness.lunarCraterMinDiameter,
            });
            expect(harness.controlBackend.commitViewPatch.mock.calls).toHaveLength(commitsBeforeInput);
            expect(harness.lunarCraterBusyIndicator.hidden).toBe(false);
            expect(harness.lunarCraterDiameterValue.textContent).toBe("40-600 km");
            vi.advanceTimersByTime(180);
            expect(harness.controlBackend.commitViewPatch).toHaveBeenCalledWith(
                {
                    lunarCraterMinDiameterKm: 40,
                    lunarCraterMaxDiameterKm: 600,
                },
                { sourceId: "lunar-crater-min-diameter" },
            );
            expect(harness.lunarCraterBusyIndicator.hidden).toBe(true);

            harness.lunarCraterHoverToggle.dispatchEvent({
                type: "click",
                target: harness.lunarCraterHoverToggle,
            });
            const commitsBeforeStep = harness.controlBackend.commitViewPatch.mock.calls.length;
            harness.lunarCraterMinDiameterStepUp.dispatchEvent({
                type: "click",
                target: harness.lunarCraterMinDiameterStepUp,
            });
            expect(harness.controlBackend.commitViewPatch.mock.calls).toHaveLength(commitsBeforeStep);
            expect(harness.lunarCraterBusyIndicator.hidden).toBe(false);
            expect(harness.lunarCraterDiameterValue.textContent).toBe("50-600 km");
            vi.advanceTimersByTime(180);
            expect(harness.controlBackend.commitViewPatch).toHaveBeenCalledWith(
                {
                    lunarCraterMinDiameterKm: 50,
                    lunarCraterMaxDiameterKm: 600,
                },
                { sourceId: "lunar-crater-min-diameter" },
            );
            expect(harness.lunarCraterBusyIndicator.hidden).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("re-syncs landing pill visibility from the mutation observer", function () {
        const harness = createHarness();

        harness.controller.bind();
        harness.landingOptionRow.classList.add("settings-option--hidden");
        harness.observerInstances[0].callback();
        harness.flushRaf();

        expect(harness.landingPill.hidden).toBe(true);
        expect(harness.landingPill.disabled).toBe(true);
        expect(harness.cratersPill.title).toBe("Moon Sites available for landing missions");
    });
});
