import pngModule from "pngjs/browser.js";
import {
    buildPhysicalMoonNormalData,
    decodeMoonUint16RgbaToFloatHeightData,
} from "../rendering/moon-physical-normal-data.js";

const PNG = pngModule.PNG || pngModule.default?.PNG || pngModule;
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

workerScope.onmessage = (event) => {
    try {
        const decodeStartedAt = now();
        const parsed = PNG.sync.read(new PngByteBuffer(event.data.pngBytes), {
            skipRescale: true,
        });
        if (Number(parsed.depth) !== 16 || !(parsed.data instanceof Uint16Array)) {
            throw new Error("Expected native uint16 Moon DEM samples.");
        }
        const heightData = decodeMoonUint16RgbaToFloatHeightData(
            parsed.data,
            parsed.width,
            parsed.height,
        );
        const decodeMilliseconds = now() - decodeStartedAt;
        const normalStartedAt = now();
        const normalData = buildPhysicalMoonNormalData({
            heightData,
            width: parsed.width,
            height: parsed.height,
            physicalHeightScale: Number(event.data.physicalNormalHeightScale),
            flipY: true,
        });
        const normalBuildMilliseconds = now() - normalStartedAt;
        workerScope.postMessage({
            width: parsed.width,
            height: parsed.height,
            heightBuffer: heightData.buffer,
            normalBuffer: normalData.buffer,
            decodeMilliseconds,
            normalBuildMilliseconds,
        }, [heightData.buffer, normalData.buffer]);
    } catch (error) {
        workerScope.postMessage({
            error: error?.message || String(error),
        });
    }
};
