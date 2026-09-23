// Owns the viewport DOM, WebGL renderer and panel-local render resources.
export function createAuxiliaryPanelRenderSurface({
    THREE,
    panel,
    spec,
    panelMode,
    panelSide,
    chipDockLeft,
    chipDockRight,
    composerSkyControlsWrap,
    composerSkyTimelineWrap,
}, {
    createAuxiliaryWebGLRendererWithFallback,
    registerRenderDeviceCapabilities,
    resolveInteractivePixelRatio,
}) {
    let composerDisabledOverlay = null;
    let composerHint = null;
    let composerMetricsStrip = null;
    let composerMetricFovHValue = null;
    let composerMetricFovVValue = null;
    let composerMetricDistanceMoonValue = null;
    let composerMetricAngleValue = null;
    let composerLunarFeatureStack = null;
    let composerLunarFeatureStackHeader = null;
    let composerTranscriptPrevButton = null;
    let composerTranscriptNextButton = null;
    let composerLunarFeatureStackCloseButton = null;
    let composerLunarFeatureStackList = null;
    let composerRollDial = null;
    let composerRollDialKnob = null;
    let composerRollDialValue = null;
    const viewport = document.createElement("div");
    viewport.className = "aux-camera-view__viewport";
    panel.appendChild(viewport);
    if (panelMode === "composer") {
        composerDisabledOverlay = document.createElement("div");
        composerDisabledOverlay.className = "aux-camera-view__composer-disabled-overlay";
        composerDisabledOverlay.textContent = "Outside Flyby Window";
        composerDisabledOverlay.hidden = true;
        viewport.appendChild(composerDisabledOverlay);

        composerHint = document.createElement("div");
        composerHint.className = "aux-camera-view__composer-hint";
        composerHint.hidden = true;
        viewport.appendChild(composerHint);

        viewport.appendChild(composerSkyControlsWrap);
        viewport.appendChild(composerSkyTimelineWrap);

        composerMetricsStrip = document.createElement("div");
        composerMetricsStrip.className = "aux-camera-view__composer-metrics-strip";
        composerMetricsStrip.setAttribute("aria-hidden", "true");

        const createMetricCell = (labelText) => {
            const cell = document.createElement("div");
            cell.className = "aux-camera-view__composer-metric-cell";
            const key = document.createElement("span");
            key.className = "aux-camera-view__composer-metric-key";
            key.textContent = labelText;
            const value = document.createElement("span");
            value.className = "aux-camera-view__composer-metric-value";
            value.textContent = "--";
            cell.appendChild(key);
            cell.appendChild(value);
            composerMetricsStrip.appendChild(cell);
            return value;
        };

        composerMetricFovHValue = createMetricCell("FoV H");
        composerMetricFovVValue = createMetricCell("FoV V");
        composerMetricDistanceMoonValue = createMetricCell("Distance To Moon");
        composerMetricAngleValue = createMetricCell("Angle");
        viewport.appendChild(composerMetricsStrip);

        composerLunarFeatureStack = document.createElement("div");
        composerLunarFeatureStack.className = "aux-camera-view__composer-feature-stack";
        composerLunarFeatureStack.hidden = true;
        composerLunarFeatureStack.setAttribute("aria-label", "Transcript lunar features");
        composerLunarFeatureStackHeader = document.createElement("div");
        composerLunarFeatureStackHeader.className = "aux-camera-view__composer-feature-stack-header";
        const composerLunarFeatureStackTitle = document.createElement("span");
        composerLunarFeatureStackTitle.textContent = "Lunar Transcript";
        const composerLunarFeatureStackNav = document.createElement("div");
        composerLunarFeatureStackNav.className = "aux-camera-view__composer-feature-stack-nav";
        composerTranscriptPrevButton = document.createElement("button");
        composerTranscriptPrevButton.type = "button";
        composerTranscriptPrevButton.className = "aux-camera-view__composer-feature-stack-nav-button";
        composerTranscriptPrevButton.textContent = "<";
        composerTranscriptPrevButton.setAttribute("aria-label", "Jump to previous transcript lunar feature");
        composerTranscriptPrevButton.disabled = true;
        composerTranscriptNextButton = document.createElement("button");
        composerTranscriptNextButton.type = "button";
        composerTranscriptNextButton.className = "aux-camera-view__composer-feature-stack-nav-button";
        composerTranscriptNextButton.textContent = ">";
        composerTranscriptNextButton.setAttribute("aria-label", "Jump to next transcript lunar feature");
        composerTranscriptNextButton.disabled = true;
        composerLunarFeatureStackNav.appendChild(composerTranscriptPrevButton);
        composerLunarFeatureStackNav.appendChild(composerTranscriptNextButton);
        const composerLunarFeatureStackWindowControls = document.createElement("div");
        composerLunarFeatureStackWindowControls.className = "aux-camera-view__composer-feature-stack-window-controls";
        composerLunarFeatureStackCloseButton = document.createElement("button");
        composerLunarFeatureStackCloseButton.type = "button";
        composerLunarFeatureStackCloseButton.className = "aux-camera-view__composer-feature-stack-window-button";
        composerLunarFeatureStackCloseButton.textContent = "x";
        composerLunarFeatureStackCloseButton.setAttribute("aria-label", "Close transcript lunar feature stack");
        composerLunarFeatureStackWindowControls.appendChild(composerLunarFeatureStackCloseButton);
        composerLunarFeatureStackHeader.appendChild(composerLunarFeatureStackTitle);
        composerLunarFeatureStackHeader.appendChild(composerLunarFeatureStackNav);
        composerLunarFeatureStackHeader.appendChild(composerLunarFeatureStackWindowControls);
        composerLunarFeatureStackList = document.createElement("div");
        composerLunarFeatureStackList.className = "aux-camera-view__composer-feature-stack-list";
        composerLunarFeatureStack.appendChild(composerLunarFeatureStackHeader);
        composerLunarFeatureStack.appendChild(composerLunarFeatureStackList);
        viewport.appendChild(composerLunarFeatureStack);

        composerRollDial = document.createElement("button");
        composerRollDial.type = "button";
        composerRollDial.className = "aux-camera-view__composer-roll-dial";
        composerRollDial.setAttribute("aria-label", "Adjust frame rotation");
        composerRollDialKnob = document.createElement("span");
        composerRollDialKnob.className = "aux-camera-view__composer-roll-dial-knob";
        composerRollDialValue = document.createElement("span");
        composerRollDialValue.className = "aux-camera-view__composer-roll-dial-value";
        composerRollDialValue.textContent = "0°";
        composerRollDial.appendChild(composerRollDialKnob);
        composerRollDial.appendChild(composerRollDialValue);
        viewport.appendChild(composerRollDial);
    }

    let renderer = null;
    try {
        renderer = createAuxiliaryWebGLRendererWithFallback(THREE);
        if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        } else {
            renderer.outputEncoding = THREE.sRGBEncoding;
        }
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.14;
        renderer.shadowMap.enabled = true;
        if (THREE.PCFShadowMap) {
            renderer.shadowMap.type = THREE.PCFShadowMap;
        } else if (THREE.PCFSoftShadowMap) {
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        registerRenderDeviceCapabilities(renderer, window);
        renderer.setPixelRatio(resolveInteractivePixelRatio(window));
        renderer.setSize(1, 1);
        renderer.domElement.className = "aux-camera-view__canvas";
        renderer.domElement.setAttribute("aria-hidden", "true");
        viewport.appendChild(renderer.domElement);
    } catch (err) {
        renderer?.dispose?.();
        panel.remove();
        return null;
    }

    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.className = "aux-camera-view__overlay-canvas";
    overlayCanvas.setAttribute("aria-hidden", "true");
    viewport.appendChild(overlayCanvas);
    const overlayCtx = overlayCanvas.getContext("2d");

    const resizeGrips = ["nw", "ne", "sw", "se"].map((corner) => {
        const grip = document.createElement("div");
        grip.className = `aux-camera-view__resize-grip aux-camera-view__resize-grip--${corner}`;
        grip.dataset.resizeCorner = corner;
        grip.setAttribute("aria-hidden", "true");
        panel.appendChild(grip);
        return grip;
    });
    const resizeGrip = resizeGrips[resizeGrips.length - 1];

    const chipButton = document.createElement("button");
    chipButton.className = "aux-camera-chip";
    chipButton.type = "button";
    chipButton.textContent = spec.chipLabel || spec.title;
    chipButton.setAttribute("aria-label", `Restore ${spec.title}`);
    chipButton.hidden = true;
    const chipDock = panelSide === "left" ? chipDockLeft : chipDockRight;
    chipDock?.appendChild(chipButton);

    const camera = spec.mode === "orbit-xy"
        ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.0001, 100000)
        : new THREE.PerspectiveCamera(spec.defaultFov, 1, 0.0001, 100000);
    camera.up.set(0, 0, 1);
    return {
        viewport,
        renderer,
        overlayCanvas,
        overlayCtx,
        resizeGrip,
        chipButton,
        camera,
        composerDisabledOverlay,
        composerHint,
        composerMetricsStrip,
        composerMetricFovHValue,
        composerMetricFovVValue,
        composerMetricDistanceMoonValue,
        composerMetricAngleValue,
        composerLunarFeatureStack,
        composerLunarFeatureStackHeader,
        composerTranscriptPrevButton,
        composerTranscriptNextButton,
        composerLunarFeatureStackCloseButton,
        composerLunarFeatureStackList,
        composerRollDial,
        composerRollDialKnob,
        composerRollDialValue,
    };
}
