import { DataUtils } from "three";

// Asset preparation only. Differentiate the full-resolution physical terrain
// first, then area-filter its slopes. Differentiating a reduced height map with
// a two-texel stencil unnecessarily blurs the crater edges a second time.
export function reducePhysicalMoonNormalData(normalData, sourceWidth, sourceHeight, width, height) {
    if (!(normalData instanceof Uint16Array)
        || ![sourceWidth, sourceHeight, width, height].every(n => Number.isInteger(n) && n >= 2)
        || width > sourceWidth || height > sourceHeight
        || normalData.length !== sourceWidth * sourceHeight * 4) {
        throw new Error("Normal reduction requires a half-float source grid and smaller integer dimensions.");
    }
    const slopeX = new Float32Array(sourceWidth * sourceHeight);
    const slopeY = new Float32Array(slopeX.length);
    for (let i = 0; i < slopeX.length; i++) {
        const nx = DataUtils.fromHalfFloat(normalData[i * 4]) * 2 - 1;
        const ny = DataUtils.fromHalfFloat(normalData[i * 4 + 1]) * 2 - 1;
        const nz = DataUtils.fromHalfFloat(normalData[i * 4 + 2]) * 2 - 1;
        if (![nx, ny, nz].every(Number.isFinite) || nz <= 0) throw new Error("Invalid physical normal.");
        slopeX[i] = nx / nz;
        slopeY[i] = ny / nz;
    }
    const dx = sourceWidth / width;
    const dy = sourceHeight / height;
    const result = new Uint16Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const top = y * dy, bottom = (y + 1) * dy;
        const left = x * dx, right = (x + 1) * dx;
        let gx = 0, gy = 0;
        for (let iy = Math.floor(top); iy < Math.ceil(bottom); iy++) {
            const wy = Math.min(bottom, iy + 1) - Math.max(top, iy);
            for (let ix = Math.floor(left); ix < Math.ceil(right); ix++) {
                const weight = wy * (Math.min(right, ix + 1) - Math.max(left, ix));
                gx += slopeX[iy * sourceWidth + ix] * weight;
                gy += slopeY[iy * sourceWidth + ix] * weight;
            }
        }
        gx /= dx * dy; gy /= dx * dy;
        const length = Math.hypot(gx, gy, 1);
        const offset = (y * width + x) * 4;
        result[offset] = DataUtils.toHalfFloat(gx / length * 0.5 + 0.5);
        result[offset + 1] = DataUtils.toHalfFloat(gy / length * 0.5 + 0.5);
        result[offset + 2] = DataUtils.toHalfFloat(1 / length * 0.5 + 0.5);
        result[offset + 3] = DataUtils.toHalfFloat(1);
    }
    return result;
}
