import { DataUtils } from "three";

/**
 * @param {Uint16Array} source
 * @param {number} width
 * @param {number} height
 */
export function decodeMoonUint16RgbaToFloatHeightData(source, width, height) {
    const pixelCount = Number(width) * Number(height);
    if (
        !(source instanceof Uint16Array) ||
        !Number.isInteger(pixelCount) ||
        width < 2 ||
        height < 2 ||
        source.length < pixelCount * 4
    ) {
        throw new Error("Moon DEM decoding requires a uint16 RGBA pixel grid.");
    }

    const heightData = new Float32Array(pixelCount);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        heightData[pixel] = source[pixel * 4] / 65535;
    }
    return heightData;
}

/**
 * @param {{
 *   heightData: Float32Array,
 *   width: number,
 *   height: number,
 *   physicalHeightScale: number,
 *   flipY?: boolean,
 *   slopeBoost?: number,
 *   slopeBoostStart?: number,
 *   slopeBoostEnd?: number,
 * }} options
 */
export function buildPhysicalMoonNormalData({
    heightData,
    width,
    height,
    physicalHeightScale,
    flipY = true,
    slopeBoost = 1,
    slopeBoostStart = 0.16,
    slopeBoostEnd = 0.34,
}) {
    if (!(heightData instanceof Float32Array) || width < 2 || height < 2) {
        throw new Error("Physical Moon normals require a Float32 height grid.");
    }
    const longitudeRadiansPerPixel = (Math.PI * 2) / width;
    const latitudeRadiansPerPixel = Math.PI / height;
    const latitudeGradientScale = physicalHeightScale / (2 * latitudeRadiansPerPixel);
    const longitudeGradientScaleByRow = new Float32Array(height);
    for (let y = 0; y < height; y += 1) {
        const latitude = (Math.PI * 0.5) - ((y + 0.5) * latitudeRadiansPerPixel);
        const longitudeMetric = Math.max(0.02, Math.abs(Math.cos(latitude)));
        longitudeGradientScaleByRow[y] = physicalHeightScale
            / (2 * longitudeRadiansPerPixel * longitudeMetric);
    }

    const normalData = new Uint16Array(width * height * 4);
    const halfOne = DataUtils.toHalfFloat(1);
    const gradientYSign = flipY ? 1 : -1;
    const numericSlopeBoost = Number(slopeBoost);
    const numericSlopeBoostStart = Number(slopeBoostStart);
    const numericSlopeBoostEnd = Number(slopeBoostEnd);
    const resolvedSlopeBoost = Math.max(
        1,
        Number.isFinite(numericSlopeBoost) ? numericSlopeBoost : 1,
    );
    const resolvedSlopeBoostStart = Math.max(
        0,
        Number.isFinite(numericSlopeBoostStart) ? numericSlopeBoostStart : 0.16,
    );
    const resolvedSlopeBoostEnd = Math.max(
        resolvedSlopeBoostStart + 1e-6,
        Number.isFinite(numericSlopeBoostEnd) ? numericSlopeBoostEnd : 0.34,
    );
    for (let y = 0; y < height; y += 1) {
        const rowOffset = y * width;
        const rowAbove = Math.max(0, y - 1) * width;
        const rowBelow = Math.min(height - 1, y + 1) * width;
        const longitudeScale = longitudeGradientScaleByRow[y];
        for (let x = 0; x < width; x += 1) {
            const left = rowOffset + ((x + width - 1) % width);
            const right = rowOffset + ((x + 1) % width);
            const gradientX = (heightData[right] - heightData[left]) * longitudeScale;
            const gradientY = (heightData[rowBelow + x] - heightData[rowAbove + x])
                * latitudeGradientScale;
            const slopeMagnitude = Math.hypot(gradientX, gradientY);
            const slopeWeightLinear = Math.min(1, Math.max(
                0,
                (slopeMagnitude - resolvedSlopeBoostStart)
                    / (resolvedSlopeBoostEnd - resolvedSlopeBoostStart),
            ));
            const slopeWeight = slopeWeightLinear * slopeWeightLinear
                * (3 - 2 * slopeWeightLinear);
            const slopeMultiplier = 1 + (resolvedSlopeBoost - 1) * slopeWeight;
            let nx = -gradientX * slopeMultiplier;
            let ny = gradientYSign * gradientY * slopeMultiplier;
            let nz = 1;
            const inverseLength = 1 / Math.max(1e-8, Math.hypot(nx, ny, nz));
            nx *= inverseLength;
            ny *= inverseLength;
            nz *= inverseLength;
            const output = (rowOffset + x) * 4;
            normalData[output] = DataUtils.toHalfFloat(nx * 0.5 + 0.5);
            normalData[output + 1] = DataUtils.toHalfFloat(ny * 0.5 + 0.5);
            normalData[output + 2] = DataUtils.toHalfFloat(nz * 0.5 + 0.5);
            normalData[output + 3] = halfOne;
        }
    }
    return normalData;
}
