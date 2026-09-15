import { createAnimationActions } from "./animation-actions.js";
import { createRuntimeInitActions } from "./runtime-init.js";
import { createRuntimeUiControlsActions } from "./runtime-ui-controls.js";
import { createOrbitProcessActions } from "./orbit-process-actions.js";
import { createInitOrchestrationActions } from "./init-orchestration.js";
import { createMoonRenderProfileActions } from "./moon-render-profile-actions.js";
import { createMoonRenderPipelineActions } from "./moon-render-pipeline-actions.js";
import {
    createInitOrchestrationDeps,
    createOrbitProcessDeps,
    createRuntimeAnimationDeps,
    createRuntimeBootstrapAccessors,
    createRuntimeInitDepsFromPorts,
    createRuntimeUiControlsDepsFromPorts,
} from "./runtime-bootstrap-deps.js";

function createRuntimeBootstrapActions(ports) {
    const accessors = createRuntimeBootstrapAccessors(ports);
    const animationActions = createAnimationActions(createRuntimeAnimationDeps(ports));
    const orbitProcessActions = createOrbitProcessActions(
        createOrbitProcessDeps(ports, { animationActions, accessors }),
    );
    const uiControlsActions = createRuntimeUiControlsActions(
        createRuntimeUiControlsDepsFromPorts(ports, {
            animationActions,
            accessors,
            createMoonRenderProfileActions,
            createMoonRenderPipelineActions,
        }),
    );
    const runtimeInitActions = createRuntimeInitActions(
        createRuntimeInitDepsFromPorts(ports, {
            uiControlsActions,
            accessors,
        }),
    );
    const initOrchestrationActions = createInitOrchestrationActions(
        createInitOrchestrationDeps(ports, {
            animationActions,
            uiControlsActions,
            runtimeInitActions,
            accessors,
        }),
    );

    return {
        init: runtimeInitActions.init,
        processOrbitData: (context) => orbitProcessActions.processOrbitData(context),
        initOrchestrationActions,
        ...animationActions,
        ...uiControlsActions,
    };
}

export { createRuntimeBootstrapActions };
