/**
 * UI State Helpers
 *
 * Imperative-shell utilities for reading and writing UI control state.
 * These helpers centralize DOM access so core/renderer code can stay focused.
 */
import {
    getLunarCraterControlPanelElements,
    readLunarCraterControlState,
    writeLunarCraterControlState,
} from "./lunar-crater-control-panel.js";

function normalizeId(idOrSelector) {
    if (!idOrSelector) return "";
    return idOrSelector.startsWith("#") ? idOrSelector.slice(1) : idOrSelector;
}

function getElement(idOrSelector) {
    return document.getElementById(normalizeId(idOrSelector));
}

export function getChecked(idOrSelector) {
    const element = getElement(idOrSelector);
    return !!element?.checked;
}

export function setChecked(idOrSelector, checked) {
    const element = getElement(idOrSelector);
    if (!element) return;
    element.checked = !!checked;
}

function getSelectValue(idOrSelector, fallback = "") {
    const element = getElement(idOrSelector);
    const value = element?.value;
    return value !== undefined && value !== null && value !== "" ? value : fallback;
}

function setSelectValue(idOrSelector, value) {
    const element = getElement(idOrSelector);
    if (!element) return;
    element.value = value;
}

function setRadioGroupValue(groupName, value) {
    if (!groupName) return;
    const element = document.querySelector(`input[name="${groupName}"][value="${value}"]`);
    if (!element) return;
    element.checked = true;
}

function getRadioGroupValue(groupName, fallback = "") {
    if (!groupName) return fallback;
    const element = document.querySelector(`input[name="${groupName}"]:checked`);
    return element?.value ?? fallback;
}

function getRangeValue(idOrSelector, fallback = 1) {
    const element = getElement(idOrSelector);
    const value = Number(element?.value);
    return Number.isFinite(value) ? value : fallback;
}

function setRangeValue(idOrSelector, value) {
    const element = getElement(idOrSelector);
    if (!element) return;
    element.value = String(value);
}

function setText(idOrSelector, value) {
    const element = getElement(idOrSelector);
    if (!element) return;
    element.textContent = value;
}

function hasElement(idOrSelector) {
    return !!getElement(idOrSelector);
}

function setElementsHidden(selector, hidden) {
    const elements = document.querySelectorAll(selector);
    if (!elements.length) return;
    elements.forEach((element) => {
        element.classList.toggle("settings-row--hidden", !!hidden);
    });
}

function readOrbitStyle() {
    const selected = document.querySelector('input[name="orbit-style"]:checked');
    return selected?.value === "trail" ? "trail" : "classic";
}

function getMainLunarCraterControlElements() {
    return getLunarCraterControlPanelElements(document, {
        idPrefix: "lunar-crater",
        visibleInputId: "view-lunar-craters",
    });
}

function syncTrailStyleControlVisibility(orbitStyle, viewOrbit = getChecked("view-orbit")) {
    setElementsHidden(".trail-style-control", orbitStyle !== "trail" || !viewOrbit);
}

function syncOrbitStyleControlVisibility(viewOrbit = getChecked("view-orbit")) {
    setElementsHidden(".orbit-style-control", !viewOrbit);
}

export function readOriginMode() {
    if (getChecked("origin-relative")) return "geo";
    if (getChecked("origin-earth")) return "geo";
    if (getChecked("origin-moon")) return "lunar";
    return "undefined";
}

export function applyOriginMode(originMode) {
    const normalizedMode = String(originMode || "").trim().toLowerCase();
    setChecked("origin-earth", normalizedMode === "earth" || normalizedMode === "geo");
    setChecked("origin-moon", normalizedMode === "moon" || normalizedMode === "lunar");
    setChecked("origin-relative", normalizedMode === "relative");
}

export function readPlaneSelection() {
    return getRadioGroupValue("plane", "DEFAULT");
}

export function applyPlaneSelection(planeSelection) {
    setRadioGroupValue("plane", planeSelection || "DEFAULT");
}

export function readDimensionSelection() {
    return getRadioGroupValue("dimension", "3D");
}

export function applyDimensionSelection(dimension) {
    setRadioGroupValue("dimension", dimension || "3D");
}

const VIEW_SETTING_CHECKBOXES = {
    viewAdditionalCrafts: "view-additional-crafts",
    viewAuxiliaryPanels: "view-aux-camera-panels",
    viewOrbit: "view-orbit",
    viewOrbitDescent: "view-orbit-descent",
    viewCraters: "view-craters",
    viewLunarCraters: "view-lunar-craters",
    viewMoonLatLonGrid: "view-moon-lat-lon-grid",
    viewMoonLatLonLabels: "view-moon-lat-lon-labels",
    viewMoonLatLonHover: "view-moon-lat-lon-hover",
    viewEarthLatLonGrid: "view-earth-lat-lon-grid",
    viewEarthLatLonLabels: "view-earth-lat-lon-labels",
    viewEarthLatLonHover: "view-earth-lat-lon-hover",
    viewXYZAxes: "view-xyz-axes",
    viewPoles: "view-poles",
    viewPolarAxes: "view-polar-axes",
    viewEarthPoles: "view-earth-poles",
    viewMoonPoles: "view-moon-poles",
    viewEarthPolarAxes: "view-earth-polar-axes",
    viewMoonPolarAxes: "view-moon-polar-axes",
    viewSky: "view-sky",
    viewConstellationLines: "view-constellation-lines",
    viewMoonSOI: "view-moonsoi",
    viewMoonHillSphere: "view-moon-hill-sphere",
    viewBodyHalos: "view-body-halos",
    viewMoonOsculatingOrbit: "view-moon-osculating-orbit",
    viewSubSolarEarth: "view-subsolar-earth",
    viewSubSolarMoon: "view-subsolar-moon",
    viewSubMoonEarth: "view-submoon-earth",
    viewSolarGlintEarth: "view-solar-glint-earth",
    viewLunarGlintEarth: "view-lunar-glint-earth",
    viewSubCraftEarth: "view-subcraft-earth",
    viewSubCraftMoon: "view-subcraft-moon",
    viewEclipticPlane: "view-eclipticplane",
    viewEquatorialPlane: "view-equatorialplane",
    viewFPS: "view-fps"
};

const OPTIONAL_SKY_CHECKBOX_IDS = {
    atmosphere_enabled: ["sky-atmosphere-enabled", "atmosphere-enabled", "atmosphere_enabled"],
};

const OPTIONAL_SKY_RANGE_IDS = {
    bloom_strength: ["sky-bloom-strength", "bloom-strength", "bloom_strength"],
    star_size_scale: ["sky-star-size-scale", "star-size-scale", "star_size_scale"],
    extinction_strength: ["sky-extinction-strength", "extinction-strength", "extinction_strength"],
    twinkle_strength: ["sky-twinkle-strength", "twinkle-strength", "twinkle_strength"],
    observer_lat: ["sky-observer-lat", "observer-lat", "observer_lat"],
    observer_lon: ["sky-observer-lon", "observer-lon", "observer_lon"],
    sky_time_ms: ["sky-time-ms", "sky_time_ms"],
    sky_time_seconds: ["sky-time-seconds", "sky_time_seconds"],
};

function readOptionalBoolean(ids) {
    for (const id of ids) {
        if (!hasElement(id)) continue;
        return getChecked(id);
    }
    return undefined;
}

function readOptionalNumber(ids) {
    for (const id of ids) {
        if (!hasElement(id)) continue;
        const value = Number(getElement(id)?.value);
        if (Number.isFinite(value)) {
            return value;
        }
    }
    return undefined;
}

function setOptionalNumber(ids, value) {
    if (!Number.isFinite(value)) return;
    for (const id of ids) {
        if (!hasElement(id)) continue;
        setRangeValue(id, value);
    }
}

function setOptionalBoolean(ids, value) {
    if (typeof value !== "boolean") return;
    for (const id of ids) {
        if (!hasElement(id)) continue;
        setChecked(id, value);
    }
}

export function readViewSettings() {
    /** @type {Record<string, any>} */
    const settings = {};

    for (const [key, id] of Object.entries(VIEW_SETTING_CHECKBOXES)) {
        settings[key] = getChecked(id);
    }

    const craterElements = getMainLunarCraterControlElements();
    if (craterElements.panel || craterElements.visibleInput) {
        Object.assign(settings, readLunarCraterControlState(craterElements));
    }

    const activeCraftId = getSelectValue("active-craft-select", "");
    if (activeCraftId) {
        settings.activeCraftId = activeCraftId;
    }

    settings.orbitStyle = readOrbitStyle();
    settings.trailTrackBrightness2D = getRangeValue("trail-track-brightness-2d", 1);
    settings.trailTrackBrightness3D = getRangeValue("trail-track-brightness-3d", 1);
    settings.trailTailBrightness2D = getRangeValue("trail-tail-brightness-2d", 1);
    settings.trailTailBrightness3D = getRangeValue("trail-tail-brightness-3d", 1);

    const atmosphereEnabled = readOptionalBoolean(OPTIONAL_SKY_CHECKBOX_IDS.atmosphere_enabled);
    if (typeof atmosphereEnabled === "boolean") {
        settings.atmosphere_enabled = atmosphereEnabled;
    }

    for (const [key, ids] of Object.entries(OPTIONAL_SKY_RANGE_IDS)) {
        const value = readOptionalNumber(ids);
        if (!Number.isFinite(value)) continue;
        if (key === "sky_time_seconds") {
            settings.sky_time_ms = value * 1000;
        } else if (key !== "sky_time_ms" || !Number.isFinite(settings.sky_time_ms)) {
            settings[key] = value;
        }
    }

    return settings;
}

/**
 * Apply a partial update to the view settings checkboxes.
 * @param {Record<string, any>} patch - Partial settings object keyed like readViewSettings()
 */
export function applyViewSettings(patch) {
    if (!patch) return;

    for (const [key, value] of Object.entries(patch)) {
        const id = VIEW_SETTING_CHECKBOXES[key];
        if (!id) continue;
        setChecked(id, value);
    }

    if (
        Object.prototype.hasOwnProperty.call(patch, "viewCraters") ||
        Object.prototype.hasOwnProperty.call(patch, "viewLunarFeatures") ||
        Object.prototype.hasOwnProperty.call(patch, "viewLunarCraters") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarCraterShowAllEnabled") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarCraterHoverEnabled") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarCraterHoverLabels") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarCraterDisplayMode") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarFeatureTypeFilters") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarFeatureSearchQuery") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarFeatureExcludedKeys") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverTypeFilters") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverSearchQuery") ||
        Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverExcludedKeys") ||
        Number.isFinite(Number(patch.lunarCraterMinDiameterKm)) ||
        Number.isFinite(Number(patch.lunarCraterMaxDiameterKm)) ||
        Number.isFinite(Number(patch.lunarCraterHoverMinDiameterKm)) ||
        Number.isFinite(Number(patch.lunarCraterHoverMaxDiameterKm))
    ) {
        writeLunarCraterControlState(getMainLunarCraterControlElements(), patch);
    }

    const effectiveViewOrbit = Object.prototype.hasOwnProperty.call(patch, "viewOrbit")
        ? Boolean(patch.viewOrbit)
        : getChecked("view-orbit");
    syncOrbitStyleControlVisibility(effectiveViewOrbit);

    if (patch.orbitStyle === "classic" || patch.orbitStyle === "trail") {
        setChecked("orbit-style-classic", patch.orbitStyle === "classic");
        setChecked("orbit-style-trail", patch.orbitStyle === "trail");
        syncTrailStyleControlVisibility(patch.orbitStyle, effectiveViewOrbit);
    } else if (Object.prototype.hasOwnProperty.call(patch, "viewOrbit")) {
        syncTrailStyleControlVisibility(readOrbitStyle(), effectiveViewOrbit);
    }

    if (Number.isFinite(patch.trailTrackBrightness2D)) {
        setRangeValue("trail-track-brightness-2d", patch.trailTrackBrightness2D);
        setText("trail-track-brightness-2d-value", Number(patch.trailTrackBrightness2D).toFixed(2));
    }

    if (Number.isFinite(patch.trailTrackBrightness3D)) {
        setRangeValue("trail-track-brightness-3d", patch.trailTrackBrightness3D);
        setText("trail-track-brightness-3d-value", Number(patch.trailTrackBrightness3D).toFixed(2));
    }

    if (Number.isFinite(patch.trailTailBrightness2D)) {
        setRangeValue("trail-tail-brightness-2d", patch.trailTailBrightness2D);
        setText("trail-tail-brightness-2d-value", Number(patch.trailTailBrightness2D).toFixed(2));
    }

    if (Number.isFinite(patch.trailTailBrightness3D)) {
        setRangeValue("trail-tail-brightness-3d", patch.trailTailBrightness3D);
        setText("trail-tail-brightness-3d-value", Number(patch.trailTailBrightness3D).toFixed(2));
    }

    setOptionalBoolean(OPTIONAL_SKY_CHECKBOX_IDS.atmosphere_enabled, patch.atmosphere_enabled);
    setOptionalNumber(OPTIONAL_SKY_RANGE_IDS.bloom_strength, Number(patch.bloom_strength));
    setOptionalNumber(OPTIONAL_SKY_RANGE_IDS.star_size_scale, Number(patch.star_size_scale));
    setOptionalNumber(OPTIONAL_SKY_RANGE_IDS.extinction_strength, Number(patch.extinction_strength));
    setOptionalNumber(OPTIONAL_SKY_RANGE_IDS.twinkle_strength, Number(patch.twinkle_strength));
    setOptionalNumber(OPTIONAL_SKY_RANGE_IDS.observer_lat, Number(patch.observer_lat));
    setOptionalNumber(OPTIONAL_SKY_RANGE_IDS.observer_lon, Number(patch.observer_lon));
    setOptionalNumber(OPTIONAL_SKY_RANGE_IDS.sky_time_ms, Number(patch.sky_time_ms));
    if (Number.isFinite(Number(patch.sky_time_ms))) {
        setOptionalNumber(
            OPTIONAL_SKY_RANGE_IDS.sky_time_seconds,
            Number(patch.sky_time_ms) / 1000,
        );
    }
}

export function readCameraPositionMode() {
    return getSelectValue("camera-position", "manual");
}

export function readCameraLookMode() {
    return getSelectValue("camera-look", "manual");
}

export function applyCameraFromTo(patch) {
    // Projection accepts complete committed state; partial DOM merges used to
    // publish transient invalid pairs before runtime normalization.
    if (!patch?.positionMode || !patch?.lookMode) return;
    if (patch.positionMode) {
        setSelectValue("camera-position", patch.positionMode);
        setRadioGroupValue("camera-position-pill", patch.positionMode);
    }
    if (patch.lookMode) {
        setSelectValue("camera-look", patch.lookMode);
        setRadioGroupValue("camera-look-pill", patch.lookMode);
    }
    document.dispatchEvent(
        new CustomEvent("camera-from-to-ui-updated", {
            detail: {
                positionMode: patch.positionMode,
                lookMode: patch.lookMode,
            },
        }),
    );
}

