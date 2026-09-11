import fs from "node:fs/promises";
import { PNG } from "pngjs";
import { SUN_CORONA_PRESETS, buildSolarCoronaPixels } from "../src/platform/js/rendering/sun-renderer.js";
for (const [name, preset] of Object.entries(SUN_CORONA_PRESETS)) {
    const raster = buildSolarCoronaPixels(preset);
    const png = PNG.sync.write({ ...raster, data: Buffer.from(raster.data) });
    const url = new URL(`../src/platform/assets/sun-corona-${name}.png`, import.meta.url);
    await fs.writeFile(url, png);
    console.log(name, png.length);
}
