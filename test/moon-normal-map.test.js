import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DataUtils } from "three";

import { buildMoonNormalMapFromHeightTexture } from "../src/platform/js/rendering/moon-normal-map.js";

let decodedHeightData;
function stubDocumentWithPixels(pixelData, sampleWidth = 4, sampleHeight = 4) {
    decodedHeightData = Float32Array.from(pixelData.filter((_, i) => i % 4 === 0), value => value / 255);
    const originalDocument = globalThis.document;
    const context2d = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: pixelData })),
    };
    vi.stubGlobal("document", {
        ...originalDocument,
        createElement: vi.fn(() => ({
            width: 0,
            height: 0,
            getContext: vi.fn(() => context2d),
        })),
    });
    return { sampleWidth, sampleHeight };
}

// Sample the encoded green channel at (x, y). The data texture stores
// half-floats; convert back to 0..1 for assertions.
function decodeGreen(normalTexture, width, x, y) {
    const data = normalTexture.image.data;
    const halfBits = data[(y * width + x) * 4 + 1];
    return DataUtils.fromHalfFloat(halfBits);
}

function decodeRed(normalTexture, width, x, y) {
    const data = normalTexture.image.data;
    const halfBits = data[(y * width + x) * 4];
    return DataUtils.fromHalfFloat(halfBits);
}

describe("moon-normal-map", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("inherits UV orientation and wrap modes from the source height texture", () => {
        stubDocumentWithPixels(new Uint8ClampedArray([
            0, 0, 0, 255,
            255, 255, 255, 255,
            255, 255, 255, 255,
            0, 0, 0, 255,
        ]));

        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 2, height: 2, data: decodedHeightData };
        displacementTexture.flipY = true;
        displacementTexture.wrapS = THREE.RepeatWrapping;
        displacementTexture.wrapT = THREE.MirroredRepeatWrapping;

        const normalTexture = buildMoonNormalMapFromHeightTexture(displacementTexture);

        expect(normalTexture).toBeTruthy();
        expect(normalTexture.flipY).toBe(true);
        expect(normalTexture.wrapS).toBe(THREE.RepeatWrapping);
        expect(normalTexture.wrapT).toBe(THREE.MirroredRepeatWrapping);
    });

    it("flips the green-channel sign when heightTexture.flipY is false", () => {
        // 4x4 height map with a horizontal "ramp" along Y: rows go from
        // dark (top) to bright (bottom). dh/dy_image > 0 everywhere.
        //
        // With flipY=true:  image-Y runs +south, opposite to +V/+bitangent.
        //                   ny = -dh/dv = +dh/dy_image > 0 → green > 0.5.
        // With flipY=false: image-Y runs +north, same as +V/+bitangent.
        //                   ny = -dh/dv = -dh/dy_image < 0 → green < 0.5.
        // Same height data; only flipY differs. Green-channel sign must flip.
        const pixels = [];
        for (let row = 0; row < 4; row += 1) {
            const v = Math.round((row / 3) * 255);
            for (let col = 0; col < 4; col += 1) {
                pixels.push(v, v, v, 255);
            }
        }
        const sourceData = new Uint8ClampedArray(pixels);

        const flipYTrue = new THREE.Texture();
        flipYTrue.image = { width: 4, height: 4, data: Float32Array.from(sourceData.filter((_,i)=>i%4===0),v=>v/255) };
        flipYTrue.flipY = true;
        stubDocumentWithPixels(sourceData);
        const normalFlipYTrue = buildMoonNormalMapFromHeightTexture(flipYTrue);
        const greenFlipYTrue = decodeGreen(normalFlipYTrue, 4, 1, 1);

        vi.unstubAllGlobals();

        const flipYFalse = new THREE.Texture();
        flipYFalse.image = { width: 4, height: 4, data: Float32Array.from(sourceData.filter((_,i)=>i%4===0),v=>v/255) };
        flipYFalse.flipY = false;
        stubDocumentWithPixels(sourceData);
        const normalFlipYFalse = buildMoonNormalMapFromHeightTexture(flipYFalse);
        const greenFlipYFalse = decodeGreen(normalFlipYFalse, 4, 1, 1);

        expect(normalFlipYTrue.flipY).toBe(true);
        expect(normalFlipYFalse.flipY).toBe(false);
        // Green encodes (ny * 0.5 + 0.5). flipY=true should give green > 0.5
        // (positive ny); flipY=false should give green < 0.5 (negative ny).
        expect(greenFlipYTrue).toBeGreaterThan(0.5);
        expect(greenFlipYFalse).toBeLessThan(0.5);
        // The two should be reflections about 0.5 (within FP16 precision).
        expect(greenFlipYTrue + greenFlipYFalse).toBeCloseTo(1.0, 2);
    });

    it("derives Physical normals from DEM radius units and spherical texel spacing", () => {
        const pixels = [];
        for (let row = 0; row < 4; row += 1) {
            for (let col = 0; col < 4; col += 1) {
                const value = Math.round((col / 3) * 255);
                pixels.push(value, value, value, 255);
            }
        }
        stubDocumentWithPixels(new Uint8ClampedArray(pixels));
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { width: 4, height: 4, data: decodedHeightData };
        displacementTexture.flipY = true;

        const weak = buildMoonNormalMapFromHeightTexture(displacementTexture, {
            physicalNormalHeightScale: 0.1,
        });
        const strong = buildMoonNormalMapFromHeightTexture(displacementTexture, {
            physicalNormalHeightScale: 0.2,
        });
        const weakRed = decodeRed(weak, 4, 1, 1);
        const strongRed = decodeRed(strong, 4, 1, 1);
        const longitudeRadiansPerPixel = (Math.PI * 2) / 4;
        const latitude = (Math.PI * 0.5) - (1.5 * Math.PI / 4);
        const expectedGradient = (2 / 3) * 0.1
            / (2 * longitudeRadiansPerPixel * Math.cos(latitude));
        const expectedRed = (-expectedGradient / Math.hypot(expectedGradient, 1)) * 0.5 + 0.5;

        expect(weakRed).toBeLessThan(0.5);
        expect(weakRed).toBeCloseTo(expectedRed, 3);
        expect(strongRed).toBeLessThan(weakRed);
    });

    it("wraps Physical normal derivatives across the longitude seam", () => {
        const row = [0.5, 0.75, 0.5, 0.25];
        const heightData = new Float32Array(16);
        for (let y = 0; y < 4; y += 1) {
            heightData.set(row, y * 4);
        }
        const displacementTexture = new THREE.Texture();
        displacementTexture.image = { data: heightData, width: 4, height: 4 };
        displacementTexture.flipY = true;

        const normalTexture = buildMoonNormalMapFromHeightTexture(displacementTexture, {
            physicalNormalHeightScale: 0.1,
        });
        const redAtSeam = decodeRed(normalTexture, 4, 0, 1);
        const longitudeRadiansPerPixel = (Math.PI * 2) / 4;
        const latitude = (Math.PI * 0.5) - (1.5 * Math.PI / 4);
        const expectedGradient = (0.75 - 0.25) * 0.1
            / (2 * longitudeRadiansPerPixel * Math.cos(latitude));
        const expectedRed = (-expectedGradient / Math.hypot(expectedGradient, 1)) * 0.5 + 0.5;

        expect(redAtSeam).toBeCloseTo(expectedRed, 3);
    });
});
