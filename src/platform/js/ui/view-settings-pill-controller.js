import { resolveMoonRenderAssetProfile } from "../app/moon-render-asset-profiles.js";
import {
    MOON_RENDER_PIPELINE_PRESETS,
    MOON_RENDER_PIPELINE_STAGE_CONTROLS,
    MOON_PHYSICAL_RENDER_CONTROLS,
    normalizeMoonRenderPipelineState,
    resolveMoonRenderPipelinePresetId,
    resolveMoonRenderPipelineState,
} from "../app/moon-render-pipeline.js";
import { resolveMoonLightingModelStages } from "../app/moon-lighting-models.js";
import {
    resolveBodyOrbitCopy,
    resolveCraftOrbitCopy,
} from "./orbit-control-labels.js";
import {
    bindLunarCraterControlPanel as bindSharedLunarCraterControlPanel,
    getLunarCraterControlPanelElements as getSharedLunarCraterControlPanelElements,
    readLunarCraterControlState,
    syncLunarCraterControlPanel,
} from "./lunar-crater-control-panel.js";
import {
    createDefaultSurfacePointViewState,
    normalizeSurfacePointViewState,
    patchSurfacePointViewState,
} from "../core/domain/surface-point-view-state.js";

export const DEFAULT_ORIGIN_PILL_PAIRS = [
    ["origin-pill-earth", "origin-earth", "geo"],
    ["origin-pill-moon", "origin-moon", "lunar"],
    ["origin-pill-relative", "origin-relative", "relative"],
];

export const DEFAULT_DIMENSION_PILL_PAIRS = [
    ["dimension-pill-3d", "dimension-3D", "3D"],
    ["dimension-pill-2d", "dimension-2D", "2D"],
];

export const DEFAULT_MOON_PROFILE_PILL_PAIRS = [
    ["moon-profile-pill-fast", "fast"],
    ["moon-profile-pill-quality", "quality"],
];
export const DEFAULT_PHOTO_MODE_PILL_ID = "photo-mode-pill";
export const DEFAULT_MOON_RENDER_PILL_ID = "moon-render-pill";

export const DEFAULT_TOGGLE_PILL_PAIRS = [
    ["toggle-pill-orbit", "view-orbit", "viewOrbit"],
    ["toggle-pill-descent", "view-orbit-descent", "viewOrbitDescent"],
    ["toggle-pill-sky", "view-sky", "viewSky"],
    ["toggle-pill-xyz", "view-xyz-axes", "viewXYZAxes"],
    ["toggle-pill-earth-poles", "view-earth-poles", "viewEarthPoles"],
    ["toggle-pill-moon-poles", "view-moon-poles", "viewMoonPoles"],
    ["toggle-pill-earth-polar-axes", "view-earth-polar-axes", "viewEarthPolarAxes"],
    ["toggle-pill-moon-polar-axes", "view-moon-polar-axes", "viewMoonPolarAxes"],
    ["toggle-pill-earth-grid", "view-earth-lat-lon-grid", "viewEarthLatLonGrid"],
    ["toggle-pill-earth-labels", "view-earth-lat-lon-labels", "viewEarthLatLonLabels"],
    ["toggle-pill-earth-hover", "view-earth-lat-lon-hover", "viewEarthLatLonHover"],
    ["toggle-pill-moon-grid-legacy", "view-moon-lat-lon-grid", "viewMoonLatLonGrid"],
    ["toggle-pill-moon-labels", "view-moon-lat-lon-labels", "viewMoonLatLonLabels"],
    ["toggle-pill-moon-hover", "view-moon-lat-lon-hover", "viewMoonLatLonHover"],
    ["toggle-pill-constellations", "view-constellation-lines", "viewConstellationLines"],
    ["toggle-pill-moon-soi", "view-moonsoi", "viewMoonSOI"],
    ["toggle-pill-moon-hill-sphere", "view-moon-hill-sphere", "viewMoonHillSphere"],
    ["toggle-pill-moon-orbit", "view-moon-osculating-orbit", "viewMoonOsculatingOrbit"],
    ["toggle-pill-ecliptic", "view-eclipticplane", "viewEclipticPlane"],
    ["toggle-pill-equatorial", "view-equatorialplane", "viewEquatorialPlane"],
];

const SURFACE_POINT_SETTING_DEFINITIONS = Object.freeze([
    ["viewSubSolarEarth", "view-subsolar-earth", "surface-points-subsolar-earth-toggle"],
    ["viewSubMoonEarth", "view-submoon-earth", "surface-points-submoon-earth-toggle"],
    ["viewSolarGlintEarth", "view-solar-glint-earth", "surface-points-solar-glint-earth-toggle"],
    ["viewLunarGlintEarth", "view-lunar-glint-earth", "surface-points-lunar-glint-earth-toggle"],
    ["viewSubCraftEarth", "view-subcraft-earth", "surface-points-subcraft-earth-toggle"],
]);

const MOON_RENDER_MODEL_BUTTONS = Object.freeze([
    ["current", "moon-render-model-current"],
    ["physical-dem", "moon-render-model-physical-dem"],
]);
const MOON_RENDER_TIER_BUTTONS = Object.freeze([
    ["low", "low", "moon-render-tier-low"],
    ["medium", "fast", "moon-render-tier-medium"],
    ["high", "quality", "moon-render-tier-high"],
]);
const PHYSICAL_DEM_FORCED_STAGE_KEYS = new Set(
    MOON_RENDER_PIPELINE_STAGE_CONTROLS.map(([key]) => key),
);

export function createViewSettingsPillController(deps = {}) {
    const documentRef = deps.documentRef || document;
    const windowRef = deps.windowRef || window;
    const controlBackend = deps.controlBackend || {};
    const requestAnimationFrameImpl = typeof deps.requestAnimationFrameImpl === "function"
        ? deps.requestAnimationFrameImpl
        : windowRef.requestAnimationFrame?.bind(windowRef) || ((callback) => callback());
    const MutationObserverImpl = deps.MutationObserverImpl
        || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
    const originPillPairs = deps.originPillPairs || DEFAULT_ORIGIN_PILL_PAIRS;
    const dimensionPillPairs = deps.dimensionPillPairs || DEFAULT_DIMENSION_PILL_PAIRS;
    const moonProfilePillPairs = deps.moonProfilePillPairs || DEFAULT_MOON_PROFILE_PILL_PAIRS;
    const photoModePillId = deps.photoModePillId || DEFAULT_PHOTO_MODE_PILL_ID;
    const togglePillPairs = deps.togglePillPairs || DEFAULT_TOGGLE_PILL_PAIRS;
    const getMoonRenderProfile = typeof deps.getMoonRenderProfile === "function"
        ? deps.getMoonRenderProfile
        : resolveMoonRenderAssetProfile;
    const setMoonRenderProfile = deps.setMoonRenderProfile;
    const moonRenderPillId = deps.moonRenderPillId || DEFAULT_MOON_RENDER_PILL_ID;
    const getMoonRenderPipeline = typeof deps.getMoonRenderPipeline === "function"
        ? deps.getMoonRenderPipeline
        : (() => resolveMoonRenderPipelineState({ globalObject: windowRef }));
    const setMoonRenderPipeline = typeof deps.setMoonRenderPipeline === "function"
        ? deps.setMoonRenderPipeline
        : null;
    const getPhotoMode = typeof deps.getPhotoMode === "function"
        ? deps.getPhotoMode
        : (() => false);
    const setPhotoMode = typeof deps.setPhotoMode === "function"
        ? deps.setPhotoMode
        : null;
    const resolveCraftOrbitCopyImpl = deps.resolveCraftOrbitCopyImpl || resolveCraftOrbitCopy;
    const resolveBodyOrbitCopyImpl = deps.resolveBodyOrbitCopyImpl || resolveBodyOrbitCopy;

    let bound = false;
    let landingPillSyncScheduled = false;
    let moonRenderPanelHome = null;
    let activeMoonRenderPanelTrigger = null;

    function getElement(id) {
        return documentRef?.getElementById?.(id) || null;
    }

    function isElementVisible(element) {
        if (!element) return false;
        if (element.classList?.contains?.("settings-option--hidden")) return false;
        const style = windowRef.getComputedStyle?.(element);
        return style ? style.display !== "none" && style.visibility !== "hidden" : true;
    }

    function isRelativeOriginActive() {
        return !!getElement("origin-relative")?.checked;
    }

    function getActiveMoonRenderProfile() {
        return getMoonRenderProfile();
    }

    function syncPressedState(pill, isActive) {
        if (!pill) return;
        pill.classList?.toggle?.("is-active", !!isActive);
        pill.setAttribute?.("aria-pressed", isActive ? "true" : "false");
    }

    function syncPairPressedState(pairs) {
        pairs.forEach(([pillId, inputId]) => {
            const pill = getElement(pillId);
            const input = getElement(inputId);
            if (!pill || !input) return;
            syncPressedState(pill, input.checked === true);
        });
    }

    function syncLocatorsPillState() {
        const locatorsPill = getElement("locators-pill");
        const bodyHaloToggle = getElement("view-body-halos");
        if (!locatorsPill || !bodyHaloToggle) return;
        locatorsPill.setAttribute("aria-pressed", bodyHaloToggle.checked ? "true" : "false");
    }

    function syncOriginPillState() {
        syncPairPressedState(originPillPairs);
    }

    function syncDimensionPillState() {
        syncPairPressedState(dimensionPillPairs);
    }

    function syncMoonRenderProfilePillState() {
        const activeProfile = getActiveMoonRenderProfile();
        moonProfilePillPairs.forEach(([pillId, profile]) => {
            syncPressedState(getElement(pillId), activeProfile === profile);
        });
    }

    function syncPhotoModePillState() {
        syncPressedState(getElement(photoModePillId), !!getPhotoMode());
    }

    function syncTogglePillState() {
        syncPairPressedState(togglePillPairs);
    }

    function getCraterPanelElements() {
        return getSharedLunarCraterControlPanelElements(documentRef, {
            idPrefix: "lunar-crater",
            pillId: "toggle-pill-lunar-craters",
            visibleInputId: "view-lunar-craters",
        });
    }

    function syncLunarCraterPanelState() {
        const elements = getCraterPanelElements();
        syncLunarCraterControlPanel(elements, readLunarCraterControlState(elements));
    }

    function isMobileControlLayout() {
        return documentRef?.body?.classList?.contains?.("mobile-shell-enabled") ||
            windowRef?.matchMedia?.("(max-width: 600px)")?.matches === true;
    }

    function closeMobileOnlyPanelsIfNeeded() {
        if (!isMobileControlLayout()) return;
        setLunarCraterPanelOpen(false);
        setGuidesPanelOpen(false);
        setSurfacePointPanelOpen(false);
    }

    function setLunarCraterPanelOpen(open) {
        const { pill, panel } = getCraterPanelElements();
        if (!panel) return;
        if (open === true && isMobileControlLayout()) {
            open = false;
        }
        panel.hidden = open !== true;
        if (open === true) {
            positionPanelFromPill(panel, pill);
        }
        if (pill) {
            pill.classList?.toggle?.("is-open", open === true);
            pill.setAttribute?.("aria-expanded", open === true ? "true" : "false");
        }
    }

    function getMoonRenderPanelElements() {
        const panel = getElement("moon-render-pipeline-panel");
        return {
            pill: getElement(moonRenderPillId),
            panel,
            close: getElement("moon-render-pipeline-close"),
            modelButtons: MOON_RENDER_MODEL_BUTTONS
                .map(([model, id]) => [model, getElement(id)])
                .filter(([, button]) => !!button),
            tierButtons: MOON_RENDER_TIER_BUTTONS
                .map(([tier, profile, id]) => [tier, profile, getElement(id)])
                .filter(([, , button]) => !!button),
            physicalControls: MOON_PHYSICAL_RENDER_CONTROLS.map((control) => ({
                ...control,
                input: getElement(`moon-render-physical-${control.key}`),
                value: getElement(`moon-render-physical-${control.key}-value`),
            })).filter((control) => !!control.input),
            presetButtons: Object.keys(MOON_RENDER_PIPELINE_PRESETS)
                .map((presetId) => [presetId, getElement(`moon-render-preset-${presetId}`)])
                .filter(([, button]) => !!button),
            stageInputs: MOON_RENDER_PIPELINE_STAGE_CONTROLS
                .map(([key]) => [key, getElement(`moon-render-stage-${key}`)])
                .filter(([, input]) => !!input),
        };
    }

    function prepareMoonRenderPanelHost(trigger, panel, pill) {
        if (!panel) return false;
        const externalTrigger = trigger && trigger !== pill && trigger.dataset?.moonRenderPanelTrigger === "true";
        const body = documentRef?.body;
        if (externalTrigger && body?.appendChild && panel.parentElement !== body) {
            moonRenderPanelHome ||= {
                parent: panel.parentElement,
                nextSibling: panel.nextSibling,
            };
            body.appendChild(panel);
            if (panel.dataset) panel.dataset.portaled = "true";
            return true;
        }
        if (!externalTrigger && moonRenderPanelHome?.parent && panel.parentElement !== moonRenderPanelHome.parent) {
            const { parent, nextSibling } = moonRenderPanelHome;
            if (nextSibling && typeof parent.insertBefore === "function") {
                parent.insertBefore(panel, nextSibling);
            } else {
                parent.appendChild?.(panel);
            }
            if (panel.dataset) delete panel.dataset.portaled;
        }
        return panel.dataset?.portaled === "true";
    }

    function positionMoonRenderPanel(trigger, panel) {
        if (!trigger?.getBoundingClientRect || !panel?.style) return;
        const triggerRect = trigger.getBoundingClientRect();
        const panelWidth = panel.offsetWidth || 320;
        const panelHeight = panel.offsetHeight || 330;
        const viewportWidth = windowRef?.innerWidth || panelWidth;
        const viewportHeight = windowRef?.innerHeight || panelHeight;
        const preferredLeft = triggerRect.left + (triggerRect.width / 2) - (panelWidth / 2);
        const nextLeft = Math.min(
            Math.max(8, preferredLeft),
            Math.max(8, viewportWidth - panelWidth - 8),
        );
        const belowTop = triggerRect.bottom + 6;
        const aboveTop = triggerRect.top - panelHeight - 6;
        const preferredTop = belowTop + panelHeight <= viewportHeight - 8
            ? belowTop
            : aboveTop;
        const nextTop = Math.min(
            Math.max(8, preferredTop),
            Math.max(8, viewportHeight - panelHeight - 8),
        );
        panel.style.position = "fixed";
        panel.style.left = `${nextLeft}px`;
        panel.style.right = "auto";
        panel.style.top = `${Math.round(nextTop)}px`;
    }

    function setMoonRenderPanelOpen(open, trigger = null) {
        const { pill, panel } = getMoonRenderPanelElements();
        if (!panel) return;
        const previousTrigger = activeMoonRenderPanelTrigger;
        const activeTrigger = trigger || previousTrigger || pill;
        prepareMoonRenderPanelHost(activeTrigger, panel, pill);
        panel.hidden = open !== true;
        if (open === true) {
            activeMoonRenderPanelTrigger = activeTrigger;
            positionMoonRenderPanel(activeTrigger, panel);
        }
        [pill, activeTrigger, previousTrigger].forEach((button) => {
            if (!button?.setAttribute) return;
            button.classList?.toggle?.("is-open", open === true);
            button.setAttribute("aria-expanded", open === true ? "true" : "false");
        });
        if (open !== true) {
            activeMoonRenderPanelTrigger = null;
        }
    }

    function getActiveMoonRenderPipeline() {
        return normalizeMoonRenderPipelineState(getMoonRenderPipeline());
    }

    function syncMoonRenderPanelState() {
        const pipeline = getActiveMoonRenderPipeline();
        const effectivePipeline = resolveMoonLightingModelStages(pipeline);
        const activePresetId = resolveMoonRenderPipelinePresetId(pipeline);
        const {
            pill,
            modelButtons,
            tierButtons,
            physicalControls,
            presetButtons,
            stageInputs,
        } = getMoonRenderPanelElements();
        const isCustom = activePresetId === "custom";
        const activeProfile = getActiveMoonRenderProfile();
        const physicalModel = pipeline.lightingModel === "physical-dem";
        syncPressedState(pill, physicalModel || isCustom || activePresetId !== "full");
        modelButtons.forEach(([model, button]) => {
            syncPressedState(button, model === pipeline.lightingModel);
        });
        tierButtons.forEach(([, profile, button]) => {
            syncPressedState(button, profile === activeProfile);
        });
        physicalControls.forEach(({ key, input, value }) => {
            const numeric = Number(pipeline[key]);
            input.value = String(numeric);
            input.disabled = !physicalModel;
            if (value) value.textContent = numeric.toFixed(2);
        });
        presetButtons.forEach(([presetId, button]) => {
            syncPressedState(button, presetId === activePresetId);
            button.disabled = physicalModel;
        });
        stageInputs.forEach(([key, input]) => {
            input.checked = effectivePipeline[key] === true;
            input.disabled = physicalModel && PHYSICAL_DEM_FORCED_STAGE_KEYS.has(key);
        });
    }

    function commitMoonRenderPipeline(nextState) {
        const normalized = normalizeMoonRenderPipelineState(nextState);
        if (typeof setMoonRenderPipeline === "function") {
            setMoonRenderPipeline(normalized);
        }
        syncMoonRenderPanelState();
    }

    function bindMoonRenderPanel() {
        const {
            pill,
            close,
            modelButtons,
            tierButtons,
            physicalControls,
            presetButtons,
            stageInputs,
        } = getMoonRenderPanelElements();
        if (pill) {
            pill.addEventListener("click", function (event) {
                event?.stopPropagation?.();
                const panel = getMoonRenderPanelElements().panel;
                setMoonRenderPanelOpen(panel?.hidden !== false, pill);
                syncMoonRenderPanelState();
            });
        }
        close?.addEventListener?.("click", () => setMoonRenderPanelOpen(false));
        modelButtons.forEach(([lightingModel, button]) => {
            button.addEventListener("click", () => {
                commitMoonRenderPipeline({
                    ...getActiveMoonRenderPipeline(),
                    lightingModel,
                });
            });
        });
        tierButtons.forEach(([, profile, button]) => {
            button.addEventListener("click", () => {
                if (getActiveMoonRenderProfile() === profile) return;
                tierButtons.forEach(([, , tierButton]) => {
                    tierButton.disabled = true;
                });
                Promise.resolve(
                    typeof setMoonRenderProfile === "function"
                        ? setMoonRenderProfile(profile)
                        : profile,
                ).catch((error) => {
                    console.error("Failed to switch Moon resource tier:", error);
                }).finally(() => {
                    tierButtons.forEach(([, , tierButton]) => {
                        tierButton.disabled = false;
                    });
                    syncMoonRenderPanelState();
                    syncMoonRenderProfilePillState();
                });
            });
        });
        physicalControls.forEach(({ key, input }) => {
            input.addEventListener("input", () => {
                commitMoonRenderPipeline({
                    ...getActiveMoonRenderPipeline(),
                    [key]: Number(input.value),
                });
            });
        });
        presetButtons.forEach(([presetId, button]) => {
            button.addEventListener("click", () => {
                const preset = MOON_RENDER_PIPELINE_PRESETS[presetId];
                if (!preset) return;
                commitMoonRenderPipeline({
                    ...getActiveMoonRenderPipeline(),
                    ...preset.state,
                    lightingModel: getActiveMoonRenderPipeline().lightingModel,
                });
            });
        });
        stageInputs.forEach(([key, input]) => {
            input.addEventListener("change", () => {
                commitMoonRenderPipeline({
                    ...getActiveMoonRenderPipeline(),
                    [key]: input.checked === true,
                });
            });
        });
        documentRef?.addEventListener?.("moon-mission:moon-render-panel-request", (event) => {
            const trigger = event?.detail?.trigger;
            if (!trigger) return;
            const panel = getMoonRenderPanelElements().panel;
            setMoonRenderPanelOpen(panel?.hidden !== false, trigger);
            syncMoonRenderPanelState();
        });
        documentRef?.addEventListener?.("moon-mission:moon-render-panel-dismiss", () => {
            setMoonRenderPanelOpen(false);
        });
        documentRef?.addEventListener?.("click", (event) => {
            const trigger = event?.target?.closest?.("[data-moon-render-panel-trigger]");
            if (!trigger) return;
            event?.stopPropagation?.();
            const panel = getMoonRenderPanelElements().panel;
            setMoonRenderPanelOpen(panel?.hidden !== false, trigger);
            syncMoonRenderPanelState();
        });
    }

    function getLunarGridPanelElements() {
        return {
            pill: getElement("toggle-pill-moon-grid"),
            panel: getElement("lunar-grid-controls-panel"),
            close: getElement("lunar-grid-close"),
            gridInput: getElement("view-moon-lat-lon-grid"),
            labelsInput: getElement("view-moon-lat-lon-labels"),
            hoverInput: getElement("view-moon-lat-lon-hover"),
            gridToggle: getElement("lunar-grid-lines-toggle"),
            labelsToggle: getElement("lunar-grid-labels-toggle"),
            hoverToggle: getElement("lunar-grid-hover-toggle"),
        };
    }

    const GUIDE_SETTING_DEFINITIONS = Object.freeze([
        ["viewXYZAxes", "view-xyz-axes", "guides-xyz-toggle"],
        ["viewEarthPoles", "view-earth-poles", "guides-earth-poles-toggle"],
        ["viewEarthPolarAxes", "view-earth-polar-axes", "guides-earth-polar-axes-toggle"],
        ["viewEarthLatLonGrid", "view-earth-lat-lon-grid", "guides-earth-grid-toggle"],
        ["viewEarthLatLonLabels", "view-earth-lat-lon-labels", "guides-earth-labels-toggle"],
        ["viewEarthLatLonHover", "view-earth-lat-lon-hover", "guides-earth-hover-toggle"],
        ["viewMoonPoles", "view-moon-poles", "guides-moon-poles-toggle"],
        ["viewMoonPolarAxes", "view-moon-polar-axes", "guides-moon-polar-axes-toggle"],
        ["viewMoonLatLonGrid", "view-moon-lat-lon-grid", "guides-moon-grid-toggle"],
        ["viewMoonLatLonLabels", "view-moon-lat-lon-labels", "guides-moon-labels-toggle"],
        ["viewMoonLatLonHover", "view-moon-lat-lon-hover", "guides-moon-hover-toggle"],
    ]);

    function getGuidesPanelElements() {
        const settingEntries = GUIDE_SETTING_DEFINITIONS.map(([settingKey, inputId, toggleId]) => ({
            settingKey,
            input: getElement(inputId),
            toggle: getElement(toggleId),
            inputId,
            toggleId,
        }));
        return {
            pill: getElement("toggle-pill-guides"),
            panel: getElement("guides-controls-panel"),
            close: getElement("guides-close"),
            settingEntries,
        };
    }

    function getSurfacePointPanelElements() {
        const settingEntries = SURFACE_POINT_SETTING_DEFINITIONS.map(([settingKey, inputId, toggleId]) => ({
            settingKey,
            input: getElement(inputId),
            toggle: getElement(toggleId),
            inputId,
            toggleId,
        }));
        return {
            pill: getElement("toggle-pill-surface-points"),
            panel: getElement("surface-points-controls-panel"),
            close: getElement("surface-points-close"),
            settingEntries,
        };
    }

    function getActiveSceneConfigKey() {
        if (getElement("origin-relative")?.checked) return "relative";
        if (getElement("origin-moon")?.checked) return "lunar";
        return "geo";
    }

    function getActiveAnimationScene() {
        const scenes = windowRef?.animationScenes || globalThis?.animationScenes || null;
        return scenes?.[getActiveSceneConfigKey()] || scenes?.geo || null;
    }

    function readActiveSurfacePointViewState() {
        const scene = getActiveAnimationScene();
        if (!scene) {
            const fallback = {};
            SURFACE_POINT_SETTING_DEFINITIONS.forEach(([settingKey, inputId]) => {
                fallback[settingKey] = getElement(inputId)?.checked === true;
            });
            return normalizeSurfacePointViewState(fallback);
        }
        scene.surfacePointViewState = normalizeSurfacePointViewState(
            scene.surfacePointViewState || createDefaultSurfacePointViewState(),
        );
        return scene.surfacePointViewState;
    }

    function commitActiveSurfacePointViewPatch(patch = {}) {
        const scene = getActiveAnimationScene();
        const nextState = patchSurfacePointViewState(
            scene?.surfacePointViewState || createDefaultSurfacePointViewState(),
            patch,
        );
        if (scene) {
            scene.surfacePointViewState = nextState;
            scene.setSurfacePointMarkersVisible?.(nextState);
        }
        return nextState;
    }

    function positionPanelFromPill(panel, pill) {
        if (!panel || !pill?.getBoundingClientRect || !panel?.style) return;
        if (documentRef?.body?.classList?.contains?.("dockview-panels-enabled")) {
            const pillRect = pill.getBoundingClientRect();
            const panelWidth = panel.offsetWidth || (panel.classList?.contains?.("surface-points-controls-panel") ? 300 : 360);
            const viewportWidth = windowRef?.innerWidth || panelWidth;
            const preferredLeft = pillRect.left + (pillRect.width / 2) - (panelWidth / 2);
            const nextLeft = Math.min(
                Math.max(8, preferredLeft),
                Math.max(8, viewportWidth - panelWidth - 8),
            );
            panel.style.position = "fixed";
            panel.style.left = `${Math.round(nextLeft)}px`;
            panel.style.right = "auto";
            panel.style.top = `${Math.round(pillRect.bottom + 6)}px`;
            return;
        }
        const strip = getElement("header-pill-strip") || panel.offsetParent || null;
        const pillRect = pill.getBoundingClientRect();
        const stripRect = strip?.getBoundingClientRect?.() || {
            left: 0,
            top: 0,
            width: windowRef?.innerWidth || 0,
        };
        const panelWidth = panel.offsetWidth || 236;
        const maxLeft = Math.max(8, (stripRect.width || windowRef?.innerWidth || panelWidth) - panelWidth - 8);
        const nextLeft = Math.min(
            Math.max(8, pillRect.left - stripRect.left),
            maxLeft,
        );
        panel.style.left = `${nextLeft}px`;
        panel.style.right = "auto";
        panel.style.top = isMobileControlLayout()
            ? `${(stripRect.height || 0) + 8}px`
            : `${pillRect.bottom - stripRect.top + 4}px`;
    }

    function setLunarGridPanelOpen(open) {
        const { pill, panel } = getLunarGridPanelElements();
        if (!panel) return;
        panel.hidden = open !== true;
        if (open === true) {
            positionPanelFromPill(panel, pill);
        }
        if (pill) {
            pill.classList?.toggle?.("is-open", open === true);
            pill.setAttribute?.("aria-expanded", open === true ? "true" : "false");
        }
    }

    function setGuidesPanelOpen(open) {
        const { pill, panel } = getGuidesPanelElements();
        if (!panel) return;
        if (open === true && isMobileControlLayout()) {
            open = false;
        }
        panel.hidden = open !== true;
        if (open === true) {
            positionPanelFromPill(panel, pill);
        }
        if (pill) {
            pill.classList?.toggle?.("is-open", open === true);
            pill.setAttribute?.("aria-expanded", open === true ? "true" : "false");
        }
    }

    function setSurfacePointPanelOpen(open) {
        const { pill, panel } = getSurfacePointPanelElements();
        if (!panel) return;
        if (open === true && isMobileControlLayout()) {
            open = false;
        }
        panel.hidden = open !== true;
        if (open === true) {
            positionPanelFromPill(panel, pill);
        }
        if (pill) {
            pill.classList?.toggle?.("is-open", open === true);
            pill.setAttribute?.("aria-expanded", open === true ? "true" : "false");
        }
    }

    function closeAnnotationPanels(exceptPanelId = "") {
        if (exceptPanelId !== "lunar-crater-controls-panel") {
            setLunarCraterPanelOpen(false);
        }
        if (exceptPanelId !== "guides-controls-panel") {
            setGuidesPanelOpen(false);
        }
        if (exceptPanelId !== "surface-points-controls-panel") {
            setSurfacePointPanelOpen(false);
        }
    }

    function syncGuidesPanelState() {
        const { pill, settingEntries } = getGuidesPanelElements();
        let anyActive = false;
        settingEntries.forEach(({ settingKey, input, toggle }) => {
            const checked = input?.checked === true;
            if (toggle) toggle.checked = checked;
            anyActive = anyActive || (checked && !settingKey.endsWith("LatLonLabels"));
        });
        syncPressedState(pill, anyActive);
    }

    function syncSurfacePointPanelState() {
        const { pill, settingEntries } = getSurfacePointPanelElements();
        const state = readActiveSurfacePointViewState();
        let anyActive = false;
        settingEntries.forEach(({ settingKey, input, toggle }) => {
            const checked = state?.[settingKey] === true;
            if (toggle) toggle.checked = checked;
            if (input) input.checked = checked;
            anyActive = anyActive || checked;
        });
        syncPressedState(pill, anyActive);
    }

    function syncLunarGridPanelState() {
        const {
            pill,
            gridInput,
            labelsInput,
            hoverInput,
            gridToggle,
            labelsToggle,
            hoverToggle,
        } = getLunarGridPanelElements();
        const gridVisible = gridInput?.checked === true;
        if (gridToggle) gridToggle.checked = gridVisible;
        if (labelsToggle) labelsToggle.checked = labelsInput?.checked === true;
        if (hoverToggle) hoverToggle.checked = hoverInput?.checked === true;
        syncPressedState(pill, gridVisible);
    }

    function commitLunarGridSetting(settingKey, value, sourceId) {
        const inputIdBySetting = {
            viewMoonLatLonGrid: "view-moon-lat-lon-grid",
            viewMoonLatLonLabels: "view-moon-lat-lon-labels",
            viewMoonLatLonHover: "view-moon-lat-lon-hover",
        };
        const input = getElement(inputIdBySetting[settingKey]);
        if (input) {
            input.checked = Boolean(value);
        }
        controlBackend.commitViewSetting?.(settingKey, Boolean(value), { sourceId });
        syncTogglePillVisibility();
        syncTogglePillState();
        syncLunarGridPanelState();
    }

    function commitGuidesSetting(settingKey, value, sourceId) {
        const entry = GUIDE_SETTING_DEFINITIONS.find(([candidate]) => candidate === settingKey);
        const input = entry ? getElement(entry[1]) : null;
        const toggle = entry ? getElement(entry[2]) : null;
        const nextValue = Boolean(value);
        if (input) input.checked = nextValue;
        if (toggle) toggle.checked = nextValue;
        controlBackend.commitViewSetting?.(settingKey, nextValue, { sourceId });
        syncTogglePillVisibility();
        syncTogglePillState();
        syncGuidesPanelState();
        syncLunarGridPanelState();
    }

    function commitSurfacePointSetting(settingKey, value, sourceId) {
        const entry = SURFACE_POINT_SETTING_DEFINITIONS.find(([candidate]) => candidate === settingKey);
        const input = entry ? getElement(entry[1]) : null;
        const toggle = entry ? getElement(entry[2]) : null;
        const nextValue = Boolean(value);
        const nextState = commitActiveSurfacePointViewPatch({ [settingKey]: nextValue });
        if (input) input.checked = nextValue;
        if (toggle) toggle.checked = nextValue;
        syncTogglePillVisibility();
        syncTogglePillState();
        if (entry) {
            if (input) input.checked = nextState[settingKey] === true;
            if (toggle) toggle.checked = nextState[settingKey] === true;
        }
        syncSurfacePointPanelState();
    }

    function commitLunarCraterViewPatch(patch, options = {}) {
        controlBackend.commitViewPatch?.(patch, options);
        syncTogglePillVisibility();
        syncTogglePillState();
        syncGuidesPanelState();
        syncSurfacePointPanelState();
        syncLunarGridPanelState();
        syncLunarCraterPanelState();
    }

    function bindLunarCraterControlPanel() {
        const { pill } = getCraterPanelElements();

        if (pill) {
            pill.addEventListener("click", function (event) {
                if (pill.disabled || pill.getAttribute?.("aria-disabled") === "true") return;
                if (isMobileControlLayout()) {
                    closeMobileOnlyPanelsIfNeeded();
                    return;
                }
                event?.stopPropagation?.();
                const panelOpen = getCraterPanelElements().panel?.hidden === false;
                closeAnnotationPanels(panelOpen ? "" : "lunar-crater-controls-panel");
                setLunarCraterPanelOpen(!panelOpen);
                syncLunarCraterPanelState();
            });
        }
        bindSharedLunarCraterControlPanel({
            elements: getCraterPanelElements(),
            commitPatch: commitLunarCraterViewPatch,
            sync: syncLunarCraterPanelState,
        });
        getCraterPanelElements().closeButton?.addEventListener?.("click", function () {
            setLunarCraterPanelOpen(false);
        });
    }

    function syncTogglePillVisibility() {
        const landingToggle = getElement("landing");
        const landingPill = getElement("toggle-pill-landing");
        const landingOptionRow = landingToggle?.closest?.(".settings-option")
            || landingToggle?.closest?.("label")
            || null;
        const descentOrbitOption = getElement("orbit-descent-option");
        const secondaryOrbitToggle = getElement("view-moon-osculating-orbit");
        const secondaryOrbitOption = secondaryOrbitToggle?.closest?.(".settings-option") || null;
        const secondaryOrbitPill = getElement("toggle-pill-moon-orbit");
        const moonSitesToggle = getElement("view-craters");
        const moonSitesPill = getElement("toggle-pill-craters");
        const isRelativeOrigin = isRelativeOriginActive();
        const hasLanding = !!landingToggle
            && !landingToggle.disabled
            && isElementVisible(landingOptionRow);

        if (landingPill) {
            landingPill.hidden = !hasLanding;
            landingPill.disabled = !hasLanding;
            landingPill.setAttribute("aria-disabled", hasLanding ? "false" : "true");
            if (!hasLanding) {
                syncPressedState(landingPill, false);
            }
        }

        const descentPill = getElement("toggle-pill-descent");
        if (descentPill) {
            const hasDescentOrbit = !!descentOrbitOption
                && !descentOrbitOption.classList?.contains?.("settings-option--hidden");
            descentPill.hidden = !hasDescentOrbit;
        }

        if (secondaryOrbitToggle) {
            secondaryOrbitToggle.disabled = isRelativeOrigin;
            if (isRelativeOrigin) {
                secondaryOrbitToggle.checked = false;
            }
        }
        if (secondaryOrbitOption) {
            secondaryOrbitOption.classList?.toggle?.("settings-option--hidden", isRelativeOrigin);
        }
        if (secondaryOrbitPill) {
            secondaryOrbitPill.hidden = isRelativeOrigin;
            secondaryOrbitPill.disabled = isRelativeOrigin;
            secondaryOrbitPill.setAttribute("aria-disabled", isRelativeOrigin ? "true" : "false");
            if (isRelativeOrigin) {
                syncPressedState(secondaryOrbitPill, false);
            }
        }

        if (moonSitesPill) {
            if (moonSitesToggle) {
                moonSitesToggle.disabled = !hasLanding;
                if (!hasLanding) {
                    moonSitesToggle.checked = false;
                }
            }
            moonSitesPill.disabled = !hasLanding;
            moonSitesPill.setAttribute("aria-disabled", hasLanding ? "false" : "true");
            if (!hasLanding) {
                syncPressedState(moonSitesPill, false);
                moonSitesPill.title = "Moon Sites available for landing missions";
            } else {
                moonSitesPill.title = "Toggle legacy Moon Sites overlay";
            }
        }
    }

    function syncLandingPillState() {
        const landingPill = getElement("toggle-pill-landing");
        const landingToggle = getElement("landing");
        if (!landingPill || !landingToggle) return;
        syncPressedState(landingPill, landingToggle.checked === true);
    }

    function scheduleLandingPillSync() {
        if (landingPillSyncScheduled) return;
        landingPillSyncScheduled = true;
        requestAnimationFrameImpl(() => {
            landingPillSyncScheduled = false;
            syncTogglePillVisibility();
            syncLandingPillState();
        });
    }

    function bindLandingPillVisibilityObserver() {
        const landingToggle = getElement("landing");
        if (!landingToggle || !MutationObserverImpl) return;
        const landingOptionRow = landingToggle?.closest?.(".settings-option")
            || landingToggle?.closest?.("label")
            || null;
        const observerTargets = [
            landingOptionRow,
            landingToggle,
            getElement("landingbutton"),
        ].filter(Boolean);
        if (!observerTargets.length) return;
        const observer = new MutationObserverImpl(() => {
            scheduleLandingPillSync();
        });
        observerTargets.forEach((target) => {
            observer.observe(target, {
                attributes: true,
                attributeFilter: ["class", "style", "hidden", "disabled", "aria-hidden"],
            });
        });
    }

    function syncOrbitLabels() {
        const originMode = isRelativeOriginActive()
            ? "relative"
            : getElement("origin-moon")?.checked
                ? "lunar"
                : "geo";
        const craftOrbitCopy = resolveCraftOrbitCopyImpl();
        const bodyOrbitCopy = resolveBodyOrbitCopyImpl(originMode);
        const orbitLabel = getElement("label-orbit");
        const orbitPill = getElement("toggle-pill-orbit");
        const secondaryOrbitLabel = getElement("label-secondary-body-orbit");
        const secondaryOrbitPill = getElement("toggle-pill-moon-orbit");

        if (orbitLabel) {
            orbitLabel.title = craftOrbitCopy.title;
        }
        if (orbitPill) {
            orbitPill.textContent = craftOrbitCopy.label;
            orbitPill.title = craftOrbitCopy.title;
        }
        if (secondaryOrbitLabel) {
            secondaryOrbitLabel.textContent = bodyOrbitCopy.label;
            secondaryOrbitLabel.title = bodyOrbitCopy.title;
        }
        if (secondaryOrbitPill) {
            secondaryOrbitPill.textContent = bodyOrbitCopy.label;
            secondaryOrbitPill.title = bodyOrbitCopy.title;
        }
    }

    function isMobileViewsOrComposeTab() {
        if (!windowRef || windowRef.innerWidth > 600) return false;
        const activeTab = documentRef?.body?.dataset?.mobileActiveTab || "";
        return activeTab === "views" || activeTab === "compose";
    }

    function enforceMobileLocatorTabPolicy() {
        const bodyHaloToggle = getElement("view-body-halos");
        if (!bodyHaloToggle) return;
        if (isMobileViewsOrComposeTab()) {
            bodyHaloToggle.checked = false;
        }
    }

    function commitOriginMode(originMode) {
        controlBackend.commitOriginMode?.(originMode);
        syncOriginPillState();
        syncOrbitLabels();
        syncTogglePillVisibility();
        syncSurfacePointPanelState();
    }

    function commitDimensionSelection(dimension) {
        controlBackend.commitDimensionSelection?.(dimension);
        syncDimensionPillState();
    }

    function commitSharedViewSetting(settingKey, value, options = {}) {
        controlBackend.commitViewSetting?.(settingKey, value, options);
        syncTogglePillVisibility();
        syncTogglePillState();
        syncGuidesPanelState();
        syncSurfacePointPanelState();
        syncLunarGridPanelState();
        syncLunarCraterPanelState();
        syncLocatorsPillState();
    }

    function commitBodyHaloSetting(value, options = {}) {
        enforceMobileLocatorTabPolicy();
        const nextValue = isMobileViewsOrComposeTab() ? false : !!value;
        commitSharedViewSetting("viewBodyHalos", nextValue, options);
    }

    function toggleLandingMode(options = {}) {
        controlBackend.toggleLandingMode?.(options);
        syncTogglePillVisibility();
        syncLandingPillState();
    }

    function bind() {
        if (bound) return;
        bound = true;

        originPillPairs.forEach(([pillId, inputId, originMode]) => {
            const pill = getElement(pillId);
            const input = getElement(inputId);
            if (pill) {
                pill.addEventListener("click", function () {
                    if (pill.disabled || input?.disabled || pill.getAttribute?.("aria-disabled") === "true") {
                        return;
                    }
                    commitOriginMode(originMode);
                });
            }
            if (input) {
                input.addEventListener("click", function () {
                    if (input.disabled) return;
                    commitOriginMode(originMode);
                });
                input.addEventListener("change", function () {
                    syncOriginPillState();
                    syncOrbitLabels();
                    syncTogglePillVisibility();
                    syncSurfacePointPanelState();
                });
            }
        });

        dimensionPillPairs.forEach(([pillId, inputId, dimension]) => {
            const pill = getElement(pillId);
            const input = getElement(inputId);
            if (pill) {
                pill.addEventListener("click", function () {
                    commitDimensionSelection(dimension);
                });
            }
            if (input) {
                input.addEventListener("click", function () {
                    commitDimensionSelection(dimension);
                });
                input.addEventListener("change", syncDimensionPillState);
            }
        });

        togglePillPairs.forEach(([pillId, inputId, settingKey]) => {
            const pill = getElement(pillId);
            const input = getElement(inputId);
            if (pill) {
                pill.addEventListener("click", function () {
                    if (pill.disabled || pill.getAttribute?.("aria-disabled") === "true") return;
                    commitSharedViewSetting(settingKey, !input?.checked, {
                        sourceId: pillId,
                    });
                });
            }
            if (input) {
                input.addEventListener("click", function (event) {
                    commitSharedViewSetting(settingKey, !!event?.target?.checked, {
                        sourceId: inputId,
                    });
                });
                input.addEventListener("change", function () {
                    syncTogglePillVisibility();
                    syncTogglePillState();
                    syncLunarGridPanelState();
                    syncSurfacePointPanelState();
                    syncLocatorsPillState();
                });
            }
        });

        const {
            pill: guidesPill,
            close: guidesClose,
            settingEntries: guideSettingEntries,
        } = getGuidesPanelElements();
        if (guidesPill) {
            guidesPill.addEventListener("click", function (event) {
                if (guidesPill.disabled || guidesPill.getAttribute?.("aria-disabled") === "true") return;
                if (isMobileControlLayout()) {
                    closeMobileOnlyPanelsIfNeeded();
                    return;
                }
                event?.stopPropagation?.();
                const panelOpen = getGuidesPanelElements().panel?.hidden === false;
                closeAnnotationPanels(panelOpen ? "" : "guides-controls-panel");
                setGuidesPanelOpen(!panelOpen);
                syncGuidesPanelState();
            });
        }
        guidesClose?.addEventListener?.("click", function () {
            setGuidesPanelOpen(false);
        });
        guideSettingEntries.forEach(({ settingKey, input, toggle, toggleId }) => {
            toggle?.addEventListener?.("click", function (event) {
                commitGuidesSetting(settingKey, !!event?.target?.checked, toggleId);
            });
            input?.addEventListener?.("change", syncGuidesPanelState);
        });

        const {
            pill: surfacePointsPill,
            close: surfacePointsClose,
            settingEntries: surfacePointSettingEntries,
        } = getSurfacePointPanelElements();
        if (surfacePointsPill) {
            surfacePointsPill.addEventListener("click", function (event) {
                if (surfacePointsPill.disabled || surfacePointsPill.getAttribute?.("aria-disabled") === "true") return;
                if (isMobileControlLayout()) {
                    closeMobileOnlyPanelsIfNeeded();
                    return;
                }
                event?.stopPropagation?.();
                const panelOpen = getSurfacePointPanelElements().panel?.hidden === false;
                closeAnnotationPanels(panelOpen ? "" : "surface-points-controls-panel");
                setSurfacePointPanelOpen(!panelOpen);
                syncSurfacePointPanelState();
            });
        }
        surfacePointsClose?.addEventListener?.("click", function () {
            setSurfacePointPanelOpen(false);
        });
        surfacePointSettingEntries.forEach(({ settingKey, input, toggle, toggleId }) => {
            toggle?.addEventListener?.("click", function (event) {
                commitSurfacePointSetting(settingKey, !!event?.target?.checked, toggleId);
            });
            input?.addEventListener?.("click", function (event) {
                commitSurfacePointSetting(settingKey, !!event?.target?.checked, input.id);
            });
            input?.addEventListener?.("change", syncSurfacePointPanelState);
        });

        const {
            pill: lunarGridPill,
            close: lunarGridClose,
            gridInput: lunarGridInput,
            labelsInput: lunarGridLabelsInput,
            hoverInput: lunarGridHoverInput,
            gridToggle: lunarGridToggle,
            labelsToggle: lunarGridLabelsToggle,
            hoverToggle: lunarGridHoverToggle,
        } = getLunarGridPanelElements();
        if (lunarGridPill) {
            lunarGridPill.addEventListener("click", function (event) {
                if (lunarGridPill.disabled || lunarGridPill.getAttribute?.("aria-disabled") === "true") return;
                event?.stopPropagation?.();
                setLunarGridPanelOpen(true);
                syncLunarGridPanelState();
            });
        }
        lunarGridClose?.addEventListener?.("click", function () {
            setLunarGridPanelOpen(false);
        });
        [
            [lunarGridToggle, "viewMoonLatLonGrid"],
            [lunarGridLabelsToggle, "viewMoonLatLonLabels"],
            [lunarGridHoverToggle, "viewMoonLatLonHover"],
        ].forEach(([toggle, settingKey]) => {
            toggle?.addEventListener?.("click", function (event) {
                commitLunarGridSetting(settingKey, !!event?.target?.checked, toggle.id);
            });
        });
        [
            [lunarGridInput, "viewMoonLatLonGrid"],
            [lunarGridLabelsInput, "viewMoonLatLonLabels"],
            [lunarGridHoverInput, "viewMoonLatLonHover"],
        ].forEach(([input, settingKey]) => {
            input?.addEventListener?.("click", function (event) {
                commitLunarGridSetting(settingKey, !!event?.target?.checked, input.id);
            });
            input?.addEventListener?.("change", syncLunarGridPanelState);
        });

        const bodyHaloToggle = getElement("view-body-halos");
        if (bodyHaloToggle) {
            bodyHaloToggle.addEventListener("click", function (event) {
                commitBodyHaloSetting(!!event?.target?.checked, {
                    sourceId: "view-body-halos",
                });
            });
        }

        const locatorsPill = getElement("locators-pill");
        if (locatorsPill) {
            locatorsPill.addEventListener("click", function () {
                if (!bodyHaloToggle) return;
                commitBodyHaloSetting(!bodyHaloToggle.checked, {
                    sourceId: "locators-pill",
                });
            });
        }

        moonProfilePillPairs.forEach(([pillId, profile]) => {
            const pill = getElement(pillId);
            if (!pill) return;
            pill.addEventListener("click", function () {
                const currentProfile = getActiveMoonRenderProfile();
                const offProfile = pill.dataset?.toggleProfileOff;
                const nextProfile = currentProfile === profile && offProfile ? offProfile : profile;
                if (currentProfile === nextProfile) {
                    syncMoonRenderProfilePillState();
                    return;
                }
                pill.disabled = true;
                Promise.resolve(
                    typeof setMoonRenderProfile === "function"
                        ? setMoonRenderProfile(nextProfile)
                        : nextProfile,
                ).catch((error) => {
                    console.error("Failed to switch Moon render profile:", error);
                }).finally(() => {
                    pill.disabled = false;
                    syncMoonRenderProfilePillState();
                });
            });
        });

        const photoModePill = getElement(photoModePillId);
        if (photoModePill) {
            photoModePill.addEventListener("click", function () {
                const nextValue = !getPhotoMode();
                photoModePill.disabled = true;
                Promise.resolve(
                    typeof setPhotoMode === "function"
                        ? setPhotoMode(nextValue)
                        : nextValue,
                ).catch((error) => {
                    console.error("Failed to toggle photo mode:", error);
                }).finally(() => {
                    photoModePill.disabled = false;
                    syncPhotoModePillState();
                });
            });
        }

        bindLunarCraterControlPanel();
        bindMoonRenderPanel();
        documentRef?.addEventListener?.("moon-mission:view-identity-settings-applied", sync);

        const landingToggle = getElement("landing");
        if (landingToggle) {
            landingToggle.addEventListener("change", function () {
                syncTogglePillVisibility();
                syncLandingPillState();
            });
            landingToggle.addEventListener("click", function () {
                toggleLandingMode({ sourceId: "landing" });
            });
        }

        const landingPill = getElement("toggle-pill-landing");
        if (landingPill) {
            landingPill.addEventListener("click", function () {
                if (!landingToggle || landingToggle.disabled) return;
                toggleLandingMode({ sourceId: "toggle-pill-landing" });
            });
        }

        bindLandingPillVisibilityObserver();
        windowRef?.addEventListener?.("resize", closeMobileOnlyPanelsIfNeeded);
        closeMobileOnlyPanelsIfNeeded();
        sync();
    }

    function sync() {
        syncOriginPillState();
        syncLocatorsPillState();
        syncOrbitLabels();
        syncTogglePillVisibility();
        syncTogglePillState();
        syncGuidesPanelState();
        syncSurfacePointPanelState();
        syncLunarCraterPanelState();
        syncLandingPillState();
        syncDimensionPillState();
        syncMoonRenderProfilePillState();
        syncMoonRenderPanelState();
        syncPhotoModePillState();
    }

    return {
        bind,
        commitBodyHaloSetting,
        commitDimensionSelection,
        commitOriginMode,
        commitSharedViewSetting,
        scheduleLandingPillSync,
        sync,
        syncDimensionPillState,
        syncLandingPillState,
        syncLunarCraterPanelState,
        syncLocatorsPillState,
        syncMoonRenderProfilePillState,
        syncMoonRenderPanelState,
        syncPhotoModePillState,
        syncOrbitLabels,
        syncOriginPillState,
        syncTogglePillState,
        syncTogglePillVisibility,
        toggleLandingMode,
    };
}
