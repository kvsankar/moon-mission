import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { DataUtils } from "three";
import { PNG } from "pngjs";
import { reducePhysicalMoonNormalData } from "../scripts/lib/moon-normal-reduction.mjs";
import { decodeMoonTerrainPackage, encodeMoonTerrainPackage, downsampleMoonHeightData, MOON_HEIGHT_SCALE, MOON_HEIGHT_BIAS } from "../src/platform/js/rendering/moon-terrain-package.js";
import { buildPhysicalMoonNormalData, decodeMoonUint16RgbaToFloatHeightData } from "../src/platform/js/rendering/moon-physical-normal-data.js";

let sourceNormals;
afterAll(() => { sourceNormals = null; });
function getSourceNormals() {
    if (!sourceNormals) {
        const parsed = PNG.sync.read(readFileSync(new URL("../images/moon/ldem_16_uint_quality.png", import.meta.url)), { skipRescale: true });
        const heights = decodeMoonUint16RgbaToFloatHeightData(parsed.data, parsed.width, parsed.height);
        sourceNormals = { width: parsed.width, height: parsed.height,
            data: buildPhysicalMoonNormalData({ heightData: heights, width: parsed.width, height: parsed.height, physicalHeightScale: MOON_HEIGHT_SCALE }) };
    }
    return sourceNormals;
}

describe("shared physical terrain transport", () => {
    it("keeps the height datum and half-metre units through reduction", () => {
        const input = new Float32Array(16).fill(20000 / 65535);
        const output = downsampleMoonHeightData(input,4,4,2,2);
        for(const height of output) expect(height * MOON_HEIGHT_SCALE + MOON_HEIGHT_BIAS).toBeCloseTo(0,9);
        const ramp = Float32Array.from({length:16},(_,i)=>i / 65535);
        expect(Array.from(downsampleMoonHeightData(ramp,4,4,2,2),v=>Math.round(v*65535))).toEqual([3,5,11,13]);
    });
    it.each([["low",1024],["medium",2048]])("ships %s source-filtered normals without changing its height samples", (tier,width) => {
        const file = readFileSync(new URL(`../images/moon/terrain-${tier}-v2.moon.gz`,import.meta.url));
        const bytes = gunzipSync(file);
        const buffer = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
        const data = decodeMoonTerrainPackage(buffer);
        expect([data.width,data.height]).toEqual([width,width/2]);
        expect(data.normalData).toBeInstanceOf(Uint8Array);
        const original = gunzipSync(readFileSync(new URL(`../images/moon/terrain-${tier}-v1.moon.gz`, import.meta.url)));
        expect(bytes.subarray(48, 48 + width * width).equals(original.subarray(48, 48 + width * width))).toBe(true);
        const source = getSourceNormals();
        const expected = reducePhysicalMoonNormalData(source.data, source.width, source.height, data.width, data.height);
        let maximumAngle = 0;
        for(let i=0;i<data.width*data.height;i+=97) {
            const a=[0,1,2].map(c=>DataUtils.fromHalfFloat(expected[i*4+c])*2-1);
            const b=[0,1,2].map(c=>data.normalData[i*4+c]/255*2-1);
            const dot=a.reduce((sum,v,c)=>sum+v*b[c],0)/(Math.hypot(...a)*Math.hypot(...b));
            maximumAngle=Math.max(maximumAngle,Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI);
        }
        expect(maximumAngle).toBeLessThan(1);
    }, 30000);
    it("rejects truncated data and incompatible height units", () => {
        const heights=new Float32Array(4).fill(0.4);
        const normals=buildPhysicalMoonNormalData({heightData:heights,width:2,height:2,physicalHeightScale:MOON_HEIGHT_SCALE});
        const buffer=encodeMoonTerrainPackage({width:2,height:2,heightData:heights,normalData:normals});
        expect(()=>decodeMoonTerrainPackage(buffer.slice(0,-1))).toThrow("payload");
        new DataView(buffer).setFloat64(16,1,true);
        expect(()=>decodeMoonTerrainPackage(buffer)).toThrow("units");
    });
});
