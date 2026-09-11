import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, firefox, webkit } from "playwright";
import { PNG } from "pngjs";
const browserType = { chromium, firefox, webkit }[process.env.MOON_TEST_BROWSER || "chromium"];

const BASE_URL = process.env.VITE_TEST_BASE_URL || "http://127.0.0.1:7275";
let browser;

async function holdLargeImages(page) {
    await page.route("**/@vite/client", route => route.fulfill({ contentType: "application/javascript", body: "" }));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/images/**", async route => {
        await gate;
        await route.abort().catch(() => {});
    });
    return release;
}

describe("progressive Moon loading", () => {
    it("keeps a textured Moon available on a touch display during stalled downloads and input", async () => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true });
        const requests = [];
        page.on("request", request => requests.push(request.url()));
        await page.addInitScript(() => {
            Object.defineProperty(navigator, "deviceMemory", { get: () => undefined });
            Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 });
        });
        const release = await holdLargeImages(page);
        try {
            await page.goto(`${BASE_URL}/artemis2/`, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.evaluate(() => { window.__inputTest = setInterval(() => document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "touch" })), 50); });
            await page.waitForFunction(() => Object.values(window.animationScenes || {}).some(scene => scene.moon?.material?.map?.image?.width === 1024), null, { timeout: 60000 });
            const profile = await page.evaluate(`(async () => {
                const { resolveMoonRenderAssetProfile } = await import("/src/platform/js/app/moon-render-asset-profiles.js");
                const { resolveInteractivePixelRatio } = await import("/src/platform/js/core/domain/render-device-policy.js");
                return { tier: resolveMoonRenderAssetProfile(), dpr: resolveInteractivePixelRatio() };
            })()`);
            expect(profile).toEqual({ tier: "low", dpr: 1.5 });
            const bufferRatio = await page.locator("#canvas-wrapper > canvas").evaluate(canvas => canvas.width / Number.parseFloat(canvas.style.width));
            expect(bufferRatio).toBeCloseTo(1.5, 2);
            expect(requests.some(url => /16k_quality|uint_quality/.test(url))).toBe(false);
        } finally { release(); await page.close(); }
    }, 90000);

    it("downgrades High before loading when the GPU cannot fit its DEM", async () => {
        const page = await browser.newPage();
        const requests = [];
        page.on("request", request => requests.push(request.url()));
        await page.addInitScript(() => {
            const original = WebGL2RenderingContext.prototype.getParameter;
            WebGL2RenderingContext.prototype.getParameter = function (parameter) {
                return parameter === this.MAX_TEXTURE_SIZE ? 4096 : original.call(this, parameter);
            };
        });
        const release = await holdLargeImages(page);
        try {
            await page.goto(`${BASE_URL}/moon-observer-test.html?tier=high`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.getElementById("observer-resources").textContent.includes("1024px"), null, { timeout: 15000 });
            expect(await page.locator("#observer-tier-high").isDisabled()).toBe(true);
            expect(await page.locator("#observer-tier-medium").getAttribute("aria-pressed")).toBe("true");
            expect(requests.some(url => /16k_quality|uint_quality/.test(url))).toBe(false);
        } finally { release(); await page.close(); }
    }, 30000);


    it.each([["low", "256x128", "1024"], ["medium", "384x192", "2048"]])("renders completed %s terrain through the shared Physical model", async (tier, geometry, demWidth) => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 });
        const errors = [];
        const requests = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("request", request => requests.push(request.url()));
        try {
            await page.route("**/@vite/client", route => route.fulfill({ contentType: "application/javascript", body: "" }));
            await page.goto(`${BASE_URL}/moon-observer-test.html?observer=geocenter&model=current&tier=${tier}`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(width => document.getElementById("observer-resources").textContent.includes(`DEM ${width}px uint16`) && document.getElementById("observer-status").textContent === "", demWidth, { timeout: 30000 });
            expect(await page.locator("#observer-resources").textContent()).toContain(geometry);
            expect(await page.locator("#observer-resources").textContent()).toMatch(/\/0 ms\)/);
            expect(new URL(page.url()).searchParams.get("model")).toBe("physical-dem");
            expect(await page.locator("#observer-model-current").count()).toBe(0);
            expect(requests.some(url => /16k_quality|uint_quality|ldem_16_gsfc/.test(url))).toBe(false);
            const png = PNG.sync.read(await page.locator("#observer-canvas").screenshot());
            let lit = 0;
            for (let i = 0; i < png.data.length; i += 4) if (png.data[i] > 20) lit++;
            expect(lit).toBeGreaterThan(png.width * png.height * 0.01);
            expect(errors).toEqual([]);
        } finally { await page.close(); }
    }, 45000);


    it("continues general texture loading after an early Moon tier change", async () => {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        await page.route("**/@vite/client", route => route.fulfill({ contentType: "application/javascript", body: "" }));
        await page.route("**/images/earth/**", async route => { await gate; await route.continue().catch(() => {}); });
        try {
            await page.goto(`${BASE_URL}/artemis2/?moonRenderProfile=quality`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => Object.values(window.animationScenes || {}).some(scene => scene.moon?.material?.map?.image?.width === 1024), null, { timeout: 60000 });
            await page.evaluate(() => document.getElementById("moon-render-tier-low").click());
            await page.waitForFunction(() => Object.values(window.animationScenes || {}).some(scene => scene.moonRenderProfile === "low" && scene.moonDisplacementMap?.image?.width === 1024), null, { timeout: 30000 });
            const loadingState = await page.evaluate(() => Object.values(window.animationScenes).find(scene => scene.initialized3D)?.textureLoadState);
            expect(loadingState).not.toBe("stale");
            release();
            await page.waitForFunction(() => Object.values(window.animationScenes).some(scene => scene.earthTexture?.image?.width > 1), null, { timeout: 30000 });
        } finally { release(); await page.close(); }
    }, 90000);

    beforeAll(async () => { browser = await browserType.launch({ headless: true }); });
    afterAll(async () => { await browser?.close(); });

    it("shows the main animation Moon without waiting for Earth or High assets", async () => {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const release = await holdLargeImages(page);
        try {
            await page.goto(`${BASE_URL}/artemis2/?moonRenderProfile=quality`, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForFunction(() => Object.values(window.animationScenes || {}).some(scene => (
                scene.moon?.material?.map?.image?.width === 1024
            )), null, { timeout: 60000 });
            const state = await page.evaluate(() => {
                const scene = Object.values(window.animationScenes).find(scene => scene.moon?.material?.map?.image?.width === 1024);
                return { width: scene.moon.material.map.image.width, segments: scene.moon.geometry.parameters.widthSegments, profile: scene.moonRenderProfile, dem: scene.moonDisplacementMap, loading: scene.textureLoadState };
            });
            expect(state).toMatchObject({ width: 1024, segments: 128, profile: "low", dem: null });
            expect(["deferred", "loading"]).toContain(state.loading);
        } finally { release(); await page.close(); }
    }, 90000);

    it("shows an observer preview while retaining the requested High tier", async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        const release = await holdLargeImages(page);
        try {
            await page.goto(`${BASE_URL}/moon-observer-test.html?observer=geocenter&model=physical-dem&tier=high`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.getElementById("observer-resources").textContent.includes("1024px"), null, { timeout: 15000 });
            expect(await page.locator("#observer-tier-high").getAttribute("aria-pressed")).toBe("true");
            expect(await page.locator("#observer-resources").textContent()).toContain("128x64");
            expect(await page.locator("#observer-status").textContent()).toContain("Loading high");
        } finally { release(); await page.close(); }
    }, 30000);

    it("uses the shared tuner renderer and remains interactive during High loading", async () => {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        const release = await holdLargeImages(page);
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
            await page.goto(`${BASE_URL}/moon-render-tuner.html?moonRenderProfile=quality`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.getElementById("tuner-canvas").dataset.preview === "true", null, { timeout: 15000 });
            expect(await page.locator("#tuner-canvas").getAttribute("data-renderer")).toBe("MoonRenderer");
            expect(await page.locator("#tuner-lighting-model").count()).toBe(0);
            expect(await page.locator("#tuner-canvas").getAttribute("data-model")).toBe("physical-dem");
            expect(await page.locator('[data-tuner-control="physicalExposure"]').isDisabled()).toBe(false);
            await page.locator('[data-tuner-control="physicalExposure"]').evaluate(input => {
                input.value = "0.8";
                input.dispatchEvent(new Event("input", { bubbles: true }));
            });
            expect(JSON.parse(await page.locator("#tuner-json").inputValue()).values.physicalExposure).toBe(0.8);
            expect(errors).toEqual([]);
        } finally { release(); await page.close(); }
    }, 30000);
});
