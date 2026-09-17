import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";

const TIMEOUT = process.env.CI === "true" ? 180000 : 90000;
let browser;

// Read-only probes supplement visible-control interactions. They never reset
// cameras, force rendering, alter scene flags, or bypass lazy initialization.
async function snapshot(page) {
    return page.evaluate(() => {
        const origin = document.querySelector("#origin-moon")?.checked ? "lunar" : "geo";
        const scene = window.animationScenes?.[origin];
        const controller = scene?.cameraController;
        const slider = document.getElementById("timeline-slider");
        const vector = value => value ? [value.x, value.y, value.z] : null;
        const body = id => id === "spacecraft" ? scene?.craft : scene?.[`${id}Container`];
        const source = body(controller?.positionMode);
        const destination = body(controller?.lookMode);
        const world = object => object?.getWorldPosition(scene.camera.position.clone());
        const sourceWorld = source && world(source);
        const destinationWorld = destination && world(destination);
        return {
            origin,
            dimension: document.querySelector("#dimension-2D")?.checked ? "2D" : "3D",
            primaryBody: scene?.primaryBody,
            sceneName: scene?.name,
            sceneState: scene?.state,
            initialized3D: scene?.initialized3D === true,
            planeSelection: scene?.planeSelection,
            planeVariables: [scene?.xFactor, scene?.yFactor, scene?.zFactor],
            currentTime: Number(slider?.dataset.currentTimeMs),
            rangeMin: Number(slider?.dataset.rangeMinMs),
            rangeMax: Number(slider?.dataset.rangeMaxMs),
            playing: document.querySelector(".controls-cluster--transport")?.classList.contains("is-playing"),
            positionMode: controller?.positionMode,
            lookMode: controller?.lookMode,
            uiPosition: document.getElementById("camera-position")?.value,
            uiLook: document.getElementById("camera-look")?.value,
            cameraPosition: vector(scene?.camera?.position),
            cameraQuaternion: scene?.camera?.quaternion?.toArray(),
            target: vector(controller?.controls?.target),
            distanceToSource: sourceWorld ? scene.camera.position.distanceTo(sourceWorld) : null,
            distanceToTarget: destinationWorld ? controller.controls.target.distanceTo(destinationWorld) : null,
            noRotate: controller?.controls?.noRotate,
            noPan: controller?.controls?.noPan,
            controlsEnabled: controller?.controls?.enabled,
            craftVisible: scene?.craft?.visible,
        };
    });
}

async function waitForView(page, origin, dimension) {
    await page.waitForFunction(({ origin, dimension }) => {
        const selectedOrigin = document.querySelector("#origin-moon")?.checked ? "lunar" : "geo";
        const selectedDimension = document.querySelector("#dimension-2D")?.checked ? "2D" : "3D";
        if (selectedOrigin !== origin || selectedDimension !== dimension) return false;
        if (document.querySelector("#mission-loading-overlay")?.dataset.blocking !== "false") return false;
        const scene = window.animationScenes?.[origin];
        if (dimension === "3D") {
            return scene?.initialized3D && scene.state >= window.AnimationScene.SCENE_STATE_ADD_CURVE_DONE;
        }
        return !!document.querySelector("#svg-wrapper > svg path[d]");
    }, { origin, dimension }, { timeout: TIMEOUT });
    const active = page.locator(dimension === "3D" ? "#canvas-wrapper canvas" : "#svg-wrapper > svg").first();
    await active.waitFor({ state: "visible", timeout: TIMEOUT });
    const rect = await active.boundingBox();
    expect(rect?.width, `${origin}/${dimension}: render surface width`).toBeGreaterThan(200);
    expect(rect?.height, `${origin}/${dimension}: render surface height`).toBeGreaterThan(200);
    const inactive = page.locator(dimension === "3D" ? "#svg-wrapper > svg" : "#canvas-wrapper canvas").first();
    // Origin and dimension commits may publish before the renderer handoff.
    // Require eventual exclusivity, not zero-duration intermediate states.
    await inactive.waitFor({ state: "hidden", timeout: 5000 });
    expect(await inactive.isVisible(), `${origin}/${dimension}: competing render surface`).toBe(false);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (dimension === "3D") {
        const state = await snapshot(page);
        for (const [key, length] of [["cameraPosition", 3], ["cameraQuaternion", 4], ["target", 3]]) {
            expect(state[key], `${origin}: ${key}`).toHaveLength(length);
            expect(state[key].every(Number.isFinite), `${origin}: finite ${key}`).toBe(true);
        }
    }
}

async function recordFailure(page, name, error) {
    const directory = join(process.cwd(), "test/screenshots/current/runtime-transitions");
    mkdirSync(directory, { recursive: true });
    const state = await snapshot(page).catch(problem => ({ probeError: problem.message }));
    const surfaces = await Promise.all(["#canvas-wrapper canvas", "#svg-wrapper > svg"].map(async selector => {
        const locator = page.locator(selector).first();
        return { selector, visible: await locator.isVisible(), rect: await locator.boundingBox() };
    })).catch(problem => ({ probeError: problem.message }));
    const report = { url: page.url(), error: error.message, state, surfaces };
    writeFileSync(join(directory, `${name}.json`), JSON.stringify(report, null, 2));
    await page.screenshot({ path: join(directory, `${name}.png`), timeout: 5000 })
        .catch(problem => console.warn(`Failure screenshot unavailable: ${problem.message}`));
    console.error(`${name}: ${JSON.stringify(report)}`);
}

async function useViewControl(page, selector) {
    const control = page.locator(selector);
    if (!await control.isVisible()) {
        await page.getByRole("button", { name: "View", exact: true }).click();
    }
    await control.click();
    const close = page.getByRole("button", { name: "Close view controls", exact: true });
    if (await close.isVisible()) await close.click();
}

async function openScenario() {
    // Cold means a fresh browser context and an uninitialized origin scene;
    // this suite does not artificially order or stall network requests.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
        // No SSIM profile or layout override: exercise the normal workspace.
        await page.goto(`${getEffectiveTestBaseUrl()}/chandrayaan3/?testMode=true`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.panelLayout === "dockview", null, { timeout: TIMEOUT });
        await waitForView(page, "geo", "3D");
        expect(await page.locator("#experimental-dockview-host").isVisible()).toBe(true);
        if ((await snapshot(page)).playing) await page.locator("#animate").click();
        expect((await snapshot(page)).playing).toBe(false);
        return { context, page, errors };
    } catch (error) {
        await context.close();
        throw error;
    }
}

function expectValidClock(state) {
    expect(Number.isFinite(state.currentTime)).toBe(true);
    expect(state.rangeMax).toBeGreaterThan(state.rangeMin);
    expect(state.currentTime).toBeGreaterThanOrEqual(state.rangeMin);
    expect(state.currentTime).toBeLessThanOrEqual(state.rangeMax);
    expect(state.playing).toBe(false);
}

describe("CY3 semantic runtime transitions in the normal Dockview workspace", () => {
    beforeAll(async () => {
        browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=gl", "--enable-unsafe-swiftshader"] });
    });
    afterAll(async () => { await browser?.close(); });

    it("reprojects retained camera intent after restored-page controls are corrupted", async () => {
        const { context, page, errors } = await openScenario();
        try {
            await useViewControl(page, "#view-pill-craft-moon");
            await page.waitForFunction(() => window.animationScenes.geo?.cameraController?.positionMode === "spacecraft");
            const before = await snapshot(page);
            // Fault-inject only the UI projection, never the camera or its state port.
            await page.evaluate(() => {
                document.getElementById("camera-position").value = "manual";
                document.getElementById("camera-look").value = "manual";
                window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
            });
            // Include the existing delayed page-restore projections, not only the RAF.
            await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
            const restored = await snapshot(page);
            expect(restored.positionMode).toBe("spacecraft");
            expect(restored.lookMode).toBe("moon");
            expect(restored.uiPosition).toBe("spacecraft");
            expect(restored.uiLook).toBe("moon");
            expect(restored.cameraPosition).toEqual(before.cameraPosition);
            expect(restored.currentTime).toBe(before.currentTime);
            expect(errors).toEqual([]);
        } catch (error) {
            await recordFailure(page, "camera-restored-projection", error);
            throw error;
        } finally { await context.close(); }
    }, TIMEOUT * 2);

    it("applies retained camera intent after a cold 2D scene outlives readiness retries", async () => {
        const { context, page, errors } = await openScenario();
        try {
            await useViewControl(page, "#view-pill-craft-moon");
            await page.waitForFunction(() => window.animationScenes.geo?.cameraController?.positionMode === "spacecraft");
            await useViewControl(page, "#dimension-pill-2d");
            await waitForView(page, "geo", "2D");
            await useViewControl(page, "#origin-pill-moon");
            await waitForView(page, "lunar", "2D");
            expect(await page.evaluate(() => window.animationScenes.lunar?.initialized3D === true)).toBe(false);
            const before = await snapshot(page);
            await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 6000)));
            await useViewControl(page, "#dimension-pill-3d");
            await waitForView(page, "lunar", "3D");
            await page.waitForFunction(() => {
                const camera = window.animationScenes.lunar?.cameraController;
                return camera?.positionMode === "spacecraft" && camera.lookMode === "moon";
            });
            const restored = await snapshot(page);
            expect(restored.uiPosition).toBe("spacecraft");
            expect(restored.uiLook).toBe("moon");
            expect(restored.currentTime).toBe(before.currentTime);
            expectValidClock(restored);
            expect(errors).toEqual([]);
        } catch (error) {
            await recordFailure(page, "camera-cold-readiness", error);
            throw error;
        } finally { await context.close(); }
    }, TIMEOUT * 2);

    it("switches Earth to a cold Moon scene and back to a warm Earth scene with a valid origin clock", async () => {
        const { context, page, errors } = await openScenario();
        try {
            const earth = await snapshot(page);
            expect(earth.primaryBody).toBe("EARTH");
            expectValidClock(earth);
            expect(await page.evaluate(() => window.animationScenes.lunar?.initialized3D === true)).toBe(false);
            const originalEarth = await page.evaluateHandle(() => window.animationScenes.geo);
            await useViewControl(page, "#origin-pill-moon");
            await waitForView(page, "lunar", "3D");
            const moon = await snapshot(page);
            expect(moon.primaryBody).toBe("MOON");
            expect(moon.sceneName).toBe("lunar");
            expectValidClock(moon);
            // Inertial origins have separate coverage. Do not assume a time
            // before lunar coverage survives entering the lunar scene.
            await useViewControl(page, "#origin-pill-earth");
            await waitForView(page, "geo", "3D");
            expect(await originalEarth.evaluate(scene => scene === window.animationScenes.geo)).toBe(true);
            const returned = await snapshot(page);
            expect(returned.primaryBody).toBe("EARTH");
            expectValidClock(returned);
            expect(errors).toEqual([]);
        } catch (error) {
            await recordFailure(page, "origin-roundtrip", error);
            throw error;
        } finally { await context.close(); }
    }, TIMEOUT * 2);

    it("switches Earth 3D to SVG and restores the warm 3D scene at the same time", async () => {
        const { context, page, errors } = await openScenario();
        try {
            const before = await snapshot(page);
            const originalEarth = await page.evaluateHandle(() => window.animationScenes.geo);
            await useViewControl(page, "#dimension-pill-2d");
            await waitForView(page, "geo", "2D");
            expect((await snapshot(page)).currentTime).toBe(before.currentTime);
            await useViewControl(page, "#dimension-pill-3d");
            await waitForView(page, "geo", "3D");
            const returned = await snapshot(page);
            expect(await originalEarth.evaluate(scene => scene === window.animationScenes.geo)).toBe(true);
            expect(returned.currentTime).toBe(before.currentTime);
            expect(returned.primaryBody).toBe("EARTH");
            expectValidClock(returned);
            expect(errors).toEqual([]);
        } catch (error) {
            await recordFailure(page, "dimension-warm-roundtrip", error);
            throw error;
        } finally { await context.close(); }
    }, TIMEOUT * 2);

    it("renders SVG before cold lunar 3D initialization and restores the warm 3D scene", async () => {
        const { context, page, errors } = await openScenario();
        try {
            await useViewControl(page, "#dimension-pill-2d");
            await waitForView(page, "geo", "2D");
            await useViewControl(page, "#origin-pill-moon");
            await waitForView(page, "lunar", "2D");
            expect(await page.evaluate(() => window.animationScenes.lunar?.initialized3D === true)).toBe(false);
            const lunar2D = await snapshot(page);
            expectValidClock(lunar2D);
            await useViewControl(page, "#dimension-pill-3d");
            await waitForView(page, "lunar", "3D");
            const cold = await snapshot(page);
            expect(cold.currentTime).toBe(lunar2D.currentTime);
            const originalLunar = await page.evaluateHandle(() => window.animationScenes.lunar);
            await useViewControl(page, "#dimension-pill-2d");
            await waitForView(page, "lunar", "2D");
            await useViewControl(page, "#dimension-pill-3d");
            await waitForView(page, "lunar", "3D");
            const warm = await snapshot(page);
            expect(await originalLunar.evaluate(scene => scene === window.animationScenes.lunar)).toBe(true);
            expect(warm.currentTime).toBe(cold.currentTime);
            expect(warm.primaryBody).toBe(cold.primaryBody);
            expectValidClock(warm);
            expect(errors).toEqual([]);
        } catch (error) {
            await recordFailure(page, "dimension-cold-warm", error);
            throw error;
        } finally { await context.close(); }
    }, TIMEOUT * 2);

    it("applies every plane preset through visible controls without advancing mission time", async () => {
        const { context, page, errors } = await openScenario();
        try {
            const initialTime = (await snapshot(page)).currentTime;
            const presets = [
                ["default", "DEFAULT"],
                ["xy", "XY"],
                ["yz", "YZ"],
                ["zx", "ZX"],
                ["xy-minus", "XY-"],
                ["yz-minus", "YZ-"],
                ["zx-minus", "ZX-"],
            ];

            for (const [id, selection] of presets) {
                await useViewControl(page, `#plane-pill-${id}`);
                await page.waitForFunction(({ id, selection }) => {
                    const scene = window.animationScenes?.geo;
                    return scene?.planeSelection === selection
                        && document.getElementById(`checkbox-lock-${id}`)?.checked === true
                        && document.getElementById(`plane-pill-${id}`)?.getAttribute("aria-pressed") === "true";
                }, { id, selection });
                const state = await snapshot(page);
                expect(state.planeSelection).toBe(selection);
                expect(state.planeVariables).toHaveLength(3);
                expect(state.planeVariables.every(Number.isFinite)).toBe(true);
                expect(state.currentTime).toBe(initialTime);
                expectValidClock(state);
            }

            await useViewControl(page, "#dimension-pill-2d");
            await waitForView(page, "geo", "2D");
            await useViewControl(page, "#plane-pill-yz-minus");
            await page.waitForFunction(() => window.animationScenes?.geo?.planeSelection === "YZ-"
                && document.getElementById("checkbox-lock-yz-minus")?.checked === true);
            const earth2D = await snapshot(page);
            expect(earth2D.currentTime).toBe(initialTime);
            expect(earth2D.planeSelection).toBe("YZ-");

            await useViewControl(page, "#origin-pill-moon");
            await waitForView(page, "lunar", "2D");
            const lunarBefore = await snapshot(page);
            await useViewControl(page, "#plane-pill-xy");
            await page.waitForFunction(() => window.animationScenes?.lunar?.planeSelection === "XY"
                && document.getElementById("checkbox-lock-xy")?.checked === true);
            const moon2D = await snapshot(page);
            expect(moon2D.currentTime).toBe(lunarBefore.currentTime);
            expect(moon2D.planeSelection).toBe("XY");
            expectValidClock(moon2D);
            expect(errors).toEqual([]);
        } catch (error) {
            await recordFailure(page, "plane-presets", error);
            throw error;
        } finally { await context.close(); }
    }, TIMEOUT * 2);

    it("publishes restart time before the visible Play state changes", async () => {
        const { context, page, errors } = await openScenario();
        try {
            await page.locator("#timeline-slider").press("End");
            await page.waitForFunction(() => {
                const slider = document.getElementById("timeline-slider");
                return Number(slider.dataset.currentTimeMs) === Number(slider.dataset.rangeMaxMs);
            });
            await page.evaluate(() => {
                window.__restartObservation = null;
                document.addEventListener("animation-play-state-updated", function observe(event) {
                    if (!event.detail?.isPlaying) return;
                    const slider = document.getElementById("timeline-slider");
                    window.__restartObservation = {
                        time: Number(slider.dataset.currentTimeMs), start: Number(slider.dataset.rangeMinMs),
                    };
                    document.removeEventListener("animation-play-state-updated", observe);
                });
            });
            await page.locator("#animate").click();
            const observed = await page.evaluate(() => window.__restartObservation);
            expect(observed).not.toBeNull();
            expect(observed.time).toBe(observed.start);
            expect(errors).toEqual([]);
        } catch (error) {
            await recordFailure(page, "playback-restart", error);
            throw error;
        } finally { await context.close(); }
    }, TIMEOUT * 2);

    it("applies mounted and free camera changes while paused without advancing mission time", async () => {
        const { context, page, errors } = await openScenario();
        try {
            const before = await snapshot(page);
            await useViewControl(page, "#view-pill-craft-moon");
            await page.waitForFunction(() => {
                const controller = window.animationScenes.geo?.cameraController;
                return controller?.positionMode === "spacecraft" && controller.lookMode === "moon";
            });
            await waitForView(page, "geo", "3D");
            const mounted = await snapshot(page);
            expect(mounted.uiPosition).toBe("spacecraft");
            expect(mounted.uiLook).toBe("moon");
            expect(mounted.distanceToSource).toBeLessThan(1e-8);
            expect(mounted.distanceToTarget).toBeLessThan(1e-8);
            expect(mounted.noRotate).toBe(true);
            expect(mounted.noPan).toBe(true);
            expect(mounted.craftVisible).toBe(false);
            expect(mounted.cameraPosition).not.toEqual(before.cameraPosition);
            expect(mounted.currentTime).toBe(before.currentTime);
            expectValidClock(mounted);
            await useViewControl(page, "#view-pill-free");
            await page.waitForFunction(() => {
                const controller = window.animationScenes.geo?.cameraController;
                return controller?.positionMode === "manual" && controller.lookMode === "manual";
            });
            const free = await snapshot(page);
            expect(free.uiPosition).toBe("manual");
            expect(free.uiLook).toBe("manual");
            expect(free.controlsEnabled).toBe(true);
            expect(free.noRotate).toBe(false);
            expect(free.noPan).toBe(false);
            expect(free.currentTime).toBe(before.currentTime);
            expectValidClock(free);
            expect(errors).toEqual([]);
        } catch (error) {
            await recordFailure(page, "paused-camera", error);
            throw error;
        } finally { await context.close(); }
    }, TIMEOUT * 2);
});
