import { DataUtils } from "three";

// NASA-unit uint16 heights and prepared RGB8 normals for the fast profiles.
export const MOON_HEIGHT_SCALE = 0.018860078277886497;
export const MOON_HEIGHT_BIAS = -0.005755726948313572;
export const MOON_TERRAIN_HEADER_BYTES = 48;
const MAGIC = "MOONDEM1";

export function decodeMoonTerrainPackage(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < MOON_TERRAIN_HEADER_BYTES) {
        throw new Error("Truncated Moon terrain package.");
    }
    const view = new DataView(buffer);
    const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 8));
    if (magic !== MAGIC) throw new Error("Unsupported Moon terrain package.");
    const width = view.getUint32(8, true);
    const height = view.getUint32(12, true);
    const pixels = width * height;
    if (width < 2 || height < 2 || width > 16384 || height > 8192 || pixels > 33554432
        || buffer.byteLength !== MOON_TERRAIN_HEADER_BYTES + pixels * 5) {
        throw new Error("Invalid Moon terrain dimensions or payload.");
    }
    const heightScale = view.getFloat64(16, true);
    const heightBias = view.getFloat64(24, true);
    if (heightScale !== MOON_HEIGHT_SCALE || heightBias !== MOON_HEIGHT_BIAS) {
        throw new Error("Moon terrain height units do not match the renderer.");
    }
    const heightData = new Float32Array(pixels);
    for (let i = 0; i < pixels; i += 1) heightData[i] = view.getUint16(48 + i * 2, true) / 65535;
    const normalData = new Uint8Array(pixels * 4);
    const normalOffset = 48 + pixels * 2;
    for (let i = 0; i < pixels; i += 1) {
        normalData.set(new Uint8Array(buffer, normalOffset + i * 3, 3), i * 4);
        normalData[i * 4 + 3] = 255;
    }
    return {
        width, height, heightData, normalData, heightScale, heightBias,
        slopeBoost: view.getFloat32(32, true),
        slopeBoostStart: view.getFloat32(36, true),
        slopeBoostEnd: view.getFloat32(40, true),
    };
}

export function encodeMoonTerrainPackage({ width, height, heightData, normalData, slopeBoost = 1, slopeBoostStart = 0.16, slopeBoostEnd = 0.34 }) {
    const pixels = width * height;
    if (heightData.length !== pixels || normalData.length !== pixels * 4) throw new Error("Mismatched Moon terrain arrays.");
    const buffer = new ArrayBuffer(48 + pixels * 5);
    const view = new DataView(buffer);
    for (let i = 0; i < MAGIC.length; i += 1) view.setUint8(i, MAGIC.charCodeAt(i));
    view.setUint32(8, width, true);
    view.setUint32(12, height, true);
    view.setFloat64(16, MOON_HEIGHT_SCALE, true);
    view.setFloat64(24, MOON_HEIGHT_BIAS, true);
    view.setFloat32(32, slopeBoost, true);
    view.setFloat32(36, slopeBoostStart, true);
    view.setFloat32(40, slopeBoostEnd, true);
    for (let i = 0; i < pixels; i += 1) view.setUint16(48 + i * 2, Math.round(heightData[i] * 65535), true);
    for (let i = 0; i < pixels; i += 1) {
        for (let c = 0; c < 3; c += 1) view.setUint8(48 + pixels * 2 + i * 3 + c, Math.round(DataUtils.fromHalfFloat(normalData[i * 4 + c]) * 255));
    }
    return buffer;
}

// Area average in source sample units: no contrast normalization or height gain.
export function downsampleMoonHeightData(source, sourceWidth, sourceHeight, width, height) {
    const output = new Float32Array(width * height);
    const sx = sourceWidth / width;
    const sy = sourceHeight / height;
    for (let y = 0; y < height; y += 1) {
        const top = y * sy;
        const bottom = (y + 1) * sy;
        for (let x = 0; x < width; x += 1) {
            const left = x * sx;
            const right = (x + 1) * sx;
            let sum = 0;
            for (let iy = Math.floor(top); iy < Math.ceil(bottom); iy += 1) {
                const yw = Math.min(bottom, iy + 1) - Math.max(top, iy);
                for (let ix = Math.floor(left); ix < Math.ceil(right); ix += 1) {
                    const xw = Math.min(right, ix + 1) - Math.max(left, ix);
                    sum += Math.round(source[iy * sourceWidth + ix] * 65535) * xw * yw;
                }
            }
            // Normals must be generated from the exact quantized heights shipped.
            output[y * width + x] = Math.round(sum / (sx * sy)) / 65535;
        }
    }
    return output;
}
