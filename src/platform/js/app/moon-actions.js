import { resolveMoonRenderPipelineState } from "./moon-render-pipeline.js";

function scheduleDeferredNormalMapUpgrade(scene, requestRender) {
    const upgrade = () => {
        if (!scene.moonRenderer) {
            return;
        }
        scene.moonRenderer.refreshGeneratedNormalMap({ disposePrevious: true });
        // Trigger a redraw when the rebuild lands; the runtime renders
        // on-demand, so without an explicit kick the upgrade would only
        // become visible on the next user interaction.
        if (typeof requestRender === "function") {
            requestRender();
        }
    };
    const idle = globalThis?.requestIdleCallback;
    if (typeof idle === "function") {
        idle(upgrade, { timeout: 1500 });
        return;
    }
    globalThis?.setTimeout?.(upgrade, 0);
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
        scene.moonRenderer.setTextures(scene.moonMap, scene.moonDisplacementMap);
        scene.moonRenderer.setRenderSettings(scene.moonRenderSettings);
        scene.moonRenderer.setRenderPipeline(resolveMoonRenderPipelineState());
        // Defer the synchronous generated-normal-map build off the first-frame
        // critical path. The Moon renders with three.js's runtime bumpMap
        // fallback (driven by the displacement texture) until the higher-
        // fidelity pre-computed normal map is ready, then upgrades. On the
        // 5760-wide "quality" profile (Artemis II default) the synchronous
        // build was costing ~300-500ms of main-thread time on initial load.
        scene.moonRenderer.create(
            getViewMoonPolarAxes(),
            getViewMoonPoles(),
            {
                deferGeneratedNormalMap: true,
                latLonGridVisible: getViewMoonLatLonGrid(),
                latLonLabelsVisible: getViewMoonLatLonLabels(),
                latLonHoverEnabled: getViewMoonLatLonHover(),
            },
        );
        scheduleDeferredNormalMapUpgrade(scene, render);

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

        if (scene.moonRenderer) {
            scene.moonRenderer.dispose();
            scene.moonRenderer = null;
        }

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
    }

    return { addMoon, disposeMoon };
}
