import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { ssim } from "ssim.js";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";

let browser;
const currentDir = join(process.cwd(), "test/screenshots/current/design-review");
const baselineDir = join(process.cwd(), "test/screenshots/baseline/design");
const updateBaselines = process.env.UPDATE_DESIGN_BASELINES === "true";

async function screenshot(locator, name) {
    const bytes = await locator.screenshot({ path: join(currentDir, name) });
    const baselinePath = join(baselineDir, name);
    if (updateBaselines) writeFileSync(baselinePath, bytes);
    const current = PNG.sync.read(bytes);
    const baseline = PNG.sync.read(readFileSync(baselinePath));
    expect(current.width).toBe(baseline.width);
    expect(current.height).toBe(baseline.height);
    expect(ssim(current, baseline).mssim).toBeGreaterThan(0.98);
}

async function loadMission(page) {
    await page.goto(`${getEffectiveTestBaseUrl()}/artemis2/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("mission-loading-overlay")?.dataset.blocking === "false");
    await page.evaluate(() => document.fonts.ready);
}

describe("Shared visual design", () => {
    beforeAll(async () => {
        mkdirSync(currentDir, { recursive: true });
        if (updateBaselines) mkdirSync(baselineDir, { recursive: true });
        browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=gl", "--enable-unsafe-swiftshader"] });
    });
    afterAll(async () => { await browser?.close(); });

    it("uses the same readable selection palette in both mission selectors", async () => {
        const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
        try {
            const palettes = [];
            for (const route of ["index.html", "mission.html"]) {
                await page.goto(`${getEffectiveTestBaseUrl()}/${route}`, { waitUntil: "domcontentloaded" });
                await page.waitForSelector(".landing-card");
                await page.evaluate(() => document.fonts.ready);
                palettes.push(await page.locator(".landing-view-button--active").evaluate(e => ({
                    color: getComputedStyle(e).color,
                    background: getComputedStyle(e).backgroundColor,
                    gradient: getComputedStyle(e).backgroundImage,
                })));
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                if (route === "index.html") {
                    await screenshot(page.locator(".landing-topbar"), "landing-toolbar.png");
                    await page.screenshot({ path: join(currentDir, "mission-selector.png") });
                }
            }
            expect(palettes[0]).toEqual(palettes[1]);
            expect(palettes[0].gradient).toBe("none");
            const luminance = color => {
                const rgb = color.match(/\d+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
                return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
            };
            expect((luminance(palettes[0].color) + 0.05) / (luminance(palettes[0].background) + 0.05)).toBeGreaterThanOrEqual(4.5);
        } finally { await page.close(); }
    }, 90000);

    it("keeps keyboard focus and configuration popovers visible above the docked workspace", async () => {
        const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
        try {
            await loadMission(page);
            await screenshot(page.locator("#dockview-panel-launch-strip"), "desktop-launchers.png");
            const launcher = page.locator("#toggle-pill-lunar-craters");
            await launcher.focus();
            expect(await launcher.evaluate(e => getComputedStyle(e).outlineStyle)).toBe("solid");
            await launcher.press("Enter");
            const panel = page.locator("#lunar-crater-controls-panel");
            await panel.waitFor({ state: "visible" });
            expect(await panel.evaluate(e => {
                const r = e.getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
                return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && e.contains(hit);
            })).toBe(true);
            await page.screenshot({ path: join(currentDir, "lunar-features.png") });
            await launcher.click();
            await panel.waitFor({ state: "hidden" });
            const composerGroup = page.locator(".dv-groupview").filter({ has: page.locator(".aux-camera-view--composer") });
            await composerGroup.getByRole("button", { name: "Maximize panel group", exact: true }).click();
            const composerLauncher = page.getByRole("button", { name: "Open Frame and Shoot lunar feature controls", exact: true });
            await composerLauncher.click();
            const composerPanel = page.locator(`#${await composerLauncher.getAttribute("aria-controls")}`);
            await composerPanel.waitFor({ state: "visible" });
            expect(await composerPanel.evaluate(e => {
                const r = e.getBoundingClientRect();
                return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + 20));
            })).toBe(true);
            await page.screenshot({ path: join(currentDir, "frame-and-shoot-controls.png") });
        } finally { await page.close(); }
    }, 90000);

    it("provides 44px mobile transport and navigation without overlapping the timeline", async () => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        try {
            await loadMission(page);
            await page.waitForSelector("body.mobile-shell-enabled");
            const sizes = await page.locator(".mobile-shell__control-btn:visible, .mobile-shell__nav-btn:visible").evaluateAll(elements => elements.map(e => {
                const r = e.getBoundingClientRect();
                return { width: r.width, height: r.height };
            }));
            expect(sizes.length).toBeGreaterThanOrEqual(7);
            for (const size of sizes) {
                expect(size.width).toBeGreaterThanOrEqual(44);
                expect(size.height).toBeGreaterThanOrEqual(44);
            }
            expect(await page.evaluate(() => document.querySelector("#timeline-dock").getBoundingClientRect().bottom <= document.querySelector(".mobile-shell__nav").getBoundingClientRect().top)).toBe(true);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await screenshot(page.locator(".mobile-shell__nav"), "mobile-navigation.png");
            await page.screenshot({ path: join(currentDir, "mobile-mission.png") });
            await page.locator('[data-mobile-tab="views"]').click();
            await page.locator("#mobile-card-views").waitFor({ state: "visible" });
            await page.screenshot({ path: join(currentDir, "mobile-views.png") });
        } finally { await page.close(); }
    }, 90000);
});
