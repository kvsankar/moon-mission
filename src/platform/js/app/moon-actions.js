import { resolveMoonRenderPipelineState } from "./moon-render-pipeline.js";
import { detachSceneTextureFields, SCENE_TEXTURE_FIELDS } from "./scene-texture-actions.js";
import { registerSceneCleanup } from "./scene-lifecycle.js";

function scheduleDeferredNormalMapUpgrade(scene, requestRender) {
    const renderer = scene.moonRenderer;
    const generation = scene.deferred3DInitRunId;
    let cancelled = false;
    let handle = null;
    let unregister = () => {};
    const idle = globalThis?.requestIdleCallback;
    const cancel = () => {
        cancelled = true;
        if (handle != null) {
            if (typeof idle === "function") globalThis.cancelIdleCallback?.(handle);
            else globalThis.clearTimeout?.(handle);
        }
        unregister();
    };
    unregister = registerSceneCleanup(scene, cancel);
    const isCurrent = () => !cancelled && scene.disposed !== true && scene.stopCreationFlag !== true &&
        scene.moonRenderer === renderer && scene.deferred3DInitRunId === generation;
    const upgrade = () => {
        handle = null;
        unregister();
        if (!isCurrent() || !renderer) {
            return;
        }
        renderer.refreshGeneratedNormalMap({ disposePrevious: true });
        // Trigger a redraw when the rebuild lands; the runtime renders
        // on-demand, so without an explicit kick the upgrade would only
        // become visible on the next user interaction.
        if (isCurrent() && typeof requestRender === "function") {
            requestRender();
        }
    };
    if (cancelled) return;
    if (typeof idle === "function") {
        handle = idle(upgrade, { timeout: 1500 });
        return;
    }
    handle = globalThis?.setTimeout?.(upgrade, 0);
}

export function createMoonActions({
    MoonRenderer,
    getMoonRadius,
    getGlobalConfig,
    getViewMoonOsculatingOrbit,
    getFrameMode,
    getViewPolarAxes,
    getViewPoles,
    getViewMoonPolarAxes = getViewPolarAxes,
    getViewMoonPoles = getViewPoles,
    getViewMoonLatLonGrid = () => false,
    getViewMoonLatLonLabels = () => true,
    getViewMoonLatLonHover = () => false,
    getAnimTime,
    render,
}) {
    function addMoon(scene) {
        const globalConfig = getGlobalConfig();

        if (!globalConfig || !globalConfig.is_lunar) {
            console.debug("Skipping moon creation - not a lunar mission");
            return;
        }

        scene.moonRenderer = new MoonRenderer(getMoonRadius());
        scene.moonRenderer.setRenderInvalidationCallback(render);
        scene.moonRenderer.setTextures(scene.moonMap, scene.moonDisplacementMap);
        scene.moonRenderer.setRenderSettings(scene.moonRenderSettings);
        scene.moonRenderer.setRenderPipeline(resolveMoonRenderPipelineState());
        // Defer the synchronous generated-normal-map build off the first-frame
        // critical path. The Moon renders with three.js's runtime bumpMap
        // fallback (driven by the displacement texture) until the higher-
        // fidelity pre-computed normal map is ready, then upgrades. On the
        // 5760-wide "quality" profile (Artemis II default) the synchronous
        // build was costing ~300-500ms of main-thread time on initial load.
        const hasMoonDem = !scene.moonDisplacementMap?.userData?.physicalNormalTexture &&
            Number(scene.moonDisplacementMap?.image?.width) > 1 &&
            Number(scene.moonDisplacementMap?.image?.height) > 1;
        scene.moonRenderer.create(
            getViewMoonPolarAxes(),
            getViewMoonPoles(),
            {
                deferGeneratedNormalMap: hasMoonDem,
                latLonGridVisible: getViewMoonLatLonGrid(),
                latLonLabelsVisible: getViewMoonLatLonLabels(),
                latLonHoverEnabled: getViewMoonLatLonHover(),
            },
        );
        if (hasMoonDem) {
            scheduleDeferredNormalMapUpgrade(scene, render);
        }

        scene.moonContainer = scene.moonRenderer.container;
        scene.moon = scene.moonRenderer.mesh;
        scene.moonAxis = scene.moonRenderer.axis;
        scene.moonAxisVector = scene.moonRenderer.axisVector;
        scene.moonNorthPoleSphere = scene.moonRenderer.northPoleSphere;
        scene.moonSouthPoleSphere = scene.moonRenderer.southPoleSphere;
        scene.moonLatLonGrid = scene.moonRenderer.latLonGrid;
        scene.moonLatLonLabels = scene.moonRenderer.latLonLabels;
        scene.moonLatLonHoverLabel = scene.moonRenderer.latLonHoverLabel;

        scene.addMoonSOI();
        scene.addMoonOsculatingOrbit();
            if (scene.sceneHelpers?.setMoonOsculatingOrbitVisible) {
                const moonOrbitToggle = document.getElementById("view-moon-osculating-orbit");
                const relativeOriginToggle = document.getElementById("origin-relative");
                scene.sceneHelpers.setMoonOsculatingOrbitVisible(
                    scene.name !== "relative" &&
                    (moonOrbitToggle?.checked ?? getViewMoonOsculatingOrbit()) &&
                    !(relativeOriginToggle?.checked ?? (getFrameMode() === "relative")),
                );
            }
        scene.rotateMoon(getAnimTime());

        render();
    }

    function disposeMoon(scene) {
        const globalConfig = getGlobalConfig();

        if (!globalConfig || !globalConfig.is_lunar) {
            return;
        }

        scene.disposeMoonSOI();
        scene.disposeBodyHalos();
        scene.disposeMoonOsculatingOrbit();

        const renderer = scene.moonRenderer;
        scene.moonRenderer = null;
        const releaseInputs = detachSceneTextureFields(scene, SCENE_TEXTURE_FIELDS.moon);

        scene.moon = null;
        scene.moonAxis = null;
        scene.moonAxisVector = null;
        scene.moonNorthPoleSphere = null;
        scene.moonSouthPoleSphere = null;
        scene.moonLatLonGrid = null;
        scene.moonLatLonLabels = null;
        scene.moonLatLonHoverLabel = null;
        scene.moonContainer = null;
        scene.moonOsculatingOrbitLine = null;
        scene.moonMap = null;
        scene.moonDisplacementMap = null;
        scene.moonRenderProfile = null;
        scene.moonRenderSettings = null;
        try { renderer?.dispose(); }
        finally { releaseInputs(); }
    }

    return { addMoon, disposeMoon };
}
