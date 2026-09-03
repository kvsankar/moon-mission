// Headless screenshot of mission.html?mission=artemis2 in different camera views.
// Usage: node scripts/moon-tune/mission-shot.mjs <preset> <label>
//   preset: free | earth | moon (mobile-view-preset values)
//
// Drives the mobile-view-preset buttons or directly commits camera modes via the
// page's window globals to switch between Follow Earth (lookMode=earth) and
// Craft to Moon (positionMode=spacecraft, lookMode=moon).

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

const OUT = path.resolve("tmp/moon-tune/shots");
await fs.mkdir(OUT, { recursive: true });
const PRESET = process.argv[2] || "moon";
const LABEL = process.argv[3] || `mission-${PRESET}`;

const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: [
        "--headless=new",
        "--disable-dev-shm-usage",
        "--ignore-gpu-blocklist",
        "--enable-gpu",
        "--enable-webgl",
    ],
});
try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

    const baseUrl = process.env.MOON_TUNE_BASE_URL || "http://127.0.0.1:7275";
    await page.goto(`${baseUrl}/mission.html?mission=artemis2`, { waitUntil: "networkidle" });
    // Wait for scene init.
    await page.waitForTimeout(7000);

    // Force the desktop "from-to" camera mode via the global toggleViewMode if available,
    // otherwise click the Follow pills.
    if (PRESET === "earth") {
        // Follow Earth: positionMode = manual, lookMode = earth (or zoom out and look at earth)
        await page.click("#follow-pill-earth").catch(() => {});
    } else if (PRESET === "moon") {
        // Craft -> Moon means positionMode=spacecraft, lookMode=moon. The desktop UI
        // exposes this via the From/To controls; simplest: click follow-pill-moon
        // to lock look on moon, then use the From: Spacecraft option in settings.
        await page.click("#follow-pill-moon").catch(() => {});
        // Try to trigger spacecraft as From:
        await page.evaluate(() => {
            const fromSpacecraft = document.querySelector('[data-from-mode="spacecraft"], #from-spacecraft, [value="spacecraft"]');
            if (fromSpacecraft) fromSpacecraft.click();
        });
    } else if (PRESET === "free") {
        await page.click("#follow-pill-craft").catch(() => {});
    }

    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${LABEL}.png`), fullPage: false });
    console.log("wrote", path.join(OUT, `${LABEL}.png`));

    // Try to also crop the aux panels showing the moon for easier inspection.
    const auxSelectors = ["#aux-camera-panel-moon", "#aux-camera-panel-earth-to-moon", "#aux-camera-view--moon", "[data-aux-panel-id=\"moon\"]", "[data-aux-panel-id=\"earth-to-moon\"]"];
    for (const sel of auxSelectors) {
        const handle = await page.$(sel);
        if (handle) {
            const file = path.join(OUT, `${LABEL}-aux-${sel.replace(/[^a-z0-9]/gi, "_")}.png`);
            await handle.screenshot({ path: file });
            console.log("wrote", file);
        }
    }
} finally {
    await browser.close();
}
