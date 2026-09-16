import { beforeEach, describe, expect, it, vi } from "vitest";

let loader;
beforeEach(async () => {
    vi.resetModules();
    loader = await import("../src/platform/js/data/lunar-feature-catalog.js");
});
const response = value => ({ ok: true, json: async () => value });

describe("lunar feature catalog URL ownership", () => {
    it("keys cached and in-flight catalogs by resolved URL", async () => {
        const fetchFn = vi.fn(async url => response({ features: [{ name: url }] }));
        const [a1, b, a2] = await Promise.all([
            loader.loadLunarFeatureCatalog({ url: "/a.json", fetchFn }),
            loader.loadLunarFeatureCatalog({ url: "/b.json", fetchFn }),
            loader.loadLunarFeatureCatalog({ url: "/a.json", fetchFn }),
        ]);
        expect(a1).toBe(a2);
        expect(a1.features[0].name).toBe("/a.json");
        expect(b.features[0].name).toBe("/b.json");
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
    it("does not cache failure and lets the same URL retry", async () => {
        const fetchFn = vi.fn().mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(response({ features: [] }));
        await expect(loader.loadLunarFeatureCatalog({ url: "/retry.json", fetchFn })).rejects.toThrow("offline");
        await expect(loader.loadLunarFeatureCatalog({ url: "/retry.json", fetchFn })).resolves.toEqual({ features: [] });
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
    it("preserves the default catalog getter without aliasing alternate URLs", async () => {
        const seeded = { features: [{ name: "seed" }] };
        loader.setLoadedLunarFeatureCatalogForTests(seeded);
        const alternate = await loader.loadLunarFeatureCatalog({ url: "/alternate.json",
            fetchFn: vi.fn(async () => response({ features: [{ name: "alternate" }] })) });
        expect(alternate.features[0].name).toBe("alternate");
        expect(loader.getLoadedLunarFeatureCatalog()).toBe(seeded);
    });
});
