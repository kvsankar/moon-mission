import { bindLunarCraterControlPanel as bindSharedLunarCraterControlPanel } from "./lunar-crater-control-panel.js";
import {
    createDefaultSurfacePointViewState,
    normalizeSurfacePointViewState,
    patchSurfacePointViewState,
} from "../core/domain/surface-point-view-state.js";

const SURFACE_POINT_SETTING_DEFINITIONS = Object.freeze([
    ["viewSubSolarEarth", "view-subsolar-earth", "surface-points-subsolar-earth-toggle"],
    ["viewSubMoonEarth", "view-submoon-earth", "surface-points-submoon-earth-toggle"],
    ["viewSolarGlintEarth", "view-solar-glint-earth", "surface-points-solar-glint-earth-toggle"],
    ["viewLunarGlintEarth", "view-lunar-glint-earth", "surface-points-lunar-glint-earth-toggle"],
    ["viewSubCraftEarth", "view-subcraft-earth", "surface-points-subcraft-earth-toggle"],
]);

// Owns annotation popover geometry, state projection and event bindings.
export function createAnnotationPanelController({
    documentRef,
    windowRef,
    getElement,
    controlBackend,
    getCraterPanelElements,
    setLunarCraterPanelOpen,
    isMobileControlLayout,
    closeMobileOnlyPanelsIfNeeded,
    syncLunarCraterPanelState,
    syncPressedState,
    syncTogglePillState,
    syncTogglePillVisibility,
    sync,
}) {
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

    return {
        getLunarGridPanelElements,
        getGuidesPanelElements,
        getSurfacePointPanelElements,
        positionPanelFromPill,
        setLunarGridPanelOpen,
        setGuidesPanelOpen,
        setSurfacePointPanelOpen,
        closeAnnotationPanels,
        syncGuidesPanelState,
        syncSurfacePointPanelState,
        syncLunarGridPanelState,
        commitLunarGridSetting,
        commitGuidesSetting,
        commitSurfacePointSetting,
        bindLunarCraterControlPanel,
    };
}
