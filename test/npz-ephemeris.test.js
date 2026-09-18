import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

import { TIME_CONSTANTS } from "../src/platform/js/core/constants.js";
import {
    generateCurveFromNpz,
    getStateFromNpzSeries,
    loadNpzEphemeris,
} from "../src/platform/js/data/npz-ephemeris.js";

const FIELD_ORDER = ["jdct", "x", "y", "z", "vx", "vy", "vz"];

/**
 * Build a real NumPy `.npy` buffer for a 1D structured array, so the loader is
 * exercised against the same bytes `numpy.savez` produces.
 */
function buildNpy(records, {
    version = 1,
    fields = FIELD_ORDER,
    dtype = "<f8",
    shapeText = null,
} = {}) {
    const descr = fields.map((name) => `('${name}', '${dtype}')`).join(", ");
    const shape = shapeText ?? `${records.length},`;
    let header = `{'descr': [${descr}], 'fortran_order': False, 'shape': (${shape}), }`;

    const prefixLength = version === 1 ? 10 : 12;
    while ((prefixLength + header.length + 1) % 64 !== 0) header += " ";
    header += "\n";

    const itemSize = Number(dtype.slice(2));
    const recordSize = itemSize * fields.length;
    const buffer = new ArrayBuffer(prefixLength + header.length + (records.length * recordSize));
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    for (const [index, code] of [..."\x93NUMPY"].entries()) {
        bytes[index] = code.charCodeAt(0);
    }
    bytes[6] = version;
    bytes[7] = 0;
    if (version === 1) {
        view.setUint16(8, header.length, true);
    } else {
        view.setUint32(8, header.length, true);
    }
    for (let index = 0; index < header.length; index += 1) {
        bytes[prefixLength + index] = header.charCodeAt(index);
    }

    let offset = prefixLength + header.length;
    for (const record of records) {
        for (const name of fields) {
            const value = record[name] ?? 0;
            if (dtype[1] === "f" && itemSize === 8) view.setFloat64(offset, value, true);
            else if (dtype[1] === "f" && itemSize === 4) view.setFloat32(offset, value, true);
            else if (dtype[1] === "i" && itemSize === 8) view.setBigInt64(offset, BigInt(value), true);
            else if (dtype[1] === "i" && itemSize === 4) view.setInt32(offset, value, true);
            else if (dtype[1] === "i" && itemSize === 2) view.setInt16(offset, value, true);
            else if (dtype[1] === "i" && itemSize === 1) view.setInt8(offset, value);
            else throw new Error(`unsupported test dtype ${dtype}`);
            offset += itemSize;
        }
    }
    return buffer;
}

function sampleRecords(count = 3, startJd = 2460000.5) {
    return Array.from({ length: count }, (_, index) => ({
        jdct: startJd + index,
        x: 100 * index,
        y: 200 * index,
        z: 300 * index,
        vx: 1 * index,
        vy: 2 * index,
        vz: 3 * index,
    }));
}

async function zipWith(entries) {
    const zip = new JSZip();
    for (const [name, buffer] of Object.entries(entries)) {
        zip.file(name, buffer);
    }
    return zip.generateAsync({ type: "arraybuffer" });
}

function stubFetch(responder) {
    vi.stubGlobal("fetch", vi.fn(responder));
}

afterEach(() => {
    vi.unstubAllGlobals();
});

function makeSeries(records = sampleRecords()) {
    return {
        jd: records.map((record) => record.jdct),
        x: records.map((record) => record.x),
        y: records.map((record) => record.y),
        z: records.map((record) => record.z),
        vx: records.map((record) => record.vx),
        vy: records.map((record) => record.vy),
        vz: records.map((record) => record.vz),
        timeRange: { start: records[0].jdct, end: records[records.length - 1].jdct },
    };
}

describe("loadNpzEphemeris", () => {
    it("requires a URL", async () => {
        await expect(loadNpzEphemeris("")).rejects.toThrow("requires a URL");
    });

    it("reports an HTTP failure with the status code", async () => {
        stubFetch(async () => ({ ok: false, status: 404 }));

        await expect(loadNpzEphemeris("/missing.npz")).rejects.toThrow(/404/);
    });

    it("parses one series per `_vectors.npy` archive member", async () => {
        const records = sampleRecords();
        const archive = await zipWith({
            "sc_vectors.npy": buildNpy(records),
            "moon_vectors.npy": buildNpy(records),
            "readme.txt": new TextEncoder().encode("ignored").buffer,
        });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        const bodies = await loadNpzEphemeris("/ephem.npz");

        expect(Object.keys(bodies).sort()).toEqual(["MOON", "SC"]);
        expect(Array.from(bodies.SC.x)).toEqual([0, 100, 200]);
        expect(bodies.SC.timeRange).toEqual({ start: 2460000.5, end: 2460002.5 });
    });

    it("reads a v2 header just like a v1 header", async () => {
        const records = sampleRecords();
        const archive = await zipWith({ "sc_vectors.npy": buildNpy(records, { version: 2 }) });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        const bodies = await loadNpzEphemeris("/ephem.npz");

        expect(Array.from(bodies.SC.jd)).toEqual([2460000.5, 2460001.5, 2460002.5]);
    });

    it("accepts 32-bit floats and integer fields", async () => {
        const archive = await zipWith({
            "sc_vectors.npy": buildNpy(sampleRecords(), { dtype: "<f4" }),
            "moon_vectors.npy": buildNpy(sampleRecords(2, 100), { dtype: "<i4" }),
        });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        const bodies = await loadNpzEphemeris("/ephem.npz");

        expect(Array.from(bodies.SC.x)).toEqual([0, 100, 200]);
        expect(Array.from(bodies.MOON.jd)).toEqual([100, 101]);
    });

    it("accepts the `jd` spelling of the time column", async () => {
        const fields = ["jd", "x", "y", "z", "vx", "vy", "vz"];
        const records = sampleRecords().map(({ jdct, ...rest }) => ({ jd: jdct, ...rest }));
        const archive = await zipWith({ "sc_vectors.npy": buildNpy(records, { fields }) });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        const bodies = await loadNpzEphemeris("/ephem.npz");

        expect(Array.from(bodies.SC.jd)).toEqual([2460000.5, 2460001.5, 2460002.5]);
    });

    it("rejects a file that is not an NPY", async () => {
        const archive = await zipWith({
            "sc_vectors.npy": new TextEncoder().encode("PK not numpy at all").buffer,
        });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        await expect(loadNpzEphemeris("/ephem.npz")).rejects.toThrow("missing magic header");
    });

    it("rejects an unsupported NPY version", async () => {
        const archive = await zipWith({ "sc_vectors.npy": buildNpy(sampleRecords(), { version: 9 }) });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        await expect(loadNpzEphemeris("/ephem.npz")).rejects.toThrow("Unsupported NPY version");
    });

    it("rejects a multi-dimensional array", async () => {
        const archive = await zipWith({
            "sc_vectors.npy": buildNpy(sampleRecords(), { shapeText: "3, 2" }),
        });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        await expect(loadNpzEphemeris("/ephem.npz")).rejects.toThrow("Only 1D structured arrays");
    });

    it("rejects an array with no structured fields", async () => {
        const archive = await zipWith({
            "sc_vectors.npy": buildNpy([], { fields: [], shapeText: "0," }),
        });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        await expect(loadNpzEphemeris("/ephem.npz")).rejects.toThrow("No structured fields");
    });

    it("rejects big-endian data", async () => {
        const archive = await zipWith({
            "sc_vectors.npy": buildNpy(sampleRecords(), { dtype: ">f8" }),
        });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        await expect(loadNpzEphemeris("/ephem.npz")).rejects.toThrow("Big-endian");
    });

    it("rejects a series with no time column", async () => {
        const fields = ["t", "x", "y", "z", "vx", "vy", "vz"];
        const archive = await zipWith({
            "sc_vectors.npy": buildNpy(sampleRecords(), { fields }),
        });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        await expect(loadNpzEphemeris("/ephem.npz")).rejects.toThrow("missing jd/jdct field");
    });

    it("names the state column that is missing", async () => {
        const fields = ["jdct", "x", "y", "z", "vx", "vy"];
        const archive = await zipWith({
            "sc_vectors.npy": buildNpy(sampleRecords(), { fields }),
        });
        stubFetch(async () => ({ ok: true, arrayBuffer: async () => archive }));

        await expect(loadNpzEphemeris("/ephem.npz")).rejects.toThrow("missing field 'vz'");
    });
});

describe("getStateFromNpzSeries", () => {
    it("returns null for an empty or absent series", () => {
        expect(getStateFromNpzSeries(null, 2460000.5)).toBeNull();
        expect(getStateFromNpzSeries({ jd: [] }, 2460000.5)).toBeNull();
    });

    it("returns null outside the covered window", () => {
        const series = makeSeries();
        expect(getStateFromNpzSeries(series, 2459999)).toBeNull();
        expect(getStateFromNpzSeries(series, 2460003)).toBeNull();
    });

    it("returns the exact sample at a knot", () => {
        const state = getStateFromNpzSeries(makeSeries(), 2460001.5);

        expect(state.pos).toEqual({ x: 100, y: 200, z: 300 });
        expect(state.vel).toEqual({ vx: 1, vy: 2, vz: 3 });
    });

    it("interpolates linearly between two knots", () => {
        const state = getStateFromNpzSeries(makeSeries(), 2460001.0);

        expect(state.pos.x).toBeCloseTo(50, 9);
        expect(state.pos.z).toBeCloseTo(150, 9);
        expect(state.vel.vy).toBeCloseTo(1, 9);
    });

    it("returns the endpoints at the window edges", () => {
        const series = makeSeries();

        expect(getStateFromNpzSeries(series, series.jd[0]).pos.x).toBe(0);
        expect(getStateFromNpzSeries(series, series.jd[2]).pos.x).toBe(200);
    });

    it("handles a single-sample series", () => {
        const series = makeSeries(sampleRecords(1));

        expect(getStateFromNpzSeries(series, series.jd[0]).pos).toEqual({ x: 0, y: 0, z: 0 });
    });
});

describe("generateCurveFromNpz", () => {
    const JD_UNIX_EPOCH = 2440587.5;
    const MS_PER_DAY = 86400000;
    const dayMs = MS_PER_DAY;
    // The loader samples in TDB, so the wall-clock time that lands exactly on
    // the first knot is offset by the same constant the runtime uses.
    const startMs = ((2460000.5 - JD_UNIX_EPOCH) * MS_PER_DAY) - TIME_CONSTANTS.TDB_OFFSET_MS;

    it("returns nothing without a series", () => {
        expect(generateCurveFromNpz(null, 0, 1000, 100)).toEqual([]);
    });

    it("samples the window at the requested step", () => {
        const curve = generateCurveFromNpz(makeSeries(), startMs, startMs + (2 * dayMs), dayMs);

        expect(curve).toHaveLength(3);
        expect(curve[0].timeMs).toBe(startMs);
        expect(curve.map((point) => Math.round(point.x))).toEqual([0, 100, 200]);
    });

    it("always includes the requested end time", () => {
        const endMs = startMs + (1.5 * dayMs);
        const curve = generateCurveFromNpz(makeSeries(), startMs, endMs, dayMs);

        expect(curve[curve.length - 1].timeMs).toBe(endMs);
    });

    it("skips samples the series cannot cover", () => {
        const curve = generateCurveFromNpz(
            makeSeries(),
            startMs - (5 * dayMs),
            startMs - (3 * dayMs),
            dayMs,
        );

        expect(curve).toEqual([]);
    });

    it("treats a non-positive step as one millisecond", () => {
        const curve = generateCurveFromNpz(makeSeries(), startMs, startMs + 2, 0);

        expect(curve.map((point) => point.timeMs)).toEqual([startMs, startMs + 1, startMs + 2]);
    });

    it("carries the velocity components onto each sample", () => {
        const [first] = generateCurveFromNpz(makeSeries(), startMs, startMs, dayMs);

        expect(first).toMatchObject({ vx: 0, vy: 0, vz: 0 });
    });
});
