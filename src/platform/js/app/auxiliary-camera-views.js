import { HIPPARCOS_VMAG6_CATALOG as COMPOSER_STAR_LABEL_CATALOG } from "../rendering/star-catalog-hipparcos.js";
import { STAR_NAME_CROSS_INDEX } from "../rendering/star-name-cross-index.js";
import {
    registerMissionPanel,
    unregisterMissionPanel,
    updateMissionPanel,
} from "./panel-registry.js";
import { showMissionPanelInfo } from "./panel-info-popover.js";
import {
    readMissionPanelState,
    writeMissionPanelStates,
} from "./panel-layout-store.js";
import {
    getMissionPanelDefaultState,
    getMissionPanelLayoutPresetVersion,
    isMissionPanelEnabled,
    normalizeMissionPanelState,
} from "./panel-defaults.js";
import {
    clampFovDegrees,
} from "./fov-slider-scale.js";
import { mountMissionFovControl } from "./mission-fov-control.js";
import { bringPanelElementToFront } from "./panel-z-order.js";
import {
    configureBodyRenderLayers,
    configureCraftRenderLayers,
    configureSkyRenderLayers,
} from "./scene-render-layers.js";
import { computePhotoModeLightingPresentation } from "../core/domain/flyby-lighting-presentation.js";
import { LIGHT_SETTINGS as LT } from "../core/constants.js";
import {
    buildTimelinePhases,
    resolveActiveTimelinePhaseIndex,
} from "../core/domain/timeline-phases.js";
import { resolveTimelineEventHighlightState } from "../core/domain/timeline-event-highlight-state.js";
import {
    selectSkyLabelCandidates,
} from "../core/domain/sky-label-selection.js";
import {
    resolveStarDisplayName,
} from "../core/domain/star-display-names.js";
import { inferMediaShotViewHint } from "../core/domain/media-shot-view.js";
import {
    resolveComposerViewIntent,
} from "../core/domain/composer-view-state.js";
import {
    applyPhotoModeBodyPresentation,
    applyPhotoModeExposure,
    resolvePhotoModeLightingPresentation,
} from "./photo-mode-render-presentation.js";
import {
    isDomElement,
    isDomEventInstance,
    isDomInstance,
} from "../ui/dom-helpers.js";
import {
    LUNAR_CRATER_VIEW_IDS,
} from "../core/domain/lunar-crater-view.js";
import {
    createDefaultLunarFeatureViewState,
} from "../core/domain/lunar-feature-view.js";
import {
    resolveLunarFeatureMentionView,
} from "../core/domain/lunar-feature-mention-timeline.js";
import {
    loadLunarFeatureMentionTimeline,
} from "../data/lunar-feature-mentions.js";
import {
    createDefaultSurfacePointViewState,
    hasSurfacePointViewEnabled,
    patchSurfacePointViewState,
} from "../core/domain/surface-point-view-state.js";
import {
    createLunarCraterControlPanelElements,
} from "../ui/lunar-crater-control-panel.js";
import {
    createLunarFeatureViewAttachment,
    shouldRenderLunarFeaturePointer,
} from "./lunar-feature-view-attachment.js";
import { renderWithLunarCraterView } from "./lunar-crater-view-renderer.js";
import { renderWithSurfacePointView } from "./surface-point-view-renderer.js";
import { getSceneVisibleCraftIds } from "./scene-craft-helpers.js";
import {
    getDockviewSpikeLayoutHost,
    resolveDockedWorkflowPanelPosition,
} from "./dockview-workflow-panels.js";

const PANEL_SPECS = Object.freeze([
    {
        id: "earth",
        title: "Craft \u2192 Earth",
        chipLabel: "Craft \u2192 Earth",
        anchorKey: "craft",
        targetKey: "earth",
        infoMode: "none",
        defaultFov: 45,
    },
    {
        id: "moon",
        title: "Craft \u2192 Moon",
        chipLabel: "Craft \u2192 Moon",
        anchorKey: "craft",
        targetKey: "moon",
        infoMode: "moon-visibility",
        defaultFov: 45,
    },
    {
        id: "earth-to-moon",
        title: "Earth \u2192 Moon",
        chipLabel: "Earth \u2192 Moon",
        anchorKey: "earth",
        targetKey: "moon",
        infoMode: "moon-phase",
        defaultFov: 45,
    },
    {
        id: "earth-origin-orbit-xy",
        title: "Orbit",
        chipLabel: "Orbit",
        anchorKey: "earth",
        targetKey: "craft",
        infoMode: "orbit-xy",
        mode: "orbit-xy",
        defaultFov: 45,
    },
    {
        id: "earth-rise-composer",
        title: "Frame and Shoot",
        chipLabel: "Frame and Shoot",
        anchorKey: "craft",
        targetKey: "moon",
        infoMode: "none",
        mode: "composer",
        side: "left",
        defaultFov: 50,
    },
]);
const COMPOSER_CONTROLS_PANEL_ID = "aux:earth-rise-composer-controls";

const AUXILIARY_VIEW_CAMERA_PRESETS = Object.freeze(
    PANEL_SPECS
        .filter((spec) => !spec.mode)
        .map((spec) => ({
            id: spec.id,
            label: spec.title,
            positionMode: spec.anchorKey === "craft" ? "spacecraft" : spec.anchorKey,
            lookMode: spec.targetKey,
        })),
);

const PANEL_GAP_PX = 8;
const PANEL_MARGIN_PX = 8;
const PANEL_TOP_OFFSET_PX = 38;
const PANEL_ABOUT_ALIGNED_MIN_VIEWPORT_WIDTH = 1600;
const PANEL_CSS_MIN_SIDE_DEFAULT = 160;
const PANEL_DEFAULT_HEIGHT_RATIO = 0.24;
const PANEL_DEFAULT_WIDTH_COMPOSER = 672;
const PANEL_DEFAULT_HEIGHT_RATIO_COMPOSER = 0.6;
const PANEL_MIN_SIDE_DEFAULT = 120;
const PANEL_MIN_SIDE_COMPOSER = 300;
const STARTUP_MINIMIZED_PANEL_IDS = new Set(["moon", "earth-to-moon"]);
const COMPOSER_DEFAULT_ASPECT_RATIO = 16 / 9;
const AUTO_FOV_MARGIN_SCALE = 1.03;
const AUTO_FOV_MIN_DEGREES = 0.1;
const AUTO_FOV_MAX_DEGREES = 179;
const TARGET_AUTO_FOV_MIN_DEGREES = 3;
const MOON_TARGET_AUTO_FOV_MIN_DEGREES = 1.5;
const TARGET_AUTO_FOV_MAX_DEGREES = 70;
const COMPOSER_AUTO_FOV_MIN_DEGREES = AUTO_FOV_MIN_DEGREES;
const COMPOSER_AUTO_FOV_MAX_DEGREES = 120;
const COMPOSER_MANUAL_FOV_MAX_DEGREES = AUTO_FOV_MAX_DEGREES;
const PANEL_STATE_STORAGE_KEY = "moon-mission:aux-camera-panels:v1";
const AUX_FOV_PREFERENCE_VERSION = 2;
const COMPOSER_DRAG_SENSITIVITY = 0.00055;
const COMPOSER_DRAG_REFERENCE_FOV_DEGREES = 50;
const COMPOSER_WHEEL_ZOOM_SENSITIVITY = 0.00022;
const AUXILIARY_WHEEL_ZOOM_SENSITIVITY = COMPOSER_WHEEL_ZOOM_SENSITIVITY;
const ORBIT_XY_WHEEL_ZOOM_SENSITIVITY = 0.001;
const ORBIT_XY_AUTO_FOV_DEGREES = 45;
const COMPOSER_MAX_PITCH_RAD = (Math.PI * 0.5) - 0.02;
const COMPOSER_TIMELINE_WINDOW_MS = 2 * 60 * 60 * 1000;
const COMPOSER_FLYBY_WINDOW_PADDING_MS = 5 * 60 * 1000;
const COMPOSER_TIMELINE_RESOLUTION = 1000;
const COMPOSER_LUNAR_FEATURE_STACK_VISIBLE_WINDOW_SECONDS = 5 * 60;
const COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_LEAD_SECONDS = 10;
const COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_TRAIL_SECONDS = 20;
const COMPOSER_DEFAULT_EARTH_AMBIENT = 0.0;
const COMPOSER_DEFAULT_MOON_AMBIENT = 0.0;
const COMPOSER_DEFAULT_EARTHSHINE_GAIN = 1.0;
const COMPOSER_DEFAULT_MOONSHINE_GAIN = 1.0;
const COMPOSER_MIN_AMBIENT = 0;
const COMPOSER_MAX_AMBIENT = 2.4;
const COMPOSER_MIN_EARTHSHINE_GAIN = 0;
const COMPOSER_MAX_EARTHSHINE_GAIN = 2.4;
const COMPOSER_MIN_MOONSHINE_GAIN = 0;
const COMPOSER_MAX_MOONSHINE_GAIN = 2.4;
const COMPOSER_MOON_SHADOW_LIFT_SCALE = 0.18;
const COMPOSER_MOONSHINE_LIFT_SCALE =
    0.65 * LT.MOONSHINE_TO_EARTHSHINE_INTENSITY_RATIO;
const COMPOSER_MOON_OUTLINE_THICKNESS_PX = 1.2;
const COMPOSER_MOON_OUTLINE_RGBA = "rgba(199, 214, 236, 0.78)";
const COMPOSER_CONTROLS_COLLAPSE_STATE_VERSION = 1;
const COMPOSER_AUTO_FOV_PREFERENCE_VERSION = 1;
const COMPOSER_DEFAULT_ROLL_RAD = 0;
const COMPOSER_RENDER_EXPOSURE = 1.0;
const COMPOSER_SKY_STARMAP_OPACITY_CAP = 0.05;
const COMPOSER_SKY_CONSTELLATION_OPACITY_CAP = 0.0;
const COMPOSER_CAMERA_EXPOSURE = 0.98;
const COMPOSER_EXPOSURE_EV_MIN = -16;
const COMPOSER_EXPOSURE_EV_MAX = 16;
const COMPOSER_EXPOSURE_EV_DEFAULT = 0;
const COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV = 5;
const COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP = 0.03;
const COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP = 0.0;
const COMPOSER_CONSTELLATION_LINES_OPACITY_CAP = 0.06;
const COMPOSER_OPTICS_STRENGTH_MIN = 0;
const COMPOSER_OPTICS_STRENGTH_MAX = 2.4;
const COMPOSER_OPTICS_STRENGTH_DEFAULT = 1.0;
const COMPOSER_OPTICS_ADVANCED_MIN = 0;
const COMPOSER_OPTICS_ADVANCED_MAX = 2.5;
const COMPOSER_OPTICS_ADVANCED_DEFAULT = 1.0;
const COMPOSER_ECLIPSE_CORONA_MIN = 0;
const COMPOSER_ECLIPSE_CORONA_MAX = 2.5;
const COMPOSER_ECLIPSE_CORONA_DEFAULT = 1.0;
const COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT = 0.0;
const COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT = 0.85;
const COMPOSER_SOLAR_ANGULAR_RADIUS_RAD = (0.533 * Math.PI / 180) * 0.5;
const COMPOSER_STAR_MAGNITUDE_MIN = -3;
const COMPOSER_STAR_MAGNITUDE_MAX = 6;
const COMPOSER_STAR_MAGNITUDE_DEFAULT = 6;
const COMPOSER_RA_DEC_GRID_RA_STEP_DEG = 30;
const COMPOSER_RA_DEC_GRID_DEC_STEP_DEG = 15;
const COMPOSER_SKY_LABEL_VISIBLE_FRACTION = 0.2;
const COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT = 36;
const COMPOSER_SKY_LABEL_EDGE_MARGIN_PX = 10;
const COMPOSER_SKY_LABEL_OCCLUSION_PADDING_PX = 2;
const COMPOSER_SEE_THROUGH_DASH_PX = Object.freeze([3, 3]);
const COMPOSER_SEE_THROUGH_LINE_WIDTH_PX = 1.4;
const COMPOSER_SEE_THROUGH_PLANET_RADIUS_MIN_PX = 3.2;
const COMPOSER_SEE_THROUGH_PLANET_RADIUS_MAX_PX = 8.8;
const COMPOSER_SEE_THROUGH_SUN_RADIUS_MIN_PX = 5.2;
const COMPOSER_SEE_THROUGH_OPACITY = 0.9;
const COMPOSER_SURFACE_POINT_CONTROL_GROUPS = Object.freeze([
    {
        label: "Sun on Earth",
        options: [
            { key: "viewSubSolarEarth", label: "Sub-Solar", color: "solar" },
            { key: "viewSolarGlintEarth", label: "Glint", color: "solar" },
        ],
    },
    {
        label: "Moon on Earth",
        options: [
            { key: "viewSubMoonEarth", label: "Sub-Moon", color: "moon" },
            { key: "viewLunarGlintEarth", label: "Glint", color: "moon" },
        ],
    },
    {
        label: "Craft on Earth",
        options: [
            { key: "viewSubCraftEarth", label: "Sub-Craft", color: "craft" },
        ],
    },
]);
const COMPOSER_PLANET_MAGNITUDE_BY_BODY = Object.freeze({
    Mercury: -1.9,
    Venus: -4.4,
    Earth: -3.9,
    Mars: -2.0,
    Jupiter: -2.7,
    Saturn: 0.5,
    Uranus: 5.7,
    Neptune: 7.8,
});
const COMPOSER_CONSTELLATION_LABELS = Object.freeze([
    { name: "Andromeda", raDeg: 10.5, decDeg: 37 },
    { name: "Aquila", raDeg: 295.5, decDeg: 5 },
    { name: "Aquarius", raDeg: 336, decDeg: -10 },
    { name: "Aries", raDeg: 37.5, decDeg: 20 },
    { name: "Auriga", raDeg: 87, decDeg: 40 },
    { name: "Bootes", raDeg: 217.5, decDeg: 30 },
    { name: "Cancer", raDeg: 130.5, decDeg: 20 },
    { name: "Canis Major", raDeg: 101.25, decDeg: -25 },
    { name: "Canis Minor", raDeg: 112.5, decDeg: 5 },
    { name: "Capricornus", raDeg: 315, decDeg: -20 },
    { name: "Carina", raDeg: 130.5, decDeg: -60 },
    { name: "Cassiopeia", raDeg: 15, decDeg: 60 },
    { name: "Centaurus", raDeg: 198.75, decDeg: -47 },
    { name: "Corona Borealis", raDeg: 237, decDeg: 30 },
    { name: "Corvus", raDeg: 186, decDeg: -18 },
    { name: "Crater", raDeg: 171, decDeg: -15 },
    { name: "Crux", raDeg: 187.5, decDeg: -60 },
    { name: "Cygnus", raDeg: 307.5, decDeg: 40 },
    { name: "Draco", raDeg: 262.5, decDeg: 65 },
    { name: "Gemini", raDeg: 105, decDeg: 25 },
    { name: "Hydra", raDeg: 157.5, decDeg: -20 },
    { name: "Leo", raDeg: 157.5, decDeg: 15 },
    { name: "Libra", raDeg: 228, decDeg: -15 },
    { name: "Lyra", raDeg: 282, decDeg: 35 },
    { name: "Ophiuchus", raDeg: 258, decDeg: -5 },
    { name: "Orion", raDeg: 84, decDeg: 0 },
    { name: "Pegasus", raDeg: 337.5, decDeg: 20 },
    { name: "Perseus", raDeg: 49.5, decDeg: 45 },
    { name: "Pisces", raDeg: 7.5, decDeg: 10 },
    { name: "Sagittarius", raDeg: 285, decDeg: -25 },
    { name: "Scorpius", raDeg: 247.5, decDeg: -30 },
    { name: "Taurus", raDeg: 67.5, decDeg: 18 },
    { name: "Triangulum", raDeg: 30, decDeg: 30 },
    { name: "Ursa Major", raDeg: 165, decDeg: 55 },
    { name: "Ursa Minor", raDeg: 225, decDeg: 75 },
    { name: "Vela", raDeg: 142.5, decDeg: -45 },
    { name: "Virgo", raDeg: 198, decDeg: 0 },
]);
const COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION = 0.5;
const COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION = 0.34;
const KM_TO_MILES = 0.621371192237334;
const FLYBY_EVENT_PILL_SPECS = Object.freeze([
    {
        id: "lunarSoiEntry",
        title: "Lunar SOI In",
        matchKeys: ["lunarsoientry", "lunarsoiin", "moonsoientry", "moonsoiin"],
        matchLabels: ["lunar soi in", "lunar soi entry", "moon soi in", "moon soi entry"],
    },
    {
        id: "earthSet",
        title: "Earthset",
        matchKeys: ["earthset", "earth_set"],
        matchLabels: ["earthset", "earth set"],
    },
    {
        id: "closestApproach",
        title: "Closest Approach",
        matchKeys: ["closestapproach", "closest_approach", "lunarflyby", "lunar_flyby"],
        matchLabels: ["closest approach", "lunar flyby", "flyby"],
    },
    {
        id: "maxDistanceEarth",
        title: "Max Distance",
        matchKeys: ["maxdistanceearth", "max_distance_earth", "maxdistance"],
        matchLabels: ["max distance"],
    },
    {
        id: "earthRise",
        title: "Earthrise",
        matchKeys: ["earthrise", "earth_rise"],
        matchLabels: ["earthrise", "earth rise"],
    },
    {
        id: "eclipseStart",
        title: "Eclipse Start",
        matchKeys: ["eclipsestart", "eclipse_start", "eclipsein", "eclipse_in"],
        matchLabels: ["eclipse in", "eclipse start", "enters solar eclipse"],
    },
    {
        id: "eclipseEnd",
        title: "Eclipse End",
        matchKeys: ["eclipseend", "eclipse_end", "eclipseout", "eclipse_out"],
        matchLabels: ["eclipse out", "eclipse end", "exits solar eclipse"],
    },
    {
        id: "lunarSoiExit",
        title: "Lunar SOI Out",
        matchKeys: ["lunarsoiexit", "lunarsoiout", "moonsoiexit", "moonsoiout"],
        matchLabels: ["lunar soi out", "lunar soi exit", "moon soi out", "moon soi exit"],
    },
]);

function normalizeComposerRollRad(rollRad) {
    if (!Number.isFinite(rollRad)) {
        return 0;
    }
    return ((rollRad % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
}

function isFiniteScreenPoint(point) {
    return Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y));
}

function isComposerSkyLabelPointOccluded(point, occluders = []) {
    if (!isFiniteScreenPoint(point) || !Array.isArray(occluders) || occluders.length === 0) {
        return false;
    }
    const pointX = Number(point.x);
    const pointY = Number(point.y);
    return occluders.some((occluder) => {
        const x = Number(occluder?.x);
        const y = Number(occluder?.y);
        const radiusPx = Number(occluder?.radiusPx);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radiusPx) || radiusPx <= 0) {
            return false;
        }
        const dx = pointX - x;
        const dy = pointY - y;
        return ((dx * dx) + (dy * dy)) <= (radiusPx * radiusPx);
    });
}

/**
 * @param {{
 *   THREE?: any,
 *   camera?: any,
 *   width?: number,
 *   height?: number,
 *   bodies?: any[],
 *   paddingPx?: number
 * }} [options]
 * @returns {Array<{ bodyId: string, x: number, y: number, radiusPx: number }>}
 */
function resolveComposerSkyLabelOccluders({
    THREE,
    camera,
    width,
    height,
    bodies = [],
    paddingPx = COMPOSER_SKY_LABEL_OCCLUSION_PADDING_PX,
} = {}) {
    const Vector3 = THREE?.Vector3;
    const canvasWidth = Number(width);
    const canvasHeight = Number(height);
    const fovDeg = Number(camera?.fov);
    if (
        !Vector3 ||
        !camera?.getWorldPosition ||
        !Number.isFinite(canvasWidth) ||
        !Number.isFinite(canvasHeight) ||
        canvasWidth <= 0 ||
        canvasHeight <= 0 ||
        !Number.isFinite(fovDeg) ||
        fovDeg <= 0 ||
        !Array.isArray(bodies)
    ) {
        return [];
    }

    const cameraWorld = new Vector3();
    const centerWorld = new Vector3();
    const projectedCenter = new Vector3();
    camera.getWorldPosition(cameraWorld);
    const tanHalfVerticalFov = Math.tan((fovDeg * Math.PI / 180) * 0.5);
    if (!Number.isFinite(tanHalfVerticalFov) || tanHalfVerticalFov <= 0) {
        return [];
    }

    const occluders = [];
    for (const body of bodies) {
        const source = body?.centerWorld || body?.center || body;
        const radius = Number(body?.radius);
        const x = Number(source?.x);
        const y = Number(source?.y);
        const z = Number(source?.z);
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z) ||
            !Number.isFinite(radius) ||
            radius <= 0
        ) {
            continue;
        }
        centerWorld.set(x, y, z);
        const distance = cameraWorld.distanceTo(centerWorld);
        if (!Number.isFinite(distance) || distance <= radius) {
            continue;
        }
        projectedCenter.copy(centerWorld).project(camera);
        if (
            !Number.isFinite(projectedCenter.x) ||
            !Number.isFinite(projectedCenter.y) ||
            !Number.isFinite(projectedCenter.z) ||
            projectedCenter.z < -1 ||
            projectedCenter.z > 1
        ) {
            continue;
        }
        const angularRadius = Math.asin(Math.min(Math.max(radius / distance, 0), 0.999999));
        const radiusPx = (Math.tan(angularRadius) / tanHalfVerticalFov) * (canvasHeight * 0.5);
        if (!Number.isFinite(radiusPx) || radiusPx <= 0) {
            continue;
        }
        occluders.push({
            bodyId: body?.bodyId || body?.id || "",
            x: ((projectedCenter.x * 0.5) + 0.5) * canvasWidth,
            y: (1 - ((projectedCenter.y * 0.5) + 0.5)) * canvasHeight,
            radiusPx: radiusPx + Math.max(0, Number(paddingPx) || 0),
        });
    }
    return occluders;
}

function resolveComposerSeeThroughMarkers({
    THREE,
    camera,
    width,
    height,
    skyContainer,
    planetRenderer,
    occluders = [],
} = {}) {
    const Vector3 = THREE?.Vector3;
    const Quaternion = THREE?.Quaternion;
    if (
        !Vector3 ||
        !Quaternion ||
        !camera?.isCamera ||
        !skyContainer?.getWorldQuaternion ||
        !Array.isArray(occluders) ||
        occluders.length === 0
    ) {
        return [];
    }

    const canvasWidth = Number(width);
    const canvasHeight = Number(height);
    if (
        !Number.isFinite(canvasWidth) ||
        !Number.isFinite(canvasHeight) ||
        canvasWidth <= 0 ||
        canvasHeight <= 0
    ) {
        return [];
    }

    const planetPositionAttr = planetRenderer?.geometry?.getAttribute?.("position") || null;
    const planetAlphaAttr = planetRenderer?.geometry?.getAttribute?.("aAlpha") || null;
    const planetSizeAttr = planetRenderer?.geometry?.getAttribute?.("aSize") || null;
    const planetColorAttr = planetRenderer?.geometry?.getAttribute?.("aColor") || null;
    const planetBodySlots = Array.isArray(planetRenderer?.bodySlots) ? planetRenderer.bodySlots : [];
    const planetPositionArray = planetPositionAttr?.array || null;
    const planetAlphaArray = planetAlphaAttr?.array || null;
    const planetSizeArray = planetSizeAttr?.array || null;
    const planetColorArray = planetColorAttr?.array || null;
    if (!planetPositionArray || !planetAlphaArray || !planetSizeArray || planetBodySlots.length <= 0) {
        return [];
    }

    const planetCount = Math.min(
        planetBodySlots.length,
        planetPositionAttr.count || 0,
        planetAlphaAttr.count || 0,
        planetSizeAttr.count || 0,
    );
    if (planetCount <= 0) {
        return [];
    }

    const worldQuat = new Quaternion();
    const worldPoint = new Vector3();
    const projected = new Vector3();
    skyContainer.getWorldQuaternion(worldQuat);

    const fovDeg = Number(camera?.fov);
    const tanHalfVerticalFov = Math.tan((fovDeg * Math.PI / 180) * 0.5);
    const fallbackSunRadiusPx = (
        Math.tan(COMPOSER_SOLAR_ANGULAR_RADIUS_RAD) / Math.max(tanHalfVerticalFov, 1e-9)
    ) * (canvasHeight * 0.5);
    const sunRadiusPx = Number.isFinite(fallbackSunRadiusPx)
        ? Math.max(COMPOSER_SEE_THROUGH_SUN_RADIUS_MIN_PX, fallbackSunRadiusPx)
        : COMPOSER_SEE_THROUGH_SUN_RADIUS_MIN_PX;

    const markers = [];
    for (let i = 0; i < planetCount; i += 1) {
        const label = String(planetBodySlots[i] || "").trim();
        if (!label || label === "Moon" || label === "Earth") {
            continue;
        }
        const alpha = Number(planetAlphaArray[i]);
        if (!Number.isFinite(alpha) || alpha <= 0.001) {
            continue;
        }

        const idx3 = i * 3;
        worldPoint.set(
            Number(planetPositionArray[idx3]),
            Number(planetPositionArray[idx3 + 1]),
            Number(planetPositionArray[idx3 + 2]),
        );
        if (skyContainer?.matrixWorld) {
            worldPoint.applyMatrix4(skyContainer.matrixWorld);
        } else {
            worldPoint.applyQuaternion(worldQuat);
        }
        projected.copy(worldPoint).project(camera);
        if (
            !Number.isFinite(projected.x) ||
            !Number.isFinite(projected.y) ||
            !Number.isFinite(projected.z) ||
            projected.z < -1 ||
            projected.z > 1
        ) {
            continue;
        }

        const point = {
            x: ((projected.x * 0.5) + 0.5) * canvasWidth,
            y: (1 - ((projected.y * 0.5) + 0.5)) * canvasHeight,
        };
        if (
            point.x < 0 ||
            point.x > canvasWidth ||
            point.y < 0 ||
            point.y > canvasHeight
        ) {
            continue;
        }
        if (!isComposerSkyLabelPointOccluded(point, occluders)) {
            continue;
        }

        const size = Number(planetSizeArray[i]);
        const radiusPx = label === "Sun"
            ? sunRadiusPx
            : THREE.MathUtils.clamp(
                Number.isFinite(size) ? size * 0.9 : COMPOSER_SEE_THROUGH_PLANET_RADIUS_MIN_PX,
                COMPOSER_SEE_THROUGH_PLANET_RADIUS_MIN_PX,
                COMPOSER_SEE_THROUGH_PLANET_RADIUS_MAX_PX,
            );

        let strokeStyle = "rgba(239, 246, 255, 0.90)";
        if (planetColorArray && (idx3 + 2) < planetColorArray.length) {
            const r = Math.max(0, Math.min(255, Math.round(Number(planetColorArray[idx3]) * 255)));
            const g = Math.max(0, Math.min(255, Math.round(Number(planetColorArray[idx3 + 1]) * 255)));
            const b = Math.max(0, Math.min(255, Math.round(Number(planetColorArray[idx3 + 2]) * 255)));
            strokeStyle = `rgba(${r}, ${g}, ${b}, ${COMPOSER_SEE_THROUGH_OPACITY.toFixed(2)})`;
        }

        markers.push({
            label,
            x: point.x,
            y: point.y,
            radiusPx,
            strokeStyle,
        });
    }
    return markers;
}

function rollRadFromDialPointer({ pointerX, pointerY, centerX, centerY }) {
    const dx = pointerX - centerX;
    const dy = pointerY - centerY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) + Math.abs(dy)) <= 1e-6) {
        return 0;
    }
    return normalizeComposerRollRad(Math.atan2(-dx, -dy));
}

function composerRollDialKnobOffset(rollRad, radiusPx) {
    const roll = normalizeComposerRollRad(rollRad);
    const radius = Math.max(0, Number(radiusPx) || 0);
    return {
        x: -Math.sin(roll) * radius,
        y: -Math.cos(roll) * radius,
    };
}

function shouldRenderComposerLunarCraterHover(state = {}) {
    return shouldRenderLunarFeaturePointer(state);
}

function createComposerSurfacePointControls(documentRef) {
    const panel = documentRef.createElement("div");
    panel.className = "surface-points-controls-panel surface-points-controls-panel--anchored";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Frame and Shoot surface point controls");
    panel.hidden = true;

    const header = documentRef.createElement("div");
    header.className = "surface-points-controls-panel__header";
    const title = documentRef.createElement("span");
    title.className = "surface-points-controls-panel__title";
    title.textContent = "Surface Points";
    const close = documentRef.createElement("button");
    close.type = "button";
    close.className = "surface-points-controls-panel__close";
    close.textContent = "Close";
    close.title = "Close surface point controls";
    header.appendChild(title);
    header.appendChild(close);
    panel.appendChild(header);

    const entries = [];
    COMPOSER_SURFACE_POINT_CONTROL_GROUPS.forEach((group) => {
        const section = documentRef.createElement("div");
        section.className = "surface-points-controls-panel__section";
        const sectionTitle = documentRef.createElement("div");
        sectionTitle.className = "surface-points-controls-panel__section-title";
        sectionTitle.textContent = group.label;
        section.appendChild(sectionTitle);
        group.options.forEach((option) => {
            const label = documentRef.createElement("label");
            label.className = "surface-points-controls-panel__option";
            label.title = `${group.label}: ${option.label}`;
            const input = documentRef.createElement("input");
            input.type = "checkbox";
            input.dataset.surfacePointKey = option.key;
            input.setAttribute("aria-label", `${group.label} ${option.label}`);
            const swatch = documentRef.createElement("span");
            swatch.className = `surface-points-controls-panel__swatch surface-points-controls-panel__swatch--${option.color}`;
            swatch.setAttribute("aria-hidden", "true");
            const text = documentRef.createElement("span");
            text.textContent = option.label;
            label.appendChild(input);
            label.appendChild(swatch);
            label.appendChild(text);
            section.appendChild(label);
            entries.push({ key: option.key, input });
        });
        panel.appendChild(section);
    });

    return { close, entries, panel };
}

function isComposerPlanetVisibleForMagnitudeLimit(bodyName, magnitudeLimit) {
    const label = String(bodyName || "").trim();
    if (!label || label === "Sun" || label === "Moon") {
        return true;
    }
    const limit = Number(magnitudeLimit);
    if (!Number.isFinite(limit)) {
        return true;
    }
    const magnitude = COMPOSER_PLANET_MAGNITUDE_BY_BODY[label];
    if (!Number.isFinite(magnitude)) {
        return true;
    }
    return magnitude <= limit;
}

function computeComposerDragSensitivityScale(fovDegrees) {
    const fov = Number.isFinite(Number(fovDegrees))
        ? Number(fovDegrees)
        : COMPOSER_DRAG_REFERENCE_FOV_DEGREES;
    const boundedFov = Math.min(Math.max(fov, 0.001), AUTO_FOV_MAX_DEGREES);
    const referenceHalfTan = Math.tan((COMPOSER_DRAG_REFERENCE_FOV_DEGREES * Math.PI / 180) * 0.5);
    const currentHalfTan = Math.tan((boundedFov * Math.PI / 180) * 0.5);
    if (!Number.isFinite(currentHalfTan) || !Number.isFinite(referenceHalfTan) || referenceHalfTan <= 1e-12) {
        return 1;
    }
    return Math.min(Math.max(currentHalfTan / referenceHalfTan, 0), 1);
}

function hasCurrentAuxFovPreferenceVersion(persisted) {
    return Number(persisted?.fovPreferenceVersion) >= AUX_FOV_PREFERENCE_VERSION;
}

function safeParseJson(text, fallbackValue) {
    try {
        return JSON.parse(text);
    } catch {
        return fallbackValue;
    }
}

function asTrimmedString(value) {
    if (typeof value !== "string") {
        return "";
    }
    return value.trim();
}

function isDesktopViewport() {
    return window.innerWidth > 600;
}

function shouldEnableEarthriseComposer(missionConfig) {
    const ui = missionConfig?.ui;
    if (!ui || typeof ui !== "object") {
        return false;
    }
    if (ui.earthriseComposerEnabled === true) {
        return true;
    }
    const features = ui.features;
    return !!(features && typeof features === "object" && features.earthriseComposer === true);
}

function shouldEnableAuxiliaryPanels(missionConfig) {
    const ui = missionConfig?.ui;
    if (ui && typeof ui === "object" && typeof ui.auxiliaryPanelsEnabled === "boolean") {
        return ui.auxiliaryPanelsEnabled;
    }
    const features = ui?.features;
    if (features && typeof features === "object" && typeof features.auxiliaryPanels === "boolean") {
        return features.auxiliaryPanels;
    }
    if (missionConfig?.is_lunar === true) {
        return true;
    }
    const origins = Array.isArray(missionConfig?.origins) ? missionConfig.origins : [];
    return origins.includes("lunar");
}

function getAuxiliaryPanelFallbackState(spec) {
    if (spec?.mode === "composer" || STARTUP_MINIMIZED_PANEL_IDS.has(spec?.id)) {
        return "closed";
    }
    return "open";
}

// Aux panels prefer antialiased GL contexts (so composer / Craft-to-Moon
// moon limbs and crater rims aren't visibly aliased relative to Follow
// Moon), but a low-end browser or context-constrained tab may not be
// able to grant antialiased contexts. Try in order; throw only if all
// attempts fail. (Mirrors the main renderer's fallback chain in
// scene-handler-init.js#createRendererWithFallback.)
const AUXILIARY_WEBGL_RENDERER_FALLBACK_ATTEMPTS = Object.freeze([
    Object.freeze({ antialias: true, powerPreference: "low-power", preserveDrawingBuffer: false }),
    Object.freeze({ antialias: false, powerPreference: "low-power", preserveDrawingBuffer: false }),
    Object.freeze({ antialias: false, preserveDrawingBuffer: false }),
]);

export function createAuxiliaryWebGLRendererWithFallback(THREE) {
    let lastError = null;
    for (const auxRendererOptions of AUXILIARY_WEBGL_RENDERER_FALLBACK_ATTEMPTS) {
        try {
            return new THREE.WebGLRenderer(auxRendererOptions);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error("Unable to create aux WebGLRenderer with fallback options");
}

function resolveEventStartTimeMs(eventInfo) {
    const startTime = eventInfo?.startTime;
    if (startTime instanceof Date) {
        const timeMs = startTime.getTime();
        return Number.isFinite(timeMs) ? timeMs : Number.NaN;
    }
    if (typeof startTime === "string") {
        const parsed = Date.parse(startTime);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    const numeric = Number(startTime);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function resolveLunarFlybyTimeMs(eventInfos) {
    if (!Array.isArray(eventInfos) || eventInfos.length === 0) {
        return Number.NaN;
    }
    let best = null;
    for (const eventInfo of eventInfos) {
        const timeMs = resolveEventStartTimeMs(eventInfo);
        if (!Number.isFinite(timeMs)) {
            continue;
        }
        const key = eventInfo?.key || "";
        const label = eventInfo?.label || "";
        const hoverText = eventInfo?.hoverText || "";
        const infoText = eventInfo?.infoText || "";
        const burnFlag = eventInfo?.burnFlag === true;
        const keyLabelCorpus = `${key} ${label}`.toLowerCase();
        const narrativeCorpus = `${hoverText} ${infoText}`.toLowerCase();

        const hasMoonKeyLabel = /\b(moon|lunar)\b/.test(keyLabelCorpus);
        const hasFlybyKeyLabel = /\bflyby\b/.test(keyLabelCorpus);
        const hasClosestKeyLabel = /\b(closest approach|closestapproach|perilune|periselene|pericynthion)\b/.test(keyLabelCorpus);
        const explicitLunarFlybyKeyLabel = /\b(lunar flyby|moon flyby)\b/.test(keyLabelCorpus);
        const keySuggestsClosest = /\bclosest\b/.test(key.toLowerCase()) && /\b(approach|peri)\b/.test(key.toLowerCase());
        const hasMoonNarrative = /\b(moon|lunar)\b/.test(narrativeCorpus);
        const hasFlybyNarrative = /\bflyby\b/.test(narrativeCorpus);
        const hasClosestNarrative = /\b(closest approach|perilune|periselene|pericynthion)\b/.test(narrativeCorpus);
        let score = 0;
        if (keySuggestsClosest || hasClosestKeyLabel) {
            score = 220;
        } else if (explicitLunarFlybyKeyLabel) {
            score = 210;
        } else if (hasMoonKeyLabel && hasFlybyKeyLabel) {
            score = 200;
        } else if (!burnFlag && hasMoonNarrative && hasClosestNarrative) {
            score = 120;
        } else if (!burnFlag && hasMoonNarrative && hasFlybyNarrative) {
            score = 110;
        }
        if (score <= 0) {
            continue;
        }
        if (
            !best ||
            score > best.score ||
            (score === best.score && burnFlag === false && best.burnFlag === true) ||
            (score === best.score && burnFlag === best.burnFlag && timeMs < best.timeMs)
        ) {
            best = {
                score,
                timeMs,
                burnFlag,
            };
        }
    }
    return best ? best.timeMs : Number.NaN;
}

function resolveLunarSoiBoundaryTimeMs(eventInfos, boundary) {
    if (!Array.isArray(eventInfos) || eventInfos.length === 0) {
        return Number.NaN;
    }
    const wantEntry = boundary === "entry";
    const boundaryWords = wantEntry
        ? /\b(in|entry|enter|ingress)\b/
        : /\b(out|exit|leave|egress)\b/;
    const explicitKeyPattern = wantEntry
        ? /(?:lunar|moon)soi(?:entry|in)|soi(?:entry|in)(?:lunar|moon)?/
        : /(?:lunar|moon)soi(?:exit|out)|soi(?:exit|out)(?:lunar|moon)?/;
    const explicitLabelPattern = wantEntry
        ? /\b(?:lunar|moon)\s+soi\s+(?:in|entry)\b/
        : /\b(?:lunar|moon)\s+soi\s+(?:out|exit)\b/;
    const boundaryNarrativePattern = wantEntry
        ? /\b(?:enters?|entry|ingress)\b/
        : /\b(?:exits?|leave|egress)\b/;

    let best = null;
    for (const eventInfo of eventInfos) {
        const timeMs = resolveEventStartTimeMs(eventInfo);
        if (!Number.isFinite(timeMs)) {
            continue;
        }
        const key = String(eventInfo?.key || "");
        const label = String(eventInfo?.label || "");
        const hoverText = String(eventInfo?.hoverText || "");
        const infoText = String(eventInfo?.infoText || "");
        const keyLabelCorpus = `${key} ${label}`.toLowerCase();
        const narrativeCorpus = `${hoverText} ${infoText}`.toLowerCase();
        const compactKeyLabel = keyLabelCorpus.replace(/[^a-z0-9]+/g, "");

        const hasMoonKeyLabel = /\b(moon|lunar)\b/.test(keyLabelCorpus);
        const hasMoonNarrative = /\b(moon|lunar)\b/.test(narrativeCorpus);
        const hasSoiKeyLabel = /\bsoi\b/.test(keyLabelCorpus);
        const hasSoiNarrative = /\b(soi|sphere of influence)\b/.test(narrativeCorpus);

        let score = 0;
        if (explicitKeyPattern.test(compactKeyLabel)) {
            score = 320;
        } else if (explicitLabelPattern.test(keyLabelCorpus)) {
            score = 300;
        } else if (hasMoonKeyLabel && hasSoiKeyLabel && boundaryWords.test(keyLabelCorpus)) {
            score = 260;
        } else if (hasMoonNarrative && hasSoiNarrative && boundaryNarrativePattern.test(narrativeCorpus)) {
            score = 220;
        }

        if (score <= 0) {
            continue;
        }
        if (
            !best ||
            score > best.score ||
            (score === best.score && wantEntry && timeMs < best.timeMs) ||
            (score === best.score && !wantEntry && timeMs > best.timeMs)
        ) {
            best = { score, timeMs };
        }
    }
    return best ? best.timeMs : Number.NaN;
}

function resolveLunarFlybyWindowMs(eventInfos) {
    const startMs = resolveLunarSoiBoundaryTimeMs(eventInfos, "entry");
    const endMs = resolveLunarSoiBoundaryTimeMs(eventInfos, "exit");
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return { startMs: Number.NaN, endMs: Number.NaN };
    }
    return {
        startMs: startMs - COMPOSER_FLYBY_WINDOW_PADDING_MS,
        endMs: endMs + COMPOSER_FLYBY_WINDOW_PADDING_MS,
    };
}

function resolveFlybyPlannerEvents(eventInfos) {
    if (!Array.isArray(eventInfos) || eventInfos.length === 0) {
        return [];
    }
    const indexedEvents = eventInfos
        .map((eventInfo) => {
            const timeMs = resolveEventStartTimeMs(eventInfo);
            if (!Number.isFinite(timeMs)) {
                return null;
            }
            return {
                key: String(eventInfo?.key || "").toLowerCase(),
                label: String(eventInfo?.label || "").toLowerCase(),
                timeMs,
                rawLabel: String(eventInfo?.label || "").trim(),
            };
        })
        .filter(Boolean);
    const resolved = [];
    for (const spec of FLYBY_EVENT_PILL_SPECS) {
        const match = indexedEvents.find((eventInfo) => {
            const compactKey = eventInfo.key.replace(/[^a-z0-9]+/g, "");
            const hasKeyMatch = spec.matchKeys.some((candidate) => compactKey === candidate);
            if (hasKeyMatch) {
                return true;
            }
            return spec.matchLabels.some((needle) => eventInfo.label.includes(needle));
        });
        if (!match) {
            continue;
        }
        resolved.push({
            id: spec.id,
            title: spec.title,
            timeMs: match.timeMs,
            sourceLabel: match.rawLabel,
        });
    }
    return resolved;
}

function timelinePhaseContainsTime(phase, timeMs) {
    if (!phase || !Number.isFinite(timeMs)) {
        return false;
    }
    const startMs = Number(phase.startMs);
    const endMs = Number(phase.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return false;
    }
    return timeMs >= startMs && (timeMs < endMs || (phase.includeEnd === true && timeMs <= endMs));
}

class AuxiliaryCameraViewsManager {
    constructor({
        THREE,
        overlayHost,
        requestRender,
        getEarthCloudsEnabled = null,
        setEarthCloudsEnabled = null,
    }) {
        this.THREE = THREE;
        this.overlayHost = overlayHost || document.body;
        this.requestRender = typeof requestRender === "function" ? requestRender : null;
        this.getEarthCloudsEnabled = typeof getEarthCloudsEnabled === "function"
            ? getEarthCloudsEnabled
            : () => true;
        this.setEarthCloudsEnabled = typeof setEarthCloudsEnabled === "function"
            ? setEarthCloudsEnabled
            : null;
        this.root = null;
        this.chipDock = null;
        this.chipDockLeft = null;
        this.chipDockRight = null;
        this.panels = [];
        this.panelsEnabled = true;
        this.zIndexCounter = 1;
        this.dragState = null;
        this.handleResizeBound = this.handleResize.bind(this);
        this.handleExternalLayoutRequestBound = this.handleExternalLayoutRequest.bind(this);
        this.handleMissionMediaItemSelectBound = this.handleMissionMediaItemSelect.bind(this);
        this.panelStateByElement = new WeakMap();
        this.pendingResizePanelStates = new Set();
        this.pendingResizeRaf = null;
        this.composerCoronaAnimationRaf = null;
        this.defaultLayoutRaf = null;
        this.handlePanelResizeEntriesBound = this.handlePanelResizeEntries.bind(this);
        this.persistedPanelState = this.readPersistedPanelState();
        this.persistStateTimeout = null;
        this.missionPanelsEnabled = false;
        this.composerEnabled = false;
        this.lastMissionConfig = null;
        this.lunarFeatureMentionTimeline = null;
        this.lunarFeatureMentionTimelinePromise = null;
        this.lunarFeatureMentionTimelineDataPath = "";
        this.lunarFeatureMentionTimelineMissing = false;

        this.craftWorld = new THREE.Vector3();
        this.anchorWorld = new THREE.Vector3();
        this.targetWorld = new THREE.Vector3();
        this.earthWorld = new THREE.Vector3();
        this.moonWorld = new THREE.Vector3();
        this.sunWorld = new THREE.Vector3();
        this.sunDirectionWorld = new THREE.Vector3();
        this.sunDirectionEarthWorld = new THREE.Vector3(1, 0, 0);
        this.sunDirectionMoonWorld = new THREE.Vector3(1, 0, 0);
        this.sunDirectionCraftWorld = new THREE.Vector3(1, 0, 0);
        this.sunDirectionFromEarth = new THREE.Vector3();
        this.craftFromMoonDir = new THREE.Vector3();
        this.earthFromMoonDir = new THREE.Vector3();
        this.sunFromMoonDir = new THREE.Vector3();
        this.earthNorthWorld = new THREE.Vector3(0, 0, 1);
        this.moonNorthWorld = new THREE.Vector3(0, 0, 1);
        this.composerSurfaceTargetWorld = new THREE.Vector3();
        this.composerSurfaceTargetLocal = new THREE.Vector3();
        this.tmpVectorA = new THREE.Vector3();
        this.tmpVectorB = new THREE.Vector3();
        this.tmpVectorC = new THREE.Vector3();
        this.tmpVectorD = new THREE.Vector3();
        this.tmpVectorE = new THREE.Vector3();
        this.tmpVectorF = new THREE.Vector3();
        this.viewDir = new THREE.Vector3();
        this.projectedUp = new THREE.Vector3();
        this.targetUp = new THREE.Vector3();
        this.composerWorldUp = new THREE.Vector3(0, 0, 1);
        this.composerBaseUp = new THREE.Vector3();
        this.composerRotatedUp = new THREE.Vector3();
        this.targetQuat = new THREE.Quaternion();
        this.tmpQuatA = new THREE.Quaternion();
        this.tmpQuatB = new THREE.Quaternion();
        this.panelCameraWorldQuat = new THREE.Quaternion();
        this.panelCameraWorldQuatInv = new THREE.Quaternion();
        this.earthDirInCamera = new THREE.Vector3();
        this.cameraOffset = new THREE.Vector3();
        this.composerLookWorld = new THREE.Vector3();
        this.composerLookAtWorld = new THREE.Vector3();
        this.boundingBox = new THREE.Box3();
        this.boundingSphere = new THREE.Sphere();
        this.originalSkyPosition = new THREE.Vector3();
        this.originalSunReference = new THREE.Vector3();
        this.panelCameraWorldPosition = new THREE.Vector3();
        this.panelSkyLocalPosition = new THREE.Vector3();
        this.panelSunLocalPosition = new THREE.Vector3();
        this.orbitPlaneCenterWorld = new THREE.Vector3();
        this.orbitPlaneCameraPosition = new THREE.Vector3();
        this.moonElongationPrevious = null;
        this.moonElongationTrend = 1;
        this.moonVisibilitySamples = this.createFibonacciSphereSamples(720);
        this.analyticsLastUpdateMs = -Infinity;
        this.cachedMoonPhaseInfo = null;
        this.cachedMoonVisibilityInfo = null;
        this.composerFlybyTimeMs = Number.NaN;
        this.composerFlybyWindowStartMs = Number.NaN;
        this.composerFlybyWindowEndMs = Number.NaN;
        this.composerFlybyEvents = [];
        this.composerTimelinePhases = [];
        this.composerActivePhaseIndex = -1;
        this.composerSelectedPhaseIndex = -1;
        this.visiblePanelsRefreshRaf = null;
        this.composerBrightStarCatalogRef = null;
        this.composerBrightStarMagnitudeLimit = Number.NaN;
        this.composerBrightStarLabelDescriptors = [];

        if (!isDesktopViewport()) {
            return;
        }

        this.createDom();
        window.addEventListener("resize", this.handleResizeBound, { passive: true });
        document.addEventListener("moon-mission:auxiliary-panels-layout-request", this.handleExternalLayoutRequestBound);
        document.addEventListener("mission-media-item-select", this.handleMissionMediaItemSelectBound);
    }

    getPanelResizeObserver() {
        if (typeof ResizeObserver === "undefined") {
            return null;
        }
        if (!this.panelResizeObserver) {
            this.panelResizeObserver = new ResizeObserver(this.handlePanelResizeEntriesBound);
        }
        return this.panelResizeObserver;
    }

    createDom() {
        this.root = document.createElement("div");
        this.root.id = "aux-camera-views";
        this.root.className = "aux-camera-views";
        this.overlayHost.appendChild(this.root);

        PANEL_SPECS.forEach((spec, index) => {
            this.createPanel(spec, index);
        });

        this.applyDefaultPanelLayout();
        this.scheduleDefaultPanelLayout();
    }

    readPersistedPanelState() {
        const storage = globalThis?.localStorage;
        if (!storage) {
            return {};
        }
        let raw = null;
        try {
            raw = storage.getItem(PANEL_STATE_STORAGE_KEY);
        } catch {
            return {};
        }
        if (!raw) {
            return {};
        }
        const parsed = safeParseJson(raw, {});
        return parsed && typeof parsed === "object" ? parsed : {};
    }

    queuePersistPanelState() {
        if (this.persistStateTimeout != null) {
            clearTimeout(this.persistStateTimeout);
        }
        this.persistStateTimeout = setTimeout(() => {
            this.persistStateTimeout = null;
            this.persistPanelState();
        }, 120);
    }

    persistPanelState() {
        const storage = globalThis?.localStorage;
        const payload = {};
        const layoutPayload = {};
        for (const panelState of this.panels) {
            const persistedFov = panelState.camera?.isOrthographicCamera
                ? panelState.orbitZoomFovDegrees
                : panelState.camera?.fov;
            payload[panelState.id] = {
                fovPreferenceVersion: AUX_FOV_PREFERENCE_VERSION,
                fov: Number.isFinite(persistedFov) ? Number(persistedFov) : null,
                composerControlsCollapsed: panelState.composerControlsCollapsed === true,
                composerControlsCollapseVersion: panelState.mode === "composer"
                    ? COMPOSER_CONTROLS_COLLAPSE_STATE_VERSION
                    : undefined,
                composerAutoFovPreferenceVersion: panelState.mode === "composer"
                    ? COMPOSER_AUTO_FOV_PREFERENCE_VERSION
                    : undefined,
                composerExposureEv: panelState.mode === "composer" &&
                    Number.isFinite(Number(panelState.composerExposureEv))
                    ? Number(panelState.composerExposureEv)
                    : undefined,
                composerAutoExposureEnabled: panelState.mode === "composer"
                    ? panelState.composerAutoExposureEnabled !== false
                    : undefined,
            };
            layoutPayload[panelState.panelRegistryId] = {
                x: Math.round(Number.isFinite(panelState.x) ? panelState.x : panelState.panel.offsetLeft || 0),
                y: Math.round(Number.isFinite(panelState.y) ? panelState.y : panelState.panel.offsetTop || 0),
                width: Math.round(panelState.panel.offsetWidth || panelState.width || 0),
                height: Math.round(panelState.panel.offsetHeight || panelState.height || 0),
                state: this.getPanelRegistryState(panelState),
                maximized: panelState.maximized === true,
                layoutPresetVersion: asTrimmedString(panelState.layoutPresetVersion),
                restoreFrame: panelState.restoreFrame && typeof panelState.restoreFrame === "object"
                    ? {
                        x: Math.round(Number(panelState.restoreFrame.x) || 0),
                        y: Math.round(Number(panelState.restoreFrame.y) || 0),
                        width: Math.round(Number(panelState.restoreFrame.width) || 0),
                        height: Math.round(Number(panelState.restoreFrame.height) || 0),
                    }
                    : null,
            };
        }
        if (!storage) {
            writeMissionPanelStates(layoutPayload);
            return;
        }
        try {
            storage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore persistence failures (privacy mode/quota).
        }
        writeMissionPanelStates(layoutPayload);
    }

    getPanelRegistryState(panelState) {
        if (!panelState || panelState.missionEnabled !== true) {
            return "unavailable";
        }
        if (panelState.deleted === true) {
            return "deleted";
        }
        if (panelState.closed === true) {
            return "closed";
        }
        if (panelState.minimized === true) {
            return "closed";
        }
        return "open";
    }

    syncPanelRegistry(panelState) {
        if (!panelState?.panelRegistryId) {
            return;
        }
        const panelStateName = this.getPanelRegistryState(panelState);
        const infoItems = panelState.mode === "composer"
            ? [
                { label: "Panel Kind", value: "Flyby workflow" },
                { label: "Mode", value: "composer" },
            ]
            : [
                { label: "Panel Kind", value: "view" },
                { label: "Anchor", value: panelState.anchorKey || "--" },
                { label: "Target", value: panelState.targetKey || "--" },
            ];

        updateMissionPanel(panelState.panelRegistryId, {
            id: panelState.panelRegistryId,
            title: panelState.title,
            kind: panelState.mode === "composer" ? "workflow" : "view",
            panelType: panelState.mode === "composer" ? "flyby-focus" : "aux-camera-view",
            builtIn: true,
            available: panelState.missionEnabled === true,
            state: panelStateName,
            sortOrder: panelState.sortOrder,
            infoItems,
            actions: {
                open: () => this.restorePanel(panelState),
                restore: () => this.restorePanel(panelState),
                restoreGuided: panelState.mode === "composer"
                    ? () => this.restoreComposerGuidedPanel(panelState)
                    : undefined,
                focus: panelStateName === "open"
                    ? () => this.restorePanel(panelState)
                    : undefined,
                close: panelStateName === "open"
                    ? () => this.setPanelClosed(panelState, true)
                    : undefined,
                delete: panelStateName !== "deleted"
                    ? () => this.confirmAndDeletePanel(panelState)
                    : undefined,
            },
        });
        if (panelState.mode === "composer") {
            this.syncComposerControlsPanelRegistry(panelState);
        }
    }

    applyPanelVisibilityState(panelState, state, { persist = true, requestRender = true } = {}) {
        if (!panelState) {
            return;
        }
        const nextState = normalizeMissionPanelState(state, "open");
        if (nextState === "deleted") {
            this.setPanelDeleted(panelState, true, { persist, requestRender });
            return;
        }
        if (nextState === "closed") {
            this.setPanelClosed(panelState, true, { persist, requestRender });
            return;
        }
        if (nextState === "minimized") {
            this.setPanelClosed(panelState, true, { persist, requestRender });
            return;
        }
        panelState.deleted = false;
        panelState.closed = false;
        this.setPanelMinimized(panelState, false, { persist, requestRender });
    }

    confirmAndDeletePanel(panelState) {
        const confirmFn = globalThis?.confirm;
        if (typeof confirmFn === "function") {
            const accepted = confirmFn(
                `Delete "${panelState?.title || "panel"}" from this mission layout? You can add it back from the Panels menu.`,
            );
            if (!accepted) {
                return false;
            }
        }
        this.setPanelDeleted(panelState, true);
        return true;
    }

    resolveComposerBrightStarLabelDescriptors(maxMagnitude = COMPOSER_STAR_MAGNITUDE_DEFAULT) {
        const catalog = Array.isArray(COMPOSER_STAR_LABEL_CATALOG)
            ? COMPOSER_STAR_LABEL_CATALOG
            : null;
        const boundedMaxMagnitude = this.THREE.MathUtils.clamp(
            Number(maxMagnitude),
            COMPOSER_STAR_MAGNITUDE_MIN,
            COMPOSER_STAR_MAGNITUDE_MAX,
        );
        if (!catalog || catalog.length === 0) {
            this.composerBrightStarCatalogRef = null;
            this.composerBrightStarLabelDescriptors = [];
            return this.composerBrightStarLabelDescriptors;
        }
        if (
            this.composerBrightStarCatalogRef === catalog &&
            this.composerBrightStarMagnitudeLimit === boundedMaxMagnitude &&
            this.composerBrightStarLabelDescriptors.length > 0
        ) {
            return this.composerBrightStarLabelDescriptors;
        }

        const descriptors = [];
        const seenLabels = new Set();
        for (let i = 0; i < catalog.length; i += 1) {
            const star = catalog[i];
            const magnitude = Number(star?.vmag);
            const raDeg = Number(star?.raDeg);
            const decDeg = Number(star?.decDeg);
            if (!Number.isFinite(magnitude) || magnitude > boundedMaxMagnitude) {
                continue;
            }
            if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg)) {
                continue;
            }
            const label = resolveStarDisplayName(star, STAR_NAME_CROSS_INDEX);
            if (!label) {
                continue;
            }
            const dedupeKey = label.toLowerCase();
            if (seenLabels.has(dedupeKey)) {
                continue;
            }
            seenLabels.add(dedupeKey);
            const raRad = this.THREE.MathUtils.degToRad(raDeg);
            const decRad = this.THREE.MathUtils.degToRad(decDeg);
            const cosDec = Math.cos(decRad);
            descriptors.push({
                text: label,
                magnitude,
                localDirection: {
                    x: cosDec * Math.cos(raRad),
                    y: -cosDec * Math.sin(raRad),
                    z: Math.sin(decRad),
                },
            });
        }
        descriptors.sort((a, b) => (a.magnitude - b.magnitude) || a.text.localeCompare(b.text));
        this.composerBrightStarCatalogRef = catalog;
        this.composerBrightStarMagnitudeLimit = boundedMaxMagnitude;
        this.composerBrightStarLabelDescriptors = descriptors;
        return this.composerBrightStarLabelDescriptors;
    }

    readTimelineDockOffset() {
        const cssValue = getComputedStyle(document.documentElement)
            .getPropertyValue("--timeline-dock-offset")
            .trim();
        const parsed = Number.parseFloat(cssValue);
        return Number.isFinite(parsed) ? parsed : PANEL_MARGIN_PX;
    }

    handleExternalLayoutRequest() {
        if (!this.root) {
            return;
        }
        this.scheduleDefaultPanelLayout();
    }

    clampPanelRect({ x, y, width, height }) {
        const viewportWidth = Math.max(window.innerWidth, 1);
        const viewportHeight = Math.max(window.innerHeight, 1);
        const maxX = Math.max(PANEL_MARGIN_PX, viewportWidth - width - PANEL_MARGIN_PX);
        const maxY = Math.max(PANEL_MARGIN_PX, viewportHeight - height - PANEL_MARGIN_PX);
        return {
            x: Math.min(Math.max(Math.round(x), PANEL_MARGIN_PX), maxX),
            y: Math.min(Math.max(Math.round(y), PANEL_MARGIN_PX), maxY),
        };
    }

    getDefaultPanelPosition(panel, index) {
        const width = Math.max(120, Math.round(panel.offsetWidth || 280));
        const height = Math.max(80, Math.round(panel.offsetHeight || 192));
        const dockOffset = this.readTimelineDockOffset();
        const x = window.innerWidth - width - dockOffset;
        const y = dockOffset + PANEL_TOP_OFFSET_PX + index * (height + PANEL_GAP_PX);
        return this.clampPanelRect({
            x,
            y,
            width,
            height,
        });
    }

    resolvePanelViewportBounds() {
        const viewportWidth = Math.max(window.innerWidth, 1);
        const viewportHeight = Math.max(window.innerHeight, 1);
        const headerEl = document.querySelector(".header");
        const controlPanelEl = document.getElementById("control-panel");
        const timelineEl = document.querySelector(".timeline-dock");
        const headerRect = headerEl?.getBoundingClientRect?.() || null;
        const controlPanelRect = controlPanelEl?.getBoundingClientRect?.() || null;
        const timelineRect = timelineEl?.getBoundingClientRect?.() || null;
        const left = PANEL_MARGIN_PX;
        const right = viewportWidth - PANEL_MARGIN_PX;
        const top = Number.isFinite(headerRect?.bottom)
            ? Math.round(headerRect.bottom + PANEL_GAP_PX)
            : (this.readTimelineDockOffset() + PANEL_TOP_OFFSET_PX);
        const transportTop = Number.isFinite(controlPanelRect?.top) &&
            controlPanelRect.width > 0 &&
            controlPanelRect.height > 0 &&
            controlPanelEl?.hidden !== true
            ? controlPanelRect.top
            : Number.NaN;
        const timelineTop = Number.isFinite(timelineRect?.top)
            ? timelineRect.top
            : Number.NaN;
        const bottomBoundary = Math.min(
            Number.isFinite(transportTop) ? transportTop : Infinity,
            Number.isFinite(timelineTop) ? timelineTop : Infinity,
        );
        const bottom = Number.isFinite(bottomBoundary)
            ? Math.round(bottomBoundary - PANEL_GAP_PX)
            : (viewportHeight - PANEL_MARGIN_PX);
        return {
            left,
            top,
            right,
            bottom,
            width: Math.max(160, right - left),
            height: Math.max(160, bottom - top),
        };
    }

    resolveRightStackTop({ bounds, columnLeft, columnRight }) {
        if (window.innerWidth < PANEL_ABOUT_ALIGNED_MIN_VIEWPORT_WIDTH) {
            return bounds.top;
        }

        const toggleRect = document.getElementById("blurb-toggle")?.getBoundingClientRect?.() || null;
        const toggleBottom = Number.isFinite(toggleRect?.bottom)
            ? Math.round(toggleRect.bottom)
            : null;
        let top = toggleBottom == null
            ? bounds.top
            : toggleBottom + PANEL_GAP_PX;

        const headerControls = document.querySelectorAll(
            "#header-pill-strip button:not([hidden]), #header-pill-strip .header-pill-group:not([hidden])",
        );
        for (const control of headerControls) {
            const rect = control?.getBoundingClientRect?.();
            if (!rect || rect.width <= 0 || rect.height <= 0) {
                continue;
            }
            const overlapsColumn = rect.left < columnRight && rect.right > columnLeft;
            if (overlapsColumn) {
                top = Math.max(top, Math.round(rect.bottom) + PANEL_GAP_PX);
            }
        }

        return Math.max(PANEL_MARGIN_PX, top);
    }

    getManagedMediaBrowserPanel() {
        const documentRef = typeof document !== "undefined" ? document : null;
        const panel = typeof documentRef?.getElementById === "function"
            ? documentRef.getElementById("media-browser-panel")
            : null;
        if (!panel || panel.classList.contains("media-browser-panel--hidden")) {
            return null;
        }
        if (panel.classList.contains("is-maximized") || panel.dataset.defaultLayoutManaged === "false") {
            return null;
        }
        return panel;
    }

    applyManagedMediaBrowserFrame(frame) {
        const panel = this.getManagedMediaBrowserPanel();
        if (!panel || typeof CustomEvent !== "function") {
            return false;
        }
        panel.dispatchEvent(new CustomEvent("moon-mission:media-browser-default-frame", {
            detail: frame,
        }));
        return true;
    }

    capturePanelFrame(panelState) {
        if (!panelState?.panel) {
            return null;
        }
        const panel = panelState.panel;
        return {
            x: Math.round(Number.isFinite(panelState.x) ? panelState.x : (panel.offsetLeft || 0)),
            y: Math.round(Number.isFinite(panelState.y) ? panelState.y : (panel.offsetTop || 0)),
            width: Math.round(panel.offsetWidth || panelState.width || 0),
            height: Math.round(panel.offsetHeight || panelState.height || 0),
        };
    }

    normalizePanelRestoreFrame(frame, fallbackFrame = null) {
        const source = frame && typeof frame === "object" ? frame : null;
        if (!source) {
            return fallbackFrame;
        }
        const width = Math.round(Number(source.width) || 0);
        const height = Math.round(Number(source.height) || 0);
        const x = Math.round(Number(source.x) || 0);
        const y = Math.round(Number(source.y) || 0);
        if (width <= 0 || height <= 0) {
            return fallbackFrame;
        }
        return { x, y, width, height };
    }

    resolveMaximizedPanelFrame(panelState) {
        const bounds = this.resolvePanelViewportBounds();
        if (panelState?.mode === "composer") {
            let width = Math.max(
                PANEL_MIN_SIDE_COMPOSER,
                Math.min(bounds.width, Math.round(bounds.height * COMPOSER_DEFAULT_ASPECT_RATIO)),
            );
            let height = Math.round(width / COMPOSER_DEFAULT_ASPECT_RATIO);
            if (height > bounds.height) {
                height = bounds.height;
                width = Math.round(height * COMPOSER_DEFAULT_ASPECT_RATIO);
            }
            width = Math.max(PANEL_MIN_SIDE_COMPOSER, Math.min(width, bounds.width));
            height = Math.max(PANEL_MIN_SIDE_COMPOSER, Math.min(height, bounds.height));
            return {
                x: Math.round(bounds.left + ((bounds.width - width) * 0.5)),
                y: Math.round(bounds.top + ((bounds.height - height) * 0.5)),
                width,
                height,
            };
        }

        const side = Math.max(PANEL_MIN_SIDE_DEFAULT, Math.min(bounds.width, bounds.height));
        return {
            x: Math.round(bounds.left + ((bounds.width - side) * 0.5)),
            y: Math.round(bounds.top + ((bounds.height - side) * 0.5)),
            width: side,
            height: side,
        };
    }

    applyMaximizedPanelFrame(panelState) {
        if (!panelState?.panel) {
            return;
        }
        const nextFrame = this.resolveMaximizedPanelFrame(panelState);
        panelState.panel.style.width = `${nextFrame.width}px`;
        panelState.panel.style.height = `${nextFrame.height}px`;
        this.applyPanelPosition(panelState, nextFrame.x, nextFrame.y);
    }

    syncPanelExpandButton(panelState) {
        const button = panelState?.expandButton;
        if (!button) {
            return;
        }
        const maximized = panelState.maximized === true;
        button.dataset.icon = maximized ? "restore" : "expand";
        button.textContent = "";
        button.title = maximized ? `Restore ${panelState.title}` : `Expand ${panelState.title}`;
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", maximized ? "true" : "false");
    }

    resolveComposerRequiredPanelHeight(panelState) {
        if (!panelState || panelState.mode !== "composer" || !panelState.panel) {
            return Number.NaN;
        }
        const header = panelState.panel.querySelector(".aux-camera-view__header");
        const controls = panelState.panel.querySelector(".aux-camera-view__composer-control-matrix");
        if (!header || !controls) {
            return Number.NaN;
        }
        const headerHeight = Math.ceil(header.getBoundingClientRect().height || 0);
        const controlsHeight = Math.ceil(controls.scrollHeight || 0);
        if (headerHeight <= 0 || controlsHeight <= 0) {
            return Number.NaN;
        }
        return headerHeight + controlsHeight + PANEL_GAP_PX;
    }

    scheduleDefaultPanelLayout() {
        if (this.defaultLayoutRaf != null) {
            cancelAnimationFrame(this.defaultLayoutRaf);
        }
        this.defaultLayoutRaf = requestAnimationFrame(() => {
            this.defaultLayoutRaf = null;
            if (!this.root) {
                return;
            }
            this.applyDefaultPanelLayout();
            this.queuePersistPanelState();
            this.requestRender?.();
        });
    }

    applyDefaultPanelLayout() {
        if (!this.panels.length) {
            return;
        }
        const viewportWidth = Math.max(window.innerWidth, 1);
        const viewportHeight = Math.max(window.innerHeight, 1);
        const bounds = this.resolvePanelViewportBounds();
        const dockOffset = this.readTimelineDockOffset();
        const maxSideFromWidth = Math.max(PANEL_MIN_SIDE_DEFAULT, viewportWidth - dockOffset - PANEL_MARGIN_PX * 2);
        const maxPanelWidth = Math.max(PANEL_MIN_SIDE_DEFAULT, viewportWidth - (PANEL_MARGIN_PX * 2));
        const maxPanelHeight = Math.max(PANEL_MIN_SIDE_DEFAULT, bounds.height);
        const panelRects = this.panels
            .filter((panelState) => panelState.defaultLayoutManaged !== false)
            .filter((panelState) => panelState.panel?.hidden !== true)
            .map((panelState) => {
            const isComposer = panelState.mode === "composer";
            const sideFromFormula = PANEL_DEFAULT_HEIGHT_RATIO * viewportHeight;
            const composerHeightFromFormula = PANEL_DEFAULT_HEIGHT_RATIO_COMPOSER * viewportHeight;
            const minSideTarget = isComposer ? PANEL_MIN_SIDE_COMPOSER : PANEL_MIN_SIDE_DEFAULT;
            const minSide = Math.min(minSideTarget, maxSideFromWidth);
            let width = isComposer
                ? Math.round(this.THREE.MathUtils.clamp(PANEL_DEFAULT_WIDTH_COMPOSER, minSide, maxPanelWidth))
                : Math.round(this.THREE.MathUtils.clamp(sideFromFormula, minSide, maxSideFromWidth));
            let height = isComposer
                ? Math.round(this.THREE.MathUtils.clamp(composerHeightFromFormula, minSide, maxPanelHeight))
                : width;
            if (isComposer) {
                // The controls column scrolls; don't let controls force the shooting frame huge.
                panelState.panel.style.width = `${width}px`;
            }
            panelState.panel.style.width = `${width}px`;
            panelState.panel.style.height = `${height}px`;
            return { panelState, width, height };
            });

        const composerRects = panelRects.filter((item) => item.panelState.mode === "composer");
        const rightPanelOrder = new Map([
            ["moon", 0],
            ["earth", 1],
            ["earth-to-moon", 2],
            ["earth-origin-orbit-xy", 3],
        ]);
        const rightPanelRects = panelRects
            .filter((item) => item.panelState.mode !== "composer" && item.panelState.side !== "left")
            .sort((a, b) => {
                const aOrder = rightPanelOrder.get(a.panelState.id) ?? Number.MAX_SAFE_INTEGER;
                const bOrder = rightPanelOrder.get(b.panelState.id) ?? Number.MAX_SAFE_INTEGER;
                return aOrder - bOrder;
            });
        const threePanelStackCanFit = rightPanelRects.length === 3 &&
            Math.floor((bounds.height - (2 * PANEL_GAP_PX)) / 3) >= PANEL_CSS_MIN_SIDE_DEFAULT;
        if (threePanelStackCanFit) {
            const preferredSide = Math.min(...rightPanelRects.map((item) => Math.min(item.width, item.height)));
            const maxSideFromHeight = Math.floor((bounds.height - (2 * PANEL_GAP_PX)) / 3);
            const mediaBrowserPanel = composerRects.length > 0 ? this.getManagedMediaBrowserPanel() : null;

            if (mediaBrowserPanel && composerRects.length > 0) {
                const mediaRect = mediaBrowserPanel.getBoundingClientRect?.() || null;
                const mediaWidth = Math.round(mediaRect?.width || mediaBrowserPanel.offsetWidth || 0);
                const mediaHeight = Math.round(mediaRect?.height || mediaBrowserPanel.offsetHeight || 0);
                const composerItem = composerRects[0];
                const composerWidth = Math.round(composerItem.width || composerItem.panelState.panel.offsetWidth || 0);
                const composerHeight = Math.round(composerItem.height || composerItem.panelState.panel.offsetHeight || 0);
                const maxColumnSide = Math.min(preferredSide, maxSideFromHeight);
                const sceneGapWidth = Math.max(
                    88,
                    Math.min(maxColumnSide, Math.round(bounds.width * 0.1)),
                );
                const maxSideFromWidth = Math.floor(
                    bounds.width - mediaWidth - sceneGapWidth - composerWidth - PANEL_GAP_PX,
                );
                if (
                    mediaWidth > 0 &&
                    mediaHeight > 0 &&
                    composerWidth > 0 &&
                    composerHeight > 0 &&
                    maxSideFromWidth >= PANEL_MIN_SIDE_DEFAULT
                ) {
                    const columnSide = Math.max(
                        PANEL_MIN_SIDE_DEFAULT,
                        Math.min(maxColumnSide, maxSideFromWidth),
                    );
                    const columnLeft = Math.round(bounds.right - columnSide);
                    const columnRight = columnLeft + columnSide;
                    const composerLeft = Math.round(columnLeft - PANEL_GAP_PX - composerWidth);
                    const mediaLeft = Math.round(bounds.left);
                    const columnTop = this.resolveRightStackTop({
                        bounds,
                        columnLeft,
                        columnRight,
                    });
                    const pairHeight = Math.max(mediaHeight, composerHeight);
                    const pairTop = bounds.top;

                    rightPanelRects.forEach((item, index) => {
                        item.width = columnSide;
                        item.height = columnSide;
                        item.panelState.panel.style.width = `${columnSide}px`;
                        item.panelState.panel.style.height = `${columnSide}px`;
                        this.applyPanelPosition(
                            item.panelState,
                            columnLeft,
                            columnTop + (index * (columnSide + PANEL_GAP_PX)),
                        );
                    });

                    for (const item of composerRects) {
                        this.applyPanelPosition(
                            item.panelState,
                            composerLeft,
                            pairTop + Math.round((pairHeight - composerHeight) * 0.5),
                        );
                    }

                    this.applyManagedMediaBrowserFrame({
                        x: mediaLeft,
                        y: pairTop + Math.round((pairHeight - mediaHeight) * 0.5),
                        width: mediaWidth,
                        height: mediaHeight,
                    });
                    return;
                }
            }

            const composerWidth = composerRects.length ? Math.max(...composerRects.map((item) => item.width)) : 0;
            const maxSideFromWidth = Math.floor(
                bounds.width - (composerWidth > 0 ? composerWidth + PANEL_GAP_PX : 0),
            );
            const columnSide = Math.max(
                PANEL_MIN_SIDE_DEFAULT,
                Math.min(preferredSide, maxSideFromHeight, maxSideFromWidth),
            );
            const columnHeight = (3 * columnSide) + (2 * PANEL_GAP_PX);
            const columnLeft = Math.round(bounds.right - columnSide);
            const columnRight = columnLeft + columnSide;
            const columnTop = this.resolveRightStackTop({
                bounds,
                columnLeft,
                columnRight,
            });

            rightPanelRects.forEach((item, index) => {
                item.width = columnSide;
                item.height = columnSide;
                item.panelState.panel.style.width = `${columnSide}px`;
                item.panelState.panel.style.height = `${columnSide}px`;
                this.applyPanelPosition(
                    item.panelState,
                    columnLeft,
                    columnTop + (index * (columnSide + PANEL_GAP_PX)),
                );
            });

            for (const item of composerRects) {
                const x = Math.round(columnLeft - PANEL_GAP_PX - item.width);
                this.applyPanelPosition(item.panelState, x, bounds.top);
            }
            return;
        }
        if (rightPanelRects.length === 4) {
            const columns = 2;
            const rows = 2;
            const preferredSide = Math.min(...rightPanelRects.map((item) => Math.min(item.width, item.height)));
            const maxSideFromHeight = Math.floor((bounds.height - ((rows - 1) * PANEL_GAP_PX)) / rows);
            const maxSideFromWidth = Math.floor((bounds.width - ((columns - 1) * PANEL_GAP_PX)) / columns);
            const gridSide = Math.max(
                PANEL_MIN_SIDE_DEFAULT,
                Math.min(preferredSide, maxSideFromHeight, maxSideFromWidth),
            );
            const gridWidth = (columns * gridSide) + ((columns - 1) * PANEL_GAP_PX);
            const gridHeight = (rows * gridSide) + ((rows - 1) * PANEL_GAP_PX);
            const gridLeft = Math.round(bounds.right - gridWidth);
            const gridTop = Math.round(bounds.top + Math.max(0, (bounds.height - gridHeight) * 0.5));

            rightPanelRects.forEach((item, index) => {
                item.width = gridSide;
                item.height = gridSide;
                item.panelState.panel.style.width = `${gridSide}px`;
                item.panelState.panel.style.height = `${gridSide}px`;
                const col = index % columns;
                const row = Math.floor(index / columns);
                this.applyPanelPosition(
                    item.panelState,
                    gridLeft + (col * (gridSide + PANEL_GAP_PX)),
                    gridTop + (row * (gridSide + PANEL_GAP_PX)),
                );
            });
            for (const item of composerRects) {
                const x = Math.round(bounds.left + ((bounds.width - item.width) * 0.5));
                const y = Math.round(bounds.top + ((bounds.height - item.height) * 0.5));
                this.applyPanelPosition(item.panelState, x, y);
            }
            return;
        }

        let rightColumnEdge = bounds.right;
        let rightColumnWidth = 0;
        let rightY = bounds.top;
        let rightPanelLeftEdge = bounds.right;
        for (const item of rightPanelRects) {
            if (rightY > bounds.top && (rightY + item.height) > bounds.bottom) {
                rightColumnEdge -= (rightColumnWidth + PANEL_GAP_PX);
                rightColumnWidth = 0;
                rightY = bounds.top;
            }

            const x = rightColumnEdge - item.width;
            rightPanelLeftEdge = Math.min(rightPanelLeftEdge, x);
            this.applyPanelPosition(item.panelState, x, rightY);
            rightY += item.height + PANEL_GAP_PX;
            if (item.width > rightColumnWidth) {
                rightColumnWidth = item.width;
            }
        }

        for (const item of composerRects) {
            const hasRightPanels = rightPanelRects.length > 0 && rightPanelLeftEdge < bounds.right;
            const x = hasRightPanels
                ? Math.max(bounds.left, Math.round(rightPanelLeftEdge - PANEL_GAP_PX - item.width))
                : Math.round(bounds.left + ((bounds.width - item.width) * 0.5));
            const y = hasRightPanels
                ? bounds.top
                : Math.round(bounds.top + ((bounds.height - item.height) * 0.5));
            this.applyPanelPosition(item.panelState, x, y);
        }
    }

    applyPanelPosition(panelState, x, y) {
        const width = Math.max(120, Math.round(panelState.panel.offsetWidth || panelState.width || 280));
        const height = Math.max(80, Math.round(panelState.panel.offsetHeight || panelState.height || 192));
        const clamped = this.clampPanelRect({ x, y, width, height });
        panelState.x = clamped.x;
        panelState.y = clamped.y;
        panelState.panel.style.left = `${panelState.x}px`;
        panelState.panel.style.top = `${panelState.y}px`;
        this.updateComposerControlsPopoverPosition(panelState);
    }

    clampPanelPosition(panelState) {
        const currentX = Number.isFinite(panelState.x) ? panelState.x : panelState.panel.offsetLeft;
        const currentY = Number.isFinite(panelState.y) ? panelState.y : panelState.panel.offsetTop;
        this.applyPanelPosition(panelState, currentX, currentY);
    }

    bringPanelToFront(panelState) {
        bringPanelElementToFront(this.root);
        this.zIndexCounter += 1;
        panelState.panel.style.zIndex = String(this.zIndexCounter);
    }

    setPanelMinimized(panelState, minimized, { persist = true, requestRender = true } = {}) {
        const nextMinimized = minimized === true;
        if (nextMinimized) {
            panelState.closed = false;
            panelState.deleted = false;
        }
        panelState.minimized = nextMinimized;
        panelState.panel.classList.toggle("is-minimized", nextMinimized);
        panelState.panel.hidden = nextMinimized;
        if (panelState.chipButton) {
            panelState.chipButton.hidden = !nextMinimized || panelState.closed === true;
            panelState.chipButton.setAttribute("aria-pressed", nextMinimized ? "true" : "false");
            panelState.chipButton.title = nextMinimized
                ? `Restore ${panelState.title}`
                : `Show ${panelState.title}`;
        }
        if (nextMinimized) {
            this.clearPanelOverlay(panelState);
        } else {
            this.scheduleVisiblePanelRefresh(panelState);
        }
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        this.syncPanelRegistry(panelState);
    }

    setPanelMaximized(panelState, maximized, { persist = true, requestRender = true } = {}) {
        if (!panelState?.panel) {
            return;
        }
        const nextMaximized = maximized === true;
        if (nextMaximized === (panelState.maximized === true)) {
            this.syncPanelExpandButton(panelState);
            return;
        }

        if (nextMaximized) {
            panelState.restoreFrame = this.capturePanelFrame(panelState);
            panelState.deleted = false;
            panelState.closed = false;
            panelState.minimized = false;
            panelState.maximized = true;
            panelState.panel.classList.add("is-maximized");
            this.applyMaximizedPanelFrame(panelState);
            this.bringPanelToFront(panelState);
        } else {
            panelState.maximized = false;
            panelState.panel.classList.remove("is-maximized");
            const restoreFrame = this.normalizePanelRestoreFrame(
                panelState.restoreFrame,
                this.capturePanelFrame(panelState),
            );
            if (restoreFrame) {
                panelState.panel.style.width = `${restoreFrame.width}px`;
                panelState.panel.style.height = `${restoreFrame.height}px`;
                this.applyPanelPosition(panelState, restoreFrame.x, restoreFrame.y);
            } else {
                this.clampPanelPosition(panelState);
            }
        }

        this.syncPanelExpandButton(panelState);
        this.syncPanelSize(panelState);
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        this.syncPanelRegistry(panelState);
    }

    setPanelClosed(panelState, closed, { persist = true, requestRender = true } = {}) {
        const nextClosed = closed === true;
        panelState.closed = nextClosed;
        if (nextClosed) {
            panelState.minimized = false;
            panelState.deleted = false;
        }
        if (nextClosed && this.isAuxiliaryPanelDocked(panelState)) {
            this.closeDockedAuxiliaryPanel(panelState);
        }
        panelState.panel.hidden = nextClosed || panelState.minimized === true;
        if (panelState.chipButton) {
            panelState.chipButton.hidden = nextClosed || panelState.minimized !== true;
        }
        if (nextClosed) {
            this.clearPanelOverlay(panelState);
        }
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        this.syncPanelRegistry(panelState);
    }

    setPanelDeleted(panelState, deleted, { persist = true, requestRender = true } = {}) {
        const nextDeleted = deleted === true;
        if (nextDeleted && panelState.maximized === true) {
            this.setPanelMaximized(panelState, false, {
                persist: false,
                requestRender: false,
            });
        }
        panelState.deleted = nextDeleted;
        if (nextDeleted) {
            panelState.minimized = false;
            panelState.closed = false;
            panelState.panel.hidden = true;
            if (panelState.chipButton) {
                panelState.chipButton.hidden = true;
            }
            this.clearPanelOverlay(panelState);
        }
        this.syncPanelExpandButton(panelState);
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        this.syncPanelRegistry(panelState);
    }

    restorePanel(panelState) {
        if (!panelState) {
            return;
        }
        const wasHidden = panelState.minimized === true || panelState.closed === true || panelState.deleted === true;
        panelState.deleted = false;
        panelState.closed = false;
        this.setPanelMinimized(panelState, false, {
            persist: true,
            requestRender: false,
        });
        if (this.isDockviewAuxiliaryPanelEnabled()) {
            this.ensureAuxiliaryPanelDocked(panelState);
        }
        if (wasHidden && panelState.defaultLayoutManaged !== false) {
            this.scheduleDefaultPanelLayout();
        }
        if (this.isAuxiliaryPanelDocked(panelState)) {
            getDockviewSpikeLayoutHost()?.focusPanel?.(panelState.panelRegistryId);
        } else {
            this.bringPanelToFront(panelState);
        }
        this.requestRender?.();
        this.syncPanelRegistry(panelState);
    }

    readComposerViewState(panelState) {
        return {
            lockTarget: panelState?.composerLockTarget,
            autoFovEnabled: panelState?.autoFovEnabled === true,
            orientationReference: panelState?.composerOrientationReference,
            surfaceTarget: panelState?.composerSurfaceTarget || null,
            mediaDriven: panelState?.composerMediaDriven === true,
        };
    }

    applyComposerViewState(panelState, viewState, {
        syncComposerLockUi = null,
        syncAutoToggleUi = null,
        persist = true,
        requestRender = true,
    } = {}) {
        if (!panelState || panelState.mode !== "composer" || !viewState) {
            return false;
        }
        panelState.composerLockTarget = viewState.lockTarget || "none";
        panelState.autoFovEnabled = viewState.autoFovEnabled === true;
        this.setComposerOrientationReference(
            panelState,
            viewState.orientationReference || "world",
            { preserveView: false },
        );
        panelState.composerSurfaceTarget = viewState.surfaceTarget || null;
        panelState.composerMediaDriven = viewState.mediaDriven === true;
        if (Number.isFinite(viewState.manualFovDegrees)) {
            this.setPanelFov(panelState, viewState.manualFovDegrees);
        }
        if (typeof syncComposerLockUi === "function") {
            syncComposerLockUi();
        }
        if (typeof syncAutoToggleUi === "function") {
            syncAutoToggleUi();
        }
        if (requestRender) {
            this.requestRender?.();
        }
        if (persist) {
            this.queuePersistPanelState?.();
        }
        return true;
    }

    applyComposerViewIntent(panelState, intent, options = {}) {
        const result = resolveComposerViewIntent(this.readComposerViewState(panelState), intent);
        if (!result.applied) {
            return false;
        }
        return this.applyComposerViewState(panelState, result.state, options);
    }

    applyComposerGuidedViewState(panelState, options = {}) {
        return this.applyComposerViewIntent(panelState, { type: "guided" }, options);
    }

    restoreComposerGuidedPanel(panelState, { seekTimeMs = Number.NaN } = {}) {
        if (!panelState || panelState.mode !== "composer") {
            return false;
        }
        this.restorePanel(panelState);
        this.applyComposerGuidedViewState(panelState, {
            syncComposerLockUi: panelState.syncComposerLockUi,
            syncAutoToggleUi: panelState.syncComposerAutoToggleUi,
            persist: false,
        });
        if (Number.isFinite(seekTimeMs)) {
            this.seekMainTimelineTime(seekTimeMs, true);
        }
        this.requestRender?.();
        this.queuePersistPanelState?.();
        return true;
    }

    getComposerPanelState() {
        return this.panels.find((panelState) => panelState?.mode === "composer") || null;
    }

    handleMissionMediaItemSelect(event) {
        const item = event?.detail?.item;
        const hint = event?.detail?.shotViewHint || inferMediaShotViewHint(item);
        if (!hint) {
            return false;
        }
        const panelState = this.getComposerPanelState();
        if (!panelState || panelState.missionEnabled !== true) {
            return false;
        }
        this.restorePanel(panelState);
        return this.applyComposerMediaShotHint(panelState, hint);
    }

    applyComposerMediaShotHint(panelState, hint, { persist = true } = {}) {
        if (!panelState || panelState.mode !== "composer" || !hint) {
            return false;
        }
        const result = resolveComposerViewIntent(this.readComposerViewState(panelState), {
            type: "media-shot",
            hint,
        });
        if (!result.applied) {
            return false;
        }
        return this.applyComposerViewState(panelState, result.state, {
            syncComposerLockUi: panelState.syncComposerLockUi,
            syncAutoToggleUi: panelState.syncComposerAutoToggleUi,
            persist,
        });
    }

    updateComposerChipPresentation(panelState) {
        if (!panelState || panelState.mode !== "composer" || !panelState.chipButton) {
            return;
        }
        const chip = panelState.chipButton;
        chip.classList.remove("aux-camera-chip--composer-teaser");
        chip.classList.add("aux-camera-chip--composer-tab");
        chip.replaceChildren();
        chip.textContent = "Frame and Shoot";
        chip.setAttribute("aria-label", `Open ${panelState.title}`);
    }

    scheduleVisiblePanelRefresh(panelState) {
        if (!panelState?.panel || !panelState?.viewport || panelState.panel.hidden) {
            return;
        }
        if (panelState.visibleRefreshRaf != null) {
            cancelAnimationFrame(panelState.visibleRefreshRaf);
        }
        panelState.visibleRefreshRaf = requestAnimationFrame(() => {
            panelState.visibleRefreshRaf = null;
            if (!panelState?.panel || !panelState?.viewport || panelState.panel.hidden) {
                return;
            }
            this.syncPanelSize(panelState);
            this.requestRender?.();
        });
    }

    scheduleVisiblePanelsRefresh() {
        if (this.visiblePanelsRefreshRaf != null) {
            cancelAnimationFrame(this.visiblePanelsRefreshRaf);
        }
        this.visiblePanelsRefreshRaf = requestAnimationFrame(() => {
            this.visiblePanelsRefreshRaf = null;
            for (const panelState of this.panels) {
                if (!panelState?.panel || !panelState?.viewport || panelState.panel.hidden) {
                    continue;
                }
                this.syncPanelSize(panelState);
            }
            this.requestRender?.();
        });
    }

    shouldStartDrag(event) {
        if (event.button !== 0) return false;
        if (!isDomElement(event.target)) return false;
        return !event.target.closest("input, button, select, option, label, output");
    }

    isDockviewAuxiliaryPanelEnabled() {
        return !!getDockviewSpikeLayoutHost();
    }

    isAuxiliaryPanelDocked(panelState) {
        return !!panelState?.panel?.classList?.contains?.("aux-camera-view--dockview");
    }

    ensureAuxiliaryPanelDocked(panelState) {
        if (!panelState?.panel || !panelState.panelRegistryId) {
            return false;
        }
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) {
            return false;
        }
        if (layoutHost.api?.getPanel?.(panelState.panelRegistryId)) {
            return true;
        }
        layoutHost.addPanel({
            id: panelState.panelRegistryId,
            component: "mounted-element",
            title: panelState.title,
            position: resolveDockedWorkflowPanelPosition(layoutHost, panelState.panelRegistryId),
            params: {
                mountElementId: panelState.panel.id,
                mountClassName: "aux-camera-view--dockview",
                fallbackParentId: "aux-camera-views",
            },
            initialWidth: panelState.mode === "composer" ? 320 : 200,
            initialHeight: panelState.mode === "composer" ? 360 : 260,
            minimumWidth: panelState.mode === "composer" ? 280 : 170,
            minimumHeight: panelState.mode === "composer" ? 260 : 180,
        });
        layoutHost.focusPanel(panelState.panelRegistryId);
        return true;
    }

    openComposerControlsPanel(panelState) {
        if (!panelState || panelState.mode !== "composer" || !panelState.composerControlMatrix) {
            return false;
        }
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) {
            return false;
        }
        this.ensureAuxiliaryPanelDocked(panelState);
        if (!layoutHost.api?.getPanel?.(COMPOSER_CONTROLS_PANEL_ID)) {
            layoutHost.addPanel({
                id: COMPOSER_CONTROLS_PANEL_ID,
                component: "mounted-element",
                title: "Frame Controls",
                floating: this.resolveComposerControlsFloatingFrame(panelState),
                params: {
                    mountElementId: COMPOSER_CONTROLS_PANEL_ID,
                    mountClassName: "aux-camera-view__composer-control-matrix--dockview",
                    fallbackParentId: panelState.panel.id,
                },
                initialWidth: 320,
                minimumWidth: 280,
                minimumHeight: 260,
            });
        }
        panelState.composerControlsDockviewOpen = true;
        this.syncComposerControlsPanelRegistry(panelState);
        this.syncComposerControlsToggleUi(panelState);
        layoutHost.focusPanel(COMPOSER_CONTROLS_PANEL_ID);
        return true;
    }

    resolveComposerControlsFloatingFrame(panelState) {
        const frameRect = panelState?.panel?.getBoundingClientRect?.() || {};
        const workspaceRect = getDockviewSpikeLayoutHost()?.root?.getBoundingClientRect?.() || {};
        const viewportWidth = Math.max(1, Number(globalThis?.innerWidth) || 1440);
        const viewportHeight = Math.max(1, Number(globalThis?.innerHeight) || 900);
        const edgePad = 8;
        const gap = 8;
        const width = Math.min(
            340,
            Math.max(300, Math.round((Number(frameRect.width) || 320) * 0.7)),
        );
        const top = Math.max(
            edgePad,
            Math.round(Number(workspaceRect.top) || edgePad),
        );
        const height = Math.max(
            260,
            Math.min(
                viewportHeight - top - edgePad,
                Math.round(Number(workspaceRect.height) || (viewportHeight - top - edgePad)),
            ),
        );
        let x = Math.round((Number(frameRect.left) || (viewportWidth - width - edgePad)) - width - gap);
        if (x < edgePad) {
            x = Math.round((Number(frameRect.right) || edgePad) + gap);
        }
        x = Math.min(Math.max(edgePad, x), Math.max(edgePad, viewportWidth - width - edgePad));
        return { x, y: top, width, height };
    }

    closeComposerControlsPanel(panelState) {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (layoutHost) {
            layoutHost.closePanel(COMPOSER_CONTROLS_PANEL_ID);
        }
        if (panelState) {
            panelState.composerControlsDockviewOpen = false;
            this.syncComposerControlsPanelRegistry(panelState);
            this.syncComposerControlsToggleUi(panelState);
        }
        return true;
    }

    toggleComposerControlsPanel(panelState) {
        if (!panelState) {
            return false;
        }
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost) {
            return false;
        }
        if (layoutHost.api?.getPanel?.(COMPOSER_CONTROLS_PANEL_ID)) {
            return this.closeComposerControlsPanel(panelState);
        }
        return this.openComposerControlsPanel(panelState);
    }

    syncComposerControlsToggleUi(panelState) {
        const toggle = panelState?.composerControlsToggleButton;
        if (!toggle) return;
        const dockviewEnabled = this.isDockviewAuxiliaryPanelEnabled();
        const expanded = dockviewEnabled
            ? !!getDockviewSpikeLayoutHost()?.api?.getPanel?.(COMPOSER_CONTROLS_PANEL_ID)
            : panelState.composerControlsCollapsed !== true;
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggle.setAttribute(
            "aria-label",
            expanded ? "Close Frame and Shoot controls" : "Open Frame and Shoot controls",
        );
        toggle.title = expanded ? "Close controls" : "Open controls";
    }

    syncComposerControlsPanelRegistry(panelState) {
        if (!panelState || panelState.mode !== "composer") {
            return;
        }
        const layoutHost = getDockviewSpikeLayoutHost();
        const isOpen = !!layoutHost?.api?.getPanel?.(COMPOSER_CONTROLS_PANEL_ID);
        panelState.composerControlsDockviewOpen = isOpen;
        updateMissionPanel(COMPOSER_CONTROLS_PANEL_ID, {
            id: COMPOSER_CONTROLS_PANEL_ID,
            title: "Frame Controls",
            kind: "workflow",
            panelType: "flyby-controls",
            builtIn: true,
            available: panelState.missionEnabled === true,
            state: isOpen ? "open" : "closed",
            sortOrder: Number.isFinite(panelState.sortOrder) ? panelState.sortOrder + 1 : 0,
            infoItems: [
                { label: "Panel Kind", value: "controls" },
                { label: "For", value: "Frame and Shoot" },
            ],
            actions: {
                open: panelState.missionEnabled === true
                    ? () => this.openComposerControlsPanel(panelState)
                    : undefined,
                restore: panelState.missionEnabled === true
                    ? () => this.openComposerControlsPanel(panelState)
                    : undefined,
                focus: isOpen
                    ? () => layoutHost?.focusPanel?.(COMPOSER_CONTROLS_PANEL_ID)
                    : undefined,
                close: () => this.closeComposerControlsPanel(panelState),
            },
        });
        this.syncComposerControlsToggleUi(panelState);
    }

    closeDockedAuxiliaryPanel(panelState) {
        const layoutHost = getDockviewSpikeLayoutHost();
        if (!layoutHost || !panelState?.panelRegistryId) {
            return false;
        }
        return layoutHost.closePanel(panelState.panelRegistryId);
    }

    bindPanelDragging(panelState, header) {
        const onPointerDown = (event) => {
            if (this.isAuxiliaryPanelDocked(panelState)) {
                return;
            }
            if (panelState?.maximized === true) {
                return;
            }
            if (!this.shouldStartDrag(event)) return;
            panelState.defaultLayoutManaged = false;
            this.bringPanelToFront(panelState);
            this.dragState = {
                panelState,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                panelX: Number.isFinite(panelState.x) ? panelState.x : panelState.panel.offsetLeft,
                panelY: Number.isFinite(panelState.y) ? panelState.y : panelState.panel.offsetTop,
            };
            header.setPointerCapture(event.pointerId);
            event.preventDefault();
        };

        const onPointerMove = (event) => {
            if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
            const dx = event.clientX - this.dragState.startX;
            const dy = event.clientY - this.dragState.startY;
            this.applyPanelPosition(
                this.dragState.panelState,
                this.dragState.panelX + dx,
                this.dragState.panelY + dy,
            );
        };

        const releaseDrag = (event) => {
            if (!this.dragState || this.dragState.pointerId !== event.pointerId) return;
            if (header.hasPointerCapture(event.pointerId)) {
                header.releasePointerCapture(event.pointerId);
            }
            this.dragState = null;
            this.queuePersistPanelState();
        };

        header.addEventListener("pointerdown", onPointerDown);
        header.addEventListener("pointermove", onPointerMove);
        header.addEventListener("pointerup", releaseDrag);
        header.addEventListener("pointercancel", releaseDrag);
        panelState.onPointerDown = onPointerDown;
        panelState.onPointerMove = onPointerMove;
        panelState.onPointerUp = releaseDrag;
        panelState.onPointerCancel = releaseDrag;
    }

    applyPanelFrame(panelState, { x, y, width, height }) {
        if (!panelState?.panel) {
            return;
        }
        const isComposer = panelState.mode === "composer";
        const minSize = isComposer ? PANEL_MIN_SIDE_COMPOSER : PANEL_MIN_SIDE_DEFAULT;
        const nextWidth = Math.round(Math.max(minSize, Number(width) || minSize));
        const nextHeight = Math.round(Math.max(minSize, Number(height) || minSize));
        panelState.x = Math.round(Number(x) || 0);
        panelState.y = Math.round(Number(y) || 0);
        panelState.panel.style.left = `${panelState.x}px`;
        panelState.panel.style.top = `${panelState.y}px`;
        panelState.panel.style.width = `${nextWidth}px`;
        panelState.panel.style.height = `${isComposer ? nextHeight : nextWidth}px`;
        this.syncPanelSize(panelState);
    }

    bindPanelResizing(panelState, resizeGrip) {
        if (!panelState?.panel || !resizeGrip) {
            return;
        }
        const RESIZE_HIT_PX = 28;
        const RESIZE_EDGE_FUZZ_PX = 2;

        const resolveCornerFromEvent = (event) => {
            const grip = isDomElement(event.target)
                ? event.target.closest(".aux-camera-view__resize-grip")
                : null;
            const gripCorner = asTrimmedString(grip?.dataset?.resizeCorner);
            if (gripCorner) {
                return gripCorner;
            }

            const rect = panelState.panel.getBoundingClientRect();
            const nearLeft = event.clientX >= rect.left - RESIZE_EDGE_FUZZ_PX &&
                event.clientX <= rect.left + RESIZE_HIT_PX;
            const nearRight = event.clientX >= rect.right - RESIZE_HIT_PX &&
                event.clientX <= rect.right + RESIZE_EDGE_FUZZ_PX;
            const nearTop = event.clientY >= rect.top - RESIZE_EDGE_FUZZ_PX &&
                event.clientY <= rect.top + RESIZE_HIT_PX;
            const nearBottom = event.clientY >= rect.bottom - RESIZE_HIT_PX &&
                event.clientY <= rect.bottom + RESIZE_EDGE_FUZZ_PX;
            if (nearLeft && nearTop) return "nw";
            if (nearRight && nearTop) return "ne";
            if (nearLeft && nearBottom) return "sw";
            if (nearRight && nearBottom) return "se";
            return "";
        };

        const resolveResizeFrame = (resizeState, event) => {
            const bounds = this.resolvePanelViewportBounds();
            const isComposer = resizeState.panelState.mode === "composer";
            const minSize = isComposer ? PANEL_MIN_SIDE_COMPOSER : PANEL_MIN_SIDE_DEFAULT;
            const dx = event.clientX - resizeState.startX;
            const dy = event.clientY - resizeState.startY;
            const corner = resizeState.corner || "se";
            let left = resizeState.x;
            let top = resizeState.y;
            let right = resizeState.x + resizeState.width;
            let bottom = resizeState.y + resizeState.height;

            if (corner.includes("w")) {
                left += dx;
                left = this.THREE.MathUtils.clamp(left, bounds.left, right - minSize);
            } else {
                right += dx;
                right = this.THREE.MathUtils.clamp(right, left + minSize, bounds.right);
            }

            if (corner.includes("n")) {
                top += dy;
                top = this.THREE.MathUtils.clamp(top, bounds.top, bottom - minSize);
            } else {
                bottom += dy;
                bottom = this.THREE.MathUtils.clamp(bottom, top + minSize, bounds.bottom);
            }

            if (!isComposer) {
                const maxWidth = corner.includes("w") ? right - bounds.left : bounds.right - left;
                const maxHeight = corner.includes("n") ? bottom - bounds.top : bounds.bottom - top;
                const side = Math.round(this.THREE.MathUtils.clamp(
                    Math.max(right - left, bottom - top),
                    minSize,
                    Math.max(minSize, Math.min(maxWidth, maxHeight)),
                ));
                if (corner.includes("w")) {
                    left = right - side;
                } else {
                    right = left + side;
                }
                if (corner.includes("n")) {
                    top = bottom - side;
                } else {
                    bottom = top + side;
                }
            }

            return {
                x: Math.round(left),
                y: Math.round(top),
                width: Math.round(right - left),
                height: Math.round(bottom - top),
            };
        };

        const startResize = (event, captureTarget, corner) => {
            if (this.isAuxiliaryPanelDocked(panelState)) {
                return;
            }
            if (panelState.maximized === true) {
                panelState.maximized = false;
                panelState.restoreFrame = null;
                panelState.panel.classList.remove("is-maximized");
                this.syncPanelExpandButton(panelState);
            }
            panelState.defaultLayoutManaged = false;
            this.bringPanelToFront(panelState);
            this.resizeState = {
                panelState,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                x: Number.isFinite(panelState.x) ? panelState.x : panelState.panel.offsetLeft,
                y: Number.isFinite(panelState.y) ? panelState.y : panelState.panel.offsetTop,
                width: panelState.panel.offsetWidth || panelState.width || 0,
                height: panelState.panel.offsetHeight || panelState.height || 0,
                corner,
                captureTarget,
            };
            captureTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
        };

        const onPointerDown = (event) => {
            if (event.button !== 0) {
                return;
            }
            const corner = resolveCornerFromEvent(event) || "se";
            startResize(event, resizeGrip, corner);
        };

        const onPanelPointerDown = (event) => {
            if (isDomElement(event.target) && event.target.closest("input, button, select, option, label, output, a")) {
                return;
            }
            const corner = resolveCornerFromEvent(event);
            if (event.button !== 0 || !corner) {
                return;
            }
            startResize(event, panelState.panel, corner);
        };

        const onPointerMove = (event) => {
            if (!this.resizeState || this.resizeState.pointerId !== event.pointerId) {
                return;
            }
            this.applyPanelFrame(this.resizeState.panelState, resolveResizeFrame(this.resizeState, event));
            this.requestRender?.();
            event.preventDefault();
        };

        const releaseResize = (event) => {
            if (!this.resizeState || this.resizeState.pointerId !== event.pointerId) {
                return;
            }
            const captureTarget = this.resizeState.captureTarget || resizeGrip;
            if (captureTarget.hasPointerCapture(event.pointerId)) {
                captureTarget.releasePointerCapture(event.pointerId);
            }
            this.resizeState = null;
            this.queuePersistPanelState();
            event.preventDefault();
        };

        panelState.panel.addEventListener("pointerdown", onPanelPointerDown, true);
        panelState.panel.addEventListener("pointermove", onPointerMove);
        panelState.panel.addEventListener("pointerup", releaseResize);
        panelState.panel.addEventListener("pointercancel", releaseResize);
        resizeGrip.addEventListener("pointerdown", onPointerDown);
        resizeGrip.addEventListener("pointermove", onPointerMove);
        resizeGrip.addEventListener("pointerup", releaseResize);
        resizeGrip.addEventListener("pointercancel", releaseResize);
        panelState.resizeGrip = resizeGrip;
        panelState.onResizePointerDown = onPointerDown;
        panelState.onPanelResizePointerDown = onPanelPointerDown;
        panelState.onResizePointerMove = onPointerMove;
        panelState.onResizePointerUp = releaseResize;
        panelState.onResizePointerCancel = releaseResize;
    }

    createPanel(spec, index) {
        const panel = document.createElement("section");
        panel.className = "aux-camera-view mission-panel-shell";
        panel.dataset.target = spec.targetKey;
        panel.dataset.infoMode = spec.infoMode || "none";

        const header = document.createElement("div");
        header.className = "aux-camera-view__header mission-panel-shell__header";

        const title = document.createElement("div");
        title.className = "aux-camera-view__title mission-panel-shell__title";
        title.textContent = spec.title;
        header.appendChild(title);

        const headerControls = document.createElement("div");
        headerControls.className = "aux-camera-view__header-controls mission-panel-shell__header-controls";
        let panelControls = null;

        const isComposerPanel = spec.mode === "composer";
        const maxFovDegrees = isComposerPanel ? COMPOSER_MANUAL_FOV_MAX_DEGREES : AUTO_FOV_MAX_DEGREES;
        const fovControls = document.createElement("div");
        fovControls.className = "aux-camera-view__fov-controls";
        const fovControl = mountMissionFovControl(fovControls, {
            groupAriaLabel: `${spec.title} field of view`,
            autoButtonAriaLabel: `${spec.title} automatic field of view`,
            sliderAriaLabel: `${spec.title} zoom slider`,
            valueAriaLabel: `${spec.title} field of view value`,
            initialFovDegrees: spec.defaultFov,
            minDegrees: AUTO_FOV_MIN_DEGREES,
            maxDegrees: maxFovDegrees,
            classNames: {
                label: ["aux-camera-view__fov-label"],
                autoButton: ["aux-camera-view__auto-toggle"],
                track: ["aux-camera-view__fov-track"],
                edge: ["aux-camera-view__fov-edge"],
                slider: ["aux-camera-view__fov-slider"],
                value: ["aux-camera-view__fov-value"],
            },
        });
        const { autoButton: autoToggle, slider: fovSlider, value: fovValue } = fovControl;

        const expandButton = document.createElement("button");
        expandButton.className = "aux-camera-view__header-button aux-camera-view__expand-button mission-panel-shell__button mission-panel-shell__button--icon";
        expandButton.type = "button";
        expandButton.dataset.icon = "expand";
        expandButton.textContent = "";
        expandButton.setAttribute("aria-label", `Expand ${spec.title}`);

        const infoButton = document.createElement("button");
        infoButton.className = "aux-camera-view__header-button aux-camera-view__info-button mission-panel-shell__button mission-panel-shell__button--icon";
        infoButton.type = "button";
        infoButton.dataset.icon = "info";
        infoButton.textContent = "";
        infoButton.setAttribute("aria-label", `Show info for ${spec.title}`);
        infoButton.dataset.panelInfoTrigger = "true";

        const closeButton = document.createElement("button");
        closeButton.className = "aux-camera-view__header-button aux-camera-view__close-button mission-panel-shell__button mission-panel-shell__button--icon";
        closeButton.type = "button";
        closeButton.dataset.icon = "close";
        closeButton.textContent = "";
        closeButton.setAttribute("aria-label", `Close ${spec.title}`);

        const deleteButton = document.createElement("button");
        deleteButton.className = "aux-camera-view__header-button aux-camera-view__delete-button mission-panel-shell__button mission-panel-shell__button--icon mission-panel-shell__button--danger";
        deleteButton.type = "button";
        deleteButton.dataset.icon = "delete";
        deleteButton.textContent = "";
        deleteButton.setAttribute("aria-label", `Delete ${spec.title}`);

        let composerControlsToggleButton = null;
        if (spec.mode === "composer") {
            composerControlsToggleButton = document.createElement("button");
            composerControlsToggleButton.className = "aux-camera-view__composer-controls-toggle mission-panel-shell__button mission-panel-shell__button--icon";
            composerControlsToggleButton.type = "button";
            composerControlsToggleButton.textContent = "";
            composerControlsToggleButton.setAttribute("aria-label", "Collapse Frame and Shoot controls");
            composerControlsToggleButton.setAttribute("aria-expanded", "true");
            composerControlsToggleButton.title = "Collapse controls";
        }

        headerControls.appendChild(infoButton);
        headerControls.appendChild(expandButton);
        headerControls.appendChild(closeButton);
        headerControls.appendChild(deleteButton);
        header.appendChild(headerControls);
        panel.appendChild(header);

        const panelMode = spec.mode || "target";
        const panelSide = spec.side === "left" ? "left" : "right";
        panel.dataset.mode = panelMode;
        panel.dataset.side = panelSide;
        if (panelMode === "composer") {
            panel.classList.add("aux-camera-view--composer");
        } else {
            panelControls = document.createElement("div");
            panelControls.className = "aux-camera-view__panel-controls";
            panelControls.appendChild(fovControls);
            panel.appendChild(panelControls);
        }

        let info = null;
        let infoPrimary = null;
        let infoPrimaryText = null;
        let infoPill = null;
        let infoSecondary = null;
        let composerPresetWrap = null;
        let composerLookFreeButton = null;
        let composerLookEarthButton = null;
        let composerLookMoonButton = null;
        let composerControlMatrix = null;
        let composerSkyControlsWrap = null;
        let composerSkyTimelineWrap = null;
        let composerInfoRow = null;
        let composerFovWrap = null;
        let composerTimelineWrap = null;
        let composerTransportRow = null;
        let composerTransportPlayButton = null;
        let composerTransportMinusSecondButton = null;
        let composerTransportMinusMinuteButton = null;
        let composerTransportPlusMinuteButton = null;
        let composerTransportPlusSecondButton = null;
        let composerTransportSlowerButton = null;
        let composerTransportSpeedButton = null;
        let composerTransportFasterButton = null;
        let composerPhasePrevButton = null;
        let composerPhaseDetails = null;
        let composerPhaseSummary = null;
        let composerPhaseOptionsWrap = null;
        let composerPhaseNextButton = null;
        let composerTimelineSlider = null;
        let composerTimelineLabel = null;
        let composerTimelineLocalValue = null;
        let composerFlybyEventsDetails = null;
        let composerFlybyEventsSummary = null;
        let composerFlybyEventsWrap = null;
        let composerControlsWrap = null;
        let composerResetButton = null;
        let composerEarthAmbientSlider = null;
        let composerEarthAmbientValue = null;
        let composerMoonAmbientSlider = null;
        let composerMoonAmbientValue = null;
        let composerEarthshineSlider = null;
        let composerEarthshineValue = null;
        let composerMoonshineSlider = null;
        let composerMoonshineValue = null;
        let composerMoonOutlineWrap = null;
        let composerMoonOutlineCheckbox = null;
        let composerSeeThroughWrap = null;
        let composerSeeThroughCheckbox = null;
        let composerOpticsWrap = null;
        let composerOpticsBody = null;
        let composerOpticsToggleButton = null;
        let composerOpticsPhysicalButton = null;
        let composerOpticsCameraButton = null;
        let composerExposureSlider = null;
        let composerExposureValue = null;
        let composerExposureTotalValue = null;
        let composerAutoExposureWrap = null;
        let composerAutoExposureCheckbox = null;
        let composerOpticsStrengthSlider = null;
        let composerOpticsStrengthValue = null;
        let composerOpticsAdvancedPanel = null;
        let composerOpticsHaloSlider = null;
        let composerOpticsHaloValue = null;
        let composerOpticsStarburstSlider = null;
        let composerOpticsStarburstValue = null;
        let composerOpticsFlareSlider = null;
        let composerOpticsFlareValue = null;
        let composerEclipseCoronaPanel = null;
        let composerEclipseCoronaIntensitySlider = null;
        let composerEclipseCoronaIntensityValue = null;
        let composerEclipseCoronaMotionSlider = null;
        let composerEclipseCoronaMotionValue = null;
        let composerEclipseCoronaStructureSlider = null;
        let composerEclipseCoronaStructureValue = null;
        let composerEclipseZodiacalDustSlider = null;
        let composerEclipseZodiacalDustValue = null;
        let composerRollWrap = null;
        let composerRollSlider = null;
        let composerRollValue = null;
        let composerRollDial = null;
        let composerRollDialKnob = null;
        let composerRollDialValue = null;
        let composerInfoOverlayWrap = null;
        let composerInfoOverlayCheckbox = null;
        let composerRaDecGridWrap = null;
        let composerRaDecGridCheckbox = null;
        let composerSkyLabelsWrap = null;
        let composerSkyLabelsCheckbox = null;
        let composerConstellationLinesWrap = null;
        let composerConstellationLinesCheckbox = null;
        let composerConstellationLabelsWrap = null;
        let composerConstellationLabelsCheckbox = null;
        let composerCloudsWrap = null;
        let composerCloudsCheckbox = null;
        let composerLunarCratersWrap = null;
        let composerLunarCratersPill = null;
        let composerLunarCraterControls = null;
        let composerSurfacePointsWrap = null;
        let composerSurfacePointsPill = null;
        let composerSurfacePointControls = null;
        let composerTranscriptSyncedCheckbox = null;
        let composerTranscriptWindowSlider = null;
        let composerTranscriptWindowValue = null;
        let composerTranscriptHoldSlider = null;
        let composerTranscriptHoldValue = null;
        let composerTranscriptPrevButton = null;
        let composerTranscriptNextButton = null;
        let composerStarMagnitudeSlider = null;
        let composerStarMagnitudeValue = null;
        let composerHint = null;
        let composerMetricsStrip = null;
        let composerLunarFeatureStack = null;
        let composerLunarFeatureStackHeader = null;
        let composerLunarFeatureStackList = null;
        let composerLunarFeatureStackCloseButton = null;
        let composerLunarFeatureStackRestoreButton = null;
        let composerMetricFovHValue = null;
        let composerMetricFovVValue = null;
        let composerMetricDistanceMoonValue = null;
        let composerMetricAngleValue = null;
        let composerDisabledOverlay = null;
        if (panelMode === "composer") {
            if (headerControls.contains(fovControls)) {
                headerControls.removeChild(fovControls);
            }
            composerControlMatrix = document.createElement("div");
            composerControlMatrix.className = "aux-camera-view__composer-control-matrix";
            composerControlMatrix.id = COMPOSER_CONTROLS_PANEL_ID;
            composerControlMatrix.dataset.panelId = COMPOSER_CONTROLS_PANEL_ID;
            if (composerControlsToggleButton) {
                composerControlMatrix.appendChild(composerControlsToggleButton);
            }

            composerSkyControlsWrap = document.createElement("div");
            composerSkyControlsWrap.className = "aux-camera-view__composer-sky-controls";
            composerSkyTimelineWrap = document.createElement("div");
            composerSkyTimelineWrap.className = "aux-camera-view__composer-sky-timeline";

            composerInfoRow = document.createElement("div");
            composerInfoRow.className = "aux-camera-view__composer-info-row";
            const composerInfoLabel = document.createElement("span");
            composerInfoLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
            composerInfoLabel.textContent = "Overlays";
            composerInfoRow.appendChild(composerInfoLabel);

            const composerInfoToggles = document.createElement("div");
            composerInfoToggles.className = "aux-camera-view__composer-lock-buttons";

            composerInfoOverlayWrap = document.createElement("label");
            composerInfoOverlayWrap.className = "aux-camera-view__composer-grid-toggle";
            composerInfoOverlayCheckbox = document.createElement("input");
            composerInfoOverlayCheckbox.type = "checkbox";
            composerInfoOverlayCheckbox.setAttribute("aria-label", "Toggle composer info overlay");
            const composerInfoOverlayText = document.createElement("span");
            composerInfoOverlayText.textContent = "Info";
            composerInfoOverlayWrap.appendChild(composerInfoOverlayCheckbox);
            composerInfoOverlayWrap.appendChild(composerInfoOverlayText);
            composerInfoToggles.appendChild(composerInfoOverlayWrap);

            composerSkyLabelsWrap = document.createElement("label");
            composerSkyLabelsWrap.className = "aux-camera-view__composer-grid-toggle";
            composerSkyLabelsCheckbox = document.createElement("input");
            composerSkyLabelsCheckbox.type = "checkbox";
            composerSkyLabelsCheckbox.setAttribute("aria-label", "Toggle composer sky labels");
            composerSkyLabelsCheckbox.dataset.proofId = "sky-labels-toggle";
            const composerSkyLabelsText = document.createElement("span");
            composerSkyLabelsText.textContent = "Labels";
            composerSkyLabelsWrap.appendChild(composerSkyLabelsCheckbox);
            composerSkyLabelsWrap.appendChild(composerSkyLabelsText);
            composerInfoToggles.appendChild(composerSkyLabelsWrap);

            composerConstellationLinesWrap = document.createElement("label");
            composerConstellationLinesWrap.className = "aux-camera-view__composer-grid-toggle";
            composerConstellationLinesCheckbox = document.createElement("input");
            composerConstellationLinesCheckbox.type = "checkbox";
            composerConstellationLinesCheckbox.setAttribute("aria-label", "Toggle composer constellation lines");
            composerConstellationLinesCheckbox.dataset.proofId = "constellation-lines-toggle";
            const composerConstellationLinesText = document.createElement("span");
            composerConstellationLinesText.textContent = "Constellations";
            composerConstellationLinesWrap.appendChild(composerConstellationLinesCheckbox);
            composerConstellationLinesWrap.appendChild(composerConstellationLinesText);
            composerInfoToggles.appendChild(composerConstellationLinesWrap);

            composerConstellationLabelsWrap = document.createElement("label");
            composerConstellationLabelsWrap.className = "aux-camera-view__composer-grid-toggle";
            composerConstellationLabelsCheckbox = document.createElement("input");
            composerConstellationLabelsCheckbox.type = "checkbox";
            composerConstellationLabelsCheckbox.setAttribute("aria-label", "Toggle composer constellation labels");
            composerConstellationLabelsCheckbox.dataset.proofId = "constellation-labels-toggle";
            const composerConstellationLabelsText = document.createElement("span");
            composerConstellationLabelsText.textContent = "Const Labels";
            composerConstellationLabelsWrap.appendChild(composerConstellationLabelsCheckbox);
            composerConstellationLabelsWrap.appendChild(composerConstellationLabelsText);
            composerInfoToggles.appendChild(composerConstellationLabelsWrap);

            composerCloudsWrap = document.createElement("label");
            composerCloudsWrap.className = "aux-camera-view__composer-grid-toggle";
            composerCloudsCheckbox = document.createElement("input");
            composerCloudsCheckbox.type = "checkbox";
            composerCloudsCheckbox.checked = true;
            composerCloudsCheckbox.setAttribute("aria-label", "Toggle Earth cloud cover");
            composerCloudsCheckbox.dataset.proofId = "clouds-toggle";
            const composerCloudsText = document.createElement("span");
            composerCloudsText.textContent = "Clouds";
            composerCloudsWrap.appendChild(composerCloudsCheckbox);
            composerCloudsWrap.appendChild(composerCloudsText);
            composerInfoToggles.appendChild(composerCloudsWrap);

            composerInfoRow.appendChild(composerInfoToggles);

            const composerCraterRow = document.createElement("div");
            composerCraterRow.className = "aux-camera-view__composer-crater-row";
            composerLunarCratersWrap = document.createElement("div");
            composerLunarCratersWrap.className = "aux-camera-view__composer-crater-control";
            composerLunarCratersPill = document.createElement("button");
            composerLunarCratersPill.type = "button";
            composerLunarCratersPill.className = "aux-camera-view__composer-pill";
            composerLunarCratersPill.setAttribute("aria-label", "Open Frame and Shoot lunar feature controls");
            composerLunarCratersPill.setAttribute("aria-haspopup", "dialog");
            composerLunarCratersPill.setAttribute("aria-expanded", "false");
            composerLunarCratersPill.setAttribute("aria-pressed", "false");
            composerLunarCratersPill.dataset.proofId = "lunar-craters-toggle";
            composerLunarCratersPill.textContent = "Lunar Features";
            composerLunarCraterControls = createLunarCraterControlPanelElements(document, {
                idPrefix: "composer-lunar-crater",
                enableSyncedScope: true,
                initialFilterScope: "synced",
            });
            composerLunarCraterControls.pill = composerLunarCratersPill;
            composerLunarCratersPill.setAttribute("aria-controls", composerLunarCraterControls.panel.id);
            composerLunarCratersWrap.appendChild(composerLunarCratersPill);
            composerLunarCratersWrap.appendChild(composerLunarCraterControls.panel);
            composerCraterRow.appendChild(composerLunarCratersWrap);

            composerSurfacePointsWrap = document.createElement("div");
            composerSurfacePointsWrap.className = "aux-camera-view__composer-crater-control aux-camera-view__composer-surface-point-control";
            composerSurfacePointsPill = document.createElement("button");
            composerSurfacePointsPill.type = "button";
            composerSurfacePointsPill.className = "aux-camera-view__composer-pill";
            composerSurfacePointsPill.setAttribute("aria-label", "Open Frame and Shoot surface point controls");
            composerSurfacePointsPill.setAttribute("aria-haspopup", "dialog");
            composerSurfacePointsPill.setAttribute("aria-expanded", "false");
            composerSurfacePointsPill.setAttribute("aria-pressed", "false");
            composerSurfacePointsPill.dataset.proofId = "surface-points-toggle";
            composerSurfacePointsPill.textContent = "Surface Points";
            composerSurfacePointControls = createComposerSurfacePointControls(document);
            composerSurfacePointControls.pill = composerSurfacePointsPill;
            composerSurfacePointControls.panel.id = "composer-surface-points-controls-panel";
            composerSurfacePointsPill.setAttribute("aria-controls", composerSurfacePointControls.panel.id);
            composerSurfacePointsWrap.appendChild(composerSurfacePointsPill);
            composerSurfacePointsWrap.appendChild(composerSurfacePointControls.panel);
            composerCraterRow.appendChild(composerSurfacePointsWrap);

            composerLunarFeatureStackRestoreButton = document.createElement("button");
            composerLunarFeatureStackRestoreButton.type = "button";
            composerLunarFeatureStackRestoreButton.className = "aux-camera-view__composer-pill aux-camera-view__composer-feature-stack-restore";
            composerLunarFeatureStackRestoreButton.textContent = "Lunar Transcript";
            composerLunarFeatureStackRestoreButton.setAttribute("aria-label", "Show transcript lunar feature stack");
            composerLunarFeatureStackRestoreButton.hidden = true;
            composerCraterRow.appendChild(composerLunarFeatureStackRestoreButton);

            const composerTranscriptControls = composerLunarCraterControls.syncedControlsContainer;
            const composerTranscriptSyncedWrap = document.createElement("label");
            composerTranscriptSyncedWrap.className = "lunar-crater-controls-panel__synced-toggle";
            composerTranscriptSyncedCheckbox = document.createElement("input");
            composerTranscriptSyncedCheckbox.type = "checkbox";
            composerTranscriptSyncedCheckbox.id = "composer-lunar-crater-synced-enabled";
            composerTranscriptSyncedCheckbox.checked = true;
            composerTranscriptSyncedCheckbox.setAttribute("aria-label", "Enable transcript-synced lunar features");
            const composerTranscriptSyncedText = document.createElement("span");
            composerTranscriptSyncedText.textContent = "Transcript sync";
            composerTranscriptSyncedWrap.appendChild(composerTranscriptSyncedCheckbox);
            composerTranscriptSyncedWrap.appendChild(composerTranscriptSyncedText);
            composerTranscriptControls?.appendChild(composerTranscriptSyncedWrap);
            const createTranscriptSliderRow = ({ labelText, min, max, step, value }) => {
                const row = document.createElement("label");
                row.className = "lunar-crater-controls-panel__synced-row";
                const label = document.createElement("span");
                label.className = "lunar-crater-controls-panel__synced-label";
                label.textContent = labelText;
                const slider = document.createElement("input");
                slider.type = "range";
                slider.className = "lunar-crater-controls-panel__synced-slider";
                slider.min = String(min);
                slider.max = String(max);
                slider.step = String(step);
                slider.value = String(value);
                const output = document.createElement("output");
                output.className = "lunar-crater-controls-panel__synced-value";
                row.appendChild(label);
                row.appendChild(slider);
                row.appendChild(output);
                composerTranscriptControls?.appendChild(row);
                return { slider, output };
            };
            const stackWindowControls = createTranscriptSliderRow({
                labelText: "Stack",
                min: 60,
                max: 900,
                step: 30,
                value: COMPOSER_LUNAR_FEATURE_STACK_VISIBLE_WINDOW_SECONDS,
            });
            composerTranscriptWindowSlider = stackWindowControls.slider;
            composerTranscriptWindowValue = stackWindowControls.output;
            composerTranscriptWindowSlider.setAttribute("aria-label", "Transcript lunar feature stack window");
            const holdControls = createTranscriptSliderRow({
                labelText: "Hold",
                min: 5,
                max: 90,
                step: 5,
                value: COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_LEAD_SECONDS + COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_TRAIL_SECONDS,
            });
            composerTranscriptHoldSlider = holdControls.slider;
            composerTranscriptHoldValue = holdControls.output;
            composerTranscriptHoldSlider.setAttribute("aria-label", "Transcript lunar feature highlight hold");

            const composerStarMagnitudeRow = document.createElement("div");
            composerStarMagnitudeRow.className = "aux-camera-view__composer-optics-row aux-camera-view__composer-star-mag-row";
            const composerStarMagnitudeLabel = document.createElement("span");
            composerStarMagnitudeLabel.className = "aux-camera-view__composer-label";
            composerStarMagnitudeLabel.textContent = "Mag";
            composerStarMagnitudeRow.appendChild(composerStarMagnitudeLabel);
            composerStarMagnitudeSlider = document.createElement("input");
            composerStarMagnitudeSlider.type = "range";
            composerStarMagnitudeSlider.className = "aux-camera-view__composer-ambient-slider";
            composerStarMagnitudeSlider.min = String(COMPOSER_STAR_MAGNITUDE_MIN);
            composerStarMagnitudeSlider.max = String(COMPOSER_STAR_MAGNITUDE_MAX);
            composerStarMagnitudeSlider.step = "0.1";
            composerStarMagnitudeSlider.value = String(COMPOSER_STAR_MAGNITUDE_DEFAULT);
            composerStarMagnitudeSlider.setAttribute("aria-label", "Frame and Shoot limiting magnitude");
            composerStarMagnitudeSlider.dataset.proofId = "star-mag-slider";
            composerStarMagnitudeRow.appendChild(composerStarMagnitudeSlider);
            composerStarMagnitudeValue = document.createElement("output");
            composerStarMagnitudeValue.className = "aux-camera-view__composer-ambient-value";
            composerStarMagnitudeValue.value = COMPOSER_STAR_MAGNITUDE_DEFAULT.toFixed(1);
            composerStarMagnitudeValue.textContent = composerStarMagnitudeValue.value;
            composerStarMagnitudeRow.appendChild(composerStarMagnitudeValue);

            composerPresetWrap = document.createElement("div");
            composerPresetWrap.className = "aux-camera-view__composer-presets";
            const presetLabel = document.createElement("span");
            presetLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
            presetLabel.textContent = "Lock";
            composerPresetWrap.appendChild(presetLabel);

            const lockButtonStrip = document.createElement("div");
            lockButtonStrip.className = "aux-camera-view__composer-lock-buttons";

            composerLookFreeButton = document.createElement("button");
            composerLookFreeButton.type = "button";
            composerLookFreeButton.className = "aux-camera-view__composer-button";
            composerLookFreeButton.textContent = "Free";
            composerLookFreeButton.setAttribute("aria-label", "Flyby Planner unlock camera");
            lockButtonStrip.appendChild(composerLookFreeButton);

            composerLookEarthButton = document.createElement("button");
            composerLookEarthButton.type = "button";
            composerLookEarthButton.className = "aux-camera-view__composer-button";
            composerLookEarthButton.textContent = "Earth";
            composerLookEarthButton.setAttribute("aria-label", "Flyby Planner lock to Earth");
            composerLookEarthButton.dataset.proofId = "lock-earth";
            lockButtonStrip.appendChild(composerLookEarthButton);

            composerLookMoonButton = document.createElement("button");
            composerLookMoonButton.type = "button";
            composerLookMoonButton.className = "aux-camera-view__composer-button";
            composerLookMoonButton.textContent = "Moon";
            composerLookMoonButton.setAttribute("aria-label", "Flyby Planner lock to Moon");
            composerLookMoonButton.dataset.proofId = "lock-moon";
            lockButtonStrip.appendChild(composerLookMoonButton);
            composerPresetWrap.appendChild(lockButtonStrip);
            const composerSkyLockRow = document.createElement("div");
            composerSkyLockRow.className = "aux-camera-view__composer-sky-lock-row";
            composerSkyLockRow.appendChild(composerPresetWrap);
            composerSkyLockRow.appendChild(composerStarMagnitudeRow);

            composerFovWrap = document.createElement("div");
            composerFovWrap.className = "aux-camera-view__composer-fov";
            composerFovWrap.appendChild(fovControls);
            composerControlMatrix.appendChild(composerFovWrap);

            composerTimelineWrap = document.createElement("div");
            composerTimelineWrap.className = "aux-camera-view__composer-timeline";

            composerTransportRow = document.createElement("div");
            composerTransportRow.className = "aux-camera-view__composer-transport-row";

            const composerTransportCluster = document.createElement("div");
            composerTransportCluster.className = "controls-cluster controls-cluster--transport";

            composerTransportMinusMinuteButton = document.createElement("button");
            composerTransportMinusMinuteButton.type = "button";
            composerTransportMinusMinuteButton.className = "button";
            composerTransportMinusMinuteButton.textContent = "-1m";
            composerTransportMinusMinuteButton.setAttribute("aria-label", "Step timeline backward by one minute");
            composerTransportCluster.appendChild(composerTransportMinusMinuteButton);

            composerTransportMinusSecondButton = document.createElement("button");
            composerTransportMinusSecondButton.type = "button";
            composerTransportMinusSecondButton.className = "button";
            composerTransportMinusSecondButton.textContent = "-1s";
            composerTransportMinusSecondButton.setAttribute("aria-label", "Step phase timeline backward by one second");
            composerTransportCluster.appendChild(composerTransportMinusSecondButton);

            composerTransportPlusSecondButton = document.createElement("button");
            composerTransportPlusSecondButton.type = "button";
            composerTransportPlusSecondButton.className = "button";
            composerTransportPlusSecondButton.textContent = "+1s";
            composerTransportPlusSecondButton.setAttribute("aria-label", "Step phase timeline forward by one second");
            composerTransportCluster.appendChild(composerTransportPlusSecondButton);

            composerTransportPlusMinuteButton = document.createElement("button");
            composerTransportPlusMinuteButton.type = "button";
            composerTransportPlusMinuteButton.className = "button";
            composerTransportPlusMinuteButton.textContent = "+1m";
            composerTransportPlusMinuteButton.setAttribute("aria-label", "Step timeline forward by one minute");
            composerTransportCluster.appendChild(composerTransportPlusMinuteButton);

            composerTransportRow.appendChild(composerTransportCluster);

            const composerSpeedCluster = document.createElement("div");
            composerSpeedCluster.className = "controls-cluster controls-cluster--speed";

            composerTransportPlayButton = document.createElement("button");
            composerTransportPlayButton.type = "button";
            composerTransportPlayButton.className = "button button--primary";
            composerTransportPlayButton.textContent = "▶";
            composerTransportPlayButton.setAttribute("aria-label", "Play or pause animation");
            composerSpeedCluster.appendChild(composerTransportPlayButton);

            composerTransportSlowerButton = document.createElement("button");
            composerTransportSlowerButton.type = "button";
            composerTransportSlowerButton.className = "button button--icon";
            composerTransportSlowerButton.textContent = "−";
            composerTransportSlowerButton.setAttribute("aria-label", "Slower");
            composerSpeedCluster.appendChild(composerTransportSlowerButton);

            composerTransportSpeedButton = document.createElement("button");
            composerTransportSpeedButton.type = "button";
            composerTransportSpeedButton.className = "button button--realtime";
            composerTransportSpeedButton.textContent = "1 sec/sec";
            composerTransportSpeedButton.setAttribute("aria-label", "Current speed. Click to set realtime");
            composerSpeedCluster.appendChild(composerTransportSpeedButton);

            composerTransportFasterButton = document.createElement("button");
            composerTransportFasterButton.type = "button";
            composerTransportFasterButton.className = "button button--icon";
            composerTransportFasterButton.textContent = "+";
            composerTransportFasterButton.setAttribute("aria-label", "Faster");
            composerSpeedCluster.appendChild(composerTransportFasterButton);

            composerTransportRow.appendChild(composerSpeedCluster);
            composerTimelineWrap.appendChild(composerTransportRow);

            const composerPhaseLabel = document.createElement("span");
            composerPhaseLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
            composerPhaseLabel.textContent = "Phase";
            composerTimelineWrap.appendChild(composerPhaseLabel);

            const composerPhasePicker = document.createElement("div");
            composerPhasePicker.className = "aux-camera-view__composer-phase-picker";
            const composerPhaseControl = document.createElement("div");
            composerPhaseControl.className = "aux-camera-view__composer-phase-control";
            composerPhasePrevButton = document.createElement("button");
            composerPhasePrevButton.type = "button";
            composerPhasePrevButton.className = "aux-camera-view__composer-phase-step";
            composerPhasePrevButton.textContent = "◂";
            composerPhasePrevButton.setAttribute("aria-label", "Previous mission phase");
            composerPhaseControl.appendChild(composerPhasePrevButton);

            composerPhaseDetails = document.createElement("details");
            composerPhaseDetails.className = "aux-camera-view__composer-phase-pullup";
            composerPhaseSummary = document.createElement("summary");
            composerPhaseSummary.className = "aux-camera-view__composer-phase-pullup-summary";
            composerPhaseSummary.textContent = "Phase";
            composerPhaseDetails.appendChild(composerPhaseSummary);
            composerPhaseOptionsWrap = document.createElement("div");
            composerPhaseOptionsWrap.className = "aux-camera-view__composer-phase-options";
            composerPhaseDetails.appendChild(composerPhaseOptionsWrap);
            composerPhaseControl.appendChild(composerPhaseDetails);

            composerPhaseNextButton = document.createElement("button");
            composerPhaseNextButton.type = "button";
            composerPhaseNextButton.className = "aux-camera-view__composer-phase-step";
            composerPhaseNextButton.textContent = "▸";
            composerPhaseNextButton.setAttribute("aria-label", "Next mission phase");
            composerPhaseControl.appendChild(composerPhaseNextButton);
            composerPhasePicker.appendChild(composerPhaseControl);

            const composerFlybyEventPicker = document.createElement("div");
            composerFlybyEventPicker.className = "aux-camera-view__composer-event-picker";
            composerFlybyEventsDetails = document.createElement("details");
            composerFlybyEventsDetails.className = "aux-camera-view__composer-event-pullup";
            composerFlybyEventsSummary = document.createElement("summary");
            composerFlybyEventsSummary.className = "aux-camera-view__composer-event-pullup-summary";
            composerFlybyEventsSummary.textContent = "Events";
            composerFlybyEventsDetails.appendChild(composerFlybyEventsSummary);
            composerFlybyEventsWrap = document.createElement("div");
            composerFlybyEventsWrap.className = "aux-camera-view__composer-event-pills";
            composerFlybyEventsDetails.appendChild(composerFlybyEventsWrap);
            composerFlybyEventPicker.appendChild(composerFlybyEventsDetails);
            composerPhasePicker.appendChild(composerFlybyEventPicker);
            composerTimelineWrap.appendChild(composerPhasePicker);

            const composerPhaseValue = document.createElement("span");
            composerPhaseValue.className = "aux-camera-view__composer-value-slot";
            composerTimelineWrap.appendChild(composerPhaseValue);

            composerTimelineLabel = document.createElement("span");
            composerTimelineLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
            composerTimelineLabel.textContent = "Time";
            composerTimelineWrap.appendChild(composerTimelineLabel);
            composerTimelineSlider = document.createElement("input");
            composerTimelineSlider.type = "range";
            composerTimelineSlider.className = "aux-camera-view__composer-timeline-slider";
            composerTimelineSlider.min = "0";
            composerTimelineSlider.max = String(COMPOSER_TIMELINE_RESOLUTION);
            composerTimelineSlider.step = "1";
            composerTimelineSlider.value = String(Math.round(COMPOSER_TIMELINE_RESOLUTION * 0.5));
            composerTimelineSlider.setAttribute("aria-label", "Flyby Planner short timeline scrub");
            composerTimelineWrap.appendChild(composerTimelineSlider);
            const composerTimelineValue = document.createElement("span");
            composerTimelineValue.className = "aux-camera-view__composer-value-slot";
            composerTimelineWrap.appendChild(composerTimelineValue);
            composerTimelineLocalValue = document.createElement("span");
            composerTimelineLocalValue.className = "aux-camera-view__composer-timeline-local";
            composerTimelineLocalValue.textContent = "Local: --";
            composerTimelineWrap.appendChild(composerTimelineLocalValue);

            composerControlsWrap = document.createElement("div");
            composerControlsWrap.className = "aux-camera-view__composer-controls";

            const composerResetRow = document.createElement("div");
            composerResetRow.className = "aux-camera-view__composer-reset-row";
            const composerControlsLabel = document.createElement("span");
            composerControlsLabel.className = "aux-camera-view__composer-section-label";
            composerControlsLabel.textContent = "Controls";
            composerResetRow.appendChild(composerControlsLabel);
            composerResetButton = document.createElement("button");
            composerResetButton.type = "button";
            composerResetButton.className = "aux-camera-view__composer-button aux-camera-view__composer-reset-button";
            composerResetButton.textContent = "Reset";
            composerResetButton.setAttribute("aria-label", "Reset Frame and Shoot controls to defaults");
            composerResetButton.dataset.proofId = "composer-reset-button";
            composerResetRow.appendChild(composerResetButton);
            composerControlsWrap.appendChild(composerResetRow);

            const composerCreativeLabel = document.createElement("span");
            composerCreativeLabel.className = "aux-camera-view__composer-section-label";
            composerCreativeLabel.textContent = "Creative";
            composerControlsWrap.appendChild(composerCreativeLabel);

            const buildComposerSliderRow = (
                labelText,
                ariaLabel,
                defaultValue,
                {
                    min = COMPOSER_MIN_AMBIENT,
                    max = COMPOSER_MAX_AMBIENT,
                    step = "0.01",
                    proofId = "",
                } = {},
            ) => {
                const row = document.createElement("div");
                row.className = "aux-camera-view__composer-optics-row";

                const label = document.createElement("span");
                label.className = "aux-camera-view__composer-label";
                label.textContent = labelText;
                row.appendChild(label);

                const slider = document.createElement("input");
                slider.type = "range";
                slider.className = "aux-camera-view__composer-ambient-slider";
                slider.min = String(min);
                slider.max = String(max);
                slider.step = String(step);
                slider.value = String(defaultValue);
                slider.setAttribute("aria-label", ariaLabel);
                if (proofId) {
                    slider.dataset.proofId = proofId;
                }
                row.appendChild(slider);

                const value = document.createElement("output");
                value.className = "aux-camera-view__composer-ambient-value";
                value.value = `${defaultValue.toFixed(2)}`;
                value.textContent = value.value;
                row.appendChild(value);

                composerControlsWrap.appendChild(row);
                return { slider, value };
            };

            ({
                slider: composerEarthAmbientSlider,
                value: composerEarthAmbientValue,
            } = buildComposerSliderRow(
                "Earth Fill",
                "Frame and Shoot creative Earth fill",
                COMPOSER_DEFAULT_EARTH_AMBIENT,
                { proofId: "earth-ambient-slider" },
            ));
            ({
                slider: composerMoonAmbientSlider,
                value: composerMoonAmbientValue,
            } = buildComposerSliderRow(
                "Moon Fill",
                "Frame and Shoot creative Moon fill",
                COMPOSER_DEFAULT_MOON_AMBIENT,
                { proofId: "moon-ambient-slider" },
            ));
            ({
                slider: composerEarthshineSlider,
                value: composerEarthshineValue,
            } = buildComposerSliderRow(
                "Earthshine Gain",
                "Flyby Planner Earthshine gain",
                COMPOSER_DEFAULT_EARTHSHINE_GAIN,
                {
                    min: COMPOSER_MIN_EARTHSHINE_GAIN,
                    max: COMPOSER_MAX_EARTHSHINE_GAIN,
                    proofId: "earthshine-slider",
                },
            ));
            ({
                slider: composerMoonshineSlider,
                value: composerMoonshineValue,
            } = buildComposerSliderRow(
                "Moonshine Gain",
                "Flyby Planner Moonshine gain",
                COMPOSER_DEFAULT_MOONSHINE_GAIN,
                {
                    min: COMPOSER_MIN_MOONSHINE_GAIN,
                    max: COMPOSER_MAX_MOONSHINE_GAIN,
                    proofId: "moonshine-slider",
                },
            ));

            composerMoonOutlineWrap = document.createElement("label");
            composerMoonOutlineWrap.className = "aux-camera-view__composer-grid-toggle";
            composerMoonOutlineCheckbox = document.createElement("input");
            composerMoonOutlineCheckbox.type = "checkbox";
            composerMoonOutlineCheckbox.checked = false;
            composerMoonOutlineCheckbox.setAttribute("aria-label", "Toggle Moon outline in Flyby Planner");
            const composerMoonOutlineText = document.createElement("span");
            composerMoonOutlineText.textContent = "Moon Outline";
            composerMoonOutlineWrap.appendChild(composerMoonOutlineCheckbox);
            composerMoonOutlineWrap.appendChild(composerMoonOutlineText);
            composerInfoToggles.appendChild(composerMoonOutlineWrap);

            composerSeeThroughWrap = document.createElement("label");
            composerSeeThroughWrap.className = "aux-camera-view__composer-grid-toggle";
            composerSeeThroughCheckbox = document.createElement("input");
            composerSeeThroughCheckbox.type = "checkbox";
            composerSeeThroughCheckbox.checked = false;
            composerSeeThroughCheckbox.setAttribute(
                "aria-label",
                "Toggle see-through dotted outlines for obscured Sun and planets",
            );
            composerSeeThroughCheckbox.dataset.proofId = "see-through-toggle";
            const composerSeeThroughText = document.createElement("span");
            composerSeeThroughText.textContent = "See Through";
            composerSeeThroughWrap.appendChild(composerSeeThroughCheckbox);
            composerSeeThroughWrap.appendChild(composerSeeThroughText);
            composerInfoToggles.appendChild(composerSeeThroughWrap);

            composerOpticsWrap = document.createElement("div");
            composerOpticsWrap.className = "aux-camera-view__composer-optics";

            composerOpticsBody = document.createElement("div");
            composerOpticsBody.className = "aux-camera-view__composer-optics-body";
            composerOpticsBody.hidden = false;

            const composerPhotoLabel = document.createElement("span");
            composerPhotoLabel.className = "aux-camera-view__composer-section-label";
            composerPhotoLabel.textContent = "Photo";
            composerOpticsBody.appendChild(composerPhotoLabel);

            const composerExposureRow = document.createElement("div");
            composerExposureRow.className = "aux-camera-view__composer-optics-row";
            const composerExposureLabel = document.createElement("span");
            composerExposureLabel.className = "aux-camera-view__composer-label";
            composerExposureLabel.textContent = "Exposure Comp";
            composerExposureRow.appendChild(composerExposureLabel);
            composerExposureSlider = document.createElement("input");
            composerExposureSlider.type = "range";
            composerExposureSlider.className = "aux-camera-view__composer-ambient-slider";
            composerExposureSlider.min = String(COMPOSER_EXPOSURE_EV_MIN);
            composerExposureSlider.max = String(COMPOSER_EXPOSURE_EV_MAX);
            composerExposureSlider.step = "0.1";
            composerExposureSlider.value = String(COMPOSER_EXPOSURE_EV_DEFAULT);
            composerExposureSlider.setAttribute("aria-label", "Frame and Shoot exposure compensation");
            composerExposureSlider.dataset.proofId = "exposure-ev-slider";
            composerExposureRow.appendChild(composerExposureSlider);
            composerExposureValue = document.createElement("output");
            composerExposureValue.className = "aux-camera-view__composer-ambient-value";
            composerExposureValue.value = "+0.0 EV";
            composerExposureValue.textContent = composerExposureValue.value;
            composerExposureRow.appendChild(composerExposureValue);
            composerOpticsBody.appendChild(composerExposureRow);

            composerAutoExposureWrap = document.createElement("label");
            composerAutoExposureWrap.className = "aux-camera-view__composer-grid-toggle";
            composerAutoExposureCheckbox = document.createElement("input");
            composerAutoExposureCheckbox.type = "checkbox";
            composerAutoExposureCheckbox.checked = true;
            composerAutoExposureCheckbox.setAttribute("aria-label", "Toggle Frame and Shoot eclipse auto exposure");
            composerAutoExposureCheckbox.dataset.proofId = "auto-exposure-toggle";
            const composerAutoExposureText = document.createElement("span");
            composerAutoExposureText.textContent = "Auto Exposure";
            composerExposureTotalValue = document.createElement("output");
            composerExposureTotalValue.className = "aux-camera-view__composer-auto-exposure-total";
            composerExposureTotalValue.value = "Total +0.0 EV";
            composerExposureTotalValue.textContent = composerExposureTotalValue.value;
            composerExposureTotalValue.dataset.proofId = "exposure-total-value";
            composerAutoExposureWrap.appendChild(composerAutoExposureCheckbox);
            composerAutoExposureWrap.appendChild(composerAutoExposureText);
            composerAutoExposureWrap.appendChild(composerExposureTotalValue);
            composerOpticsBody.appendChild(composerAutoExposureWrap);

            const composerOpticsHeader = document.createElement("div");
            composerOpticsHeader.className = "aux-camera-view__composer-optics-header";
            const composerOpticsLabel = document.createElement("span");
            composerOpticsLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
            composerOpticsLabel.textContent = "Sun";
            composerOpticsHeader.appendChild(composerOpticsLabel);

            composerOpticsPhysicalButton = document.createElement("button");
            composerOpticsPhysicalButton.type = "button";
            composerOpticsPhysicalButton.className = "aux-camera-view__composer-button";
            composerOpticsPhysicalButton.textContent = "Physical";
            composerOpticsPhysicalButton.setAttribute("aria-label", "Use physical sun optics profile");
            composerOpticsHeader.appendChild(composerOpticsPhysicalButton);

            composerOpticsCameraButton = document.createElement("button");
            composerOpticsCameraButton.type = "button";
            composerOpticsCameraButton.className = "aux-camera-view__composer-button";
            composerOpticsCameraButton.textContent = "Camera";
            composerOpticsCameraButton.setAttribute("aria-label", "Use camera optics profile");
            composerOpticsHeader.appendChild(composerOpticsCameraButton);
            composerOpticsBody.appendChild(composerOpticsHeader);

            const composerOpticsStrengthRow = document.createElement("div");
            composerOpticsStrengthRow.className = "aux-camera-view__composer-optics-row";
            const composerOpticsStrengthLabel = document.createElement("span");
            composerOpticsStrengthLabel.className = "aux-camera-view__composer-label";
            composerOpticsStrengthLabel.textContent = "Strength";
            composerOpticsStrengthRow.appendChild(composerOpticsStrengthLabel);
            composerOpticsStrengthSlider = document.createElement("input");
            composerOpticsStrengthSlider.type = "range";
            composerOpticsStrengthSlider.className = "aux-camera-view__composer-ambient-slider";
            composerOpticsStrengthSlider.min = String(COMPOSER_OPTICS_STRENGTH_MIN);
            composerOpticsStrengthSlider.max = String(COMPOSER_OPTICS_STRENGTH_MAX);
            composerOpticsStrengthSlider.step = "0.01";
            composerOpticsStrengthSlider.value = String(COMPOSER_OPTICS_STRENGTH_DEFAULT);
            composerOpticsStrengthSlider.setAttribute("aria-label", "Flyby Planner optics strength");
            composerOpticsStrengthRow.appendChild(composerOpticsStrengthSlider);
            composerOpticsStrengthValue = document.createElement("output");
            composerOpticsStrengthValue.className = "aux-camera-view__composer-ambient-value";
            composerOpticsStrengthValue.value = `${COMPOSER_OPTICS_STRENGTH_DEFAULT.toFixed(2)}`;
            composerOpticsStrengthValue.textContent = composerOpticsStrengthValue.value;
            composerOpticsStrengthRow.appendChild(composerOpticsStrengthValue);
            composerOpticsBody.appendChild(composerOpticsStrengthRow);

            composerOpticsAdvancedPanel = document.createElement("div");
            composerOpticsAdvancedPanel.className = "aux-camera-view__composer-optics-advanced";
            composerOpticsAdvancedPanel.hidden = false;

            const buildAdvancedRow = (
                labelText,
                {
                    container = composerOpticsAdvancedPanel,
                    min = COMPOSER_OPTICS_ADVANCED_MIN,
                    max = COMPOSER_OPTICS_ADVANCED_MAX,
                    defaultValue = COMPOSER_OPTICS_ADVANCED_DEFAULT,
                    ariaLabel = "",
                    proofId = "",
                } = {},
            ) => {
                const row = document.createElement("div");
                row.className = "aux-camera-view__composer-optics-row";
                const label = document.createElement("span");
                label.className = "aux-camera-view__composer-label";
                label.textContent = labelText;
                row.appendChild(label);
                const slider = document.createElement("input");
                slider.type = "range";
                slider.className = "aux-camera-view__composer-ambient-slider";
                slider.min = String(min);
                slider.max = String(max);
                slider.step = "0.01";
                slider.value = String(defaultValue);
                if (ariaLabel) {
                    slider.setAttribute("aria-label", ariaLabel);
                }
                if (proofId) {
                    slider.dataset.proofId = proofId;
                }
                row.appendChild(slider);
                const value = document.createElement("output");
                value.className = "aux-camera-view__composer-ambient-value";
                value.value = `${defaultValue.toFixed(2)}`;
                value.textContent = value.value;
                row.appendChild(value);
                container.appendChild(row);
                return { slider, value };
            };
            ({ slider: composerOpticsHaloSlider, value: composerOpticsHaloValue } = buildAdvancedRow("Halo"));
            ({ slider: composerOpticsStarburstSlider, value: composerOpticsStarburstValue } = buildAdvancedRow("Star"));
            ({ slider: composerOpticsFlareSlider, value: composerOpticsFlareValue } = buildAdvancedRow("Flare"));

            composerEclipseCoronaPanel = document.createElement("div");
            composerEclipseCoronaPanel.className = "aux-camera-view__composer-optics-advanced aux-camera-view__composer-eclipse-corona";
            const composerEclipseCoronaLabel = document.createElement("span");
            composerEclipseCoronaLabel.className = "aux-camera-view__composer-section-label aux-camera-view__composer-eclipse-corona-label";
            composerEclipseCoronaLabel.textContent = "Eclipse Corona";
            composerEclipseCoronaPanel.appendChild(composerEclipseCoronaLabel);
            ({
                slider: composerEclipseCoronaIntensitySlider,
                value: composerEclipseCoronaIntensityValue,
            } = buildAdvancedRow("Intensity", {
                container: composerEclipseCoronaPanel,
                min: COMPOSER_ECLIPSE_CORONA_MIN,
                max: COMPOSER_ECLIPSE_CORONA_MAX,
                defaultValue: COMPOSER_ECLIPSE_CORONA_DEFAULT,
                ariaLabel: "Frame and Shoot eclipse corona intensity",
                proofId: "eclipse-corona-intensity-slider",
            }));
            ({
                slider: composerEclipseCoronaMotionSlider,
                value: composerEclipseCoronaMotionValue,
            } = buildAdvancedRow("Motion", {
                container: composerEclipseCoronaPanel,
                min: COMPOSER_ECLIPSE_CORONA_MIN,
                max: COMPOSER_ECLIPSE_CORONA_MAX,
                defaultValue: COMPOSER_ECLIPSE_CORONA_DEFAULT,
                ariaLabel: "Frame and Shoot eclipse corona motion",
                proofId: "eclipse-corona-motion-slider",
            }));
            ({
                slider: composerEclipseCoronaStructureSlider,
                value: composerEclipseCoronaStructureValue,
            } = buildAdvancedRow("Variation", {
                container: composerEclipseCoronaPanel,
                min: COMPOSER_ECLIPSE_CORONA_MIN,
                max: COMPOSER_ECLIPSE_CORONA_MAX,
                defaultValue: COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
                ariaLabel: "Frame and Shoot eclipse corona angular variation",
                proofId: "eclipse-corona-variation-slider",
            }));
            ({
                slider: composerEclipseZodiacalDustSlider,
                value: composerEclipseZodiacalDustValue,
            } = buildAdvancedRow("Zodiacal", {
                container: composerEclipseCoronaPanel,
                min: COMPOSER_ECLIPSE_CORONA_MIN,
                max: COMPOSER_ECLIPSE_CORONA_MAX,
                defaultValue: COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
                ariaLabel: "Frame and Shoot ecliptic dust glow",
                proofId: "eclipse-zodiacal-dust-slider",
            }));
            composerOpticsBody.appendChild(composerOpticsAdvancedPanel);
            composerOpticsBody.appendChild(composerEclipseCoronaPanel);
            composerOpticsWrap.appendChild(composerControlsWrap);
            composerOpticsWrap.appendChild(composerOpticsBody);

            composerControlMatrix.appendChild(composerOpticsWrap);

            composerRollWrap = document.createElement("div");
            composerRollWrap.className = "aux-camera-view__composer-roll-wrap";
            const composerRollLabel = document.createElement("span");
            composerRollLabel.className = "aux-camera-view__composer-label aux-camera-view__composer-row-label";
            composerRollLabel.textContent = "Rotation";
            composerRollWrap.appendChild(composerRollLabel);
            composerRollSlider = document.createElement("input");
            composerRollSlider.type = "range";
            composerRollSlider.className = "aux-camera-view__composer-ambient-slider aux-camera-view__composer-roll-slider";
            composerRollSlider.min = "0";
            composerRollSlider.max = "359";
            composerRollSlider.step = "1";
            composerRollSlider.value = String(Math.round(this.THREE.MathUtils.radToDeg(COMPOSER_DEFAULT_ROLL_RAD)) % 360);
            composerRollSlider.setAttribute("aria-label", "Flyby Planner rotation");
            composerRollWrap.appendChild(composerRollSlider);
            composerRollValue = document.createElement("output");
            composerRollValue.className = "aux-camera-view__composer-roll-value";
            composerRollWrap.appendChild(composerRollValue);
            composerSkyControlsWrap.replaceChildren(
                composerSkyLockRow,
                composerInfoRow,
                composerCraterRow,
            );
            composerSkyTimelineWrap.replaceChildren(
                composerTimelineWrap,
            );
            composerControlMatrix.replaceChildren(
                ...(composerControlsToggleButton ? [composerControlsToggleButton] : []),
                composerFovWrap,
                composerOpticsWrap,
            );
            panel.appendChild(composerControlMatrix);
        } else {
            info = document.createElement("div");
            info.className = "aux-camera-view__info";
            info.hidden = spec.infoMode === "none";
            infoPrimary = document.createElement("div");
            infoPrimary.className = "aux-camera-view__info-line aux-camera-view__info-line--primary";
            infoPrimaryText = document.createElement("span");
            infoPrimaryText.className = "aux-camera-view__info-primary-text";
            infoPill = document.createElement("button");
            infoPill.type = "button";
            infoPill.className = "aux-camera-view__pill";
            infoPill.hidden = true;
            infoPrimary.appendChild(infoPrimaryText);
            infoPrimary.appendChild(infoPill);
            infoSecondary = document.createElement("div");
            infoSecondary.className = "aux-camera-view__info-line aux-camera-view__info-line--secondary";
            info.appendChild(infoPrimary);
            info.appendChild(infoSecondary);
            panel.appendChild(info);
        }

        const viewport = document.createElement("div");
        viewport.className = "aux-camera-view__viewport";
        panel.appendChild(viewport);
        if (panelMode === "composer") {
            composerDisabledOverlay = document.createElement("div");
            composerDisabledOverlay.className = "aux-camera-view__composer-disabled-overlay";
            composerDisabledOverlay.textContent = "Outside Flyby Window";
            composerDisabledOverlay.hidden = true;
            viewport.appendChild(composerDisabledOverlay);

            composerHint = document.createElement("div");
            composerHint.className = "aux-camera-view__composer-hint";
            composerHint.hidden = true;
            viewport.appendChild(composerHint);

            viewport.appendChild(composerSkyControlsWrap);
            viewport.appendChild(composerSkyTimelineWrap);

            composerMetricsStrip = document.createElement("div");
            composerMetricsStrip.className = "aux-camera-view__composer-metrics-strip";
            composerMetricsStrip.setAttribute("aria-hidden", "true");

            const createMetricCell = (labelText) => {
                const cell = document.createElement("div");
                cell.className = "aux-camera-view__composer-metric-cell";
                const key = document.createElement("span");
                key.className = "aux-camera-view__composer-metric-key";
                key.textContent = labelText;
                const value = document.createElement("span");
                value.className = "aux-camera-view__composer-metric-value";
                value.textContent = "--";
                cell.appendChild(key);
                cell.appendChild(value);
                composerMetricsStrip.appendChild(cell);
                return value;
            };

            composerMetricFovHValue = createMetricCell("FoV H");
            composerMetricFovVValue = createMetricCell("FoV V");
            composerMetricDistanceMoonValue = createMetricCell("Distance To Moon");
            composerMetricAngleValue = createMetricCell("Angle");
            viewport.appendChild(composerMetricsStrip);

            composerLunarFeatureStack = document.createElement("div");
            composerLunarFeatureStack.className = "aux-camera-view__composer-feature-stack";
            composerLunarFeatureStack.hidden = true;
            composerLunarFeatureStack.setAttribute("aria-label", "Transcript lunar features");
            composerLunarFeatureStackHeader = document.createElement("div");
            composerLunarFeatureStackHeader.className = "aux-camera-view__composer-feature-stack-header";
            const composerLunarFeatureStackTitle = document.createElement("span");
            composerLunarFeatureStackTitle.textContent = "Lunar Transcript";
            const composerLunarFeatureStackNav = document.createElement("div");
            composerLunarFeatureStackNav.className = "aux-camera-view__composer-feature-stack-nav";
            composerTranscriptPrevButton = document.createElement("button");
            composerTranscriptPrevButton.type = "button";
            composerTranscriptPrevButton.className = "aux-camera-view__composer-feature-stack-nav-button";
            composerTranscriptPrevButton.textContent = "<";
            composerTranscriptPrevButton.setAttribute("aria-label", "Jump to previous transcript lunar feature");
            composerTranscriptPrevButton.disabled = true;
            composerTranscriptNextButton = document.createElement("button");
            composerTranscriptNextButton.type = "button";
            composerTranscriptNextButton.className = "aux-camera-view__composer-feature-stack-nav-button";
            composerTranscriptNextButton.textContent = ">";
            composerTranscriptNextButton.setAttribute("aria-label", "Jump to next transcript lunar feature");
            composerTranscriptNextButton.disabled = true;
            composerLunarFeatureStackNav.appendChild(composerTranscriptPrevButton);
            composerLunarFeatureStackNav.appendChild(composerTranscriptNextButton);
            const composerLunarFeatureStackWindowControls = document.createElement("div");
            composerLunarFeatureStackWindowControls.className = "aux-camera-view__composer-feature-stack-window-controls";
            composerLunarFeatureStackCloseButton = document.createElement("button");
            composerLunarFeatureStackCloseButton.type = "button";
            composerLunarFeatureStackCloseButton.className = "aux-camera-view__composer-feature-stack-window-button";
            composerLunarFeatureStackCloseButton.textContent = "x";
            composerLunarFeatureStackCloseButton.setAttribute("aria-label", "Close transcript lunar feature stack");
            composerLunarFeatureStackWindowControls.appendChild(composerLunarFeatureStackCloseButton);
            composerLunarFeatureStackHeader.appendChild(composerLunarFeatureStackTitle);
            composerLunarFeatureStackHeader.appendChild(composerLunarFeatureStackNav);
            composerLunarFeatureStackHeader.appendChild(composerLunarFeatureStackWindowControls);
            composerLunarFeatureStackList = document.createElement("div");
            composerLunarFeatureStackList.className = "aux-camera-view__composer-feature-stack-list";
            composerLunarFeatureStack.appendChild(composerLunarFeatureStackHeader);
            composerLunarFeatureStack.appendChild(composerLunarFeatureStackList);
            viewport.appendChild(composerLunarFeatureStack);

            composerRollDial = document.createElement("button");
            composerRollDial.type = "button";
            composerRollDial.className = "aux-camera-view__composer-roll-dial";
            composerRollDial.setAttribute("aria-label", "Adjust frame rotation");
            composerRollDialKnob = document.createElement("span");
            composerRollDialKnob.className = "aux-camera-view__composer-roll-dial-knob";
            composerRollDialValue = document.createElement("span");
            composerRollDialValue.className = "aux-camera-view__composer-roll-dial-value";
            composerRollDialValue.textContent = "0°";
            composerRollDial.appendChild(composerRollDialKnob);
            composerRollDial.appendChild(composerRollDialValue);
            viewport.appendChild(composerRollDial);
        }

        let renderer = null;
        try {
            renderer = createAuxiliaryWebGLRendererWithFallback(this.THREE);
            if ("outputColorSpace" in renderer && this.THREE.SRGBColorSpace) {
                renderer.outputColorSpace = this.THREE.SRGBColorSpace;
            } else {
                renderer.outputEncoding = this.THREE.sRGBEncoding;
            }
            renderer.toneMapping = this.THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1.14;
            renderer.shadowMap.enabled = true;
            if (this.THREE.PCFShadowMap) {
                renderer.shadowMap.type = this.THREE.PCFShadowMap;
            } else if (this.THREE.PCFSoftShadowMap) {
                renderer.shadowMap.type = this.THREE.PCFSoftShadowMap;
            }
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(1, 1);
            renderer.domElement.className = "aux-camera-view__canvas";
            renderer.domElement.setAttribute("aria-hidden", "true");
            viewport.appendChild(renderer.domElement);
        } catch (err) {
            panel.remove();
            return;
        }

        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.className = "aux-camera-view__overlay-canvas";
        overlayCanvas.setAttribute("aria-hidden", "true");
        viewport.appendChild(overlayCanvas);
        const overlayCtx = overlayCanvas.getContext("2d");

        const resizeGrips = ["nw", "ne", "sw", "se"].map((corner) => {
            const grip = document.createElement("div");
            grip.className = `aux-camera-view__resize-grip aux-camera-view__resize-grip--${corner}`;
            grip.dataset.resizeCorner = corner;
            grip.setAttribute("aria-hidden", "true");
            panel.appendChild(grip);
            return grip;
        });
        const resizeGrip = resizeGrips[resizeGrips.length - 1];

        const chipButton = document.createElement("button");
        chipButton.className = "aux-camera-chip";
        chipButton.type = "button";
        chipButton.textContent = spec.chipLabel || spec.title;
        chipButton.setAttribute("aria-label", `Restore ${spec.title}`);
        chipButton.hidden = true;
        const chipDock = panelSide === "left" ? this.chipDockLeft : this.chipDockRight;
        chipDock?.appendChild(chipButton);

        const camera = spec.mode === "orbit-xy"
            ? new this.THREE.OrthographicCamera(-1, 1, 1, -1, 0.0001, 100000)
            : new this.THREE.PerspectiveCamera(spec.defaultFov, 1, 0.0001, 100000);
        camera.up.set(0, 0, 1);
        const panelRegistryId = `aux:${spec.id}`;
        panel.id = `aux-camera-panel-${spec.id}`;
        panel.dataset.panelId = panelRegistryId;
        const persistedLayout = readMissionPanelState(panelRegistryId);
        const persistedState = normalizeMissionPanelState(persistedLayout?.state, "");
        const hasPersistedVisibilityState = persistedState.length > 0;
        const persistedLayoutPresetVersion = asTrimmedString(persistedLayout?.layoutPresetVersion);
        const persistedX = Number(persistedLayout?.x);
        const persistedY = Number(persistedLayout?.y);
        const persistedWidth = Number(persistedLayout?.width);
        const persistedHeight = Number(persistedLayout?.height);
        const hasPersistedFrame =
            Number.isFinite(persistedX) &&
            Number.isFinite(persistedY) &&
            Number.isFinite(persistedWidth) &&
            Number.isFinite(persistedHeight);

        const panelState = {
            id: spec.id,
            title: spec.title,
            anchorKey: spec.anchorKey || "craft",
            targetKey: spec.targetKey,
            infoMode: spec.infoMode || "none",
            mode: panelMode,
            side: panelSide,
            panel,
            viewport,
            renderer,
            camera,
            info,
            infoPrimary,
            infoPrimaryText,
            infoSecondary,
            infoPill,
            composerPresetWrap,
            composerLookFreeButton,
            composerLookEarthButton,
            composerLookMoonButton,
            composerSkyControlsWrap,
            composerSkyTimelineWrap,
            composerFovWrap,
            composerTimelineWrap,
            composerTransportRow,
            composerTransportPlayButton,
            composerTransportMinusSecondButton,
            composerTransportMinusMinuteButton,
            composerTransportPlusMinuteButton,
            composerTransportPlusSecondButton,
            composerTransportSlowerButton,
            composerTransportSpeedButton,
            composerTransportFasterButton,
            composerPhasePrevButton,
            composerPhaseDetails,
            composerPhaseSummary,
            composerPhaseOptionsWrap,
            composerPhaseNextButton,
            composerTimelineSlider,
            composerTimelineLabel,
            composerTimelineLocalValue,
            composerFlybyEventsDetails,
            composerFlybyEventsSummary,
            composerFlybyEventsWrap,
            composerControlsWrap,
            composerResetButton,
            composerEarthAmbientSlider,
            composerEarthAmbientValue,
            composerMoonAmbientSlider,
            composerMoonAmbientValue,
            composerEarthshineSlider,
            composerEarthshineValue,
            composerMoonshineSlider,
            composerMoonshineValue,
            composerMoonOutlineWrap,
            composerMoonOutlineCheckbox,
            composerSeeThroughWrap,
            composerSeeThroughCheckbox,
            composerOpticsWrap,
            composerOpticsBody,
            composerOpticsToggleButton,
            composerOpticsPhysicalButton,
            composerOpticsCameraButton,
            composerExposureSlider,
            composerExposureValue,
            composerExposureTotalValue,
            composerAutoExposureWrap,
            composerAutoExposureCheckbox,
            composerOpticsStrengthSlider,
            composerOpticsStrengthValue,
            composerOpticsAdvancedPanel,
            composerOpticsHaloSlider,
            composerOpticsHaloValue,
            composerOpticsStarburstSlider,
            composerOpticsStarburstValue,
            composerOpticsFlareSlider,
            composerOpticsFlareValue,
            composerEclipseCoronaPanel,
            composerEclipseCoronaIntensitySlider,
            composerEclipseCoronaIntensityValue,
            composerEclipseCoronaMotionSlider,
            composerEclipseCoronaMotionValue,
            composerEclipseCoronaStructureSlider,
            composerEclipseCoronaStructureValue,
            composerEclipseZodiacalDustSlider,
            composerEclipseZodiacalDustValue,
            composerRollSlider,
            composerRollValue,
            composerRollDial,
            composerRollDialKnob,
            composerRollDialValue,
            composerInfoOverlayWrap,
            composerInfoOverlayCheckbox,
            composerRaDecGridWrap,
            composerRaDecGridCheckbox,
            composerSkyLabelsWrap,
            composerSkyLabelsCheckbox,
            composerConstellationLinesWrap,
            composerConstellationLinesCheckbox,
            composerConstellationLabelsWrap,
            composerConstellationLabelsCheckbox,
            composerCloudsWrap,
            composerCloudsCheckbox,
            composerLunarCratersWrap,
            composerLunarCratersPill,
            composerLunarCraterControls,
            composerSurfacePointsWrap,
            composerSurfacePointsPill,
            composerSurfacePointControls,
            composerTranscriptSyncedCheckbox,
            composerTranscriptWindowSlider,
            composerTranscriptWindowValue,
            composerTranscriptHoldSlider,
            composerTranscriptHoldValue,
            composerTranscriptPrevButton,
            composerTranscriptNextButton,
            composerStarMagnitudeSlider,
            composerStarMagnitudeValue,
            composerHint,
            composerMetricsStrip,
            composerLunarFeatureStack,
            composerLunarFeatureStackHeader,
            composerLunarFeatureStackList,
            composerLunarFeatureStackCloseButton,
            composerLunarFeatureStackRestoreButton,
            composerMetricFovHValue,
            composerMetricFovVValue,
            composerMetricDistanceMoonValue,
            composerMetricAngleValue,
            composerDisabledOverlay,
            composerControlMatrix,
            composerControlsToggleButton,
            composerControlsDockviewOpen: false,
            overlayCanvas,
            overlayCtx,
            farSideTintEnabled: false,
            overlayDirty: true,
            lastOverlayUpdateMs: -Infinity,
            width: 0,
            height: 0,
            onFovInput: null,
            fovControl,
            fovSlider,
            fovValue,
            fovMinDegrees: AUTO_FOV_MIN_DEGREES,
            fovMaxDegrees: maxFovDegrees,
            orthographicHalfHeight: 1,
            orbitZoomFovDegrees: spec.defaultFov,
            orbitPanOffsetX: 0,
            orbitPanOffsetY: 0,
            orbitViewportPointer: null,
            autoToggle,
            infoButton,
            minimizeButton: null,
            expandButton,
            closeButton,
            deleteButton,
            resizeGrip,
            panelControls,
            chipButton,
            autoFovEnabled: true,
            onAutoToggleClick: null,
            onInfoClick: null,
            onExpandClick: null,
            onCloseClick: null,
            onDeleteClick: null,
            onChipClick: null,
            onInfoPillClick: null,
            onComposerLookFreeClick: null,
            onComposerLookEarthClick: null,
            onComposerLookMoonClick: null,
            onComposerResetClick: null,
            onComposerEarthAmbientInput: null,
            onComposerMoonAmbientInput: null,
            onComposerEarthshineInput: null,
            onComposerMoonshineInput: null,
            onComposerMoonOutlineToggle: null,
            onComposerSeeThroughToggle: null,
            onComposerControlsToggleClick: null,
            onComposerOpticsPhysicalClick: null,
            onComposerOpticsCameraClick: null,
            onComposerOpticsToggleClick: null,
            onComposerExposureInput: null,
            onComposerAutoExposureChange: null,
            onComposerOpticsStrengthInput: null,
            onComposerOpticsHaloInput: null,
            onComposerOpticsStarburstInput: null,
            onComposerOpticsFlareInput: null,
            onComposerEclipseCoronaIntensityInput: null,
            onComposerEclipseCoronaMotionInput: null,
            onComposerEclipseCoronaStructureInput: null,
            onComposerEclipseZodiacalDustInput: null,
            onComposerTimelineInput: null,
            onComposerTimelinePointerDown: null,
            onComposerTimelinePointerUp: null,
            onComposerPhasePrevClick: null,
            onComposerPhaseNextClick: null,
            onComposerTransportPlayClick: null,
            onComposerTransportMinusSecondClick: null,
            onComposerTransportMinusMinuteClick: null,
            onComposerTransportPlusMinuteClick: null,
            onComposerTransportPlusSecondClick: null,
            onComposerTransportSlowerClick: null,
            onComposerTransportSpeedClick: null,
            onComposerTransportFasterClick: null,
            onComposerInfoOverlayToggle: null,
            onComposerCloudsChange: null,
            onComposerLunarCratersPillClick: null,
            unbindComposerLunarCraterControls: null,
            onComposerSurfacePointsPillClick: null,
            onComposerSurfacePointsCloseClick: null,
            onComposerSurfacePointToggle: null,
            onComposerRollInput: null,
            onComposerRollDialPointerDown: null,
            onComposerRollDialPointerMove: null,
            onComposerRollDialPointerUp: null,
            onComposerRaDecGridToggle: null,
            onComposerSkyLabelsToggle: null,
            onComposerConstellationLinesToggle: null,
            onComposerConstellationLabelsToggle: null,
            onComposerStarMagnitudeInput: null,
            onComposerViewportWheel: null,
            onComposerViewportPointerDown: null,
            onComposerViewportPointerMove: null,
            onComposerViewportPointerLeave: null,
            onComposerViewportPointerUp: null,
            onComposerPanelGatePointerDown: null,
            onPointerDown: null,
            onPointerMove: null,
            onPointerUp: null,
            onPointerCancel: null,
            onResizePointerDown: null,
            onResizePointerMove: null,
            onResizePointerUp: null,
            onResizePointerCancel: null,
            x: 0,
            y: 0,
            onPanelPointerDown: null,
            minimized: false,
            closed: false,
            deleted: false,
            maximized: persistedLayout?.maximized === true,
            restoreFrame: this.normalizePanelRestoreFrame(persistedLayout?.restoreFrame, null),
            panelRegistryId,
            sortOrder: index,
            fallbackDefaultState: getAuxiliaryPanelFallbackState(spec),
            hasPersistedVisibilityState,
            layoutPresetVersion: persistedLayoutPresetVersion,
            defaultLayoutManaged: hasPersistedFrame !== true,
            defaultStateApplied: hasPersistedVisibilityState,
            composerOnboarded: true,
            composerLockTarget: "moon",
            composerOrientationReference: "world",
            composerSurfaceTarget: null,
            composerMediaDriven: false,
            composerYawRad: 0,
            composerPitchRad: 0,
            composerRollRad: COMPOSER_DEFAULT_ROLL_RAD,
            composerEarthAmbient: panelMode === "composer" ? COMPOSER_DEFAULT_EARTH_AMBIENT : 0,
            composerMoonAmbient: panelMode === "composer" ? COMPOSER_DEFAULT_MOON_AMBIENT : 0,
            composerEarthshineGain: panelMode === "composer" ? COMPOSER_DEFAULT_EARTHSHINE_GAIN : 1,
            composerMoonshineGain: panelMode === "composer" ? COMPOSER_DEFAULT_MOONSHINE_GAIN : 1,
            composerMoonOutlineEnabled: false,
            composerSeeThroughEnabled: false,
            composerOpticsExpanded: false,
            composerSunProfile: "camera",
            composerExposureEv: COMPOSER_EXPOSURE_EV_DEFAULT,
            composerAutoExposureEnabled: true,
            composerSunStrength: COMPOSER_OPTICS_STRENGTH_DEFAULT,
            composerSunHaloGain: COMPOSER_OPTICS_ADVANCED_DEFAULT,
            composerSunStarburstGain: COMPOSER_OPTICS_ADVANCED_DEFAULT,
            composerSunFlareGain: COMPOSER_OPTICS_ADVANCED_DEFAULT,
            composerEclipseCoronaIntensity: COMPOSER_ECLIPSE_CORONA_DEFAULT,
            composerEclipseCoronaMotion: COMPOSER_ECLIPSE_CORONA_DEFAULT,
            composerEclipseCoronaStructure: COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
            composerEclipseZodiacalDust: COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
            composerSolarEclipseActive: false,
            composerEclipseAutoExposureEligible: true,
            composerTimelineDragging: false,
            composerTimelineWindowMs: COMPOSER_TIMELINE_WINDOW_MS,
            composerTimelineStartMs: Number.NaN,
            composerTimelineEndMs: Number.NaN,
            composerFlybyEventsSignature: "",
            composerFlybyEventNodes: [],
            composerFlybySelectedEventTimeMs: Number.NaN,
            composerPhaseSelectSignature: "",
            composerInteractionEnabled: true,
            composerControlsCollapsed: panelMode === "composer",
            composerInfoOverlayEnabled: true,
            composerRaDecGridEnabled: false,
            composerSkyLabelsEnabled: false,
            composerConstellationLinesEnabled: false,
            composerConstellationLabelsEnabled: false,
            composerEarthCloudsEnabled: true,
            composerLunarCratersEnabled: false,
            composerLunarCraterState: createDefaultLunarFeatureViewState(),
            composerLunarFeatureAttachment: null,
            composerLunarCraterPointer: null,
            composerLunarFeatureMentionView: null,
            composerLunarFeatureSyncedEnabled: true,
            composerLunarFeatureMentionWindowSeconds: COMPOSER_LUNAR_FEATURE_STACK_VISIBLE_WINDOW_SECONDS,
            composerLunarFeatureMentionLeadSeconds: COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_LEAD_SECONDS,
            composerLunarFeatureMentionTrailSeconds: COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_TRAIL_SECONDS,
            composerLunarFeatureStackLeftPx: Number.NaN,
            composerLunarFeatureStackTopPx: Number.NaN,
            composerLunarFeatureStackDrag: null,
            composerLunarFeatureStackDismissed: false,
            composerLockedViewportPointer: null,
            composerSurfacePointState: createDefaultSurfacePointViewState(),
            composerStarMagnitudeLimit: COMPOSER_STAR_MAGNITUDE_DEFAULT,
            onOrbitViewportWheel: null,
            onAuxiliaryViewportWheel: null,
            onOrbitViewportPointerDown: null,
            onOrbitViewportPointerMove: null,
            onOrbitViewportPointerUp: null,
            composerHintTimer: null,
            composerViewportPointer: null,
            composerRollDialPointerId: null,
            missionEnabled: panelMode === "composer"
                ? this.composerEnabled
                : this.missionPanelsEnabled,
        };

        const syncAutoToggleUi = () => {
            const isFreeComposer = panelState.mode === "composer" &&
                (panelState.composerLockTarget || "none") === "none";
            if (isFreeComposer && panelState.autoFovEnabled === true) {
                panelState.autoFovEnabled = false;
            }
            const enabled = panelState.autoFovEnabled === true;
            panelState.fovControl?.setAutoEnabled(enabled);
            panelState.fovControl?.setDisabledState({
                autoButtonDisabled: autoToggle.disabled || isFreeComposer,
                sliderDisabled: enabled,
                valueDisabled: false,
            });
        };

        const onFovInput = () => {
            const fallbackFov = panelState.camera?.isOrthographicCamera
                ? (panelState.orbitZoomFovDegrees || 45)
                : panelState.camera.fov;
            const fov = panelState.fovControl?.readSliderFovDegrees(fallbackFov)
                ?? fallbackFov;
            this.setPanelFov(panelState, fov);
            this.requestRender?.();
            this.queuePersistPanelState();
        };
        const onAutoToggleClick = () => {
            if (panelState.mode === "orbit-xy") {
                panelState.autoFovEnabled = !panelState.autoFovEnabled;
                if (panelState.autoFovEnabled) {
                    this.applyOrbitPlaneAutoFit(panelState);
                }
                syncAutoToggleUi();
                this.requestRender?.();
                this.queuePersistPanelState();
                return;
            }
            if (panelState.mode === "composer" && (panelState.composerLockTarget || "none") === "none") {
                return;
            }
            panelState.autoFovEnabled = !panelState.autoFovEnabled;
            syncAutoToggleUi();
            if (panelState.autoFovEnabled) {
                this.requestRender?.();
            } else {
                onFovInput();
            }
            this.queuePersistPanelState();
        };
        const onInfoClick = () => {
            showMissionPanelInfo(panelState.panelRegistryId, infoButton);
        };
        const onExpandClick = () => {
            this.setPanelMaximized(panelState, panelState.maximized !== true);
        };
        const onCloseClick = () => {
            this.setPanelClosed(panelState, true);
        };
        const onDeleteClick = () => {
            this.confirmAndDeletePanel(panelState);
        };
        let syncComposerLockUi = null;
        let syncComposerCloudsUi = null;
        let syncComposerLunarCratersUi = null;
            const onChipClick = () => {
                if (panelState.mode === "composer") {
                    this.restoreComposerGuidedPanel(panelState);
                    return;
                }
                this.setPanelMinimized(panelState, false);
                this.bringPanelToFront(panelState);
            if (panelState.mode === "composer" && panelState.composerInteractionEnabled !== true) {
                this.activateComposerWindow(panelState, { finalize: true });
            }
        };
        fovSlider.addEventListener("input", onFovInput, { passive: true });
        autoToggle.addEventListener("click", onAutoToggleClick);
        infoButton.addEventListener("click", onInfoClick);
        expandButton.addEventListener("click", onExpandClick);
        closeButton.addEventListener("click", onCloseClick);
        deleteButton.addEventListener("click", onDeleteClick);
        chipButton.addEventListener("click", onChipClick);
        if (composerControlsToggleButton) {
            const onComposerControlsToggleClick = () => {
                if (this.isDockviewAuxiliaryPanelEnabled()) {
                    this.toggleComposerControlsPanel(panelState);
                    return;
                }
                this.setComposerControlsCollapsed(
                    panelState,
                    panelState.composerControlsCollapsed !== true,
                );
            };
            composerControlsToggleButton.addEventListener("click", onComposerControlsToggleClick);
            panelState.onComposerControlsToggleClick = onComposerControlsToggleClick;
        }
        panelState.onAutoToggleClick = onAutoToggleClick;
        panelState.onFovInput = onFovInput;
        panelState.onInfoClick = onInfoClick;
        panelState.onExpandClick = onExpandClick;
        panelState.onCloseClick = onCloseClick;
        panelState.onDeleteClick = onDeleteClick;
        panelState.onChipClick = onChipClick;

        if (panelState.mode === "composer") {
            const activateComposerForControl = () => {
                if (panelState.composerInteractionEnabled === true) {
                    return false;
                }
                this.activateComposerWindow(panelState, { finalize: true });
                return true;
            };
            const requestComposerControlRender = () => {
                this.requestRender?.();
                this.scheduleVisiblePanelsRefresh();
            };
            panelState.composerLunarFeatureAttachment = createLunarFeatureViewAttachment({
                controls: panelState.composerLunarCraterControls,
                initialState: panelState.composerLunarCraterState,
                activate: activateComposerForControl,
                requestRender: requestComposerControlRender,
                persist: () => this.queuePersistPanelState(),
                onStateChange: (state, { enabled } = {}) => {
                    panelState.composerLunarCraterState = state;
                    panelState.composerLunarCratersEnabled = enabled === true;
                },
            });
            syncComposerLockUi = () => {
                const lockTarget = panelState.composerLockTarget || "none";
                panelState.composerLookFreeButton?.classList.toggle("is-active", lockTarget === "none");
                panelState.composerLookEarthButton?.classList.toggle("is-active", lockTarget === "earth");
                panelState.composerLookMoonButton?.classList.toggle("is-active", lockTarget === "moon");
            };
            const syncComposerAmbientUi = () => {
                const syncOne = (slider, valueNode, ambientValue) => {
                    if (!slider || !valueNode) {
                        return;
                    }
                    slider.value = String(ambientValue);
                    const ambientText = ambientValue.toFixed(2);
                    valueNode.value = ambientText;
                    valueNode.textContent = ambientText;
                };
                syncOne(
                    panelState.composerEarthAmbientSlider,
                    panelState.composerEarthAmbientValue,
                    panelState.composerEarthAmbient,
                );
                syncOne(
                    panelState.composerMoonAmbientSlider,
                    panelState.composerMoonAmbientValue,
                    panelState.composerMoonAmbient,
                );
                syncOne(
                    panelState.composerEarthshineSlider,
                    panelState.composerEarthshineValue,
                    panelState.composerEarthshineGain,
                );
                syncOne(
                    panelState.composerMoonshineSlider,
                    panelState.composerMoonshineValue,
                    panelState.composerMoonshineGain,
                );
                if (panelState.composerMoonOutlineCheckbox) {
                    panelState.composerMoonOutlineCheckbox.checked = panelState.composerMoonOutlineEnabled === true;
                }
                if (panelState.composerSeeThroughCheckbox) {
                    panelState.composerSeeThroughCheckbox.checked = panelState.composerSeeThroughEnabled === true;
                }
            };
            const syncComposerStarMagnitudeUi = () => {
                if (!panelState.composerStarMagnitudeSlider || !panelState.composerStarMagnitudeValue) {
                    return;
                }
                const magnitude = this.THREE.MathUtils.clamp(
                    Number(panelState.composerStarMagnitudeLimit),
                    COMPOSER_STAR_MAGNITUDE_MIN,
                    COMPOSER_STAR_MAGNITUDE_MAX,
                );
                panelState.composerStarMagnitudeLimit = Number.isFinite(magnitude)
                    ? magnitude
                    : COMPOSER_STAR_MAGNITUDE_DEFAULT;
                const text = panelState.composerStarMagnitudeLimit.toFixed(1);
                panelState.composerStarMagnitudeSlider.value = text;
                panelState.composerStarMagnitudeValue.value = text;
                panelState.composerStarMagnitudeValue.textContent = text;
            };
            const syncComposerTranscriptFeatureUi = () => {
                if (panelState.composerTranscriptSyncedCheckbox) {
                    panelState.composerTranscriptSyncedCheckbox.checked =
                        panelState.composerLunarFeatureSyncedEnabled !== false;
                }
                const windowSeconds = this.THREE.MathUtils.clamp(
                    Number(panelState.composerLunarFeatureMentionWindowSeconds),
                    60,
                    900,
                );
                panelState.composerLunarFeatureMentionWindowSeconds = Number.isFinite(windowSeconds)
                    ? windowSeconds
                    : COMPOSER_LUNAR_FEATURE_STACK_VISIBLE_WINDOW_SECONDS;
                if (panelState.composerTranscriptWindowSlider) {
                    panelState.composerTranscriptWindowSlider.value =
                        String(panelState.composerLunarFeatureMentionWindowSeconds);
                }
                if (panelState.composerTranscriptWindowValue) {
                    const minutes = Math.round(panelState.composerLunarFeatureMentionWindowSeconds / 60);
                    panelState.composerTranscriptWindowValue.value = `${minutes}m`;
                    panelState.composerTranscriptWindowValue.textContent = `${minutes}m`;
                }

                const holdSeconds = this.THREE.MathUtils.clamp(
                    Number(panelState.composerLunarFeatureMentionLeadSeconds) +
                        Number(panelState.composerLunarFeatureMentionTrailSeconds),
                    5,
                    90,
                );
                const safeHoldSeconds = Number.isFinite(holdSeconds)
                    ? holdSeconds
                    : COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_LEAD_SECONDS + COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_TRAIL_SECONDS;
                panelState.composerLunarFeatureMentionLeadSeconds = Math.round(safeHoldSeconds / 3);
                panelState.composerLunarFeatureMentionTrailSeconds =
                    safeHoldSeconds - panelState.composerLunarFeatureMentionLeadSeconds;
                if (panelState.composerTranscriptHoldSlider) {
                    panelState.composerTranscriptHoldSlider.value = String(safeHoldSeconds);
                }
                if (panelState.composerTranscriptHoldValue) {
                    panelState.composerTranscriptHoldValue.value = `${safeHoldSeconds}s`;
                    panelState.composerTranscriptHoldValue.textContent = `${safeHoldSeconds}s`;
                }
            };
            const syncComposerExposureUi = () => {
                const exposureEv = this.THREE.MathUtils.clamp(
                    Number(panelState.composerExposureEv),
                    COMPOSER_EXPOSURE_EV_MIN,
                    COMPOSER_EXPOSURE_EV_MAX,
                );
                panelState.composerExposureEv = Number.isFinite(exposureEv)
                    ? exposureEv
                    : COMPOSER_EXPOSURE_EV_DEFAULT;
                const exposureText = `${panelState.composerExposureEv >= 0 ? "+" : ""}${panelState.composerExposureEv.toFixed(1)} EV`;
                if (panelState.composerExposureSlider) {
                    panelState.composerExposureSlider.value = panelState.composerExposureEv.toFixed(1);
                }
                if (panelState.composerExposureValue) {
                    panelState.composerExposureValue.value = exposureText;
                    panelState.composerExposureValue.textContent = exposureText;
                }
                if (panelState.composerExposureTotalValue) {
                    const exposureState = this.resolveComposerExposureState(panelState);
                    const totalEv = exposureState.manualEv + exposureState.autoEv;
                    const totalText = `Total ${totalEv >= 0 ? "+" : ""}${totalEv.toFixed(1)} EV`;
                    panelState.composerExposureTotalValue.value = totalText;
                    panelState.composerExposureTotalValue.textContent = totalText;
                    panelState.composerExposureTotalValue.title = exposureState.autoEv !== 0
                        ? `Manual ${exposureState.manualEv >= 0 ? "+" : ""}${exposureState.manualEv.toFixed(1)} EV + auto ${exposureState.autoEv >= 0 ? "+" : ""}${exposureState.autoEv.toFixed(1)} EV`
                        : `Manual ${exposureState.manualEv >= 0 ? "+" : ""}${exposureState.manualEv.toFixed(1)} EV`;
                }
                if (panelState.composerAutoExposureCheckbox) {
                    panelState.composerAutoExposureCheckbox.checked = panelState.composerAutoExposureEnabled !== false;
                }
                panelState.composerAutoExposureWrap?.classList.toggle(
                    "is-active",
                    panelState.composerAutoExposureEnabled !== false,
                );
            };
            syncComposerCloudsUi = () => {
                if (!panelState.composerCloudsCheckbox) {
                    return;
                }
                const enabled = this.getEarthCloudsEnabled() !== false;
                panelState.composerEarthCloudsEnabled = enabled;
                panelState.composerCloudsCheckbox.checked = enabled;
                const title = enabled
                    ? "Hide Earth cloud cover in all Earth renders"
                    : "Show Earth cloud cover in all Earth renders";
                panelState.composerCloudsWrap?.classList.toggle("is-active", enabled);
                panelState.composerCloudsWrap?.setAttribute("title", title);
            };
            syncComposerLunarCratersUi = () => {
                const attachment = panelState.composerLunarFeatureAttachment;
                if (!attachment) {
                    return;
                }
                panelState.composerLunarCraterState = attachment.setState(panelState.composerLunarCraterState);
                panelState.composerLunarCratersEnabled = attachment.enabled;
                panelState.composerLunarCratersWrap?.setAttribute("title", "Open lunar feature controls");
            };
            const syncComposerSurfacePointsUi = () => {
                const controls = panelState.composerSurfacePointControls;
                if (!controls) return;
                panelState.composerSurfacePointState = patchSurfacePointViewState(
                    createDefaultSurfacePointViewState(),
                    panelState.composerSurfacePointState,
                );
                const anyActive = hasSurfacePointViewEnabled(panelState.composerSurfacePointState);
                controls.entries?.forEach?.(({ key, input }) => {
                    if (input) input.checked = panelState.composerSurfacePointState?.[key] === true;
                });
                panelState.composerSurfacePointsPill?.classList.toggle("is-active", anyActive);
                panelState.composerSurfacePointsPill?.setAttribute("aria-pressed", anyActive ? "true" : "false");
                panelState.composerSurfacePointsPill?.setAttribute(
                    "aria-expanded",
                    controls.panel?.hidden === false ? "true" : "false",
                );
                panelState.composerSurfacePointsWrap?.setAttribute("title", "Open surface point controls");
            };
            const syncComposerOpticsUi = () => {
                if (panelState.composerOpticsBody) {
                    panelState.composerOpticsBody.hidden = false;
                }
                if (panelState.composerOpticsToggleButton) {
                    panelState.composerOpticsToggleButton.setAttribute("aria-expanded", "true");
                    panelState.composerOpticsToggleButton.setAttribute(
                        "aria-label",
                        "Advanced controls",
                    );
                    const icon = panelState.composerOpticsToggleButton.querySelector(".aux-camera-view__composer-disclosure-icon");
                    if (icon) {
                        icon.textContent = "\u25be";
                    }
                }
                const profile = panelState.composerSunProfile === "physical" ? "physical" : "camera";
                panelState.composerOpticsPhysicalButton?.classList.toggle("is-active", profile === "physical");
                panelState.composerOpticsCameraButton?.classList.toggle("is-active", profile === "camera");
                syncComposerExposureUi();
                if (panelState.composerOpticsStrengthSlider && panelState.composerOpticsStrengthValue) {
                    panelState.composerOpticsStrengthSlider.value = String(panelState.composerSunStrength);
                    const text = panelState.composerSunStrength.toFixed(2);
                    panelState.composerOpticsStrengthValue.value = text;
                    panelState.composerOpticsStrengthValue.textContent = text;
                }
                if (panelState.composerOpticsAdvancedPanel) {
                    panelState.composerOpticsAdvancedPanel.hidden = false;
                }
                const syncGain = (slider, valueNode, gain) => {
                    if (!slider || !valueNode) return;
                    slider.value = String(gain);
                    const text = gain.toFixed(2);
                    valueNode.value = text;
                    valueNode.textContent = text;
                };
                syncGain(panelState.composerOpticsHaloSlider, panelState.composerOpticsHaloValue, panelState.composerSunHaloGain);
                syncGain(panelState.composerOpticsStarburstSlider, panelState.composerOpticsStarburstValue, panelState.composerSunStarburstGain);
                syncGain(panelState.composerOpticsFlareSlider, panelState.composerOpticsFlareValue, panelState.composerSunFlareGain);
                syncGain(
                    panelState.composerEclipseCoronaIntensitySlider,
                    panelState.composerEclipseCoronaIntensityValue,
                    panelState.composerEclipseCoronaIntensity,
                );
                syncGain(
                    panelState.composerEclipseCoronaMotionSlider,
                    panelState.composerEclipseCoronaMotionValue,
                    panelState.composerEclipseCoronaMotion,
                );
                syncGain(
                    panelState.composerEclipseCoronaStructureSlider,
                    panelState.composerEclipseCoronaStructureValue,
                    panelState.composerEclipseCoronaStructure,
                );
                syncGain(
                    panelState.composerEclipseZodiacalDustSlider,
                    panelState.composerEclipseZodiacalDustValue,
                    panelState.composerEclipseZodiacalDust,
                );
            };
            const setComposerOpticsProfile = (nextProfile) => {
                panelState.composerSunProfile = nextProfile === "physical" ? "physical" : "camera";
                syncComposerOpticsUi();
                requestComposerControlRender();
            };
            const setComposerExposureEv = (nextExposureEv, { persist = false } = {}) => {
                const bounded = this.THREE.MathUtils.clamp(
                    Number(nextExposureEv),
                    COMPOSER_EXPOSURE_EV_MIN,
                    COMPOSER_EXPOSURE_EV_MAX,
                );
                if (!Number.isFinite(bounded)) {
                    return;
                }
                panelState.composerExposureEv = bounded;
                syncComposerExposureUi();
                if (persist) {
                    this.queuePersistPanelState();
                }
                requestComposerControlRender();
            };
            const setComposerAutoExposureEnabled = (enabled, { persist = false } = {}) => {
                panelState.composerAutoExposureEnabled = enabled !== false;
                syncComposerExposureUi();
                if (persist) {
                    this.queuePersistPanelState();
                }
                requestComposerControlRender();
            };
            const onComposerOpticsToggleClick = () => {
                panelState.composerOpticsExpanded = panelState.composerOpticsExpanded !== true;
                syncComposerOpticsUi();
                requestComposerControlRender();
            };
            const setComposerOpticsStrength = (nextStrength) => {
                const bounded = this.THREE.MathUtils.clamp(
                    Number(nextStrength),
                    COMPOSER_OPTICS_STRENGTH_MIN,
                    COMPOSER_OPTICS_STRENGTH_MAX,
                );
                if (!Number.isFinite(bounded)) {
                    return;
                }
                panelState.composerSunStrength = bounded;
                syncComposerOpticsUi();
                requestComposerControlRender();
            };
            const setComposerOpticsGain = (key, nextValue) => {
                const bounded = this.THREE.MathUtils.clamp(
                    Number(nextValue),
                    COMPOSER_OPTICS_ADVANCED_MIN,
                    COMPOSER_OPTICS_ADVANCED_MAX,
                );
                if (!Number.isFinite(bounded)) {
                    return;
                }
                panelState[key] = bounded;
                syncComposerOpticsUi();
                requestComposerControlRender();
            };
            const setComposerEclipseCoronaGain = (key, nextValue) => {
                const bounded = this.THREE.MathUtils.clamp(
                    Number(nextValue),
                    COMPOSER_ECLIPSE_CORONA_MIN,
                    COMPOSER_ECLIPSE_CORONA_MAX,
                );
                if (!Number.isFinite(bounded)) {
                    return;
                }
                panelState[key] = bounded;
                syncComposerOpticsUi();
                requestComposerControlRender();
            };
            const setComposerAmbient = (ambientKey, nextAmbient, { persist = false } = {}) => {
                const bounded = this.THREE.MathUtils.clamp(
                    Number(nextAmbient),
                    COMPOSER_MIN_AMBIENT,
                    COMPOSER_MAX_AMBIENT,
                );
                if (!Number.isFinite(bounded)) {
                    return;
                }
                panelState[ambientKey] = bounded;
                syncComposerAmbientUi();
                if (persist) {
                    this.queuePersistPanelState();
                }
                requestComposerControlRender();
            };
            const setComposerEarthshineGain = (nextGain, { persist = false } = {}) => {
                const bounded = this.THREE.MathUtils.clamp(
                    Number(nextGain),
                    COMPOSER_MIN_EARTHSHINE_GAIN,
                    COMPOSER_MAX_EARTHSHINE_GAIN,
                );
                if (!Number.isFinite(bounded)) {
                    return;
                }
                panelState.composerEarthshineGain = bounded;
                syncComposerAmbientUi();
                if (persist) {
                    this.queuePersistPanelState();
                }
                requestComposerControlRender();
            };
            const setComposerMoonshineGain = (nextGain, { persist = false } = {}) => {
                const bounded = this.THREE.MathUtils.clamp(
                    Number(nextGain),
                    COMPOSER_MIN_MOONSHINE_GAIN,
                    COMPOSER_MAX_MOONSHINE_GAIN,
                );
                if (!Number.isFinite(bounded)) {
                    return;
                }
                panelState.composerMoonshineGain = bounded;
                syncComposerAmbientUi();
                if (persist) {
                    this.queuePersistPanelState();
                }
                requestComposerControlRender();
            };
            const setComposerStarMagnitudeLimit = (nextMagnitude, { persist = false } = {}) => {
                const bounded = this.THREE.MathUtils.clamp(
                    Number(nextMagnitude),
                    COMPOSER_STAR_MAGNITUDE_MIN,
                    COMPOSER_STAR_MAGNITUDE_MAX,
                );
                if (!Number.isFinite(bounded)) {
                    return;
                }
                panelState.composerStarMagnitudeLimit = bounded;
                syncComposerStarMagnitudeUi();
                if (persist) {
                    this.queuePersistPanelState();
                }
                requestComposerControlRender();
            };
            const resetComposerControlsToDefaults = ({ persist = false } = {}) => {
                panelState.composerEarthAmbient = COMPOSER_DEFAULT_EARTH_AMBIENT;
                panelState.composerMoonAmbient = COMPOSER_DEFAULT_MOON_AMBIENT;
                panelState.composerEarthshineGain = COMPOSER_DEFAULT_EARTHSHINE_GAIN;
                panelState.composerMoonshineGain = COMPOSER_DEFAULT_MOONSHINE_GAIN;
                panelState.composerMoonOutlineEnabled = false;
                panelState.composerSeeThroughEnabled = false;
                panelState.composerInfoOverlayEnabled = true;
                panelState.composerRaDecGridEnabled = false;
                panelState.composerSkyLabelsEnabled = false;
                panelState.composerConstellationLinesEnabled = false;
                panelState.composerConstellationLabelsEnabled = false;
                panelState.composerStarMagnitudeLimit = COMPOSER_STAR_MAGNITUDE_DEFAULT;
                panelState.composerEarthCloudsEnabled = true;
                panelState.composerSurfacePointState = createDefaultSurfacePointViewState();
                panelState.composerLunarCraterState = createDefaultLunarFeatureViewState();
                panelState.composerLunarFeatureAttachment?.setState(panelState.composerLunarCraterState);
                panelState.composerSunProfile = "camera";
                panelState.composerExposureEv = COMPOSER_EXPOSURE_EV_DEFAULT;
                panelState.composerAutoExposureEnabled = true;
                panelState.composerSunStrength = COMPOSER_OPTICS_STRENGTH_DEFAULT;
                panelState.composerSunHaloGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
                panelState.composerSunStarburstGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
                panelState.composerSunFlareGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
                panelState.composerEclipseCoronaIntensity = COMPOSER_ECLIPSE_CORONA_DEFAULT;
                panelState.composerEclipseCoronaMotion = COMPOSER_ECLIPSE_CORONA_DEFAULT;
                panelState.composerEclipseCoronaStructure = COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT;
                panelState.composerEclipseZodiacalDust = COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT;
                panelState.composerRollRad = COMPOSER_DEFAULT_ROLL_RAD;

                this.setEarthCloudsEnabled?.(true);
                if (panelState.composerInfoOverlayCheckbox) {
                    panelState.composerInfoOverlayCheckbox.checked = true;
                }
                if (panelState.composerRaDecGridCheckbox) {
                    panelState.composerRaDecGridCheckbox.checked = false;
                }
                if (panelState.composerSkyLabelsCheckbox) {
                    panelState.composerSkyLabelsCheckbox.checked = false;
                }
                if (panelState.composerConstellationLinesCheckbox) {
                    panelState.composerConstellationLinesCheckbox.checked = false;
                }
                if (panelState.composerConstellationLabelsCheckbox) {
                    panelState.composerConstellationLabelsCheckbox.checked = false;
                }
                syncComposerAmbientUi();
                syncComposerStarMagnitudeUi();
                syncComposerCloudsUi?.();
                syncComposerLunarCratersUi?.();
                syncComposerSurfacePointsUi();
                syncComposerOpticsUi();
                syncComposerRollUi();
                panelState.overlayDirty = true;
                if (persist) {
                    this.queuePersistPanelState();
                }
                requestComposerControlRender();
            };
            const onComposerCloudsChange = () => {
                activateComposerForControl();
                const nextEnabled = panelState.composerCloudsCheckbox?.checked !== false;
                panelState.composerEarthCloudsEnabled = nextEnabled;
                this.setEarthCloudsEnabled?.(nextEnabled);
                syncComposerCloudsUi();
                requestComposerControlRender();
                this.queuePersistPanelState();
            };
            const commitComposerSurfacePointPatch = (patch = {}) => {
                activateComposerForControl();
                panelState.composerSurfacePointState = patchSurfacePointViewState(
                    panelState.composerSurfacePointState,
                    patch,
                );
                syncComposerSurfacePointsUi();
                requestComposerControlRender();
            };
            const onComposerLunarCratersPillClick = (event) => {
                activateComposerForControl();
                event?.stopPropagation?.();
                const panel = panelState.composerLunarCraterControls?.panel;
                if (!panel) return;
                panel.hidden = panel.hidden === false;
                syncComposerLunarCratersUi();
            };
            const onComposerSurfacePointsPillClick = (event) => {
                activateComposerForControl();
                event?.stopPropagation?.();
                const panel = panelState.composerSurfacePointControls?.panel;
                if (!panel) return;
                panel.hidden = panel.hidden === false;
                syncComposerSurfacePointsUi();
            };
            const onComposerSurfacePointsCloseClick = () => {
                const panel = panelState.composerSurfacePointControls?.panel;
                if (panel) panel.hidden = true;
                syncComposerSurfacePointsUi();
            };
            const onComposerSurfacePointToggle = (event) => {
                const key = event?.target?.dataset?.surfacePointKey;
                if (!key) return;
                commitComposerSurfacePointPatch({ [key]: event.target.checked === true });
            };
            const syncComposerRollUi = () => {
                const normalizedRoll = normalizeComposerRollRad(panelState.composerRollRad);
                panelState.composerRollRad = normalizedRoll;
                const degrees = Math.round(this.THREE.MathUtils.radToDeg(normalizedRoll)) % 360;
                const text = `${degrees}°`;
                if (panelState.composerRollSlider) {
                    panelState.composerRollSlider.value = String(degrees);
                }
                if (panelState.composerRollValue) {
                    panelState.composerRollValue.value = text;
                    panelState.composerRollValue.textContent = text;
                }
                if (panelState.composerRollDialValue) {
                    panelState.composerRollDialValue.textContent = text;
                }
                if (panelState.composerRollDialKnob) {
                    const offset = composerRollDialKnobOffset(normalizedRoll, 18);
                    panelState.composerRollDialKnob.style.transform = `translate(calc(-50% + ${offset.x.toFixed(2)}px), calc(-50% + ${offset.y.toFixed(2)}px))`;
                }
            };
            const onComposerRollInput = () => {
                activateComposerForControl();
                if (!panelState.composerRollSlider) {
                    return;
                }
                const degrees = Number(panelState.composerRollSlider.value);
                if (!Number.isFinite(degrees)) {
                    return;
                }
                panelState.composerRollRad = this.THREE.MathUtils.degToRad(degrees);
                syncComposerRollUi();
                this.requestRender?.();
            };
            const setComposerRollFromDialPointer = (event) => {
                if (!panelState.composerRollDial) {
                    return;
                }
                const rect = panelState.composerRollDial.getBoundingClientRect();
                panelState.composerRollRad = rollRadFromDialPointer({
                    pointerX: event.clientX,
                    pointerY: event.clientY,
                    centerX: rect.left + rect.width * 0.5,
                    centerY: rect.top + rect.height * 0.5,
                });
                syncComposerRollUi();
                this.requestRender?.();
            };
            const onComposerRollDialPointerDown = (event) => {
                if (event.button !== 0) {
                    return;
                }
                activateComposerForControl();
                panelState.composerRollDialPointerId = event.pointerId;
                panelState.composerRollDial?.classList.add("is-active");
                panelState.composerRollDial?.setPointerCapture(event.pointerId);
                setComposerRollFromDialPointer(event);
                event.preventDefault();
                event.stopPropagation();
            };
            const onComposerRollDialPointerMove = (event) => {
                if (panelState.composerRollDialPointerId !== event.pointerId) {
                    return;
                }
                setComposerRollFromDialPointer(event);
                event.preventDefault();
                event.stopPropagation();
            };
            const releaseComposerRollDial = (event) => {
                if (panelState.composerRollDialPointerId !== event.pointerId) {
                    return;
                }
                if (panelState.composerRollDial?.hasPointerCapture(event.pointerId)) {
                    panelState.composerRollDial.releasePointerCapture(event.pointerId);
                }
                panelState.composerRollDialPointerId = null;
                panelState.composerRollDial?.classList.remove("is-active");
                this.queuePersistPanelState();
            };
            const onComposerRaDecGridToggle = () => {
                activateComposerForControl();
                panelState.composerRaDecGridEnabled = !!panelState.composerRaDecGridCheckbox?.checked;
                panelState.overlayDirty = true;
                this.requestRender?.();
            };
            const onComposerSkyLabelsToggle = () => {
                activateComposerForControl();
                panelState.composerSkyLabelsEnabled = !!panelState.composerSkyLabelsCheckbox?.checked;
                panelState.overlayDirty = true;
                this.requestRender?.();
            };
            const onComposerConstellationLinesToggle = () => {
                activateComposerForControl();
                panelState.composerConstellationLinesEnabled =
                    !!panelState.composerConstellationLinesCheckbox?.checked;
                this.requestRender?.();
                this.queuePersistPanelState();
            };
            const onComposerConstellationLabelsToggle = () => {
                activateComposerForControl();
                panelState.composerConstellationLabelsEnabled =
                    !!panelState.composerConstellationLabelsCheckbox?.checked;
                panelState.overlayDirty = true;
                this.requestRender?.();
                this.queuePersistPanelState();
            };
            const setComposerLockTarget = (target) => {
                this.setComposerLockTarget(panelState, target, {
                    syncComposerLockUi,
                    syncAutoToggleUi,
                });
            };
            const onComposerLookFreeClick = () => {
                this.setComposerOrientationReference(panelState, "world");
                setComposerLockTarget("none");
            };
            const onComposerLookEarthClick = () => {
                setComposerLockTarget("earth");
            };
            const onComposerLookMoonClick = () => {
                setComposerLockTarget("moon");
            };
            const onComposerResetClick = () => {
                activateComposerForControl();
                resetComposerControlsToDefaults({ persist: true });
            };
            const onComposerEarthAmbientInput = () => {
                activateComposerForControl();
                setComposerAmbient("composerEarthAmbient", panelState.composerEarthAmbientSlider?.value, { persist: true });
            };
            const onComposerMoonAmbientInput = () => {
                activateComposerForControl();
                setComposerAmbient("composerMoonAmbient", panelState.composerMoonAmbientSlider?.value, { persist: true });
            };
            const onComposerEarthshineInput = () => {
                activateComposerForControl();
                setComposerEarthshineGain(panelState.composerEarthshineSlider?.value, { persist: true });
            };
            const onComposerMoonshineInput = () => {
                activateComposerForControl();
                setComposerMoonshineGain(panelState.composerMoonshineSlider?.value, { persist: true });
            };
            const onComposerMoonOutlineToggle = () => {
                activateComposerForControl();
                panelState.composerMoonOutlineEnabled = !!panelState.composerMoonOutlineCheckbox?.checked;
                panelState.overlayDirty = true;
                this.requestRender?.();
            };
            const onComposerSeeThroughToggle = () => {
                activateComposerForControl();
                panelState.composerSeeThroughEnabled = !!panelState.composerSeeThroughCheckbox?.checked;
                panelState.overlayDirty = true;
                this.requestRender?.();
            };
            const onComposerOpticsPhysicalClick = () => {
                activateComposerForControl();
                setComposerOpticsProfile("physical");
            };
            const onComposerOpticsCameraClick = () => {
                activateComposerForControl();
                setComposerOpticsProfile("camera");
            };
            const onComposerExposureInput = () => {
                activateComposerForControl();
                setComposerExposureEv(panelState.composerExposureSlider?.value, { persist: true });
            };
            const onComposerAutoExposureChange = () => {
                activateComposerForControl();
                setComposerAutoExposureEnabled(panelState.composerAutoExposureCheckbox?.checked !== false, {
                    persist: true,
                });
            };
            const onComposerOpticsStrengthInput = () => {
                activateComposerForControl();
                setComposerOpticsStrength(panelState.composerOpticsStrengthSlider?.value);
            };
            const onComposerOpticsHaloInput = () => {
                activateComposerForControl();
                setComposerOpticsGain("composerSunHaloGain", panelState.composerOpticsHaloSlider?.value);
            };
            const onComposerOpticsStarburstInput = () => {
                activateComposerForControl();
                setComposerOpticsGain("composerSunStarburstGain", panelState.composerOpticsStarburstSlider?.value);
            };
            const onComposerOpticsFlareInput = () => {
                activateComposerForControl();
                setComposerOpticsGain("composerSunFlareGain", panelState.composerOpticsFlareSlider?.value);
            };
            const onComposerEclipseCoronaIntensityInput = () => {
                activateComposerForControl();
                setComposerEclipseCoronaGain(
                    "composerEclipseCoronaIntensity",
                    panelState.composerEclipseCoronaIntensitySlider?.value,
                );
            };
            const onComposerEclipseCoronaMotionInput = () => {
                activateComposerForControl();
                setComposerEclipseCoronaGain(
                    "composerEclipseCoronaMotion",
                    panelState.composerEclipseCoronaMotionSlider?.value,
                );
            };
            const onComposerEclipseCoronaStructureInput = () => {
                activateComposerForControl();
                setComposerEclipseCoronaGain(
                    "composerEclipseCoronaStructure",
                    panelState.composerEclipseCoronaStructureSlider?.value,
                );
            };
            const onComposerEclipseZodiacalDustInput = () => {
                activateComposerForControl();
                setComposerEclipseCoronaGain(
                    "composerEclipseZodiacalDust",
                    panelState.composerEclipseZodiacalDustSlider?.value,
                );
            };
            const onComposerStarMagnitudeInput = () => {
                activateComposerForControl();
                setComposerStarMagnitudeLimit(panelState.composerStarMagnitudeSlider?.value, { persist: true });
            };
            const onComposerTranscriptWindowInput = () => {
                panelState.composerLunarFeatureMentionWindowSeconds =
                    Number(panelState.composerTranscriptWindowSlider?.value);
                syncComposerTranscriptFeatureUi();
                this.requestRender?.();
            };
            const onComposerTranscriptHoldInput = () => {
                const holdSeconds = Number(panelState.composerTranscriptHoldSlider?.value);
                if (Number.isFinite(holdSeconds)) {
                    panelState.composerLunarFeatureMentionLeadSeconds = Math.round(holdSeconds / 3);
                    panelState.composerLunarFeatureMentionTrailSeconds =
                        holdSeconds - panelState.composerLunarFeatureMentionLeadSeconds;
                }
                syncComposerTranscriptFeatureUi();
                this.requestRender?.();
            };
            const onComposerTranscriptSyncedChange = () => {
                activateComposerForControl();
                panelState.composerLunarFeatureSyncedEnabled =
                    panelState.composerTranscriptSyncedCheckbox?.checked !== false;
                syncComposerTranscriptFeatureUi();
                if (panelState.composerLunarFeatureSyncedEnabled !== true) {
                    panelState.composerLunarFeatureMentionView = null;
                }
                this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);
                this.requestRender?.();
            };
            const onComposerTranscriptPrevClick = () => {
                activateComposerForControl();
                this.jumpComposerTranscriptFeature(panelState, -1);
            };
            const onComposerTranscriptNextClick = () => {
                activateComposerForControl();
                this.jumpComposerTranscriptFeature(panelState, 1);
            };
            const onComposerLunarFeatureStackCloseClick = (event) => {
                activateComposerForControl();
                if (isDomInstance(panelState.composerLunarFeatureStack, "HTMLElement")) {
                    const stackRect = panelState.composerLunarFeatureStack.getBoundingClientRect();
                    const viewportRect = panelState.viewport?.getBoundingClientRect?.();
                    if (viewportRect) {
                        panelState.composerLunarFeatureStackLeftPx = stackRect.left - viewportRect.left;
                        panelState.composerLunarFeatureStackTopPx = stackRect.top - viewportRect.top;
                    }
                }
                panelState.composerLunarFeatureStackDismissed = true;
                this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);
                event?.stopPropagation?.();
            };
            const onComposerLunarFeatureStackRestoreClick = (event) => {
                activateComposerForControl();
                panelState.composerLunarFeatureStackDismissed = false;
                this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);
                event?.stopPropagation?.();
            };
            const onComposerLunarFeatureStackPointerDown = (event) => {
                if (
                    !isDomInstance(panelState.composerLunarFeatureStack, "HTMLElement") ||
                    !isDomInstance(panelState.viewport, "HTMLElement") ||
                    event?.button !== 0 ||
                    event?.target?.closest?.("button")
                ) {
                    return;
                }
                activateComposerForControl();
                const stackRect = panelState.composerLunarFeatureStack.getBoundingClientRect();
                const viewportRect = panelState.viewport.getBoundingClientRect();
                const startLeft = Number.isFinite(panelState.composerLunarFeatureStackLeftPx)
                    ? panelState.composerLunarFeatureStackLeftPx
                    : stackRect.left - viewportRect.left;
                const startTop = Number.isFinite(panelState.composerLunarFeatureStackTopPx)
                    ? panelState.composerLunarFeatureStackTopPx
                    : stackRect.top - viewportRect.top;
                panelState.composerLunarFeatureStackDrag = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startLeft,
                    startTop,
                };
                panelState.composerLunarFeatureStack.classList.add("is-dragging");
                panelState.composerLunarFeatureStackHeader?.setPointerCapture?.(event.pointerId);
                this.setComposerLunarFeatureStackPosition(panelState, startLeft, startTop);
                event.preventDefault?.();
                event.stopPropagation?.();
            };
            const onComposerLunarFeatureStackPointerMove = (event) => {
                const drag = panelState.composerLunarFeatureStackDrag;
                if (!drag || drag.pointerId !== event.pointerId) {
                    return;
                }
                this.setComposerLunarFeatureStackPosition(
                    panelState,
                    drag.startLeft + (event.clientX - drag.startX),
                    drag.startTop + (event.clientY - drag.startY),
                );
                event.preventDefault?.();
                event.stopPropagation?.();
            };
            const releaseComposerLunarFeatureStack = (event) => {
                const drag = panelState.composerLunarFeatureStackDrag;
                if (!drag || drag.pointerId !== event.pointerId) {
                    return;
                }
                panelState.composerLunarFeatureStackDrag = null;
                panelState.composerLunarFeatureStack?.classList.remove("is-dragging");
                panelState.composerLunarFeatureStackHeader?.releasePointerCapture?.(event.pointerId);
                event.stopPropagation?.();
            };
            const onComposerInfoOverlayToggle = () => {
                activateComposerForControl();
                panelState.composerInfoOverlayEnabled = !!panelState.composerInfoOverlayCheckbox?.checked;
                panelState.overlayDirty = true;
                this.requestRender?.();
            };
            const onComposerTimelineInput = () => {
                activateComposerForControl();
                if (!panelState.composerTimelineSlider) {
                    return;
                }
                const localMin = panelState.composerTimelineStartMs;
                const localMax = panelState.composerTimelineEndMs;
                if (!Number.isFinite(localMin) || !Number.isFinite(localMax) || localMax <= localMin) {
                    return;
                }
                const sliderValue = Number(panelState.composerTimelineSlider.value);
                const ratio = this.THREE.MathUtils.clamp(
                    sliderValue / COMPOSER_TIMELINE_RESOLUTION,
                    0,
                    1,
                );
                const targetMs = localMin + ((localMax - localMin) * ratio);
                this.seekMainTimelineTime(targetMs, false);
            };
            const onComposerTimelinePointerDown = () => {
                activateComposerForControl();
                panelState.composerTimelineDragging = true;
            };
            const onComposerTimelinePointerUp = () => {
                activateComposerForControl();
                panelState.composerTimelineDragging = false;
                if (!panelState.composerTimelineSlider) {
                    return;
                }
                const localMin = panelState.composerTimelineStartMs;
                const localMax = panelState.composerTimelineEndMs;
                if (!Number.isFinite(localMin) || !Number.isFinite(localMax) || localMax <= localMin) {
                    return;
                }
                const sliderValue = Number(panelState.composerTimelineSlider.value);
                const ratio = this.THREE.MathUtils.clamp(
                    sliderValue / COMPOSER_TIMELINE_RESOLUTION,
                    0,
                    1,
                );
                const targetMs = localMin + ((localMax - localMin) * ratio);
                this.seekMainTimelineTime(targetMs, true);
            };
            const onComposerPhasePrevClick = () => {
                this.selectComposerTimelinePhase(panelState, this.composerActivePhaseIndex - 1);
            };
            const onComposerPhaseNextClick = () => {
                this.selectComposerTimelinePhase(panelState, this.composerActivePhaseIndex + 1);
            };
            const onComposerTimelinePopupDocumentPointerDown = (event) => {
                if (!isDomElement(event.target)) {
                    return;
                }
                const phaseDetails = panelState.composerPhaseDetails;
                if (phaseDetails?.open && !phaseDetails.contains(event.target)) {
                    phaseDetails.open = false;
                }
                const eventDetails = panelState.composerFlybyEventsDetails;
                if (eventDetails?.open && !eventDetails.contains(event.target)) {
                    eventDetails.open = false;
                }
            };
            const REPEAT_PRESS_BUTTON_IDS = new Set(["slower", "faster", "realtime"]);
            const dispatchSyntheticPress = (target) => {
                if (!isDomInstance(target, "HTMLButtonElement") || target.disabled) {
                    return false;
                }
                if (typeof window !== "undefined" && typeof window.PointerEvent === "function") {
                    target.dispatchEvent(new PointerEvent("pointerdown", {
                        bubbles: true,
                        cancelable: true,
                        pointerId: 1,
                        pointerType: "mouse",
                        isPrimary: true,
                        button: 0,
                    }));
                    target.dispatchEvent(new PointerEvent("pointerup", {
                        bubbles: true,
                        cancelable: true,
                        pointerId: 1,
                        pointerType: "mouse",
                        isPrimary: true,
                        button: 0,
                    }));
                    return true;
                }
                target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
                target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
                return true;
            };
            const clickMainControlButton = (id) => {
                const button = document.getElementById(id);
                if (!isDomInstance(button, "HTMLButtonElement")) {
                    return false;
                }
                if (button.disabled || button.getAttribute("aria-disabled") === "true") {
                    return false;
                }
                if (REPEAT_PRESS_BUTTON_IDS.has(id)) {
                    return dispatchSyntheticPress(button);
                }
                button.click();
                return true;
            };
            const onComposerTransportPlayClick = () => {
                clickMainControlButton("animate");
            };
            const seekComposerTimelineBy = (deltaMs) => {
                const timelineState = this.readMainTimelineState();
                if (!timelineState) {
                    return;
                }
                const bounded = this.resolveComposerTransportStepTimeMs(timelineState, deltaMs);
                this.seekMainTimelineTime(bounded, true);
            };
            const onComposerTransportMinusSecondClick = () => {
                seekComposerTimelineBy(-1000);
            };
            const onComposerTransportMinusMinuteClick = () => {
                seekComposerTimelineBy(-60000);
            };
            const onComposerTransportPlusMinuteClick = () => {
                seekComposerTimelineBy(60000);
            };
            const onComposerTransportPlusSecondClick = () => {
                seekComposerTimelineBy(1000);
            };
            const onComposerTransportSlowerClick = () => {
                clickMainControlButton("slower");
            };
            const onComposerTransportSpeedClick = () => {
                clickMainControlButton("realtime");
            };
            const onComposerTransportFasterClick = () => {
                clickMainControlButton("faster");
            };
            const onComposerViewportWheel = (event) => {
                if (!isDomEventInstance(event, "WheelEvent")) {
                    return;
                }
                event.preventDefault();
                activateComposerForControl();
                if (panelState.autoFovEnabled) {
                    panelState.autoFovEnabled = false;
                    syncAutoToggleUi();
                }
                // Optical zoom only: Frame and Shoot is always anchored at the craft.
                const zoomScale = Math.exp(event.deltaY * COMPOSER_WHEEL_ZOOM_SENSITIVITY);
                const nextFov = this.THREE.MathUtils.clamp(
                    panelState.camera.fov * zoomScale,
                    AUTO_FOV_MIN_DEGREES,
                    AUTO_FOV_MAX_DEGREES,
                );
                this.setPanelFov(panelState, nextFov);
                this.requestRender?.();
                this.queuePersistPanelState();
            };
            const onComposerViewportPointerDown = (event) => {
                if (event.button !== 0) {
                    return;
                }
                if (isDomElement(event.target) && event.target.closest(".aux-camera-view__composer-roll-dial")) {
                    return;
                }
                if (isDomElement(event.target) && event.target.closest(".aux-camera-view__composer-controls-toggle")) {
                    return;
                }
                if (
                    isDomElement(event.target) &&
                    event.target.closest(".aux-camera-view__composer-feature-stack, .aux-camera-view__composer-feature-stack-restore")
                ) {
                    return;
                }
                if (isDomElement(event.target) && event.target.closest(
                    ".aux-camera-view__composer-sky-controls, .aux-camera-view__composer-sky-timeline",
                )) {
                    return;
                }
                if (!panelState.composerInteractionEnabled) {
                    this.activateComposerWindow(panelState, { finalize: true });
                    event.preventDefault();
                    return;
                }
                if ((panelState.composerLockTarget || "none") !== "none") {
                    panelState.composerLockedViewportPointer = {
                        pointerId: event.pointerId,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        hinted: false,
                    };
                    panelState.viewport.setPointerCapture(event.pointerId);
                    event.preventDefault();
                    return;
                }
                panelState.composerViewportPointer = {
                    pointerId: event.pointerId,
                    clientX: event.clientX,
                    clientY: event.clientY,
                };
                this.setComposerOrientationReference(panelState, "world");
                panelState.viewport.setPointerCapture(event.pointerId);
                event.preventDefault();
            };
            const onComposerViewportPointerMove = (event) => {
                panelState.composerLunarCraterPointer = {
                    clientX: event.clientX,
                    clientY: event.clientY,
                };
                const drag = panelState.composerViewportPointer;
                const lockedPointer = panelState.composerLockedViewportPointer;
                if (lockedPointer?.pointerId === event.pointerId) {
                    const dxLocked = event.clientX - lockedPointer.clientX;
                    const dyLocked = event.clientY - lockedPointer.clientY;
                    if (!lockedPointer.hinted && Math.hypot(dxLocked, dyLocked) >= 6) {
                        lockedPointer.hinted = true;
                        this.showComposerHint(panelState, "Switch to Free to change perspective.");
                    }
                    event.preventDefault();
                    return;
                }
                if (!drag || drag.pointerId !== event.pointerId) {
                    if (shouldRenderComposerLunarCraterHover(panelState.composerLunarCraterState)) {
                        this.requestRender?.();
                    }
                    return;
                }
                const dx = event.clientX - drag.clientX;
                const dy = event.clientY - drag.clientY;
                drag.clientX = event.clientX;
                drag.clientY = event.clientY;
                const look = this.tmpVectorE.copy(this.getComposerLookDirection(panelState));
                const up = this.tmpVectorF.copy(this.getComposerCameraUp(panelState, look));
                const dragSensitivity = COMPOSER_DRAG_SENSITIVITY *
                    computeComposerDragSensitivityScale(panelState.camera?.fov);
                const yawAngle = dx * dragSensitivity;
                this.tmpQuatA.setFromAxisAngle(up, yawAngle);
                look.applyQuaternion(this.tmpQuatA);
                up.applyQuaternion(this.tmpQuatA);

                const right = this.tmpVectorD.copy(look).cross(up);
                if (right.lengthSq() > 1e-12) {
                    right.normalize();
                    const pitchAngle = dy * dragSensitivity;
                    this.tmpQuatB.setFromAxisAngle(right, pitchAngle);
                    look.applyQuaternion(this.tmpQuatB);
                    up.applyQuaternion(this.tmpQuatB);
                }
                this.setComposerOrientationFromLookUp(panelState, look, up);
                syncComposerRollUi();
                this.requestRender?.();
                event.preventDefault();
            };
            const onComposerViewportPointerLeave = () => {
                panelState.composerLunarCraterPointer = null;
                if (shouldRenderComposerLunarCraterHover(panelState.composerLunarCraterState)) {
                    this.requestRender?.();
                }
            };
            const releaseComposerViewport = (event) => {
                const lockedPointer = panelState.composerLockedViewportPointer;
                if (lockedPointer?.pointerId === event.pointerId) {
                    if (panelState.viewport.hasPointerCapture(event.pointerId)) {
                        panelState.viewport.releasePointerCapture(event.pointerId);
                    }
                    panelState.composerLockedViewportPointer = null;
                    event.preventDefault();
                    return;
                }
                const drag = panelState.composerViewportPointer;
                if (!drag || drag.pointerId !== event.pointerId) {
                    return;
                }
                if (panelState.viewport.hasPointerCapture(event.pointerId)) {
                    panelState.viewport.releasePointerCapture(event.pointerId);
                }
                panelState.composerViewportPointer = null;
                this.requestRender?.();
            };
            const onComposerPanelGatePointerDown = (event) => {
                if (panelState.composerInteractionEnabled) {
                    return;
                }
                if (!isDomElement(event.target)) {
                    return;
                }
                if (event.target.closest(".lunar-crater-controls-panel, .surface-points-controls-panel")) {
                    return;
                }
                if (event.target.closest(".aux-camera-view__composer-button")) {
                    return;
                }
                if (event.target.closest(".aux-camera-view__header")) {
                    return;
                }
                if (event.target.closest(".aux-camera-view__resize-grip")) {
                    return;
                }
                const jumped = this.activateComposerWindow(panelState, { finalize: true });
                if (jumped) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            };
            const stopComposerOverlayPanelEvent = (event) => {
                event.stopPropagation?.();
            };

            panelState.composerLookFreeButton?.addEventListener("click", onComposerLookFreeClick);
            panelState.composerLookEarthButton?.addEventListener("click", onComposerLookEarthClick);
            panelState.composerLookMoonButton?.addEventListener("click", onComposerLookMoonClick);
            panelState.composerResetButton?.addEventListener("click", onComposerResetClick);
            panelState.composerEarthAmbientSlider?.addEventListener("input", onComposerEarthAmbientInput, { passive: true });
            panelState.composerMoonAmbientSlider?.addEventListener("input", onComposerMoonAmbientInput, { passive: true });
            panelState.composerEarthshineSlider?.addEventListener("input", onComposerEarthshineInput, { passive: true });
            panelState.composerMoonshineSlider?.addEventListener("input", onComposerMoonshineInput, { passive: true });
            panelState.composerMoonOutlineCheckbox?.addEventListener("change", onComposerMoonOutlineToggle);
            panelState.composerSeeThroughCheckbox?.addEventListener("change", onComposerSeeThroughToggle);
            panelState.composerOpticsToggleButton?.addEventListener("click", onComposerOpticsToggleClick);
            panelState.composerOpticsPhysicalButton?.addEventListener("click", onComposerOpticsPhysicalClick);
            panelState.composerOpticsCameraButton?.addEventListener("click", onComposerOpticsCameraClick);
            panelState.composerExposureSlider?.addEventListener("input", onComposerExposureInput, { passive: true });
            panelState.composerAutoExposureCheckbox?.addEventListener("change", onComposerAutoExposureChange);
            panelState.composerOpticsStrengthSlider?.addEventListener("input", onComposerOpticsStrengthInput, { passive: true });
            panelState.composerOpticsHaloSlider?.addEventListener("input", onComposerOpticsHaloInput, { passive: true });
            panelState.composerOpticsStarburstSlider?.addEventListener("input", onComposerOpticsStarburstInput, { passive: true });
            panelState.composerOpticsFlareSlider?.addEventListener("input", onComposerOpticsFlareInput, { passive: true });
            panelState.composerEclipseCoronaIntensitySlider?.addEventListener("input", onComposerEclipseCoronaIntensityInput, { passive: true });
            panelState.composerEclipseCoronaMotionSlider?.addEventListener("input", onComposerEclipseCoronaMotionInput, { passive: true });
            panelState.composerEclipseCoronaStructureSlider?.addEventListener("input", onComposerEclipseCoronaStructureInput, { passive: true });
            panelState.composerEclipseZodiacalDustSlider?.addEventListener("input", onComposerEclipseZodiacalDustInput, { passive: true });
            panelState.composerStarMagnitudeSlider?.addEventListener("input", onComposerStarMagnitudeInput, { passive: true });
            panelState.composerTranscriptSyncedCheckbox?.addEventListener("change", onComposerTranscriptSyncedChange);
            panelState.composerTranscriptWindowSlider?.addEventListener("input", onComposerTranscriptWindowInput, { passive: true });
            panelState.composerTranscriptHoldSlider?.addEventListener("input", onComposerTranscriptHoldInput, { passive: true });
            panelState.composerTranscriptPrevButton?.addEventListener("click", onComposerTranscriptPrevClick);
            panelState.composerTranscriptNextButton?.addEventListener("click", onComposerTranscriptNextClick);
            panelState.composerLunarFeatureStackCloseButton?.addEventListener("click", onComposerLunarFeatureStackCloseClick);
            panelState.composerLunarFeatureStackRestoreButton?.addEventListener("click", onComposerLunarFeatureStackRestoreClick);
            panelState.composerLunarFeatureStackHeader?.addEventListener("pointerdown", onComposerLunarFeatureStackPointerDown);
            panelState.composerLunarFeatureStackHeader?.addEventListener("pointermove", onComposerLunarFeatureStackPointerMove);
            panelState.composerLunarFeatureStackHeader?.addEventListener("pointerup", releaseComposerLunarFeatureStack);
            panelState.composerLunarFeatureStackHeader?.addEventListener("pointercancel", releaseComposerLunarFeatureStack);
            panelState.composerCloudsCheckbox?.addEventListener("change", onComposerCloudsChange);
            panelState.composerLunarCratersPill?.addEventListener("click", onComposerLunarCratersPillClick);
            if (panelState.composerLunarCraterControls) {
                panelState.composerLunarCraterControls.panel?.addEventListener?.("pointerdown", stopComposerOverlayPanelEvent);
                panelState.composerLunarCraterControls.panel?.addEventListener?.("click", stopComposerOverlayPanelEvent);
                panelState.composerLunarCraterControls.panel?.addEventListener?.("wheel", stopComposerOverlayPanelEvent);
                panelState.unbindComposerLunarCraterControls =
                    panelState.composerLunarFeatureAttachment?.bind?.() || null;
            }
            panelState.composerSurfacePointsPill?.addEventListener("click", onComposerSurfacePointsPillClick);
            panelState.composerSurfacePointControls?.panel?.addEventListener?.("pointerdown", stopComposerOverlayPanelEvent);
            panelState.composerSurfacePointControls?.panel?.addEventListener?.("click", stopComposerOverlayPanelEvent);
            panelState.composerSurfacePointControls?.panel?.addEventListener?.("wheel", stopComposerOverlayPanelEvent);
            panelState.composerSurfacePointControls?.close?.addEventListener("click", onComposerSurfacePointsCloseClick);
            panelState.composerSurfacePointControls?.entries?.forEach?.(({ input }) => {
                input?.addEventListener?.("change", onComposerSurfacePointToggle);
            });
            panelState.composerTimelineSlider?.addEventListener("input", onComposerTimelineInput, { passive: true });
            panelState.composerTimelineSlider?.addEventListener("pointerdown", onComposerTimelinePointerDown);
            panelState.composerTimelineSlider?.addEventListener("pointerup", onComposerTimelinePointerUp);
            panelState.composerTimelineSlider?.addEventListener("change", onComposerTimelinePointerUp);
            panelState.composerPhasePrevButton?.addEventListener("click", onComposerPhasePrevClick);
            panelState.composerPhaseNextButton?.addEventListener("click", onComposerPhaseNextClick);
            document.addEventListener("pointerdown", onComposerTimelinePopupDocumentPointerDown, true);
            panelState.composerTransportPlayButton?.addEventListener("click", onComposerTransportPlayClick);
            panelState.composerTransportMinusSecondButton?.addEventListener("click", onComposerTransportMinusSecondClick);
            panelState.composerTransportMinusMinuteButton?.addEventListener("click", onComposerTransportMinusMinuteClick);
            panelState.composerTransportPlusMinuteButton?.addEventListener("click", onComposerTransportPlusMinuteClick);
            panelState.composerTransportPlusSecondButton?.addEventListener("click", onComposerTransportPlusSecondClick);
            panelState.composerTransportSlowerButton?.addEventListener("click", onComposerTransportSlowerClick);
            panelState.composerTransportSpeedButton?.addEventListener("click", onComposerTransportSpeedClick);
            panelState.composerTransportFasterButton?.addEventListener("click", onComposerTransportFasterClick);
            panelState.composerInfoOverlayCheckbox?.addEventListener("change", onComposerInfoOverlayToggle);
            panelState.composerRollSlider?.addEventListener("input", onComposerRollInput, { passive: true });
            panelState.composerRollDial?.addEventListener("pointerdown", onComposerRollDialPointerDown);
            panelState.composerRollDial?.addEventListener("pointermove", onComposerRollDialPointerMove);
            panelState.composerRollDial?.addEventListener("pointerup", releaseComposerRollDial);
            panelState.composerRollDial?.addEventListener("pointercancel", releaseComposerRollDial);
            panelState.composerRaDecGridCheckbox?.addEventListener("change", onComposerRaDecGridToggle);
            panelState.composerSkyLabelsCheckbox?.addEventListener("change", onComposerSkyLabelsToggle);
            panelState.composerConstellationLinesCheckbox?.addEventListener("change", onComposerConstellationLinesToggle);
            panelState.composerConstellationLabelsCheckbox?.addEventListener("change", onComposerConstellationLabelsToggle);
            panelState.viewport.addEventListener("wheel", onComposerViewportWheel, { passive: false });
            panelState.viewport.addEventListener("pointerdown", onComposerViewportPointerDown);
            panelState.viewport.addEventListener("pointermove", onComposerViewportPointerMove);
            panelState.viewport.addEventListener("pointerleave", onComposerViewportPointerLeave);
            panelState.viewport.addEventListener("pointerup", releaseComposerViewport);
            panelState.viewport.addEventListener("pointercancel", releaseComposerViewport);
            panelState.panel.addEventListener("pointerdown", onComposerPanelGatePointerDown, true);

            panelState.onComposerLookFreeClick = onComposerLookFreeClick;
            panelState.onComposerLookEarthClick = onComposerLookEarthClick;
            panelState.onComposerLookMoonClick = onComposerLookMoonClick;
            panelState.onComposerResetClick = onComposerResetClick;
            panelState.onComposerEarthAmbientInput = onComposerEarthAmbientInput;
            panelState.onComposerMoonAmbientInput = onComposerMoonAmbientInput;
            panelState.onComposerEarthshineInput = onComposerEarthshineInput;
            panelState.onComposerMoonshineInput = onComposerMoonshineInput;
            panelState.onComposerMoonOutlineToggle = onComposerMoonOutlineToggle;
            panelState.onComposerSeeThroughToggle = onComposerSeeThroughToggle;
            panelState.onComposerOpticsToggleClick = onComposerOpticsToggleClick;
            panelState.onComposerOpticsPhysicalClick = onComposerOpticsPhysicalClick;
            panelState.onComposerOpticsCameraClick = onComposerOpticsCameraClick;
            panelState.onComposerExposureInput = onComposerExposureInput;
            panelState.onComposerAutoExposureChange = onComposerAutoExposureChange;
            panelState.onComposerOpticsStrengthInput = onComposerOpticsStrengthInput;
            panelState.onComposerOpticsHaloInput = onComposerOpticsHaloInput;
            panelState.onComposerOpticsStarburstInput = onComposerOpticsStarburstInput;
            panelState.onComposerOpticsFlareInput = onComposerOpticsFlareInput;
            panelState.onComposerEclipseCoronaIntensityInput = onComposerEclipseCoronaIntensityInput;
            panelState.onComposerEclipseCoronaMotionInput = onComposerEclipseCoronaMotionInput;
            panelState.onComposerEclipseCoronaStructureInput = onComposerEclipseCoronaStructureInput;
            panelState.onComposerEclipseZodiacalDustInput = onComposerEclipseZodiacalDustInput;
            panelState.onComposerStarMagnitudeInput = onComposerStarMagnitudeInput;
            panelState.onComposerTranscriptSyncedChange = onComposerTranscriptSyncedChange;
            panelState.onComposerTranscriptWindowInput = onComposerTranscriptWindowInput;
            panelState.onComposerTranscriptHoldInput = onComposerTranscriptHoldInput;
            panelState.onComposerTranscriptPrevClick = onComposerTranscriptPrevClick;
            panelState.onComposerTranscriptNextClick = onComposerTranscriptNextClick;
            panelState.onComposerLunarFeatureStackCloseClick = onComposerLunarFeatureStackCloseClick;
            panelState.onComposerLunarFeatureStackRestoreClick = onComposerLunarFeatureStackRestoreClick;
            panelState.onComposerLunarFeatureStackPointerDown = onComposerLunarFeatureStackPointerDown;
            panelState.onComposerLunarFeatureStackPointerMove = onComposerLunarFeatureStackPointerMove;
            panelState.onComposerLunarFeatureStackPointerUp = releaseComposerLunarFeatureStack;
            panelState.onComposerCloudsChange = onComposerCloudsChange;
            panelState.onComposerLunarCratersPillClick = onComposerLunarCratersPillClick;
            panelState.onComposerSurfacePointsPillClick = onComposerSurfacePointsPillClick;
            panelState.onComposerSurfacePointsCloseClick = onComposerSurfacePointsCloseClick;
            panelState.onComposerSurfacePointToggle = onComposerSurfacePointToggle;
            panelState.onComposerTimelineInput = onComposerTimelineInput;
            panelState.onComposerTimelinePointerDown = onComposerTimelinePointerDown;
            panelState.onComposerTimelinePointerUp = onComposerTimelinePointerUp;
            panelState.onComposerPhasePrevClick = onComposerPhasePrevClick;
            panelState.onComposerPhaseNextClick = onComposerPhaseNextClick;
            panelState.onComposerTimelinePopupDocumentPointerDown = onComposerTimelinePopupDocumentPointerDown;
            panelState.onComposerTransportPlayClick = onComposerTransportPlayClick;
            panelState.onComposerTransportMinusSecondClick = onComposerTransportMinusSecondClick;
            panelState.onComposerTransportMinusMinuteClick = onComposerTransportMinusMinuteClick;
            panelState.onComposerTransportPlusMinuteClick = onComposerTransportPlusMinuteClick;
            panelState.onComposerTransportPlusSecondClick = onComposerTransportPlusSecondClick;
            panelState.onComposerTransportSlowerClick = onComposerTransportSlowerClick;
            panelState.onComposerTransportSpeedClick = onComposerTransportSpeedClick;
            panelState.onComposerTransportFasterClick = onComposerTransportFasterClick;
            panelState.onComposerInfoOverlayToggle = onComposerInfoOverlayToggle;
            panelState.onComposerRollInput = onComposerRollInput;
            panelState.onComposerRollDialPointerDown = onComposerRollDialPointerDown;
            panelState.onComposerRollDialPointerMove = onComposerRollDialPointerMove;
            panelState.onComposerRollDialPointerUp = releaseComposerRollDial;
            panelState.onComposerRaDecGridToggle = onComposerRaDecGridToggle;
            panelState.onComposerSkyLabelsToggle = onComposerSkyLabelsToggle;
            panelState.onComposerConstellationLinesToggle = onComposerConstellationLinesToggle;
            panelState.onComposerConstellationLabelsToggle = onComposerConstellationLabelsToggle;
            panelState.onComposerViewportWheel = onComposerViewportWheel;
            panelState.onComposerViewportPointerDown = onComposerViewportPointerDown;
            panelState.onComposerViewportPointerMove = onComposerViewportPointerMove;
            panelState.onComposerViewportPointerLeave = onComposerViewportPointerLeave;
            panelState.onComposerViewportPointerUp = releaseComposerViewport;
            panelState.onComposerPanelGatePointerDown = onComposerPanelGatePointerDown;
            panelState.onComposerOverlayPanelEvent = stopComposerOverlayPanelEvent;
            panelState.syncComposerLockUi = syncComposerLockUi;
            panelState.syncComposerRollUi = syncComposerRollUi;
            panelState.syncComposerAutoToggleUi = syncAutoToggleUi;
            panelState.syncComposerExposureUi = syncComposerExposureUi;
            panelState.syncComposerCloudsUi = syncComposerCloudsUi;
            panelState.syncComposerLunarCratersUi = syncComposerLunarCratersUi;
            panelState.syncComposerSurfacePointsUi = syncComposerSurfacePointsUi;
            setComposerAmbient("composerEarthAmbient", panelState.composerEarthAmbient, { persist: false });
            setComposerAmbient("composerMoonAmbient", panelState.composerMoonAmbient, { persist: false });
            setComposerEarthshineGain(panelState.composerEarthshineGain, { persist: false });
            setComposerMoonshineGain(panelState.composerMoonshineGain, { persist: false });
            syncComposerLockUi();
            syncComposerOpticsUi();
            syncComposerStarMagnitudeUi();
            syncComposerTranscriptFeatureUi();
            syncComposerCloudsUi?.();
            syncComposerLunarCratersUi?.();
            syncComposerSurfacePointsUi?.();
            syncComposerRollUi();
        }
        if (panelState.mode === "orbit-xy") {
            const zoomOrbitPanelBy = (deltaY) => {
                if (panelState.autoFovEnabled) {
                    panelState.autoFovEnabled = false;
                    syncAutoToggleUi();
                }
                const currentFov = Number.isFinite(panelState.orbitZoomFovDegrees)
                    ? panelState.orbitZoomFovDegrees
                    : spec.defaultFov;
                const nextFov = this.THREE.MathUtils.clamp(
                    currentFov * Math.exp(deltaY * ORBIT_XY_WHEEL_ZOOM_SENSITIVITY),
                    AUTO_FOV_MIN_DEGREES,
                    AUTO_FOV_MAX_DEGREES,
                );
                this.setPanelFov(panelState, nextFov);
                this.requestRender?.();
                this.queuePersistPanelState();
            };
            const onOrbitViewportWheel = (event) => {
                if (!isDomEventInstance(event, "WheelEvent")) {
                    return;
                }
                event.preventDefault();
                zoomOrbitPanelBy(event.deltaY);
            };
            const onOrbitViewportPointerDown = (event) => {
                if (event.button !== 0) {
                    return;
                }
                panelState.orbitViewportPointer = {
                    pointerId: event.pointerId,
                    clientX: event.clientX,
                    clientY: event.clientY,
                };
                panelState.viewport.setPointerCapture(event.pointerId);
                event.preventDefault();
            };
            const onOrbitViewportPointerMove = (event) => {
                const drag = panelState.orbitViewportPointer;
                if (!drag || drag.pointerId !== event.pointerId) {
                    return;
                }
                const dx = event.clientX - drag.clientX;
                const dy = event.clientY - drag.clientY;
                drag.clientX = event.clientX;
                drag.clientY = event.clientY;
                if (panelState.autoFovEnabled) {
                    panelState.autoFovEnabled = false;
                    syncAutoToggleUi();
                }
                const width = Math.max(1, panelState.overlayCanvas?.width || panelState.width || 1);
                const height = Math.max(1, panelState.overlayCanvas?.height || panelState.height || 1);
                const project = this.createOrbitPlaneProjector({
                    width,
                    height,
                    earthWorld: this.earthWorld,
                    halfHeight: panelState.orthographicHalfHeight,
                    panOffsetX: panelState.orbitPanOffsetX,
                    panOffsetY: panelState.orbitPanOffsetY,
                });
                panelState.orbitPanOffsetX -= dx / Math.max(project.scaleX || 1, 1e-9);
                panelState.orbitPanOffsetY += dy / Math.max(project.scaleY || 1, 1e-9);
                this.requestRender?.();
                event.preventDefault();
            };
            const releaseOrbitViewport = (event) => {
                const drag = panelState.orbitViewportPointer;
                if (!drag || drag.pointerId !== event.pointerId) {
                    return;
                }
                if (panelState.viewport.hasPointerCapture(event.pointerId)) {
                    panelState.viewport.releasePointerCapture(event.pointerId);
                }
                panelState.orbitViewportPointer = null;
                this.queuePersistPanelState();
            };
            panelState.viewport.addEventListener("wheel", onOrbitViewportWheel, { passive: false });
            panelState.viewport.addEventListener("pointerdown", onOrbitViewportPointerDown);
            panelState.viewport.addEventListener("pointermove", onOrbitViewportPointerMove);
            panelState.viewport.addEventListener("pointerup", releaseOrbitViewport);
            panelState.viewport.addEventListener("pointercancel", releaseOrbitViewport);
            panelState.onOrbitViewportWheel = onOrbitViewportWheel;
            panelState.onOrbitViewportPointerDown = onOrbitViewportPointerDown;
            panelState.onOrbitViewportPointerMove = onOrbitViewportPointerMove;
            panelState.onOrbitViewportPointerUp = releaseOrbitViewport;
        }
        if (panelState.mode !== "composer" && panelState.mode !== "orbit-xy") {
            const onAuxiliaryViewportWheel = (event) => {
                if (!isDomEventInstance(event, "WheelEvent")) {
                    return;
                }
                event.preventDefault();
                if (panelState.autoFovEnabled) {
                    panelState.autoFovEnabled = false;
                    syncAutoToggleUi();
                }
                const currentFov = Number.isFinite(panelState.camera?.fov)
                    ? panelState.camera.fov
                    : spec.defaultFov;
                const nextFov = this.THREE.MathUtils.clamp(
                    currentFov * Math.exp(event.deltaY * AUXILIARY_WHEEL_ZOOM_SENSITIVITY),
                    panelState.fovMinDegrees ?? AUTO_FOV_MIN_DEGREES,
                    panelState.fovMaxDegrees ?? AUTO_FOV_MAX_DEGREES,
                );
                this.setPanelFov(panelState, nextFov);
                this.requestRender?.();
                this.queuePersistPanelState();
            };
            panelState.viewport.addEventListener("wheel", onAuxiliaryViewportWheel, { passive: false });
            panelState.onAuxiliaryViewportWheel = onAuxiliaryViewportWheel;
        }

        const persisted = this.persistedPanelState?.[spec.id];
        if (persisted && typeof persisted === "object") {
            if (panelState.mode !== "composer") {
                if (hasCurrentAuxFovPreferenceVersion(persisted)) {
                    const persistedFov = Number(persisted.fov);
                    if (Number.isFinite(persistedFov)) {
                        const boundedFov = this.THREE.MathUtils.clamp(
                            persistedFov,
                            AUTO_FOV_MIN_DEGREES,
                            AUTO_FOV_MAX_DEGREES,
                        );
                        this.setPanelFov(panelState, boundedFov);
                    }
                }
            } else if (
                typeof persisted.composerControlsCollapsed === "boolean" &&
                Number(persisted.composerControlsCollapseVersion) >=
                    COMPOSER_CONTROLS_COLLAPSE_STATE_VERSION
            ) {
                panelState.composerControlsCollapsed = persisted.composerControlsCollapsed;
            }
        }
        if (panelState.mode === "composer") {
            panelState.autoFovEnabled = true;
            this.setPanelFov(panelState, spec.defaultFov);
            const hasCurrentComposerAutoFovPreference =
                Number(persisted?.composerAutoFovPreferenceVersion) >= COMPOSER_AUTO_FOV_PREFERENCE_VERSION;
            if (
                hasCurrentComposerAutoFovPreference &&
                persisted &&
                typeof persisted === "object" &&
                hasCurrentAuxFovPreferenceVersion(persisted)
            ) {
                const result = resolveComposerViewIntent(this.readComposerViewState(panelState), {
                    type: "persisted",
                    persisted,
                });
                if (Number.isFinite(result.state.manualFovDegrees)) {
                    const boundedFov = this.THREE.MathUtils.clamp(
                        result.state.manualFovDegrees,
                        AUTO_FOV_MIN_DEGREES,
                        AUTO_FOV_MAX_DEGREES,
                    );
                    this.setPanelFov(panelState, boundedFov);
                }
            }
            panelState.composerEarthAmbient = COMPOSER_DEFAULT_EARTH_AMBIENT;
            panelState.composerMoonAmbient = COMPOSER_DEFAULT_MOON_AMBIENT;
            panelState.composerEarthshineGain = COMPOSER_DEFAULT_EARTHSHINE_GAIN;
            panelState.composerMoonshineGain = COMPOSER_DEFAULT_MOONSHINE_GAIN;
            panelState.composerMoonOutlineEnabled = false;
            panelState.composerSeeThroughEnabled = false;
            panelState.composerSunProfile = "camera";
            panelState.composerExposureEv = COMPOSER_EXPOSURE_EV_DEFAULT;
            panelState.composerAutoExposureEnabled = true;
            if (persisted && typeof persisted === "object") {
                const persistedExposureEv = Number(persisted.composerExposureEv);
                if (Number.isFinite(persistedExposureEv)) {
                    panelState.composerExposureEv = this.THREE.MathUtils.clamp(
                        persistedExposureEv,
                        COMPOSER_EXPOSURE_EV_MIN,
                        COMPOSER_EXPOSURE_EV_MAX,
                    );
                }
                if (typeof persisted.composerAutoExposureEnabled === "boolean") {
                    panelState.composerAutoExposureEnabled = persisted.composerAutoExposureEnabled;
                }
            }
            panelState.composerSunStrength = COMPOSER_OPTICS_STRENGTH_DEFAULT;
            panelState.composerSunHaloGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
            panelState.composerSunStarburstGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
            panelState.composerSunFlareGain = COMPOSER_OPTICS_ADVANCED_DEFAULT;
            panelState.composerEclipseCoronaIntensity = COMPOSER_ECLIPSE_CORONA_DEFAULT;
            panelState.composerEclipseCoronaMotion = COMPOSER_ECLIPSE_CORONA_DEFAULT;
            panelState.composerEclipseCoronaStructure = COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT;
            panelState.composerEclipseZodiacalDust = COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT;
            panelState.composerSolarEclipseActive = false;
            panelState.composerEclipseAutoExposureEligible = true;
            panelState.composerInfoOverlayEnabled = true;
            panelState.composerRaDecGridEnabled = false;
            panelState.composerSkyLabelsEnabled = false;
            panelState.composerConstellationLinesEnabled = false;
            panelState.composerConstellationLabelsEnabled = false;
            panelState.composerStarMagnitudeLimit = COMPOSER_STAR_MAGNITUDE_DEFAULT;
            panelState.composerEarthCloudsEnabled = this.getEarthCloudsEnabled() !== false;
            if (panelState.composerInfoOverlayCheckbox) {
                panelState.composerInfoOverlayCheckbox.checked = true;
            }
            if (panelState.composerEarthAmbientSlider && panelState.composerEarthAmbientValue) {
                panelState.composerEarthAmbientSlider.value = String(panelState.composerEarthAmbient);
                const ambientText = panelState.composerEarthAmbient.toFixed(2);
                panelState.composerEarthAmbientValue.value = ambientText;
                panelState.composerEarthAmbientValue.textContent = ambientText;
            }
            if (panelState.composerMoonAmbientSlider && panelState.composerMoonAmbientValue) {
                panelState.composerMoonAmbientSlider.value = String(panelState.composerMoonAmbient);
                const ambientText = panelState.composerMoonAmbient.toFixed(2);
                panelState.composerMoonAmbientValue.value = ambientText;
                panelState.composerMoonAmbientValue.textContent = ambientText;
            }
            if (panelState.composerEarthshineSlider && panelState.composerEarthshineValue) {
                panelState.composerEarthshineSlider.value = String(panelState.composerEarthshineGain);
                const gainText = panelState.composerEarthshineGain.toFixed(2);
                panelState.composerEarthshineValue.value = gainText;
                panelState.composerEarthshineValue.textContent = gainText;
            }
            if (panelState.composerMoonshineSlider && panelState.composerMoonshineValue) {
                panelState.composerMoonshineSlider.value = String(panelState.composerMoonshineGain);
                const gainText = panelState.composerMoonshineGain.toFixed(2);
                panelState.composerMoonshineValue.value = gainText;
                panelState.composerMoonshineValue.textContent = gainText;
            }
            if (panelState.composerMoonOutlineCheckbox) {
                panelState.composerMoonOutlineCheckbox.checked = panelState.composerMoonOutlineEnabled;
            }
            if (panelState.composerSeeThroughCheckbox) {
                panelState.composerSeeThroughCheckbox.checked = panelState.composerSeeThroughEnabled;
            }
            if (panelState.composerExposureSlider && panelState.composerExposureValue) {
                panelState.composerExposureSlider.value = panelState.composerExposureEv.toFixed(1);
                const exposureText = `${panelState.composerExposureEv >= 0 ? "+" : ""}${panelState.composerExposureEv.toFixed(1)} EV`;
                panelState.composerExposureValue.value = exposureText;
                panelState.composerExposureValue.textContent = panelState.composerExposureValue.value;
            }
            if (panelState.composerExposureTotalValue) {
                const exposureState = this.resolveComposerExposureState(panelState);
                const totalEv = exposureState.manualEv + exposureState.autoEv;
                const totalText = `Total ${totalEv >= 0 ? "+" : ""}${totalEv.toFixed(1)} EV`;
                panelState.composerExposureTotalValue.value = totalText;
                panelState.composerExposureTotalValue.textContent = totalText;
            }
            if (panelState.composerAutoExposureCheckbox) {
                panelState.composerAutoExposureCheckbox.checked = panelState.composerAutoExposureEnabled !== false;
            }
            panelState.composerAutoExposureWrap?.classList.toggle(
                "is-active",
                panelState.composerAutoExposureEnabled !== false,
            );
            if (panelState.composerRaDecGridCheckbox) {
                panelState.composerRaDecGridCheckbox.checked = false;
            }
            if (panelState.composerSkyLabelsCheckbox) {
                panelState.composerSkyLabelsCheckbox.checked = false;
            }
            if (panelState.composerConstellationLinesCheckbox) {
                panelState.composerConstellationLinesCheckbox.checked = false;
            }
            if (panelState.composerConstellationLabelsCheckbox) {
                panelState.composerConstellationLabelsCheckbox.checked = false;
            }
            if (panelState.composerStarMagnitudeSlider && panelState.composerStarMagnitudeValue) {
                const magnitudeText = panelState.composerStarMagnitudeLimit.toFixed(1);
                panelState.composerStarMagnitudeSlider.value = magnitudeText;
                panelState.composerStarMagnitudeValue.value = magnitudeText;
                panelState.composerStarMagnitudeValue.textContent = magnitudeText;
            }
            syncComposerCloudsUi?.();
        }
        syncAutoToggleUi();
        onFovInput();
        if (panelState.mode === "composer") {
            this.updateComposerChipPresentation(panelState);
        }

        if (panelState.infoMode === "moon-visibility" && infoPill) {
            const onInfoPillClick = () => {
                panelState.farSideTintEnabled = !panelState.farSideTintEnabled;
                panelState.overlayDirty = true;
                this.requestRender?.();
            };
            infoPill.addEventListener("click", onInfoPillClick);
            panelState.onInfoPillClick = onInfoPillClick;
        } else if (infoPill) {
            infoPill.disabled = true;
        }

        this.root.appendChild(panel);
        this.panels.push(panelState);
        this.bindPanelDragging(panelState, header);
        this.bindPanelResizing(panelState, resizeGrip);
        panelState.onPanelPointerDown = () => {
            this.bringPanelToFront(panelState);
        };
        panel.addEventListener("pointerdown", panelState.onPanelPointerDown);
        this.setComposerControlsCollapsed(panelState, panelState.composerControlsCollapsed === true, {
            persist: false,
            requestRender: false,
        });
        if (Number.isFinite(persistedWidth)) {
            panel.style.width = `${Math.round(persistedWidth)}px`;
        }
        if (Number.isFinite(persistedHeight)) {
            panel.style.height = `${Math.round(persistedHeight)}px`;
        }
        const defaultPosition = this.getDefaultPanelPosition(panel, index);
        this.applyPanelPosition(
            panelState,
            Number.isFinite(persistedX) ? persistedX : defaultPosition.x,
            Number.isFinite(persistedY) ? persistedY : defaultPosition.y,
        );
        this.bringPanelToFront(panelState);

        this.panelStateByElement.set(panel, panelState);
        const resizeObserver = this.getPanelResizeObserver();
        resizeObserver?.observe(panel);
        this.syncPanelSize(panelState);
        this.applyPanelVisibilityState(
            panelState,
            hasPersistedVisibilityState ? persistedState : panelState.fallbackDefaultState,
            {
                persist: false,
                requestRender: false,
            },
        );
        this.syncPanelExpandButton(panelState);
        if (panelState.maximized === true) {
            panelState.panel.classList.add("is-maximized");
            this.applyMaximizedPanelFrame(panelState);
            this.syncPanelSize(panelState);
        }
        this.setPanelMissionEnabled(panelState, panelState.missionEnabled);
        registerMissionPanel({
            id: panelState.panelRegistryId,
            title: panelState.title,
            kind: panelState.mode === "composer" ? "workflow" : "view",
            panelType: panelState.mode === "composer" ? "flyby-focus" : "aux-camera-view",
            builtIn: true,
            available: panelState.missionEnabled === true,
            state: this.getPanelRegistryState(panelState),
            sortOrder: panelState.sortOrder,
            actions: {},
        });
        if (panelState.mode === "composer") {
            registerMissionPanel({
                id: COMPOSER_CONTROLS_PANEL_ID,
                title: "Frame Controls",
                kind: "workflow",
                panelType: "flyby-controls",
                builtIn: true,
                available: panelState.missionEnabled === true,
                state: "closed",
                sortOrder: Number.isFinite(panelState.sortOrder) ? panelState.sortOrder + 1 : 0,
                actions: {},
            });
            this.syncComposerControlsPanelRegistry(panelState);
        }
        this.syncPanelRegistry(panelState);
    }

    handlePanelResizeEntries(entries) {
        for (const entry of entries || []) {
            const panelState = this.panelStateByElement.get(entry.target);
            if (panelState) {
                this.pendingResizePanelStates.add(panelState);
            }
        }

        if (this.pendingResizeRaf != null) {
            return;
        }
        this.pendingResizeRaf = requestAnimationFrame(() => {
            this.pendingResizeRaf = null;
            for (const panelState of this.pendingResizePanelStates) {
                this.syncPanelSize(panelState);
            }
            this.pendingResizePanelStates.clear();
            this.queuePersistPanelState();
            this.requestRender?.();
        });
    }

    handleResize() {
        if (!this.root) {
            return;
        }
        const visible = this.panelsEnabled && isDesktopViewport();
        this.root.hidden = !visible;
        if (!visible) return;
        this.applyDefaultPanelLayout();
        for (const panelState of this.panels) {
            if (panelState.maximized === true) {
                this.applyMaximizedPanelFrame(panelState);
            }
            this.syncPanelSize(panelState);
        }
        this.queuePersistPanelState();
    }

    setPanelVisible(panelState, visible) {
        if (panelState?.missionEnabled === false) {
            panelState.panel.hidden = true;
            if (panelState.chipButton) {
                panelState.chipButton.hidden = true;
            }
            this.clearPanelOverlay(panelState);
            return;
        }
        const shouldShowPanel = visible &&
            panelState.minimized !== true &&
            panelState.closed !== true &&
            panelState.deleted !== true;
        if (shouldShowPanel && this.isDockviewAuxiliaryPanelEnabled()) {
            this.ensureAuxiliaryPanelDocked(panelState);
        } else if (!shouldShowPanel && panelState.mode === "composer") {
            this.closeComposerControlsPanel(panelState);
        }
        panelState.panel.hidden = !shouldShowPanel;
        if (panelState.chipButton) {
            panelState.chipButton.hidden = panelState.minimized !== true ||
                panelState.closed === true ||
                panelState.deleted === true;
        }
        if (!shouldShowPanel) {
            this.clearPanelOverlay(panelState);
        }
    }

    setPanelInfo(panelState, primary = "", secondary = "", options = {}) {
        if (!panelState?.info || !panelState?.infoPrimaryText || !panelState?.infoSecondary || !panelState?.infoPill) {
            return;
        }
        const hasInfoMode = panelState.infoMode && panelState.infoMode !== "none";
        if (!hasInfoMode) {
            panelState.info.hidden = true;
            return;
        }
        panelState.info.hidden = false;
        panelState.infoPrimaryText.textContent = primary || "";
        panelState.infoSecondary.textContent = secondary || "";
        panelState.infoSecondary.hidden = !secondary;

        const pillText = typeof options.pillText === "string" ? options.pillText.trim() : "";
        const pillVariant = typeof options.pillVariant === "string" ? options.pillVariant.trim() : "";
        panelState.infoPill.hidden = pillText.length === 0;
        panelState.infoPill.textContent = pillText;
        panelState.infoPill.className = "aux-camera-view__pill";
        if (pillText.length > 0 && pillVariant.length > 0) {
            panelState.infoPill.classList.add(`aux-camera-view__pill--${pillVariant}`);
        }

        const pillInteractive = options.pillInteractive === true;
        panelState.infoPill.disabled = !pillInteractive;
        if (pillInteractive) {
            panelState.infoPill.classList.add("aux-camera-view__pill--button");
            const pressed = options.pillOn === true;
            panelState.infoPill.setAttribute("aria-pressed", pressed ? "true" : "false");
            panelState.infoPill.classList.toggle("is-on", pressed);
            panelState.infoPill.classList.toggle("is-off", !pressed);
            panelState.infoPill.title = pressed ? "Disable far-side overlay" : "Enable far-side overlay";
        } else {
            panelState.infoPill.removeAttribute("aria-pressed");
            panelState.infoPill.classList.remove("aux-camera-view__pill--button", "is-on", "is-off");
            panelState.infoPill.title = "";
        }
    }

    setComposerControlsCollapsed(panelState, collapsed, { persist = true, requestRender = true } = {}) {
        if (!panelState || panelState.mode !== "composer" || !panelState.panel) {
            return;
        }
        const isCollapsed = collapsed === true;
        panelState.composerControlsCollapsed = isCollapsed;
        panelState.panel.classList.toggle("aux-camera-view--composer-controls-collapsed", isCollapsed);
        if (panelState.composerControlsToggleButton) {
            const toggleHost = this.isDockviewAuxiliaryPanelEnabled() || isCollapsed
                ? panelState.viewport
                : panelState.composerControlMatrix;
            if (toggleHost && panelState.composerControlsToggleButton.parentElement !== toggleHost) {
                if (isCollapsed) {
                    toggleHost.appendChild(panelState.composerControlsToggleButton);
                } else {
                    toggleHost.prepend(panelState.composerControlsToggleButton);
                }
            }
            panelState.composerControlsToggleButton.textContent = "";
            panelState.composerControlsToggleButton.setAttribute(
                "aria-label",
                isCollapsed ? "Expand Frame and Shoot controls" : "Collapse Frame and Shoot controls",
            );
            panelState.composerControlsToggleButton.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
            panelState.composerControlsToggleButton.title = isCollapsed
                ? "Expand controls"
                : "Collapse controls";
        }
        this.updateComposerControlsPopoverPosition(panelState);
        this.scheduleVisiblePanelRefresh(panelState);
        if (persist) {
            this.queuePersistPanelState();
        }
        if (requestRender) {
            this.requestRender?.();
        }
    }

    setComposerInteractionEnabled(panelState, enabled) {
        if (!panelState || panelState.mode !== "composer") {
            return;
        }
        const isEnabled = enabled === true;
        panelState.composerInteractionEnabled = isEnabled;
        panelState.panel.classList.toggle("aux-camera-view--composer-disabled", !isEnabled);

        const disableControls = !isEnabled;
        const isFreeComposer = (panelState.composerLockTarget || "none") === "none";
        panelState.fovControl?.setDisabledState({
            autoButtonDisabled: disableControls || isFreeComposer,
            sliderDisabled: disableControls || panelState.autoFovEnabled,
            valueDisabled: disableControls,
        });
        panelState.composerLookFreeButton && (panelState.composerLookFreeButton.disabled = false);
        panelState.composerLookEarthButton && (panelState.composerLookEarthButton.disabled = false);
        panelState.composerLookMoonButton && (panelState.composerLookMoonButton.disabled = false);
        panelState.composerResetButton && (panelState.composerResetButton.disabled = disableControls);
        panelState.composerEarthAmbientSlider && (panelState.composerEarthAmbientSlider.disabled = disableControls);
        panelState.composerMoonAmbientSlider && (panelState.composerMoonAmbientSlider.disabled = disableControls);
        panelState.composerEarthshineSlider && (panelState.composerEarthshineSlider.disabled = disableControls);
        panelState.composerMoonshineSlider && (panelState.composerMoonshineSlider.disabled = disableControls);
        panelState.composerMoonOutlineCheckbox && (panelState.composerMoonOutlineCheckbox.disabled = disableControls);
        panelState.composerSeeThroughCheckbox && (panelState.composerSeeThroughCheckbox.disabled = disableControls);
        panelState.composerCloudsCheckbox && (panelState.composerCloudsCheckbox.disabled = disableControls);
        if (panelState.composerLunarCraterControls) {
            panelState.composerLunarCraterControls.disabled = disableControls;
            panelState.syncComposerLunarCratersUi?.();
        }
        panelState.composerSurfacePointsPill && (panelState.composerSurfacePointsPill.disabled = disableControls);
        panelState.composerSurfacePointControls?.entries?.forEach?.(({ input }) => {
            if (input) input.disabled = disableControls;
        });
        panelState.composerOpticsToggleButton && (panelState.composerOpticsToggleButton.disabled = disableControls);
        panelState.composerOpticsPhysicalButton && (panelState.composerOpticsPhysicalButton.disabled = disableControls);
        panelState.composerOpticsCameraButton && (panelState.composerOpticsCameraButton.disabled = disableControls);
        panelState.composerExposureSlider && (panelState.composerExposureSlider.disabled = disableControls);
        panelState.composerAutoExposureCheckbox && (panelState.composerAutoExposureCheckbox.disabled = disableControls);
        panelState.composerOpticsStrengthSlider && (panelState.composerOpticsStrengthSlider.disabled = disableControls);
        panelState.composerOpticsHaloSlider && (panelState.composerOpticsHaloSlider.disabled = disableControls);
        panelState.composerOpticsStarburstSlider && (panelState.composerOpticsStarburstSlider.disabled = disableControls);
        panelState.composerOpticsFlareSlider && (panelState.composerOpticsFlareSlider.disabled = disableControls);
        panelState.composerEclipseCoronaIntensitySlider &&
            (panelState.composerEclipseCoronaIntensitySlider.disabled = disableControls);
        panelState.composerEclipseCoronaMotionSlider &&
            (panelState.composerEclipseCoronaMotionSlider.disabled = disableControls);
        panelState.composerEclipseCoronaStructureSlider &&
            (panelState.composerEclipseCoronaStructureSlider.disabled = disableControls);
        panelState.composerEclipseZodiacalDustSlider &&
            (panelState.composerEclipseZodiacalDustSlider.disabled = disableControls);
        panelState.composerStarMagnitudeSlider && (panelState.composerStarMagnitudeSlider.disabled = disableControls);
        panelState.composerRollSlider && (panelState.composerRollSlider.disabled = disableControls);
        panelState.composerRollDial && (panelState.composerRollDial.disabled = disableControls);
        panelState.composerRaDecGridCheckbox && (panelState.composerRaDecGridCheckbox.disabled = disableControls);
        panelState.composerSkyLabelsCheckbox && (panelState.composerSkyLabelsCheckbox.disabled = disableControls);
        panelState.composerConstellationLinesCheckbox &&
            (panelState.composerConstellationLinesCheckbox.disabled = disableControls);
        panelState.composerConstellationLabelsCheckbox &&
            (panelState.composerConstellationLabelsCheckbox.disabled = disableControls);
        if (panelState.composerTimelineSlider) {
            panelState.composerTimelineSlider.disabled = disableControls;
        }
        panelState.composerPhasePrevButton && (panelState.composerPhasePrevButton.disabled = disableControls);
        panelState.composerPhaseNextButton && (panelState.composerPhaseNextButton.disabled = disableControls);
        panelState.composerTransportMinusSecondButton && (panelState.composerTransportMinusSecondButton.disabled = disableControls);
        panelState.composerTransportMinusMinuteButton && (panelState.composerTransportMinusMinuteButton.disabled = disableControls);
        panelState.composerTransportPlusMinuteButton && (panelState.composerTransportPlusMinuteButton.disabled = disableControls);
        panelState.composerTransportPlusSecondButton && (panelState.composerTransportPlusSecondButton.disabled = disableControls);
        if (panelState.composerDisabledOverlay) {
            panelState.composerDisabledOverlay.hidden = isEnabled;
        }
    }

    setPanelMissionEnabled(panelState, enabled) {
        panelState.missionEnabled = enabled === true;
        if (panelState.missionEnabled) {
            if (panelState.deleted === true) {
                panelState.panel.hidden = true;
                if (panelState.chipButton) panelState.chipButton.hidden = true;
            } else if (panelState.closed === true) {
                panelState.panel.hidden = true;
                if (panelState.chipButton) panelState.chipButton.hidden = true;
            } else if (panelState.minimized === true) {
                panelState.panel.hidden = true;
                if (panelState.chipButton) panelState.chipButton.hidden = false;
            } else {
                panelState.panel.hidden = false;
                if (panelState.chipButton) panelState.chipButton.hidden = true;
            }
            this.syncPanelRegistry(panelState);
            return;
        }
        panelState.panel.hidden = true;
        if (panelState.chipButton) {
            panelState.chipButton.hidden = true;
        }
        this.clearPanelOverlay(panelState);
        this.syncPanelRegistry(panelState);
    }

    updateComposerControlsPopoverPosition(panelState) {
        if (
            !panelState ||
            panelState.mode !== "composer" ||
            panelState.composerControlsCollapsed === true ||
            !panelState.panel ||
            !panelState.composerControlMatrix
        ) {
            return;
        }

        const panelRect = panelState.panel.getBoundingClientRect?.();
        if (!panelRect || !Number.isFinite(panelRect.left) || !Number.isFinite(panelRect.top)) {
            return;
        }

        const windowRef = typeof window !== "undefined" ? window : null;
        const viewportWidth = Math.max(1, Number(windowRef?.innerWidth) || 1);
        const viewportHeight = Math.max(1, Number(windowRef?.innerHeight) || 1);
        const gap = 8;
        const edgePad = 8;
        const preferredWidth = Math.min(340, Math.max(286, Math.round(panelRect.width * 0.38)));
        const headerHeight = Math.max(
            0,
            Number(panelState.panel.querySelector?.(".aux-camera-view__header")?.getBoundingClientRect?.().height) || 0,
        );
        let left = panelRect.left - preferredWidth - gap;
        if (left < edgePad) {
            left = panelRect.right + gap;
        }
        left = Math.min(Math.max(edgePad, left), Math.max(edgePad, viewportWidth - preferredWidth - edgePad));

        const top = Math.min(
            Math.max(edgePad, panelRect.top + headerHeight + 6),
            Math.max(edgePad, viewportHeight - 180),
        );
        const maxHeight = Math.max(180, Math.min(viewportHeight - top - edgePad, 640));

        panelState.composerControlMatrix.style.setProperty("--aux-composer-controls-popout-left", `${Math.round(left)}px`);
        panelState.composerControlMatrix.style.setProperty("--aux-composer-controls-popout-top", `${Math.round(top)}px`);
        panelState.composerControlMatrix.style.setProperty("--aux-composer-controls-popout-width", `${Math.round(preferredWidth)}px`);
        panelState.composerControlMatrix.style.setProperty("--aux-composer-controls-popout-max-height", `${Math.round(maxHeight)}px`);
    }

    syncMissionPanelPolicy(missionConfig) {
        const nextPanelsEnabled = shouldEnableAuxiliaryPanels(missionConfig);
        const nextComposerEnabled = nextPanelsEnabled && shouldEnableEarthriseComposer(missionConfig);
        const policyChanged =
            this.missionPanelsEnabled !== nextPanelsEnabled ||
            this.composerEnabled !== nextComposerEnabled;
        const missionConfigChanged = this.lastMissionConfig !== missionConfig;
        const hasPendingDefaultState = !!(
            missionConfig &&
            typeof missionConfig === "object" &&
            this.panels.some((panelState) =>
                panelState.hasPersistedVisibilityState !== true &&
                panelState.defaultStateApplied !== true)
        );
        if (!policyChanged && !missionConfigChanged && !hasPendingDefaultState) {
            return;
        }
        this.missionPanelsEnabled = nextPanelsEnabled;
        this.composerEnabled = nextComposerEnabled;
        this.lastMissionConfig = missionConfig;
        for (const panelState of this.panels) {
            const configuredLayoutPresetVersion = getMissionPanelLayoutPresetVersion(
                missionConfig,
                panelState.panelRegistryId,
            );
            if (
                configuredLayoutPresetVersion &&
                configuredLayoutPresetVersion !== panelState.layoutPresetVersion
            ) {
                panelState.layoutPresetVersion = configuredLayoutPresetVersion;
                panelState.hasPersistedVisibilityState = false;
                panelState.defaultStateApplied = false;
                panelState.defaultLayoutManaged = true;
                panelState.restoreFrame = null;
                panelState.maximized = false;
                panelState.panel.classList.toggle("is-maximized", panelState.maximized === true);
                this.syncPanelExpandButton(panelState);
            }
            if (
                missionConfig &&
                typeof missionConfig === "object" &&
                panelState.hasPersistedVisibilityState !== true &&
                panelState.defaultStateApplied !== true
            ) {
                const defaultState = getMissionPanelDefaultState(
                    missionConfig,
                    panelState.panelRegistryId,
                    { fallbackState: panelState.fallbackDefaultState || "open" },
                );
                this.applyPanelVisibilityState(panelState, defaultState, {
                    persist: false,
                    requestRender: false,
                });
                panelState.defaultStateApplied = true;
            }
            const globallyEnabled = panelState.mode === "composer"
                ? this.composerEnabled
                : this.missionPanelsEnabled;
            const configuredEnabled = isMissionPanelEnabled(
                missionConfig,
                panelState.panelRegistryId,
                { fallbackEnabled: true },
            );
            this.setPanelMissionEnabled(panelState, globallyEnabled && configuredEnabled);
        }
        if (this.panels.some((panelState) => panelState.defaultLayoutManaged !== false)) {
            this.scheduleDefaultPanelLayout();
        }
    }

    activateComposerWindow(panelState, { finalize = true } = {}) {
        if (!panelState || panelState.mode !== "composer") {
            return false;
        }
        const startMs = panelState.composerTimelineStartMs;
        const endMs = panelState.composerTimelineEndMs;
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
            return false;
        }
        const targetMs = startMs + ((endMs - startMs) * 0.5);
        this.seekMainTimelineTime(targetMs, finalize);
        return true;
    }

    readMainTimelineState() {
        const slider = document.getElementById("timeline-slider");
        if (!isDomInstance(slider, "HTMLInputElement")) {
            return null;
        }
        const sliderMin = Number(slider.min);
        const sliderMax = Number(slider.max);
        const rangeMin = Number(slider.dataset?.rangeMinMs);
        const rangeMax = Number(slider.dataset?.rangeMaxMs);
        const min = Number.isFinite(rangeMin) ? rangeMin : sliderMin;
        const max = Number.isFinite(rangeMax) ? rangeMax : sliderMax;
        const preciseValue = Number(slider.dataset?.currentTimeMs);
        const value = Number.isFinite(preciseValue) ? preciseValue : Number(slider.value);
        const step = Number(slider.step);
        if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value)) {
            return null;
        }
        return {
            slider,
            min: Math.min(min, max),
            max: Math.max(min, max),
            value: this.THREE.MathUtils.clamp(value, Math.min(min, max), Math.max(min, max)),
            stepMs: Number.isFinite(step) && step > 0 ? step : 1,
        };
    }

    resolveComposerTransportStepTimeMs(timelineState, deltaMs) {
        if (!timelineState) {
            return Number.NaN;
        }
        const min = Number(timelineState.min);
        const max = Number(timelineState.max);
        const value = Number(timelineState.value);
        const delta = Number(deltaMs);
        if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || !Number.isFinite(delta)) {
            return Number.NaN;
        }
        return this.THREE.MathUtils.clamp(
            value + delta,
            Math.min(min, max),
            Math.max(min, max),
        );
    }

    seekMainTimelineTime(timeMs, finalize = false) {
        const timelineState = this.readMainTimelineState();
        if (!timelineState) {
            return;
        }
        const clamped = this.THREE.MathUtils.clamp(timeMs, timelineState.min, timelineState.max);
        const visibleMin = Number(timelineState.slider.min);
        const visibleMax = Number(timelineState.slider.max);
        timelineState.slider.value = Number.isFinite(visibleMin) && Number.isFinite(visibleMax)
            ? String(this.THREE.MathUtils.clamp(clamped, Math.min(visibleMin, visibleMax), Math.max(visibleMin, visibleMax)))
            : String(clamped);
        const dataset = timelineState.slider.dataset || (timelineState.slider.dataset = {});
        dataset.currentTimeMs = String(clamped);
        dataset.programmaticSeekSource = "frame-shoot";
        dataset.programmaticSeekTimeMs = String(clamped);
        timelineState.slider.dispatchEvent(new Event("input", { bubbles: true }));
        if (finalize) {
            dataset.programmaticSeekSource = "frame-shoot";
            dataset.programmaticSeekTimeMs = String(clamped);
            timelineState.slider.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    formatComposerWindowLabel(windowMs) {
        const safeMs = Math.max(0, windowMs);
        const totalMinutes = Math.round(safeMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours <= 0) {
            return `+/-${Math.max(1, minutes)}m`;
        }
        if (minutes <= 0) {
            return `+/-${hours}h`;
        }
        return `+/-${hours}h ${minutes}m`;
    }

    formatLocalDateTime(timeMs) {
        if (!Number.isFinite(timeMs)) {
            return "--";
        }
        try {
            const datePart = new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "2-digit",
            }).format(timeMs);
            const timePart = new Intl.DateTimeFormat(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                timeZoneName: "short",
            }).format(timeMs);
            return `${datePart} ${timePart}`;
        } catch {
            return new Date(timeMs).toLocaleString();
        }
    }

    setComposerTimelineLocalText(panelState, timeMs) {
        const localValue = panelState?.composerTimelineLocalValue;
        if (!localValue) {
            return;
        }
        localValue.textContent = `Local: ${this.formatLocalDateTime(timeMs)}`;
    }

    syncComposerTransportUi(panelState, timelineState = null) {
        const playButton = panelState?.composerTransportPlayButton;
        const minusMinuteButton = panelState?.composerTransportMinusMinuteButton;
        const plusMinuteButton = panelState?.composerTransportPlusMinuteButton;
        const slowerButton = panelState?.composerTransportSlowerButton;
        const speedButton = panelState?.composerTransportSpeedButton;
        const fasterButton = panelState?.composerTransportFasterButton;
        if (!playButton || !minusMinuteButton || !plusMinuteButton || !slowerButton || !speedButton || !fasterButton) {
            return;
        }

        const mainPlayButton = document.getElementById("animate");
        if (isDomInstance(mainPlayButton, "HTMLButtonElement")) {
            playButton.textContent = mainPlayButton.textContent || "▶";
            playButton.disabled = mainPlayButton.disabled || mainPlayButton.getAttribute("aria-disabled") === "true";
            const mainPlayTitle = mainPlayButton.getAttribute("title");
            if (mainPlayTitle) {
                playButton.setAttribute("title", mainPlayTitle);
            }
        } else {
            playButton.textContent = "▶";
            playButton.disabled = true;
        }

        const mainSlowerButton = document.getElementById("slower");
        if (isDomInstance(mainSlowerButton, "HTMLButtonElement")) {
            slowerButton.disabled =
                mainSlowerButton.disabled || mainSlowerButton.getAttribute("aria-disabled") === "true";
        } else {
            slowerButton.disabled = true;
        }

        const mainSpeedButton = document.getElementById("realtime");
        if (isDomInstance(mainSpeedButton, "HTMLButtonElement")) {
            speedButton.textContent = (mainSpeedButton.textContent || "1 sec/sec").trim();
            speedButton.disabled =
                mainSpeedButton.disabled || mainSpeedButton.getAttribute("aria-disabled") === "true";
            const mainSpeedTitle = mainSpeedButton.getAttribute("title");
            if (mainSpeedTitle) {
                speedButton.setAttribute("title", mainSpeedTitle);
            }
        } else {
            speedButton.textContent = "1 sec/sec";
            speedButton.disabled = true;
        }

        const mainFasterButton = document.getElementById("faster");
        if (isDomInstance(mainFasterButton, "HTMLButtonElement")) {
            fasterButton.disabled =
                mainFasterButton.disabled || mainFasterButton.getAttribute("aria-disabled") === "true";
        } else {
            fasterButton.disabled = true;
        }

        const activeTimelineState = timelineState || this.readMainTimelineState();
        if (!activeTimelineState) {
            minusMinuteButton.disabled = true;
            plusMinuteButton.disabled = true;
            return;
        }
        minusMinuteButton.disabled = activeTimelineState.value <= activeTimelineState.min;
        plusMinuteButton.disabled = activeTimelineState.value >= activeTimelineState.max;
    }

    selectComposerTimelinePhase(panelState, phaseIndex) {
        const phases = Array.isArray(this.composerTimelinePhases) ? this.composerTimelinePhases : [];
        const boundedPhaseIndex = Math.max(0, Math.min(phases.length - 1, Number(phaseIndex)));
        const phase = phases[boundedPhaseIndex];
        if (!phase || !Number.isFinite(phase.startMs)) {
            return false;
        }
        const timelineState = this.readMainTimelineState();
        const targetMs = this.resolveComposerPhaseSeekTimeMs({
            phase,
            timelineMinMs: timelineState?.min,
            timelineMaxMs: timelineState?.max,
            stepMs: timelineState?.stepMs,
        });
        this.applyComposerGuidedViewState(panelState, {
            syncComposerLockUi: panelState.syncComposerLockUi,
            syncAutoToggleUi: panelState.syncComposerAutoToggleUi,
            persist: false,
            requestRender: false,
        });
        this.composerActivePhaseIndex = boundedPhaseIndex;
        this.composerSelectedPhaseIndex = boundedPhaseIndex;
        this.seekMainTimelineTime(Number.isFinite(targetMs) ? targetMs : phase.startMs, true);
        this.syncComposerTimelineUi(panelState, { preferredPhaseIndex: boundedPhaseIndex });
        if (panelState.composerPhaseDetails) {
            panelState.composerPhaseDetails.open = false;
        }
        this.requestRender?.();
        return true;
    }

    resolveComposerPhaseSeekTimeMs({
        phase,
        timelineMinMs,
        timelineMaxMs,
        stepMs = 1,
    }) {
        const startMs = Number(phase?.startMs);
        const endMs = Number(phase?.endMs);
        const minMs = Number(timelineMinMs);
        const maxMs = Number(timelineMaxMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
            return Number.NaN;
        }
        if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs < minMs) {
            return startMs;
        }

        const clampedStart = Math.min(Math.max(startMs, minMs), maxMs);
        const clampedEnd = Math.min(Math.max(endMs, minMs), maxMs);
        if (clampedEnd <= clampedStart) {
            return clampedStart;
        }

        const safeStepMs = Number.isFinite(Number(stepMs)) && Number(stepMs) > 0
            ? Number(stepMs)
            : 1;
        const inwardMs = Math.max(1, Math.min(1000, safeStepMs * 0.5));
        const lowerBound = Math.min(clampedEnd - 1, clampedStart + inwardMs);
        const upperBound = Math.max(lowerBound, clampedEnd - inwardMs);
        const midpoint = clampedStart + ((clampedEnd - clampedStart) * 0.5);
        return Math.round(Math.min(Math.max(midpoint, lowerBound), upperBound));
    }

    syncComposerPhaseSelect(panelState, activePhaseIndex) {
        const details = panelState?.composerPhaseDetails;
        const summary = panelState?.composerPhaseSummary;
        const optionsWrap = panelState?.composerPhaseOptionsWrap;
        if (!details || !summary || !optionsWrap) {
            return;
        }
        const phases = Array.isArray(this.composerTimelinePhases) ? this.composerTimelinePhases : [];
        const signature = phases
            .map((phase) => `${phase.id}:${phase.startMs}:${phase.endMs}:${phase.events?.length || 0}`)
            .join("|");
        if (panelState.composerPhaseSelectSignature !== signature) {
            optionsWrap.replaceChildren();
            for (let i = 0; i < phases.length; i += 1) {
                const phase = phases[i];
                const option = document.createElement("button");
                option.type = "button";
                option.className = "aux-camera-view__composer-phase-option";
                option.textContent = phase.label || phase.id || `Phase ${i + 1}`;
                option.setAttribute("aria-label", `Jump timeline to ${option.textContent}`);
                option.addEventListener("click", () => {
                    this.selectComposerTimelinePhase(panelState, i);
                });
                optionsWrap.appendChild(option);
            }
            panelState.composerPhaseSelectSignature = signature;
        }
        const phaseOptions = Array.from(optionsWrap.children || []);
        for (let i = 0; i < phaseOptions.length; i += 1) {
            const isActive = i === activePhaseIndex;
            phaseOptions[i].classList?.toggle("is-active", isActive);
            if (isActive) {
                phaseOptions[i].setAttribute?.("aria-current", "true");
            } else {
                phaseOptions[i].removeAttribute?.("aria-current");
            }
        }
        summary.classList?.toggle("is-disabled", phases.length <= 1);
        summary.setAttribute?.("aria-disabled", phases.length <= 1 ? "true" : "false");
        if (phases.length <= 1) {
            details.open = false;
        }
        if (panelState.composerPhasePrevButton) {
            panelState.composerPhasePrevButton.disabled = phases.length <= 1 || activePhaseIndex <= 0;
        }
        if (panelState.composerPhaseNextButton) {
            panelState.composerPhaseNextButton.disabled = phases.length <= 1 || activePhaseIndex >= phases.length - 1;
        }
        if (activePhaseIndex >= 0 && activePhaseIndex < phases.length) {
            const label = phases[activePhaseIndex].label || phases[activePhaseIndex].id || `Phase ${activePhaseIndex + 1}`;
            summary.textContent = label;
            summary.setAttribute?.("title", label);
        } else {
            summary.textContent = "Phase";
            summary.removeAttribute?.("title");
        }
    }

    selectComposerFlybyEvent(panelState, eventIndex) {
        const flybyEvents = Array.isArray(this.composerFlybyEvents) ? this.composerFlybyEvents : [];
        const boundedIndex = Number(eventIndex);
        if (!Number.isInteger(boundedIndex) || boundedIndex < 0 || boundedIndex >= flybyEvents.length) {
            return false;
        }
        const eventInfo = flybyEvents[boundedIndex];
        if (!Number.isFinite(eventInfo?.timeMs)) {
            return false;
        }
        panelState.composerFlybySelectedEventTimeMs = eventInfo.timeMs;
        if (this.composerActivePhaseIndex >= 0) {
            this.composerSelectedPhaseIndex = this.composerActivePhaseIndex;
        }
        this.applyComposerGuidedViewState(panelState, {
            syncComposerLockUi: panelState.syncComposerLockUi,
            syncAutoToggleUi: panelState.syncComposerAutoToggleUi,
            persist: false,
            requestRender: false,
        });
        this.seekMainTimelineTime(eventInfo.timeMs, true);
        this.syncComposerTimelineUi(panelState, { preferredPhaseIndex: this.composerActivePhaseIndex });
        this.syncComposerFlybyEventPills(panelState, eventInfo.timeMs);
        if (panelState.composerFlybyEventsDetails) {
            panelState.composerFlybyEventsDetails.open = false;
        }
        this.requestRender?.();
        return true;
    }

    syncComposerFlybyEventPills(panelState, currentTimeMs) {
        const wrap = panelState?.composerFlybyEventsWrap;
        if (!wrap) {
            return;
        }
        const flybyEvents = Array.isArray(this.composerFlybyEvents) ? this.composerFlybyEvents : [];
        const signature = flybyEvents.map((eventInfo) => `${eventInfo.key || eventInfo.id || ""}:${eventInfo.timeMs}`).join("|");
        if (panelState.composerFlybyEventsSignature !== signature) {
            wrap.replaceChildren();
            panelState.composerFlybyEventNodes = [];
            panelState.composerFlybyEventsSignature = signature;
            panelState.composerFlybySelectedEventTimeMs = Number.NaN;
            for (let eventIndex = 0; eventIndex < flybyEvents.length; eventIndex += 1) {
                const eventInfo = flybyEvents[eventIndex];
                const pill = document.createElement("button");
                pill.type = "button";
                pill.className = "aux-camera-view__composer-event-pill";
                const eventTitle = eventInfo.title || eventInfo.label || eventInfo.sourceLabel || "Event";
                pill.setAttribute("aria-label", `Jump timeline to ${eventTitle}`);
                const title = document.createElement("span");
                title.className = "aux-camera-view__composer-event-pill-title";
                title.textContent = eventTitle;
                const time = document.createElement("span");
                time.className = "aux-camera-view__composer-event-pill-time";
                time.textContent = this.formatLocalDateTime(eventInfo.timeMs);
                pill.appendChild(title);
                pill.appendChild(time);
                pill.addEventListener("click", () => {
                    this.selectComposerFlybyEvent(panelState, eventIndex);
                });
                wrap.appendChild(pill);
                panelState.composerFlybyEventNodes.push({
                    element: pill,
                    id: eventInfo.key || eventInfo.id || "",
                    timeMs: eventInfo.timeMs,
                    title: eventTitle,
                });
            }
        }
        const eventNodes = Array.isArray(panelState.composerFlybyEventNodes)
            ? panelState.composerFlybyEventNodes
            : [];
        if (eventNodes.length === 0) {
            if (panelState.composerFlybyEventsSummary) {
                panelState.composerFlybyEventsSummary.textContent = "Events";
                panelState.composerFlybyEventsSummary.removeAttribute?.("title");
            }
            return;
        }

        const highlightState = resolveTimelineEventHighlightState({
            events: eventNodes,
            currentTimeMs,
        });
        const currentIndexes = new Set(highlightState.currentIndexes);
        const boundaryIndexes = new Set(highlightState.boundaryIndexes);
        const selectedEventTimeMs = panelState.composerFlybySelectedEventTimeMs;
        let selectedEventIndex = -1;
        if (Number.isFinite(selectedEventTimeMs)) {
            selectedEventIndex = eventNodes.findIndex((eventNode) => eventNode.timeMs === selectedEventTimeMs);
            if (!currentIndexes.has(selectedEventIndex)) {
                panelState.composerFlybySelectedEventTimeMs = Number.NaN;
                selectedEventIndex = -1;
            }
        }
        for (let i = 0; i < eventNodes.length; i += 1) {
            const isCurrent = currentIndexes.has(i);
            eventNodes[i].element.classList.toggle("is-active", isCurrent);
            eventNodes[i].element.classList.toggle("is-boundary", !isCurrent && boundaryIndexes.has(i));
        }
        if (panelState.composerFlybyEventsSummary) {
            const selectedTitle = selectedEventIndex >= 0 ? eventNodes[selectedEventIndex]?.title : "";
            panelState.composerFlybyEventsSummary.textContent = selectedTitle || "Events";
            if (selectedTitle) {
                panelState.composerFlybyEventsSummary.setAttribute?.("title", selectedTitle);
            } else {
                panelState.composerFlybyEventsSummary.removeAttribute?.("title");
            }
        }
    }

    resolveLunarFlybyTimeMs(eventInfos) {
        return resolveLunarFlybyTimeMs(eventInfos);
    }

    setComposerLookFromDirection(panelState, directionVector) {
        const len = directionVector?.length?.() || 0;
        if (!Number.isFinite(len) || len <= 1e-9) {
            return false;
        }
        this.composerLookWorld.copy(directionVector).multiplyScalar(1 / len);
        const planar = Math.hypot(this.composerLookWorld.x, this.composerLookWorld.y);
        panelState.composerYawRad = Math.atan2(this.composerLookWorld.y, this.composerLookWorld.x);
        panelState.composerPitchRad = Math.atan2(this.composerLookWorld.z, Math.max(planar, 1e-9));
        panelState.composerPitchRad = this.THREE.MathUtils.clamp(
            panelState.composerPitchRad,
            -COMPOSER_MAX_PITCH_RAD,
            COMPOSER_MAX_PITCH_RAD,
        );
        return true;
    }

    applyComposerPreset(panelState, presetKey, { craftWorld, earthWorld, moonWorld }) {
        const preset = presetKey === "moon" ? "moon" : "earth";
        const source = preset === "moon" ? moonWorld : earthWorld;
        if (!source || !craftWorld) {
            return false;
        }
        this.tmpVectorA.subVectors(source, craftWorld);
        return this.setComposerLookFromDirection(panelState, this.tmpVectorA);
    }

    syncComposerTimelineUi(panelState, { preferredPhaseIndex = -1 } = {}) {
        const slider = panelState.composerTimelineSlider;
        if (!slider) {
            return;
        }
        const timelineState = this.readMainTimelineState();
        this.syncComposerTransportUi(panelState, timelineState);
        if (!timelineState) {
            panelState.composerTimelineLabel.textContent = "Time unavailable";
            this.setComposerTimelineLocalText(panelState, Number.NaN);
            this.syncComposerPhaseSelect(panelState, -1);
            this.syncComposerFlybyEventPills(panelState, Number.NaN);
            this.setComposerInteractionEnabled(panelState, false);
            return;
        }
        const phases = Array.isArray(this.composerTimelinePhases) ? this.composerTimelinePhases : [];
        if (this.composerSelectedPhaseIndex >= phases.length) {
            this.composerSelectedPhaseIndex = -1;
        }
        if (
            this.composerSelectedPhaseIndex >= 0 &&
            !timelinePhaseContainsTime(phases[this.composerSelectedPhaseIndex], timelineState.value)
        ) {
            this.composerSelectedPhaseIndex = -1;
        }
        const boundedPreferredPhaseIndex = Number.isInteger(preferredPhaseIndex) &&
            preferredPhaseIndex >= 0 &&
            preferredPhaseIndex < phases.length
            ? preferredPhaseIndex
            : -1;
        let activePhaseIndex = boundedPreferredPhaseIndex;
        if (activePhaseIndex < 0 && this.composerSelectedPhaseIndex >= 0) {
            activePhaseIndex = this.composerSelectedPhaseIndex;
        }
        if (activePhaseIndex < 0) {
            activePhaseIndex = resolveActiveTimelinePhaseIndex(phases, timelineState.value);
        }
        if (activePhaseIndex < 0) {
            activePhaseIndex = 0;
        }
        this.composerActivePhaseIndex = activePhaseIndex;
        const activePhase = phases[activePhaseIndex] || null;
        let startMs = activePhase
            ? this.THREE.MathUtils.clamp(activePhase.startMs, timelineState.min, timelineState.max)
            : timelineState.min;
        let endMs = activePhase
            ? this.THREE.MathUtils.clamp(activePhase.endMs, timelineState.min, timelineState.max)
            : timelineState.max;
        if (endMs <= startMs) {
            endMs = Math.min(timelineState.max, startMs + 1);
        }

        panelState.composerTimelineStartMs = startMs;
        panelState.composerTimelineEndMs = endMs;
        this.composerFlybyEvents = Array.isArray(activePhase?.events) ? activePhase.events : [];
        this.syncComposerPhaseSelect(panelState, activePhaseIndex);
        this.setComposerInteractionEnabled(panelState, true);
        panelState.composerTimelineLabel.textContent = "Time";
        this.setComposerTimelineLocalText(panelState, timelineState.value);
        this.syncComposerFlybyEventPills(panelState, timelineState.value);

        if (!panelState.composerTimelineDragging) {
            const ratio = this.THREE.MathUtils.clamp((timelineState.value - startMs) / Math.max(endMs - startMs, 1), 0, 1);
            slider.value = String(Math.round(ratio * COMPOSER_TIMELINE_RESOLUTION));
        }
    }

    ensureLunarFeatureMentionTimeline(missionConfig = null) {
        const dataPath = asTrimmedString(
            missionConfig?.dataPath ||
            globalThis.window?.missionConfig?.dataPath ||
            "",
        );
        if (!dataPath) return;
        if (this.lunarFeatureMentionTimelineDataPath !== dataPath) {
            this.lunarFeatureMentionTimelineDataPath = dataPath;
            this.lunarFeatureMentionTimeline = null;
            this.lunarFeatureMentionTimelinePromise = null;
            this.lunarFeatureMentionTimelineMissing = false;
        }
        if (
            this.lunarFeatureMentionTimeline ||
            this.lunarFeatureMentionTimelinePromise ||
            this.lunarFeatureMentionTimelineMissing === true
        ) {
            return;
        }
        this.lunarFeatureMentionTimelinePromise = loadLunarFeatureMentionTimeline({ dataPath })
            .then((timeline) => {
                this.lunarFeatureMentionTimeline = timeline || null;
                this.lunarFeatureMentionTimelineMissing = !timeline;
                this.requestRender?.();
            })
            .catch((error) => {
                console.warn("Unable to load lunar feature mention timeline", error);
                this.lunarFeatureMentionTimeline = null;
                this.lunarFeatureMentionTimelineMissing = true;
            })
            .finally(() => {
                this.lunarFeatureMentionTimelinePromise = null;
            });
    }

    resolveComposerLunarFeatureMentionView(panelState) {
        if (panelState?.composerLunarFeatureSyncedEnabled === false) return null;
        if (!this.lunarFeatureMentionTimeline) return null;
        const timelineState = this.readMainTimelineState();
        if (!timelineState) return null;
        return resolveLunarFeatureMentionView(this.lunarFeatureMentionTimeline, {
            currentTimeMs: timelineState.value,
            missionStartMs: timelineState.min,
            visibleWindowSeconds: panelState.composerLunarFeatureMentionWindowSeconds,
            activeLeadSeconds: panelState.composerLunarFeatureMentionLeadSeconds,
            activeTrailSeconds: panelState.composerLunarFeatureMentionTrailSeconds,
        });
    }

    jumpComposerTranscriptFeature(panelState, direction = 1) {
        if (!this.lunarFeatureMentionTimeline) return false;
        const timelineState = this.readMainTimelineState();
        if (!timelineState) return false;
        const streamStartMs = Number(this.lunarFeatureMentionTimeline.streamStartMs);
        if (!Number.isFinite(streamStartMs)) return false;
        const currentStreamSeconds = (timelineState.value - streamStartMs) / 1000;
        const mentions = Array.isArray(this.lunarFeatureMentionTimeline.mentions)
            ? this.lunarFeatureMentionTimeline.mentions
            : [];
        const forward = direction >= 0;
        const mention = forward
            ? mentions.find((entry) => entry.timeSeconds > currentStreamSeconds + 0.25)
            : [...mentions].reverse().find((entry) => entry.timeSeconds < currentStreamSeconds - 0.25);
        if (!mention) return false;
        this.seekMainTimelineTime(streamStartMs + (mention.timeSeconds * 1000), true);
        panelState.composerLunarFeatureMentionView = this.resolveComposerLunarFeatureMentionView(panelState);
        this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);
        return true;
    }

    resolveComposerTranscriptFeatureNavigation() {
        if (!this.lunarFeatureMentionTimeline) {
            return { hasPrevious: false, hasNext: false };
        }
        const timelineState = this.readMainTimelineState();
        const streamStartMs = Number(this.lunarFeatureMentionTimeline.streamStartMs);
        if (!timelineState || !Number.isFinite(streamStartMs)) {
            return { hasPrevious: false, hasNext: false };
        }
        const currentStreamSeconds = (timelineState.value - streamStartMs) / 1000;
        const mentions = Array.isArray(this.lunarFeatureMentionTimeline.mentions)
            ? this.lunarFeatureMentionTimeline.mentions
            : [];
        return {
            hasPrevious: mentions.some((entry) => entry.timeSeconds < currentStreamSeconds - 0.25),
            hasNext: mentions.some((entry) => entry.timeSeconds > currentStreamSeconds + 0.25),
        };
    }

    renderComposerLunarFeatureStack(panelState, viewModel) {
        const stack = panelState?.composerLunarFeatureStack;
        const list = panelState?.composerLunarFeatureStackList;
        const restoreButton = panelState?.composerLunarFeatureStackRestoreButton;
        if (!isDomInstance(stack, "HTMLElement") || !isDomInstance(list, "HTMLElement")) {
            return;
        }
        const syncEnabled = panelState?.composerLunarFeatureSyncedEnabled !== false;
        const available = viewModel?.available === true;
        const items = Array.isArray(viewModel?.items) ? viewModel.items : [];
        const dismissed = panelState?.composerLunarFeatureStackDismissed === true;
        stack.hidden = !syncEnabled || !available || dismissed;
        if (isDomInstance(restoreButton, "HTMLElement")) {
            restoreButton.hidden = !syncEnabled || !available || !dismissed;
        }
        const navigationState = this.resolveComposerTranscriptFeatureNavigation();
        if (panelState.composerTranscriptPrevButton) {
            panelState.composerTranscriptPrevButton.disabled = stack.hidden || !navigationState.hasPrevious;
        }
        if (panelState.composerTranscriptNextButton) {
            panelState.composerTranscriptNextButton.disabled = stack.hidden || !navigationState.hasNext;
        }
        if (stack.hidden) {
            list.replaceChildren();
            return;
        }
        if (items.length === 0) {
            const empty = document.createElement("div");
            empty.className = "aux-camera-view__composer-feature-stack-empty";
            empty.textContent = "No features in this window";
            list.replaceChildren(empty);
            return;
        }
        const existing = new Map(
            Array.from(list.children)
                .filter((child) => isDomInstance(child, "HTMLElement"))
                .map((child) => [child.dataset.mentionId || "", child]),
        );
        const rendered = [];
        for (const item of items) {
            const key = item.id || `${item.timeSeconds}`;
            let row = existing.get(key);
            if (!row) {
                row = document.createElement("div");
                row.className = "aux-camera-view__composer-feature-stack-item";
                row.dataset.mentionId = key;
                const time = document.createElement("span");
                time.className = "aux-camera-view__composer-feature-stack-time";
                const name = document.createElement("span");
                name.className = "aux-camera-view__composer-feature-stack-name";
                row.appendChild(time);
                row.appendChild(name);
            }
            row.classList.toggle("is-active", item.active === true);
            row.dataset.active = item.active === true ? "true" : "false";
            const timeNode = row.querySelector(".aux-camera-view__composer-feature-stack-time");
            const nameNode = row.querySelector(".aux-camera-view__composer-feature-stack-name");
            if (timeNode) timeNode.textContent = item.metLabel || "";
            if (nameNode) nameNode.textContent = item.featureLabel || "";
            row.title = [item.speaker, item.summary].filter(Boolean).join(": ");
            rendered.push(row);
        }
        list.replaceChildren(...rendered);
    }

    getComposerLookDirection(panelState) {
        const cosPitch = Math.cos(panelState.composerPitchRad);
        this.composerLookWorld.set(
            Math.cos(panelState.composerYawRad) * cosPitch,
            Math.sin(panelState.composerYawRad) * cosPitch,
            Math.sin(panelState.composerPitchRad),
        );
        const len = this.composerLookWorld.length();
        if (len <= 1e-9) {
            this.composerLookWorld.set(1, 0, 0);
        } else {
            this.composerLookWorld.multiplyScalar(1 / len);
        }
        return this.composerLookWorld;
    }

    updateComposerRollUi(panelState) {
        const slider = panelState?.composerRollSlider;
        const valueNode = panelState?.composerRollValue;
        const dialKnob = panelState?.composerRollDialKnob;
        const dialValue = panelState?.composerRollDialValue;
        if (!slider && !valueNode && !dialKnob && !dialValue) {
            return;
        }
        const rawRoll = Number.isFinite(panelState.composerRollRad) ? panelState.composerRollRad : 0;
        const roll = normalizeComposerRollRad(rawRoll);
        panelState.composerRollRad = roll;
        const degrees = Math.round(this.THREE.MathUtils.radToDeg(roll)) % 360;
        if (slider) {
            slider.value = String(degrees);
        }
        const text = `${degrees}°`;
        if (valueNode) {
            valueNode.value = text;
            valueNode.textContent = text;
        }
        if (dialValue) {
            dialValue.textContent = text;
        }
        if (dialKnob) {
            const offset = composerRollDialKnobOffset(roll, 18);
            dialKnob.style.transform = `translate(calc(-50% + ${offset.x.toFixed(2)}px), calc(-50% + ${offset.y.toFixed(2)}px))`;
        }
    }

    getComposerReferenceUpVector(panelState) {
        const orientationReference = String(panelState?.composerOrientationReference || "world").trim().toLowerCase();
        if (orientationReference === "moon-north" && this.moonNorthWorld.lengthSq() > 1e-10) {
            return this.moonNorthWorld;
        }
        if (orientationReference === "earth-north" && this.earthNorthWorld.lengthSq() > 1e-10) {
            return this.earthNorthWorld;
        }
        return this.composerWorldUp;
    }

    getComposerCameraUp(panelState, lookDirWorld) {
        this.composerBaseUp.copy(this.getComposerReferenceUpVector(panelState));
        this.tmpVectorD.copy(lookDirWorld).multiplyScalar(this.composerBaseUp.dot(lookDirWorld));
        this.composerBaseUp.sub(this.tmpVectorD);
        if (this.composerBaseUp.lengthSq() <= 1e-10) {
            this.composerBaseUp.set(0, 1, 0);
            this.tmpVectorD.copy(lookDirWorld).multiplyScalar(this.composerBaseUp.dot(lookDirWorld));
            this.composerBaseUp.sub(this.tmpVectorD);
        }
        if (this.composerBaseUp.lengthSq() <= 1e-10) {
            this.composerBaseUp.set(1, 0, 0);
        } else {
            this.composerBaseUp.normalize();
        }
        const roll = Number.isFinite(panelState.composerRollRad) ? panelState.composerRollRad : 0;
        this.composerRotatedUp.copy(this.composerBaseUp).applyAxisAngle(lookDirWorld, roll).normalize();
        return this.composerRotatedUp;
    }

    setComposerOrientationReference(panelState, orientationReference, { preserveView = true } = {}) {
        if (!panelState || panelState.mode !== "composer") {
            return false;
        }
        const normalizedReference = String(orientationReference || "world").trim().toLowerCase() || "world";
        if (!preserveView) {
            panelState.composerOrientationReference = normalizedReference;
            return true;
        }
        const look = this.tmpVectorA.copy(this.getComposerLookDirection(panelState));
        const up = this.tmpVectorB.copy(this.getComposerCameraUp(panelState, look));
        panelState.composerOrientationReference = normalizedReference;
        this.setComposerOrientationFromLookUp(panelState, look, up);
        return true;
    }

    setComposerOrientationFromLookUp(panelState, lookDirWorld, upDirWorld) {
        const look = this.tmpVectorE.copy(lookDirWorld);
        if (!Number.isFinite(look.x) || !Number.isFinite(look.y) || !Number.isFinite(look.z) || look.lengthSq() <= 1e-12) {
            return false;
        }
        look.normalize();
        const planar = Math.hypot(look.x, look.y);
        panelState.composerYawRad = Math.atan2(look.y, look.x);
        panelState.composerPitchRad = Math.atan2(look.z, Math.max(planar, 1e-9));
        panelState.composerPitchRad = this.THREE.MathUtils.clamp(
            panelState.composerPitchRad,
            -COMPOSER_MAX_PITCH_RAD,
            COMPOSER_MAX_PITCH_RAD,
        );
        // If pitch was clamped, keep orientation stable by rebuilding look from yaw/pitch.
        const cosPitch = Math.cos(panelState.composerPitchRad);
        look.set(
            Math.cos(panelState.composerYawRad) * cosPitch,
            Math.sin(panelState.composerYawRad) * cosPitch,
            Math.sin(panelState.composerPitchRad),
        ).normalize();

        const targetUp = this.tmpVectorF.copy(upDirWorld);
        if (!Number.isFinite(targetUp.x) || !Number.isFinite(targetUp.y) || !Number.isFinite(targetUp.z) || targetUp.lengthSq() <= 1e-12) {
            targetUp.copy(this.composerWorldUp);
        }
        // Orthonormalize up against look.
        targetUp.sub(this.tmpVectorD.copy(look).multiplyScalar(targetUp.dot(look)));
        if (targetUp.lengthSq() <= 1e-12) {
            targetUp.copy(this.getComposerCameraUp(panelState, look));
        } else {
            targetUp.normalize();
        }

        this.composerBaseUp.copy(this.getComposerReferenceUpVector(panelState));
        this.tmpVectorD.copy(look).multiplyScalar(this.composerBaseUp.dot(look));
        this.composerBaseUp.sub(this.tmpVectorD);
        if (this.composerBaseUp.lengthSq() <= 1e-12) {
            this.composerBaseUp.set(0, 1, 0);
            this.tmpVectorD.copy(look).multiplyScalar(this.composerBaseUp.dot(look));
            this.composerBaseUp.sub(this.tmpVectorD);
        }
        if (this.composerBaseUp.lengthSq() <= 1e-12) {
            this.composerBaseUp.set(1, 0, 0);
        } else {
            this.composerBaseUp.normalize();
        }

        const sin = look.dot(this.tmpVectorD.copy(this.composerBaseUp).cross(targetUp));
        const cos = this.composerBaseUp.dot(targetUp);
        panelState.composerRollRad = Math.atan2(sin, cos);
        if (!Number.isFinite(panelState.composerRollRad)) {
            panelState.composerRollRad = 0;
        }
        return true;
    }

    applyComposerBodyAmbientLighting({
        panelState,
        earth = null,
        moon = null,
    }) {
        const earthAmbient = this.THREE.MathUtils.clamp(
            Number(panelState?.composerEarthAmbient),
            COMPOSER_MIN_AMBIENT,
            COMPOSER_MAX_AMBIENT,
        );
        const moonAmbient = this.THREE.MathUtils.clamp(
            Number(panelState?.composerMoonAmbient),
            COMPOSER_MIN_AMBIENT,
            COMPOSER_MAX_AMBIENT,
        );
        const moonshineGain = this.THREE.MathUtils.clamp(
            Number(panelState?.composerMoonshineGain),
            COMPOSER_MIN_MOONSHINE_GAIN,
            COMPOSER_MAX_MOONSHINE_GAIN,
        );
        const earthNightsideLift = Number.isFinite(earthAmbient) ? earthAmbient : 0;
        const earthMoonshineLift = Number.isFinite(moonshineGain)
            ? moonshineGain * COMPOSER_MOONSHINE_LIFT_SCALE
            : 0;
        const moonShadowLift = this.THREE.MathUtils.clamp(
            (Number.isFinite(moonAmbient) ? moonAmbient : 0) * COMPOSER_MOON_SHADOW_LIFT_SCALE,
            0,
            0.95,
        );
        const touchedMaterials = new Set();
        const restoreRecords = [];
        const refreshBodyMaterialUniforms = (material) => {
            material?.userData?.refreshEarthShaderUniforms?.();
            material?.userData?.refreshMoonShaderUniforms?.();
        };
        const applyToBodyEmissive = (bodyObject, intensity, emissiveHex) => {
            if (!bodyObject || !Number.isFinite(intensity) || intensity <= 1e-6) {
                return;
            }
            bodyObject.traverse((node) => {
                if (!node?.isMesh) {
                    return;
                }
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                for (const material of materials) {
                    if (!material || touchedMaterials.has(material)) {
                        continue;
                    }
                    if (!material.map || !material.emissive || !Number.isFinite(material.emissiveIntensity)) {
                        continue;
                    }
                    touchedMaterials.add(material);
                    restoreRecords.push({
                        material,
                        emissiveIntensity: material.emissiveIntensity,
                        emissiveHex: material.emissive.getHex(),
                    });
                    material.emissive.setHex(emissiveHex);
                    material.emissiveIntensity = intensity;
                    refreshBodyMaterialUniforms(material);
                }
            });
        };
        const applyEarthNightsideControls = (bodyObject, liftValue, moonshineLiftValue) => {
            if (!bodyObject || (!Number.isFinite(liftValue) && !Number.isFinite(moonshineLiftValue))) {
                return false;
            }
            let applied = false;
            bodyObject.traverse((node) => {
                if (!node?.isMesh) {
                    return;
                }
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                for (const material of materials) {
                    if (!material || touchedMaterials.has(material) || !material.map) {
                        continue;
                    }
                    if (!material.userData) {
                        continue;
                    }
                    const hasNightsideLift = Object.prototype.hasOwnProperty.call(material.userData, "earthNightsideLift");
                    const hasMoonshineLift = Object.prototype.hasOwnProperty.call(material.userData, "earthMoonshineLift");
                    if (!hasNightsideLift && !hasMoonshineLift) {
                        continue;
                    }
                    const record = { material };
                    if (hasNightsideLift) {
                        record.earthNightsideLift = material.userData.earthNightsideLift;
                    }
                    if (hasMoonshineLift) {
                        record.earthMoonshineLift = material.userData.earthMoonshineLift;
                    }
                    touchedMaterials.add(material);
                    restoreRecords.push(record);
                    if (hasNightsideLift && Number.isFinite(liftValue)) {
                        material.userData.earthNightsideLift = liftValue;
                    }
                    if (hasMoonshineLift && Number.isFinite(moonshineLiftValue)) {
                        material.userData.earthMoonshineLift = moonshineLiftValue;
                    }
                    refreshBodyMaterialUniforms(material);
                    applied = true;
                }
            });
            return applied;
        };
        const applyMoonShadowLift = (bodyObject, shadowLiftValue) => {
            if (!bodyObject || !Number.isFinite(shadowLiftValue)) {
                return false;
            }
            let applied = false;
            bodyObject.traverse((node) => {
                if (!node?.isMesh) {
                    return;
                }
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                for (const material of materials) {
                    if (!material || touchedMaterials.has(material) || !material.map) {
                        continue;
                    }
                    if (!material.userData || !Object.prototype.hasOwnProperty.call(material.userData, "moonShadowLift")) {
                        continue;
                    }
                    touchedMaterials.add(material);
                    restoreRecords.push({
                        material,
                        moonShadowLift: material.userData.moonShadowLift,
                        emissiveIntensity: material.emissive && Number.isFinite(material.emissiveIntensity)
                            ? material.emissiveIntensity
                            : null,
                        emissiveHex: material.emissive?.getHex ? material.emissive.getHex() : null,
                    });
                    material.userData.moonShadowLift = shadowLiftValue;
                    refreshBodyMaterialUniforms(material);
                    applied = true;
                }
            });
            return applied;
        };

        // Earth Fill is an explicit creative lift for Earth's night side.
        // Moonshine uses a separate Earth shader lift so it remains visible on the night side.
        const earthLiftApplied = applyEarthNightsideControls(earth, earthNightsideLift, earthMoonshineLift);
        if (!earthLiftApplied) {
            applyToBodyEmissive(earth, earthNightsideLift + (earthMoonshineLift * 0.35), 0x6c86a6);
        }
        // Moon Fill is independent of Earthshine; zero must mean no artificial Moon fill.
        const moonLiftApplied = applyMoonShadowLift(moon, moonShadowLift);
        if (!moonLiftApplied) {
            const fallbackMoonEmissive = Number.isFinite(moonAmbient) ? (moonAmbient * 0.2) : 0;
            applyToBodyEmissive(moon, fallbackMoonEmissive, 0x9aa8bf);
        }

        return () => {
            for (const record of restoreRecords) {
                if (Object.prototype.hasOwnProperty.call(record, "earthNightsideLift")) {
                    record.material.userData.earthNightsideLift = record.earthNightsideLift;
                }
                if (Object.prototype.hasOwnProperty.call(record, "earthMoonshineLift")) {
                    record.material.userData.earthMoonshineLift = record.earthMoonshineLift;
                }
                if (
                    Object.prototype.hasOwnProperty.call(record, "earthNightsideLift") ||
                    Object.prototype.hasOwnProperty.call(record, "earthMoonshineLift")
                ) {
                    refreshBodyMaterialUniforms(record.material);
                    continue;
                }
                if (Object.prototype.hasOwnProperty.call(record, "moonShadowLift")) {
                    record.material.userData.moonShadowLift = record.moonShadowLift;
                    if (record.emissiveIntensity !== null && record.material.emissive) {
                        record.material.emissiveIntensity = record.emissiveIntensity;
                        record.material.emissive.setHex(record.emissiveHex);
                    }
                    refreshBodyMaterialUniforms(record.material);
                    continue;
                }
                record.material.emissiveIntensity = record.emissiveIntensity;
                record.material.emissive.setHex(record.emissiveHex);
                refreshBodyMaterialUniforms(record.material);
            }
        };
    }

    resolveComposerBodyAmbientState() {
        const composerPanel = Array.isArray(this.panels)
            ? this.panels.find((panelState) => panelState?.mode === "composer")
            : null;
        if (!composerPanel) {
            return null;
        }
        return {
            composerEarthAmbient: composerPanel.composerEarthAmbient,
            composerMoonAmbient: composerPanel.composerMoonAmbient,
            composerMoonshineGain: composerPanel.composerMoonshineGain,
        };
    }

    applySharedComposerBodyAmbientLighting({
        earth = null,
        moon = null,
    } = {}) {
        return this.applyComposerBodyAmbientLighting({
            panelState: this.resolveComposerBodyAmbientState(),
            earth,
            moon,
        });
    }

    applyComposerBodyLightingPresentation({
        earth = null,
        moon = null,
        distanceToEarth = Number.NaN,
        earthRadius = Number.NaN,
        distanceToMoon = Number.NaN,
        moonRadius = Number.NaN,
        earthDayTexture = null,
        earthDayTextureBlend = null,
    }) {
        const presentation = computePhotoModeLightingPresentation({
            distanceToEarth,
            earthRadius,
            distanceToMoon,
            moonRadius,
        });
        return applyPhotoModeBodyPresentation({
            earth,
            moon,
            presentation,
            earthDayTexture,
            earthDayTextureBlend,
        });
    }

    applyComposerEarthshineGain(panelState, scene) {
        const lightFill = scene?.lightFill || null;
        if (!lightFill) {
            return () => {};
        }
        const previousIntensity = Number(lightFill.intensity);
        const gain = this.THREE.MathUtils.clamp(
            Number(panelState?.composerEarthshineGain),
            COMPOSER_MIN_EARTHSHINE_GAIN,
            COMPOSER_MAX_EARTHSHINE_GAIN,
        );
        if (!Number.isFinite(previousIntensity) || !Number.isFinite(gain)) {
            return () => {};
        }
        lightFill.intensity = Math.max(0, previousIntensity) * gain;
        return () => {
            lightFill.intensity = previousIntensity;
        };
    }

    applyComposerMoonshineGain(panelState, scene) {
        const lightMoonshine = scene?.lightMoonshine || null;
        if (!lightMoonshine) {
            return () => {};
        }
        const previousIntensity = Number(lightMoonshine.intensity);
        const gain = this.THREE.MathUtils.clamp(
            Number(panelState?.composerMoonshineGain),
            COMPOSER_MIN_MOONSHINE_GAIN,
            COMPOSER_MAX_MOONSHINE_GAIN,
        );
        if (!Number.isFinite(previousIntensity) || !Number.isFinite(gain)) {
            return () => {};
        }
        lightMoonshine.intensity = Math.max(0, previousIntensity) * gain;
        return () => {
            lightMoonshine.intensity = previousIntensity;
        };
    }

    updateBodyNorthWorld(bodyObject, targetVector) {
        if (!bodyObject?.getWorldQuaternion || !targetVector?.set) {
            return false;
        }
        bodyObject.getWorldQuaternion(this.targetQuat);
        targetVector.set(0, 0, 1).applyQuaternion(this.targetQuat);
        const len = targetVector.length();
        if (!Number.isFinite(len) || len <= 1e-12) {
            targetVector.set(0, 0, 1);
            return false;
        }
        targetVector.multiplyScalar(1 / len);
        return true;
    }

    computeComposerAutoFovDegrees({
        panelState,
        craftWorld,
        earthWorld,
        moonWorld,
        earthRadius,
        moonRadius,
        lockTarget = "none",
    }) {
        if (lockTarget !== "earth" && lockTarget !== "moon") {
            return panelState.camera.fov;
        }
        const targetKind = lockTarget;
        const targetWorld = targetKind === "moon" ? moonWorld : earthWorld;
        if (!targetWorld || !craftWorld) {
            return panelState.camera.fov;
        }

        this.tmpVectorA.subVectors(targetWorld, craftWorld);
        const distance = this.tmpVectorA.length();
        if (!Number.isFinite(distance) || distance <= 1e-6) {
            return panelState.camera.fov;
        }

        const targetRadius = targetKind === "moon"
            ? (Number.isFinite(moonRadius) && moonRadius > 0 ? moonRadius : 1)
            : (Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1);
        const safeAspect = Math.max(panelState.camera.aspect || 1, 1e-3);
        const computeBodyFov = ({ bodyDistance, bodyRadius, diameterFraction }) => {
            const safeDistance = Math.max(bodyDistance, bodyRadius + 1e-9);
            const ratio = this.THREE.MathUtils.clamp(bodyRadius / safeDistance, 0, 0.999999);
            const angularRadius = Math.asin(ratio);
            const halfFrameFraction = Math.max(diameterFraction, 1e-3);
            const tanAngularRadius = Math.tan(angularRadius);
            const verticalHalfFromHeight = Math.atan(tanAngularRadius / halfFrameFraction);
            const verticalHalfFromWidth = Math.atan(tanAngularRadius / (halfFrameFraction * safeAspect));
            const requiredHalfVertical = Math.max(verticalHalfFromHeight, verticalHalfFromWidth);
            return {
                angularRadius,
                fovDegrees: this.THREE.MathUtils.radToDeg(requiredHalfVertical * 2),
            };
        };
        const targetFov = computeBodyFov({
            bodyDistance: distance,
            bodyRadius: targetRadius,
            diameterFraction: COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
        });
        let autoFovDegrees = targetFov.fovDegrees;

        const foregroundWorld = targetKind === "moon" ? earthWorld : moonWorld;
        const foregroundRadius = targetKind === "moon"
            ? (Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1)
            : (Number.isFinite(moonRadius) && moonRadius > 0 ? moonRadius : 1);
        if (foregroundWorld) {
            const foregroundVector = this.tmpVectorB || new this.THREE.Vector3();
            foregroundVector.subVectors(foregroundWorld, craftWorld);
            const foregroundDistance = foregroundVector.length();
            if (
                Number.isFinite(foregroundDistance) &&
                foregroundDistance > 1e-6 &&
                foregroundDistance < distance
            ) {
                const foregroundFov = computeBodyFov({
                    bodyDistance: foregroundDistance,
                    bodyRadius: foregroundRadius,
                    diameterFraction: COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
                });
                const targetDirection = this.tmpVectorA.clone().multiplyScalar(1 / distance);
                const foregroundDirection = foregroundVector.multiplyScalar(1 / foregroundDistance);
                const centerSeparation = Math.acos(this.THREE.MathUtils.clamp(
                    targetDirection.dot(foregroundDirection),
                    -1,
                    1,
                ));
                const targetHalfVertical = this.THREE.MathUtils.degToRad(autoFovDegrees * 0.5);
                const targetHalfHorizontal = Math.atan(Math.tan(targetHalfVertical) * safeAspect);
                const targetHalfDiagonal = Math.hypot(targetHalfVertical, targetHalfHorizontal);
                if (centerSeparation <= targetHalfDiagonal + foregroundFov.angularRadius) {
                    autoFovDegrees = Math.max(autoFovDegrees, foregroundFov.fovDegrees);
                }
            }
        }
        return autoFovDegrees;
    }

    setComposerLunarFeatureStackPosition(panelState, leftPx, topPx) {
        const stack = panelState?.composerLunarFeatureStack;
        const viewport = panelState?.viewport;
        if (!isDomInstance(stack, "HTMLElement") || !isDomInstance(viewport, "HTMLElement")) {
            return;
        }
        const viewportWidth = Math.max(1, viewport.clientWidth || 1);
        const viewportHeight = Math.max(1, viewport.clientHeight || 1);
        const stackWidth = Math.max(1, stack.offsetWidth || stack.getBoundingClientRect?.().width || 1);
        const stackHeight = Math.max(1, stack.offsetHeight || stack.getBoundingClientRect?.().height || 1);
        const maxLeft = Math.max(0, viewportWidth - stackWidth - 6);
        const maxTop = Math.max(6, viewportHeight - stackHeight - 6);
        const nextLeft = Math.min(maxLeft, Math.max(6, Number(leftPx)));
        const nextTop = Math.min(maxTop, Math.max(6, Number(topPx)));
        if (!Number.isFinite(nextLeft) || !Number.isFinite(nextTop)) {
            return;
        }
        panelState.composerLunarFeatureStackLeftPx = nextLeft;
        panelState.composerLunarFeatureStackTopPx = nextTop;
        stack.style.left = `${nextLeft}px`;
        stack.style.top = `${nextTop}px`;
        stack.style.right = "auto";
    }

    clampComposerLunarFeatureStackPosition(panelState) {
        if (
            !Number.isFinite(panelState?.composerLunarFeatureStackLeftPx) ||
            !Number.isFinite(panelState?.composerLunarFeatureStackTopPx)
        ) {
            return;
        }
        this.setComposerLunarFeatureStackPosition(
            panelState,
            panelState.composerLunarFeatureStackLeftPx,
            panelState.composerLunarFeatureStackTopPx,
        );
    }

    syncPanelSize(panelState) {
        // Keep target panels square; composer can use a wider rectangular layout.
        const isComposer = panelState.mode === "composer";
        const minSize = isComposer ? PANEL_MIN_SIDE_COMPOSER : PANEL_MIN_SIDE_DEFAULT;
        const panelWidth = Math.max(minSize, Math.floor(panelState.panel.clientWidth || 0));
        const panelHeight = Math.max(minSize, Math.floor(panelState.panel.clientHeight || 0));
        if (!isComposer) {
            const controlsDensity = (panelWidth >= 360 && panelHeight >= 280) ? "expanded" : "compact";
            panelState.panel.dataset.controlsDensity = controlsDensity;
        }
        if (!isComposer && panelWidth > 0 && Math.abs(panelWidth - panelHeight) > 1) {
            panelState.panel.style.height = `${panelWidth}px`;
        }
        this.updateComposerControlsPopoverPosition(panelState);

        const width = Math.max(120, Math.floor(panelState.viewport.clientWidth));
        const height = Math.max(80, Math.floor(panelState.viewport.clientHeight));
        const changed = width !== panelState.width || height !== panelState.height;
        if (changed) {
            panelState.width = width;
            panelState.height = height;
            panelState.renderer.setSize(width, height, true);
            if (panelState.overlayCanvas) {
                panelState.overlayCanvas.width = width;
                panelState.overlayCanvas.height = height;
            }
            panelState.camera.aspect = width / height;
            if (panelState.camera.isOrthographicCamera) {
                const aspect = Math.max(width / Math.max(1, height), 1e-6);
                const halfHeight = Number.isFinite(panelState.orthographicHalfHeight) && panelState.orthographicHalfHeight > 0
                    ? panelState.orthographicHalfHeight
                    : 1;
                panelState.camera.left = -halfHeight * aspect;
                panelState.camera.right = halfHeight * aspect;
                panelState.camera.top = halfHeight;
                panelState.camera.bottom = -halfHeight;
            }
            panelState.camera.updateProjectionMatrix();
            panelState.overlayDirty = true;
        }
        if (isComposer) {
            this.clampComposerLunarFeatureStackPosition(panelState);
        }
        this.clampPanelPosition(panelState);
    }

    renderLayers(renderer, scene, camera, { renderSkyLayer = true } = {}) {
        if (renderSkyLayer) {
            renderer.autoClear = true;
            configureSkyRenderLayers(camera);
            renderer.render(scene, camera);

            renderer.autoClear = false;
            renderer.clearDepth();
        } else {
            renderer.autoClear = true;
        }

        configureBodyRenderLayers(camera);
        renderer.render(scene, camera);
        renderer.autoClear = false;
        configureCraftRenderLayers(camera);
        renderer.render(scene, camera);
    }

    renderLayersWithLunarCraterVisibility(renderer, scene, camera, options = {}) {
        const fallbackState = createDefaultLunarFeatureViewState({
            viewLunarCraters: options.lunarCratersVisible === true,
        });
        renderWithLunarCraterView({
            viewId: options.lunarCraterViewId,
            viewState: options.lunarCraterViewState || fallbackState,
            animationScene: options.animationScene || null,
            scene,
            camera,
            rendererDomElement: renderer?.domElement || null,
            pointer: options.lunarCraterPointer || null,
            freezeLabelScale: options.freezeLunarCraterLabelScale === true,
            render: () => {
                this.renderLayers(renderer, scene, camera, options);
            },
        });
    }

    renderComposerLayers(panelState, scene, options = {}) {
        const fallbackState = createDefaultLunarFeatureViewState({
            viewLunarCraters: panelState.composerLunarCratersEnabled === true,
        });
        const activeCatalogNames = panelState.composerLunarFeatureSyncedEnabled !== false &&
            Array.isArray(panelState.composerLunarFeatureMentionView?.activeCatalogNames)
            ? panelState.composerLunarFeatureMentionView.activeCatalogNames
            : [];
        const composerLunarCraterState = panelState.composerLunarCraterState || fallbackState;
        const injectedLunarFeatureState = activeCatalogNames.length > 0
            ? {
                ...composerLunarCraterState,
                viewLunarCraters: true,
                lunarFeaturePinnedNames: activeCatalogNames,
                lunarCraterHoverLabels: true,
            }
            : composerLunarCraterState;
        renderWithSurfacePointView({
            animationScene: options.animationScene || null,
            viewState: panelState.composerSurfacePointState || createDefaultSurfacePointViewState(),
            render: () => {
                this.renderLayersWithLunarCraterVisibility(panelState.renderer, scene, panelState.camera, {
                    ...options,
                    lunarCraterViewId: LUNAR_CRATER_VIEW_IDS.FRAME_AND_SHOOT,
                    lunarCraterViewState: injectedLunarFeatureState,
                    lunarCraterPointer: panelState.composerLunarCraterPointer,
                    freezeLunarCraterLabelScale: panelState.composerViewportPointer != null,
                });
            },
        });
    }

    renderAuxiliaryPanelLayers(panelState, scene, options = {}) {
        this.renderLayersWithLunarCraterVisibility(panelState.renderer, scene, panelState.camera, {
            ...options,
            lunarCraterViewId: panelState.lunarCraterViewId || null,
            lunarCraterViewState: panelState.lunarCraterViewState,
        });
    }

    requestComposerCoronaAnimationFrame() {
        if (this.composerCoronaAnimationRaf != null || !this.requestRender) {
            return;
        }
        this.composerCoronaAnimationRaf = requestAnimationFrame(() => {
            this.composerCoronaAnimationRaf = null;
            this.requestRender?.();
        });
    }

    /**
     * @param {{
     *   craftWorld?: { x: number, y: number, z: number },
     *   earthWorld?: { x: number, y: number, z: number },
     *   moonWorld?: { x: number, y: number, z: number },
     *   earthRadius?: number,
     *   moonRadius?: number,
     * }} [options]
     */
    resolveComposerSolarEclipseState({
        craftWorld,
        earthWorld,
        moonWorld,
        earthRadius,
        moonRadius,
    } = {}) {
        const sunDirection = this.sunDirectionCraftWorld;
        const sunLen = Number.isFinite(sunDirection?.length?.())
            ? sunDirection.length()
            : Math.hypot(
                Number(sunDirection?.x),
                Number(sunDirection?.y),
                Number(sunDirection?.z),
            );
        if (
            !craftWorld ||
            !Number.isFinite(craftWorld.x) ||
            !Number.isFinite(craftWorld.y) ||
            !Number.isFinite(craftWorld.z) ||
            !Number.isFinite(sunLen) ||
            sunLen <= 1e-12
        ) {
            return { active: false, occluder: null, coverage: 0 };
        }

        const clamp = this.THREE.MathUtils.clamp;
        const sunX = sunDirection.x / sunLen;
        const sunY = sunDirection.y / sunLen;
        const sunZ = sunDirection.z / sunLen;
        const evaluateBody = (id, bodyWorld, radius) => {
            const bodyRadius = Number(radius);
            if (
                !bodyWorld ||
                !Number.isFinite(bodyWorld.x) ||
                !Number.isFinite(bodyWorld.y) ||
                !Number.isFinite(bodyWorld.z) ||
                !Number.isFinite(bodyRadius) ||
                bodyRadius <= 0
            ) {
                return null;
            }
            const dx = bodyWorld.x - craftWorld.x;
            const dy = bodyWorld.y - craftWorld.y;
            const dz = bodyWorld.z - craftWorld.z;
            const distance = Math.hypot(dx, dy, dz);
            if (!Number.isFinite(distance) || distance <= bodyRadius) {
                return null;
            }
            const dot = clamp(((dx * sunX) + (dy * sunY) + (dz * sunZ)) / distance, -1, 1);
            if (dot <= 0) {
                return null;
            }
            const separationRad = Math.acos(dot);
            const bodyAngularRadiusRad = Math.asin(clamp(bodyRadius / distance, 0, 0.999999));
            const contactRad = bodyAngularRadiusRad + COMPOSER_SOLAR_ANGULAR_RADIUS_RAD;
            const fullCoverageRad = bodyAngularRadiusRad - COMPOSER_SOLAR_ANGULAR_RADIUS_RAD;
            const coverage = clamp(
                (contactRad - separationRad) / Math.max(COMPOSER_SOLAR_ANGULAR_RADIUS_RAD * 2, 1e-9),
                0,
                1,
            );
            const fullyObscured = fullCoverageRad >= 0 &&
                separationRad <= (fullCoverageRad + 1e-9);
            return {
                active: fullyObscured,
                occluder: id,
                coverage,
                fullyObscured,
                separationRad,
                bodyAngularRadiusRad,
            };
        };

        const moonOcclusion = evaluateBody("moon", moonWorld, moonRadius);
        const earthOcclusion = evaluateBody("earth", earthWorld, earthRadius);
        const best = [moonOcclusion, earthOcclusion]
            .filter(Boolean)
            .sort((a, b) => b.coverage - a.coverage)[0] || null;

        return best || { active: false, occluder: null, coverage: 0 };
    }

    resolveComposerEclipseCoronaVisualState(panelState) {
        const clamp = this.THREE.MathUtils.clamp;
        const intensity = clamp(
            Number(panelState?.composerEclipseCoronaIntensity),
            COMPOSER_ECLIPSE_CORONA_MIN,
            COMPOSER_ECLIPSE_CORONA_MAX,
        );
        const motion = clamp(
            Number(panelState?.composerEclipseCoronaMotion),
            COMPOSER_ECLIPSE_CORONA_MIN,
            COMPOSER_ECLIPSE_CORONA_MAX,
        );
        const structure = clamp(
            Number(panelState?.composerEclipseCoronaStructure),
            COMPOSER_ECLIPSE_CORONA_MIN,
            COMPOSER_ECLIPSE_CORONA_MAX,
        );
        const dust = clamp(
            Number(panelState?.composerEclipseZodiacalDust),
            COMPOSER_ECLIPSE_CORONA_MIN,
            COMPOSER_ECLIPSE_CORONA_MAX,
        );
        const coronaIntensity = Number.isFinite(intensity)
            ? intensity
            : COMPOSER_ECLIPSE_CORONA_DEFAULT;
        const coronaMotion = Number.isFinite(motion)
            ? motion
            : COMPOSER_ECLIPSE_CORONA_DEFAULT;
        const coronaStructure = Number.isFinite(structure)
            ? structure
            : COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT;
        const zodiacalDust = Number.isFinite(dust)
            ? dust
            : COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT;

        return {
            coreOpacity: 1.0,
            coreScaleMul: 1.0,
            haloOpacity: 0.0,
            haloScaleMul: 4.8,
            coronaOpacity: clamp(0.80 * coronaIntensity, 0, 1),
            coronaScaleMul: 90.0,
            coronaFlowOpacity: clamp(0.28 * coronaIntensity * coronaStructure, 0, 0.72),
            coronaFlowScaleMul: 84.0 + (4.0 * coronaIntensity),
            coronaMotionMul: coronaMotion,
            zodiacalOpacity: clamp(0.22 * coronaIntensity * zodiacalDust, 0, 0.55),
            zodiacalScaleXMul: 68.0,
            zodiacalScaleYMul: 30.0,
            zodiacalRotationRad: -0.08,
            starburstOpacity: 0.0,
            starburstScaleMul: 16.0,
            flareOpacity: 0.0,
            flareScaleXMul: 26.0,
            flareScaleYMul: 2.4,
        };
    }

    resolveComposerSunOpticsProfile(panelState, { eclipseActive = panelState?.composerSolarEclipseActive === true } = {}) {
        const profile = panelState?.composerSunProfile === "physical" ? "physical" : "camera";
        if (eclipseActive === true) {
            const isPhysical = profile === "physical";
            return {
                exposure: isPhysical ? COMPOSER_RENDER_EXPOSURE : COMPOSER_CAMERA_EXPOSURE,
                skyStarmapOpacityCap: isPhysical
                    ? COMPOSER_SKY_STARMAP_OPACITY_CAP
                    : COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
                skyConstellationOpacityCap: isPhysical
                    ? COMPOSER_SKY_CONSTELLATION_OPACITY_CAP
                    : COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
                sunVisualState: this.resolveComposerEclipseCoronaVisualState(panelState),
            };
        }
        if (profile === "physical") {
            return {
                exposure: COMPOSER_RENDER_EXPOSURE,
                skyStarmapOpacityCap: COMPOSER_SKY_STARMAP_OPACITY_CAP,
                skyConstellationOpacityCap: COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
                sunVisualState: {
                    coreOpacity: 1.0,
                    coreScaleMul: 1.0,
                    haloOpacity: 0.36,
                    haloScaleMul: 4.8,
                    coronaOpacity: 0.0,
                    coronaScaleMul: 90.0,
                    coronaFlowOpacity: 0.0,
                    coronaFlowScaleMul: 84.0,
                    coronaMotionMul: 0.0,
                    zodiacalOpacity: 0.0,
                    zodiacalScaleXMul: 68.0,
                    zodiacalScaleYMul: 30.0,
                    zodiacalRotationRad: -0.08,
                    starburstOpacity: 0.0,
                    starburstScaleMul: 16.0,
                    flareOpacity: 0.0,
                    flareScaleXMul: 26.0,
                    flareScaleYMul: 2.4,
                },
            };
        }

        const clamp = this.THREE.MathUtils.clamp;
        const strength = clamp(
            Number(panelState?.composerSunStrength),
            COMPOSER_OPTICS_STRENGTH_MIN,
            COMPOSER_OPTICS_STRENGTH_MAX,
        );
        const haloGain = clamp(
            Number(panelState?.composerSunHaloGain),
            COMPOSER_OPTICS_ADVANCED_MIN,
            COMPOSER_OPTICS_ADVANCED_MAX,
        );
        const starburstGain = clamp(
            Number(panelState?.composerSunStarburstGain),
            COMPOSER_OPTICS_ADVANCED_MIN,
            COMPOSER_OPTICS_ADVANCED_MAX,
        );
        const flareGain = clamp(
            Number(panelState?.composerSunFlareGain),
            COMPOSER_OPTICS_ADVANCED_MIN,
            COMPOSER_OPTICS_ADVANCED_MAX,
        );

        const haloOpacity = clamp((0.20 + (0.20 * strength)) * haloGain, 0, 0.85);
        const haloScaleMul = 4.8 + (5.5 * strength);
        const starburstOpacity = clamp((0.12 + (0.14 * strength)) * starburstGain, 0, 0.92);
        const starburstScaleMul = 16.0 + (10.0 * strength);
        const flareOpacity = clamp((0.05 + (0.11 * strength)) * flareGain, 0, 0.78);
        const flareScaleXMul = 26.0 + (18.0 * strength);
        const flareScaleYMul = 2.4 + (1.1 * strength);

        return {
            exposure: COMPOSER_CAMERA_EXPOSURE,
            skyStarmapOpacityCap: COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
            skyConstellationOpacityCap: COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
            sunVisualState: {
                coreOpacity: 1.0,
                coreScaleMul: 1.0,
                haloOpacity,
                haloScaleMul,
                coronaOpacity: 0.0,
                coronaScaleMul: 90.0,
                coronaFlowOpacity: 0.0,
                coronaFlowScaleMul: 84.0,
                coronaMotionMul: 0.0,
                zodiacalOpacity: 0.0,
                zodiacalScaleXMul: 68.0,
                zodiacalScaleYMul: 30.0,
                zodiacalRotationRad: -0.08,
                starburstOpacity,
                starburstScaleMul,
                flareOpacity,
                flareScaleXMul,
                flareScaleYMul,
            },
        };
    }

    resolveComposerExposureState(panelState, { eclipseActive = panelState?.composerSolarEclipseActive === true } = {}) {
        const manualEv = this.THREE.MathUtils.clamp(
            Number(panelState?.composerExposureEv),
            COMPOSER_EXPOSURE_EV_MIN,
            COMPOSER_EXPOSURE_EV_MAX,
        );
        const boundedManualEv = Number.isFinite(manualEv)
            ? manualEv
            : COMPOSER_EXPOSURE_EV_DEFAULT;
        const eclipseAutoExposureEligible = panelState?.composerEclipseAutoExposureEligible !== false;
        const autoEv = panelState?.composerAutoExposureEnabled !== false &&
            eclipseActive === true &&
            eclipseAutoExposureEligible
            ? COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV
            : 0;
        return {
            manualEv: boundedManualEv,
            autoEv,
            multiplier: Math.pow(2, boundedManualEv + autoEv),
        };
    }

    resolveComposerBodyDiscInView(panelState, { bodyWorld, bodyRadius } = {}) {
        const camera = panelState?.camera;
        const radius = Number(bodyRadius);
        if (
            !camera?.isCamera ||
            !bodyWorld ||
            !Number.isFinite(radius) ||
            radius <= 0
        ) {
            return false;
        }

        const canvas = panelState.renderer?.domElement || panelState.overlayCanvas || null;
        const width = Math.max(
            1,
            Number(canvas?.width) ||
                Number(canvas?.clientWidth) ||
                Number(panelState.viewport?.clientWidth) ||
                1,
        );
        const height = Math.max(
            1,
            Number(canvas?.height) ||
                Number(canvas?.clientHeight) ||
                Number(panelState.viewport?.clientHeight) ||
                1,
        );
        const fovDeg = Number(camera.fov);
        if (!Number.isFinite(fovDeg) || fovDeg <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
            return false;
        }

        const projected = this.tmpVectorA || new this.THREE.Vector3();
        projected.copy(bodyWorld).project(camera);
        if (
            !Number.isFinite(projected.x) ||
            !Number.isFinite(projected.y) ||
            !Number.isFinite(projected.z) ||
            projected.z < -1 ||
            projected.z > 1
        ) {
            return false;
        }

        const cameraWorld = this.tmpVectorB || new this.THREE.Vector3();
        if (typeof camera.getWorldPosition === "function") {
            camera.getWorldPosition(cameraWorld);
        } else if (camera.position) {
            cameraWorld.copy(camera.position);
        } else {
            return false;
        }
        const distance = cameraWorld.distanceTo(bodyWorld);
        if (!Number.isFinite(distance) || distance <= radius) {
            return false;
        }

        const angularRadius = Math.asin(this.THREE.MathUtils.clamp(radius / distance, 0, 0.999999));
        const tanHalfVerticalFov = Math.tan(this.THREE.MathUtils.degToRad(fovDeg) * 0.5);
        const radiusPx = (Math.tan(angularRadius) / Math.max(tanHalfVerticalFov, 1e-9)) * (height * 0.5);
        if (!Number.isFinite(radiusPx) || radiusPx <= 0) {
            return false;
        }

        const cx = ((projected.x * 0.5) + 0.5) * width;
        const cy = (1 - ((projected.y * 0.5) + 0.5)) * height;
        return (
            cx + radiusPx >= 0 &&
            cx - radiusPx <= width &&
            cy + radiusPx >= 0 &&
            cy - radiusPx <= height
        );
    }

    shouldApplyComposerEclipseAutoExposure(panelState, {
        eclipseState,
        earthWorld,
        earthRadius,
        moonWorld,
        moonRadius,
    } = {}) {
        const occluder = eclipseState?.active === true
            ? String(eclipseState?.occluder || "").toLowerCase()
            : "";
        if (occluder === "earth") {
            return this.resolveComposerBodyDiscInView(panelState, {
                bodyWorld: earthWorld,
                bodyRadius: earthRadius,
            });
        }
        if (occluder !== "moon") {
            return false;
        }
        return this.resolveComposerBodyDiscInView(panelState, {
            bodyWorld: moonWorld,
            bodyRadius: moonRadius,
        });
    }

    applyComposerExposureProfile(
        scene,
        panelState,
        sunRenderer,
        { exposureBias = 1, skyRenderer = null, eclipseActive = panelState?.composerSolarEclipseActive === true } = {},
    ) {
        if (panelState?.mode !== "composer") {
            return () => {};
        }

        const profile = this.resolveComposerSunOpticsProfile(panelState, { eclipseActive });
        const renderer = panelState.renderer;
        const originalExposure = renderer.toneMappingExposure;
        const boundedExposureBias = this.THREE.MathUtils.clamp(
            Number(exposureBias),
            0.5,
            1.5,
        );
        const exposureState = this.resolveComposerExposureState(panelState, { eclipseActive });
        renderer.toneMappingExposure = profile.exposure *
            (Number.isFinite(boundedExposureBias) ? boundedExposureBias : 1) *
            exposureState.multiplier;

        const activeSkyRenderer = skyRenderer || scene?.skyRenderer || null;
        const skyMesh = activeSkyRenderer?.skyMesh || null;
        const skyMaterial = skyMesh?.material || null;
        const constellationMesh = activeSkyRenderer?.constellationMesh || null;
        const constellationMaterial = constellationMesh?.material || null;
        const skyContainer = activeSkyRenderer?.container || null;
        const starContainer = activeSkyRenderer?.starRenderer?.container ||
            activeSkyRenderer?.starRenderer?.object3D ||
            null;
        const starUniforms = activeSkyRenderer?.starRenderer?.uniforms || null;
        const planetRenderer = activeSkyRenderer?.planetRenderer || null;
        const planetAlphaAttr = planetRenderer?.geometry?.getAttribute?.("aAlpha") || null;
        const planetAlphaArray = planetAlphaAttr?.array || null;
        const planetBodySlots = Array.isArray(planetRenderer?.bodySlots) ? planetRenderer.bodySlots : [];
        const originalSunVisualState = sunRenderer?.getVisualState?.() || null;
        const constellationLinesEnabled = panelState?.composerConstellationLinesEnabled === true;

        const originalSkyMeshVisible = typeof skyMesh?.visible === "boolean"
            ? skyMesh.visible
            : null;
        const originalSkyOpacity = Number.isFinite(skyMaterial?.opacity)
            ? skyMaterial.opacity
            : null;
        const originalConstellationOpacity = Number.isFinite(constellationMaterial?.opacity)
            ? constellationMaterial.opacity
            : null;
        const originalConstellationVisible = typeof constellationMesh?.visible === "boolean"
            ? constellationMesh.visible
            : null;
        const originalSkyContainerVisible = typeof skyContainer?.visible === "boolean"
            ? skyContainer.visible
            : null;
        const originalStarContainerVisible = typeof starContainer?.visible === "boolean"
            ? starContainer.visible
            : null;
        const originalStarPhotometricScale = Number.isFinite(starUniforms?.uPhotometricScale?.value)
            ? starUniforms.uPhotometricScale.value
            : null;
        const originalStarSizeScale = Number.isFinite(starUniforms?.uStarSizeScale?.value)
            ? starUniforms.uStarSizeScale.value
            : null;
        const originalStarMinPointSize = Number.isFinite(starUniforms?.uMinPointSize?.value)
            ? starUniforms.uMinPointSize.value
            : null;
        const originalStarMaxPointSize = Number.isFinite(starUniforms?.uMaxPointSize?.value)
            ? starUniforms.uMaxPointSize.value
            : null;
        const originalStarMagnitudeLimit = Number.isFinite(starUniforms?.uMagnitudeLimit?.value)
            ? starUniforms.uMagnitudeLimit.value
            : null;
        const originalPlanetAlphas = planetAlphaArray && planetBodySlots.length > 0
            ? new Float32Array(planetAlphaArray)
            : null;
        const starMagnitudeLimit = this.THREE.MathUtils.clamp(
            Number(panelState?.composerStarMagnitudeLimit),
            COMPOSER_STAR_MAGNITUDE_MIN,
            COMPOSER_STAR_MAGNITUDE_MAX,
        );

        if (originalSkyOpacity != null) {
            skyMaterial.opacity = Math.min(originalSkyOpacity, profile.skyStarmapOpacityCap);
        }
        if (originalSkyMeshVisible != null) {
            skyMesh.visible = true;
        }
        if (originalConstellationOpacity != null) {
            constellationMaterial.opacity = Math.min(
                originalConstellationOpacity,
                constellationLinesEnabled
                    ? COMPOSER_CONSTELLATION_LINES_OPACITY_CAP
                    : profile.skyConstellationOpacityCap,
            );
        }
        if (originalConstellationVisible != null) {
            constellationMesh.visible = constellationLinesEnabled;
        }
        if (originalSkyContainerVisible != null) {
            skyContainer.visible = true;
        }
        if (originalStarContainerVisible != null) {
            starContainer.visible = true;
        }
        if (sunRenderer?.setVisualState) {
            sunRenderer.setVisualState(profile.sunVisualState);
            sunRenderer.updateAppearance?.();
        }
        if (starUniforms && Number.isFinite(starMagnitudeLimit)) {
            const lift = Math.max(0, starMagnitudeLimit - 3);
            const visibilityGain = Math.pow(2.512, lift * 0.7);
            if (originalStarPhotometricScale != null && starUniforms.uPhotometricScale) {
                starUniforms.uPhotometricScale.value = originalStarPhotometricScale * visibilityGain;
            }
            if (originalStarSizeScale != null && starUniforms.uStarSizeScale) {
                starUniforms.uStarSizeScale.value = originalStarSizeScale * (0.8 + (0.08 * starMagnitudeLimit));
            }
            if (originalStarMinPointSize != null && starUniforms.uMinPointSize) {
                starUniforms.uMinPointSize.value = Math.max(originalStarMinPointSize, 0.85 + (0.08 * starMagnitudeLimit));
            }
            if (originalStarMaxPointSize != null && starUniforms.uMaxPointSize) {
                starUniforms.uMaxPointSize.value = Math.max(originalStarMaxPointSize, 5.5 + (0.7 * starMagnitudeLimit));
            }
            if (starUniforms.uMagnitudeLimit) {
                starUniforms.uMagnitudeLimit.value = starMagnitudeLimit;
            }
        }
        if (originalPlanetAlphas && Number.isFinite(starMagnitudeLimit)) {
            const count = Math.min(originalPlanetAlphas.length, planetBodySlots.length);
            for (let i = 0; i < count; i += 1) {
                planetAlphaArray[i] = isComposerPlanetVisibleForMagnitudeLimit(planetBodySlots[i], starMagnitudeLimit)
                    ? originalPlanetAlphas[i]
                    : 0;
            }
            if (planetAlphaAttr) {
                planetAlphaAttr.needsUpdate = true;
            }
        }

        return () => {
            renderer.toneMappingExposure = originalExposure;
            if (originalSkyOpacity != null && skyMaterial) {
                skyMaterial.opacity = originalSkyOpacity;
            }
            if (originalSkyMeshVisible != null && skyMesh) {
                skyMesh.visible = originalSkyMeshVisible;
            }
            if (originalConstellationOpacity != null && constellationMaterial) {
                constellationMaterial.opacity = originalConstellationOpacity;
            }
            if (originalConstellationVisible != null && constellationMesh) {
                constellationMesh.visible = originalConstellationVisible;
            }
            if (originalSkyContainerVisible != null && skyContainer) {
                skyContainer.visible = originalSkyContainerVisible;
            }
            if (originalStarContainerVisible != null && starContainer) {
                starContainer.visible = originalStarContainerVisible;
            }
            if (sunRenderer?.setVisualState && originalSunVisualState) {
                sunRenderer.setVisualState(originalSunVisualState);
            }
            if (starUniforms) {
                if (originalStarPhotometricScale != null && starUniforms.uPhotometricScale) {
                    starUniforms.uPhotometricScale.value = originalStarPhotometricScale;
                }
                if (originalStarSizeScale != null && starUniforms.uStarSizeScale) {
                    starUniforms.uStarSizeScale.value = originalStarSizeScale;
                }
                if (originalStarMinPointSize != null && starUniforms.uMinPointSize) {
                    starUniforms.uMinPointSize.value = originalStarMinPointSize;
                }
                if (originalStarMaxPointSize != null && starUniforms.uMaxPointSize) {
                    starUniforms.uMaxPointSize.value = originalStarMaxPointSize;
                }
                if (originalStarMagnitudeLimit != null && starUniforms.uMagnitudeLimit) {
                    starUniforms.uMagnitudeLimit.value = originalStarMagnitudeLimit;
                }
            }
            if (originalPlanetAlphas && planetAlphaArray) {
                planetAlphaArray.set(originalPlanetAlphas);
                if (planetAlphaAttr) {
                    planetAlphaAttr.needsUpdate = true;
                }
            }
        };
    }

    clearPanelOverlay(panelState) {
        if (!panelState?.overlayCtx || !panelState?.overlayCanvas) {
            return;
        }
        panelState.overlayCtx.clearRect(0, 0, panelState.overlayCanvas.width, panelState.overlayCanvas.height);
    }

    renderComposerRaDecGridOverlay(panelState) {
        if (!panelState?.overlayCtx || !panelState?.overlayCanvas) {
            return;
        }
        if (panelState.composerRaDecGridEnabled !== true) {
            return;
        }
        const canvas = panelState.overlayCanvas;
        const ctx = panelState.overlayCtx;
        const width = canvas.width;
        const height = canvas.height;
        if (width <= 1 || height <= 1) {
            return;
        }
        const verticalFovDeg = Number.isFinite(panelState?.camera?.fov) ? panelState.camera.fov : 50;
        const resolveGridDensity = () => {
            let raStepDeg = COMPOSER_RA_DEC_GRID_RA_STEP_DEG;
            let decStepDeg = COMPOSER_RA_DEC_GRID_DEC_STEP_DEG;
            let sampleStepDeg = 3;
            let raLabelEvery = 1;
            let decLabelEvery = 1;
            let raLabelMargin = 22;
            let decLabelMargin = 20;

            if (verticalFovDeg <= 8) {
                raStepDeg = 15;
                decStepDeg = 5;
                sampleStepDeg = 1;
                raLabelEvery = 2;
                decLabelEvery = 2;
                raLabelMargin = 16;
                decLabelMargin = 16;
            } else if (verticalFovDeg <= 16) {
                raStepDeg = 30;
                decStepDeg = 10;
                sampleStepDeg = 2;
                raLabelEvery = 2;
                decLabelEvery = 2;
                raLabelMargin = 18;
                decLabelMargin = 18;
            } else if (verticalFovDeg <= 32) {
                raStepDeg = 45;
                decStepDeg = 10;
                sampleStepDeg = 2;
                raLabelEvery = 1;
                decLabelEvery = 2;
                raLabelMargin = 20;
                decLabelMargin = 18;
            } else if (verticalFovDeg <= 60) {
                raStepDeg = 60;
                decStepDeg = 15;
                sampleStepDeg = 3;
            } else if (verticalFovDeg <= 95) {
                raStepDeg = 90;
                decStepDeg = 30;
                sampleStepDeg = 4;
                raLabelMargin = 18;
                decLabelMargin = 18;
            } else {
                raStepDeg = 120;
                decStepDeg = 45;
                sampleStepDeg = 5;
                raLabelMargin = 14;
                decLabelMargin = 14;
            }

            // Keep at least ~4 lines visible in view for both RA/Dec.
            // We derive spacing from FoV coverage, then snap to "nice" angular steps.
            const aspect = Math.max(1e-6, Number.isFinite(panelState?.camera?.aspect) ? panelState.camera.aspect : (width / Math.max(1, height)));
            const verticalFovRad = this.THREE.MathUtils.degToRad(verticalFovDeg);
            const horizontalFovDeg = this.THREE.MathUtils.radToDeg(Math.atan(Math.tan(verticalFovRad * 0.5) * aspect) * 2);
            const minVisibleLines = 4;
            const maxSpacingFromCoverage = Math.max(1, verticalFovDeg / Math.max(1, minVisibleLines - 1));
            const maxSpacingFromCoverageRa = Math.max(1, horizontalFovDeg / Math.max(1, minVisibleLines - 1));
            const niceSteps = [120, 90, 60, 45, 30, 20, 15, 12, 10, 6, 5, 4, 3, 2, 1];
            const snapStep = (maxAllowedStep, minStep, fallbackStep) => {
                for (const step of niceSteps) {
                    if (step <= maxAllowedStep && step >= minStep) {
                        return step;
                    }
                }
                return fallbackStep;
            };
            const minDecStep = 3;
            const minRaStep = 5;
            const targetDecStep = snapStep(maxSpacingFromCoverage, minDecStep, minDecStep);
            const targetRaStep = snapStep(maxSpacingFromCoverageRa, minRaStep, minRaStep);

            decStepDeg = Math.max(minDecStep, Math.min(decStepDeg, targetDecStep));
            raStepDeg = Math.max(minRaStep, Math.min(raStepDeg, targetRaStep));

            // As line density increases, back off label density to prevent clutter.
            decLabelEvery = Math.max(1, Math.round(18 / Math.max(decStepDeg, 1)));
            raLabelEvery = Math.max(1, Math.round(24 / Math.max(raStepDeg, 1)));
            sampleStepDeg = Math.max(1, Math.min(sampleStepDeg, Math.max(1, Math.floor(Math.min(decStepDeg, raStepDeg) / 2))));

            return {
                raStepDeg,
                decStepDeg,
                sampleStepDeg,
                raLabelEvery,
                decLabelEvery,
                raLabelMargin,
                decLabelMargin,
            };
        };
        const gridDensity = resolveGridDensity();
        const occupiedLabelBoxes = [];

        panelState.camera.getWorldQuaternion(this.panelCameraWorldQuat);
        this.panelCameraWorldQuatInv.copy(this.panelCameraWorldQuat).invert();
        const tanHalfY = Math.tan(this.THREE.MathUtils.degToRad(panelState.camera.fov * 0.5));
        const tanHalfX = tanHalfY * Math.max(panelState.camera.aspect, 1e-6);

        const projectDirection = (x, y, z) => {
            this.tmpVectorA.set(x, y, z).applyQuaternion(this.panelCameraWorldQuatInv);
            const cz = this.tmpVectorA.z;
            if (cz <= 1e-4) {
                return null;
            }
            const ndcX = (this.tmpVectorA.x / cz) / Math.max(tanHalfX, 1e-9);
            const ndcY = (this.tmpVectorA.y / cz) / Math.max(tanHalfY, 1e-9);
            if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) {
                return null;
            }
            if (Math.abs(ndcX) > 1.35 || Math.abs(ndcY) > 1.35) {
                return null;
            }
            return {
                x: ((ndcX * 0.5) + 0.5) * width,
                y: (1 - ((ndcY * 0.5) + 0.5)) * height,
            };
        };

        const drawCurve = (samples, strokeStyle, lineWidth) => {
            let penDown = false;
            const visiblePoints = [];
            ctx.beginPath();
            for (const sample of samples) {
                const projected = projectDirection(sample.x, sample.y, sample.z);
                if (!projected) {
                    penDown = false;
                    continue;
                }
                visiblePoints.push(projected);
                if (!penDown) {
                    ctx.moveTo(projected.x, projected.y);
                    penDown = true;
                } else {
                    ctx.lineTo(projected.x, projected.y);
                }
            }
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            return visiblePoints;
        };

        const drawGridLabel = (text, point, {
            offsetX = 4,
            offsetY = -4,
            align = "left",
            relaxed = false,
            zone = null,
            capture = null,
            key = "",
        } = {}) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                return false;
            }
            const font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            ctx.save();
            ctx.font = font;
            const textWidth = ctx.measureText(text).width;
            ctx.restore();
            const textHeight = 11;
            const paddingX = 4;
            const paddingY = 3;

            const offsets = [
                { dx: offsetX, dy: offsetY, textAlign: align },
                { dx: offsetX + 12, dy: offsetY - 10, textAlign: align },
                { dx: offsetX - 12, dy: offsetY + 10, textAlign: align },
                { dx: offsetX + 8, dy: offsetY + 12, textAlign: align },
                { dx: offsetX - 14, dy: offsetY - 12, textAlign: "right" },
                { dx: offsetX + 14, dy: offsetY + 14, textAlign: "left" },
                { dx: offsetX, dy: offsetY - 16, textAlign: "center" },
                { dx: offsetX, dy: offsetY + 16, textAlign: "center" },
            ];

            const computeBox = (x, y, textAlign) => {
                let left;
                let right;
                if (textAlign === "right") {
                    left = x - textWidth - paddingX;
                    right = x + paddingX;
                } else if (textAlign === "center") {
                    left = x - (textWidth * 0.5) - paddingX;
                    right = x + (textWidth * 0.5) + paddingX;
                } else {
                    left = x - paddingX;
                    right = x + textWidth + paddingX;
                }
                const top = y - (textHeight * 0.5) - paddingY;
                const bottom = y + (textHeight * 0.5) + paddingY;
                return { left, right, top, bottom };
            };

            const intersects = (a, b) => !(
                a.right < b.left ||
                a.left > b.right ||
                a.bottom < b.top ||
                a.top > b.bottom
            );

            for (const candidate of offsets) {
                const x = Math.round((point.x + candidate.dx) * 2) / 2;
                const y = Math.round((point.y + candidate.dy) * 2) / 2;
                const box = computeBox(x, y, candidate.textAlign);
                const allowOverflowPx = relaxed ? 8 : 0;
                if (box.left < (6 - allowOverflowPx) || box.right > ((width - 6) + allowOverflowPx) || box.top < (8 - allowOverflowPx) || box.bottom > ((height - 6) + allowOverflowPx)) {
                    continue;
                }
                if (zone === "top-bottom" && !relaxed) {
                    const bandTop = height * 0.36;
                    const bandBottom = height * 0.64;
                    if (!(box.bottom <= bandTop || box.top >= bandBottom)) {
                        continue;
                    }
                }
                if (zone === "left-right" && !relaxed) {
                    const bandLeft = width * 0.36;
                    const bandRight = width * 0.64;
                    if (!(box.right <= bandLeft || box.left >= bandRight)) {
                        continue;
                    }
                }
                if (occupiedLabelBoxes.some((existing) => intersects(existing, box))) {
                    continue;
                }
                ctx.save();
                ctx.font = font;
                ctx.textAlign = candidate.textAlign;
                ctx.textBaseline = "middle";
                ctx.lineJoin = "round";
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = "rgba(7, 14, 24, 0.7)";
                ctx.fillStyle = "rgba(180, 194, 214, 0.62)";
                ctx.strokeText(text, x, y);
                ctx.fillText(text, x, y);
                ctx.restore();
                occupiedLabelBoxes.push(box);
                if (capture && typeof capture.push === "function") {
                    capture.push({
                        key,
                        text,
                        x,
                        y,
                        align: candidate.textAlign,
                    });
                }
                return true;
            }

            return false;
        };

        const getFovReadout = () => {
            const verticalFovDeg = Number.isFinite(panelState?.camera?.fov) ? panelState.camera.fov : Number.NaN;
            if (!Number.isFinite(verticalFovDeg)) {
                return null;
            }
            const aspect = Math.max(1e-6, Number.isFinite(panelState?.camera?.aspect) ? panelState.camera.aspect : (width / Math.max(1, height)));
            const verticalFovRad = this.THREE.MathUtils.degToRad(verticalFovDeg);
            const horizontalFovRad = Math.atan(Math.tan(verticalFovRad * 0.5) * aspect) * 2;
            const horizontalFovDeg = this.THREE.MathUtils.radToDeg(horizontalFovRad);

            const fovText = `FoV H ${horizontalFovDeg.toFixed(1)}°  V ${verticalFovDeg.toFixed(1)}°`;
            return { fovText, x: 12, y: 16 };
        };

        const reserveFovReadoutBox = () => {
            const fov = getFovReadout();
            if (!fov) {
                return;
            }
            ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            const textWidth = ctx.measureText(fov.fovText).width;
            occupiedLabelBoxes.push({
                left: fov.x - 4,
                right: fov.x + textWidth + 4,
                top: fov.y - 9,
                bottom: fov.y + 9,
            });
        };

        const drawFovReadout = () => {
            const fov = getFovReadout();
            if (!fov) {
                return;
            }
            ctx.save();
            ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.lineJoin = "round";
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "rgba(7, 14, 24, 0.72)";
            ctx.fillStyle = "rgba(180, 194, 214, 0.66)";
            ctx.strokeText(fov.fovText, fov.x, fov.y);
            ctx.fillText(fov.fovText, fov.x, fov.y);
            ctx.restore();
        };

        const drawPlacedLabel = (placedLabel) => {
            if (!placedLabel || !Number.isFinite(placedLabel.x) || !Number.isFinite(placedLabel.y)) {
                return;
            }
            ctx.save();
            ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            ctx.textAlign = placedLabel.align || "left";
            ctx.textBaseline = "middle";
            ctx.lineJoin = "round";
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "rgba(7, 14, 24, 0.7)";
            ctx.fillStyle = "rgba(180, 194, 214, 0.62)";
            ctx.strokeText(placedLabel.text, placedLabel.x, placedLabel.y);
            ctx.fillText(placedLabel.text, placedLabel.x, placedLabel.y);
            ctx.restore();
        };

        const labelCache = panelState.composerGridLabelCache || (panelState.composerGridLabelCache = Object.create(null));
        const nowMs = performance.now();
        const inLabelBounds = (point, marginPx) => (
            !!point &&
            point.x >= marginPx &&
            point.x <= (width - marginPx) &&
            point.y >= marginPx &&
            point.y <= (height - marginPx)
        );
        const chooseStableLabelPoint = (key, directionCandidates, {
            marginPx = 18,
            holdMs = 260,
        } = {}) => {
            if (!Array.isArray(directionCandidates) || directionCandidates.length === 0) {
                return null;
            }
            const prev = labelCache[key] || null;
            const order = [];
            if (Number.isInteger(prev?.index) && prev.index >= 0 && prev.index < directionCandidates.length) {
                order.push(prev.index);
            }
            for (let i = 0; i < directionCandidates.length; i += 1) {
                if (!order.includes(i)) {
                    order.push(i);
                }
            }

            let relaxedCandidate = null;
            for (const index of order) {
                const dir = directionCandidates[index];
                const projected = projectDirection(dir.x, dir.y, dir.z);
                if (!projected) {
                    continue;
                }
                if (inLabelBounds(projected, marginPx)) {
                    labelCache[key] = { index, point: projected, ts: nowMs };
                    return projected;
                }
                if (!relaxedCandidate) {
                    relaxedCandidate = { index, point: projected };
                }
            }

            if (prev?.point && Number.isFinite(prev.ts) && (nowMs - prev.ts) <= holdMs) {
                return prev.point;
            }
            if (relaxedCandidate) {
                labelCache[key] = { index: relaxedCandidate.index, point: relaxedCandidate.point, ts: nowMs };
                return relaxedCandidate.point;
            }
            return null;
        };

        const buildDirection = (raDeg, decDeg) => {
            const ra = this.THREE.MathUtils.degToRad(raDeg);
            const dec = this.THREE.MathUtils.degToRad(decDeg);
            const cosDec = Math.cos(dec);
            return {
                x: cosDec * Math.cos(ra),
                y: cosDec * Math.sin(ra),
                z: Math.sin(dec),
            };
        };

        const baseLineColor = "rgba(146, 186, 244, 0.34)";
        const accentLineColor = "rgba(188, 218, 255, 0.52)";
        const decDescriptors = [];
        const raDescriptors = [];
        let visibleDecLines = 0;
        let visibleRaLines = 0;
        reserveFovReadoutBox();

        // Dec lines (parallels).
        for (let dec = -75; dec <= 75; dec += gridDensity.decStepDeg) {
            const samples = [];
            for (let ra = 0; ra <= 360; ra += gridDensity.sampleStepDeg) {
                samples.push(buildDirection(ra, dec));
            }
            const isEquator = dec === 0;
            const visiblePoints = drawCurve(samples, isEquator ? accentLineColor : baseLineColor, isEquator ? 1.1 : 0.8);
            const onScreenVisiblePoints = visiblePoints.filter((p) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
            if (onScreenVisiblePoints.length >= 2) {
                visibleDecLines += 1;
            }
            const decSign = dec > 0 ? "+" : "";
            const text = `Dec ${decSign}${dec}°`;
            if (onScreenVisiblePoints.length > 0) {
                let minX = onScreenVisiblePoints[0];
                let maxX = onScreenVisiblePoints[0];
                for (const screenPoint of onScreenVisiblePoints) {
                    if (screenPoint.x < minX.x) {
                        minX = screenPoint;
                    }
                    if (screenPoint.x > maxX.x) {
                        maxX = screenPoint;
                    }
                }
                decDescriptors.push({
                    key: `dec:${dec}`,
                    text,
                    leftPoint: minX,
                    rightPoint: maxX,
                    points: onScreenVisiblePoints,
                });
            }
        }

        // RA lines (meridians).
        for (let ra = 0; ra < 360; ra += gridDensity.raStepDeg) {
            const samples = [];
            for (let dec = -87; dec <= 87; dec += gridDensity.sampleStepDeg) {
                samples.push(buildDirection(ra, dec));
            }
            const isPrime = ra === 0;
            const visiblePoints = drawCurve(samples, isPrime ? accentLineColor : baseLineColor, isPrime ? 1.1 : 0.8);
            const onScreenVisiblePoints = visiblePoints.filter((p) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
            if (onScreenVisiblePoints.length >= 2) {
                visibleRaLines += 1;
            }
            const raHours = Math.round((ra % 360) / 15);
            const text = `RA ${raHours}h`;
            if (onScreenVisiblePoints.length > 0) {
                let minY = onScreenVisiblePoints[0];
                let maxY = onScreenVisiblePoints[0];
                for (const screenPoint of onScreenVisiblePoints) {
                    if (screenPoint.y < minY.y) {
                        minY = screenPoint;
                    }
                    if (screenPoint.y > maxY.y) {
                        maxY = screenPoint;
                    }
                }
                raDescriptors.push({
                    key: `ra:${ra}`,
                    text,
                    topPoint: minY,
                    bottomPoint: maxY,
                    points: onScreenVisiblePoints,
                });
            }
        }

        const pickSpread = (items, targetCount) => {
            if (!Array.isArray(items) || items.length === 0 || targetCount <= 0) {
                return [];
            }
            if (items.length <= targetCount) {
                return items.slice();
            }
            if (targetCount === 1) {
                return [items[Math.floor(items.length * 0.5)]];
            }
            const picked = [];
            const used = new Set();
            for (let i = 0; i < targetCount; i += 1) {
                const rawIndex = Math.round((i * (items.length - 1)) / (targetCount - 1));
                const boundedIndex = Math.max(0, Math.min(items.length - 1, rawIndex));
                if (used.has(boundedIndex)) {
                    continue;
                }
                used.add(boundedIndex);
                picked.push(items[boundedIndex]);
            }
            return picked;
        };

        const composerGridPlacementState = panelState.composerGridPlacementState || (panelState.composerGridPlacementState = {
            ra: { activeKeys: [], anchors: Object.create(null) },
            dec: { activeKeys: [], anchors: Object.create(null) },
        });
        const composerGridTemporalState = panelState.composerGridTemporalState || (panelState.composerGridTemporalState = {
            hasPose: false,
            quatX: 0,
            quatY: 0,
            quatZ: 0,
            quatW: 1,
            fov: Number.NaN,
            aspect: Number.NaN,
            cachedPlacedRa: [],
            cachedPlacedDec: [],
        });
        const currentQuat = panelState.camera.quaternion;
        const quantize = (value, step) => Math.round(value / step) * step;
        const pose = {
            quatX: quantize(currentQuat.x, 1e-4),
            quatY: quantize(currentQuat.y, 1e-4),
            quatZ: quantize(currentQuat.z, 1e-4),
            quatW: quantize(currentQuat.w, 1e-4),
            fov: quantize(panelState.camera.fov, 0.05),
            aspect: quantize(panelState.camera.aspect, 1e-3),
        };
        const shouldReusePlacement =
            composerGridTemporalState.hasPose === true &&
            pose.quatX === composerGridTemporalState.quatX &&
            pose.quatY === composerGridTemporalState.quatY &&
            pose.quatZ === composerGridTemporalState.quatZ &&
            pose.quatW === composerGridTemporalState.quatW &&
            pose.fov === composerGridTemporalState.fov &&
            pose.aspect === composerGridTemporalState.aspect &&
            Array.isArray(composerGridTemporalState.cachedPlacedRa) &&
            Array.isArray(composerGridTemporalState.cachedPlacedDec) &&
            (composerGridTemporalState.cachedPlacedRa.length > 0 || composerGridTemporalState.cachedPlacedDec.length > 0);
        const placedLabelsRa = [];
        const placedLabelsDec = [];

        const placeDeterministicLabels = (descriptors, kind) => {
            if (!Array.isArray(descriptors) || descriptors.length === 0) {
                return 0;
            }
            const familyState = composerGridPlacementState[kind] || (composerGridPlacementState[kind] = {
                activeKeys: [],
                anchors: Object.create(null),
            });
            const descriptorByKey = new Map(descriptors.map((descriptor) => [descriptor.key, descriptor]));
            const targetCount = descriptors.length >= 4 ? 4 : descriptors.length;
            const keptKeys = familyState.activeKeys.filter((key) => descriptorByKey.has(key));
            const keptDescriptors = keptKeys.map((key) => descriptorByKey.get(key)).filter(Boolean);
            const remainingDescriptors = descriptors.filter((descriptor) => !keptKeys.includes(descriptor.key));
            const fillCount = Math.max(0, targetCount - keptDescriptors.length);
            const spreadFill = pickSpread(remainingDescriptors, fillCount);
            const selected = [...keptDescriptors, ...spreadFill];
            const selectedKeySet = new Set(selected.map((descriptor) => descriptor.key));
            const backups = descriptors.filter((descriptor) => !selectedKeySet.has(descriptor.key));
            let placed = 0;

            const buildCandidates = (descriptor) => {
                if (kind === "ra") {
                    const topDistance = Number.isFinite(descriptor?.topPoint?.y) ? descriptor.topPoint.y : Infinity;
                    const bottomDistance = Number.isFinite(descriptor?.bottomPoint?.y) ? (height - descriptor.bottomPoint.y) : Infinity;
                    const preferTop = topDistance <= bottomDistance;
                    return preferTop
                        ? [
                            { id: "top-center", point: descriptor.topPoint, offsetX: 0, offsetY: 12, align: "center" },
                            { id: "bottom-center", point: descriptor.bottomPoint, offsetX: 0, offsetY: -12, align: "center" },
                            { id: "top-left", point: descriptor.topPoint, offsetX: 10, offsetY: 12, align: "left" },
                            { id: "bottom-right", point: descriptor.bottomPoint, offsetX: -10, offsetY: -12, align: "right" },
                        ]
                        : [
                            { id: "bottom-center", point: descriptor.bottomPoint, offsetX: 0, offsetY: -12, align: "center" },
                            { id: "top-center", point: descriptor.topPoint, offsetX: 0, offsetY: 12, align: "center" },
                            { id: "bottom-left", point: descriptor.bottomPoint, offsetX: 10, offsetY: -12, align: "left" },
                            { id: "top-right", point: descriptor.topPoint, offsetX: -10, offsetY: 12, align: "right" },
                        ];
                }
                const leftDistance = Number.isFinite(descriptor?.leftPoint?.x) ? descriptor.leftPoint.x : Infinity;
                const rightDistance = Number.isFinite(descriptor?.rightPoint?.x) ? (width - descriptor.rightPoint.x) : Infinity;
                const preferLeft = leftDistance <= rightDistance;
                return preferLeft
                    ? [
                        { id: "left-high", point: descriptor.leftPoint, offsetX: 8, offsetY: -6, align: "left" },
                        { id: "right-high", point: descriptor.rightPoint, offsetX: -8, offsetY: -6, align: "right" },
                        { id: "left-low", point: descriptor.leftPoint, offsetX: 8, offsetY: 10, align: "left" },
                        { id: "right-low", point: descriptor.rightPoint, offsetX: -8, offsetY: 10, align: "right" },
                    ]
                    : [
                        { id: "right-high", point: descriptor.rightPoint, offsetX: -8, offsetY: -6, align: "right" },
                        { id: "left-high", point: descriptor.leftPoint, offsetX: 8, offsetY: -6, align: "left" },
                        { id: "right-low", point: descriptor.rightPoint, offsetX: -8, offsetY: 10, align: "right" },
                        { id: "left-low", point: descriptor.leftPoint, offsetX: 8, offsetY: 10, align: "left" },
                    ];
            };

            const tryPlace = (descriptor) => {
                if (!descriptor) {
                    return false;
                }
                const candidates = buildCandidates(descriptor);
                const previousAnchorId = familyState.anchors[descriptor.key];
                if (typeof previousAnchorId === "string" && previousAnchorId.length > 0) {
                    candidates.sort((a, b) => {
                        if (a.id === previousAnchorId) {
                            return -1;
                        }
                        if (b.id === previousAnchorId) {
                            return 1;
                        }
                        return 0;
                    });
                }
                for (const candidate of candidates) {
                    if (drawGridLabel(descriptor.text, candidate.point, {
                        offsetX: candidate.offsetX,
                        offsetY: candidate.offsetY,
                        align: candidate.align,
                        relaxed: false,
                        capture: kind === "ra" ? placedLabelsRa : placedLabelsDec,
                        key: descriptor.key,
                    })) {
                        familyState.anchors[descriptor.key] = candidate.id;
                        return true;
                    }
                }
                return false;
            };

            for (const descriptor of selected) {
                if (tryPlace(descriptor)) {
                    placed += 1;
                }
            }
            if (placed < targetCount) {
                for (const descriptor of backups) {
                    if (tryPlace(descriptor)) {
                        placed += 1;
                        if (placed >= targetCount) {
                            break;
                        }
                    }
                }
            }
            familyState.activeKeys = selected.map((descriptor) => descriptor.key);
            const visibleKeys = new Set(descriptors.map((descriptor) => descriptor.key));
            for (const anchorKey of Object.keys(familyState.anchors)) {
                if (!visibleKeys.has(anchorKey)) {
                    delete familyState.anchors[anchorKey];
                }
            }
            return placed;
        };

        if (shouldReusePlacement) {
            for (const placed of composerGridTemporalState.cachedPlacedRa) {
                drawPlacedLabel(placed);
            }
            for (const placed of composerGridTemporalState.cachedPlacedDec) {
                drawPlacedLabel(placed);
            }
        } else {
            placeDeterministicLabels(raDescriptors, "ra");
            placeDeterministicLabels(decDescriptors, "dec");
            composerGridTemporalState.cachedPlacedRa = placedLabelsRa.map((label) => ({ ...label }));
            composerGridTemporalState.cachedPlacedDec = placedLabelsDec.map((label) => ({ ...label }));
            composerGridTemporalState.quatX = pose.quatX;
            composerGridTemporalState.quatY = pose.quatY;
            composerGridTemporalState.quatZ = pose.quatZ;
            composerGridTemporalState.quatW = pose.quatW;
            composerGridTemporalState.fov = pose.fov;
            composerGridTemporalState.aspect = pose.aspect;
            composerGridTemporalState.hasPose = true;
        }
        // Safety net: if extreme framing still gives sparse coverage, draw denser center-aligned helpers.
        if (visibleDecLines < 4 || visibleRaLines < 4) {
            const denserDecStep = Math.max(3, Math.min(gridDensity.decStepDeg, 5));
            const denserRaStep = Math.max(5, Math.min(gridDensity.raStepDeg, 15));
            if (visibleDecLines < 4) {
                for (let dec = -45; dec <= 45; dec += denserDecStep) {
                    const samples = [];
                    for (let ra = 0; ra <= 360; ra += 2) {
                        samples.push(buildDirection(ra, dec));
                    }
                    drawCurve(samples, baseLineColor, 0.7);
                }
            }
            if (visibleRaLines < 4) {
                for (let ra = 0; ra < 360; ra += denserRaStep) {
                    const samples = [];
                    for (let dec = -75; dec <= 75; dec += 2) {
                        samples.push(buildDirection(ra, dec));
                    }
                    drawCurve(samples, baseLineColor, 0.7);
                }
            }
        }

        drawFovReadout();
    }

    renderComposerSkyLabelOverlay(
        panelState,
        {
            scene = null,
            skyContainer = null,
            skyRenderer = null,
            earthWorld = null,
            moonWorld = null,
            earthRadius = null,
            moonRadius = null,
        } = {},
    ) {
        if (!panelState?.overlayCtx || !panelState?.overlayCanvas) {
            return;
        }
        const skyLabelsEnabled = panelState.composerSkyLabelsEnabled === true;
        const constellationLabelsEnabled = panelState.composerConstellationLabelsEnabled === true;
        if (!skyLabelsEnabled && !constellationLabelsEnabled) {
            return;
        }

        const canvas = panelState.overlayCanvas;
        const ctx = panelState.overlayCtx;
        const width = canvas.width;
        const height = canvas.height;
        if (width <= 1 || height <= 1) {
            return;
        }

        const resolvedSkyRenderer = skyRenderer || scene?.skyRenderer || null;
        const activeSkyContainer = skyContainer || scene?.skyContainer || resolvedSkyRenderer?.container || null;
        const planetRenderer = resolvedSkyRenderer?.planetRenderer || null;
        const skyRadius = Number.isFinite(Number(resolvedSkyRenderer?.radius))
            ? Number(resolvedSkyRenderer.radius)
            : 1300000;
        if (!activeSkyContainer?.getWorldQuaternion) {
            return;
        }

        const occupied = [];
        const edge = COMPOSER_SKY_LABEL_EDGE_MARGIN_PX;
        const labelOccluders = resolveComposerSkyLabelOccluders({
            THREE: this.THREE,
            camera: panelState.camera,
            width,
            height,
            bodies: [
                { bodyId: "earth", centerWorld: earthWorld || this.earthWorld, radius: earthRadius },
                { bodyId: "moon", centerWorld: moonWorld || this.moonWorld, radius: moonRadius },
            ],
        });
        const isLabelOccluded = (point) => isComposerSkyLabelPointOccluded(point, labelOccluders);
        activeSkyContainer.getWorldQuaternion(this.tmpQuatA);
        const projectSkyPointFromLocal = (x, y, z) => {
            this.tmpVectorB.set(x, y, z);
            if (activeSkyContainer?.matrixWorld) {
                this.tmpVectorB.applyMatrix4(activeSkyContainer.matrixWorld);
            } else {
                this.tmpVectorB.applyQuaternion(this.tmpQuatA);
            }
            this.tmpVectorC.copy(this.tmpVectorB).project(panelState.camera);
            if (
                !Number.isFinite(this.tmpVectorC.x) ||
                !Number.isFinite(this.tmpVectorC.y) ||
                !Number.isFinite(this.tmpVectorC.z)
            ) {
                return null;
            }
            if (this.tmpVectorC.z < -1 || this.tmpVectorC.z > 1) {
                return null;
            }
            return {
                x: ((this.tmpVectorC.x * 0.5) + 0.5) * width,
                y: (1 - ((this.tmpVectorC.y * 0.5) + 0.5)) * height,
            };
        };

        const intersects = (a, b) => !(
            a.right < b.left ||
            a.left > b.right ||
            a.bottom < b.top ||
            a.top > b.bottom
        );

        const drawLabel = (text, point, style = "star") => {
            if (!text || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                return false;
            }
            const font = style === "constellation"
                ? "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
                : "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
            ctx.save();
            ctx.font = font;
            const textWidth = ctx.measureText(text).width;
            ctx.restore();

            const textHeight = style === "constellation" ? 12 : 11;
            const padX = 4;
            const padY = 3;
            const preferLeft = point.x < (width * 0.5);
            const preferTop = point.y < (height * 0.5);
            const baseOffsetX = preferLeft ? 8 : -8;
            const baseOffsetY = preferTop ? -8 : 10;
            const baseAlign = preferLeft ? "left" : "right";
            const candidates = [
                { dx: baseOffsetX, dy: baseOffsetY, align: baseAlign },
                { dx: baseOffsetX, dy: -baseOffsetY, align: baseAlign },
                { dx: 0, dy: preferTop ? -12 : 12, align: "center" },
                { dx: -baseOffsetX, dy: baseOffsetY, align: preferLeft ? "right" : "left" },
                { dx: baseOffsetX + 10, dy: baseOffsetY + 8, align: baseAlign },
                { dx: baseOffsetX - 10, dy: baseOffsetY - 8, align: baseAlign },
            ];

            const computeBox = (x, y, align) => {
                let left;
                let right;
                if (align === "right") {
                    left = x - textWidth - padX;
                    right = x + padX;
                } else if (align === "center") {
                    left = x - (textWidth * 0.5) - padX;
                    right = x + (textWidth * 0.5) + padX;
                } else {
                    left = x - padX;
                    right = x + textWidth + padX;
                }
                return {
                    left,
                    right,
                    top: y - (textHeight * 0.5) - padY,
                    bottom: y + (textHeight * 0.5) + padY,
                };
            };

            for (const candidate of candidates) {
                const x = Math.round((point.x + candidate.dx) * 2) / 2;
                const y = Math.round((point.y + candidate.dy) * 2) / 2;
                const box = computeBox(x, y, candidate.align);
                if (
                    box.left < edge ||
                    box.right > (width - edge) ||
                    box.top < edge ||
                    box.bottom > (height - edge)
                ) {
                    continue;
                }
                if (occupied.some((existing) => intersects(existing, box))) {
                    continue;
                }

                ctx.save();
                ctx.font = font;
                ctx.textAlign = candidate.align;
                ctx.textBaseline = "middle";
                ctx.lineJoin = "round";
                ctx.lineWidth = style === "constellation" ? 3.2 : 2.4;
                ctx.strokeStyle = style === "constellation"
                    ? "rgba(3, 9, 18, 0.78)"
                    : "rgba(7, 14, 24, 0.74)";
                ctx.fillStyle = style === "planet"
                    ? "rgba(226, 238, 255, 0.92)"
                    : style === "constellation"
                        ? "rgba(143, 183, 238, 0.66)"
                        : "rgba(205, 220, 242, 0.86)";
                ctx.strokeText(text, x, y);
                ctx.fillText(text, x, y);
                ctx.restore();
                occupied.push(box);
                return true;
            }
            return false;
        };

        const drawConstellationLabels = () => {
            if (!constellationLabelsEnabled) {
                return;
            }
            for (const label of COMPOSER_CONSTELLATION_LABELS) {
                const raRad = this.THREE.MathUtils.degToRad(label.raDeg);
                const decRad = this.THREE.MathUtils.degToRad(label.decDeg);
                const cosDec = Math.cos(decRad);
                const point = projectSkyPointFromLocal(
                    cosDec * Math.cos(raRad) * skyRadius,
                    -cosDec * Math.sin(raRad) * skyRadius,
                    Math.sin(decRad) * skyRadius,
                );
                if (!point) {
                    continue;
                }
                if (
                    point.x < 0 ||
                    point.x > width ||
                    point.y < 0 ||
                    point.y > height
                ) {
                    continue;
                }
                if (isLabelOccluded(point)) {
                    continue;
                }
                drawLabel(label.name, point, "constellation");
            }
        };

        if (!skyLabelsEnabled) {
            drawConstellationLabels();
            return;
        }

        const objectLabelCandidates = [];
        const planetPositionAttr = planetRenderer?.geometry?.getAttribute?.("position") || null;
        const planetAlphaAttr = planetRenderer?.geometry?.getAttribute?.("aAlpha") || null;
        const planetBodySlots = Array.isArray(planetRenderer?.bodySlots) ? planetRenderer.bodySlots : [];
        const planetPositionArray = planetPositionAttr?.array || null;
        const planetAlphaArray = planetAlphaAttr?.array || null;
        if (planetPositionArray && planetAlphaArray && planetBodySlots.length > 0) {
            const planetCount = Math.min(
                planetBodySlots.length,
                planetPositionAttr.count || 0,
                planetAlphaAttr.count || 0,
            );
            for (let i = 0; i < planetCount; i += 1) {
                const label = String(planetBodySlots[i] || "").trim();
                if (!label) {
                    continue;
                }
                // In Flyby panel these are already represented by foreground bodies
                // and can be visually misleading when treated as sky markers.
                if (label === "Moon" || label === "Sun") {
                    continue;
                }
                const alpha = Number(planetAlphaArray[i]);
                if (!Number.isFinite(alpha) || alpha <= 0.001) {
                    continue;
                }
                if (!isComposerPlanetVisibleForMagnitudeLimit(label, panelState.composerStarMagnitudeLimit)) {
                    continue;
                }
                const idx3 = i * 3;
                const point = projectSkyPointFromLocal(
                    Number(planetPositionArray[idx3]),
                    Number(planetPositionArray[idx3 + 1]),
                    Number(planetPositionArray[idx3 + 2]),
                );
                if (!point) {
                    continue;
                }
                if (isLabelOccluded(point)) {
                    continue;
                }
                const magnitude = COMPOSER_PLANET_MAGNITUDE_BY_BODY[label];
                objectLabelCandidates.push({
                    text: label,
                    magnitude: Number.isFinite(magnitude) ? magnitude : 99,
                    point,
                    style: "planet",
                });
            }
        }

        const brightStarDescriptors = this.resolveComposerBrightStarLabelDescriptors(panelState.composerStarMagnitudeLimit);
        if (brightStarDescriptors.length > 0) {
            for (const descriptor of brightStarDescriptors) {
                const localDirection = descriptor?.localDirection;
                if (!localDirection) {
                    continue;
                }
                const point = projectSkyPointFromLocal(
                    Number(localDirection.x) * skyRadius,
                    Number(localDirection.y) * skyRadius,
                    Number(localDirection.z) * skyRadius,
                );
                if (!point) {
                    continue;
                }
                if (
                    point.x < 0 ||
                    point.x > width ||
                    point.y < 0 ||
                    point.y > height
                ) {
                    continue;
                }
                if (isLabelOccluded(point)) {
                    continue;
                }
                objectLabelCandidates.push({
                    ...descriptor,
                    point,
                    style: "star",
                });
            }
        }

        if (objectLabelCandidates.length > 0) {
            const targetObjectLabelCount = Math.min(
                objectLabelCandidates.length,
                COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT,
                Math.max(1, Math.ceil(objectLabelCandidates.length * COMPOSER_SKY_LABEL_VISIBLE_FRACTION)),
            );
            const sortedObjectLabels = selectSkyLabelCandidates(objectLabelCandidates, {
                visibleFraction: 1,
                maxCount: objectLabelCandidates.length,
            });
            let placedObjectLabels = 0;
            for (const descriptor of sortedObjectLabels) {
                if (drawLabel(descriptor.text, descriptor.point, descriptor.style || "star")) {
                    placedObjectLabels += 1;
                    if (placedObjectLabels >= targetObjectLabelCount) {
                        break;
                    }
                }
            }
        }

        drawConstellationLabels();
    }

    renderMoonFarSideOverlay(panelState, { distanceToTarget, targetRadius, earthDirectionWorld }) {
        if (!panelState?.overlayCtx || !panelState?.overlayCanvas) {
            return;
        }
        const nowMs = performance.now();
        const shouldRefresh = panelState.overlayDirty || (nowMs - panelState.lastOverlayUpdateMs) >= 90;
        if (!shouldRefresh) {
            return;
        }
        panelState.lastOverlayUpdateMs = nowMs;
        panelState.overlayDirty = false;

        const canvas = panelState.overlayCanvas;
        const ctx = panelState.overlayCtx;
        const width = canvas.width;
        const height = canvas.height;
        if (width <= 1 || height <= 1) {
            return;
        }
        ctx.clearRect(0, 0, width, height);

        if (!panelState.farSideTintEnabled) {
            return;
        }
        if (!Number.isFinite(distanceToTarget) || !Number.isFinite(targetRadius) || targetRadius <= 0) {
            return;
        }

        const ratio = this.THREE.MathUtils.clamp(targetRadius / Math.max(distanceToTarget, targetRadius + 1e-9), 0, 0.999999);
        const angularRadius = Math.asin(ratio);
        const vFov = this.THREE.MathUtils.degToRad(panelState.camera.fov);
        const radiusPx = (Math.tan(angularRadius) / Math.max(Math.tan(vFov * 0.5), 1e-9)) * (height * 0.5);
        if (!Number.isFinite(radiusPx) || radiusPx < 2) {
            return;
        }

        panelState.camera.getWorldQuaternion(this.panelCameraWorldQuat);
        this.panelCameraWorldQuatInv.copy(this.panelCameraWorldQuat).invert();
        this.earthDirInCamera.copy(earthDirectionWorld).applyQuaternion(this.panelCameraWorldQuatInv);
        const earthDirLen = this.earthDirInCamera.length();
        if (!Number.isFinite(earthDirLen) || earthDirLen <= 1e-9) {
            return;
        }
        this.earthDirInCamera.multiplyScalar(1 / earthDirLen);

        const ex = this.earthDirInCamera.x;
        const ey = this.earthDirInCamera.y;
        const ez = this.earthDirInCamera.z;
        const cx = width * 0.5;
        const cy = height * 0.5;
        const left = Math.max(0, Math.floor(cx - radiusPx - 1));
        const top = Math.max(0, Math.floor(cy - radiusPx - 1));
        const right = Math.min(width - 1, Math.ceil(cx + radiusPx + 1));
        const bottom = Math.min(height - 1, Math.ceil(cy + radiusPx + 1));
        const w = right - left + 1;
        const h = bottom - top + 1;
        if (w <= 0 || h <= 0) {
            return;
        }

        const img = ctx.createImageData(w, h);
        const data = img.data;
        const baseR = 124;
        const baseG = 84;
        const baseB = 224;
        // Keep far-side tint readable but highly transparent (~80% transparent).
        const baseAlpha = 52;
        const edgeR = 193;
        const edgeG = 170;
        const edgeB = 255;
        const edgeAlpha = 108;
        const terminatorBand = 0.06;
        const limbBand = 0.035;

        let idx = 0;
        for (let py = top; py <= bottom; py += 1) {
            const ny = (cy - (py + 0.5)) / radiusPx;
            for (let px = left; px <= right; px += 1) {
                const nx = ((px + 0.5) - cx) / radiusPx;
                const rr = nx * nx + ny * ny;
                if (rr <= 1) {
                    const nz = Math.sqrt(Math.max(0, 1 - rr));
                    const dot = nx * ex + ny * ey + nz * ez;
                    if (dot < 0) {
                        const intensity = Math.min(1, Math.max(0.2, -dot * 1.3));
                        const limbFade = 0.6 + nz * 0.4;
                        let r = baseR;
                        let g = baseG;
                        let b = baseB;
                        let a = Math.round(baseAlpha * intensity * limbFade);

                        // Crisp glass-like edge at the far/near divider.
                        const absDot = Math.abs(dot);
                        if (absDot < terminatorBand) {
                            const edgeMix = 1 - (absDot / terminatorBand);
                            r = Math.round(baseR * (1 - edgeMix) + edgeR * edgeMix);
                            g = Math.round(baseG * (1 - edgeMix) + edgeG * edgeMix);
                            b = Math.round(baseB * (1 - edgeMix) + edgeB * edgeMix);
                            a = Math.max(a, Math.round(edgeAlpha * edgeMix));
                        }

                        // Slight perimeter reinforcement for a clearer "panel".
                        const rim = 1 - Math.sqrt(rr);
                        if (rim < limbBand) {
                            const rimMix = 1 - (rim / limbBand);
                            r = Math.round(r * (1 - rimMix * 0.35) + edgeR * rimMix * 0.35);
                            g = Math.round(g * (1 - rimMix * 0.35) + edgeG * rimMix * 0.35);
                            b = Math.round(b * (1 - rimMix * 0.35) + edgeB * rimMix * 0.35);
                            a = Math.max(a, Math.round(170 * rimMix));
                        }

                        data[idx] = r;
                        data[idx + 1] = g;
                        data[idx + 2] = b;
                        data[idx + 3] = Math.min(255, a);
                    }
                }
                idx += 4;
            }
        }
        ctx.putImageData(img, left, top);
    }

    renderComposerMoonOutlineOverlay(panelState, { moonWorld, moonRadius }) {
        if (!panelState?.overlayCtx || !panelState?.overlayCanvas || panelState.composerMoonOutlineEnabled !== true) {
            return;
        }
        if (!moonWorld || !Number.isFinite(moonRadius) || moonRadius <= 0) {
            return;
        }
        const canvas = panelState.overlayCanvas;
        const ctx = panelState.overlayCtx;
        const width = canvas.width;
        const height = canvas.height;
        if (width <= 1 || height <= 1) {
            return;
        }

        this.tmpVectorA.copy(moonWorld).project(panelState.camera);
        if (!Number.isFinite(this.tmpVectorA.x) || !Number.isFinite(this.tmpVectorA.y) || !Number.isFinite(this.tmpVectorA.z)) {
            return;
        }
        if (this.tmpVectorA.z < -1 || this.tmpVectorA.z > 1) {
            return;
        }

        const cx = (this.tmpVectorA.x * 0.5 + 0.5) * width;
        const cy = (1 - (this.tmpVectorA.y * 0.5 + 0.5)) * height;
        const distanceToMoon = panelState.camera.position.distanceTo(moonWorld);
        if (!Number.isFinite(distanceToMoon) || distanceToMoon <= moonRadius + 1e-9) {
            return;
        }
        const angularRadius = Math.asin(this.THREE.MathUtils.clamp(moonRadius / distanceToMoon, 0, 0.999999));
        const verticalFovRad = this.THREE.MathUtils.degToRad(panelState.camera.fov);
        const radiusPx = (Math.tan(angularRadius) / Math.max(Math.tan(verticalFovRad * 0.5), 1e-9)) * (height * 0.5);
        if (!Number.isFinite(radiusPx) || radiusPx < 2) {
            return;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
        ctx.strokeStyle = COMPOSER_MOON_OUTLINE_RGBA;
        ctx.lineWidth = COMPOSER_MOON_OUTLINE_THICKNESS_PX;
        ctx.shadowColor = "rgba(13, 24, 40, 0.62)";
        ctx.shadowBlur = 2;
        ctx.stroke();
        ctx.restore();
    }

    renderComposerSeeThroughOverlay(
        panelState,
        {
            scene = null,
            skyContainer = null,
            skyRenderer = null,
            earthWorld = null,
            moonWorld = null,
            earthRadius = null,
            moonRadius = null,
        } = {},
    ) {
        if (
            !panelState?.overlayCtx ||
            !panelState?.overlayCanvas ||
            panelState.composerSeeThroughEnabled !== true
        ) {
            return;
        }
        const canvas = panelState.overlayCanvas;
        const ctx = panelState.overlayCtx;
        const width = canvas.width;
        const height = canvas.height;
        if (width <= 1 || height <= 1) {
            return;
        }

        const resolvedSkyRenderer = skyRenderer || scene?.skyRenderer || null;
        const activeSkyContainer = skyContainer || scene?.skyContainer || resolvedSkyRenderer?.container || null;
        if (!activeSkyContainer?.getWorldQuaternion) {
            return;
        }

        const occluders = resolveComposerSkyLabelOccluders({
            THREE: this.THREE,
            camera: panelState.camera,
            width,
            height,
            bodies: [
                { bodyId: "earth", centerWorld: earthWorld || this.earthWorld, radius: earthRadius },
                { bodyId: "moon", centerWorld: moonWorld || this.moonWorld, radius: moonRadius },
            ],
            paddingPx: 0,
        });
        if (occluders.length <= 0) {
            return;
        }

        const markers = resolveComposerSeeThroughMarkers({
            THREE: this.THREE,
            camera: panelState.camera,
            width,
            height,
            skyContainer: activeSkyContainer,
            planetRenderer: resolvedSkyRenderer?.planetRenderer || null,
            occluders,
        });
        if (markers.length <= 0) {
            return;
        }

        ctx.save();
        ctx.setLineDash(COMPOSER_SEE_THROUGH_DASH_PX);
        ctx.lineWidth = COMPOSER_SEE_THROUGH_LINE_WIDTH_PX;
        ctx.lineCap = "round";
        for (const marker of markers) {
            const x = Number(marker?.x);
            const y = Number(marker?.y);
            const radiusPx = Number(marker?.radiusPx);
            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y) ||
                !Number.isFinite(radiusPx) ||
                radiusPx <= 0
            ) {
                continue;
            }
            ctx.beginPath();
            ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
            ctx.strokeStyle = marker?.strokeStyle || "rgba(239, 246, 255, 0.90)";
            ctx.stroke();
        }
        ctx.restore();
    }

    renderComposerBottomMetricsOverlay(panelState, { craftWorld, moonWorld, earthWorld, telemetry = null }) {
        if (!panelState?.camera) {
            return;
        }
        const strip = panelState?.composerMetricsStrip;
        if (!isDomInstance(strip, "HTMLElement")) {
            return;
        }
        strip.hidden = panelState.composerInfoOverlayEnabled !== true;
        if (strip.hidden) {
            return;
        }
        if (!craftWorld || !moonWorld || !earthWorld) {
            if (panelState.composerMetricFovHValue) panelState.composerMetricFovHValue.textContent = "--";
            if (panelState.composerMetricFovVValue) panelState.composerMetricFovVValue.textContent = "--";
            if (panelState.composerMetricDistanceMoonValue) panelState.composerMetricDistanceMoonValue.textContent = "--";
            if (panelState.composerMetricAngleValue) panelState.composerMetricAngleValue.textContent = "--";
            return;
        }

        const verticalFovDeg = Number.isFinite(panelState.camera.fov) ? panelState.camera.fov : Number.NaN;
        const aspect = Math.max(1e-6, Number.isFinite(panelState.camera.aspect) ? panelState.camera.aspect : 1);
        const verticalFovRad = this.THREE.MathUtils.degToRad(verticalFovDeg);
        const horizontalFovDeg = Number.isFinite(verticalFovDeg)
            ? this.THREE.MathUtils.radToDeg(Math.atan(Math.tan(verticalFovRad * 0.5) * aspect) * 2)
            : Number.NaN;

        const telemetryDistanceMoon = Number.isFinite(telemetry?.distanceMoon)
            ? telemetry.distanceMoon
            : (Number.isFinite(telemetry?.distancePrimary) ? telemetry.distancePrimary : Number.NaN);
        const distanceToMoonKm = Number.isFinite(telemetryDistanceMoon)
            ? telemetryDistanceMoon
            : Number.NaN;
        this.tmpVectorA.subVectors(craftWorld, moonWorld);
        this.tmpVectorB.subVectors(earthWorld, moonWorld);
        const lenA = this.tmpVectorA.length();
        const lenB = this.tmpVectorB.length();
        let craftMoonEarthDeg = Number.NaN;
        if (lenA > 1e-9 && lenB > 1e-9) {
            this.tmpVectorA.multiplyScalar(1 / lenA);
            this.tmpVectorB.multiplyScalar(1 / lenB);
            const dot = this.THREE.MathUtils.clamp(this.tmpVectorA.dot(this.tmpVectorB), -1, 1);
            craftMoonEarthDeg = this.THREE.MathUtils.radToDeg(Math.acos(dot));
        }

        const safeFovH = Number.isFinite(horizontalFovDeg) ? `${horizontalFovDeg.toFixed(1)}°` : "--";
        const safeFovV = Number.isFinite(verticalFovDeg) ? `${verticalFovDeg.toFixed(1)}°` : "--";
        const safeDistance = Number.isFinite(distanceToMoonKm)
            ? `${Math.round(distanceToMoonKm).toLocaleString()} km / ${Math.round(distanceToMoonKm * KM_TO_MILES).toLocaleString()} mi`
            : "--";
        const safeAngle = Number.isFinite(craftMoonEarthDeg) ? `${craftMoonEarthDeg.toFixed(1)}°` : "--";

        if (panelState.composerMetricFovHValue) panelState.composerMetricFovHValue.textContent = safeFovH;
        if (panelState.composerMetricFovVValue) panelState.composerMetricFovVValue.textContent = safeFovV;
        if (panelState.composerMetricDistanceMoonValue) panelState.composerMetricDistanceMoonValue.textContent = safeDistance;
        if (panelState.composerMetricAngleValue) panelState.composerMetricAngleValue.textContent = safeAngle;
    }

    suppressLinePrimitives(scene) {
        const hiddenEntries = [];
        scene?.traverse?.((object) => {
            if (!object?.visible) {
                return;
            }
            if (!object.isLine && !object.isLineLoop && !object.isLineSegments) {
                return;
            }
            hiddenEntries.push({
                object,
                visible: object.visible,
            });
            object.visible = false;
        });
        return hiddenEntries;
    }

    /**
     * @param {{ activeCraft?: any, craftsById?: Record<string, any>, dronesById?: Record<string, any> }} [options]
     */
    suppressCraftVisuals({ activeCraft, craftsById, dronesById } = {}) {
        const hiddenEntries = [];
        const seen = new Set();
        const hideObject = (object) => {
            if (!object || seen.has(object)) {
                return;
            }
            seen.add(object);
            if (!object.visible) {
                return;
            }
            hiddenEntries.push({ object, visible: object.visible });
            object.visible = false;
        };

        hideObject(activeCraft);
        for (const craft of Object.values(craftsById || {})) {
            hideObject(craft);
        }
        for (const drone of Object.values(dronesById || {})) {
            hideObject(drone);
        }

        return hiddenEntries;
    }

    restoreVisibility(entries) {
        for (const entry of entries || []) {
            entry.object.visible = entry.visible;
        }
    }

    estimateCraftRadius(activeCraft) {
        if (!activeCraft) {
            return 1;
        }

        this.boundingBox.setFromObject(activeCraft);
        if (this.boundingBox.isEmpty()) {
            return 1;
        }

        this.boundingBox.getBoundingSphere(this.boundingSphere);
        const radius = this.boundingSphere.radius;
        return Number.isFinite(radius) && radius > 0 ? radius : 1;
    }

    estimateObjectRadius(object, fallbackRadius = 1) {
        if (!object) {
            return fallbackRadius;
        }
        this.boundingBox.setFromObject(object);
        if (this.boundingBox.isEmpty()) {
            return fallbackRadius;
        }
        this.boundingBox.getBoundingSphere(this.boundingSphere);
        const radius = this.boundingSphere.radius;
        return Number.isFinite(radius) && radius > 0 ? radius : fallbackRadius;
    }

    computeAutoFovDegrees({ distanceToTarget, targetRadius, aspect }) {
        if (!Number.isFinite(distanceToTarget) || distanceToTarget <= 0) {
            return null;
        }

        const radius = Number.isFinite(targetRadius) && targetRadius > 0 ? targetRadius : 1;
        const fitRadius = radius * AUTO_FOV_MARGIN_SCALE;
        const safeDistance = Math.max(distanceToTarget, fitRadius + 1e-9);
        const ratio = Math.min(fitRadius / safeDistance, 0.999999);
        const angularRadius = Math.asin(ratio);
        const safeAspect = Math.max(aspect || 1, 1e-3);
        const verticalFromHeight = 2 * angularRadius;
        const verticalFromWidth = 2 * Math.atan(Math.tan(angularRadius) / safeAspect);
        const requiredVerticalRadians = Math.max(verticalFromHeight, verticalFromWidth);
        return this.THREE.MathUtils.radToDeg(requiredVerticalRadians);
    }

    clampAutoFovDegrees(panelState, requestedDegrees) {
        const isComposer = panelState?.mode === "composer";
        const isMoonTargetPanel = panelState?.targetKey === "moon" && panelState?.mode !== "composer";
        return clampFovDegrees(requestedDegrees, {
            minDegrees: isComposer
                ? COMPOSER_AUTO_FOV_MIN_DEGREES
                : (isMoonTargetPanel ? MOON_TARGET_AUTO_FOV_MIN_DEGREES : TARGET_AUTO_FOV_MIN_DEGREES),
            maxDegrees: isComposer ? COMPOSER_AUTO_FOV_MAX_DEGREES : TARGET_AUTO_FOV_MAX_DEGREES,
            fallbackDegrees: panelState?.camera?.fov || panelState?.orbitZoomFovDegrees || 45,
        });
    }

    applyEclipticNorthUp(camera, lookTarget) {
        if (!camera || !lookTarget) return;
        const worldNorth = this.viewDir.set(0, 0, 1);
        const cameraToTarget = this.cameraOffset.copy(lookTarget).sub(camera.position);
        if (cameraToTarget.lengthSq() < 1e-18) {
            camera.up.set(0, 0, 1);
            return;
        }
        cameraToTarget.normalize();
        this.projectedUp
            .copy(worldNorth)
            .addScaledVector(cameraToTarget, -worldNorth.dot(cameraToTarget));
        if (this.projectedUp.lengthSq() < 1e-8) {
            camera.up.set(1, 0, 0);
            return;
        }
        camera.up.copy(this.projectedUp.normalize());
    }

    createFibonacciSphereSamples(count = 720) {
        const sampleCount = Math.max(64, Math.floor(count));
        const points = new Float32Array(sampleCount * 3);
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < sampleCount; i += 1) {
            const y = 1 - (2 * (i + 0.5)) / sampleCount;
            const radius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            points[i * 3] = Math.cos(theta) * radius;
            points[i * 3 + 1] = y;
            points[i * 3 + 2] = Math.sin(theta) * radius;
        }
        return points;
    }

    getObjectWorldPosition(object, outVector) {
        if (!object || !outVector) return false;
        object.getWorldPosition(outVector);
        return Number.isFinite(outVector.x) && Number.isFinite(outVector.y) && Number.isFinite(outVector.z);
    }

    resolvePositionForKey(key, context, outVector) {
        if (!outVector) return false;
        if (key === "craft") {
            return this.getObjectWorldPosition(context.activeCraft, outVector);
        }
        if (key === "earth") {
            return this.getObjectWorldPosition(context.earth, outVector);
        }
        if (key === "moon") {
            return this.getObjectWorldPosition(context.moon, outVector);
        }
        if (key === "sun") {
            return this.getObjectWorldPosition(context.sun, outVector);
        }
        return false;
    }

    vectorFromSunDirection(outVector, mode = "earth") {
        const pickSource = () => {
            if (mode === "moon") {
                return this.sunDirectionMoonWorld;
            }
            if (mode === "craft") {
                return this.sunDirectionCraftWorld;
            }
            return this.sunDirectionEarthWorld;
        };
        const source = pickSource();
        if (
            Number.isFinite(source?.x) &&
            Number.isFinite(source?.y) &&
            Number.isFinite(source?.z)
        ) {
            const len = source.length();
            if (len > 1e-12) {
                outVector.copy(source).multiplyScalar(1 / len);
                return true;
            }
        }
        return false;
    }

    resolveSunDirectionForPanel(panelState) {
        if (!panelState) {
            return this.sunDirectionEarthWorld;
        }
        if (panelState.anchorKey === "craft" || panelState.mode === "composer") {
            return this.sunDirectionCraftWorld;
        }
        if (panelState.targetKey === "moon" || panelState.anchorKey === "moon") {
            return this.sunDirectionMoonWorld;
        }
        return this.sunDirectionEarthWorld;
    }

    computeOrbitPlaneHalfHeight({ scene, earthWorld, moonWorld, craftWorld, earthRadius, moonRadius, missionConfig = null }) {
        let maxRadius = Math.max(
            Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius * 6 : 1,
            Number.isFinite(moonRadius) && moonRadius > 0 ? moonRadius : 1,
        );

        const includeWorldPoint = (point, radius = 0) => {
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                return;
            }
            const dx = point.x - earthWorld.x;
            const dy = point.y - earthWorld.y;
            const distance = Math.hypot(dx, dy) + Math.max(0, radius);
            if (Number.isFinite(distance)) {
                maxRadius = Math.max(maxRadius, distance);
            }
        };

        includeWorldPoint(moonWorld, moonRadius);
        includeWorldPoint(craftWorld, 0);
        for (const bodyId of this.resolveOrbitPlaneCurveBodyIds(scene, missionConfig)) {
            const curve = scene?.curvesById?.[bodyId] || [];
            for (const point of curve) {
                includeWorldPoint(point, 0);
            }
        }

        scene?.traverse?.((object) => {
            if (!object?.visible || (!object.isLine && !object.isLineLoop && !object.isLineSegments)) {
                return;
            }
            const geometry = object.geometry;
            if (!geometry) {
                return;
            }
            geometry.computeBoundingSphere?.();
            const sphere = geometry.boundingSphere;
            if (!sphere || !Number.isFinite(sphere.radius)) {
                return;
            }
            this.tmpVectorA.copy(sphere.center);
            object.localToWorld?.(this.tmpVectorA);
            const scale = object.getWorldScale ? object.getWorldScale(this.tmpVectorB) : this.tmpVectorB.set(1, 1, 1);
            const worldRadius = sphere.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 1e-6);
            includeWorldPoint(this.tmpVectorA, worldRadius);
        });

        return Math.max(maxRadius * 1.12, 1);
    }

    createOrbitPlaneProjector({ width, height, earthWorld, halfHeight, panOffsetX = 0, panOffsetY = 0 }) {
        const safeWidth = Math.max(1, width);
        const safeHeight = Math.max(1, height);
        const safeHalfHeight = Math.max(1e-9, halfHeight);
        const aspect = safeWidth / safeHeight;
        const halfWidth = safeHalfHeight * aspect;
        const scaleX = safeWidth / (halfWidth * 2);
        const scaleY = safeHeight / (safeHalfHeight * 2);
        const centerX = earthWorld.x + (Number(panOffsetX) || 0);
        const centerY = earthWorld.y + (Number(panOffsetY) || 0);
        const project = (worldPoint) => ({
            x: (safeWidth * 0.5) + ((worldPoint.x - centerX) * scaleX),
            y: (safeHeight * 0.5) - ((worldPoint.y - centerY) * scaleY),
        });
        project.scaleX = scaleX;
        project.scaleY = scaleY;
        project.centerX = centerX;
        project.centerY = centerY;
        return project;
    }

    drawOrbitPlaneMarker(ctx, project, worldPoint, {
        radiusPx,
        fill,
        stroke = "rgba(218, 235, 255, 0.85)",
        label = "",
        labelOffsetX = 8,
        labelOffsetY = -8,
    }) {
        if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y)) {
            return;
        }
        const point = project(worldPoint);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = stroke;
        ctx.stroke();
        if (label) {
            ctx.font = "700 10px sans-serif";
            ctx.fillStyle = "rgba(220, 235, 255, 0.88)";
            ctx.textBaseline = "middle";
            ctx.fillText(label, point.x + labelOffsetX, point.y + labelOffsetY);
        }
        ctx.restore();
    }

    drawOrbitPlaneLineObject(ctx, object, project) {
        const geometry = object?.geometry;
        const position = geometry?.getAttribute?.("position");
        if (!position || position.count < 2) {
            return false;
        }
        const drawRange = geometry.drawRange || {};
        const rangeStart = Number.isFinite(drawRange.start)
            ? Math.max(0, Math.floor(drawRange.start))
            : 0;
        const rangeCount = Number.isFinite(drawRange.count)
            ? Math.max(0, Math.floor(drawRange.count))
            : Infinity;
        const rangeEnd = Math.min(position.count, rangeStart + rangeCount);
        if (rangeEnd - rangeStart < 2) {
            return false;
        }
        const color = object.material?.color;
        const opacity = Number.isFinite(object.material?.opacity) ? object.material.opacity : 1;
        const strokeColor = color
            ? `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${Math.max(0.18, Math.min(0.72, opacity))})`
            : "rgba(117, 176, 255, 0.46)";
        const drawVertex = (index) => {
            this.tmpVectorA.fromBufferAttribute(position, index);
            object.localToWorld?.(this.tmpVectorA);
            return project(this.tmpVectorA);
        };
        const drawPolyline = () => {
            ctx.beginPath();
            let moved = false;
            let drewSegment = false;
            for (let i = rangeStart; i < rangeEnd; i += 1) {
                const point = drawVertex(i);
                if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                    continue;
                }
                if (!moved) {
                    ctx.moveTo(point.x, point.y);
                    moved = true;
                } else {
                    ctx.lineTo(point.x, point.y);
                    drewSegment = true;
                }
            }
            if (object.isLineLoop && moved && drewSegment) {
                ctx.closePath();
            }
            if (drewSegment) {
                ctx.stroke();
            }
            return drewSegment;
        };

        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = object.isLineSegments ? 1 : 1.35;
        ctx.setLineDash(object.isLineSegments ? [3, 4] : []);
        let drew = false;
        if (object.isLineSegments) {
            for (let i = rangeStart; i + 1 < rangeEnd; i += 2) {
                const a = drawVertex(i);
                const b = drawVertex(i + 1);
                if (
                    Number.isFinite(a.x) &&
                    Number.isFinite(a.y) &&
                    Number.isFinite(b.x) &&
                    Number.isFinite(b.y)
                ) {
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                    drew = true;
                }
            }
        } else {
            drew = drawPolyline();
        }
        ctx.restore();
        return drew;
    }

    resolveOrbitPlaneCurveBodyIds(scene, missionConfig = null) {
        const curvesById = scene?.curvesById || {};
        const bodyIds = [];
        const seen = new Set();
        const addBodyId = (bodyId) => {
            if (!bodyId || seen.has(bodyId)) {
                return;
            }
            const curve = curvesById[bodyId];
            if (!Array.isArray(curve) || curve.length < 2) {
                return;
            }
            seen.add(bodyId);
            bodyIds.push(bodyId);
        };

        try {
            getSceneVisibleCraftIds(scene, missionConfig).forEach(addBodyId);
        } catch {
            // Fall back to scene-local ids below; the overlay should still draw
            // when mission metadata is not available during startup.
        }
        addBodyId(scene?.activeCraftId);
        addBodyId(scene?.primaryCraftId);
        if (bodyIds.length === 0) {
            Object.keys(curvesById).forEach(addBodyId);
        }
        return bodyIds;
    }

    resolveOrbitPlaneCurveStroke(scene, bodyId) {
        const lines = scene?.orbitLinesByBodyId?.[bodyId] || [];
        const sourceLine = lines.find((line) => line?.material?.color);
        const color = sourceLine?.material?.color;
        const opacity = Number.isFinite(sourceLine?.material?.opacity)
            ? sourceLine.material.opacity
            : 0.56;
        if (!color) {
            return "rgba(117, 176, 255, 0.56)";
        }
        return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${Math.max(0.22, Math.min(0.76, opacity))})`;
    }

    drawOrbitPlaneCurve(ctx, curve, project, { strokeStyle = "rgba(117, 176, 255, 0.56)", lineWidth = 1.35 } = {}) {
        if (!Array.isArray(curve) || curve.length < 2) {
            return false;
        }
        ctx.save();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash([]);
        ctx.beginPath();
        let moved = false;
        let drewSegment = false;
        for (const worldPoint of curve) {
            if (
                !worldPoint ||
                !Number.isFinite(worldPoint.x) ||
                !Number.isFinite(worldPoint.y)
            ) {
                moved = false;
                continue;
            }
            const point = project(worldPoint);
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                moved = false;
                continue;
            }
            if (!moved) {
                ctx.moveTo(point.x, point.y);
                moved = true;
            } else {
                ctx.lineTo(point.x, point.y);
                drewSegment = true;
            }
        }
        if (drewSegment) {
            ctx.stroke();
        }
        ctx.restore();
        return drewSegment;
    }

    drawOrbitPlaneCurvesFromSceneData(ctx, scene, project, missionConfig = null) {
        let drewAny = false;
        for (const bodyId of this.resolveOrbitPlaneCurveBodyIds(scene, missionConfig)) {
            const curve = scene?.curvesById?.[bodyId] || [];
            const drew = this.drawOrbitPlaneCurve(ctx, curve, project, {
                strokeStyle: this.resolveOrbitPlaneCurveStroke(scene, bodyId),
            });
            drewAny = drewAny || drew;
        }
        return drewAny;
    }

    renderOrbitPlane2DOverlay(panelState, { scene, earthWorld, moonWorld, craftWorld, earthRadius, moonRadius, halfHeight, missionConfig = null }) {
        const canvas = panelState?.overlayCanvas;
        const ctx = panelState?.overlayCtx;
        if (!canvas || !ctx) {
            return;
        }
        const width = Math.max(1, canvas.width);
        const height = Math.max(1, canvas.height);
        const project = this.createOrbitPlaneProjector({
            width,
            height,
            earthWorld,
            halfHeight,
            panOffsetX: panelState.orbitPanOffsetX,
            panOffsetY: panelState.orbitPanOffsetY,
        });

        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "rgba(4, 10, 19, 0.96)";
        ctx.fillRect(0, 0, width, height);

        const gridStep = Math.max(1, halfHeight / 4);
        const aspect = width / Math.max(1, height);
        const halfWidth = halfHeight * aspect;
        ctx.strokeStyle = "rgba(120, 166, 232, 0.12)";
        ctx.lineWidth = 1;
        for (let x = -Math.floor(halfWidth / gridStep) * gridStep; x <= halfWidth; x += gridStep) {
            const screenX = project({ x: earthWorld.x + x, y: earthWorld.y }).x;
            ctx.beginPath();
            ctx.moveTo(screenX, 0);
            ctx.lineTo(screenX, height);
            ctx.stroke();
        }
        for (let y = -Math.floor(halfHeight / gridStep) * gridStep; y <= halfHeight; y += gridStep) {
            const screenY = project({ x: earthWorld.x, y: earthWorld.y + y }).y;
            ctx.beginPath();
            ctx.moveTo(0, screenY);
            ctx.lineTo(width, screenY);
            ctx.stroke();
        }

        ctx.strokeStyle = "rgba(162, 200, 255, 0.28)";
        ctx.lineWidth = 1.25;
        const origin = project(earthWorld);
        ctx.beginPath();
        ctx.moveTo(0, origin.y);
        ctx.lineTo(width, origin.y);
        ctx.moveTo(origin.x, 0);
        ctx.lineTo(origin.x, height);
        ctx.stroke();

        let drewCraftOrbit = false;
        scene?.traverse?.((object) => {
            if (!object?.visible || (!object.isLine && !object.isLineLoop && !object.isLineSegments)) {
                return;
            }
            const drewLine = this.drawOrbitPlaneLineObject(ctx, object, project);
            if (drewLine && object?.userData?.bodyId && scene?.curvesById?.[object.userData.bodyId]) {
                drewCraftOrbit = true;
            }
        });
        if (!drewCraftOrbit) {
            this.drawOrbitPlaneCurvesFromSceneData(ctx, scene, project, missionConfig);
        }

        const earthRadiusPx = Math.max(4, Math.min(16, (earthRadius / Math.max(1e-9, halfHeight)) * (height * 0.5)));
        const moonRadiusPx = Math.max(3, Math.min(10, (moonRadius / Math.max(1e-9, halfHeight)) * (height * 0.5)));
        this.drawOrbitPlaneMarker(ctx, project, earthWorld, {
            radiusPx: earthRadiusPx,
            fill: "rgba(59, 141, 231, 0.9)",
            stroke: "rgba(180, 220, 255, 0.92)",
            label: "Earth",
        });
        this.drawOrbitPlaneMarker(ctx, project, moonWorld, {
            radiusPx: moonRadiusPx,
            fill: "rgba(190, 198, 210, 0.88)",
            stroke: "rgba(240, 246, 255, 0.86)",
            label: "Moon",
        });
        this.drawOrbitPlaneMarker(ctx, project, craftWorld, {
            radiusPx: 4,
            fill: "rgba(255, 207, 101, 0.96)",
            stroke: "rgba(255, 238, 180, 0.94)",
            label: "Orion",
            labelOffsetY: 10,
        });
        ctx.restore();
    }

    renderOrbitPlanePanel(panelState, { scene, activeCraft, earth, moon, earthRadius, moonRadius, missionConfig = null }) {
        if (!panelState?.camera?.isOrthographicCamera || !earth || !activeCraft) {
            this.setPanelVisible(panelState, false);
            return false;
        }
        if (!this.getObjectWorldPosition(earth, this.earthWorld) || !this.getObjectWorldPosition(activeCraft, this.craftWorld)) {
            this.setPanelVisible(panelState, false);
            return false;
        }
        if (moon) {
            this.getObjectWorldPosition(moon, this.moonWorld);
        }

        this.setPanelVisible(panelState, true);
        this.syncPanelSize(panelState);
        if (panelState.autoFovEnabled === true) {
            this.applyOrbitPlaneAutoFit(panelState);
        }

        const halfHeight = this.computeOrbitPlaneHalfHeight({
            scene,
            earthWorld: this.earthWorld,
            moonWorld: this.moonWorld,
            craftWorld: this.craftWorld,
            earthRadius,
            moonRadius,
            missionConfig,
        });
        const zoomFov = clampFovDegrees(panelState.orbitZoomFovDegrees, {
            minDegrees: panelState.fovMinDegrees ?? AUTO_FOV_MIN_DEGREES,
            maxDegrees: panelState.fovMaxDegrees ?? AUTO_FOV_MAX_DEGREES,
            fallbackDegrees: 45,
        });
        const zoomScale = this.THREE.MathUtils.clamp(zoomFov / 45, 0.08, 4);
        panelState.orthographicHalfHeight = halfHeight * zoomScale;
        panelState.renderer.clear(true, true, true);
        this.renderOrbitPlane2DOverlay(panelState, {
            scene,
            earthWorld: this.earthWorld,
            moonWorld: this.moonWorld,
            craftWorld: this.craftWorld,
            earthRadius: Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1,
            moonRadius: Number.isFinite(moonRadius) && moonRadius > 0 ? moonRadius : 1,
            halfHeight: panelState.orthographicHalfHeight,
            missionConfig,
        });
        this.setPanelInfo(panelState, "Earth-origin XY plane", "2D projection");
        return true;
    }

    computeMoonPhaseInfo({ earth, moon, sun }) {
        if (!earth || !moon) {
            return null;
        }
        if (!this.getObjectWorldPosition(earth, this.earthWorld)) {
            return null;
        }
        if (!this.getObjectWorldPosition(moon, this.moonWorld)) {
            return null;
        }

        this.tmpVectorA.subVectors(this.moonWorld, this.earthWorld);
        const moonDistance = this.tmpVectorA.length();
        if (!Number.isFinite(moonDistance) || moonDistance <= 1e-12) {
            return null;
        }
        this.tmpVectorA.multiplyScalar(1 / moonDistance);

        let sunAvailable = this.vectorFromSunDirection(this.tmpVectorB);
        if (!sunAvailable && sun && this.getObjectWorldPosition(sun, this.sunWorld)) {
            this.tmpVectorB.subVectors(this.sunWorld, this.earthWorld);
            const sunDistance = this.tmpVectorB.length();
            if (Number.isFinite(sunDistance) && sunDistance > 1e-12) {
                this.tmpVectorB.multiplyScalar(1 / sunDistance);
                sunAvailable = true;
            }
        }
        if (!sunAvailable) {
            return null;
        }

        const dot = this.THREE.MathUtils.clamp(this.tmpVectorA.dot(this.tmpVectorB), -1, 1);
        const elongationDeg = this.THREE.MathUtils.radToDeg(Math.acos(dot));

        if (Number.isFinite(this.moonElongationPrevious)) {
            const delta = elongationDeg - this.moonElongationPrevious;
            if (Math.abs(delta) > 0.03) {
                this.moonElongationTrend = delta >= 0 ? 1 : -1;
            }
        }
        this.moonElongationPrevious = elongationDeg;

        const phaseName = this.resolveMoonPhaseName(elongationDeg, this.moonElongationTrend);
        return {
            phaseName,
            elongationDeg,
        };
    }

    resolveMoonPhaseName(elongationDeg, trend) {
        const waxing = trend >= 0;
        if (elongationDeg < 10) {
            return "New Moon";
        }
        if (elongationDeg < 84) {
            return waxing ? "Waxing Crescent" : "Waning Crescent";
        }
        if (elongationDeg <= 96) {
            return waxing ? "First Quarter" : "Last Quarter";
        }
        if (elongationDeg < 170) {
            return waxing ? "Waxing Gibbous" : "Waning Gibbous";
        }
        return "Full Moon";
    }

    roundPercentParts(parts) {
        const floors = parts.map((value) => Math.floor(Math.max(0, value)));
        let sum = floors.reduce((acc, value) => acc + value, 0);
        let remaining = Math.max(0, 100 - sum);
        const remainders = parts
            .map((value, index) => ({ index, remainder: Math.max(0, value) - floors[index] }))
            .sort((a, b) => b.remainder - a.remainder);
        let cursor = 0;
        while (remaining > 0 && remainders.length > 0) {
            floors[remainders[cursor % remainders.length].index] += 1;
            remaining -= 1;
            cursor += 1;
        }
        sum = floors.reduce((acc, value) => acc + value, 0);
        if (sum !== 100 && floors.length > 0) {
            floors[0] += 100 - sum;
        }
        return floors;
    }

    computeCraftMoonVisibilityInfo({ activeCraft, earth, moon, sun }) {
        if (!activeCraft || !earth || !moon) {
            return null;
        }
        if (!this.getObjectWorldPosition(activeCraft, this.craftWorld)) {
            return null;
        }
        if (!this.getObjectWorldPosition(earth, this.earthWorld)) {
            return null;
        }
        if (!this.getObjectWorldPosition(moon, this.moonWorld)) {
            return null;
        }

        this.craftFromMoonDir.subVectors(this.craftWorld, this.moonWorld);
        this.earthFromMoonDir.subVectors(this.earthWorld, this.moonWorld);
        let craftLen = this.craftFromMoonDir.length();
        let earthLen = this.earthFromMoonDir.length();
        if (craftLen <= 1e-12 || earthLen <= 1e-12) {
            return null;
        }
        this.craftFromMoonDir.multiplyScalar(1 / craftLen);
        this.earthFromMoonDir.multiplyScalar(1 / earthLen);

        let sunAvailable = this.vectorFromSunDirection(this.sunFromMoonDir, "moon");
        if (!sunAvailable && sun && this.getObjectWorldPosition(sun, this.sunWorld)) {
            this.sunFromMoonDir.subVectors(this.sunWorld, this.moonWorld);
            const sunLen = this.sunFromMoonDir.length();
            if (sunLen > 1e-12) {
                this.sunFromMoonDir.multiplyScalar(1 / sunLen);
                sunAvailable = true;
            }
        }
        if (!sunAvailable) {
            return null;
        }

        let visibleCount = 0;
        let nearDay = 0;
        let nearNight = 0;
        let farDay = 0;
        let farNight = 0;
        const samples = this.moonVisibilitySamples;
        for (let i = 0; i < samples.length; i += 3) {
            const nx = samples[i];
            const ny = samples[i + 1];
            const nz = samples[i + 2];
            const visibleDot = nx * this.craftFromMoonDir.x + ny * this.craftFromMoonDir.y + nz * this.craftFromMoonDir.z;
            if (visibleDot <= 0) continue;
            visibleCount += 1;

            const near = (nx * this.earthFromMoonDir.x + ny * this.earthFromMoonDir.y + nz * this.earthFromMoonDir.z) >= 0;
            const day = (nx * this.sunFromMoonDir.x + ny * this.sunFromMoonDir.y + nz * this.sunFromMoonDir.z) >= 0;

            if (near) {
                if (day) nearDay += 1;
                else nearNight += 1;
            } else if (day) {
                farDay += 1;
            } else {
                farNight += 1;
            }
        }

        if (visibleCount <= 0) {
            return null;
        }

        const rawParts = [
            (nearDay * 100) / visibleCount,
            (nearNight * 100) / visibleCount,
            (farDay * 100) / visibleCount,
            (farNight * 100) / visibleCount,
        ];
        const [nearDayPct, nearNightPct, farDayPct, farNightPct] = this.roundPercentParts(rawParts);
        const nearPct = nearDayPct + nearNightPct;
        const farPct = farDayPct + farNightPct;

        return {
            nearPct,
            farPct,
            nearDayPct,
            nearNightPct,
            farDayPct,
            farNightPct,
        };
    }

    setPanelFov(panelState, requestedDegrees) {
        if (panelState?.camera?.isOrthographicCamera) {
            const fovDegrees = clampFovDegrees(requestedDegrees, {
                minDegrees: panelState.fovMinDegrees ?? AUTO_FOV_MIN_DEGREES,
                maxDegrees: panelState.fovMaxDegrees ?? AUTO_FOV_MAX_DEGREES,
                fallbackDegrees: panelState.orbitZoomFovDegrees || panelState.camera.fov || 45,
            });
            panelState.orbitZoomFovDegrees = fovDegrees;
            panelState.fovControl?.setFovDegrees(fovDegrees, fovDegrees);
            return;
        }
        if (!Number.isFinite(requestedDegrees)) {
            return;
        }

        const minDegrees = Number.isFinite(panelState.fovMinDegrees)
            ? panelState.fovMinDegrees
            : AUTO_FOV_MIN_DEGREES;
        const defaultMaxDegrees = panelState.mode === "composer"
            ? COMPOSER_MANUAL_FOV_MAX_DEGREES
            : AUTO_FOV_MAX_DEGREES;
        const maxDegrees = Number.isFinite(panelState.fovMaxDegrees)
            ? panelState.fovMaxDegrees
            : defaultMaxDegrees;
        const fovDegrees = clampFovDegrees(requestedDegrees, {
            minDegrees,
            maxDegrees,
            fallbackDegrees: panelState.camera.fov,
        });

        if (Math.abs(panelState.camera.fov - fovDegrees) > 1e-4) {
            panelState.camera.fov = fovDegrees;
            panelState.camera.updateProjectionMatrix();
            panelState.overlayDirty = true;
        }

        panelState.fovControl?.setFovDegrees(fovDegrees, panelState.camera.fov);
    }

    applyOrbitPlaneAutoFit(panelState) {
        if (!panelState || panelState.mode !== "orbit-xy") {
            return false;
        }
        panelState.orbitPanOffsetX = 0;
        panelState.orbitPanOffsetY = 0;
        this.setPanelFov(panelState, ORBIT_XY_AUTO_FOV_DEGREES);
        return true;
    }

    setComposerLockTarget(panelState, target, {
        syncComposerLockUi = null,
        syncAutoToggleUi = null,
        forceAuto = false,
        activateIfDisabled = true,
        persist = true,
    } = {}) {
        if (!panelState || panelState.mode !== "composer") {
            return false;
        }
        const previousTarget = panelState.composerLockTarget || "none";
        if (activateIfDisabled && panelState.composerInteractionEnabled !== true) {
            this.activateComposerWindow(panelState, { finalize: true });
        }
        const result = resolveComposerViewIntent(this.readComposerViewState(panelState), {
            type: "lock-target",
            target,
            forceAuto,
        });
        const nextTarget = result.state.lockTarget;
        const targetChanged = nextTarget !== previousTarget;
        const shouldSyncAuto = nextTarget === "none"
            ? targetChanged
            : (targetChanged || forceAuto === true);
        return this.applyComposerViewState(panelState, result.state, {
            syncComposerLockUi,
            syncAutoToggleUi: shouldSyncAuto ? syncAutoToggleUi : null,
            persist,
        });
    }

    showComposerHint(panelState, message, durationMs = 1800) {
        if (!panelState?.composerHint) {
            return;
        }

        if (panelState.composerHintTimer != null) {
            clearTimeout(panelState.composerHintTimer);
            panelState.composerHintTimer = null;
        }

        panelState.composerHint.textContent = message;
        panelState.composerHint.hidden = false;
        panelState.composerHint.dataset.visible = "true";
        panelState.composerHintTimer = setTimeout(() => {
            panelState.composerHint.dataset.visible = "false";
            panelState.composerHint.hidden = true;
            panelState.composerHintTimer = null;
        }, Math.max(0, durationMs));
    }

    renderComposerPanel(panelState, {
        animationScene = null,
        scene,
        latestSceneState = null,
        activeCraft,
        earth,
        moon,
        sun = null,
        sunRenderer,
        skyRenderer = null,
        earthRadius,
        moonRadius,
        missionConfig = null,
        referenceCamera,
        hasSkyContainer,
        skyContainer,
        earthCloudsEnabled = true,
        earthDayTexture = null,
    }) {
        if (!activeCraft || !earth || !moon) {
            this.setPanelVisible(panelState, false);
            return false;
        }
        if (!this.getObjectWorldPosition(activeCraft, this.craftWorld)) {
            this.setPanelVisible(panelState, false);
            return false;
        }
        if (!this.getObjectWorldPosition(earth, this.earthWorld) || !this.getObjectWorldPosition(moon, this.moonWorld)) {
            this.setPanelVisible(panelState, false);
            return false;
        }
        const composerEarthRadius = (Number.isFinite(earthRadius) && earthRadius > 0)
            ? earthRadius
            : this.estimateObjectRadius(earth, 1);
        const composerMoonRadius = (Number.isFinite(moonRadius) && moonRadius > 0)
            ? moonRadius
            : this.estimateObjectRadius(moon, 1);
        this.updateBodyNorthWorld(earth, this.earthNorthWorld);
        this.updateBodyNorthWorld(moon, this.moonNorthWorld);

        this.setPanelVisible(panelState, true);
        this.ensureLunarFeatureMentionTimeline(missionConfig);
        panelState.composerEarthCloudsEnabled = earthCloudsEnabled !== false;
        panelState.syncComposerCloudsUi?.();
        panelState.syncComposerLunarCratersUi?.();
        this.syncPanelSize(panelState);
        this.setPanelFov(panelState, panelState.camera.fov);
        this.syncComposerTimelineUi(panelState);
        panelState.composerLunarFeatureMentionView = this.resolveComposerLunarFeatureMentionView(panelState);
        this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);

        if (referenceCamera) {
            if (
                Math.abs(panelState.camera.near - referenceCamera.near) > 1e-9 ||
                Math.abs(panelState.camera.far - referenceCamera.far) > 1e-9
            ) {
                panelState.camera.near = referenceCamera.near;
                panelState.camera.far = referenceCamera.far;
                panelState.camera.updateProjectionMatrix();
            }
        }

        const lockTarget = panelState.composerLockTarget || "none";
        if (lockTarget === "earth" || lockTarget === "moon") {
            this.applyComposerPreset(panelState, lockTarget, {
                craftWorld: this.craftWorld,
                earthWorld: this.earthWorld,
                moonWorld: this.moonWorld,
            });
        } else if (!Number.isFinite(panelState.composerYawRad) || !Number.isFinite(panelState.composerPitchRad)) {
            this.applyComposerPreset(panelState, "earth", {
                craftWorld: this.craftWorld,
                earthWorld: this.earthWorld,
                moonWorld: this.moonWorld,
            });
        }
        this.updateComposerRollUi(panelState);

        panelState.camera.position.copy(this.craftWorld);
        let distanceForFov = Number.NaN;
        let radiusForFov = Number.NaN;
        const disabledAsCraftToEarth = panelState.composerInteractionEnabled !== true;
        if (disabledAsCraftToEarth) {
            this.composerLookAtWorld.copy(this.earthWorld);
            this.viewDir.subVectors(this.earthWorld, this.craftWorld).normalize();
            this.targetUp.set(0, 0, 1);
            earth.getWorldQuaternion(this.targetQuat);
            this.targetUp.applyQuaternion(this.targetQuat).normalize();
            if (Math.abs(this.targetUp.dot(this.viewDir)) > 0.98) {
                panelState.camera.up.set(0, 0, 1);
            } else {
                panelState.camera.up.copy(this.targetUp);
            }
            panelState.camera.lookAt(this.composerLookAtWorld);
            distanceForFov = panelState.camera.position.distanceTo(this.earthWorld);
            radiusForFov = composerEarthRadius;
        } else {
            const lookDir = this.getComposerLookDirection(panelState);
            panelState.camera.up.copy(this.getComposerCameraUp(panelState, lookDir));
            this.composerLookAtWorld.copy(this.craftWorld).add(lookDir);
            panelState.camera.lookAt(this.composerLookAtWorld);
            // Keep previous auto-FoV behavior when enabled.
            if (lockTarget === "earth") {
                distanceForFov = panelState.camera.position.distanceTo(this.earthWorld);
                radiusForFov = composerEarthRadius;
            } else if (lockTarget === "moon") {
                distanceForFov = panelState.camera.position.distanceTo(this.moonWorld);
                radiusForFov = composerMoonRadius;
            }
        }

        if (!disabledAsCraftToEarth && panelState.autoFovEnabled && lockTarget !== "none") {
            const autoFov = this.computeComposerAutoFovDegrees({
                panelState,
                craftWorld: this.craftWorld,
                earthWorld: this.earthWorld,
                moonWorld: this.moonWorld,
                earthRadius: composerEarthRadius,
                moonRadius: composerMoonRadius,
                lockTarget,
            });
            this.setPanelFov(panelState, this.clampAutoFovDegrees(panelState, autoFov));
        }

        if (hasSkyContainer) {
            panelState.camera.getWorldPosition(this.panelCameraWorldPosition);
            if (skyContainer.parent?.worldToLocal) {
                this.panelSkyLocalPosition.copy(this.panelCameraWorldPosition);
                skyContainer.parent.worldToLocal(this.panelSkyLocalPosition);
                skyContainer.position.copy(this.panelSkyLocalPosition);
            } else {
                skyContainer.position.copy(this.panelCameraWorldPosition);
            }
        }
        if (sunRenderer?.setReferencePosition) {
            panelState.camera.getWorldPosition(this.panelCameraWorldPosition);
            const sunParent = sunRenderer.group?.parent;
            if (sunParent?.worldToLocal) {
                this.panelSunLocalPosition.copy(this.panelCameraWorldPosition);
                sunParent.worldToLocal(this.panelSunLocalPosition);
                sunRenderer.setReferencePosition(
                    this.panelSunLocalPosition.x,
                    this.panelSunLocalPosition.y,
                    this.panelSunLocalPosition.z,
                );
            } else {
                sunRenderer.setReferencePosition(
                    this.panelCameraWorldPosition.x,
                    this.panelCameraWorldPosition.y,
                    this.panelCameraWorldPosition.z,
                );
            }
        }
        const composerLightingPresentation = computePhotoModeLightingPresentation({
            distanceToEarth: panelState.camera.position.distanceTo(this.earthWorld),
            earthRadius: composerEarthRadius,
            distanceToMoon: panelState.camera.position.distanceTo(this.moonWorld),
            moonRadius: composerMoonRadius,
        });
        const restoreComposerBodyPresentation = this.applyComposerBodyLightingPresentation({
            earth,
            moon,
            distanceToEarth: panelState.camera.position.distanceTo(this.earthWorld),
            earthRadius: composerEarthRadius,
            distanceToMoon: panelState.camera.position.distanceTo(this.moonWorld),
            moonRadius: composerMoonRadius,
            earthDayTexture: earthCloudsEnabled !== false ? earthDayTexture : null,
            earthDayTextureBlend: earthCloudsEnabled !== false ? null : 0,
        });
        const restoreComposerBodyAmbient = this.applyComposerBodyAmbientLighting({
            panelState,
            earth,
            moon,
        });
        const restoreComposerEarthshineGain = this.applyComposerEarthshineGain(panelState, scene);
        const restoreComposerMoonshineGain = this.applyComposerMoonshineGain(panelState, scene);
        const composerSolarEclipseState = this.resolveComposerSolarEclipseState({
            craftWorld: this.craftWorld,
            earthWorld: this.earthWorld,
            moonWorld: this.moonWorld,
            earthRadius: composerEarthRadius,
            moonRadius: composerMoonRadius,
        });
        const previousSolarEclipseActive = panelState.composerSolarEclipseActive === true;
        panelState.composerSolarEclipseActive = composerSolarEclipseState.active === true;
        const previousEclipseAutoExposureEligible = panelState.composerEclipseAutoExposureEligible !== false;
        panelState.composerEclipseAutoExposureEligible = this.shouldApplyComposerEclipseAutoExposure(panelState, {
            eclipseState: composerSolarEclipseState,
            earthWorld: this.earthWorld,
            earthRadius: composerEarthRadius,
            moonWorld: this.moonWorld,
            moonRadius: composerMoonRadius,
        });
        if (
            panelState.composerSolarEclipseActive !== previousSolarEclipseActive ||
            panelState.composerEclipseAutoExposureEligible !== previousEclipseAutoExposureEligible
        ) {
            panelState.syncComposerExposureUi?.();
        }
        const restoreComposerExposureProfile = this.applyComposerExposureProfile(scene, panelState, sunRenderer, {
            exposureBias: composerLightingPresentation?.exposureBias ?? 1,
            skyRenderer,
            eclipseActive: panelState.composerSolarEclipseActive,
        });
        try {
            this.renderComposerLayers(panelState, scene, {
                animationScene,
                renderSkyLayer: hasSkyContainer && skyContainer?.visible !== false,
            });
        } finally {
            restoreComposerExposureProfile();
            restoreComposerMoonshineGain();
            restoreComposerEarthshineGain();
            restoreComposerBodyAmbient();
            restoreComposerBodyPresentation();
        }
        this.clearPanelOverlay(panelState);
        this.renderComposerSkyLabelOverlay(panelState, {
            scene,
            skyContainer,
            skyRenderer,
            earthWorld: this.earthWorld,
            moonWorld: this.moonWorld,
            earthRadius: composerEarthRadius,
            moonRadius: composerMoonRadius,
        });
        this.renderComposerMoonOutlineOverlay(panelState, {
            moonWorld: this.moonWorld,
            moonRadius: composerMoonRadius,
        });
        this.renderComposerSeeThroughOverlay(panelState, {
            scene,
            skyContainer,
            skyRenderer,
            earthWorld: this.earthWorld,
            moonWorld: this.moonWorld,
            earthRadius: composerEarthRadius,
            moonRadius: composerMoonRadius,
        });
        this.renderComposerBottomMetricsOverlay(panelState, {
            craftWorld: this.craftWorld,
            moonWorld: this.moonWorld,
            earthWorld: this.earthWorld,
            telemetry: latestSceneState?.telemetry || null,
        });
        return true;
    }

    render({
        animationScene = null,
        scene,
        skyRenderer = null,
        latestSceneState = null,
        activeCraft,
        craftsById = null,
        dronesById = null,
        earth,
        moon,
        sun = null,
        sunRenderer = null,
        sunDirection = null,
        sunDirections = null,
        skyContainer = null,
        earthRadius = null,
        moonRadius = null,
        timelineEventInfos = null,
        referenceCamera,
        panelsVisible = true,
        missionConfig = null,
        photoModeEnabled = false,
        earthCloudsEnabled = true,
        earthPhotoTexture = null,
    }) {
        if (!this.root) {
            return;
        }

        this.syncMissionPanelPolicy(missionConfig);
        this.panelsEnabled = panelsVisible !== false;
        if (!this.panelsEnabled || !isDesktopViewport()) {
            this.root.hidden = true;
            return;
        }

        if (!scene || !activeCraft) {
            this.root.hidden = true;
            return;
        }

        this.root.hidden = false;
        this.composerFlybyTimeMs = this.resolveLunarFlybyTimeMs(timelineEventInfos);
        const flybyWindow = resolveLunarFlybyWindowMs(timelineEventInfos);
        this.composerFlybyWindowStartMs = flybyWindow.startMs;
        this.composerFlybyWindowEndMs = flybyWindow.endMs;
        this.composerTimelinePhases = buildTimelinePhases({
            phaseConfig: missionConfig?.timelinePhases || null,
            eventInfos: timelineEventInfos,
        });
        this.composerFlybyEvents = resolveFlybyPlannerEvents(timelineEventInfos);
        activeCraft.getWorldPosition(this.craftWorld);
        const normalizeSunDirection = (target, candidate) => {
            if (candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z)) {
                target.set(candidate.x, candidate.y, candidate.z);
            }
            const len = target.length();
            if (Number.isFinite(len) && len > 1e-12) {
                target.multiplyScalar(1 / len);
                return true;
            }
            target.set(1, 0, 0);
            return false;
        };

        const fallbackSun = (
            sunDirection &&
            Number.isFinite(sunDirection.x) &&
            Number.isFinite(sunDirection.y) &&
            Number.isFinite(sunDirection.z)
        )
            ? sunDirection
            : { x: 1, y: 0, z: 0 };
        this.sunDirectionWorld.set(fallbackSun.x, fallbackSun.y, fallbackSun.z);
        normalizeSunDirection(this.sunDirectionEarthWorld, sunDirections?.earthCentered || fallbackSun);
        normalizeSunDirection(this.sunDirectionMoonWorld, sunDirections?.moonCentered || sunDirections?.earthCentered || fallbackSun);
        normalizeSunDirection(this.sunDirectionCraftWorld, sunDirections?.craftCenteredLightTime || sunDirections?.craftCentered || sunDirections?.earthCentered || fallbackSun);
        const nowMs = performance.now();
        const refreshAnalytics = !Number.isFinite(this.analyticsLastUpdateMs) || (nowMs - this.analyticsLastUpdateMs) >= 120;
        if (refreshAnalytics) {
            this.cachedMoonPhaseInfo = this.computeMoonPhaseInfo({ earth, moon, sun });
            this.cachedMoonVisibilityInfo = this.computeCraftMoonVisibilityInfo({ activeCraft, earth, moon, sun });
            this.analyticsLastUpdateMs = nowMs;
        }
        // Keep auxiliary craft views physically faithful: camera sits at the
        // craft origin (no artificial standoff), so body occultations such as
        // Earth-rise behind the Moon remain geometrically correct.
        const standoffDistance = 0;

        let visiblePanels = 0;
        let animatedComposerCoronaPanels = 0;
        let suppressedLines = null;
        const ensureLinesSuppressed = () => {
            if (!suppressedLines) {
                suppressedLines = this.suppressLinePrimitives(scene);
            }
        };
        const ensureLinesVisible = () => {
            if (suppressedLines) {
                this.restoreVisibility(suppressedLines);
                suppressedLines = null;
            }
        };
        ensureLinesSuppressed();
        let suppressedCrafts = null;
        const ensureCraftsSuppressed = () => {
            if (!suppressedCrafts) {
                suppressedCrafts = this.suppressCraftVisuals({ activeCraft, craftsById, dronesById });
            }
        };
        const ensureCraftsVisible = () => {
            if (suppressedCrafts) {
                this.restoreVisibility(suppressedCrafts);
                suppressedCrafts = null;
            }
        };
        ensureCraftsSuppressed();
        const hasSkyContainer = !!skyContainer?.position;
        if (hasSkyContainer) {
            this.originalSkyPosition.copy(skyContainer.position);
        }
        const hasSunRenderer = !!(sunRenderer?.setReferencePosition);
        if (hasSunRenderer) {
            sunRenderer.getReferencePosition?.(this.originalSunReference);
        }
        const restoreSharedBodyAmbient = this.applySharedComposerBodyAmbientLighting({
            earth,
            moon,
        });

        try {
            for (const panelState of this.panels) {
                if (panelState.missionEnabled !== true) {
                    this.setPanelMissionEnabled(panelState, false);
                    continue;
                }
                const context = { activeCraft, earth, moon, sun };
                if (panelState.mode === "orbit-xy") {
                    if (panelState.deleted === true || panelState.closed === true) {
                        this.setPanelVisible(panelState, false);
                        continue;
                    }
                    if (panelState.minimized === true) {
                        this.setPanelVisible(panelState, false);
                        continue;
                    }
                    ensureLinesVisible();
                    ensureCraftsVisible();
                    const rendered = this.renderOrbitPlanePanel(panelState, {
                        scene,
                        activeCraft,
                        earth,
                        moon,
                        earthRadius,
                        moonRadius,
                        missionConfig,
                    });
                    if (rendered) {
                        visiblePanels += 1;
                    }
                    ensureLinesSuppressed();
                    ensureCraftsSuppressed();
                    continue;
                }
                if (panelState.mode === "composer") {
                    ensureLinesSuppressed();
                    ensureCraftsSuppressed();
                    if (panelState.deleted === true || panelState.closed === true) {
                        this.setPanelVisible(panelState, false);
                        continue;
                    }
                    if (panelState.minimized === true) {
                        this.setPanelVisible(panelState, false);
                        continue;
                    }
                    if (sunRenderer?.setDirection) {
                        const panelSunDirection = this.resolveSunDirectionForPanel(panelState);
                        sunRenderer.setDirection(panelSunDirection.x, panelSunDirection.y, panelSunDirection.z);
                    }
                    const rendered = this.renderComposerPanel(panelState, {
                        animationScene,
                        scene,
                        skyRenderer,
                        latestSceneState,
                        activeCraft,
                        earth,
                        moon,
                        sun,
                        sunRenderer,
                        earthRadius,
                        moonRadius,
                        missionConfig,
                        referenceCamera,
                        hasSkyContainer,
                        skyContainer,
                        earthCloudsEnabled,
                        earthDayTexture: earthPhotoTexture,
                    });
                    if (rendered) {
                        visiblePanels += 1;
                        if (panelState.composerSolarEclipseActive === true) {
                            animatedComposerCoronaPanels += 1;
                        }
                    }
                    continue;
                }
                ensureLinesSuppressed();
                ensureCraftsSuppressed();
                const hasAnchor = this.resolvePositionForKey(panelState.anchorKey, context, this.anchorWorld);
                const targetObject = panelState.targetKey === "earth"
                    ? earth
                    : (panelState.targetKey === "moon" ? moon : null);
                const hasTarget = this.resolvePositionForKey(panelState.targetKey, context, this.targetWorld);
                if (!hasAnchor || !targetObject || !hasTarget) {
                    this.setPanelVisible(panelState, false);
                    continue;
                }
                if (panelState.deleted === true || panelState.closed === true) {
                    this.setPanelVisible(panelState, false);
                    continue;
                }
                if (panelState.minimized === true) {
                    this.setPanelVisible(panelState, false);
                    continue;
                }

                const distanceSq = this.anchorWorld.distanceToSquared(this.targetWorld);
                if (!Number.isFinite(distanceSq) || distanceSq <= 1e-14) {
                    this.setPanelVisible(panelState, false);
                    continue;
                }

                this.setPanelVisible(panelState, true);
                visiblePanels += 1;
                this.syncPanelSize(panelState);

                if (referenceCamera) {
                    if (
                        Math.abs(panelState.camera.near - referenceCamera.near) > 1e-9 ||
                        Math.abs(panelState.camera.far - referenceCamera.far) > 1e-9
                    ) {
                        panelState.camera.near = referenceCamera.near;
                        panelState.camera.far = referenceCamera.far;
                        panelState.camera.updateProjectionMatrix();
                    }
                }

                this.viewDir.subVectors(this.targetWorld, this.anchorWorld).normalize();
                panelState.camera.position.copy(this.anchorWorld);
                if (standoffDistance > 0) {
                    this.cameraOffset.copy(this.viewDir).multiplyScalar(-standoffDistance);
                    panelState.camera.position.add(this.cameraOffset);
                }

                this.applyEclipticNorthUp(panelState.camera, this.targetWorld);

                const radiusHint = panelState.targetKey === "earth" ? earthRadius : moonRadius;
                const targetRadius = Number.isFinite(radiusHint) && radiusHint > 0
                    ? radiusHint
                    : this.estimateObjectRadius(targetObject, 1);
                const distanceToTarget = panelState.camera.position.distanceTo(this.targetWorld);

                if (panelState.autoFovEnabled) {
                    const autoFovDegrees = this.computeAutoFovDegrees({
                        distanceToTarget,
                        targetRadius,
                        aspect: panelState.camera.aspect,
                    });
                    this.setPanelFov(panelState, this.clampAutoFovDegrees(panelState, autoFovDegrees));
                }
                panelState.camera.lookAt(this.targetWorld);

                if (hasSkyContainer) {
                    panelState.camera.getWorldPosition(this.panelCameraWorldPosition);
                    if (skyContainer.parent?.worldToLocal) {
                        this.panelSkyLocalPosition.copy(this.panelCameraWorldPosition);
                        skyContainer.parent.worldToLocal(this.panelSkyLocalPosition);
                        skyContainer.position.copy(this.panelSkyLocalPosition);
                    } else {
                        skyContainer.position.copy(this.panelCameraWorldPosition);
                    }
                }
                if (hasSunRenderer) {
                    panelState.camera.getWorldPosition(this.panelCameraWorldPosition);
                    const sunParent = sunRenderer.group?.parent;
                    if (sunParent?.worldToLocal) {
                        this.panelSunLocalPosition.copy(this.panelCameraWorldPosition);
                        sunParent.worldToLocal(this.panelSunLocalPosition);
                        sunRenderer.setReferencePosition(
                            this.panelSunLocalPosition.x,
                            this.panelSunLocalPosition.y,
                            this.panelSunLocalPosition.z,
                        );
                    } else {
                        sunRenderer.setReferencePosition(
                            this.panelCameraWorldPosition.x,
                            this.panelCameraWorldPosition.y,
                            this.panelCameraWorldPosition.z,
                        );
                    }
                }
                if (sunRenderer?.setDirection) {
                    const panelSunDirection = this.resolveSunDirectionForPanel(panelState);
                    sunRenderer.setDirection(panelSunDirection.x, panelSunDirection.y, panelSunDirection.z);
                }
                const photoModePresentation = resolvePhotoModeLightingPresentation({
                    enabled: photoModeEnabled,
                    cameraPosition: panelState.camera.position,
                    earthPosition: this.earthWorld,
                    earthRadius,
                    moonPosition: this.moonWorld,
                    moonRadius,
                });
                const restorePhotoModeBodyPresentation = applyPhotoModeBodyPresentation({
                    earth,
                    moon,
                    presentation: photoModePresentation,
                    earthDayTexture: earthPhotoTexture,
                    earthDayTextureBlend: earthCloudsEnabled === false ? 0 : null,
                });
                const restorePhotoModeExposure = applyPhotoModeExposure({
                    renderer: panelState.renderer,
                    presentation: photoModePresentation,
                });
                try {
                    this.renderAuxiliaryPanelLayers(panelState, scene, {
                        animationScene,
                        renderSkyLayer: hasSkyContainer && skyContainer?.visible !== false,
                    });
                } finally {
                    restorePhotoModeExposure();
                    restorePhotoModeBodyPresentation();
                }

                if (panelState.infoMode === "moon-phase") {
                    const phase = this.cachedMoonPhaseInfo;
                    if (phase) {
                        this.setPanelInfo(
                            panelState,
                            `Phase: ${phase.phaseName}`,
                            `Sun separation: ${phase.elongationDeg.toFixed(1)}°`,
                        );
                    } else {
                        this.setPanelInfo(panelState, "Phase: --", "Sun separation: --");
                    }
                } else if (panelState.infoMode === "moon-visibility") {
                    const visibility = this.cachedMoonVisibilityInfo;
                    if (visibility) {
                        const hasEarthWorld = this.getObjectWorldPosition(earth, this.earthWorld);
                        if (!hasEarthWorld) {
                            this.clearPanelOverlay(panelState);
                        }
                        if (hasEarthWorld) {
                            this.tmpVectorC.subVectors(this.earthWorld, this.targetWorld);
                            if (this.tmpVectorC.lengthSq() > 1e-18) {
                                this.tmpVectorC.normalize();
                            } else {
                                this.tmpVectorC.set(1, 0, 0);
                            }
                        } else {
                            this.tmpVectorC.set(1, 0, 0);
                        }
                        this.renderMoonFarSideOverlay(panelState, {
                            distanceToTarget,
                            targetRadius,
                            earthDirectionWorld: this.tmpVectorC,
                        });
                        this.setPanelInfo(
                            panelState,
                            "Visible lunar surface",
                            `${visibility.nearPct}% near (${visibility.nearDayPct}% day; ${visibility.nearNightPct}% night) ${visibility.farPct}% far (${visibility.farDayPct}% day; ${visibility.farNightPct}% night)`,
                            {
                                pillText: panelState.farSideTintEnabled ? "Far Side: ON" : "Far Side: OFF",
                                pillVariant: "far",
                                pillInteractive: true,
                                pillOn: panelState.farSideTintEnabled === true,
                            },
                        );
                    } else {
                        this.clearPanelOverlay(panelState);
                        this.setPanelInfo(panelState, "Visible lunar surface", "No visibility data");
                    }
                } else {
                    this.clearPanelOverlay(panelState);
                    this.setPanelInfo(panelState, "", "");
                }
            }
        } finally {
            restoreSharedBodyAmbient();
            if (hasSkyContainer) {
                skyContainer.position.copy(this.originalSkyPosition);
            }
            if (hasSunRenderer) {
                sunRenderer.setReferencePosition(
                    this.originalSunReference.x,
                    this.originalSunReference.y,
                    this.originalSunReference.z,
                );
                sunRenderer.setDirection(
                    this.sunDirectionEarthWorld.x,
                    this.sunDirectionEarthWorld.y,
                    this.sunDirectionEarthWorld.z,
                );
            }
            if (suppressedCrafts) {
                this.restoreVisibility(suppressedCrafts);
            }
            if (suppressedLines) {
                this.restoreVisibility(suppressedLines);
            }
        }

        this.root.hidden = visiblePanels === 0;
        if (animatedComposerCoronaPanels > 0) {
            this.requestComposerCoronaAnimationFrame();
        }
    }

    dispose() {
        if (!this.root) {
            return;
        }

        window.removeEventListener("resize", this.handleResizeBound);
        document.removeEventListener("moon-mission:auxiliary-panels-layout-request", this.handleExternalLayoutRequestBound);
        document.removeEventListener("mission-media-item-select", this.handleMissionMediaItemSelectBound);
        if (this.panelResizeObserver) {
            this.panelResizeObserver.disconnect();
            this.panelResizeObserver = null;
        }
        if (this.pendingResizeRaf != null) {
            cancelAnimationFrame(this.pendingResizeRaf);
            this.pendingResizeRaf = null;
        }
        if (this.composerCoronaAnimationRaf != null) {
            cancelAnimationFrame(this.composerCoronaAnimationRaf);
            this.composerCoronaAnimationRaf = null;
        }
        if (this.defaultLayoutRaf != null) {
            cancelAnimationFrame(this.defaultLayoutRaf);
            this.defaultLayoutRaf = null;
        }
        if (this.visiblePanelsRefreshRaf != null) {
            cancelAnimationFrame(this.visiblePanelsRefreshRaf);
            this.visiblePanelsRefreshRaf = null;
        }
        if (this.persistStateTimeout != null) {
            clearTimeout(this.persistStateTimeout);
            this.persistStateTimeout = null;
        }
        this.pendingResizePanelStates.clear();
        this.dragState = null;
        for (const panelState of this.panels) {
            if (panelState.visibleRefreshRaf != null) {
                cancelAnimationFrame(panelState.visibleRefreshRaf);
                panelState.visibleRefreshRaf = null;
            }
            panelState.fovSlider.removeEventListener("input", panelState.onFovInput);
            panelState.autoToggle.removeEventListener("click", panelState.onAutoToggleClick);
            panelState.infoButton.removeEventListener("click", panelState.onInfoClick);
            panelState.minimizeButton?.removeEventListener?.("click", panelState.onMinimizeClick);
            panelState.expandButton.removeEventListener("click", panelState.onExpandClick);
            panelState.closeButton.removeEventListener("click", panelState.onCloseClick);
            panelState.deleteButton.removeEventListener("click", panelState.onDeleteClick);
            panelState.chipButton.removeEventListener("click", panelState.onChipClick);
            unregisterMissionPanel(panelState.panelRegistryId);
            if (panelState.onInfoPillClick) {
                panelState.infoPill.removeEventListener("click", panelState.onInfoPillClick);
            }
            if (panelState.onComposerLookFreeClick) {
                panelState.composerLookFreeButton?.removeEventListener("click", panelState.onComposerLookFreeClick);
            }
            if (panelState.onComposerLookEarthClick) {
                panelState.composerLookEarthButton?.removeEventListener("click", panelState.onComposerLookEarthClick);
            }
            if (panelState.onComposerLookMoonClick) {
                panelState.composerLookMoonButton?.removeEventListener("click", panelState.onComposerLookMoonClick);
            }
            if (panelState.onComposerResetClick) {
                panelState.composerResetButton?.removeEventListener("click", panelState.onComposerResetClick);
            }
            if (panelState.onComposerTimelineInput) {
                panelState.composerTimelineSlider?.removeEventListener("input", panelState.onComposerTimelineInput);
            }
            if (panelState.onComposerEarthAmbientInput) {
                panelState.composerEarthAmbientSlider?.removeEventListener("input", panelState.onComposerEarthAmbientInput);
            }
            if (panelState.onComposerMoonAmbientInput) {
                panelState.composerMoonAmbientSlider?.removeEventListener("input", panelState.onComposerMoonAmbientInput);
            }
            if (panelState.onComposerEarthshineInput) {
                panelState.composerEarthshineSlider?.removeEventListener("input", panelState.onComposerEarthshineInput);
            }
            if (panelState.onComposerMoonshineInput) {
                panelState.composerMoonshineSlider?.removeEventListener("input", panelState.onComposerMoonshineInput);
            }
            if (panelState.onComposerMoonOutlineToggle) {
                panelState.composerMoonOutlineCheckbox?.removeEventListener("change", panelState.onComposerMoonOutlineToggle);
            }
            if (panelState.onComposerSeeThroughToggle) {
                panelState.composerSeeThroughCheckbox?.removeEventListener("change", panelState.onComposerSeeThroughToggle);
            }
            if (panelState.onComposerControlsToggleClick) {
                panelState.composerControlsToggleButton?.removeEventListener("click", panelState.onComposerControlsToggleClick);
            }
            if (panelState.onComposerOpticsToggleClick) {
                panelState.composerOpticsToggleButton?.removeEventListener("click", panelState.onComposerOpticsToggleClick);
            }
            if (panelState.onComposerOpticsPhysicalClick) {
                panelState.composerOpticsPhysicalButton?.removeEventListener("click", panelState.onComposerOpticsPhysicalClick);
            }
            if (panelState.onComposerOpticsCameraClick) {
                panelState.composerOpticsCameraButton?.removeEventListener("click", panelState.onComposerOpticsCameraClick);
            }
            if (panelState.onComposerExposureInput) {
                panelState.composerExposureSlider?.removeEventListener("input", panelState.onComposerExposureInput);
            }
            if (panelState.onComposerAutoExposureChange) {
                panelState.composerAutoExposureCheckbox?.removeEventListener("change", panelState.onComposerAutoExposureChange);
            }
            if (panelState.onComposerOpticsStrengthInput) {
                panelState.composerOpticsStrengthSlider?.removeEventListener("input", panelState.onComposerOpticsStrengthInput);
            }
            if (panelState.onComposerOpticsHaloInput) {
                panelState.composerOpticsHaloSlider?.removeEventListener("input", panelState.onComposerOpticsHaloInput);
            }
            if (panelState.onComposerOpticsStarburstInput) {
                panelState.composerOpticsStarburstSlider?.removeEventListener("input", panelState.onComposerOpticsStarburstInput);
            }
            if (panelState.onComposerOpticsFlareInput) {
                panelState.composerOpticsFlareSlider?.removeEventListener("input", panelState.onComposerOpticsFlareInput);
            }
            if (panelState.onComposerEclipseCoronaIntensityInput) {
                panelState.composerEclipseCoronaIntensitySlider?.removeEventListener(
                    "input",
                    panelState.onComposerEclipseCoronaIntensityInput,
                );
            }
            if (panelState.onComposerEclipseCoronaMotionInput) {
                panelState.composerEclipseCoronaMotionSlider?.removeEventListener(
                    "input",
                    panelState.onComposerEclipseCoronaMotionInput,
                );
            }
            if (panelState.onComposerEclipseCoronaStructureInput) {
                panelState.composerEclipseCoronaStructureSlider?.removeEventListener(
                    "input",
                    panelState.onComposerEclipseCoronaStructureInput,
                );
            }
            if (panelState.onComposerEclipseZodiacalDustInput) {
                panelState.composerEclipseZodiacalDustSlider?.removeEventListener(
                    "input",
                    panelState.onComposerEclipseZodiacalDustInput,
                );
            }
            if (panelState.onComposerStarMagnitudeInput) {
                panelState.composerStarMagnitudeSlider?.removeEventListener("input", panelState.onComposerStarMagnitudeInput);
            }
            if (panelState.onComposerTranscriptSyncedChange) {
                panelState.composerTranscriptSyncedCheckbox?.removeEventListener(
                    "change",
                    panelState.onComposerTranscriptSyncedChange,
                );
            }
            if (panelState.onComposerTranscriptWindowInput) {
                panelState.composerTranscriptWindowSlider?.removeEventListener(
                    "input",
                    panelState.onComposerTranscriptWindowInput,
                );
            }
            if (panelState.onComposerTranscriptHoldInput) {
                panelState.composerTranscriptHoldSlider?.removeEventListener(
                    "input",
                    panelState.onComposerTranscriptHoldInput,
                );
            }
            if (panelState.onComposerTranscriptPrevClick) {
                panelState.composerTranscriptPrevButton?.removeEventListener("click", panelState.onComposerTranscriptPrevClick);
            }
            if (panelState.onComposerTranscriptNextClick) {
                panelState.composerTranscriptNextButton?.removeEventListener("click", panelState.onComposerTranscriptNextClick);
            }
            if (panelState.onComposerLunarFeatureStackCloseClick) {
                panelState.composerLunarFeatureStackCloseButton?.removeEventListener(
                    "click",
                    panelState.onComposerLunarFeatureStackCloseClick,
                );
            }
            if (panelState.onComposerLunarFeatureStackRestoreClick) {
                panelState.composerLunarFeatureStackRestoreButton?.removeEventListener(
                    "click",
                    panelState.onComposerLunarFeatureStackRestoreClick,
                );
            }
            if (panelState.onComposerLunarFeatureStackPointerDown) {
                panelState.composerLunarFeatureStackHeader?.removeEventListener(
                    "pointerdown",
                    panelState.onComposerLunarFeatureStackPointerDown,
                );
            }
            if (panelState.onComposerLunarFeatureStackPointerMove) {
                panelState.composerLunarFeatureStackHeader?.removeEventListener(
                    "pointermove",
                    panelState.onComposerLunarFeatureStackPointerMove,
                );
            }
            if (panelState.onComposerLunarFeatureStackPointerUp) {
                panelState.composerLunarFeatureStackHeader?.removeEventListener(
                    "pointerup",
                    panelState.onComposerLunarFeatureStackPointerUp,
                );
                panelState.composerLunarFeatureStackHeader?.removeEventListener(
                    "pointercancel",
                    panelState.onComposerLunarFeatureStackPointerUp,
                );
            }
            if (panelState.onComposerCloudsChange) {
                panelState.composerCloudsCheckbox?.removeEventListener("change", panelState.onComposerCloudsChange);
            }
            if (panelState.onComposerLunarCratersPillClick) {
                panelState.composerLunarCratersPill?.removeEventListener(
                    "click",
                    panelState.onComposerLunarCratersPillClick,
                );
            }
            if (panelState.onComposerSurfacePointsPillClick) {
                panelState.composerSurfacePointsPill?.removeEventListener(
                    "click",
                    panelState.onComposerSurfacePointsPillClick,
                );
            }
            if (panelState.onComposerSurfacePointsCloseClick) {
                panelState.composerSurfacePointControls?.close?.removeEventListener(
                    "click",
                    panelState.onComposerSurfacePointsCloseClick,
                );
            }
            if (panelState.onComposerSurfacePointToggle) {
                panelState.composerSurfacePointControls?.entries?.forEach?.(({ input }) => {
                    input?.removeEventListener?.("change", panelState.onComposerSurfacePointToggle);
                });
            }
            if (panelState.onComposerOverlayPanelEvent) {
                for (const panel of [
                    panelState.composerLunarCraterControls?.panel,
                    panelState.composerSurfacePointControls?.panel,
                ]) {
                    panel?.removeEventListener?.("pointerdown", panelState.onComposerOverlayPanelEvent);
                    panel?.removeEventListener?.("click", panelState.onComposerOverlayPanelEvent);
                    panel?.removeEventListener?.("wheel", panelState.onComposerOverlayPanelEvent);
                }
                panelState.onComposerOverlayPanelEvent = null;
            }
            if (panelState.unbindComposerLunarCraterControls) {
                panelState.unbindComposerLunarCraterControls();
                panelState.unbindComposerLunarCraterControls = null;
            }
            if (panelState.onComposerTimelinePointerDown) {
                panelState.composerTimelineSlider?.removeEventListener("pointerdown", panelState.onComposerTimelinePointerDown);
            }
            if (panelState.onComposerTimelinePointerUp) {
                panelState.composerTimelineSlider?.removeEventListener("pointerup", panelState.onComposerTimelinePointerUp);
                panelState.composerTimelineSlider?.removeEventListener("change", panelState.onComposerTimelinePointerUp);
            }
            if (panelState.onComposerPhasePrevClick) {
                panelState.composerPhasePrevButton?.removeEventListener("click", panelState.onComposerPhasePrevClick);
            }
            if (panelState.onComposerPhaseNextClick) {
                panelState.composerPhaseNextButton?.removeEventListener("click", panelState.onComposerPhaseNextClick);
            }
            if (panelState.onComposerTimelinePopupDocumentPointerDown) {
                document.removeEventListener(
                    "pointerdown",
                    panelState.onComposerTimelinePopupDocumentPointerDown,
                    true,
                );
            }
            if (panelState.onComposerTransportPlayClick) {
                panelState.composerTransportPlayButton?.removeEventListener("click", panelState.onComposerTransportPlayClick);
            }
            if (panelState.onComposerTransportMinusSecondClick) {
                panelState.composerTransportMinusSecondButton?.removeEventListener("click", panelState.onComposerTransportMinusSecondClick);
            }
            if (panelState.onComposerTransportMinusMinuteClick) {
                panelState.composerTransportMinusMinuteButton?.removeEventListener("click", panelState.onComposerTransportMinusMinuteClick);
            }
            if (panelState.onComposerTransportPlusMinuteClick) {
                panelState.composerTransportPlusMinuteButton?.removeEventListener("click", panelState.onComposerTransportPlusMinuteClick);
            }
            if (panelState.onComposerTransportPlusSecondClick) {
                panelState.composerTransportPlusSecondButton?.removeEventListener("click", panelState.onComposerTransportPlusSecondClick);
            }
            if (panelState.onComposerTransportSlowerClick) {
                panelState.composerTransportSlowerButton?.removeEventListener("click", panelState.onComposerTransportSlowerClick);
            }
            if (panelState.onComposerTransportSpeedClick) {
                panelState.composerTransportSpeedButton?.removeEventListener("click", panelState.onComposerTransportSpeedClick);
            }
            if (panelState.onComposerTransportFasterClick) {
                panelState.composerTransportFasterButton?.removeEventListener("click", panelState.onComposerTransportFasterClick);
            }
            if (panelState.onComposerInfoOverlayToggle) {
                panelState.composerInfoOverlayCheckbox?.removeEventListener("change", panelState.onComposerInfoOverlayToggle);
            }
            if (panelState.onComposerRollInput) {
                panelState.composerRollSlider?.removeEventListener("input", panelState.onComposerRollInput);
            }
            if (panelState.onComposerRollDialPointerDown) {
                panelState.composerRollDial?.removeEventListener("pointerdown", panelState.onComposerRollDialPointerDown);
            }
            if (panelState.onComposerRollDialPointerMove) {
                panelState.composerRollDial?.removeEventListener("pointermove", panelState.onComposerRollDialPointerMove);
            }
            if (panelState.onComposerRollDialPointerUp) {
                panelState.composerRollDial?.removeEventListener("pointerup", panelState.onComposerRollDialPointerUp);
                panelState.composerRollDial?.removeEventListener("pointercancel", panelState.onComposerRollDialPointerUp);
            }
            if (panelState.onComposerRaDecGridToggle) {
                panelState.composerRaDecGridCheckbox?.removeEventListener("change", panelState.onComposerRaDecGridToggle);
            }
            if (panelState.onComposerSkyLabelsToggle) {
                panelState.composerSkyLabelsCheckbox?.removeEventListener("change", panelState.onComposerSkyLabelsToggle);
            }
            if (panelState.onComposerConstellationLinesToggle) {
                panelState.composerConstellationLinesCheckbox?.removeEventListener(
                    "change",
                    panelState.onComposerConstellationLinesToggle,
                );
            }
            if (panelState.onComposerConstellationLabelsToggle) {
                panelState.composerConstellationLabelsCheckbox?.removeEventListener(
                    "change",
                    panelState.onComposerConstellationLabelsToggle,
                );
            }
            if (panelState.onComposerViewportPointerDown) {
                panelState.viewport.removeEventListener("pointerdown", panelState.onComposerViewportPointerDown);
            }
            if (panelState.onComposerViewportPointerMove) {
                panelState.viewport.removeEventListener("pointermove", panelState.onComposerViewportPointerMove);
            }
            if (panelState.onComposerViewportPointerLeave) {
                panelState.viewport.removeEventListener("pointerleave", panelState.onComposerViewportPointerLeave);
            }
            if (panelState.onComposerViewportPointerUp) {
                panelState.viewport.removeEventListener("pointerup", panelState.onComposerViewportPointerUp);
                panelState.viewport.removeEventListener("pointercancel", panelState.onComposerViewportPointerUp);
            }
            if (panelState.onComposerViewportWheel) {
                panelState.viewport.removeEventListener("wheel", panelState.onComposerViewportWheel);
            }
            if (panelState.onOrbitViewportPointerDown) {
                panelState.viewport.removeEventListener("pointerdown", panelState.onOrbitViewportPointerDown);
            }
            if (panelState.onOrbitViewportPointerMove) {
                panelState.viewport.removeEventListener("pointermove", panelState.onOrbitViewportPointerMove);
            }
            if (panelState.onOrbitViewportPointerUp) {
                panelState.viewport.removeEventListener("pointerup", panelState.onOrbitViewportPointerUp);
                panelState.viewport.removeEventListener("pointercancel", panelState.onOrbitViewportPointerUp);
            }
            if (panelState.onOrbitViewportWheel) {
                panelState.viewport.removeEventListener("wheel", panelState.onOrbitViewportWheel);
            }
            if (panelState.onAuxiliaryViewportWheel) {
                panelState.viewport.removeEventListener("wheel", panelState.onAuxiliaryViewportWheel);
            }
            if (panelState.onComposerPanelGatePointerDown) {
                panelState.panel.removeEventListener("pointerdown", panelState.onComposerPanelGatePointerDown, true);
            }
            if (panelState.composerHintTimer != null) {
                clearTimeout(panelState.composerHintTimer);
                panelState.composerHintTimer = null;
            }
            const header = panelState.panel.querySelector(".aux-camera-view__header");
            if (header) {
                if (panelState.onPointerDown) {
                    header.removeEventListener("pointerdown", panelState.onPointerDown);
                }
                if (panelState.onPointerMove) {
                    header.removeEventListener("pointermove", panelState.onPointerMove);
                }
                if (panelState.onPointerUp) {
                    header.removeEventListener("pointerup", panelState.onPointerUp);
                }
                if (panelState.onPointerCancel) {
                    header.removeEventListener("pointercancel", panelState.onPointerCancel);
                }
            }
            if (panelState.resizeGrip) {
                if (panelState.onPanelResizePointerDown) {
                    panelState.panel.removeEventListener("pointerdown", panelState.onPanelResizePointerDown, true);
                    panelState.panel.removeEventListener("pointermove", panelState.onResizePointerMove);
                    panelState.panel.removeEventListener("pointerup", panelState.onResizePointerUp);
                    panelState.panel.removeEventListener("pointercancel", panelState.onResizePointerCancel);
                }
                if (panelState.onResizePointerDown) {
                    panelState.resizeGrip.removeEventListener("pointerdown", panelState.onResizePointerDown);
                }
                if (panelState.onResizePointerMove) {
                    panelState.resizeGrip.removeEventListener("pointermove", panelState.onResizePointerMove);
                }
                if (panelState.onResizePointerUp) {
                    panelState.resizeGrip.removeEventListener("pointerup", panelState.onResizePointerUp);
                }
                if (panelState.onResizePointerCancel) {
                    panelState.resizeGrip.removeEventListener("pointercancel", panelState.onResizePointerCancel);
                }
            }
            if (panelState.onPanelPointerDown) {
                panelState.panel.removeEventListener("pointerdown", panelState.onPanelPointerDown);
            }
            panelState.renderer.dispose();
            panelState.chipButton.remove();
        }
        this.panels.length = 0;
        this.root.remove();
        this.root = null;
        this.chipDock = null;
        this.chipDockLeft = null;
        this.chipDockRight = null;
    }
}

export {
    AuxiliaryCameraViewsManager,
    AUXILIARY_VIEW_CAMERA_PRESETS,
    computeComposerDragSensitivityScale,
    composerRollDialKnobOffset,
    isComposerPlanetVisibleForMagnitudeLimit,
    isComposerSkyLabelPointOccluded,
    normalizeComposerRollRad,
    resolveComposerSeeThroughMarkers,
    resolveComposerSkyLabelOccluders,
    resolveLunarFlybyTimeMs,
    resolveLunarFlybyWindowMs,
    rollRadFromDialPointer,
    selectSkyLabelCandidates as selectComposerSkyLabelCandidates,
    shouldEnableAuxiliaryPanels,
    shouldRenderComposerLunarCraterHover,
};
