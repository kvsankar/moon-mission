import { describe, expect, it, vi } from "vitest";
import { loadComparisonOverlayConfig } from "../src/platform/js/app/comparison-overlay-loader.js";

function config(mnemonic = "PM") {
    return {
        mission_name: `${mnemonic} mission`, spacecraft_mnemonic: mnemonic,
        primaryCraftId: mnemonic, origins: ["geo"],
        crafts: [{ id: mnemonic, primary: true }],
        geo: { startTime: "2023-01-01T00:00:00Z", endTime: "2023-01-03T00:00:00Z",
            center: "earth_center", orbits_file: `geo-${mnemonic}` },
    };
}
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
function options(fetchImpl, overrides = {}) {
    return { baseConfig: config(), fetchImpl, windowRef: {
        location: { search: "?mode=compare&compareMission=artemis1" },
        missionConfig: { dataPath: "assets/primary/data/" },
    }, ...overrides };
}

async function expectComparisonFailure(pending, detail = /comparison/i) {
    const error = await pending.then(() => null, error => error);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ComparisonLoadError");
    expect(error.message).toMatch(/comparison/i);
    expect(error.message).toMatch(detail);
    expect(error.cause).toBeInstanceOf(Error);
    return error;
}

describe("required comparison loading and explicit recovery", () => {
    it.each([404, 503])("rejects a required configuration HTTP %s instead of publishing base-only success", async status => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(response(null, status));
        await expectComparisonFailure(loadComparisonOverlayConfig(options(fetchImpl)), /artemis1/);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("preserves a network failure as the cause without exposing raw error text", async () => {
        const cause = new Error("private-host/internal/path");
        const error = await expectComparisonFailure(loadComparisonOverlayConfig(options(vi.fn().mockRejectedValue(cause))));
        expect(error.cause).toBe(cause);
        expect(error.message).not.toContain(cause.message);
    });

    it("rejects malformed configuration JSON", async () => {
        const cause = new SyntaxError("invalid JSON");
        const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw cause; } });
        const error = await expectComparisonFailure(loadComparisonOverlayConfig(options(fetchImpl)), /artemis1/);
        expect(error.cause).toBe(cause);
    });

    it.each([null, [], { origins: ["geo"] }])("rejects invalid required configuration %#", async payload => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response(null, 404));
        await expectComparisonFailure(loadComparisonOverlayConfig(options(fetchImpl)), /artemis1/);
    });

    it.each(["?mode=compare", "?mode=compare&compareMission=", "?mode=compare&compareMission=..%2Fprivate"])(
        "rejects missing or unsafe comparison selection: %s", async search => {
            const fetchImpl = vi.fn();
            const input = options(fetchImpl);
            input.windowRef.location.search = search;
            await expectComparisonFailure(loadComparisonOverlayConfig(input));
            expect(fetchImpl).not.toHaveBeenCalled();
        },
    );

    it("rejects missing primary setup or fetch capability in requested compare mode", async () => {
        await expectComparisonFailure(loadComparisonOverlayConfig(options(vi.fn(), { baseConfig: null })));
        await expectComparisonFailure(loadComparisonOverlayConfig(options(null)));
    });

    it("rejects a configuration pair from which the real model cannot derive an overlay", async () => {
        const baseConfig = { ...config(), crafts: [null] };
        const fetchImpl = vi.fn().mockResolvedValueOnce(response(config("CM"))).mockResolvedValueOnce(response(null, 404));
        await expectComparisonFailure(loadComparisonOverlayConfig(options(fetchImpl, { baseConfig })), /artemis1/);
    });

    it("rejects a secondary mission with no usable time range instead of synthesizing epoch-zero coverage", async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(response({ origins: ["geo"], geo: {} }))
            .mockResolvedValueOnce(response(null, 404));
        await expectComparisonFailure(loadComparisonOverlayConfig(options(fetchImpl)), /artemis1/);
    });

    it.each([
        { phases: 42 }, { phases: [] }, { phases: { geo: null } },
        { phases: { geo: { artifacts: [] } } },
        { phases: { geo: { artifacts: { chebyshev: 42 } } } },
        { phases: { geo: { artifacts: { chebyshev: { runtime: 42 } } } } },
        { phases: { geo: { artifacts: { chebyshev: { path: " " } } } } },
        { phases: { geo: { chebyshev: { runtime: [] } } } },
    ])("rejects malformed supplied manifest shape or path %#", async manifest => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(response(config("CM"))).mockResolvedValueOnce(response(manifest));
        await expectComparisonFailure(loadComparisonOverlayConfig(options(fetchImpl)), /artemis1/);
    });

    it.each([
        { artifacts: { chebyshev: "custom-cheb.json" } },
        { artifacts: { chebyshev: { runtime: "custom-cheb.json" } } },
        { artifacts: { chebyshev: { path: "custom-cheb.json" } } },
        { chebyshev: "custom-cheb.json" },
    ])("preserves supported manifest artifact forms %#", async phase => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(response(config("CM")))
            .mockResolvedValueOnce(response({ phases: { geo: phase } }));
        const merged = await loadComparisonOverlayConfig(options(fetchImpl));
        expect(merged.comparisonOverlay.supportOrbitChebyshevUrlsByOrigin.geo)
            .toBe("assets/artemis1/data/custom-cheb.json");
    });

    it("permits an absent optional manifest, leaving primary config untouched", async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(response(config("CM"))).mockResolvedValueOnce(response(null, 404));
        const input = options(fetchImpl), before = structuredClone(input.baseConfig);
        const merged = await loadComparisonOverlayConfig(input);
        expect(merged).not.toBe(input.baseConfig);
        expect(merged.crafts).toHaveLength(2);
        expect(merged.comparisonOverlay.compareCraftId).toBe("CMP_ARTEMIS1_CM");
        expect(input.baseConfig).toEqual(before);
    });

    it.each(["HTTP", "network", "JSON"])("does not treat an optional manifest %s failure as known absence", async failure => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(response(config("CM")));
        if (failure === "HTTP") fetchImpl.mockResolvedValueOnce(response(null, 503));
        if (failure === "network") fetchImpl.mockRejectedValueOnce(new Error("network"));
        if (failure === "JSON") fetchImpl.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError("broken"); } });
        await expectComparisonFailure(loadComparisonOverlayConfig(options(fetchImpl)), /artemis1/);
    });

    it("refetches on explicit retry after failure and publishes only the completed overlay", async () => {
        const fetchImpl = vi.fn().mockResolvedValueOnce(response(null, 503))
            .mockResolvedValueOnce(response(config("CM"))).mockResolvedValueOnce(response(null, 404));
        const input = options(fetchImpl), before = structuredClone(input.baseConfig);
        await expectComparisonFailure(loadComparisonOverlayConfig(input));
        expect(input.baseConfig).toEqual(before);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const merged = await loadComparisonOverlayConfig(input);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
            "assets/artemis1/data/config.json", "assets/artemis1/data/config.json",
            "assets/artemis1/data/ephemeris-manifest.json",
        ]);
        expect(merged.comparisonOverlay).toBeTruthy();
        expect(merged.crafts).toHaveLength(2);
        expect(input.baseConfig).toEqual(before);
    });

    it("leaves non-compare mode untouched without requiring fetch or config validation", async () => {
        const input = options(null, { baseConfig: {} });
        input.windowRef.location.search = "?mode=relative&compareMission=artemis1";
        expect(await loadComparisonOverlayConfig(input)).toBe(input.baseConfig);
    });
});
