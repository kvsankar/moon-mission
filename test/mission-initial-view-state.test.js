import { describe, expect, it, vi } from "vitest";
import { applyInitialMissionViewState } from "../src/platform/js/app/mission-initial-view-state.js";

describe("mission initial view state", () => {
    it("hydrates config, identity and lunar feature flags from one initial view", () => {
        const setConfig = vi.fn();
        const setCurrentViewIdentity = vi.fn();
        const setViewFlags = vi.fn();
        const runtimeViewState = new Proxy({
            setConfig,
            setCurrentViewIdentity,
            setViewFlags,
            getCurrentDimension: () => "3D",
            getLunarCraterDisplayMode: () => "always",
            getLunarFeatureTypeFilters: () => ({ crater: { enabled: true } }),
        }, {
            get(target, key) {
                return target[key] || (() => false);
            },
        });
        const cameraState = { get: () => ({ positionMode: "spacecraft", lookMode: "moon" }) };
        const initialMissionViewState = {
            config: "geo",
            viewLunarCraters: true,
            viewCraters: false,
        };

        applyInitialMissionViewState({
            runtimeViewState,
            cameraState,
            initialMissionViewState,
            planeSelection: "XY",
        });

        expect(setConfig).toHaveBeenCalledWith("geo");
        expect(setCurrentViewIdentity).toHaveBeenCalledWith({
            originMode: "geo",
            cameraPositionMode: "spacecraft",
            cameraLookMode: "moon",
            planeSelection: "XY",
            dimension: "3D",
        });
        expect(setViewFlags).toHaveBeenCalledWith(expect.objectContaining({
            viewLunarCraters: true,
            viewCraters: false,
            lunarCraterDisplayMode: "always",
            lunarFeatureTypeFilters: { crater: { enabled: true } },
        }));
    });
});
