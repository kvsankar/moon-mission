import { describe, expect, it, vi } from "vitest";

import { createMoonObserverProfileLoader } from "../src/platform/js/app/moon-observer-profile-loader.js";

describe("moon observer profile loader", () => {
    it("creates from the newer tier when it resolves before the initial load", async () => {
        const pending = [];
        const createdProfiles = [];
        const updatedProfiles = [];
        let rendererCreated = false;
        const loader = createMoonObserverProfileLoader({
            loadResources: vi.fn((profile) => new Promise((resolve) => {
                pending.push({ profile, resolve });
            })),
            applyResources: vi.fn(async ({ profile }) => {
                if (!rendererCreated) {
                    rendererCreated = true;
                    createdProfiles.push(profile);
                } else {
                    updatedProfiles.push(profile);
                }
            }),
        });
        const staleMap = { dispose: vi.fn() };
        const staleDem = { dispose: vi.fn() };

        const initialHigh = loader.load("quality");
        const selectedLow = loader.load("low");
        pending.find((entry) => entry.profile === "low").resolve({
            moonMap: { dispose: vi.fn() },
            moonDisplacementMap: null,
        });
        await expect(selectedLow).resolves.toBe(true);
        pending.find((entry) => entry.profile === "quality").resolve({
            moonMap: staleMap,
            moonDisplacementMap: staleDem,
        });
        await expect(initialHigh).resolves.toBe(false);

        expect(createdProfiles).toEqual(["low"]);
        expect(updatedProfiles).toEqual([]);
        expect(staleMap.dispose).toHaveBeenCalledTimes(1);
        expect(staleDem.dispose).toHaveBeenCalledTimes(1);
    });
});
