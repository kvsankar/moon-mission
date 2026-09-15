import {
    LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
    LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
    LUNAR_CRATER_DISPLAY_MODE_HOVER,
    normalizeLunarCraterDisplayMode,
    normalizeLunarCraterDiameterRange,
} from "../domain/lunar-crater-view.js";
import {
    createDefaultLunarFeatureViewState,
    normalizeLunarFeatureViewState,
    normalizeLunarFeatureTypeFilters,
} from "../domain/lunar-feature-view.js";

const VIEW_FLAG_KEYS = [
    "viewPhotoMode",
    "viewEarthClouds",
    "viewAuxiliaryPanels",
    "viewOrbit",
    "viewOrbitDescent",
    "viewCraters",
    "viewLunarCraters",
    "lunarCraterShowAllEnabled",
    "lunarCraterHoverEnabled",
    "viewMoonLatLonGrid",
    "viewMoonLatLonLabels",
    "viewMoonLatLonHover",
    "viewEarthLatLonGrid",
    "viewEarthLatLonLabels",
    "viewEarthLatLonHover",
    "viewEarthPoles",
    "viewMoonPoles",
    "viewEarthPolarAxes",
    "viewMoonPolarAxes",
    "lunarCraterHoverLabels",
    "viewXYZAxes",
    "viewPoles",
    "viewPolarAxes",
    "viewSky",
    "viewConstellationLines",
    "viewMoonSOI",
    "viewMoonHillSphere",
    "viewBodyHalos",
    "viewMoonOsculatingOrbit",
    "viewSubSolarEarth",
    "viewSubSolarMoon",
    "viewSubMoonEarth",
    "viewSolarGlintEarth",
    "viewLunarGlintEarth",
    "viewSubCraftEarth",
    "viewSubCraftMoon",
    "viewAntiSolarEarth",
    "viewAntiSolarMoon",
    "viewAntiMoonEarth",
    "viewAntiCraftEarth",
    "viewAntiCraftMoon",
    "viewEclipticPlane",
    "viewEquatorialPlane",
    "viewFPS",
];

const DEFAULT_VIEW_IDENTITY = Object.freeze({
    originMode: "geo",
    cameraPositionMode: "manual",
    cameraLookMode: "manual",
    planeSelection: "DEFAULT",
    dimension: "3D",
});
const PER_VIEW_FLAG_KEYS = Object.freeze([
    "viewCraters",
    "viewLunarCraters",
    "lunarCraterHoverLabels",
    "lunarCraterDisplayMode",
    "lunarCraterMinDiameterKm",
    "lunarCraterMaxDiameterKm",
    "lunarCraterHoverMinDiameterKm",
    "lunarCraterHoverMaxDiameterKm",
    "lunarFeatureTypeFilters",
    "lunarFeatureSearchQuery",
    "lunarFeatureExcludedKeys",
    "lunarFeatureHoverTypeFilters",
    "lunarFeatureHoverSearchQuery",
    "lunarFeatureHoverExcludedKeys",
]);

function normalizeString(value, fallback) {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized || fallback;
}

function normalizeViewIdentity(identity = {}) {
    return {
        originMode: normalizeString(identity.originMode ?? identity.config, DEFAULT_VIEW_IDENTITY.originMode),
        cameraPositionMode: normalizeString(identity.cameraPositionMode, DEFAULT_VIEW_IDENTITY.cameraPositionMode),
        cameraLookMode: normalizeString(identity.cameraLookMode, DEFAULT_VIEW_IDENTITY.cameraLookMode),
        planeSelection: normalizeString(identity.planeSelection, DEFAULT_VIEW_IDENTITY.planeSelection),
        dimension: normalizeString(identity.dimension, DEFAULT_VIEW_IDENTITY.dimension),
    };
}

function buildViewIdentityKey(identity = {}) {
    const normalized = normalizeViewIdentity(identity);
    return [
        `origin=${normalized.originMode}`,
        `camera=${normalized.cameraPositionMode}>${normalized.cameraLookMode}`,
        `plane=${normalized.planeSelection}`,
        `dimension=${normalized.dimension}`,
    ].join("|");
}

function buildDefaultViewFlags() {
    const lunarFeatureDefaults = createDefaultLunarFeatureViewState();
    return {
        viewPhotoMode: false,
        viewEarthClouds: true,
        viewAuxiliaryPanels: false,
        viewOrbit: true,
        viewOrbitDescent: true,
        viewCraters: lunarFeatureDefaults.viewCraters,
        viewLunarCraters: lunarFeatureDefaults.viewLunarCraters,
        lunarCraterShowAllEnabled: lunarFeatureDefaults.lunarCraterShowAllEnabled,
        lunarCraterHoverEnabled: lunarFeatureDefaults.lunarCraterHoverEnabled,
        viewMoonLatLonGrid: false,
        viewMoonLatLonLabels: true,
        viewMoonLatLonHover: false,
        viewEarthLatLonGrid: false,
        viewEarthLatLonLabels: true,
        viewEarthLatLonHover: false,
        viewEarthPoles: false,
        viewMoonPoles: false,
        viewEarthPolarAxes: false,
        viewMoonPolarAxes: false,
        lunarCraterHoverLabels: lunarFeatureDefaults.lunarCraterHoverLabels,
        lunarCraterDisplayMode: lunarFeatureDefaults.lunarCraterDisplayMode,
        lunarCraterMinDiameterKm: lunarFeatureDefaults.lunarCraterMinDiameterKm,
        lunarCraterMaxDiameterKm: lunarFeatureDefaults.lunarCraterMaxDiameterKm,
        lunarCraterHoverMinDiameterKm: lunarFeatureDefaults.lunarCraterHoverMinDiameterKm,
        lunarCraterHoverMaxDiameterKm: lunarFeatureDefaults.lunarCraterHoverMaxDiameterKm,
        lunarFeatureTypeFilters: lunarFeatureDefaults.lunarFeatureTypeFilters,
        lunarFeatureSearchQuery: lunarFeatureDefaults.lunarFeatureSearchQuery,
        lunarFeatureExcludedKeys: lunarFeatureDefaults.lunarFeatureExcludedKeys,
        lunarFeatureHoverTypeFilters: lunarFeatureDefaults.lunarFeatureHoverTypeFilters,
        lunarFeatureHoverSearchQuery: lunarFeatureDefaults.lunarFeatureHoverSearchQuery,
        lunarFeatureHoverExcludedKeys: lunarFeatureDefaults.lunarFeatureHoverExcludedKeys,
        viewXYZAxes: false,
        viewPoles: false,
        viewPolarAxes: false,
        viewSky: true,
        viewConstellationLines: false,
        viewMoonSOI: false,
        viewMoonHillSphere: false,
        viewBodyHalos: true,
        viewMoonOsculatingOrbit: true,
        viewSubSolarEarth: false,
        viewSubSolarMoon: false,
        viewSubMoonEarth: false,
        viewSolarGlintEarth: false,
        viewLunarGlintEarth: false,
        viewSubCraftEarth: false,
        viewSubCraftMoon: false,
        viewAntiSolarEarth: false,
        viewAntiSolarMoon: false,
        viewAntiMoonEarth: false,
        viewAntiCraftEarth: false,
        viewAntiCraftMoon: false,
        viewEclipticPlane: false,
        viewEquatorialPlane: false,
        viewFPS: true,
        orbitStyle: "trail",
        trailTrackBrightness2D: 1,
        trailTrackBrightness3D: 1,
        trailTailBrightness2D: 1,
        trailTailBrightness3D: 1,
    };
}

function applyViewFlagPatch(target, patch, options = {}) {
    if (!patch || typeof patch !== "object") return;
    const allowedKeys = options.allowedKeys
        ? new Set(options.allowedKeys)
        : null;
    const blockedKeys = options.blockedKeys
        ? new Set(options.blockedKeys)
        : null;
    const canApplyKey = (key) =>
        (!allowedKeys || allowedKeys.has(key)) &&
        (!blockedKeys || !blockedKeys.has(key));
    if (canApplyKey("viewLunarCraters") &&
        Object.prototype.hasOwnProperty.call(patch, "viewLunarFeatures")) {
        const enabled = Boolean(patch.viewLunarFeatures);
        target.viewLunarCraters = enabled;
    }
    if (canApplyKey("lunarFeatureTypeFilters") && Object.prototype.hasOwnProperty.call(patch, "lunarFeatureTypeFilters")) {
        target.lunarFeatureTypeFilters = normalizeLunarFeatureTypeFilters(
            patch.lunarFeatureTypeFilters,
            target.lunarFeatureTypeFilters,
        );
    }
    if (canApplyKey("lunarFeatureSearchQuery") && Object.prototype.hasOwnProperty.call(patch, "lunarFeatureSearchQuery")) {
        target.lunarFeatureSearchQuery = normalizeLunarFeatureViewState({
            lunarFeatureSearchQuery: patch.lunarFeatureSearchQuery,
        }, target).lunarFeatureSearchQuery;
    }
    if (canApplyKey("lunarFeatureExcludedKeys") && Object.prototype.hasOwnProperty.call(patch, "lunarFeatureExcludedKeys")) {
        target.lunarFeatureExcludedKeys = normalizeLunarFeatureViewState({
            lunarFeatureExcludedKeys: patch.lunarFeatureExcludedKeys,
        }, target).lunarFeatureExcludedKeys;
    }
    if (canApplyKey("lunarFeatureHoverTypeFilters") && Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverTypeFilters")) {
        target.lunarFeatureHoverTypeFilters = normalizeLunarFeatureTypeFilters(
            patch.lunarFeatureHoverTypeFilters,
            target.lunarFeatureHoverTypeFilters,
        );
    }
    if (canApplyKey("lunarFeatureHoverSearchQuery") && Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverSearchQuery")) {
        target.lunarFeatureHoverSearchQuery = normalizeLunarFeatureViewState({
            lunarFeatureHoverSearchQuery: patch.lunarFeatureHoverSearchQuery,
        }, target).lunarFeatureHoverSearchQuery;
    }
    if (canApplyKey("lunarFeatureHoverExcludedKeys") && Object.prototype.hasOwnProperty.call(patch, "lunarFeatureHoverExcludedKeys")) {
        target.lunarFeatureHoverExcludedKeys = normalizeLunarFeatureViewState({
            lunarFeatureHoverExcludedKeys: patch.lunarFeatureHoverExcludedKeys,
        }, target).lunarFeatureHoverExcludedKeys;
    }
    for (const key of VIEW_FLAG_KEYS) {
        if (canApplyKey(key) && Object.prototype.hasOwnProperty.call(patch, key)) {
            target[key] = Boolean(patch[key]);
        }
    }
    if (canApplyKey("viewPoles") && Object.prototype.hasOwnProperty.call(patch, "viewPoles")) {
        const value = Boolean(patch.viewPoles);
        if (canApplyKey("viewEarthPoles") && !Object.prototype.hasOwnProperty.call(patch, "viewEarthPoles")) {
            target.viewEarthPoles = value;
        }
        if (canApplyKey("viewMoonPoles") && !Object.prototype.hasOwnProperty.call(patch, "viewMoonPoles")) {
            target.viewMoonPoles = value;
        }
    }
    if (canApplyKey("viewPolarAxes") && Object.prototype.hasOwnProperty.call(patch, "viewPolarAxes")) {
        const value = Boolean(patch.viewPolarAxes);
        if (canApplyKey("viewEarthPolarAxes") && !Object.prototype.hasOwnProperty.call(patch, "viewEarthPolarAxes")) {
            target.viewEarthPolarAxes = value;
        }
        if (canApplyKey("viewMoonPolarAxes") && !Object.prototype.hasOwnProperty.call(patch, "viewMoonPolarAxes")) {
            target.viewMoonPolarAxes = value;
        }
    }
    if (canApplyKey("orbitStyle") && (patch.orbitStyle === "classic" || patch.orbitStyle === "trail")) {
        target.orbitStyle = patch.orbitStyle;
    }
    if (canApplyKey("trailTrackBrightness2D") && Number.isFinite(patch.trailTrackBrightness2D)) {
        target.trailTrackBrightness2D = patch.trailTrackBrightness2D;
    }
    if (canApplyKey("trailTrackBrightness3D") && Number.isFinite(patch.trailTrackBrightness3D)) {
        target.trailTrackBrightness3D = patch.trailTrackBrightness3D;
    }
    if (canApplyKey("trailTailBrightness2D") && Number.isFinite(patch.trailTailBrightness2D)) {
        target.trailTailBrightness2D = patch.trailTailBrightness2D;
    }
    if (canApplyKey("trailTailBrightness3D") && Number.isFinite(patch.trailTailBrightness3D)) {
        target.trailTailBrightness3D = patch.trailTailBrightness3D;
    }
    if (
        (canApplyKey("lunarCraterMinDiameterKm") || canApplyKey("lunarCraterMaxDiameterKm")) &&
        (
            Number.isFinite(Number(patch.lunarCraterMinDiameterKm)) ||
            Number.isFinite(Number(patch.lunarCraterMaxDiameterKm))
        )
    ) {
        const range = normalizeLunarCraterDiameterRange(patch, target);
        if (canApplyKey("lunarCraterMinDiameterKm")) {
            target.lunarCraterMinDiameterKm = range.lunarCraterMinDiameterKm;
        }
        if (canApplyKey("lunarCraterMaxDiameterKm")) {
            target.lunarCraterMaxDiameterKm = range.lunarCraterMaxDiameterKm;
        }
    }
    if (
        (canApplyKey("lunarCraterHoverMinDiameterKm") || canApplyKey("lunarCraterHoverMaxDiameterKm")) &&
        (
            Number.isFinite(Number(patch.lunarCraterHoverMinDiameterKm)) ||
            Number.isFinite(Number(patch.lunarCraterHoverMaxDiameterKm))
        )
    ) {
        const normalized = normalizeLunarFeatureViewState({
            ...target,
            lunarCraterHoverMinDiameterKm: patch.lunarCraterHoverMinDiameterKm,
            lunarCraterHoverMaxDiameterKm: patch.lunarCraterHoverMaxDiameterKm,
        }, target);
        if (canApplyKey("lunarCraterHoverMinDiameterKm")) {
            target.lunarCraterHoverMinDiameterKm = normalized.lunarCraterHoverMinDiameterKm;
        }
        if (canApplyKey("lunarCraterHoverMaxDiameterKm")) {
            target.lunarCraterHoverMaxDiameterKm = normalized.lunarCraterHoverMaxDiameterKm;
        }
    }
    if (canApplyKey("lunarCraterDisplayMode") && Object.prototype.hasOwnProperty.call(patch, "lunarCraterDisplayMode")) {
        target.lunarCraterDisplayMode = normalizeLunarCraterDisplayMode(patch.lunarCraterDisplayMode);
    }
    if (
        canApplyKey("viewLunarCraters") &&
        Object.prototype.hasOwnProperty.call(patch, "viewLunarCraters") &&
        !Object.prototype.hasOwnProperty.call(patch, "lunarCraterShowAllEnabled") &&
        !Object.prototype.hasOwnProperty.call(patch, "lunarCraterHoverEnabled")
    ) {
        if (patch.viewLunarCraters === true) {
            const mode = normalizeLunarCraterDisplayMode(target.lunarCraterDisplayMode);
            target.lunarCraterShowAllEnabled = mode === "always";
            target.lunarCraterHoverEnabled = mode === "hover" || (
                mode === "always" &&
                target.lunarCraterHoverLabels !== false
            );
        } else {
            target.lunarCraterShowAllEnabled = false;
            target.lunarCraterHoverEnabled = false;
        }
    }
}

function hasPerViewFlagPatch(patch) {
    return !!patch &&
        typeof patch === "object" &&
        PER_VIEW_FLAG_KEYS.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
}

function extractPerViewFlagPatch(patch) {
    const perViewPatch = {};
    if (!patch || typeof patch !== "object") return perViewPatch;
    for (const key of PER_VIEW_FLAG_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
            perViewPatch[key] = patch[key];
        }
    }
    return perViewPatch;
}

function mergeViewFlags(globalViewFlags, perViewFlags) {
    const merged = {
        ...globalViewFlags,
        ...perViewFlags,
    };
    return {
        ...merged,
        ...normalizeLunarFeatureViewState(merged),
    };
}

function createRuntimeViewState({
    initialConfig = undefined,
    initialCurrentDimension = "3D",
    initialPreviousDimension = null,
    initialDimensionChanged = false,
    initialViewFlags = undefined,
} = {}) {
    let config = initialConfig;
    let currentDimension = initialCurrentDimension;
    let transitionRevision = 0;
    let previousDimension = initialPreviousDimension;
    let dimensionChanged = Boolean(initialDimensionChanged);
    const viewFlags = buildDefaultViewFlags();
    applyViewFlagPatch(viewFlags, initialViewFlags);
    let currentViewIdentity = normalizeViewIdentity({
        originMode: initialConfig,
        dimension: initialCurrentDimension,
    });
    let currentViewIdentityKey = buildViewIdentityKey(currentViewIdentity);
    const perViewFlagsByIdentity = new Map();

    function ensurePerViewFlags(identityKey = currentViewIdentityKey) {
        if (!perViewFlagsByIdentity.has(identityKey)) {
            perViewFlagsByIdentity.set(identityKey, extractPerViewFlagPatch(viewFlags));
        }
        return perViewFlagsByIdentity.get(identityKey);
    }

    function getEffectiveViewFlags() {
        return mergeViewFlags(viewFlags, ensurePerViewFlags());
    }

    function setPerViewFlags(patch, identityKey = currentViewIdentityKey) {
        if (!hasPerViewFlagPatch(patch)) return;
        applyViewFlagPatch(
            ensurePerViewFlags(identityKey),
            patch,
            { allowedKeys: PER_VIEW_FLAG_KEYS },
        );
    }

    return {
        getConfig: () => config,
        setConfig: (value) => {
            if (value !== config) transitionRevision += 1;
            config = value;
        },
        getTransitionRevision: () => transitionRevision,
        getCurrentDimension: () => currentDimension,
        setCurrentDimension: (value) => {
            if (value !== currentDimension) transitionRevision += 1;
            currentDimension = value;
        },
        getPreviousDimension: () => previousDimension,
        setPreviousDimension: (value) => {
            previousDimension = value;
        },
        getDimensionChanged: () => dimensionChanged,
        setDimensionChanged: (value) => {
            dimensionChanged = Boolean(value);
        },
        getCurrentViewIdentity: () => ({ ...currentViewIdentity }),
        getCurrentViewIdentityKey: () => currentViewIdentityKey,
        setCurrentViewIdentity: (identity, options = {}) => {
            const nextIdentity = normalizeViewIdentity(identity);
            const nextIdentityKey = buildViewIdentityKey(nextIdentity);
            const previousIdentityKey = currentViewIdentityKey;
            if (options.previousViewFlags && previousIdentityKey) {
                setPerViewFlags(options.previousViewFlags, previousIdentityKey);
            }
            currentViewIdentity = nextIdentity;
            currentViewIdentityKey = nextIdentityKey;
            ensurePerViewFlags(nextIdentityKey);
            return {
                changed: previousIdentityKey !== nextIdentityKey,
                previousIdentityKey,
                currentIdentityKey: nextIdentityKey,
                viewFlags: getEffectiveViewFlags(),
            };
        },
        getViewFlags: () => ({ ...getEffectiveViewFlags() }),
        setViewFlags: (patch) => {
            applyViewFlagPatch(viewFlags, patch, { blockedKeys: PER_VIEW_FLAG_KEYS });
            setPerViewFlags(patch);
        },
        getViewOrbit: () => getEffectiveViewFlags().viewOrbit,
        setViewOrbit: (value) => {
            viewFlags.viewOrbit = Boolean(value);
        },
        getViewPhotoMode: () => getEffectiveViewFlags().viewPhotoMode,
        setViewPhotoMode: (value) => {
            viewFlags.viewPhotoMode = Boolean(value);
        },
        getViewEarthClouds: () => getEffectiveViewFlags().viewEarthClouds,
        setViewEarthClouds: (value) => {
            viewFlags.viewEarthClouds = Boolean(value);
        },
        getViewAuxiliaryPanels: () => getEffectiveViewFlags().viewAuxiliaryPanels,
        setViewAuxiliaryPanels: (value) => {
            viewFlags.viewAuxiliaryPanels = Boolean(value);
        },
        getViewOrbitDescent: () => getEffectiveViewFlags().viewOrbitDescent,
        setViewOrbitDescent: (value) => {
            viewFlags.viewOrbitDescent = Boolean(value);
        },
        getViewCraters: () => getEffectiveViewFlags().viewCraters,
        setViewCraters: (value) => {
            setPerViewFlags({ viewCraters: value });
        },
        getViewLunarFeatures: () => getEffectiveViewFlags().viewLunarFeatures === true,
        setViewLunarFeatures: (value) => {
            const enabled = Boolean(value);
            setPerViewFlags({
                viewLunarCraters: enabled,
            });
        },
        getViewLunarCraters: () => getEffectiveViewFlags().viewLunarCraters,
        setViewLunarCraters: (value) => {
            setPerViewFlags({ viewLunarCraters: value });
        },
        getLunarCraterShowAllEnabled: () => getEffectiveViewFlags().lunarCraterShowAllEnabled,
        setLunarCraterShowAllEnabled: (value) => {
            setPerViewFlags({ lunarCraterShowAllEnabled: value });
        },
        getLunarCraterHoverEnabled: () => getEffectiveViewFlags().lunarCraterHoverEnabled,
        setLunarCraterHoverEnabled: (value) => {
            setPerViewFlags({ lunarCraterHoverEnabled: value });
        },
        getViewMoonLatLonGrid: () => getEffectiveViewFlags().viewMoonLatLonGrid,
        setViewMoonLatLonGrid: (value) => {
            viewFlags.viewMoonLatLonGrid = Boolean(value);
        },
        getViewMoonLatLonLabels: () => getEffectiveViewFlags().viewMoonLatLonLabels,
        setViewMoonLatLonLabels: (value) => {
            viewFlags.viewMoonLatLonLabels = Boolean(value);
        },
        getViewMoonLatLonHover: () => getEffectiveViewFlags().viewMoonLatLonHover,
        setViewMoonLatLonHover: (value) => {
            viewFlags.viewMoonLatLonHover = Boolean(value);
        },
        getViewEarthLatLonGrid: () => getEffectiveViewFlags().viewEarthLatLonGrid,
        setViewEarthLatLonGrid: (value) => {
            viewFlags.viewEarthLatLonGrid = Boolean(value);
        },
        getViewEarthLatLonLabels: () => getEffectiveViewFlags().viewEarthLatLonLabels,
        setViewEarthLatLonLabels: (value) => {
            viewFlags.viewEarthLatLonLabels = Boolean(value);
        },
        getViewEarthLatLonHover: () => getEffectiveViewFlags().viewEarthLatLonHover,
        setViewEarthLatLonHover: (value) => {
            viewFlags.viewEarthLatLonHover = Boolean(value);
        },
        getLunarFeatureTypeFilters: () => normalizeLunarFeatureTypeFilters(
            getEffectiveViewFlags().lunarFeatureTypeFilters,
            viewFlags.lunarFeatureTypeFilters,
        ),
        setLunarFeatureTypeFilters: (value) => {
            setPerViewFlags({ lunarFeatureTypeFilters: value });
        },
        getLunarFeatureSearchQuery: () => getEffectiveViewFlags().lunarFeatureSearchQuery || "",
        setLunarFeatureSearchQuery: (value) => {
            setPerViewFlags({ lunarFeatureSearchQuery: value });
        },
        getLunarFeatureExcludedKeys: () => getEffectiveViewFlags().lunarFeatureExcludedKeys || [],
        setLunarFeatureExcludedKeys: (value) => {
            setPerViewFlags({ lunarFeatureExcludedKeys: value });
        },
        getLunarCraterHoverLabels: () => getEffectiveViewFlags().lunarCraterHoverLabels,
        setLunarCraterHoverLabels: (value) => {
            setPerViewFlags({ lunarCraterHoverLabels: value });
        },
        getLunarCraterDisplayMode: () => normalizeLunarCraterDisplayMode(getEffectiveViewFlags().lunarCraterDisplayMode),
        setLunarCraterDisplayMode: (value) => {
            setPerViewFlags({ lunarCraterDisplayMode: value });
        },
        getLunarCraterMinDiameterKm: () =>
            getEffectiveViewFlags().lunarCraterMinDiameterKm ?? LUNAR_CRATER_DEFAULT_MIN_DIAMETER_KM,
        setLunarCraterMinDiameterKm: (value) => {
            setPerViewFlags({ lunarCraterMinDiameterKm: value });
        },
        getLunarCraterMaxDiameterKm: () =>
            getEffectiveViewFlags().lunarCraterMaxDiameterKm ?? LUNAR_CRATER_DEFAULT_MAX_DIAMETER_KM,
        setLunarCraterMaxDiameterKm: (value) => {
            setPerViewFlags({ lunarCraterMaxDiameterKm: value });
        },
        getLunarCraterHoverMinDiameterKm: () => getEffectiveViewFlags().lunarCraterHoverMinDiameterKm,
        setLunarCraterHoverMinDiameterKm: (value) => {
            setPerViewFlags({ lunarCraterHoverMinDiameterKm: value });
        },
        getLunarCraterHoverMaxDiameterKm: () => getEffectiveViewFlags().lunarCraterHoverMaxDiameterKm,
        setLunarCraterHoverMaxDiameterKm: (value) => {
            setPerViewFlags({ lunarCraterHoverMaxDiameterKm: value });
        },
        getLunarFeatureHoverTypeFilters: () => normalizeLunarFeatureTypeFilters(
            getEffectiveViewFlags().lunarFeatureHoverTypeFilters,
            viewFlags.lunarFeatureHoverTypeFilters,
        ),
        setLunarFeatureHoverTypeFilters: (value) => {
            setPerViewFlags({ lunarFeatureHoverTypeFilters: value });
        },
        getLunarFeatureHoverSearchQuery: () => getEffectiveViewFlags().lunarFeatureHoverSearchQuery || "",
        setLunarFeatureHoverSearchQuery: (value) => {
            setPerViewFlags({ lunarFeatureHoverSearchQuery: value });
        },
        getLunarFeatureHoverExcludedKeys: () => getEffectiveViewFlags().lunarFeatureHoverExcludedKeys || [],
        setLunarFeatureHoverExcludedKeys: (value) => {
            setPerViewFlags({ lunarFeatureHoverExcludedKeys: value });
        },
        getViewXYZAxes: () => getEffectiveViewFlags().viewXYZAxes,
        setViewXYZAxes: (value) => {
            viewFlags.viewXYZAxes = Boolean(value);
        },
        getViewEarthPoles: () => getEffectiveViewFlags().viewEarthPoles,
        setViewEarthPoles: (value) => {
            viewFlags.viewEarthPoles = Boolean(value);
            viewFlags.viewPoles = viewFlags.viewEarthPoles && viewFlags.viewMoonPoles;
        },
        getViewMoonPoles: () => getEffectiveViewFlags().viewMoonPoles,
        setViewMoonPoles: (value) => {
            viewFlags.viewMoonPoles = Boolean(value);
            viewFlags.viewPoles = viewFlags.viewEarthPoles && viewFlags.viewMoonPoles;
        },
        getViewEarthPolarAxes: () => getEffectiveViewFlags().viewEarthPolarAxes,
        setViewEarthPolarAxes: (value) => {
            viewFlags.viewEarthPolarAxes = Boolean(value);
            viewFlags.viewPolarAxes = viewFlags.viewEarthPolarAxes && viewFlags.viewMoonPolarAxes;
        },
        getViewMoonPolarAxes: () => getEffectiveViewFlags().viewMoonPolarAxes,
        setViewMoonPolarAxes: (value) => {
            viewFlags.viewMoonPolarAxes = Boolean(value);
            viewFlags.viewPolarAxes = viewFlags.viewEarthPolarAxes && viewFlags.viewMoonPolarAxes;
        },
        getViewPoles: () => getEffectiveViewFlags().viewEarthPoles && getEffectiveViewFlags().viewMoonPoles,
        setViewPoles: (value) => {
            const enabled = Boolean(value);
            viewFlags.viewPoles = enabled;
            viewFlags.viewEarthPoles = enabled;
            viewFlags.viewMoonPoles = enabled;
        },
        getViewPolarAxes: () => getEffectiveViewFlags().viewEarthPolarAxes && getEffectiveViewFlags().viewMoonPolarAxes,
        setViewPolarAxes: (value) => {
            const enabled = Boolean(value);
            viewFlags.viewPolarAxes = enabled;
            viewFlags.viewEarthPolarAxes = enabled;
            viewFlags.viewMoonPolarAxes = enabled;
        },
        getViewSky: () => getEffectiveViewFlags().viewSky,
        setViewSky: (value) => {
            viewFlags.viewSky = Boolean(value);
        },
        getViewConstellationLines: () => getEffectiveViewFlags().viewConstellationLines,
        setViewConstellationLines: (value) => {
            viewFlags.viewConstellationLines = Boolean(value);
        },
        getViewMoonSOI: () => getEffectiveViewFlags().viewMoonSOI,
        setViewMoonSOI: (value) => {
            viewFlags.viewMoonSOI = Boolean(value);
        },
        getViewMoonHillSphere: () => getEffectiveViewFlags().viewMoonHillSphere,
        setViewMoonHillSphere: (value) => {
            viewFlags.viewMoonHillSphere = Boolean(value);
        },
        getViewBodyHalos: () => getEffectiveViewFlags().viewBodyHalos,
        setViewBodyHalos: (value) => {
            viewFlags.viewBodyHalos = Boolean(value);
        },
        getViewMoonOsculatingOrbit: () => getEffectiveViewFlags().viewMoonOsculatingOrbit,
        setViewMoonOsculatingOrbit: (value) => {
            viewFlags.viewMoonOsculatingOrbit = Boolean(value);
        },
        getViewSubSolarEarth: () => getEffectiveViewFlags().viewSubSolarEarth,
        setViewSubSolarEarth: (value) => {
            viewFlags.viewSubSolarEarth = Boolean(value);
        },
        getViewSubSolarMoon: () => getEffectiveViewFlags().viewSubSolarMoon,
        setViewSubSolarMoon: (value) => {
            viewFlags.viewSubSolarMoon = Boolean(value);
        },
        getViewSubMoonEarth: () => getEffectiveViewFlags().viewSubMoonEarth,
        setViewSubMoonEarth: (value) => {
            viewFlags.viewSubMoonEarth = Boolean(value);
        },
        getViewSolarGlintEarth: () => getEffectiveViewFlags().viewSolarGlintEarth,
        setViewSolarGlintEarth: (value) => {
            viewFlags.viewSolarGlintEarth = Boolean(value);
        },
        getViewLunarGlintEarth: () => getEffectiveViewFlags().viewLunarGlintEarth,
        setViewLunarGlintEarth: (value) => {
            viewFlags.viewLunarGlintEarth = Boolean(value);
        },
        getViewSubCraftEarth: () => getEffectiveViewFlags().viewSubCraftEarth,
        setViewSubCraftEarth: (value) => {
            viewFlags.viewSubCraftEarth = Boolean(value);
        },
        getViewSubCraftMoon: () => getEffectiveViewFlags().viewSubCraftMoon,
        setViewSubCraftMoon: (value) => {
            viewFlags.viewSubCraftMoon = Boolean(value);
        },
        getViewAntiSolarEarth: () => getEffectiveViewFlags().viewAntiSolarEarth,
        setViewAntiSolarEarth: (value) => {
            viewFlags.viewAntiSolarEarth = Boolean(value);
        },
        getViewAntiSolarMoon: () => getEffectiveViewFlags().viewAntiSolarMoon,
        setViewAntiSolarMoon: (value) => {
            viewFlags.viewAntiSolarMoon = Boolean(value);
        },
        getViewAntiMoonEarth: () => getEffectiveViewFlags().viewAntiMoonEarth,
        setViewAntiMoonEarth: (value) => {
            viewFlags.viewAntiMoonEarth = Boolean(value);
        },
        getViewAntiCraftEarth: () => getEffectiveViewFlags().viewAntiCraftEarth,
        setViewAntiCraftEarth: (value) => {
            viewFlags.viewAntiCraftEarth = Boolean(value);
        },
        getViewAntiCraftMoon: () => getEffectiveViewFlags().viewAntiCraftMoon,
        setViewAntiCraftMoon: (value) => {
            viewFlags.viewAntiCraftMoon = Boolean(value);
        },
        getViewEclipticPlane: () => getEffectiveViewFlags().viewEclipticPlane,
        setViewEclipticPlane: (value) => {
            viewFlags.viewEclipticPlane = Boolean(value);
        },
        getViewEquatorialPlane: () => getEffectiveViewFlags().viewEquatorialPlane,
        setViewEquatorialPlane: (value) => {
            viewFlags.viewEquatorialPlane = Boolean(value);
        },
        getViewFPS: () => getEffectiveViewFlags().viewFPS,
        setViewFPS: (value) => {
            viewFlags.viewFPS = Boolean(value);
        },
        getOrbitStyle: () => getEffectiveViewFlags().orbitStyle || "classic",
        setOrbitStyle: (value) => {
            viewFlags.orbitStyle = value === "trail" ? "trail" : "classic";
        },
        getTrailTrackBrightness2D: () => getEffectiveViewFlags().trailTrackBrightness2D ?? 1,
        setTrailTrackBrightness2D: (value) => {
            viewFlags.trailTrackBrightness2D = Number.isFinite(value) ? value : 1;
        },
        getTrailTrackBrightness3D: () => getEffectiveViewFlags().trailTrackBrightness3D ?? 1,
        setTrailTrackBrightness3D: (value) => {
            viewFlags.trailTrackBrightness3D = Number.isFinite(value) ? value : 1;
        },
        getTrailTailBrightness2D: () => getEffectiveViewFlags().trailTailBrightness2D ?? 1,
        setTrailTailBrightness2D: (value) => {
            viewFlags.trailTailBrightness2D = Number.isFinite(value) ? value : 1;
        },
        getTrailTailBrightness3D: () => getEffectiveViewFlags().trailTailBrightness3D ?? 1,
        setTrailTailBrightness3D: (value) => {
            viewFlags.trailTailBrightness3D = Number.isFinite(value) ? value : 1;
        },
    };
}

export { buildViewIdentityKey, createRuntimeViewState, normalizeViewIdentity };


