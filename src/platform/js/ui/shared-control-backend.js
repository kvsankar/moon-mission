import { resolvePairKey } from "../core/domain/camera-policy.js";
import {
    applyDimensionSelection,
    applyOriginMode,
    applyPlaneSelection,
    applyViewSettings,
    readViewSettings,
} from "./ui-state.js";

/**
 * @param {{
 *   id?: string,
 *   name?: string,
 *   value?: any,
 *   checked?: boolean,
 *   detail?: any,
 * }} options
 */
function buildSyntheticControlEvent(options = {}) {
    const { id, name, value, checked, detail } = options;
    return {
        detail,
        target: {
            id,
            name,
            value,
            checked,
        },
    };
}

function normalizeOriginMode(originMode) {
    const normalizedMode = String(originMode || "").trim().toLowerCase();
    if (normalizedMode === "earth" || normalizedMode === "geo") return "geo";
    if (normalizedMode === "moon" || normalizedMode === "lunar") return "lunar";
    if (normalizedMode === "relative") return "relative";
    return "geo";
}

function resolveOriginControlId(originMode) {
    if (originMode === "lunar") return "origin-moon";
    if (originMode === "relative") return "origin-relative";
    return "origin-earth";
}

function resolvePlaneControlId(planeSelection) {
    const normalizedSelection = String(planeSelection || "DEFAULT").toUpperCase();
    if (normalizedSelection === "XY") return "checkbox-lock-xy";
    if (normalizedSelection === "YZ") return "checkbox-lock-yz";
    if (normalizedSelection === "ZX") return "checkbox-lock-zx";
    if (normalizedSelection === "XY-") return "checkbox-lock-xy-minus";
    if (normalizedSelection === "YZ-") return "checkbox-lock-yz-minus";
    if (normalizedSelection === "ZX-") return "checkbox-lock-zx-minus";
    return "checkbox-lock-default";
}

function invoke(handler, event) {
    if (typeof handler === "function") {
        return handler(event);
    }
    return undefined;
}

export function createSharedControlBackend(handlers = {}) {
    const {
        toggleMode,
        toggleRelativeMode,
        changeCameraFromTo,
        getCameraState = () => ({ positionMode: "manual", lookMode: "manual" }),
        togglePlane,
        setView,
        setDimensionTop,
        toggleLanding,
    } = handlers;

    function commitOriginMode(originMode) {
        const normalizedMode = normalizeOriginMode(originMode);
        applyOriginMode(normalizedMode);
        const event = buildSyntheticControlEvent({
            id: resolveOriginControlId(normalizedMode),
            name: "mode",
            value: normalizedMode,
        });
        if (normalizedMode === "relative") {
            return invoke(toggleRelativeMode, event);
        }
        return invoke(toggleMode, event);
    }

    function commitCameraPositionMode(positionMode, options = {}) {
        return invoke(
            changeCameraFromTo,
            buildSyntheticControlEvent({
                id: options.sourceId || "camera-position",
                name: options.sourceName || "camera-position",
                value: positionMode,
                detail: options.preserveManualRelease
                    ? { preserveManualRelease: true }
                    : undefined,
            }),
        );
    }

    function commitCameraLookMode(lookMode, options = {}) {
        return invoke(
            changeCameraFromTo,
            buildSyntheticControlEvent({
                id: options.sourceId || "camera-look",
                name: options.sourceName || "camera-look",
                value: lookMode,
                detail: options.preserveManualRelease
                    ? { preserveManualRelease: true }
                    : undefined,
            }),
        );
    }

    function commitCameraPair(positionMode, lookMode, options = {}) {
        return invoke(
            changeCameraFromTo,
            buildSyntheticControlEvent({
                id: options.sourceId || "camera-pair",
                name: "camera-pair",
                value: resolvePairKey(positionMode, lookMode),
                detail: options.preserveManualRelease
                    ? { preserveManualRelease: true }
                    : undefined,
            }),
        );
    }

    function commitPlaneSelection(planeSelection) {
        applyPlaneSelection(planeSelection);
        return invoke(
            togglePlane,
            buildSyntheticControlEvent({
                id: resolvePlaneControlId(planeSelection),
                name: "plane",
                value: planeSelection,
            }),
        );
    }

    function commitDimensionSelection(dimension) {
        applyDimensionSelection(dimension);
        return invoke(
            setDimensionTop,
            buildSyntheticControlEvent({
                id: `dimension-${dimension}`,
                name: "dimension",
                value: dimension,
            }),
        );
    }

    function commitViewPatch(patch, options = {}) {
        applyViewSettings(patch);
        invoke(
            setView,
            buildSyntheticControlEvent({
                id: options.sourceId || "view-settings",
                name: options.sourceName || "view",
                value: options.value,
                checked: options.checked,
            }),
        );
        return readViewSettings();
    }

    function commitViewSetting(settingKey, value, options = {}) {
        return commitViewPatch(
            { [settingKey]: value },
            {
                ...options,
                value,
                checked: typeof value === "boolean" ? value : options.checked,
            },
        );
    }

    function toggleViewSetting(settingKey, options = {}) {
        const currentSettings = readViewSettings();
        const nextValue = !Boolean(currentSettings[settingKey]);
        return commitViewSetting(settingKey, nextValue, options);
    }

    function toggleLandingMode(options = {}) {
        return invoke(
            toggleLanding,
            buildSyntheticControlEvent({
                id: options.sourceId || "landing",
                name: options.sourceName || "landing",
            }),
        );
    }

    return {
        getCameraState,
        commitOriginMode,
        commitCameraPositionMode,
        commitCameraLookMode,
        commitCameraPair,
        commitPlaneSelection,
        commitDimensionSelection,
        commitViewPatch,
        commitViewSetting,
        toggleViewSetting,
        toggleLandingMode,
    };
}
