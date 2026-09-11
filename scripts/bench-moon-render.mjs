#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:7275";
const output = process.argv[3] || ".tmp/moon-render-bench.json";
const hardware = process.argv.includes("--hardware");
const browser = await chromium.launch(hardware
    ? { headless: false, channel: "chrome", args: ["--headless=new", "--enable-gpu", "--enable-webgl", "--ignore-gpu-blocklist"] }
    : { headless: true });
const results = [];
try {
    for (const tier of ["low", "medium", "high"]) {
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/@vite/client", route => route.fulfill({ contentType: "application/javascript", body: "" }));
        await page.route("**/src/platform/js/moon-observer-test.js*", async route => {
            const response = await route.fetch();
            let body = await response.text();
            body = body.replace(/\ninitialize\(\);/, `
window.__moonDrawBenchmark = {
    ready: () => !!moonRenderer?.mesh?.material?.normalMap && moonRenderer.mesh.material.displacementMap?.image?.width > 1,
    measure: async () => {
        const gl = renderer.getContext();
        const gpuInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const target = new THREE.WebGLRenderTarget(1024, 1024);
        target.texture.colorSpace = THREE.SRGBColorSpace;
        const camera = updateCameraProjection().clone();
        camera.clearViewOffset();
        if (camera.isOrthographicCamera) { camera.left=-1.25; camera.right=1.25; camera.top=1.25; camera.bottom=-1.25; }
        else camera.aspect=1;
        camera.updateProjectionMatrix();
        renderer.setRenderTarget(target);
        const durations = [];
        const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        const queries = [];
        const onePixel = new Uint8Array(4);
        for (let i=0; i<70; i++) {
            const query = timer && i>=10 ? gl.createQuery() : null;
            if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
            const start = performance.now();
            renderer.render(scene, camera);
            if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); queries.push(query); }
            else if (!timer) renderer.readRenderTargetPixels(target,512,512,1,1,onePixel);
            if (i>=10 && !timer) durations.push(performance.now()-start);
        }
        gl.flush();
        if (timer) {
            const deadline = performance.now()+10000;
            while (!gl.getQueryParameter(queries.at(-1),gl.QUERY_RESULT_AVAILABLE)) {
                if (performance.now()>deadline) throw new Error('GPU timer unavailable');
                await new Promise(resolve=>setTimeout(resolve,10));
            }
            if (gl.getParameter(timer.GPU_DISJOINT_EXT)) throw new Error('GPU timer disjoint; rerun');
            for (const query of queries) { durations.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6); gl.deleteQuery(query); }
        }
        const pixels = new Uint8Array(1024*1024*4);
        renderer.readRenderTargetPixels(target,0,0,1024,1024,pixels);
        let litPixels=0;
        for(let i=0;i<pixels.length;i+=4) if(pixels[i]>10) litPixels++;
        const sorted=durations.slice().sort((a,b)=>a-b);
        const result={ model:moonRenderer.renderPipeline.lightingModel, profile:state.profile,
            dimensions:[1024,1024], timing:timer?"GPU elapsed query":"CPU + synchronous pixel readback", draws:60, medianMs:sorted[30], p95Ms:sorted[57],
            litPixels, triangles:renderer.info.render.triangles,
            normalEncoding:moonRenderer.mesh.material.normalMap.userData.moonNormalEncoding,
            gpu:gpuInfo?gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL):null,
            resourceSummary:document.getElementById('observer-resources').textContent };
        renderer.setRenderTarget(null); target.dispose();
        return result;
    }
};
initialize();`);
            await route.fulfill({ response, body });
        });
        await page.goto(`${baseUrl}/moon-observer-test.html?observer=geocenter&compare=render&time=2026-04-06T22:00:00Z&tier=${tier}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__moonDrawBenchmark?.ready(), null, { timeout: 120000 });
        const result = await page.evaluate(() => window.__moonDrawBenchmark.measure());
        if (errors.length || result.model !== "physical-dem" || result.litPixels < 10000) throw new Error(JSON.stringify({ result, errors }));
        results.push({ tier, ...result });
        console.log(JSON.stringify(results.at(-1)));
        await page.close();
    }
    await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await fs.writeFile(output, JSON.stringify({
        method: "Moon-only 1024x1024 offscreen rendering; 10 warm-up draws, 60 measured draws with GPU elapsed queries (or labeled synchronous readback fallback); excludes other mission views/UI and startup. Inspect GPU before interpreting performance.",
        baseUrl, hardwareRequested: hardware, results,
    }, null, 2) + "\n");
} finally { await browser.close(); }
