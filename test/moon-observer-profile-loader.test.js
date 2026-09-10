import { describe, expect, it, vi } from "vitest";

import { createMoonObserverProfileLoader } from "../src/platform/js/app/moon-observer-profile-loader.js";

describe("moon observer profile loader", () => {
    it("aborts sibling resources when the current profile request fails", async () => {
        let requestSignal;
        const loader = createMoonObserverProfileLoader({
            loadResources: vi.fn((profile, { signal }) => {
                requestSignal = signal;
                return Promise.reject(new Error("color failed"));
            }),
            applyResources: vi.fn(),
        });

        await expect(loader.load("quality")).rejects.toThrow("color failed");
        expect(requestSignal.aborted).toBe(true);
    });

    it("aborts the superseded resource request and suppresses its stale failure", async () => {
        const signals = [];
        const loader = createMoonObserverProfileLoader({
            loadResources: vi.fn((profile, { signal }) => {
                signals.push({ profile, signal });
                if (profile === "low") return Promise.resolve({ moonMap: {} });
                return new Promise((resolve, reject) => {
                    signal.addEventListener("abort", () => {
                        const error = new Error("superseded");
                        error.name = "AbortError";
                        reject(error);
                    }, { once: true });
                });
            }),
            applyResources: vi.fn(),
        });

        const highLoad = loader.load("quality");
        const lowLoad = loader.load("low");

        await expect(highLoad).resolves.toBe(false);
        await expect(lowLoad).resolves.toBe(true);
        expect(signals[0].signal.aborted).toBe(true);
        expect(signals[1].signal.aborted).toBe(false);
    });

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
