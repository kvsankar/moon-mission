export function createSunActions({ SunRenderer, render }) {
    function addSun(scene, { earthRadius }) {
        if (!scene?.motherContainer || !Number.isFinite(earthRadius) || earthRadius <= 0) {
            return;
        }

        scene.sunRenderer = new SunRenderer(scene.motherContainer, earthRadius);
        scene.sunRenderer.setRenderInvalidationCallback?.(render);
        scene.sunRenderer.create(true);
        scene.sun = scene.sunRenderer.group;

        render();
    }

    function disposeSun(scene) {
        if (scene.sunRenderer) {
            scene.sunRenderer.dispose();
            scene.sunRenderer = null;
        }
        scene.sun = null;
    }

    return { addSun, disposeSun };
}
