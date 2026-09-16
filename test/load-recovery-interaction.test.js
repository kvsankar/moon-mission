import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const primaryOrbit = /\/chandrayaan3\/data\/geo-CH3L-cheb\.json(?:\.gz)?(?:\?.*)?$/;
async function browserScenario(run) {
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=gl", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try { await run(page); } finally { await browser.close(); }
}
async function waitForReady(page, origin = "geo") {
    await page.waitForFunction(origin => document.querySelector("#mission-loading-overlay")?.dataset.blocking === "false"
        && document.querySelector("#mission-loading-overlay")?.dataset.state === "ready"
        && window.animationScenes?.[origin]?.initialized3D, origin, { timeout: 60000 });
    expect(await page.locator("#canvas-wrapper canvas").isVisible()).toBe(true);
    expect(await page.locator("#mission-loading-retry").isVisible()).toBe(false);
}

describe("mission load recovery", () => {
    it("recovers a transient Mission Media manifest failure through visible keyboard Retry", async () => {
        await browserScenario(async page => {
            let fail = true, requests = 0;
            await page.route(/\/artemis2\/data\/media-manifest\.json(?:\?.*)?$/, async route => {
                requests += 1;
                if (fail) return route.fulfill({ status: 503, body: "Temporarily unavailable" });
                return route.fulfill({ contentType: "application/json", body: JSON.stringify({
                    mediaBase: `${getEffectiveTestBaseUrl()}/src/platform/assets/`, timelineTimezoneOffset: "+00:00",
                    photos: [{ file: "moon-preview.jpg", title: "Recovered Moon", time: "2026-04-06 17:13:14", enabled: true }],
                }) });
            });
            await page.goto(`${getEffectiveTestBaseUrl()}/artemis2/?testMode=true`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.blocking === "false");
            await page.waitForFunction(() => document.getElementById("media-browser-status")?.textContent.includes("could not be loaded"));
            const mediaTab = page.getByRole("tab", { name: /Mission Media/ }).first();
            if (await mediaTab.isVisible()) await mediaTab.click();
            else if (!await page.getByRole("button", { name: "Retry loading mission media", exact: true }).isVisible())
                await page.locator("#panel-pill-media").click();
            const retry = page.getByRole("button", { name: "Retry loading mission media", exact: true });
            await retry.waitFor({ state: "visible" });
            await page.evaluate(() => new Promise(resolve => {
                let frames = 10;
                const step = () => --frames ? requestAnimationFrame(step) : resolve();
                requestAnimationFrame(step);
            }));
            expect(requests).toBe(1);
            const captures = join(process.cwd(), "test/screenshots/current/load-recovery");
            mkdirSync(captures, { recursive: true });
            await page.screenshot({ path: join(captures, "media-manifest-error.png") });
            fail = false;
            await retry.focus(); await page.keyboard.press("Enter");
            await page.locator('#media-browser-thumbnail-list [data-thumbnail-item-id="moon-preview.jpg"]')
                .waitFor({ state: "visible", timeout: 30000 });
            expect(requests).toBe(2);
            expect(await retry.isVisible()).toBe(false);
            expect(await page.locator("#media-browser-status").textContent()).not.toContain("could not be loaded");
        });
    }, 120000);

    it("shows a required comparison error and retries the second mission without reloading the primary", async () => {
        await browserScenario(async page => {
            let fail = true, primaryRequests = 0, secondaryRequests = 0;
            await page.route(/\/chandrayaan3\/data\/config\.json(?:\?.*)?$/, async route => {
                primaryRequests += 1;
                await route.continue();
            });
            await page.route(/\/artemis1\/data\/config\.json(?:\?.*)?$/, async route => {
                secondaryRequests += 1;
                if (fail) await route.fulfill({ status: 503, body: "Comparison temporarily unavailable" });
                else await route.continue();
            });
            await page.goto(`${getEffectiveTestBaseUrl()}/chandrayaan3/?testMode=true&mode=compare&compareMission=artemis1`,
                { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.state === "error",
                null, { timeout: 45000 });
            expect(await page.locator("#mission-loading-overlay-message").textContent()).toMatch(/comparison/i);
            expect(await page.locator("#mission-loading-overlay").getAttribute("aria-busy")).toBe("false");
            expect(await page.evaluate(() => Object.values(window.animationScenes || {}).some(scene => scene?.initialized3D))).toBe(false);
            const primaryBeforeRetry = primaryRequests;
            expect(primaryBeforeRetry).toBeGreaterThan(0);
            fail = false;
            const retry = page.getByRole("button", { name: "Retry loading mission", exact: true });
            await retry.focus(); await page.keyboard.press("Enter");
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.state === "ready"
                && Object.values(window.animationScenes || {}).some(scene => scene?.initialized3D
                    && Object.entries(scene.orbitLinesByBodyId || {}).some(([id, lines]) => id.startsWith("CMP_ARTEMIS1_") && lines.length > 0)),
                null, { timeout: 60000 });
            expect(await page.locator("#mission-loading-retry").isVisible()).toBe(false);
            expect(await page.locator("#canvas-wrapper canvas").isVisible()).toBe(true);
            const visibleCraftIds = await page.evaluate(() => {
                const scene = Object.values(window.animationScenes || {}).find(scene =>
                    scene?.initialized3D && Object.keys(scene.orbitLinesByBodyId || {}).some(id => id.startsWith("CMP_ARTEMIS1_")));
                return { primary: scene?.primaryCraftId,
                    rendered: Object.entries(scene?.orbitLinesByBodyId || {}).filter(([, lines]) => lines.length > 0).map(([id]) => id) };
            });
            expect(visibleCraftIds.rendered).toContain(visibleCraftIds.primary);
            expect(visibleCraftIds.rendered.some(id => id.startsWith("CMP_ARTEMIS1_"))).toBe(true);
            expect(primaryRequests).toBe(primaryBeforeRetry);
            expect(secondaryRequests).toBeGreaterThanOrEqual(2);
        });
    }, 120000);

    it("recovers from a real orbit HTTP failure through the keyboard Retry action", async () => {
        await browserScenario(async page => {
            let fail = true, failures = 0;
            await page.route(primaryOrbit, async route => {
                if (fail) { failures += 1; await route.fulfill({ status: 503, body: "Temporarily unavailable" }); }
                else await route.continue();
            });
            await page.goto(`${getEffectiveTestBaseUrl()}/chandrayaan3/?testMode=true`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.state === "error", null, { timeout: 45000 });
            expect(failures).toBeGreaterThan(0);
            const errorCard = await page.locator(".mission-loading-overlay__card").boundingBox();
            const transport = await page.locator("#control-panel").boundingBox();
            expect(errorCard.y + errorCard.height).toBeLessThanOrEqual(transport.y);
            const captures = join(process.cwd(), "test/screenshots/current/load-recovery");
            mkdirSync(captures, { recursive: true });
            await page.screenshot({ path: join(captures, "orbit-error.png") });
            const retry = page.getByRole("button", { name: "Retry loading mission", exact: true });
            await retry.waitFor({ state: "visible" });
            expect(await page.locator("#mission-loading-overlay").getAttribute("aria-busy")).toBe("false");
            fail = false;
            await retry.focus(); await page.keyboard.press("Enter");
            await waitForReady(page);
        });
    }, 120000);

    it("allows switching origin during Retry and ignores the old request's late failure", async () => {
        await browserScenario(async page => {
            let mode = "fail";
            const release = [];
            await page.route(primaryOrbit, async route => {
                if (mode === "hold") await new Promise(resolve => release.push(resolve));
                await route.fulfill({ status: 503, body: "Old origin unavailable" });
            });
            try {
                await page.goto(`${getEffectiveTestBaseUrl()}/chandrayaan3/?testMode=true`, { waitUntil: "domcontentloaded" });
                await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.state === "error", null, { timeout: 45000 });
                mode = "hold";
                await page.getByRole("button", { name: "Retry loading mission", exact: true }).click();
                await expect.poll(() => release.length).toBeGreaterThan(0);
                await page.getByRole("button", { name: "View", exact: true }).click();
                await page.locator("#origin-pill-moon").click();
                await waitForReady(page, "lunar");
                mode = "fail";
                release.forEach(resolve => resolve());
                // Wait for the deliberately held old request and any fallback
                // response to finish before asserting its error was suppressed.
                await page.waitForLoadState("networkidle", { timeout: 30000 });
                expect(await page.locator("#mission-loading-overlay").getAttribute("data-state")).toBe("ready");
                expect(await page.locator("#origin-moon").isChecked()).toBe(true);
                expect(await page.locator("#mission-loading-retry").isVisible()).toBe(false);
            } finally { mode = "fail"; release.forEach(resolve => resolve()); }
        });
    }, 120000);

    it("recovers the Dockview policy after a failed required configuration fetch", async () => {
        await browserScenario(async page => {
            let fail = true, attempts = 0;
            await page.route(/\/chandrayaan3\/data\/config\.json(?:\?.*)?$/, async route => {
                attempts += 1;
                if (fail) await route.fulfill({ status: 503, body: "Temporarily unavailable" });
                else await route.continue();
            });
            await page.goto(`${getEffectiveTestBaseUrl()}/chandrayaan3/?testMode=true&testProfile=ssim`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.state === "error", null, { timeout: 45000 });
            expect(await page.locator("#experimental-dockview-host").count()).toBe(0);
            fail = false;
            await page.getByRole("button", { name: "Retry loading mission", exact: true }).click();
            await waitForReady(page);
            expect(attempts).toBeGreaterThanOrEqual(2);
            expect(await page.locator("html").getAttribute("data-panel-layout")).toBe("legacy");
            expect(await page.locator("#experimental-dockview-host").count()).toBe(0);
        });
    }, 120000);
});
