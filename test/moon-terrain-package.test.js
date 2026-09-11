import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { DataUtils } from "three";
import { decodeMoonTerrainPackage, encodeMoonTerrainPackage, downsampleMoonHeightData, MOON_HEIGHT_SCALE, MOON_HEIGHT_BIAS } from "../src/platform/js/rendering/moon-terrain-package.js";
import { buildPhysicalMoonNormalData } from "../src/platform/js/rendering/moon-physical-normal-data.js";

describe("shared physical terrain transport", () => {
    it("keeps the height datum and half-metre units through reduction", () => {
        const input = new Float32Array(16).fill(20000 / 65535);
        const output = downsampleMoonHeightData(input,4,4,2,2);
        for(const height of output) expect(height * MOON_HEIGHT_SCALE + MOON_HEIGHT_BIAS).toBeCloseTo(0,9);
        const ramp = Float32Array.from({length:16},(_,i)=>i / 65535);
        expect(Array.from(downsampleMoonHeightData(ramp,4,4,2,2),v=>Math.round(v*65535))).toEqual([3,5,11,13]);
    });
    it.each([["low",1024],["medium",2048]])("ships %s heights and normals from the same algorithm", (tier,width) => {
        const file = readFileSync(new URL(`../images/moon/terrain-${tier}-v1.moon.gz`,import.meta.url));
        const bytes = gunzipSync(file);
        const buffer = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
        const data = decodeMoonTerrainPackage(buffer);
        expect([data.width,data.height]).toEqual([width,width/2]);
        expect(data.normalData).toBeInstanceOf(Uint8Array);
        const expected = buildPhysicalMoonNormalData({ heightData:data.heightData,width:data.width,height:data.height,physicalHeightScale:MOON_HEIGHT_SCALE });
        let maximumAngle = 0;
        for(let i=0;i<data.width*data.height;i+=97) {
            const a=[0,1,2].map(c=>DataUtils.fromHalfFloat(expected[i*4+c])*2-1);
            const b=[0,1,2].map(c=>data.normalData[i*4+c]/255*2-1);
            const dot=a.reduce((sum,v,c)=>sum+v*b[c],0)/(Math.hypot(...a)*Math.hypot(...b));
            maximumAngle=Math.max(maximumAngle,Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI);
        }
        expect(maximumAngle).toBeLessThan(1);
    });
    it("rejects truncated data and incompatible height units", () => {
        const heights=new Float32Array(4).fill(0.4);
        const normals=buildPhysicalMoonNormalData({heightData:heights,width:2,height:2,physicalHeightScale:MOON_HEIGHT_SCALE});
        const buffer=encodeMoonTerrainPackage({width:2,height:2,heightData:heights,normalData:normals});
        expect(()=>decodeMoonTerrainPackage(buffer.slice(0,-1))).toThrow("payload");
        new DataView(buffer).setFloat64(16,1,true);
        expect(()=>decodeMoonTerrainPackage(buffer)).toThrow("units");
    });
});
