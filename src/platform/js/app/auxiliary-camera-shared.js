import { COMPOSER_SURFACE_POINT_CONTROL_GROUPS, COMPOSER_PLANET_MAGNITUDE_BY_BODY, COMPOSER_CONSTELLATION_LABELS } from "./auxiliary-camera-composer-catalogs.js";
import {
    applyComposerBodyAmbientLighting,
    resolveComposerBodyAmbientState,
    applyComposerEarthshineGain,
    applyComposerMoonshineGain,
    updateBodyNorthWorld,
    computeComposerAutoFovDegrees,
    resolveComposerSolarEclipseState,
    resolveComposerEclipseCoronaVisualState,
    resolveComposerSunOpticsProfile,
    resolveComposerExposureState,
    resolveComposerBodyDiscInView,
    applyComposerExposureProfile,
} from "./auxiliary-camera-composer-lighting.js";
import {
    computeOrbitPlaneHalfHeight,
    createOrbitPlaneProjector,
    drawOrbitPlaneMarker,
    drawOrbitPlaneLineObject,
    resolveOrbitPlaneCurveBodyIds,
    resolveOrbitPlaneCurveStroke,
    drawOrbitPlaneCurve,
    drawOrbitPlaneCurvesFromSceneData,
    renderOrbitPlane2DOverlay,
    renderOrbitPlanePanel,
} from "./auxiliary-camera-orbit-plane.js";
import {
    computeMoonPhaseInfo,
    resolveMoonPhaseName,
    roundPercentParts,
    computeCraftMoonVisibilityInfo,
} from "./auxiliary-camera-lunar-analytics.js";
import {
    clearPanelOverlay as clearAuxiliaryPanelOverlay,
    renderComposerBottomMetricsOverlay,
    renderComposerMoonOutlineOverlay,
    renderComposerRaDecGridOverlay,
    renderComposerSeeThroughOverlay,
    renderComposerSkyLabelOverlay,
    renderMoonFarSideOverlay,
} from "./auxiliary-camera-overlays.js";
import { createAuxiliaryCameraPanel } from "./auxiliary-camera-panel-factory.js";
import { registerRenderDeviceCapabilities, resolveInteractivePixelRatio } from "../core/domain/render-device-policy.js";
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
    resolveFlybyPlannerEvents,
    resolveLunarFlybyTimeMs,
    resolveLunarFlybyWindowMs,
} from "../core/domain/composer-flyby-events.js";
import { createComposerDisclosure } from "../ui/composer-disclosure.js";
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
    focusDockviewWorkflowPanel,
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
const PANEL_TRANSPORT_CLEARANCE_PX = 14;
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
const COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION = 0.5;
const COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION = 0.34;
const KM_TO_MILES = 0.621371192237334;

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

function createAuxiliaryWebGLRendererWithFallback(THREE) {
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

export {
    AUTO_FOV_MARGIN_SCALE,
    AUTO_FOV_MAX_DEGREES,
    AUTO_FOV_MIN_DEGREES,
    AUXILIARY_VIEW_CAMERA_PRESETS,
    AUXILIARY_WEBGL_RENDERER_FALLBACK_ATTEMPTS,
    AUXILIARY_WHEEL_ZOOM_SENSITIVITY,
    AUX_FOV_PREFERENCE_VERSION,
    COMPOSER_AUTO_FOV_FOREGROUND_DIAMETER_FRACTION,
    COMPOSER_AUTO_FOV_MAX_DEGREES,
    COMPOSER_AUTO_FOV_MIN_DEGREES,
    COMPOSER_AUTO_FOV_PREFERENCE_VERSION,
    COMPOSER_AUTO_FOV_TARGET_DIAMETER_FRACTION,
    COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT,
    COMPOSER_CAMERA_EXPOSURE,
    COMPOSER_CAMERA_SKY_CONSTELLATION_OPACITY_CAP,
    COMPOSER_CAMERA_SKY_STARMAP_OPACITY_CAP,
    COMPOSER_CONSTELLATION_LABELS,
    COMPOSER_CONSTELLATION_LINES_OPACITY_CAP,
    COMPOSER_CONTROLS_COLLAPSE_STATE_VERSION,
    COMPOSER_CONTROLS_PANEL_ID,
    COMPOSER_DEFAULT_ASPECT_RATIO,
    COMPOSER_DEFAULT_EARTHSHINE_GAIN,
    COMPOSER_DEFAULT_EARTH_AMBIENT,
    COMPOSER_DEFAULT_MOONSHINE_GAIN,
    COMPOSER_DEFAULT_MOON_AMBIENT,
    COMPOSER_DEFAULT_ROLL_RAD,
    COMPOSER_DRAG_REFERENCE_FOV_DEGREES,
    COMPOSER_DRAG_SENSITIVITY,
    COMPOSER_ECLIPSE_AUTO_EXPOSURE_EV,
    COMPOSER_ECLIPSE_CORONA_DEFAULT,
    COMPOSER_ECLIPSE_CORONA_MAX,
    COMPOSER_ECLIPSE_CORONA_MIN,
    COMPOSER_ECLIPSE_CORONA_VARIATION_DEFAULT,
    COMPOSER_ECLIPSE_ZODIACAL_DUST_DEFAULT,
    COMPOSER_EXPOSURE_EV_DEFAULT,
    COMPOSER_EXPOSURE_EV_MAX,
    COMPOSER_EXPOSURE_EV_MIN,
    COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_LEAD_SECONDS,
    COMPOSER_LUNAR_FEATURE_STACK_ACTIVE_TRAIL_SECONDS,
    COMPOSER_LUNAR_FEATURE_STACK_VISIBLE_WINDOW_SECONDS,
    COMPOSER_MANUAL_FOV_MAX_DEGREES,
    COMPOSER_MAX_AMBIENT,
    COMPOSER_MAX_EARTHSHINE_GAIN,
    COMPOSER_MAX_MOONSHINE_GAIN,
    COMPOSER_MAX_PITCH_RAD,
    COMPOSER_MIN_AMBIENT,
    COMPOSER_MIN_EARTHSHINE_GAIN,
    COMPOSER_MIN_MOONSHINE_GAIN,
    COMPOSER_MOONSHINE_LIFT_SCALE,
    COMPOSER_MOON_OUTLINE_RGBA,
    COMPOSER_MOON_OUTLINE_THICKNESS_PX,
    COMPOSER_MOON_SHADOW_LIFT_SCALE,
    COMPOSER_OPTICS_ADVANCED_DEFAULT,
    COMPOSER_OPTICS_ADVANCED_MAX,
    COMPOSER_OPTICS_ADVANCED_MIN,
    COMPOSER_OPTICS_STRENGTH_DEFAULT,
    COMPOSER_OPTICS_STRENGTH_MAX,
    COMPOSER_OPTICS_STRENGTH_MIN,
    COMPOSER_PLANET_MAGNITUDE_BY_BODY,
    COMPOSER_RA_DEC_GRID_DEC_STEP_DEG,
    COMPOSER_RA_DEC_GRID_RA_STEP_DEG,
    COMPOSER_RENDER_EXPOSURE,
    COMPOSER_SEE_THROUGH_DASH_PX,
    COMPOSER_SEE_THROUGH_LINE_WIDTH_PX,
    COMPOSER_SEE_THROUGH_OPACITY,
    COMPOSER_SEE_THROUGH_PLANET_RADIUS_MAX_PX,
    COMPOSER_SEE_THROUGH_PLANET_RADIUS_MIN_PX,
    COMPOSER_SEE_THROUGH_SUN_RADIUS_MIN_PX,
    COMPOSER_SKY_CONSTELLATION_OPACITY_CAP,
    COMPOSER_SKY_LABEL_EDGE_MARGIN_PX,
    COMPOSER_SKY_LABEL_OCCLUSION_PADDING_PX,
    COMPOSER_SKY_LABEL_VISIBLE_FRACTION,
    COMPOSER_SKY_STARMAP_OPACITY_CAP,
    COMPOSER_SOLAR_ANGULAR_RADIUS_RAD,
    COMPOSER_STAR_LABEL_CATALOG,
    COMPOSER_STAR_MAGNITUDE_DEFAULT,
    COMPOSER_STAR_MAGNITUDE_MAX,
    COMPOSER_STAR_MAGNITUDE_MIN,
    COMPOSER_SURFACE_POINT_CONTROL_GROUPS,
    COMPOSER_TIMELINE_RESOLUTION,
    COMPOSER_TIMELINE_WINDOW_MS,
    COMPOSER_WHEEL_ZOOM_SENSITIVITY,
    KM_TO_MILES,
    LT,
    LUNAR_CRATER_VIEW_IDS,
    MOON_TARGET_AUTO_FOV_MIN_DEGREES,
    ORBIT_XY_AUTO_FOV_DEGREES,
    ORBIT_XY_WHEEL_ZOOM_SENSITIVITY,
    PANEL_ABOUT_ALIGNED_MIN_VIEWPORT_WIDTH,
    PANEL_CSS_MIN_SIDE_DEFAULT,
    PANEL_DEFAULT_HEIGHT_RATIO,
    PANEL_DEFAULT_HEIGHT_RATIO_COMPOSER,
    PANEL_DEFAULT_WIDTH_COMPOSER,
    PANEL_GAP_PX,
    PANEL_MARGIN_PX,
    PANEL_MIN_SIDE_COMPOSER,
    PANEL_MIN_SIDE_DEFAULT,
    PANEL_SPECS,
    PANEL_STATE_STORAGE_KEY,
    PANEL_TOP_OFFSET_PX,
    PANEL_TRANSPORT_CLEARANCE_PX,
    STARTUP_MINIMIZED_PANEL_IDS,
    STAR_NAME_CROSS_INDEX,
    TARGET_AUTO_FOV_MAX_DEGREES,
    TARGET_AUTO_FOV_MIN_DEGREES,
    applyComposerBodyAmbientLighting,
    applyComposerEarthshineGain,
    applyComposerExposureProfile,
    applyComposerMoonshineGain,
    applyPhotoModeBodyPresentation,
    applyPhotoModeExposure,
    asTrimmedString,
    bringPanelElementToFront,
    buildTimelinePhases,
    clampFovDegrees,
    clearAuxiliaryPanelOverlay,
    composerRollDialKnobOffset,
    computeComposerAutoFovDegrees,
    computeComposerDragSensitivityScale,
    computeCraftMoonVisibilityInfo,
    computeMoonPhaseInfo,
    computeOrbitPlaneHalfHeight,
    computePhotoModeLightingPresentation,
    configureBodyRenderLayers,
    configureCraftRenderLayers,
    configureSkyRenderLayers,
    createAuxiliaryCameraPanel,
    createAuxiliaryWebGLRendererWithFallback,
    createComposerDisclosure,
    createComposerSurfacePointControls,
    createDefaultLunarFeatureViewState,
    createDefaultSurfacePointViewState,
    createLunarCraterControlPanelElements,
    createLunarFeatureViewAttachment,
    createOrbitPlaneProjector,
    drawOrbitPlaneCurve,
    drawOrbitPlaneCurvesFromSceneData,
    drawOrbitPlaneLineObject,
    drawOrbitPlaneMarker,
    focusDockviewWorkflowPanel,
    getAuxiliaryPanelFallbackState,
    getDockviewSpikeLayoutHost,
    getMissionPanelDefaultState,
    getMissionPanelLayoutPresetVersion,
    getSceneVisibleCraftIds,
    hasCurrentAuxFovPreferenceVersion,
    hasSurfacePointViewEnabled,
    inferMediaShotViewHint,
    isComposerPlanetVisibleForMagnitudeLimit,
    isComposerSkyLabelPointOccluded,
    isDesktopViewport,
    isDomElement,
    isDomEventInstance,
    isDomInstance,
    isFiniteScreenPoint,
    isMissionPanelEnabled,
    loadLunarFeatureMentionTimeline,
    mountMissionFovControl,
    normalizeComposerRollRad,
    normalizeMissionPanelState,
    patchSurfacePointViewState,
    readMissionPanelState,
    registerMissionPanel,
    registerRenderDeviceCapabilities,
    renderComposerBottomMetricsOverlay,
    renderComposerMoonOutlineOverlay,
    renderComposerRaDecGridOverlay,
    renderComposerSeeThroughOverlay,
    renderComposerSkyLabelOverlay,
    renderMoonFarSideOverlay,
    renderOrbitPlane2DOverlay,
    renderOrbitPlanePanel,
    renderWithLunarCraterView,
    renderWithSurfacePointView,
    resolveActiveTimelinePhaseIndex,
    resolveComposerBodyAmbientState,
    resolveComposerBodyDiscInView,
    resolveComposerEclipseCoronaVisualState,
    resolveComposerExposureState,
    resolveComposerSeeThroughMarkers,
    resolveComposerSkyLabelOccluders,
    resolveComposerSolarEclipseState,
    resolveComposerSunOpticsProfile,
    resolveComposerViewIntent,
    resolveDockedWorkflowPanelPosition,
    resolveFlybyPlannerEvents,
    resolveInteractivePixelRatio,
    resolveLunarFeatureMentionView,
    resolveLunarFlybyTimeMs,
    resolveLunarFlybyWindowMs,
    resolveMoonPhaseName,
    resolveOrbitPlaneCurveBodyIds,
    resolveOrbitPlaneCurveStroke,
    resolvePhotoModeLightingPresentation,
    resolveStarDisplayName,
    resolveTimelineEventHighlightState,
    rollRadFromDialPointer,
    roundPercentParts,
    safeParseJson,
    selectSkyLabelCandidates,
    shouldEnableAuxiliaryPanels,
    shouldEnableEarthriseComposer,
    shouldRenderComposerLunarCraterHover,
    shouldRenderLunarFeaturePointer,
    showMissionPanelInfo,
    timelinePhaseContainsTime,
    unregisterMissionPanel,
    updateBodyNorthWorld,
    updateMissionPanel,
    writeMissionPanelStates,
};
