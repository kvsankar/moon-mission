import { describe, expect, it } from "vitest";
import { DataUtils } from "three";

import { buildPhysicalMoonNormalData } from "../src/platform/js/rendering/moon-physical-normal-data.js";

function buildGradientFixture(rightHeight) {
    const width = 5;
    const height = 3;
    const heightData = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
        heightData[y * width + 3] = rightHeight;
    }
    return { heightData, width, height };
}

function redSlope(normalData, width = 5, x = 2, y = 1) {
    const red = DataUtils.fromHalfFloat(normalData[(y * width + x) * 4]);
    return Math.abs(red * 2 - 1);
}

describe("physical Moon normal data", () => {
    it("boosts coherent steep slopes while leaving gentle terrain unchanged", () => {
        const steep = buildGradientFixture(1);
        const steepBase = buildPhysicalMoonNormalData({
            ...steep,
            physicalHeightScale: 1,
        });
        const steepBoosted = buildPhysicalMoonNormalData({
            ...steep,
            physicalHeightScale: 1,
            slopeBoost: 1.5,
            slopeBoostStart: 0.16,
            slopeBoostEnd: 0.34,
        });
        expect(redSlope(steepBoosted)).toBeGreaterThan(redSlope(steepBase));

        const gentle = buildGradientFixture(0.1);
        const gentleBase = buildPhysicalMoonNormalData({
            ...gentle,
            physicalHeightScale: 1,
        });
        const gentleBoosted = buildPhysicalMoonNormalData({
            ...gentle,
            physicalHeightScale: 1,
            slopeBoost: 1.5,
            slopeBoostStart: 0.16,
            slopeBoostEnd: 0.34,
        });
        expect(redSlope(gentleBoosted)).toBeCloseTo(redSlope(gentleBase), 5);
    });
});
