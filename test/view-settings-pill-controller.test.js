import { describe, expect, it, vi } from "vitest";

import { createHarness } from "./helpers/view-settings-pill-harness.js";

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
            schemaVersion: 7,
            lightingModel: "physical-dem",
            physicalBrdfBlend: 0.2,
            physicalNormalScale: 1,
            physicalReliefScale: 1,
            physicalShadowStrength: 1,
            physicalExposure: 0.4,
            physicalToneGamma: 1.06,
            colorTexture: false,
            generatedNormalMap: false,
            displacement: false,
            terrainShadows: false,
            earthshine: true,
            geometricMask: false,
        });
        expect(harness.moonRenderSmoothPreset["aria-pressed"]).toBe("true");
        expect(harness.moonRenderFullPreset["aria-pressed"]).toBe("false");
        expect(harness.moonRenderPill["aria-pressed"]).toBe("true");
        expect(harness.moonRenderColorTextureStage.checked).toBe(false);
        expect(harness.moonRenderEarthshineStage.checked).toBe(true);
        expect(harness.moonRenderGeometricMaskStage.checked).toBe(false);

        harness.moonRenderGeometricPreset.dispatchEvent({
            type: "click",
            target: harness.moonRenderGeometricPreset,
        });
        expect(harness.moonRenderGeometricMaskStage.checked).toBe(true);
        expect(harness.moonRenderGeometricPreset["aria-pressed"]).toBe("true");
    });

    it("keeps resource tiers independent of Physical tuning", async function () {
        const harness = createHarness();
        harness.controller.bind();
        expect(harness.moonRenderMediumTier["aria-pressed"]).toBe("true");
        expect(harness.moonPhysicalBrdf.disabled).toBe(false);
        expect(harness.moonRenderFullPreset.disabled).toBe(false);

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

        expect(harness.moonPhysicalBrdfValue.textContent).toBe("0.40");
        expect(harness.moonRenderPipelineSetter).toHaveBeenLastCalledWith(expect.objectContaining({ lightingModel: "physical-dem", physicalToneGamma: 0.76 }));

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
