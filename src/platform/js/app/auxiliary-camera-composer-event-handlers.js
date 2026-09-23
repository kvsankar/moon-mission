// Frame-and-Shoot DOM event handlers built from the control action contract.
export function createComposerEventHandlers(panelState, actions, dependencies) {
    const {
        activateComposerForControl,
        syncComposerTranscriptFeatureUi,
        setComposerOpticsProfile,
        setComposerExposureEv,
        setComposerAutoExposureEnabled,
        setComposerOpticsStrength,
        setComposerOpticsGain,
        setComposerEclipseCoronaGain,
        setComposerAmbient,
        setComposerEarthshineGain,
        setComposerMoonshineGain,
        setComposerStarMagnitudeLimit,
        resetComposerControlsToDefaults,
        syncComposerRollUi,
        setComposerLockTarget,
    } = actions;
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        COMPOSER_DRAG_SENSITIVITY,
        COMPOSER_TIMELINE_RESOLUTION,
        COMPOSER_WHEEL_ZOOM_SENSITIVITY,
        computeComposerDragSensitivityScale,
        isDomElement,
        isDomEventInstance,
        isDomInstance,
        shouldRenderComposerLunarCraterHover,
    } = dependencies;
    const onComposerLookFreeClick = () => {
        this.setComposerOrientationReference(panelState, "world");
        setComposerLockTarget("none");
    };

    const onComposerLookEarthClick = () => {
        setComposerLockTarget("earth");
    };

    const onComposerLookMoonClick = () => {
        setComposerLockTarget("moon");
    };

    const onComposerResetClick = () => {
        activateComposerForControl();
        resetComposerControlsToDefaults({ persist: true });
    };

    const onComposerEarthAmbientInput = () => {
        activateComposerForControl();
        setComposerAmbient("composerEarthAmbient", panelState.composerEarthAmbientSlider?.value, { persist: true });
    };

    const onComposerMoonAmbientInput = () => {
        activateComposerForControl();
        setComposerAmbient("composerMoonAmbient", panelState.composerMoonAmbientSlider?.value, { persist: true });
    };

    const onComposerEarthshineInput = () => {
        activateComposerForControl();
        setComposerEarthshineGain(panelState.composerEarthshineSlider?.value, { persist: true });
    };

    const onComposerMoonshineInput = () => {
        activateComposerForControl();
        setComposerMoonshineGain(panelState.composerMoonshineSlider?.value, { persist: true });
    };

    const onComposerMoonOutlineToggle = () => {
        activateComposerForControl();
        panelState.composerMoonOutlineEnabled = !!panelState.composerMoonOutlineCheckbox?.checked;
        panelState.overlayDirty = true;
        this.requestRender?.();
    };

    const onComposerSeeThroughToggle = () => {
        activateComposerForControl();
        panelState.composerSeeThroughEnabled = !!panelState.composerSeeThroughCheckbox?.checked;
        panelState.overlayDirty = true;
        this.requestRender?.();
    };

    const onComposerOpticsPhysicalClick = () => {
        activateComposerForControl();
        setComposerOpticsProfile("physical");
    };

    const onComposerOpticsCameraClick = () => {
        activateComposerForControl();
        setComposerOpticsProfile("camera");
    };

    const onComposerExposureInput = () => {
        activateComposerForControl();
        setComposerExposureEv(panelState.composerExposureSlider?.value, { persist: true });
    };

    const onComposerAutoExposureChange = () => {
        activateComposerForControl();
        setComposerAutoExposureEnabled(panelState.composerAutoExposureCheckbox?.checked !== false, {
            persist: true,
        });
    };

    const onComposerOpticsStrengthInput = () => {
        activateComposerForControl();
        setComposerOpticsStrength(panelState.composerOpticsStrengthSlider?.value);
    };

    const onComposerOpticsHaloInput = () => {
        activateComposerForControl();
        setComposerOpticsGain("composerSunHaloGain", panelState.composerOpticsHaloSlider?.value);
    };

    const onComposerOpticsStarburstInput = () => {
        activateComposerForControl();
        setComposerOpticsGain("composerSunStarburstGain", panelState.composerOpticsStarburstSlider?.value);
    };

    const onComposerOpticsFlareInput = () => {
        activateComposerForControl();
        setComposerOpticsGain("composerSunFlareGain", panelState.composerOpticsFlareSlider?.value);
    };

    const onComposerEclipseCoronaIntensityInput = () => {
        activateComposerForControl();
        setComposerEclipseCoronaGain(
            "composerEclipseCoronaIntensity",
            panelState.composerEclipseCoronaIntensitySlider?.value,
        );
    };

    const onComposerEclipseCoronaMotionInput = () => {
        activateComposerForControl();
        setComposerEclipseCoronaGain(
            "composerEclipseCoronaMotion",
            panelState.composerEclipseCoronaMotionSlider?.value,
        );
    };

    const onComposerEclipseCoronaStructureInput = () => {
        activateComposerForControl();
        setComposerEclipseCoronaGain(
            "composerEclipseCoronaStructure",
            panelState.composerEclipseCoronaStructureSlider?.value,
        );
    };

    const onComposerEclipseZodiacalDustInput = () => {
        activateComposerForControl();
        setComposerEclipseCoronaGain(
            "composerEclipseZodiacalDust",
            panelState.composerEclipseZodiacalDustSlider?.value,
        );
    };

    const onComposerStarMagnitudeInput = () => {
        activateComposerForControl();
        setComposerStarMagnitudeLimit(panelState.composerStarMagnitudeSlider?.value, { persist: true });
    };

    const onComposerTranscriptWindowInput = () => {
        panelState.composerLunarFeatureMentionWindowSeconds =
            Number(panelState.composerTranscriptWindowSlider?.value);
        syncComposerTranscriptFeatureUi();
        this.requestRender?.();
    };

    const onComposerTranscriptHoldInput = () => {
        const holdSeconds = Number(panelState.composerTranscriptHoldSlider?.value);
        if (Number.isFinite(holdSeconds)) {
            panelState.composerLunarFeatureMentionLeadSeconds = Math.round(holdSeconds / 3);
            panelState.composerLunarFeatureMentionTrailSeconds =
                holdSeconds - panelState.composerLunarFeatureMentionLeadSeconds;
        }
        syncComposerTranscriptFeatureUi();
        this.requestRender?.();
    };

    const onComposerTranscriptSyncedChange = () => {
        activateComposerForControl();
        panelState.composerLunarFeatureSyncedEnabled =
            panelState.composerTranscriptSyncedCheckbox?.checked !== false;
        syncComposerTranscriptFeatureUi();
        if (panelState.composerLunarFeatureSyncedEnabled !== true) {
            panelState.composerLunarFeatureMentionView = null;
        }
        this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);
        this.requestRender?.();
    };

    const onComposerTranscriptPrevClick = () => {
        activateComposerForControl();
        this.jumpComposerTranscriptFeature(panelState, -1);
    };

    const onComposerTranscriptNextClick = () => {
        activateComposerForControl();
        this.jumpComposerTranscriptFeature(panelState, 1);
    };

    const onComposerLunarFeatureStackCloseClick = (event) => {
        activateComposerForControl();
        if (isDomInstance(panelState.composerLunarFeatureStack, "HTMLElement")) {
            const stackRect = panelState.composerLunarFeatureStack.getBoundingClientRect();
            const viewportRect = panelState.viewport?.getBoundingClientRect?.();
            if (viewportRect) {
                panelState.composerLunarFeatureStackLeftPx = stackRect.left - viewportRect.left;
                panelState.composerLunarFeatureStackTopPx = stackRect.top - viewportRect.top;
            }
        }
        panelState.composerLunarFeatureStackDismissed = true;
        this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);
        event?.stopPropagation?.();
    };

    const onComposerLunarFeatureStackRestoreClick = (event) => {
        activateComposerForControl();
        panelState.composerLunarFeatureStackDismissed = false;
        this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);
        event?.stopPropagation?.();
    };

    const onComposerLunarFeatureStackPointerDown = (event) => {
        if (
            !isDomInstance(panelState.composerLunarFeatureStack, "HTMLElement") ||
            !isDomInstance(panelState.viewport, "HTMLElement") ||
            event?.button !== 0 ||
            event?.target?.closest?.("button")
        ) {
            return;
        }
        activateComposerForControl();
        const stackRect = panelState.composerLunarFeatureStack.getBoundingClientRect();
        const viewportRect = panelState.viewport.getBoundingClientRect();
        const startLeft = Number.isFinite(panelState.composerLunarFeatureStackLeftPx)
            ? panelState.composerLunarFeatureStackLeftPx
            : stackRect.left - viewportRect.left;
        const startTop = Number.isFinite(panelState.composerLunarFeatureStackTopPx)
            ? panelState.composerLunarFeatureStackTopPx
            : stackRect.top - viewportRect.top;
        panelState.composerLunarFeatureStackDrag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startLeft,
            startTop,
        };
        panelState.composerLunarFeatureStack.classList.add("is-dragging");
        panelState.composerLunarFeatureStackHeader?.setPointerCapture?.(event.pointerId);
        this.setComposerLunarFeatureStackPosition(panelState, startLeft, startTop);
        event.preventDefault?.();
        event.stopPropagation?.();
    };

    const onComposerLunarFeatureStackPointerMove = (event) => {
        const drag = panelState.composerLunarFeatureStackDrag;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        this.setComposerLunarFeatureStackPosition(
            panelState,
            drag.startLeft + (event.clientX - drag.startX),
            drag.startTop + (event.clientY - drag.startY),
        );
        event.preventDefault?.();
        event.stopPropagation?.();
    };

    const releaseComposerLunarFeatureStack = (event) => {
        const drag = panelState.composerLunarFeatureStackDrag;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        panelState.composerLunarFeatureStackDrag = null;
        panelState.composerLunarFeatureStack?.classList.remove("is-dragging");
        panelState.composerLunarFeatureStackHeader?.releasePointerCapture?.(event.pointerId);
        event.stopPropagation?.();
    };

    const onComposerInfoOverlayToggle = () => {
        activateComposerForControl();
        panelState.composerInfoOverlayEnabled = !!panelState.composerInfoOverlayCheckbox?.checked;
        panelState.overlayDirty = true;
        this.requestRender?.();
    };

    const onComposerTimelineInput = () => {
        activateComposerForControl();
        if (!panelState.composerTimelineSlider) {
            return;
        }
        const localMin = panelState.composerTimelineStartMs;
        const localMax = panelState.composerTimelineEndMs;
        if (!Number.isFinite(localMin) || !Number.isFinite(localMax) || localMax <= localMin) {
            return;
        }
        const sliderValue = Number(panelState.composerTimelineSlider.value);
        const ratio = this.THREE.MathUtils.clamp(
            sliderValue / COMPOSER_TIMELINE_RESOLUTION,
            0,
            1,
        );
        const targetMs = localMin + ((localMax - localMin) * ratio);
        this.seekMainTimelineTime(targetMs, false);
    };

    const onComposerTimelinePointerDown = () => {
        activateComposerForControl();
        panelState.composerTimelineDragging = true;
    };

    const onComposerTimelinePointerUp = () => {
        activateComposerForControl();
        panelState.composerTimelineDragging = false;
        if (!panelState.composerTimelineSlider) {
            return;
        }
        const localMin = panelState.composerTimelineStartMs;
        const localMax = panelState.composerTimelineEndMs;
        if (!Number.isFinite(localMin) || !Number.isFinite(localMax) || localMax <= localMin) {
            return;
        }
        const sliderValue = Number(panelState.composerTimelineSlider.value);
        const ratio = this.THREE.MathUtils.clamp(
            sliderValue / COMPOSER_TIMELINE_RESOLUTION,
            0,
            1,
        );
        const targetMs = localMin + ((localMax - localMin) * ratio);
        this.seekMainTimelineTime(targetMs, true);
    };

    const onComposerPhasePrevClick = () => {
        this.selectComposerTimelinePhase(panelState, this.composerActivePhaseIndex - 1);
    };

    const onComposerPhaseNextClick = () => {
        this.selectComposerTimelinePhase(panelState, this.composerActivePhaseIndex + 1);
    };

    const onComposerTimelinePopupDocumentPointerDown = (event) => {
        if (!isDomElement(event.target)) {
            return;
        }
        const phaseDetails = panelState.composerPhaseDetails;
        if (phaseDetails?.open && !phaseDetails.contains(event.target)) {
            phaseDetails.open = false;
        }
        const eventDetails = panelState.composerFlybyEventsDetails;
        if (eventDetails?.open && !eventDetails.contains(event.target)) {
            eventDetails.open = false;
        }
    };

    const REPEAT_PRESS_BUTTON_IDS = new Set(["slower", "faster", "realtime"]);

    const dispatchSyntheticPress = (target) => {
        if (!isDomInstance(target, "HTMLButtonElement") || target.disabled) {
            return false;
        }
        if (typeof window !== "undefined" && typeof window.PointerEvent === "function") {
            target.dispatchEvent(new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
                button: 0,
            }));
            target.dispatchEvent(new PointerEvent("pointerup", {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
                button: 0,
            }));
            return true;
        }
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        return true;
    };

    const clickMainControlButton = (id) => {
        const button = document.getElementById(id);
        if (!isDomInstance(button, "HTMLButtonElement")) {
            return false;
        }
        if (button.disabled || button.getAttribute("aria-disabled") === "true") {
            return false;
        }
        if (REPEAT_PRESS_BUTTON_IDS.has(id)) {
            return dispatchSyntheticPress(button);
        }
        button.click();
        return true;
    };

    const onComposerTransportPlayClick = () => {
        clickMainControlButton("animate");
    };

    const seekComposerTimelineBy = (deltaMs) => {
        const timelineState = this.readMainTimelineState();
        if (!timelineState) {
            return;
        }
        const bounded = this.resolveComposerTransportStepTimeMs(timelineState, deltaMs);
        this.seekMainTimelineTime(bounded, true);
    };

    const onComposerTransportMinusSecondClick = () => {
        seekComposerTimelineBy(-1000);
    };

    const onComposerTransportMinusMinuteClick = () => {
        seekComposerTimelineBy(-60000);
    };

    const onComposerTransportPlusMinuteClick = () => {
        seekComposerTimelineBy(60000);
    };

    const onComposerTransportPlusSecondClick = () => {
        seekComposerTimelineBy(1000);
    };

    const onComposerTransportSlowerClick = () => {
        clickMainControlButton("slower");
    };

    const onComposerTransportSpeedClick = () => {
        clickMainControlButton("realtime");
    };

    const onComposerTransportFasterClick = () => {
        clickMainControlButton("faster");
    };

    const onComposerViewportWheel = (event) => {
        if (!isDomEventInstance(event, "WheelEvent")) {
            return;
        }
        event.preventDefault();
        activateComposerForControl();
        if (panelState.autoFovEnabled) {
            panelState.autoFovEnabled = false;
            syncAutoToggleUi();
        }
        // Optical zoom only: Frame and Shoot is always anchored at the craft.
        const zoomScale = Math.exp(event.deltaY * COMPOSER_WHEEL_ZOOM_SENSITIVITY);
        const nextFov = this.THREE.MathUtils.clamp(
            panelState.camera.fov * zoomScale,
            AUTO_FOV_MIN_DEGREES,
            AUTO_FOV_MAX_DEGREES,
        );
        this.setPanelFov(panelState, nextFov);
        this.requestRender?.();
        this.queuePersistPanelState();
    };

    const onComposerViewportPointerDown = (event) => {
        if (event.button !== 0) {
            return;
        }
        if (isDomElement(event.target) && event.target.closest(".aux-camera-view__composer-roll-dial")) {
            return;
        }
        if (isDomElement(event.target) && event.target.closest(".aux-camera-view__composer-controls-toggle")) {
            return;
        }
        if (
            isDomElement(event.target) &&
            event.target.closest(".aux-camera-view__composer-feature-stack, .aux-camera-view__composer-feature-stack-restore")
        ) {
            return;
        }
        if (isDomElement(event.target) && event.target.closest(
            ".aux-camera-view__composer-sky-controls, .aux-camera-view__composer-sky-timeline",
        )) {
            return;
        }
        if (!panelState.composerInteractionEnabled) {
            this.activateComposerWindow(panelState, { finalize: true });
            event.preventDefault();
            return;
        }
        if ((panelState.composerLockTarget || "none") !== "none") {
            panelState.composerLockedViewportPointer = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                hinted: false,
            };
            panelState.viewport.setPointerCapture(event.pointerId);
            event.preventDefault();
            return;
        }
        panelState.composerViewportPointer = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
        };
        this.setComposerOrientationReference(panelState, "world");
        panelState.viewport.setPointerCapture(event.pointerId);
        event.preventDefault();
    };

    const onComposerViewportPointerMove = (event) => {
        panelState.composerLunarCraterPointer = {
            clientX: event.clientX,
            clientY: event.clientY,
        };
        const drag = panelState.composerViewportPointer;
        const lockedPointer = panelState.composerLockedViewportPointer;
        if (lockedPointer?.pointerId === event.pointerId) {
            const dxLocked = event.clientX - lockedPointer.clientX;
            const dyLocked = event.clientY - lockedPointer.clientY;
            if (!lockedPointer.hinted && Math.hypot(dxLocked, dyLocked) >= 6) {
                lockedPointer.hinted = true;
                this.showComposerHint(panelState, "Switch to Free to change perspective.");
            }
            event.preventDefault();
            return;
        }
        if (!drag || drag.pointerId !== event.pointerId) {
            if (shouldRenderComposerLunarCraterHover(panelState.composerLunarCraterState)) {
                this.requestRender?.();
            }
            return;
        }
        const dx = event.clientX - drag.clientX;
        const dy = event.clientY - drag.clientY;
        drag.clientX = event.clientX;
        drag.clientY = event.clientY;
        const look = this.tmpVectorE.copy(this.getComposerLookDirection(panelState));
        const up = this.tmpVectorF.copy(this.getComposerCameraUp(panelState, look));
        const dragSensitivity = COMPOSER_DRAG_SENSITIVITY *
            computeComposerDragSensitivityScale(panelState.camera?.fov);
        const yawAngle = dx * dragSensitivity;
        this.tmpQuatA.setFromAxisAngle(up, yawAngle);
        look.applyQuaternion(this.tmpQuatA);
        up.applyQuaternion(this.tmpQuatA);

        const right = this.tmpVectorD.copy(look).cross(up);
        if (right.lengthSq() > 1e-12) {
            right.normalize();
            const pitchAngle = dy * dragSensitivity;
            this.tmpQuatB.setFromAxisAngle(right, pitchAngle);
            look.applyQuaternion(this.tmpQuatB);
            up.applyQuaternion(this.tmpQuatB);
        }
        this.setComposerOrientationFromLookUp(panelState, look, up);
        syncComposerRollUi();
        this.requestRender?.();
        event.preventDefault();
    };

    const onComposerViewportPointerLeave = () => {
        panelState.composerLunarCraterPointer = null;
        if (shouldRenderComposerLunarCraterHover(panelState.composerLunarCraterState)) {
            this.requestRender?.();
        }
    };

    const releaseComposerViewport = (event) => {
        const lockedPointer = panelState.composerLockedViewportPointer;
        if (lockedPointer?.pointerId === event.pointerId) {
            if (panelState.viewport.hasPointerCapture(event.pointerId)) {
                panelState.viewport.releasePointerCapture(event.pointerId);
            }
            panelState.composerLockedViewportPointer = null;
            event.preventDefault();
            return;
        }
        const drag = panelState.composerViewportPointer;
        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }
        if (panelState.viewport.hasPointerCapture(event.pointerId)) {
            panelState.viewport.releasePointerCapture(event.pointerId);
        }
        panelState.composerViewportPointer = null;
        this.requestRender?.();
    };

    const onComposerPanelGatePointerDown = (event) => {
        if (panelState.composerInteractionEnabled) {
            return;
        }
        if (!isDomElement(event.target)) {
            return;
        }
        if (event.target.closest(".lunar-crater-controls-panel, .surface-points-controls-panel")) {
            return;
        }
        if (event.target.closest(".aux-camera-view__composer-button, .aux-camera-view__composer-pill")) {
            return;
        }
        if (event.target.closest(".aux-camera-view__header")) {
            return;
        }
        if (event.target.closest(".aux-camera-view__resize-grip")) {
            return;
        }
        const jumped = this.activateComposerWindow(panelState, { finalize: true });
        if (jumped) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    const stopComposerOverlayPanelEvent = (event) => {
        event.stopPropagation?.();
    };

    return {
        onComposerLookFreeClick,
        onComposerLookEarthClick,
        onComposerLookMoonClick,
        onComposerResetClick,
        onComposerEarthAmbientInput,
        onComposerMoonAmbientInput,
        onComposerEarthshineInput,
        onComposerMoonshineInput,
        onComposerMoonOutlineToggle,
        onComposerSeeThroughToggle,
        onComposerOpticsPhysicalClick,
        onComposerOpticsCameraClick,
        onComposerExposureInput,
        onComposerAutoExposureChange,
        onComposerOpticsStrengthInput,
        onComposerOpticsHaloInput,
        onComposerOpticsStarburstInput,
        onComposerOpticsFlareInput,
        onComposerEclipseCoronaIntensityInput,
        onComposerEclipseCoronaMotionInput,
        onComposerEclipseCoronaStructureInput,
        onComposerEclipseZodiacalDustInput,
        onComposerStarMagnitudeInput,
        onComposerTranscriptWindowInput,
        onComposerTranscriptHoldInput,
        onComposerTranscriptSyncedChange,
        onComposerTranscriptPrevClick,
        onComposerTranscriptNextClick,
        onComposerLunarFeatureStackCloseClick,
        onComposerLunarFeatureStackRestoreClick,
        onComposerLunarFeatureStackPointerDown,
        onComposerLunarFeatureStackPointerMove,
        releaseComposerLunarFeatureStack,
        onComposerInfoOverlayToggle,
        onComposerTimelineInput,
        onComposerTimelinePointerDown,
        onComposerTimelinePointerUp,
        onComposerPhasePrevClick,
        onComposerPhaseNextClick,
        onComposerTimelinePopupDocumentPointerDown,
        onComposerTransportPlayClick,
        onComposerTransportMinusSecondClick,
        onComposerTransportMinusMinuteClick,
        onComposerTransportPlusMinuteClick,
        onComposerTransportPlusSecondClick,
        onComposerTransportSlowerClick,
        onComposerTransportSpeedClick,
        onComposerTransportFasterClick,
        onComposerViewportWheel,
        onComposerViewportPointerDown,
        onComposerViewportPointerMove,
        onComposerViewportPointerLeave,
        releaseComposerViewport,
        onComposerPanelGatePointerDown,
        stopComposerOverlayPanelEvent,
    };
}
