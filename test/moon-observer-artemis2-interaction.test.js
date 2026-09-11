import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const BASE_URL = process.env.VITE_TEST_BASE_URL || "http://127.0.0.1:7275";
let browser;

function luminance(data, index) {
    return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function compareRegisteredDarkRegion(referenceBuffer, renderBuffer) {
    const reference = PNG.sync.read(referenceBuffer);
    const render = PNG.sync.read(renderBuffer);
    expect(render.width).toBe(reference.width);
    expect(render.height).toBe(reference.height);
    let pixels = 0;
    let referenceTotal = 0;
    let renderTotal = 0;
    let referenceNearBlack = 0;
    let renderNearBlack = 0;
    let ohmPixels = 0;
    let ohmReferenceNearBlack = 0;
    let ohmRenderNearBlack = 0;
    for (let y = Math.floor(reference.height * 0.38); y < reference.height; y += 1) {
        for (let x = 0; x < reference.width; x += 1) {
            const index = (y * reference.width + x) * 4;
            const referenceValue = luminance(reference.data, index);
            const renderValue = luminance(render.data, index);
            if (referenceValue <= 2 || referenceValue >= 85) continue;
            pixels += 1;
            referenceTotal += referenceValue;
            renderTotal += renderValue;
            if (referenceValue < 16) referenceNearBlack += 1;
            if (renderValue < 16) renderNearBlack += 1;
            if (
                x >= reference.width * 0.87
                && y >= reference.height * 0.67
                && y < reference.height * 0.89
            ) {
                ohmPixels += 1;
                if (referenceValue < 16) ohmReferenceNearBlack += 1;
                if (renderValue < 16) ohmRenderNearBlack += 1;
            }
        }
    }
    return {
        pixels,
        meanDelta: renderTotal / pixels - referenceTotal / pixels,
        nearBlackDelta: renderNearBlack / pixels - referenceNearBlack / pixels,
        ohmPixels,
        ohmNearBlackDelta: ohmRenderNearBlack / ohmPixels
            - ohmReferenceNearBlack / ohmPixels,
    };
}

describe("Moon observer Artemis II comparison", () => {
    beforeAll(async () => {
        browser = await chromium.launch({ headless: true });
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("loads the registered Earthset reference and enforces overlay registration", async () => {
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });
        await page.goto(
            `${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e009289&model=physical-dem&tier=high`,
            { waitUntil: "domcontentloaded" },
        );
        await page.waitForFunction(() => (
            document.querySelectorAll("#observer-reference option").length === 6 &&
            document.getElementById("observer-reference-image")?.naturalWidth === 1600 &&
            document.getElementById("observer-resources")?.textContent?.includes("uint16")
        ), null, { timeout: 180000 });

        expect(await page.locator("#observer-time").inputValue()).toBe("2026-04-06T22:41:58");
        expect(await page.locator("#observer-camera-fov").inputValue()).toBe("6.146");
        expect(await page.locator("#observer-roll").inputValue()).toBe("91.14");
        expect(await page.locator("#observer-target-latitude").inputValue()).toBe("17.3461");
        expect(await page.locator("#observer-target-longitude").inputValue()).toBe("-125.3453");
        expect(await page.locator("#observer-distance").textContent()).toBe("8,382 km");
        expect(await page.locator('[data-physical-control="physicalNormalScale"]').inputValue()).toBe("1");
        expect(await page.locator('[data-physical-control="physicalExposure"]').inputValue()).toBe("0.4");
        expect(await page.locator('[data-physical-control="physicalToneGamma"]').inputValue()).toBe("1.06");

        const calibration = compareRegisteredDarkRegion(
            await page.locator("#observer-reference-image").screenshot(),
            await page.locator("#observer-canvas").screenshot(),
        );
        expect(calibration.pixels).toBeGreaterThan(30000);
        expect(Math.abs(calibration.meanDelta)).toBeLessThan(5);
        expect(Math.abs(calibration.nearBlackDelta)).toBeLessThan(0.025);
        expect(calibration.ohmPixels).toBeGreaterThan(1000);
        expect(Math.abs(calibration.ohmNearBlackDelta)).toBeLessThan(0.04);

        await page.locator("#observer-compare-overlay").click();
        const referenceBox = await page.locator("#observer-reference-frame").boundingBox();
        const renderBox = await page.locator(".observer-frame--render").boundingBox();
        expect(referenceBox).toMatchObject(renderBox);
        expect(await page.locator("#observer-reference-image").evaluate((image) => image.style.opacity))
            .toBe("0.5");
        expect(await page.locator("#observer-reference-frame").evaluate((element) => (
            getComputedStyle(element).backgroundColor
        ))).toBe("rgba(0, 0, 0, 0)");
        expect(await page.locator("#observer-reference-image").evaluate((element) => (
            getComputedStyle(element).backgroundColor
        ))).toBe("rgba(0, 0, 0, 0)");

        await page.locator("#observer-reference").selectOption("art002e009279");
        await page.waitForFunction(() => (
            document.getElementById("observer-reference-image")?.currentSrc?.includes("55193206753")
        ));
        expect(await page.locator("#observer-compare-overlay").isDisabled()).toBe(true);
        expect(await page.locator("#observer-visuals").getAttribute("data-mode")).toBe("split");
        expect(await page.locator("#observer-reference-meta").textContent())
            .toContain("Unregistered camera");
        expect(errors).toEqual([]);
        await page.close();
    }, 210000);

    it("stacks Split frames on a narrow viewport", async () => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.goto(
            `${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e009289&tier=low&compare=split`,
            { waitUntil: "domcontentloaded" },
        );
        await page.waitForFunction(() => (
            document.getElementById("observer-reference-image")?.naturalWidth > 0 &&
            document.getElementById("observer-resources")?.textContent?.includes("128x64")
        ));
        const rows = await page.locator("#observer-visuals").evaluate((element) => (
            getComputedStyle(element).gridTemplateRows
        ));
        expect(rows.split(" ").filter(Boolean)).toHaveLength(2);
        await page.close();
    }, 60000);

    it("rolls back a failed High selection to installed Low resources", async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        await page.goto(`${BASE_URL}/moon-observer-test.html?tier=low`, {
            waitUntil: "domcontentloaded",
        });
        await page.waitForFunction(() => (
            document.getElementById("observer-resources")?.textContent?.includes("128x64")
        ));
        await page.route("**/ldem_16_uint_quality.png", (route) => route.abort());
        await page.locator("#observer-tier-high").click();
        await page.waitForFunction(() => (
            document.getElementById("observer-status")?.textContent === "Failed to load high resources"
        ));

        expect(await page.locator("#observer-tier-low").getAttribute("aria-pressed")).toBe("true");
        expect(await page.locator("#observer-resources").textContent()).toContain("128x64");
        expect(new URL(page.url()).searchParams.get("tier")).toBe("low");
        await page.close();
    }, 60000);

    it("preserves a reference-image failure after profile loading finishes", async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        await page.route("**/timeline-media/web/**", (route) => route.abort());
        await page.goto(
            `${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e009289&tier=low`,
            { waitUntil: "domcontentloaded" },
        );
        await page.waitForFunction(() => (
            document.getElementById("observer-resources")?.textContent?.includes("128x64") &&
            document.getElementById("observer-status")?.textContent?.includes("Unable to load NASA reference")
        ));
        expect(await page.locator("#observer-status").textContent())
            .toBe("Unable to load NASA reference art002e009289.");
        await page.unroute("**/timeline-media/web/**");
        await page.locator("#observer-reference").selectOption("");
        expect(await page.locator("#observer-status").textContent()).toBe("");
        await page.locator("#observer-reference").selectOption("art002e009289");
        await page.waitForFunction(() => (
            document.getElementById("observer-reference-image")?.naturalWidth === 1600 &&
            document.getElementById("observer-status")?.textContent === ""
        ));
        await page.close();
    }, 60000);
});
