import { planCameraPairTransition } from "../domain/camera-policy.js";

const MODES = new Set(["manual", "earth", "moon", "spacecraft"]);

export function createRuntimeCameraState(initial = {}) {
    const normalize = (patch, previous, sourceId) => {
        const plan = planCameraPairTransition({
            positionMode: MODES.has(patch.positionMode) ? patch.positionMode : previous.positionMode,
            lookMode: MODES.has(patch.lookMode) ? patch.lookMode : previous.lookMode,
            sourceId,
        });
        return { positionMode: plan.positionMode, lookMode: plan.lookMode };
    };
    let pair = normalize(initial, { positionMode: "manual", lookMode: "manual" });
    let revision = 0;
    const get = () => Object.freeze({ ...pair, revision });
    return {
        get,
        commit(patch = {}, { sourceId } = {}) {
            pair = normalize(patch, pair, sourceId);
            revision += 1; // Repeated explicit selections are still new user intents.
            return get();
        },
    };
}
