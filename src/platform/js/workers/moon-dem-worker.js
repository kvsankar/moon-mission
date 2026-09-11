import { decodeMoonTerrainPackage } from "../rendering/moon-terrain-package.js";
import {
    buildPhysicalMoonNormalData,
    decodeMoonUint16RgbaToFloatHeightData,
} from "../rendering/moon-physical-normal-data.js";

const workerScope = /** @type {any} */ (self);

class PngByteBuffer extends Uint8Array {
    readUInt16BE(offset) {
        return new DataView(this.buffer, this.byteOffset, this.byteLength)
            .getUint16(offset, false);
    }

    readUInt32BE(offset) {
        return new DataView(this.buffer, this.byteOffset, this.byteLength)
            .getUint32(offset, false);
    }

    readInt32BE(offset) {
        return new DataView(this.buffer, this.byteOffset, this.byteLength)
            .getInt32(offset, false);
    }
}

function now() {
    return workerScope.performance?.now?.() ?? Date.now();
}

workerScope.onmessage = async (event) => {
    try {
        const decodeStartedAt = now();
        let bytes = event.data.pngBytes;
        const prefix = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
        if (prefix[0] === 0x1f && prefix[1] === 0x8b) {
            if (typeof DecompressionStream === "function") {
                bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
            } else {
                const { gunzipSync } = await import("three/addons/libs/fflate.module.js");
                const decoded = gunzipSync(new Uint8Array(bytes));
                bytes = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength);
            }
        }
        let heightData, width, height, normalData;
        if (new Uint8Array(bytes)[0] === 77) {
            const packed = decodeMoonTerrainPackage(bytes);
            ({ heightData, width, height, normalData } = packed);
            const sameNormals = [
                [packed.heightScale, event.data.physicalNormalHeightScale],
                [packed.slopeBoost, event.data.physicalNormalSlopeBoost],
                [packed.slopeBoostStart, event.data.physicalNormalSlopeBoostStart],
                [packed.slopeBoostEnd, event.data.physicalNormalSlopeBoostEnd],
            ].every(([a, b]) => Math.abs(a - Number(b)) < 1e-6);
            if (!sameNormals) normalData = null;
        } else {
            const module = await import("pngjs/browser.js");
            const png = module.default;
            const PNG = png.PNG || png.default?.PNG || png;
            const parsed = PNG.sync.read(new PngByteBuffer(bytes), { skipRescale: true });
            if (Number(parsed.depth) !== 16 || !(parsed.data instanceof Uint16Array)) {
                throw new Error("Expected native uint16 Moon DEM samples.");
            }
            width = parsed.width;
            height = parsed.height;
            heightData = decodeMoonUint16RgbaToFloatHeightData(parsed.data, width, height);
        }
        const decodeMilliseconds = now() - decodeStartedAt;
        const normalStartedAt = now();
        const preparedNormals = !!normalData;
        normalData ||= buildPhysicalMoonNormalData({
            heightData, width, height,
            physicalHeightScale: Number(event.data.physicalNormalHeightScale),
            flipY: true,
            slopeBoost: Number(event.data.physicalNormalSlopeBoost),
            slopeBoostStart: Number(event.data.physicalNormalSlopeBoostStart),
            slopeBoostEnd: Number(event.data.physicalNormalSlopeBoostEnd),
        });
        workerScope.postMessage({
            width, height, heightBuffer: heightData.buffer, normalBuffer: normalData.buffer,
            decodeMilliseconds, normalType: normalData instanceof Uint8Array ? "uint8" : "half-float", normalBuildMilliseconds: preparedNormals ? 0 : now() - normalStartedAt,
        }, [heightData.buffer, normalData.buffer]);
    } catch (error) {
        workerScope.postMessage({ error: error?.message || String(error) });
    }
};
