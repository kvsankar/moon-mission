import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";

let browser;
const carouselSelector = "#timeline-dock .timeline-dock__event-carousel";
const clock = page => page.locator("#timeline-slider").getAttribute("data-current-time-ms").then(Number);
async function ready(page) {
    await page.waitForFunction(() => document.querySelector("#mission-loading-overlay")?.dataset.state === "ready"
        && document.querySelector(".swiper2")?.swiper?.initialized, null, { timeout: 60000 });
}
async function open(page) {
    await page.goto(`${getEffectiveTestBaseUrl()}/chandrayaan3/?testMode=true`, { waitUntil: "domcontentloaded" });
    await ready(page);
    await page.locator("#control-panel-toggle").click();
    await page.locator(carouselSelector).waitFor({ state: "visible" });
    await page.locator(carouselSelector).evaluate(element => { element.scrollLeft = 0; });
    await page.evaluate(() => {
        window.__carouselTestClicks = 0;
        document.getElementById("burnbuttons").addEventListener("click", event => {
            if (event.target.closest("button")) window.__carouselTestClicks += 1;
        });
    });
}
async function assertNativePosition(page) {
    expect(await page.locator("#burnbuttons").evaluate(element => {
        const transform = getComputedStyle(element).transform;
        return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m41;
    })).toBeCloseTo(0, 1);
}

describe("Swiper bundle compatibility with mission controls", () => {
    beforeAll(async () => {
        browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=gl", "--enable-unsafe-swiftshader"] });
        // Warm Vite's new dependency bundle before retaining any scene handles.
        const page = await browser.newPage();
        try {
            await page.goto(`${getEffectiveTestBaseUrl()}/chandrayaan3/?testMode=true`);
            await ready(page);
            // Vite uses npm; separately exercise the authored production CDN
            // import and constructor in the browser without deploying anything.
            // Keep import() inside browser-owned source: Vitest otherwise
            // rewrites it into a Node/SSR helper before Playwright serializes it.
            expect(await page.evaluate(`(async () => {
                const imports = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports;
                const { default: Swiper } = await import(imports["swiper/bundle"]);
                const host = document.createElement("div");
                host.className = "swiper";
                host.style.cssText = "position:fixed;left:-10000px;width:300px";
                host.innerHTML = '<div class="swiper-wrapper"><div class="swiper-slide">One</div><div class="swiper-slide">Two</div></div>';
                document.body.appendChild(host);
                const instance = new Swiper(host, { allowTouchMove: false });
                const initialized = instance.initialized && instance.slides.length === 2;
                instance.destroy(true, true);
                host.remove();
                return initialized;
            })()`)).toBe(true);
        }
        finally { await page.close(); }
    }, 90000);
    afterAll(async () => { await browser?.close(); });

    it("mouse-drags event buttons without seeking or applying a second scroll transform", async () => {
        const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
        try {
            await open(page);
            const before = await clock(page);
            const bounds = await page.locator('#burnbuttons button[data-event-key="ebn3"]').boundingBox();
            await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
            await page.mouse.down();
            await page.mouse.move(bounds.x + bounds.width / 2 - 130, bounds.y + bounds.height / 2, { steps: 12 });
            await page.mouse.up();
            expect(await page.locator(carouselSelector).evaluate(element => element.scrollLeft)).toBeGreaterThan(40);
            expect(await clock(page)).toBe(before);
            expect(await page.evaluate(() => window.__carouselTestClicks)).toBe(0);
            await assertNativePosition(page);
        } finally { await page.close(); }
    }, 90000);

    it("touch-scrolls the event strip without seeking", async () => {
        const page = await browser.newPage({ viewport: { width: 900, height: 760 }, hasTouch: true });
        try {
            await open(page);
            const before = await clock(page);
            const box = await page.locator(carouselSelector).boundingBox();
            const client = await page.context().newCDPSession(page);
            const x = box.x + box.width * 0.75, y = box.y + box.height / 2;
            await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
            for (let step = 1; step <= 12; step += 1) {
                await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - step * 15, y }] });
                await page.waitForTimeout(16);
            }
            await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            await expect.poll(() => page.locator(carouselSelector).evaluate(element => element.scrollLeft)).toBeGreaterThan(40);
            expect(await clock(page)).toBe(before);
            expect(await page.evaluate(() => window.__carouselTestClicks)).toBe(0);
            await assertNativePosition(page);
        } finally { await page.close(); }
    }, 90000);

    it("replaces old instances on origin initialization and keeps keyboard events and transport usable", async () => {
        const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
        try {
            await open(page);
            const old = await page.evaluateHandle(() => document.querySelector(".swiper2").swiper);
            await page.getByRole("button", { name: "View", exact: true }).click();
            await page.locator("#origin-pill-moon").click();
            await ready(page);
            const close = page.getByRole("button", { name: "Close view controls", exact: true });
            if (await close.isVisible()) await close.click();
            expect(await old.evaluate(instance => instance.destroyed)).toBe(true);
            expect(await page.locator(".swiper2 .swiper-notification").count()).toBe(1);
            if (!await page.locator(carouselSelector).isVisible()) await page.locator("#control-panel-toggle").click();
            const event = page.locator('#burnbuttons button[data-event-key="lbn4"]');
            const eventTime = Number(await event.getAttribute("data-event-time-ms"));
            await event.focus();
            await page.keyboard.press("Enter");
            await expect.poll(() => clock(page)).toBeCloseTo(eventTime, 0);
            expect(await page.evaluate(() => window.__carouselTestClicks)).toBe(1);
            await assertNativePosition(page);
            await page.locator("#animate").click();
            await page.waitForFunction(() => document.querySelector(".controls-cluster--transport")?.classList.contains("is-playing"));
            await page.locator("#animate").click();
            await page.waitForFunction(() => !document.querySelector(".controls-cluster--transport")?.classList.contains("is-playing"));
        } finally { await page.close(); }
    }, 120000);
});
