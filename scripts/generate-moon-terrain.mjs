#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import png from "pngjs";
import { buildPhysicalMoonNormalData, decodeMoonUint16RgbaToFloatHeightData } from "../src/platform/js/rendering/moon-physical-normal-data.js";
import { downsampleMoonHeightData, encodeMoonTerrainPackage, MOON_HEIGHT_SCALE } from "../src/platform/js/rendering/moon-terrain-package.js";

import { reducePhysicalMoonNormalData } from "./lib/moon-normal-reduction.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = "images/moon/ldem_16_uint_quality.png";
const bytes = await fs.readFile(path.join(root, sourcePath));
const parsed = png.PNG.sync.read(bytes, { skipRescale: true });
if (parsed.depth !== 16) throw new Error("Expected the precise NASA uint16 DEM.");
const source = decodeMoonUint16RgbaToFloatHeightData(parsed.data, parsed.width, parsed.height);
const sha256 = data => createHash("sha256").update(data).digest("hex");
const outputs = [];
const sourceNormals = buildPhysicalMoonNormalData({ heightData: source, width: parsed.width, height: parsed.height, physicalHeightScale: MOON_HEIGHT_SCALE, slopeBoost: 1 });
for (const [tier, width] of [["low", 1024], ["medium", 2048]]) {
    const height = width / 2;
    const heightData = downsampleMoonHeightData(source, parsed.width, parsed.height, width, height);
    const normalData = reducePhysicalMoonNormalData(sourceNormals, parsed.width, parsed.height, width, height);
    const packed = encodeMoonTerrainPackage({ width, height, heightData, normalData });
    const compressed = gzipSync(new Uint8Array(packed), { level: 9, mtime: 0 });
    const file = `images/moon/terrain-${tier}-v2.moon.gz`;
    await fs.writeFile(path.join(root, file), compressed);
    outputs.push({ tier, file, width, height, bytes: compressed.length, sha256: sha256(compressed) });
    console.log(JSON.stringify(outputs.at(-1)));
}
await fs.writeFile(path.join(root, "images/moon/terrain-v2-provenance.json"), JSON.stringify({
    source: sourcePath, sourceSha256: sha256(bytes), sourceWidth: parsed.width, sourceHeight: parsed.height,
    heightUnits: "NASA uint16: half metres with +10000 metre offset; radius 1737400 metres",
    reduction: "area average, rounded to original half-metre units; no normalization",
    normals: "buildPhysicalMoonNormalData at source resolution, slopeBoost=1; then area-average tangent slopes with reducePhysicalMoonNormalData before RGB8 packing",
    normalSourceWidth: parsed.width, normalSourceHeight: parsed.height,
    normalReduction: "average nx/nz and ny/nz over each output footprint, then renormalize; no height modification",
    normalReductionSha256: sha256(await fs.readFile(path.join(root, "scripts/lib/moon-normal-reduction.mjs"))),
    format: "MOONDEM1 little-endian header + uint16 heights + RGB8 physical normals; gzip level 9",
    outputs,
}, null, 2) + "\n");
