import { describe, expect, it, vi } from "vitest";
import { createRuntimeCameraState } from "../src/platform/js/core/state/runtime-camera-state.js";
import { createMissionRuntimeWireupEntryContext } from "../src/platform/js/app/mission-runtime-root-context.js";
import { createMissionRuntimeEntryContext, createMissionRuntimeWireupContext } from "../src/platform/js/app/mission-runtime-entry-deps.js";
import { buildMissionRuntimeWireupConfig } from "../src/platform/js/app/mission-runtime-wireup-config.js";
import { createRuntimeUiControlsDepsFromPorts } from "../src/platform/js/app/runtime-bootstrap-deps.js";
import { createRuntimeCameraControlActions } from "../src/platform/js/app/runtime-ui-control-groups.js";

describe("composition-root camera port", () => {
    it("retains one port and both identity callbacks through the real dependency chain", () => {
        const cameraState = createRuntimeCameraState();
        const syncViewIdentity = vi.fn();
        const applyViewForCurrentIdentity = vi.fn();
        const getTransitionRevision = () => 7;
        const root = createMissionRuntimeWireupEntryContext({
            cameraState, syncViewIdentity, applyViewForCurrentIdentity,
            modeSwitchActions: {}, bridgeActions: {}, sceneViewStateActions: {},
        });
        const entry = createMissionRuntimeEntryContext(root, { staticWireupDeps: {} });
        const wireup = createMissionRuntimeWireupContext(entry, {
            missionStatePorts: { app: { getAnimationScenes: () => ({}), getConfig: () => "geo", getTransitionRevision } },
            missionUiEffects: {}, missionClockEffects: {},
        });
        const { runtimeBootstrapPorts: ports } = buildMissionRuntimeWireupConfig(wireup);
        const deps = createRuntimeUiControlsDepsFromPorts(ports, { animationActions: {}, accessors: {} });
        const createCameraActions = vi.fn();
        createRuntimeCameraControlActions({ ...deps, createCameraActions });
        expect(createCameraActions).toHaveBeenCalledWith(expect.objectContaining({
            cameraState, getTransitionRevision, applyViewForCurrentIdentity,
        }));
        expect(ports.statePort.camera).toBe(cameraState);
        expect(ports.uiPort.syncViewIdentity).toBe(syncViewIdentity);
        expect(ports.uiPort.applyViewForCurrentIdentity).toBe(applyViewForCurrentIdentity);
    });
});
