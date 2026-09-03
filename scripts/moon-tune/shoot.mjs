// Headless Playwright tuner-shot script.
// Usage: node scripts/moon-tune/shoot.mjs <label> [json-overrides]
// Renders moon-render-tuner.html with framing matching the Artemis II Earth-rise reference,
// applies parameter overrides via the tuner's Apply JSON path, and writes a PNG.

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.MOON_TUNE_BASE_URL || "http://127.0.0.1:7275";
const OUT_DIR = path.resolve("tmp/moon-tune/shots");
await fs.mkdir(OUT_DIR, { recursive: true });

const label = process.argv[2] || "shot";
const overridesJson = process.argv[3] || "{}";
const overrides = JSON.parse(overridesJson);

// Lighting + camera framing chosen to mimic the Artemis II Earth-rise reference:
// low oblique view of the lunar limb with the sun grazing from the right at low elevation,
// producing a deep terminator on the left side of the frame.
//
// Tuner camera convention (from moon-render-tuner.js):
//   pos = (R*cos(pitch)*cos(yaw), R*sin(pitch), R*cos(pitch)*sin(yaw)), looks at origin.
// Default yaw=-0.35rad, pitch=0.22rad puts the camera at world azimuth ~-20°.
// To light the visible hemisphere from the right of the camera view, primary azimuth
// must be near the camera's azimuth ± a few tens of degrees, with low elevation.
const FRAMING = {
    primaryAzimuthDeg: 25,      // sun in front-right of moon, visible to camera
    primaryElevationDeg: 9,     // low sun for long shadows
    primaryIntensity: 3.2,
    ambientIntensity: 0.010,
    earthshineIntensity: 0.05,
    earthshineAzimuthDeg: -45,
    earthshineElevationDeg: 22,
    cameraFovDeg: 28,
    cameraDistance: 1.95,
    toneExposure: 1.05,
};

const DRAG_DX = parseInt(process.env.DRAG_DX || "60", 10);
const DRAG_DY = parseInt(process.env.DRAG_DY || "140", 10);
const PROFILE = process.env.PROFILE || "fast";
const VIEW_W = 1100;
const VIEW_H = 880;

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
    const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H } });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
    page.on("console", (m) => {
        const t = m.type();
        if (t === "error" || t === "warning") {
            console.log(`page[${t}]`, m.text());
        }
    });

    await page.goto(`${BASE_URL}/moon-render-tuner.html`, { waitUntil: "networkidle" });
    if (PROFILE === "quality") {
        await page.selectOption("#tuner-asset-profile", PROFILE);
        await page.click("#tuner-reload-assets");
    }
    // Wait long enough for color + height map + generated normal map to be ready.
    await page.waitForTimeout(PROFILE === "quality" ? 6000 : 3500);
    // Ensure WebGL context is alive
    const canvasInfo = await page.evaluate(() => {
        const c = document.getElementById("tuner-canvas");
        return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight };
    });
    console.log("canvas", canvasInfo);

    const merged = { ...FRAMING, ...overrides };
    await page.evaluate((values) => {
        const el = document.getElementById("tuner-json");
        el.value = JSON.stringify({ values }, null, 2);
        document.getElementById("tuner-apply").click();
    }, merged);

    // Wait for any debounced normal-map rebuild kicked off by the apply.
    await page.waitForTimeout(2200);

    // Drag camera using real pointer events so the tuner's pointer handlers fire.
    if (DRAG_DX || DRAG_DY) {
        const canvasBox = await page.locator("#tuner-canvas").boundingBox();
        const startX = canvasBox.x + canvasBox.width / 2;
        const startY = canvasBox.y + canvasBox.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + DRAG_DX, startY + DRAG_DY, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(500);
    }

    const outPath = path.join(OUT_DIR, `${label}.png`);
    const canvas = await page.locator("#tuner-canvas");
    await canvas.screenshot({ path: outPath });
    console.log("wrote", outPath);
} finally {
    await browser.close();
}
