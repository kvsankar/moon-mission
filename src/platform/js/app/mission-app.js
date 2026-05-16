import {
    bindMobileMissionCard,
    bindControlPanelToggle,
    bindKeyboardShortcuts,
    bindMainControls,
} from "../ui/event-handlers.js";

let eventBusWired = false;

function wireEventBus(eventBus, handlers) {
    if (eventBusWired) return;
    eventBusWired = true;

    const forwardEvent = (fn) => (payload) => fn(payload?.event);
    const resolveHandler = (primary, legacy) =>
        typeof primary === "function"
            ? primary
            : typeof legacy === "function"
              ? legacy
              : () => {};

    eventBus.on("ui:reset", forwardEvent(handlers.reset));
    eventBus.on("settings:originChanged", forwardEvent(handlers.toggleMode));
    eventBus.on("settings:relativeModeChanged", forwardEvent(handlers.toggleRelativeMode));
    eventBus.on("camera:fromToChanged", forwardEvent(handlers.changeCameraFromTo));
    eventBus.on("camera:lockOn", (payload) => {
        const target = payload?.target;
        const event = payload?.event;
        if (target === "SC") return handlers.toggleLockSC(event);
        if (target === "MOON") return handlers.toggleLockMoon(event);
        if (target === "EARTH") return handlers.toggleLockEarth(event);
    });
    eventBus.on("camera:planeChanged", forwardEvent(handlers.togglePlane));
    eventBus.on("settings:viewChanged", forwardEvent(handlers.setView));
    eventBus.on("settings:dimensionChanged", forwardEvent(handlers.setDimensionTop));
    eventBus.on(
        "animation:toggle",
        forwardEvent(resolveHandler(handlers.toggleAnimation, handlers.cy3Animate)),
    );
    eventBus.on("mode:joyRideToggle", forwardEvent(handlers.toggleJoyRide));
    eventBus.on("mission:landingToggle", forwardEvent(handlers.toggleLanding));
    eventBus.on("ui:infoToggle", forwardEvent(handlers.toggleInfo));
}

export function startMissionApp({ eventBus, handlers }) {
    const onloadStartTime = performance.now();

    wireEventBus(eventBus, handlers);

    // Reset "from-to" camera UI on reload so behavior is predictable (Manual + Manual).
    // Browsers can restore <select> state on Ctrl-R/BFCache without firing 'change'.
    const resetFromToDefaults = () => {
        const positionSelect = document.getElementById("camera-position");
        const lookSelect = document.getElementById("camera-look");
        if (positionSelect) positionSelect.value = "manual";
        if (lookSelect) lookSelect.value = "manual";

        const setPillValue = (name, value) => {
            const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (input) input.checked = true;
        };

        // Keep pill radios aligned with hidden select state so no restored
        // mounted-mode radio can re-apply a stale camera mount on startup.
        setPillValue("camera-position-pill", "manual");
        setPillValue("camera-look-pill", "manual");
    };

    bindMainControls({
        reset: (event) => eventBus.emit("ui:reset", { event }),
        toggleMode: (event) => eventBus.emit("settings:originChanged", { event }),
        toggleRelativeMode: (event) => eventBus.emit("settings:relativeModeChanged", { event }),
        toggleCompareMode: handlers.toggleCompareMode,
        changeCompareMission: handlers.changeCompareMission,
        changeCompareAlignment: handlers.changeCompareAlignment,
        getTimelineEventInfos: handlers.getTimelineEventInfos,
        changeCameraFromTo: (event) => eventBus.emit("camera:fromToChanged", { event }),
        changeDesktopMainFov: handlers.changeDesktopMainFov,
        toggleDesktopMainFovAuto: handlers.toggleDesktopMainFovAuto,
        toggleLockSC: (event) => eventBus.emit("camera:lockOn", { target: "SC", event }),
        toggleLockMoon: (event) => eventBus.emit("camera:lockOn", { target: "MOON", event }),
        toggleLockEarth: (event) => eventBus.emit("camera:lockOn", { target: "EARTH", event }),
        togglePlane: (event) => eventBus.emit("camera:planeChanged", { event }),
        setView: (event) => eventBus.emit("settings:viewChanged", { event }),
        setDimensionTop: (event) => eventBus.emit("settings:dimensionChanged", { event }),
        toggleAnimation: (event) => eventBus.emit("animation:toggle", { event }),
        toggleJoyRide: (event) => eventBus.emit("mode:joyRideToggle", { event }),
        toggleLanding: (event) => eventBus.emit("mission:landingToggle", { event }),
        toggleInfo: (event) => eventBus.emit("ui:infoToggle", { event }),
        setMoonRenderProfile: handlers.setMoonRenderProfile,
        getMoonRenderProfile: handlers.getMoonRenderProfile,
        setMoonRenderPipeline: handlers.setMoonRenderPipeline,
        getMoonRenderPipeline: handlers.getMoonRenderPipeline,
        setPhotoMode: handlers.setPhotoMode,
        getPhotoMode: handlers.getPhotoMode,
    });
    bindKeyboardShortcuts();
    bindControlPanelToggle();
    bindMobileMissionCard({
        changeCameraFromTo: (event) => eventBus.emit("camera:fromToChanged", { event }),
    });

    handlers.initAnimation({ reset: true }); // no need to await - kickstarts setup

    const applyFromTo = () => eventBus.emit("camera:fromToChanged", { event: null });

    const enforceDefaultsAndApply = () => {
        resetFromToDefaults();
        applyFromTo();
    };

    // Enforce defaults immediately and also after a short delay to override any late restore.
    requestAnimationFrame(enforceDefaultsAndApply);
    setTimeout(enforceDefaultsAndApply, 250);
    setTimeout(enforceDefaultsAndApply, 750);

    window.addEventListener("pageshow", () => {
        requestAnimationFrame(enforceDefaultsAndApply);
        setTimeout(enforceDefaultsAndApply, 250);
        setTimeout(enforceDefaultsAndApply, 750);
    });

    const onloadEndTime = performance.now() - onloadStartTime;
    return onloadEndTime;
}
