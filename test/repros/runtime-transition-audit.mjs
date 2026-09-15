// Opt-in audit reproductions, not a replacement for the normal test suite.
// Assertions express the desired contracts. RTA-01/02 now pass; RTA-03 still
// fails while its linked camera finding remains open. Production modules run with injected
// effect ports; no runtime source or screenshot baseline is changed.
import assert from "node:assert/strict";
import { createOrbitLoadActions } from "../../src/platform/js/app/orbit-load-actions.js";
import { createOrbitProcessActions } from "../../src/platform/js/app/orbit-process-actions.js";
import { createPlaneActions } from "../../src/platform/js/app/plane-actions.js";
import { createModeSwitchActions } from "../../src/platform/js/app/mode-switch.js";
import { createCameraActions } from "../../src/platform/js/app/camera-actions.js";
import { getPlaneCameraPose } from "../../src/platform/js/app/plane-camera-config.js";
import { Vector3 } from "three";

const noop = () => {};
let failures = 0;
async function check(name, run) {
    try {
        await run();
        console.log(`PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}: ${error.message}`);
    }
}

await check("RTA-01: late geo data must not mark lunar data processed", async () => {
    let config = "geo";
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const originalDocument = globalThis.document;
    globalThis.document = { getElementById: () => null };
    try {
        const processed = {};
        const loaded = {};
        const events = [];
        const processing = createOrbitProcessActions({
            updateConfigFromMetadata: () => events.push(`metadata:${config}`),
            getCurrentDimension: () => "3D", sleep: async () => {},
            getMissionStartCalled: () => true, getAnimationRunning: () => true,
            d3SelectAll: () => ({ attr: noop }), zoomChangeTransform: noop,
            getConfig: () => config, orbitDataProcessed: processed,
        });
        const loading = createOrbitLoadActions({
            sleep: async () => {}, getConfig: () => config,
            animationScenes: {
                geo: { orbitsCheb: "geo.json", primaryCraftId: "SC", planetsForLocations: ["SC"], supportOrbitsChebByBodyId: {} },
                lunar: {},
            },
            orbitDataLoaded: loaded, chebyshevData: {}, chebyshevDataLoaded: {},
            npzData: {}, npzDataLoaded: {}, getDataLoaded: () => false,
            setDataLoaded: noop, loadChebyshev: () => gate,
            processOrbitData: processing.processOrbitData,
            ensureIndeterminateProgressBar: noop, showElementById: noop,
            hideElementById: noop, updateProgressLabel: noop, setEventInfoText: noop,
            getBodySource: id => id === "SC" ? "chebyshev" : "astronomy",
            getBodiesForConfig: () => ["SC"],
        });
        const pending = loading.loadOrbitDataIfNeededAndProcess(() => events.push(`callback:${config}`));
        await Promise.resolve();
        config = "lunar";
        release({ SC: { segments: [] } });
        await pending;
        console.log(JSON.stringify({ loaded, processed, events }));
        assert.equal(loaded.geo, true, "fixture must finish the geo request");
        assert.notEqual(processed.lunar, true, "geo completion published lunar readiness");
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    }
});

await check("RTA-02: a stale plane callback must not restore the old dimension", async () => {
    let dimension = "2D";
    const pending = [];
    const presentation = {};
    const modes = createModeSwitchActions({
        d3: {},
        d3SelectAll: selector => ({
            style: (property, value) => { presentation[`${selector}:${property}`] = value; },
            attr: (property, value) => { presentation[`${selector}:${property}`] = value; },
        }),
    });
    const planes = createPlaneActions({
        getPlaneSelection: () => "XY", setPlaneVariables: noop,
        getCurrentDimension: () => dimension,
        animationScenes: { geo: { setCameraParameters: noop } },
        getConfig: () => "geo", initSVG: noop,
        loadOrbitDataIfNeededAndProcess: callback => pending.push(callback),
        handleDimensionSwitch: modes.switchDimension, setLocation: noop,
    });
    planes.handlePlaneChange();
    assert.equal(pending.length, 1, "fixture must queue the 2D completion");
    dimension = "3D";
    modes.switchDimension(dimension);
    pending[0]();
    console.log(JSON.stringify({ dimension, presentation }));
    assert.equal(presentation[".dimension-3D:visibility"], "visible", "old 2D completion hid current 3D surface");
    assert.equal(presentation[".dimension-2D:visibility"], "hidden");
});

await check("RTA-03: Free at an unchanged XY plane must retain its canonical up vector", async () => {
    const originalDocument = globalThis.document;
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    try {
        const camera = { position: new Vector3(), up: new Vector3(), lookAt: noop, updateProjectionMatrix: noop };
        const applyPlanePose = () => {
            const pose = getPlaneCameraPose({ planeSelection: "XY", missionConfig: "geo", cameraDistance: 10 });
            camera.position.set(pose.position.x, pose.position.y, pose.position.z);
            camera.up.set(pose.up.x, pose.up.y, pose.up.z);
        };
        const scene = {
            initialized3D: true, camera, setCameraParameters: applyPlanePose,
            cameraController: {
                camera, controls: { target: new Vector3(), update: noop, addEventListener: noop, dispatchEvent: noop },
                setFromToModes: noop, updateFromTo: noop,
            },
        };
        const actions = createCameraActions({
            animationScenes: { geo: scene }, getConfig: () => "geo",
            readCameraPositionMode: () => "manual", readCameraLookMode: () => "manual",
            applyCameraFromTo: noop, readPlaneSelection: () => "XY", setPlaneSelection: noop,
            handlePlaneChange: applyPlanePose, render: noop,
            getViewSky: () => false, getViewConstellationLines: () => false,
        });
        actions.togglePlane();
        const afterPlane = camera.up.toArray();
        actions.changeCameraFromTo();
        const afterFree = camera.up.toArray();
        console.log(JSON.stringify({ plane: "XY", afterPlane, afterFree }));
        assert.deepEqual(afterPlane, [0, 1, 0], "fixture must use the canonical XY pose");
        assert.deepEqual(afterFree, afterPlane, "manual reset overwrote the selected plane's up vector");
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    }
});

console.log(`${failures} unresolved audit reproduction(s).`);
process.exitCode = failures ? 1 : 0;
