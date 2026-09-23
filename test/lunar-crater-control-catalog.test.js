import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

function createConsumer() {
    return {
        panel: {
            isConnected: true,
            classList: { toggle: vi.fn(), contains: vi.fn(() => false) },
        },
        busyIndicator: { hidden: true, textContent: "" },
        countValue: { textContent: "" },
        typeFilterContainer: { dataset: { lunarFeatureTypesBuilt: "true" } },
    };
}

describe("lunar control catalog publication", () => {
    it("notifies a connected control owner after loading and resets its cached rows", async () => {
        let finishFetch;
        vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finishFetch = resolve; })));
        const model = await import("../src/platform/js/ui/lunar-crater-control-model.js");
        const elements = createConsumer();
        const onReady = vi.fn();

        model.requestLunarCraterCatalog(elements, onReady);
        expect(model.getLunarCraterCatalogLoadState().loading).toBe(true);
        finishFetch({ ok: true, json: async () => ({ features: [{ name: "Tycho" }] }) });

        await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith(elements));
        expect(onReady).toHaveBeenCalledTimes(1);
        expect(model.getLunarCraterCatalogLoadState().loading).toBe(false);
        expect(elements.typeFilterContainer.dataset.lunarFeatureTypesBuilt).toBeUndefined();
        expect(model.getLunarCraterCatalog().features).toHaveLength(1);
    });

    it("does not notify a detached panel after a late load", async () => {
        let finishFetch;
        vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finishFetch = resolve; })));
        const model = await import("../src/platform/js/ui/lunar-crater-control-model.js");
        const elements = createConsumer();
        const onReady = vi.fn();

        model.requestLunarCraterCatalog(elements, onReady);
        elements.panel.isConnected = false;
        finishFetch({ ok: true, json: async () => ({ features: [{ name: "Tycho" }] }) });

        await vi.waitFor(() => expect(model.getLunarCraterCatalogLoadState().loading).toBe(false));
        expect(onReady).not.toHaveBeenCalled();
    });
});
