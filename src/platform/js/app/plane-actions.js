const planeVariableConfig = {
    DEFAULT: {
        plane: "DEFAULT",
        xFactor: 1,
        yFactor: 1,
        zFactor: 1,
        xVariable: "x",
        yVariable: "y",
        zVariable: "z",
        vxVariable: "vx",
        vyVariable: "vy",
        vzVariable: "vz",
    },
    XY: {
        plane: "XY",
        xFactor: 1,
        yFactor: 1,
        zFactor: 1,
        xVariable: "x",
        yVariable: "y",
        zVariable: "z",
        vxVariable: "vx",
        vyVariable: "vy",
        vzVariable: "vz",
    },
    YZ: {
        plane: "YZ",
        xFactor: 1,
        yFactor: 1,
        zFactor: 1,
        xVariable: "y",
        yVariable: "z",
        zVariable: "x",
        vxVariable: "vy",
        vyVariable: "vz",
        vzVariable: "vx",
    },
    ZX: {
        plane: "ZX",
        xFactor: 1,
        yFactor: 1,
        zFactor: 1,
        xVariable: "z",
        yVariable: "x",
        zVariable: "y",
        vxVariable: "vz",
        vyVariable: "vx",
        vzVariable: "vy",
    },
    "XY-": {
        plane: "XY",
        xFactor: -1,
        yFactor: 1,
        zFactor: 1,
        xVariable: "x",
        yVariable: "y",
        zVariable: "z",
        vxVariable: "vx",
        vyVariable: "vy",
        vzVariable: "vz",
    },
    "YZ-": {
        plane: "YZ",
        xFactor: -1,
        yFactor: 1,
        zFactor: 1,
        xVariable: "y",
        yVariable: "z",
        zVariable: "x",
        vxVariable: "vy",
        vyVariable: "vz",
        vzVariable: "vx",
    },
    "ZX-": {
        plane: "ZX",
        xFactor: -1,
        yFactor: 1,
        zFactor: 1,
        xVariable: "z",
        yVariable: "x",
        zVariable: "y",
        vxVariable: "vz",
        vyVariable: "vx",
        vzVariable: "vy",
    },
};

export function createPlaneActions({
    getPlaneSelection,
    setPlaneVariables,
    getCurrentDimension,
    animationScenes,
    getConfig,
    getGlobalConfig = () => null,
    getFrameMode = () => "inertial",
    getTransitionRevision = () => 0,
    initSVG,
    loadOrbitDataIfNeededAndProcess,
    handleDimensionSwitch,
    setLocation,
}) {
    const planeChangeStateByConfig = new Map();
    let latestRequestId = 0;

    function getPlaneChangeState(config) {
        if (!planeChangeStateByConfig.has(config)) {
            planeChangeStateByConfig.set(config, {
                previousPlaneSelection: null,
                planeChangesPending: false,
            });
        }
        return planeChangeStateByConfig.get(config);
    }

    function handlePlaneChange(dimension_changed = false, init_flag = false) {
        const selection = getPlaneSelection();
        const effectiveSelection =
            getFrameMode() === "relative" && selection === "DEFAULT"
                ? ((getGlobalConfig()?.ui?.viewDefaults?.relativeDefaultPlaneSelection) || "DEFAULT")
                : selection;
        const config = getConfig();
        const planeChangeState = getPlaneChangeState(config);

        let planeChanged = false;
        if (selection !== planeChangeState.previousPlaneSelection) {
            planeChanged = true;
            planeChangeState.previousPlaneSelection = selection;
            planeChangeState.planeChangesPending = true;
        } else {
            planeChanged = false;
        }

        if (init_flag && effectiveSelection === "DEFAULT") {
            planeChangeState.planeChangesPending = false;
            return;
        }
        if (!dimension_changed && !planeChanged) {
            return;
        }

        // Only an actual request supersedes pending work. Repeating an unchanged
        // selection must not invalidate its still-valid loading completion.
        const requestId = ++latestRequestId;
        const currentDimension = getCurrentDimension();
        const scene = animationScenes[config];
        const transitionRevision = getTransitionRevision();
        const applyWhenCurrent = () => {
            if (
                requestId !== latestRequestId ||
                getTransitionRevision() !== transitionRevision ||
                getConfig() !== config ||
                getCurrentDimension() !== currentDimension ||
                getPlaneSelection() !== selection ||
                animationScenes[config] !== scene
            ) {
                return;
            }
            handleDimensionSwitch(currentDimension);
            setLocation();
        };

        const planeConfig = planeVariableConfig[effectiveSelection];
        if (planeConfig) {
            setPlaneVariables(planeConfig);
        }

        if (currentDimension === "3D") {
            scene.setCameraParameters(init_flag);
        }

        if (currentDimension === "2D") {
            initSVG();
            loadOrbitDataIfNeededAndProcess(applyWhenCurrent);
        } else if (currentDimension === "3D") {
            loadOrbitDataIfNeededAndProcess(applyWhenCurrent);
        }

        if (planeChangeState.planeChangesPending && dimension_changed) {
            planeChangeState.planeChangesPending = false;
        }
    }

    return {
        handlePlaneChange,
    };
}
