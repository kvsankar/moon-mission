import { invokeMissionPanelAction } from "../app/panel-registry.js";
import { createCameraPillController } from "./camera-pill-controller.js";
import { createFocusPillController } from "./focus-pill-controller.js";
import { createPlanePillController } from "./plane-pill-controller.js";
import { createSharedControlBackend } from "./shared-control-backend.js";
import { createViewSettingsPillController } from "./view-settings-pill-controller.js";

function createMainControlControllers({
    toggleMode,
    toggleRelativeMode,
    changeCameraFromTo,
    togglePlane,
    setView,
    setDimensionTop,
    toggleLanding,
    getMoonRenderProfile,
    setMoonRenderProfile,
    getMoonRenderPipeline,
    setMoonRenderPipeline,
    getPhotoMode,
    setPhotoMode,
    headerPillStripController,
    createSharedControlBackendImpl = createSharedControlBackend,
    createCameraPillControllerImpl = createCameraPillController,
    createPlanePillControllerImpl = createPlanePillController,
    createViewSettingsPillControllerImpl = createViewSettingsPillController,
    createFocusPillControllerImpl = createFocusPillController,
    invokeMissionPanelActionImpl = invokeMissionPanelAction,
}) {
    const controlBackend = createSharedControlBackendImpl({
        toggleMode,
        toggleRelativeMode,
        changeCameraFromTo,
        togglePlane,
        setView,
        setDimensionTop,
        toggleLanding,
    });

    return {
        cameraPillController: createCameraPillControllerImpl({ controlBackend }),
        planePillController: createPlanePillControllerImpl({ controlBackend }),
        viewSettingsPillController: createViewSettingsPillControllerImpl({
            controlBackend,
            getMoonRenderProfile,
            setMoonRenderProfile,
            getMoonRenderPipeline,
            setMoonRenderPipeline,
            getPhotoMode,
            setPhotoMode,
        }),
        focusPillController: createFocusPillControllerImpl({
            invokeMissionPanelAction: invokeMissionPanelActionImpl,
            setView,
        }),
        headerPillStripController,
    };
}

function bindMainControlControllerSet({
    controllers,
    bindHeaderBlurbBehavior,
    bindDesktopChromeAutohideBehavior,
}) {
    bindHeaderBlurbBehavior();
    controllers.cameraPillController.bind();
    controllers.focusPillController.bind();
    controllers.planePillController.bind();
    controllers.viewSettingsPillController.bind();
    controllers.headerPillStripController.bind();
    bindDesktopChromeAutohideBehavior();
}

function syncMainControlControllerSet(controllers) {
    controllers.focusPillController.sync();
    controllers.viewSettingsPillController.sync();
    controllers.headerPillStripController.syncUi();
}

function bindMainControlElements({
    onClick,
    onChange,
    onInput,
    reset,
    changeDesktopMainFov,
    toggleDesktopMainFovAuto,
    setView,
    toggleAnimation,
    cy3Animate,
    toggleJoyRide,
    toggleLanding,
    toggleInfo,
}) {
    [
        ["reset", reset],
        ["desktop-main-fov-auto", toggleDesktopMainFovAuto],
        ["view-additional-crafts", setView],
        ["view-aux-camera-panels", setView],
        ["view-fps", setView],
        ["joyride", toggleJoyRide],
        ["joyridebutton", toggleJoyRide],
        ["landingbutton", toggleLanding],
        ["info-button", toggleInfo],
    ].forEach(([id, handler]) => onClick(id, handler));

    [
        ["active-craft-select", setView],
        ["orbit-style-classic", setView],
        ["orbit-style-trail", setView],
    ].forEach(([id, handler]) => onChange(id, handler));

    [
        ["desktop-main-fov-slider", changeDesktopMainFov],
        ["trail-track-brightness-2d", setView],
        ["trail-track-brightness-3d", setView],
        ["trail-tail-brightness-2d", setView],
        ["trail-tail-brightness-3d", setView],
    ].forEach(([id, handler]) => onInput(id, handler));

    const animateHandler = typeof toggleAnimation === "function" ? toggleAnimation : cy3Animate;
    if (typeof animateHandler === "function") {
        onClick("animate", animateHandler);
    }
}

export {
    bindMainControlControllerSet,
    bindMainControlElements,
    createMainControlControllers,
    syncMainControlControllerSet,
};
