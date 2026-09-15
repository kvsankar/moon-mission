function createRuntimeInitActions(deps) {
    const {
        getConfig,
        getScene,
        getTransitionRevision = () => 0,
        getSceneStateInitDone,
        setSceneState,
        resetViewTransformState,
        initRepeatButtons,
        d3SelectAll,
        setChecked,
        bindRepeatButtons,
        d3Select,
        getHandlersById,
        getTimeoutHandleZoom,
        setTimeoutHandleZoom,
        setMousedownTimeout,
        setMouseDown,
        getZoomTimeoutMs,
        clearTimeoutFn,
        zoomEnd,
        sleep,
        setAnimDate,
        getCurrentDimension,
        initSVG,
        loadOrbitDataIfNeededAndProcess,
        loadLandingDataAndProcess,
    } = deps;

    let latestInitRequest = 0;
    async function init(callback, { isCurrent: isParentCurrent = () => true } = {}) {
        const requestId = ++latestInitRequest;
        const sceneConfig = getConfig();
        const superseded = () => ({ status: "superseded", config: sceneConfig });
        const scene = getScene(sceneConfig);
        const transitionRevision = getTransitionRevision();
        const isCurrent = () =>
            requestId === latestInitRequest && isParentCurrent() &&
            !!scene && scene.stopCreationFlag !== true &&
            getConfig() === sceneConfig && getScene(sceneConfig) === scene &&
            getTransitionRevision() === transitionRevision;
        if (!isCurrent()) return superseded();
        if (scene && scene.state >= getSceneStateInitDone()) {
            if (getCurrentDimension() === "2D") initSVG();
            loadLandingDataAndProcess();
            return loadOrbitDataIfNeededAndProcess(callback, { isCurrent });
        }

        resetViewTransformState(sceneConfig);

        initRepeatButtons({
            d3SelectAll,
            setChecked,
            animationScene: scene,
            bindRepeatButtons,
            d3Select,
            handlersById: getHandlersById(),
            /**
             * @param {{ mouseOut?: boolean }} [state]
             */
            resetMouseRepeatState: ({ mouseOut } = {}) => {
                if (mouseOut) {
                    setMouseDown(false);
                    if (getTimeoutHandleZoom() == null) return;
                } else {
                    setMousedownTimeout(getZoomTimeoutMs());
                    setMouseDown(false);
                }

                clearTimeoutFn(getTimeoutHandleZoom());
                setTimeoutHandleZoom(null);
                zoomEnd();
            },
        });

        await sleep();
        if (!isCurrent()) return superseded();

        setAnimDate(d3Select("#date"));

        await sleep();
        if (!isCurrent()) return superseded();
        if (getCurrentDimension() === "2D") {
            initSVG();
        }

        await sleep();
        if (!isCurrent()) return superseded();
        const orbitLoad = loadOrbitDataIfNeededAndProcess(callback, { isCurrent });
        loadLandingDataAndProcess();

        setSceneState(sceneConfig, getSceneStateInitDone());
        return orbitLoad;
    }

    return {
        init,
    };
}

export { createRuntimeInitActions };
