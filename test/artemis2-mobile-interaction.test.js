import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";
import { readMountedCameraInvariantSnapshot } from "./helpers/mounted-camera-invariants.js";

describe("Artemis II mobile camera behavior", () => {
    it("mounts desktop capabilities on widening and invalidates a mount superseded by shrinking", async () => {
        const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=gl", "--enable-unsafe-swiftshader"] });
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        let release; const gate = new Promise(resolve => { release = resolve; }); let intercepted = false;
        await page.route(/\/src\/platform\/js\/app\/experimental-dockview-host\.js(?:\?.*)?$/, async route => {
            intercepted = true; await gate; await route.continue();
        });
        try {
            await page.goto(`${getEffectiveTestBaseUrl()}/artemis2/`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.blocking === "false");
            expect(await page.evaluate(() => !!window.__moonMissionDockviewSpike)).toBe(false);
            const before = await readMountedCameraInvariantSnapshot(page);
            await page.setViewportSize({ width: 1440, height: 900 });
            await expect.poll(() => intercepted, { timeout: 30000 }).toBe(true);
            await page.setViewportSize({ width: 390, height: 844 });
            release();
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            expect(await page.evaluate(() => !!window.__moonMissionDockviewSpike)).toBe(false);
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.waitForFunction(() => window.__moonMissionDockviewSpike?.api?.panels.length >= 8, null, { timeout: 30000 });
            const host = await page.evaluateHandle(() => window.__moonMissionDockviewSpike);
            const after = await readMountedCameraInvariantSnapshot(page);
            expect(after.timelineSliderValue).toBe(before.timelineSliderValue);
            expect(after.positionMode).toBe(before.positionMode);
            expect(after.lookMode).toBe(before.lookMode);
            await page.setViewportSize({ width: 390, height: 844 });
            await page.setViewportSize({ width: 1440, height: 900 });
            expect(await host.evaluate(value => value === window.__moonMissionDockviewSpike)).toBe(true);
        } finally { release(); await browser.close(); }
    }, 120000);

    it("keeps desktop FoV after leaving mobile Views and resizing again", async () => {
        const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=gl", "--enable-unsafe-swiftshader"] });
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        try {
            await page.goto(`${getEffectiveTestBaseUrl()}/artemis2/?testMode=true`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.blocking === "false");
            if (await page.evaluate(() => document.querySelector(".controls-cluster--transport")?.classList.contains("is-playing")))
                await page.locator("#animate").click();
            const desktop = await readMountedCameraInvariantSnapshot(page);
            await page.setViewportSize({ width: 390, height: 844 });
            await page.locator('[data-mobile-tab="views"]').click();
            await page.locator('[data-mobile-view-preset="moon"]').click();
            await page.waitForFunction(() => document.getElementById("camera-position")?.value === "spacecraft"
                && document.getElementById("camera-look")?.value === "moon");
            const mobile = await readMountedCameraInvariantSnapshot(page);
            await page.setViewportSize({ width: 1440, height: 900 });
            await page.waitForFunction(() => document.getElementById("camera-position")?.value === "manual");
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const restored = await readMountedCameraInvariantSnapshot(page);
            expect(restored.cameraFov).toBeCloseTo(desktop.cameraFov, 8);
            expect(restored.timelineSliderValue).toBe(mobile.timelineSliderValue);
            await page.setViewportSize({ width: 1320, height: 820 });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const resized = await readMountedCameraInvariantSnapshot(page);
            expect(resized.cameraFov).toBeCloseTo(desktop.cameraFov, 8);
            expect(resized.timelineSliderValue).toBe(mobile.timelineSliderValue);
        } finally { await browser.close(); }
    }, 90000);

    it("preserves the craft-to-Moon camera and clock through Mission/Views tab changes", async () => {
        const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=gl", "--enable-unsafe-swiftshader"] });
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        try {
            await page.goto(`${getEffectiveTestBaseUrl()}/artemis2/?testMode=true`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.blocking === "false");
            expect(await page.evaluate(() => {
                const event = document.querySelector('#burnbuttons button[data-event-key="closestApproach"]');
                event?.click();
                return !!event;
            })).toBe(true);
            await page.locator('[data-mobile-tab="views"]').click();
            await page.locator('[data-mobile-view-preset="moon"]').click();
            await page.waitForFunction(() => document.getElementById("camera-position")?.value === "spacecraft"
                && document.getElementById("camera-look")?.value === "moon");
            await page.waitForTimeout(500);
            const reference = await readMountedCameraInvariantSnapshot(page);
            for (let i = 0; i < 3; i += 1) {
                await page.locator('[data-mobile-tab="mission"]').click();
                await page.locator('[data-mobile-tab="views"]').click();
            }
            await page.waitForTimeout(500);
            const after = await readMountedCameraInvariantSnapshot(page);
            expect(after.positionMode).toBe("spacecraft");
            expect(after.lookMode).toBe("moon");
            expect(after.cameraFov).toBeCloseTo(reference.cameraFov, 8);
            expect(after.timelineSliderValue).toBe(reference.timelineSliderValue);
            expect(after.cameraToLookDistance).toBeCloseTo(reference.cameraToLookDistance, 8);
            expect(after.mountOffsetLength).toBeLessThan(1e-9);
            expect(after.cameraToMountDistance).toBeLessThan(1e-9);
            expect(after.targetToLookDistance).toBeLessThan(1e-9);
            expect(after.noRotate).toBe(true);
            expect(after.noPan).toBe(true);
        } finally {
            await browser.close();
        }
    }, 90000);
});
