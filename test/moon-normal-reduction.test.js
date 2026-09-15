import { describe, expect, it } from "vitest";
import { DataUtils } from "three";
import { reducePhysicalMoonNormalData } from "../scripts/lib/moon-normal-reduction.mjs";

function grid(width, height, slope) {
    const data = new Uint16Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const [sx, sy] = slope(x, y);
        const length = Math.hypot(sx, sy, 1);
        [sx / length, sy / length, 1 / length].forEach((n, c) => { data[(y * width + x) * 4 + c] = DataUtils.toHalfFloat(n * 0.5 + 0.5); });
        data[(y * width + x) * 4 + 3] = DataUtils.toHalfFloat(1);
    }
    return data;
}
function slopes(data, i) {
    const n = [0, 1, 2].map(c => DataUtils.fromHalfFloat(data[i * 4 + c]) * 2 - 1);
    return [n[0] / n[2], n[1] / n[2]];
}
describe("compact physical normal reduction", () => {
    it("preserves flat terrain and constant slopes through noninteger reduction", () => {
        for (const slope of [[0, 0], [-0.35, 0.2]]) {
            const reduced = reducePhysicalMoonNormalData(grid(10, 6, () => slope), 10, 6, 4, 2);
            for (let i = 0; i < 8; i++) {
                expect(slopes(reduced, i)[0]).toBeCloseTo(slope[0], 2);
                expect(slopes(reduced, i)[1]).toBeCloseTo(slope[1], 2);
            }
        }
    });
    it("averages physical slopes rather than flattening steep normals by vector averaging", () => {
        const reduced = reducePhysicalMoonNormalData(grid(4, 4, x => [x % 2 ? 3 : 0, 0]), 4, 4, 2, 2);
        for (let i = 0; i < 4; i++) expect(slopes(reduced, i)[0]).toBeCloseTo(1.5, 2);
    });
    it("rejects invalid grids, upsampling and nonphysical normals", () => {
        expect(() => reducePhysicalMoonNormalData(new Uint16Array(4), 4, 4, 2, 2)).toThrow("grid");
        expect(() => reducePhysicalMoonNormalData(grid(2, 2, () => [0, 0]), 2, 2, 4, 4)).toThrow("dimensions");
        expect(() => reducePhysicalMoonNormalData(new Uint16Array(64), 4, 4, 2, 2)).toThrow("Invalid physical normal");
    });
});
