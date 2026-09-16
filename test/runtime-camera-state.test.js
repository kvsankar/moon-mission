import { describe, expect, it } from "vitest";
import { createRuntimeCameraState } from "../src/platform/js/core/state/runtime-camera-state.js";
import { CAMERA_ALLOWED_LOOK_BY_POSITION } from "../src/platform/js/core/domain/camera-policy.js";

describe("main camera state port", () => {
    for (const [positionMode, looks] of Object.entries(CAMERA_ALLOWED_LOOK_BY_POSITION)) {
        for (const lookMode of looks) {
            it(`preserves the valid ${positionMode}/${lookMode} pair`, () => {
                const state = createRuntimeCameraState({ positionMode, lookMode });
                expect(state.get()).toEqual({ positionMode, lookMode, revision: 0 });
                expect(state.commit({ positionMode, lookMode })).toEqual({ positionMode, lookMode, revision: 1 });
            });
        }
    }

    it("preserves the initiating position versus look axis", () => {
        const positionFirst = createRuntimeCameraState();
        expect(positionFirst.commit({ positionMode: "earth" }, { sourceId: "camera-position" }))
            .toMatchObject({ positionMode: "earth", lookMode: "moon" });
        const lookFirst = createRuntimeCameraState({ positionMode: "earth", lookMode: "moon" });
        expect(lookFirst.commit({ lookMode: "manual" }, { sourceId: "camera-look" }))
            .toMatchObject({ positionMode: "manual", lookMode: "manual" });
    });

    it("never publishes an invalid pair for malformed or incompatible requests", () => {
        const values = ["manual", "earth", "moon", "spacecraft", "bogus", undefined, null, 3];
        for (const sourceId of [undefined, "camera-position", "camera-look"]) {
            for (const positionMode of values) for (const lookMode of values) {
                const state = createRuntimeCameraState();
                const snapshot = state.commit({ positionMode, lookMode }, { sourceId });
                expect(CAMERA_ALLOWED_LOOK_BY_POSITION[snapshot.positionMode]).toContain(snapshot.lookMode);
            }
        }
    });

    it("returns detached immutable snapshots and advances repeated explicit intent", () => {
        const state = createRuntimeCameraState();
        const first = state.get();
        expect(Object.isFrozen(first)).toBe(true);
        expect(() => { first.lookMode = "moon"; }).toThrow(TypeError);
        state.commit({ positionMode: "manual", lookMode: "moon" });
        const next = state.commit({ positionMode: "manual", lookMode: "moon" });
        expect(next.revision).toBe(2);
        expect(first).toEqual({ positionMode: "manual", lookMode: "manual", revision: 0 });
        expect(state.get()).not.toBe(next);
    });
});
