import { describe, expect, it, vi } from "vitest";
import { constrainMoonRenderProfile, registerRenderDeviceCapabilities, resolveDefaultMoonProfile, resolveInteractivePixelRatio } from "../src/platform/js/core/domain/render-device-policy.js";
import { resolveMoonRenderAssetSelection } from "../src/platform/js/app/moon-render-asset-profiles.js";

describe("cross-device rendering policy", () => {
    it.each([
        [{}, "fast"],
        [{ navigator: { maxTouchPoints: 5 } }, "low"],
        [{ navigator: { maxTouchPoints: 5, deviceMemory: 4 } }, "low"],
        [{ navigator: { maxTouchPoints: 5, deviceMemory: 8 } }, "fast"],
        [{ navigator: { deviceMemory: 2 } }, "low"],
        [{ navigator: { hardwareConcurrency: 2 } }, "low"],
        [{ navigator: { connection: { saveData: true } } }, "low"],
        [{ navigator: { connection: { effectiveType: "3g" } } }, "low"],
        [{ matchMedia: () => ({ matches: true }) }, "low"],
    ])("uses a bounded default with optional browser hints: %j", (device, expected) => {
        expect(resolveDefaultMoonProfile(device)).toBe(expected);
    });

    it("respects saved and explicit High on capable touch devices", () => {
        const device = { navigator: { maxTouchPoints: 5 }, MOON_RENDER_MAX_TEXTURE_SIZE: 8192, localStorage: { getItem: () => "quality" } };
        expect(resolveMoonRenderAssetSelection({ globalObject: device }).profile).toBe("quality");
        expect(resolveMoonRenderAssetSelection({ globalObject: device, search: "?moonProfile=low" }).profile).toBe("low");
        expect(resolveMoonRenderAssetSelection({ globalObject: device, profile: "quality" }).profile).toBe("quality");
    });

    it("falls back before requesting unsupported typed DEM textures", () => {
        const device = { MOON_RENDER_MAX_TEXTURE_SIZE: 4096 };
        const selection = resolveMoonRenderAssetSelection({ globalObject: device, profile: "quality" });
        expect(selection.profile).toBe("fast");
        expect(selection.active.moonDisplacementMap).toContain("terrain-medium-v2.moon.gz");
        expect(constrainMoonRenderProfile("fast", { MOON_RENDER_MAX_TEXTURE_SIZE: 1024 })).toBe("low");
        expect(constrainMoonRenderProfile("quality", {})).toBe("quality");
    });

    it("bounds interactive buffers on dense touch and constrained displays", () => {
        expect(resolveInteractivePixelRatio({ devicePixelRatio: 3 })).toBe(2);
        expect(resolveInteractivePixelRatio({ devicePixelRatio: 3, navigator: { maxTouchPoints: 5 } })).toBe(1.5);
        expect(resolveInteractivePixelRatio({ devicePixelRatio: 3, navigator: { deviceMemory: 2 } })).toBe(1);
        expect(resolveInteractivePixelRatio({})).toBe(1);
    });

    it("retains the smallest GPU limit across multiple view contexts", () => {
        const device = { dispatchEvent: vi.fn(), Event };
        registerRenderDeviceCapabilities({ capabilities: { maxTextureSize: 8192 } }, device);
        registerRenderDeviceCapabilities({ capabilities: { maxTextureSize: 4096 } }, device);
        registerRenderDeviceCapabilities({ capabilities: { maxTextureSize: 16384 } }, device);
        expect(device.MOON_RENDER_MAX_TEXTURE_SIZE).toBe(4096);
        expect(device.dispatchEvent).toHaveBeenCalledTimes(2);
    });
});
