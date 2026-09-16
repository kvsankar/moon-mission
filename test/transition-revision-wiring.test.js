import { describe, expect, it } from "vitest";
import { createRuntimeViewState } from "../src/platform/js/core/state/runtime-view-state.js";
import { createMissionViewStateCells } from "../src/platform/js/app/mission-state-cell-groups.js";
import { createMissionStatePorts } from "../src/platform/js/core/state/mission-state-port-builders.js";
import { createMissionWiringContext, createDataflowWiringDeps, createInitConfigFlowDeps } from "../src/platform/js/app/mission-wiring-deps.js";
import { createRuntimeInitDepsFromPorts } from "../src/platform/js/app/runtime-bootstrap-deps.js";

describe("runtime transition revision wiring", () => {
    it("carries the live state revision through the state port into dataflow and startup", () => {
        const view = createRuntimeViewState({ initialConfig: "geo", initialCurrentDimension: "3D" });
        const cells = createMissionViewStateCells(view, () => "classic");
        const statePort = createMissionStatePorts({ state: cells, animationScenes: {} });
        const context = createMissionWiringContext({ statePort });
        const dataflow = createDataflowWiringDeps(context, {});
        const configFlow = createInitConfigFlowDeps(context, { initConfigWiring: {} });
        const startup = createRuntimeInitDepsFromPorts({ statePort, uiPort: { d3: {} } }, { uiControlsActions: {}, accessors: {} });
        expect(dataflow.getTransitionRevision()).toBe(0);
        expect(startup.getTransitionRevision()).toBe(0);
        expect(configFlow.getTransitionRevision()).toBe(0);
        statePort.app.setConfig("lunar"); statePort.app.setConfig("geo");
        expect(dataflow.getTransitionRevision()).toBe(2);
        expect(startup.getTransitionRevision()).toBe(2);
        expect(configFlow.getTransitionRevision()).toBe(2);
        statePort.app.setCurrentDimension("2D"); statePort.app.setCurrentDimension("3D");
        expect(dataflow.getTransitionRevision()).toBe(4);
        expect(startup.getTransitionRevision()).toBe(4);
        expect(configFlow.getTransitionRevision()).toBe(4);
    });
});
