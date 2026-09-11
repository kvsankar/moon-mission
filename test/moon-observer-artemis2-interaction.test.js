import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const BASE_URL = process.env.VITE_TEST_BASE_URL || "http://127.0.0.1:7275";
let browser;

function luminance(data, index) {
    return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function compareRegisteredDarkRegion(referenceBuffer, renderBuffer, ohmBounds) {
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
                x >= reference.width * ohmBounds.xMin
                && x < reference.width * ohmBounds.xMax
                && y >= reference.height * ohmBounds.yMin
                && y < reference.height * ohmBounds.yMax
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

function countWidenedDarkContext(renderBuffer, startRow) {
    const render = PNG.sync.read(renderBuffer);
    let visibleTerrain = 0;
    let nearBlack = 0;
    for (let y = Math.max(0, Math.floor(startRow)); y < render.height; y += 1) {
        for (let x = 0; x < render.width; x += 1) {
            const value = luminance(render.data, (y * render.width + x) * 4);
            if (value > 2) visibleTerrain += 1;
            if (value < 16) nearBlack += 1;
        }
    }
    return { visibleTerrain, nearBlack };
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
            `${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e009289&model=physical-dem&tier=high&framing=camera`,
            { waitUntil: "domcontentloaded" },
        );
        await page.waitForFunction(() => (
            document.querySelectorAll("#observer-reference option").length === 9 &&
            document.getElementById("observer-reference-image")?.naturalWidth === 1600 &&
            document.getElementById("observer-resources")?.textContent?.includes("uint16")
        ), null, { timeout: 180000 });

        expect(await page.locator("#observer-time").inputValue()).toBe("2026-04-06T22:41:58");
        expect(await page.locator("#observer-camera-fov").inputValue()).toBe("8");
        expect(await page.locator("#observer-roll").inputValue()).toBe("91.14");
        expect(await page.locator("#observer-target-latitude").inputValue()).toBe("17.3461");
        expect(await page.locator("#observer-target-longitude").inputValue()).toBe("-125.3453");
        expect(await page.locator("#observer-distance").textContent()).toBe("8,382 km");
        expect(await page.locator('[data-physical-control="physicalNormalScale"]').inputValue()).toBe("1");
        expect(await page.locator('[data-physical-control="physicalExposure"]').inputValue()).toBe("0.4");
        expect(await page.locator('[data-physical-control="physicalToneGamma"]').inputValue()).toBe("1.06");

        const referenceFrame = page.locator("#observer-reference-viewport");
        const renderCanvas = page.locator("#observer-canvas");
        const referenceFrameBox = await referenceFrame.boundingBox();
        const referenceImageBox = await page.locator("#observer-reference-image").boundingBox();
        const referenceBuffer = await referenceFrame.screenshot();
        const renderBuffer = await renderCanvas.screenshot();
        const referenceScale = referenceImageBox.width / referenceFrameBox.width;
        const referenceInset = (1 - referenceScale) / 2;
        const calibration = compareRegisteredDarkRegion(referenceBuffer, renderBuffer, {
            xMin: referenceInset + 0.87 * referenceScale,
            xMax: referenceInset + referenceScale,
            yMin: referenceInset + 0.67 * referenceScale,
            yMax: referenceInset + 0.89 * referenceScale,
        });
        expect(calibration.pixels).toBeGreaterThan(30000);
        expect(Math.abs(calibration.meanDelta)).toBeLessThan(5);
        expect(Math.abs(calibration.nearBlackDelta)).toBeLessThan(0.025);
        expect(calibration.ohmPixels).toBeGreaterThan(1000);
        expect(Math.abs(calibration.ohmNearBlackDelta)).toBeLessThan(0.04);
        expect(referenceScale).toBeCloseTo(0.767738, 4);
        const renderHeight = PNG.sync.read(renderBuffer).height;
        const sourceBottomRow = (
            (referenceImageBox.y + referenceImageBox.height - referenceFrameBox.y)
                / referenceFrameBox.height
        ) * renderHeight;
        const darkContext = countWidenedDarkContext(renderBuffer, sourceBottomRow);
        expect(darkContext.visibleTerrain).toBeGreaterThan(5000);
        expect(darkContext.nearBlack).toBeGreaterThan(5000);

        await page.locator("#observer-compare-overlay").click();
        const referenceBox = await page.locator("#observer-reference-viewport").boundingBox();
        const renderBox = await page.locator("#observer-render-viewport").boundingBox();
        expect(referenceBox).toMatchObject(renderBox);
        expect(await page.locator("#observer-reference-image").evaluate((image) => image.style.opacity))
            .toBe("0.5");
        expect(await page.locator("#observer-reference-viewport").evaluate((element) => (
            getComputedStyle(element).backgroundColor
        ))).toBe("rgba(0, 0, 0, 0)");
        expect(await page.locator("#observer-reference-image").evaluate((element) => (
            getComputedStyle(element).backgroundColor
        ))).toBe("rgba(0, 0, 0, 0)");

        await page.locator("#observer-mode-geocenter").click();
        expect(await page.locator("#observer-visuals").getAttribute("data-mode")).toBe("split");
        expect(await page.locator("#observer-compare-overlay").isDisabled()).toBe(true);

        await page.locator("#observer-reference").selectOption("art002e009279");
        await page.waitForFunction(() => (
            document.getElementById("observer-reference-image")?.currentSrc?.includes("55193206753")
        ));
        expect(await page.locator("#observer-compare-overlay").isDisabled()).toBe(false);
        expect(await page.locator("#observer-visuals").getAttribute("data-mode")).toBe("split");
        expect(await page.locator("#observer-reference-meta").textContent())
            .toContain("Registered camera");
        expect(errors).toEqual([]);
        await page.close();
    }, 210000);

    it("rotates the render from its visible toolbar and preserves camera framing", async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 650 } });
        await page.goto(`${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e009289&model=physical-dem&tier=low&roll=170`);
        await page.waitForFunction(() => document.getElementById("observer-status").textContent === "");
        const cameraFov = await page.locator("#observer-camera-fov").inputValue();
        const target = await page.locator("#observer-target-latitude").inputValue();
        const initial = await page.locator("#observer-canvas").screenshot();
        await page.locator('[data-observer-rotate="90"]').click();
        expect(await page.locator("#observer-image-roll").inputValue()).toBe("-100");
        expect(await page.locator("#observer-roll").inputValue()).toBe("-100");
        expect(new URL(page.url()).searchParams.get("roll")).toBe("-100");
        expect((await page.locator("#observer-canvas").screenshot()).equals(initial)).toBe(false);
        await page.locator('[data-observer-rotate="-90"]').click();
        expect(await page.locator("#observer-image-roll").inputValue()).toBe("170");
        await page.locator("#observer-image-roll").fill("91.14");
        await page.locator("#observer-image-roll").press("Tab");
        expect(await page.locator("#observer-roll").inputValue()).toBe("91.14");
        await page.reload();
        await page.waitForFunction(() => document.getElementById("observer-status").textContent === "");
        expect(await page.locator("#observer-image-roll").inputValue()).toBe("91.14");
        expect(await page.locator("#observer-camera-fov").inputValue()).toBe(cameraFov);
        expect(await page.locator("#observer-target-latitude").inputValue()).toBe(target);
        await page.locator("#observer-rotation-reset").click();
        expect(await page.locator("#observer-roll").inputValue()).toBe("0");
        await page.setViewportSize({ width: 640, height: 800 });
        await page.locator('[data-observer-rotate="90"]').click();
        expect(await page.locator("#observer-image-roll").inputValue()).toBe("90");
        await page.close();
    }, 90000);

    it("fits old photo-FOV links and keeps photo/render zoom and pan independent", async () => {
        const page = await browser.newPage({ viewport: { width: 1500, height: 700 } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e010208&tier=low&model=physical-dem&roll=-90&fov=16.991&target=surface&targetLat=15&targetLon=-125`);
        await page.waitForFunction(() => document.getElementById("observer-status").textContent === "");
        const params = () => new URL(page.url()).searchParams;
        expect(params().get("framing")).toBe("whole");
        expect(params().get("target")).toBe("center");
        const fov = Number(await page.locator("#observer-canvas").getAttribute("data-base-fov"));
        expect(fov).toBeGreaterThan(24);
        const initialRender = await page.locator("#observer-canvas").screenshot();
        await page.locator('#observer-reference-controls [data-zoom="1.25"]').click();
        await page.locator('#observer-reference-controls [data-pan="0.06,0"]').click();
        expect(params().get("photoZoom")).toBe("1.25");
        expect(params().get("photoX")).toBe("0.06");
        expect(params().get("renderZoom")).toBe("1");
        expect((await page.locator("#observer-canvas").screenshot()).equals(initialRender)).toBe(true);
        const photoBefore = await page.locator("#observer-reference-viewport").screenshot();
        await page.locator('#observer-render-controls [data-zoom="1.25"]').click();
        const bounds = await page.locator("#observer-render-viewport").boundingBox();
        await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.6, { steps: 4 });
        await page.mouse.up();
        expect(Number(params().get("renderX"))).toBeCloseTo(0.15, 2);
        expect((await page.locator("#observer-canvas").screenshot()).equals(initialRender)).toBe(false);
        expect((await page.locator("#observer-reference-viewport").screenshot()).equals(photoBefore)).toBe(true);
        await page.mouse.wheel(0, -100);
        await page.waitForFunction(() => Number(new URL(location.href).searchParams.get("renderZoom")) > 1.25);
        const viewUrl = page.url();
        await page.reload();
        await page.waitForFunction(() => document.getElementById("observer-status").textContent === "");
        expect(page.url()).toBe(viewUrl);
        await page.locator('#observer-render-controls [data-fit]').click();
        expect(params().get("renderZoom")).toBe("1");
        expect(params().get("renderX")).toBe("0");
        expect(params().get("photoZoom")).toBe("1.25");
        expect(params().get("photoX")).toBe("0.06");
        await page.locator('#observer-reference-controls [data-fit]').click();
        expect(params().get("photoZoom")).toBe("1");
        expect(params().get("photoX")).toBe("0");
        await page.locator('#observer-reference-viewport').focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('+');
        expect(params().get("photoX")).not.toBe("0");
        await page.keyboard.press('Home');
        expect(params().get("photoX")).toBe("0");
        // A new reference starts with clean, independent fit views.
        await page.locator('#observer-render-controls [data-zoom="1.25"]').click();
        await page.locator('#observer-reference').selectOption('art002e009289');
        expect(params().get("renderZoom")).toBe("1");
        expect(params().get("framing")).toBe("whole");
        await page.locator('#observer-registered-framing').click();
        expect(params().get("framing")).toBe("camera");
        await page.locator('#observer-reference-controls [data-fit]').click();
        expect(params().get("photoScale")).toBe("1");
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#observer-render-controls [data-fit]').click();
        await page.locator('#observer-reference-controls [data-zoom="1.25"]').click();
        expect(params().get("photoZoom")).toBe("1.25");
        expect(errors).toEqual([]);
        await page.close();
    }, 90000);

    it("applies photo brightness while preserving manual exposure and whole-Moon framing", async () => {
        const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
        await page.goto(`${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e010208&tier=low&model=physical-dem`);
        await page.waitForFunction(() => document.getElementById("observer-status").textContent === "");
        const exposure = page.locator('[data-physical-control="physicalExposure"]');
        expect(await exposure.inputValue()).toBe("1");
        expect(await page.locator('#observer-match-exposure').isChecked()).toBe(true);
        expect(new URL(page.url()).searchParams.get('framing')).toBe('whole');
        await exposure.evaluate(input => { input.value = '0.6'; });
        await exposure.dispatchEvent('input');
        expect(await page.locator('#observer-match-exposure').isChecked()).toBe(false);
        await page.locator('#observer-reference').selectOption('art002e009279');
        expect(await exposure.inputValue()).toBe('0.6');
        await page.reload();
        await page.waitForFunction(() => document.getElementById("observer-status").textContent === "");
        expect(await exposure.inputValue()).toBe('0.6');
        expect(await page.locator('#observer-match-exposure').isChecked()).toBe(false);
        await page.locator('#observer-match-exposure').check();
        expect(await exposure.inputValue()).toBe('0.4');
        await page.locator('#observer-reference').selectOption('art002e009281');
        expect(await exposure.inputValue()).toBe('1.05');
        await page.locator('#observer-mode-geocenter').click();
        expect(await exposure.inputValue()).toBe('0.4');
        await page.close();
    }, 60000);

    it("keeps every calibrated photo within its error bound and improves the dim references", async () => {
        const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e009277&tier=high&model=physical-dem&photoExposure=manual`);
        await page.waitForFunction(() => document.getElementById('observer-resources').textContent.includes('uint16') && document.getElementById('observer-status').textContent === '', null, { timeout: 180000 });
        const bounds = { art002e009277: 16, art002e009278: 17, art002e009279: 15, art002e010208: 15, art002e009281: 27, art002e009283: 28, art002e009287: 18, art002e009289: 23 };
        const results = [];
        for (const [id, maximumError] of Object.entries(bounds)) {
            await page.locator('#observer-reference').selectOption(id);
            await page.locator('#observer-reference-image').evaluate(image => image.decode());
            expect(await page.locator('#observer-registered-framing').isDisabled()).toBe(false);
            await page.locator('#observer-registered-framing').click();
            // Earthset's established wider inset is covered by the original test.
            if (id === 'art002e009289') {
                await page.locator('#observer-camera-fov').evaluate(input => { input.value = '6.146'; });
                await page.locator('#observer-camera-fov').dispatchEvent('input');
                await page.locator('#observer-reference-controls [data-fit]').click();
            }
            await page.locator('#observer-match-exposure').uncheck();
            const exposure = page.locator('[data-physical-control="physicalExposure"]');
            await exposure.evaluate(input => { input.value = '0.4'; });
            await exposure.dispatchEvent('input');
            const reference = PNG.sync.read(await page.locator('#observer-reference-viewport').screenshot());
            const baseline = PNG.sync.read(await page.locator('#observer-canvas').screenshot());
            await page.locator('#observer-match-exposure').check();
            const matched = PNG.sync.read(await page.locator('#observer-canvas').screenshot());
            expect(matched.width).toBe(reference.width);
            expect(matched.height).toBe(reference.height);
            let total = 0, baselineError = 0, matchedError = 0, darkTotal = 0, baselineDarkError = 0, matchedDarkError = 0;
            for (let y = Math.ceil(reference.height * (id === 'art002e009289' ? 0.38 : 0.08)); y < reference.height - 4; y++) {
                for (let x = 4; x < reference.width - 4; x++) {
                    const index = (y * reference.width + x) * 4;
                    const photo = luminance(reference.data, index);
                    if (photo <= 5) continue;
                    const before = Math.abs(luminance(baseline.data, index) - photo);
                    const after = Math.abs(luminance(matched.data, index) - photo);
                    total++; baselineError += before; matchedError += after;
                    if (photo < 85) { darkTotal++; baselineDarkError += before; matchedDarkError += after; }
                }
            }
            expect(total).toBeGreaterThan(20000);
            const result = { id, baselineMae: baselineError / total, matchedMae: matchedError / total, baselineDarkMae: baselineDarkError / darkTotal, matchedDarkMae: matchedDarkError / darkTotal };
            results.push(result);
            expect(result.matchedMae, id).toBeLessThan(maximumError);
            expect(result.matchedMae, id).toBeLessThanOrEqual(result.baselineMae + 0.1);
            expect(result.matchedDarkMae, id).toBeLessThanOrEqual(result.baselineDarkMae + 0.2);
            if (['art002e010208', 'art002e009281'].includes(id)) {
                expect(result.matchedMae, id).toBeLessThan(result.baselineMae * 0.55);
            }
        }
        console.log('Artemis photographic regression', JSON.stringify(results));
        expect(errors).toEqual([]);
        await page.close();
    }, 300000);

    it("uses displaced height in the GPU fragment horizon without lighting the deep night side", async () => {
        const page = await browser.newPage();
        await page.goto(`${BASE_URL}/moon-observer-test.html?tier=low`);
        const samples = await page.evaluate(async () => {
            // Keep browser imports out of Vitest's SSR import transformation.
            const importModule = new Function("url", "return import(url)");
            const THREE = await importModule('/node_modules/three/build/three.module.js');
            const { MoonRenderer } = await importModule('/src/platform/js/rendering/moon-renderer.js');
            const output = [];
            for (const [elevation, lightingModel] of [[0, 'physical-dem'], [0.005, 'physical-dem'], [0.005, 'current']]) {
                const dem = new THREE.DataTexture(new Float32Array(8).fill(0.5), 4, 2, THREE.RedFormat, THREE.FloatType);
                dem.needsUpdate = true;
                const moon = new MoonRenderer(1);
                moon.setRenderPipeline({ lightingModel });
                moon.setRenderSettings({
                    physicalDisplacementScale: elevation * 2,
                    physicalDisplacementBias: 0,
                    physicalNormalHeightScale: 0.01,
                    physicalGeometryWidthSegments: 128,
                    physicalGeometryHeightSegments: 64,
                });
                moon.setTextures(null, dem);
                moon.create(false, false, { deferGeneratedNormalMap: true });
                const material = moon.mesh.material;
                const compile = material.onBeforeCompile;
                material.onBeforeCompile = (shader, renderer) => {
                    compile(shader, renderer);
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <dithering_fragment>',
                        '#include <dithering_fragment>\n#if NUM_DIR_LIGHTS > 0\ngl_FragColor=vec4(vec3(moonSunVisibility),1.0);\n#endif',
                    );
                };
                const renderer = new THREE.WebGLRenderer();
                renderer.setSize(256, 256);
                const target = new THREE.WebGLRenderTarget(256, 256);
                const scene = new THREE.Scene();
                scene.add(moon.container);
                const sun = new THREE.DirectionalLight(0xffffff, 1);
                sun.position.set(10, 0, 0);
                scene.add(sun);
                const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
                camera.position.set(0, 0, 5);
                camera.lookAt(0, 0, 0);
                renderer.setRenderTarget(target);
                renderer.render(scene, camera);
                const values = { elevation, lightingModel };
                for (const [x, name] of [[123, 'raisedPoint'], [96, 'deepNight'], [140, 'day']]) {
                    const pixel = new Uint8Array(4);
                    renderer.readRenderTargetPixels(target, x, 128, 1, 1, pixel);
                    values[name] = pixel[0];
                }
                output.push(values);
                target.dispose();
                moon.dispose();
                renderer.dispose();
            }
            return output;
        });
        expect(samples[0]).toMatchObject({ elevation: 0, raisedPoint: 0, deepNight: 0, day: 255 });
        expect(samples[1]).toMatchObject({ elevation: 0.005, raisedPoint: 255, deepNight: 0, day: 255 });
        expect(samples[2]).toMatchObject({ lightingModel: 'current', raisedPoint: 0, deepNight: 0, day: 255 });
        await page.close();
    }, 60000);

    it("illuminates the reference ridges above Manzinus while preserving adjacent darkness", async () => {
        const page = await browser.newPage({ viewport: { width: 3300, height: 2050 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e010208&model=physical-dem&tier=high&framing=camera&photoExposure=matched`);
        await page.waitForFunction(() => document.getElementById('observer-resources').textContent.includes('uint16') && document.getElementById('observer-status').textContent === '', null, { timeout: 180000 });
        const reference = PNG.sync.read(await page.locator('#observer-reference-viewport').screenshot());
        const rendered = PNG.sync.read(await page.locator('#observer-canvas').screenshot());
        expect(rendered.width).toBe(reference.width);
        expect(rendered.height).toBe(reference.height);
        // Screenshot crop located by 1031 reference features. Only the topmost
        // ridges are scored, so bright terrain lower down cannot hide a cutoff.
        const minX = Math.floor(reference.width * 656.13 / 1497);
        const maxX = Math.ceil(reference.width * 911.55 / 1497);
        const minY = Math.floor(reference.height * 127.93 / 998);
        const maxY = Math.ceil(reference.height * 180.55 / 998);
        let litPixels = 0, missing = 0, referenceSum = 0, renderSum = 0, absoluteError = 0;
        let darkPixels = 0, darkSum = 0;
        for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
                const index = (y * reference.width + x) * 4;
                const photo = luminance(reference.data, index);
                const render = luminance(rendered.data, index);
                if (photo > 25) {
                    litPixels++; referenceSum += photo; renderSum += render;
                    absoluteError += Math.abs(render - photo);
                    if (render < 16) missing++;
                } else if (photo < 5) { darkPixels++; darkSum += render; }
            }
        }
        const metrics = { litPixels, missingFraction: missing / litPixels, referenceMean: referenceSum / litPixels, renderMean: renderSum / litPixels, litMae: absoluteError / litPixels, adjacentDarkMean: darkSum / darkPixels };
        console.log('Manzinus upper-ridge regression', JSON.stringify(metrics));
        expect(litPixels).toBeGreaterThan(400);
        expect(metrics.missingFraction).toBeLessThan(0.40);
        expect(metrics.renderMean).toBeGreaterThan(metrics.referenceMean * 0.6);
        expect(metrics.litMae).toBeLessThan(metrics.referenceMean * 0.65);
        expect(darkPixels).toBeGreaterThan(5000);
        expect(metrics.adjacentDarkMean).toBeLessThan(3.0);
        expect(errors).toEqual([]);
        await page.close();
    }, 210000);

    it("navigates the curated terminator carousel with original images", async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        await page.goto(
            `${BASE_URL}/moon-observer-test.html?observer=artemis2&reference=art002e009289&tier=low&compare=split`,
            { waitUntil: "domcontentloaded" },
        );
        await page.waitForFunction(() => (
            document.querySelectorAll("#observer-reference-track [data-reference-id]").length === 8
            && document.getElementById("observer-reference-image")?.naturalWidth > 0
            && document.getElementById("observer-resources")?.textContent?.includes("128x64")
        ));

        expect(await page.locator("#observer-reference-counter").textContent()).toBe("8 / 8");
        const selectedThumbnail = page.locator('#observer-reference-track [data-reference-id="art002e009289"]');
        expect(await selectedThumbnail.getAttribute("aria-selected"))
            .toBe("true");
        expect(await selectedThumbnail.getAttribute("aria-label"))
            .toContain("art002e009289: A Setting Earth. 2026-04-06 18:41:58 -04:00. Registered camera.");
        const trackBox = await page.locator("#observer-reference-track").boundingBox();
        const selectedBox = await selectedThumbnail.boundingBox();
        expect(selectedBox.x).toBeGreaterThanOrEqual(trackBox.x);
        expect(selectedBox.x + selectedBox.width).toBeLessThanOrEqual(trackBox.x + trackBox.width + 1);
        expect(await page.locator('#observer-reference-track [data-reference-id="art002e009289"] img').getAttribute("src"))
            .toContain("assets/artemis2/media/thumbnails/images/55193178333_e4a5a133ed_o-1.webp");
        expect(await page.locator("#observer-reference-image").getAttribute("src"))
            .toContain("/web/55193178333_e4a5a133ed_o%20(1).jpg");

        await page.locator("#observer-reference-previous").click();
        await page.waitForFunction(() => (
            document.getElementById("observer-reference")?.value === "art002e009287"
            && document.getElementById("observer-reference-image")?.currentSrc?.includes("55192132107")
        ));
        expect(await page.locator("#observer-reference-counter").textContent()).toBe("7 / 8");
        expect(await page.locator("#observer-time").inputValue()).toBe("2026-04-06T22:41:22");

        await page.locator('[data-reference-id="art002e009281"]').click();
        await page.waitForFunction(() => (
            document.getElementById("observer-reference-image")?.currentSrc?.includes("55193137293")
        ));
        expect(await page.locator("#observer-time").inputValue()).toBe("2026-04-06T21:46:35");
        expect(await page.locator("#observer-reference-counter").textContent()).toBe("5 / 8");
        expect(await page.locator("#observer-compare-overlay").isDisabled()).toBe(false);
        expect(await page.locator("#observer-visuals").getAttribute("data-mode")).toBe("split");

        const track = page.locator("#observer-reference-track");
        await track.focus();
        await track.press("Home");
        expect(await track.getAttribute("aria-activedescendant"))
            .toBe("observer-reference-option-art002e009277");
        expect(await page.evaluate(() => document.activeElement?.id)).toBe("observer-reference-track");
        await track.press("ArrowRight");
        expect(await track.getAttribute("aria-activedescendant"))
            .toBe("observer-reference-option-art002e009278");
        expect(await page.locator("#observer-reference-counter").textContent()).toBe("2 / 8");
        expect(await page.evaluate(() => document.activeElement?.id)).toBe("observer-reference-track");
        await page.close();
    }, 60000);

    it("normalizes a non-spacecraft Overlay URL back to Split", async () => {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        await page.goto(
            `${BASE_URL}/moon-observer-test.html?observer=geocenter&reference=art002e009289&tier=low&compare=overlay`,
            { waitUntil: "domcontentloaded" },
        );
        await page.waitForFunction(() => (
            document.querySelectorAll("#observer-reference option").length === 9
            && document.getElementById("observer-resources")?.textContent?.includes("128x64")
        ));
        expect(await page.locator("#observer-mode-geocenter").getAttribute("aria-pressed")).toBe("true");
        expect(await page.locator("#observer-visuals").getAttribute("data-mode")).toBe("split");
        expect(await page.locator("#observer-compare-overlay").isDisabled()).toBe(true);
        expect(new URL(page.url()).searchParams.get("compare")).toBe("split");
        await page.close();
    }, 60000);

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
