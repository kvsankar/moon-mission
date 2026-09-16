import { detachSceneTextureFields, SCENE_TEXTURE_FIELDS } from "./scene-texture-actions.js";

export function createEarthActions({ EarthRenderer, render }) {
    function addEarth(scene, {
        earthRadius,
        viewPolarAxes,
        viewPoles,
        viewEarthLatLonGrid = false,
        viewEarthLatLonLabels = true,
        viewEarthLatLonHover = false,
    }) {
        // Create Earth renderer
        scene.earthRenderer = new EarthRenderer(earthRadius);
        scene.earthRenderer.setTextures(scene.earthTexture, scene.earthSpecularTexture, scene.earthNightTexture);
        scene.earthRenderer.create(viewPolarAxes, viewPoles, {
            latLonGridVisible: viewEarthLatLonGrid,
            latLonLabelsVisible: viewEarthLatLonLabels,
            latLonHoverEnabled: viewEarthLatLonHover,
        });

        // Backward-compatible property references
        scene.earthContainer = scene.earthRenderer.container;
        scene.earth = scene.earthRenderer.mesh;
        scene.earthAxis = scene.earthRenderer.axis;
        scene.earthNorthPoleSphere = scene.earthRenderer.northPoleSphere;
        scene.earthSouthPoleSphere = scene.earthRenderer.southPoleSphere;
        scene.earthLatLonGrid = scene.earthRenderer.latLonGrid;
        scene.earthLatLonLabels = scene.earthRenderer.latLonLabels;
        scene.earthLatLonHoverLabel = scene.earthRenderer.latLonHoverLabel;

        render();
    }

    function disposeEarth(scene) {
        const renderer = scene.earthRenderer;
        scene.earthRenderer = null;
        const releaseInputs = detachSceneTextureFields(scene, SCENE_TEXTURE_FIELDS.earth);

        // Clear backward-compatible references
        scene.earth = null;
        scene.earthAxis = null;
        scene.earthNorthPoleSphere = null;
        scene.earthSouthPoleSphere = null;
        scene.earthLatLonGrid = null;
        scene.earthLatLonLabels = null;
        scene.earthLatLonHoverLabel = null;
        scene.earthContainer = null;
        scene.earthTexture = null;
        scene.earthPhotoTexture = null;
        scene.earthSpecularTexture = null;
        scene.earthNightTexture = null;
        try { renderer?.dispose(); }
        finally { releaseInputs(); }
    }

    return { addEarth, disposeEarth };
}
