import * as shared from "./auxiliary-camera-shared.js";

const {
    COMPOSER_MAX_PITCH_RAD,
    COMPOSER_TIMELINE_RESOLUTION,
    asTrimmedString,
    isDomInstance,
    loadLunarFeatureMentionTimeline,
    resolveActiveTimelinePhaseIndex,
    resolveLunarFeatureMentionView,
    resolveLunarFlybyTimeMs,
    resolveTimelineEventHighlightState,
    timelinePhaseContainsTime,
} = shared;

export const composerTimelineMethods = {
    activateComposerWindow(panelState, { finalize = true } = {}) {
        if (!panelState || panelState.mode !== "composer") {
            return false;
        }
        const startMs = panelState.composerTimelineStartMs;
        const endMs = panelState.composerTimelineEndMs;
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
            return false;
        }
        const targetMs = startMs + ((endMs - startMs) * 0.5);
        this.seekMainTimelineTime(targetMs, finalize);
        return true;
    },
    readMainTimelineState() {
        const slider = document.getElementById("timeline-slider");
        if (!isDomInstance(slider, "HTMLInputElement")) {
            return null;
        }
        const sliderMin = Number(slider.min);
        const sliderMax = Number(slider.max);
        const rangeMin = Number(slider.dataset?.rangeMinMs);
        const rangeMax = Number(slider.dataset?.rangeMaxMs);
        const min = Number.isFinite(rangeMin) ? rangeMin : sliderMin;
        const max = Number.isFinite(rangeMax) ? rangeMax : sliderMax;
        const preciseValue = Number(slider.dataset?.currentTimeMs);
        const value = Number.isFinite(preciseValue) ? preciseValue : Number(slider.value);
        const step = Number(slider.step);
        if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value)) {
            return null;
        }
        return {
            slider,
            min: Math.min(min, max),
            max: Math.max(min, max),
            value: this.THREE.MathUtils.clamp(value, Math.min(min, max), Math.max(min, max)),
            stepMs: Number.isFinite(step) && step > 0 ? step : 1,
        };
    },
    resolveComposerTransportStepTimeMs(timelineState, deltaMs) {
        if (!timelineState) {
            return Number.NaN;
        }
        const min = Number(timelineState.min);
        const max = Number(timelineState.max);
        const value = Number(timelineState.value);
        const delta = Number(deltaMs);
        if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || !Number.isFinite(delta)) {
            return Number.NaN;
        }
        return this.THREE.MathUtils.clamp(
            value + delta,
            Math.min(min, max),
            Math.max(min, max),
        );
    },
    seekMainTimelineTime(timeMs, finalize = false) {
        const timelineState = this.readMainTimelineState();
        if (!timelineState) {
            return;
        }
        const clamped = this.THREE.MathUtils.clamp(timeMs, timelineState.min, timelineState.max);
        const visibleMin = Number(timelineState.slider.min);
        const visibleMax = Number(timelineState.slider.max);
        timelineState.slider.value = Number.isFinite(visibleMin) && Number.isFinite(visibleMax)
            ? String(this.THREE.MathUtils.clamp(clamped, Math.min(visibleMin, visibleMax), Math.max(visibleMin, visibleMax)))
            : String(clamped);
        const dataset = timelineState.slider.dataset || (timelineState.slider.dataset = {});
        dataset.currentTimeMs = String(clamped);
        dataset.programmaticSeekSource = "frame-shoot";
        dataset.programmaticSeekTimeMs = String(clamped);
        timelineState.slider.dispatchEvent(new Event("input", { bubbles: true }));
        if (finalize) {
            dataset.programmaticSeekSource = "frame-shoot";
            dataset.programmaticSeekTimeMs = String(clamped);
            timelineState.slider.dispatchEvent(new Event("change", { bubbles: true }));
        }
    },
    formatComposerWindowLabel(windowMs) {
        const safeMs = Math.max(0, windowMs);
        const totalMinutes = Math.round(safeMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours <= 0) {
            return `+/-${Math.max(1, minutes)}m`;
        }
        if (minutes <= 0) {
            return `+/-${hours}h`;
        }
        return `+/-${hours}h ${minutes}m`;
    },
    formatLocalDateTime(timeMs) {
        if (!Number.isFinite(timeMs)) {
            return "--";
        }
        try {
            const datePart = new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "2-digit",
            }).format(timeMs);
            const timePart = new Intl.DateTimeFormat(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
                timeZoneName: "short",
            }).format(timeMs);
            return `${datePart} ${timePart}`;
        } catch {
            return new Date(timeMs).toLocaleString();
        }
    },
    setComposerTimelineLocalText(panelState, timeMs) {
        const localValue = panelState?.composerTimelineLocalValue;
        if (!localValue) {
            return;
        }
        localValue.textContent = `Local: ${this.formatLocalDateTime(timeMs)}`;
    },
    syncComposerTransportUi(panelState, timelineState = null) {
        const playButton = panelState?.composerTransportPlayButton;
        const minusMinuteButton = panelState?.composerTransportMinusMinuteButton;
        const plusMinuteButton = panelState?.composerTransportPlusMinuteButton;
        const slowerButton = panelState?.composerTransportSlowerButton;
        const speedButton = panelState?.composerTransportSpeedButton;
        const fasterButton = panelState?.composerTransportFasterButton;
        if (!playButton || !minusMinuteButton || !plusMinuteButton || !slowerButton || !speedButton || !fasterButton) {
            return;
        }

        const mainPlayButton = document.getElementById("animate");
        if (isDomInstance(mainPlayButton, "HTMLButtonElement")) {
            playButton.textContent = mainPlayButton.textContent || "▶";
            playButton.disabled = mainPlayButton.disabled || mainPlayButton.getAttribute("aria-disabled") === "true";
            const mainPlayTitle = mainPlayButton.getAttribute("title");
            if (mainPlayTitle) {
                playButton.setAttribute("title", mainPlayTitle);
            }
        } else {
            playButton.textContent = "▶";
            playButton.disabled = true;
        }

        const mainSlowerButton = document.getElementById("slower");
        if (isDomInstance(mainSlowerButton, "HTMLButtonElement")) {
            slowerButton.disabled =
                mainSlowerButton.disabled || mainSlowerButton.getAttribute("aria-disabled") === "true";
        } else {
            slowerButton.disabled = true;
        }

        const mainSpeedButton = document.getElementById("realtime");
        if (isDomInstance(mainSpeedButton, "HTMLButtonElement")) {
            speedButton.textContent = (mainSpeedButton.textContent || "1 sec/sec").trim();
            speedButton.disabled =
                mainSpeedButton.disabled || mainSpeedButton.getAttribute("aria-disabled") === "true";
            const mainSpeedTitle = mainSpeedButton.getAttribute("title");
            if (mainSpeedTitle) {
                speedButton.setAttribute("title", mainSpeedTitle);
            }
        } else {
            speedButton.textContent = "1 sec/sec";
            speedButton.disabled = true;
        }

        const mainFasterButton = document.getElementById("faster");
        if (isDomInstance(mainFasterButton, "HTMLButtonElement")) {
            fasterButton.disabled =
                mainFasterButton.disabled || mainFasterButton.getAttribute("aria-disabled") === "true";
        } else {
            fasterButton.disabled = true;
        }

        const activeTimelineState = timelineState || this.readMainTimelineState();
        if (!activeTimelineState) {
            minusMinuteButton.disabled = true;
            plusMinuteButton.disabled = true;
            return;
        }
        minusMinuteButton.disabled = activeTimelineState.value <= activeTimelineState.min;
        plusMinuteButton.disabled = activeTimelineState.value >= activeTimelineState.max;
    },
    selectComposerTimelinePhase(panelState, phaseIndex) {
        const phases = Array.isArray(this.composerTimelinePhases) ? this.composerTimelinePhases : [];
        const boundedPhaseIndex = Math.max(0, Math.min(phases.length - 1, Number(phaseIndex)));
        const phase = phases[boundedPhaseIndex];
        if (!phase || !Number.isFinite(phase.startMs)) {
            return false;
        }
        const timelineState = this.readMainTimelineState();
        const targetMs = this.resolveComposerPhaseSeekTimeMs({
            phase,
            timelineMinMs: timelineState?.min,
            timelineMaxMs: timelineState?.max,
            stepMs: timelineState?.stepMs,
        });
        this.applyComposerGuidedViewState(panelState, {
            syncComposerLockUi: panelState.syncComposerLockUi,
            syncAutoToggleUi: panelState.syncComposerAutoToggleUi,
            persist: false,
            requestRender: false,
        });
        this.composerActivePhaseIndex = boundedPhaseIndex;
        this.composerSelectedPhaseIndex = boundedPhaseIndex;
        this.seekMainTimelineTime(Number.isFinite(targetMs) ? targetMs : phase.startMs, true);
        this.syncComposerTimelineUi(panelState, { preferredPhaseIndex: boundedPhaseIndex });
        if (panelState.composerPhaseDetails) {
            panelState.composerPhaseDetails.open = false;
        }
        this.requestRender?.();
        return true;
    },
    resolveComposerPhaseSeekTimeMs({
        phase,
        timelineMinMs,
        timelineMaxMs,
        stepMs = 1,
    }) {
        const startMs = Number(phase?.startMs);
        const endMs = Number(phase?.endMs);
        const minMs = Number(timelineMinMs);
        const maxMs = Number(timelineMaxMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
            return Number.NaN;
        }
        if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs < minMs) {
            return startMs;
        }

        const clampedStart = Math.min(Math.max(startMs, minMs), maxMs);
        const clampedEnd = Math.min(Math.max(endMs, minMs), maxMs);
        if (clampedEnd <= clampedStart) {
            return clampedStart;
        }

        const safeStepMs = Number.isFinite(Number(stepMs)) && Number(stepMs) > 0
            ? Number(stepMs)
            : 1;
        const inwardMs = Math.max(1, Math.min(1000, safeStepMs * 0.5));
        const lowerBound = Math.min(clampedEnd - 1, clampedStart + inwardMs);
        const upperBound = Math.max(lowerBound, clampedEnd - inwardMs);
        const midpoint = clampedStart + ((clampedEnd - clampedStart) * 0.5);
        return Math.round(Math.min(Math.max(midpoint, lowerBound), upperBound));
    },
    syncComposerPhaseSelect(panelState, activePhaseIndex) {
        const details = panelState?.composerPhaseDetails;
        const summary = panelState?.composerPhaseSummary;
        const optionsWrap = panelState?.composerPhaseOptionsWrap;
        if (!details || !summary || !optionsWrap) {
            return;
        }
        const phases = Array.isArray(this.composerTimelinePhases) ? this.composerTimelinePhases : [];
        const signature = phases
            .map((phase) => `${phase.id}:${phase.startMs}:${phase.endMs}:${phase.events?.length || 0}`)
            .join("|");
        if (panelState.composerPhaseSelectSignature !== signature) {
            optionsWrap.replaceChildren();
            for (let i = 0; i < phases.length; i += 1) {
                const phase = phases[i];
                const option = document.createElement("button");
                option.type = "button";
                option.className = "aux-camera-view__composer-phase-option";
                option.textContent = phase.label || phase.id || `Phase ${i + 1}`;
                option.setAttribute("aria-label", `Jump timeline to ${option.textContent}`);
                option.addEventListener("click", () => {
                    this.selectComposerTimelinePhase(panelState, i);
                });
                optionsWrap.appendChild(option);
            }
            panelState.composerPhaseSelectSignature = signature;
        }
        const phaseOptions = Array.from(optionsWrap.children || []);
        for (let i = 0; i < phaseOptions.length; i += 1) {
            const isActive = i === activePhaseIndex;
            phaseOptions[i].classList?.toggle("is-active", isActive);
            if (isActive) {
                phaseOptions[i].setAttribute?.("aria-current", "true");
            } else {
                phaseOptions[i].removeAttribute?.("aria-current");
            }
        }
        summary.classList?.toggle("is-disabled", phases.length <= 1);
        summary.setAttribute?.("aria-disabled", phases.length <= 1 ? "true" : "false");
        if (phases.length <= 1) {
            details.open = false;
        }
        if (panelState.composerPhasePrevButton) {
            panelState.composerPhasePrevButton.disabled = phases.length <= 1 || activePhaseIndex <= 0;
        }
        if (panelState.composerPhaseNextButton) {
            panelState.composerPhaseNextButton.disabled = phases.length <= 1 || activePhaseIndex >= phases.length - 1;
        }
        if (activePhaseIndex >= 0 && activePhaseIndex < phases.length) {
            const label = phases[activePhaseIndex].label || phases[activePhaseIndex].id || `Phase ${activePhaseIndex + 1}`;
            summary.textContent = label;
            summary.setAttribute?.("title", label);
        } else {
            summary.textContent = "Phase";
            summary.removeAttribute?.("title");
        }
    },
    selectComposerFlybyEvent(panelState, eventIndex) {
        const flybyEvents = Array.isArray(this.composerFlybyEvents) ? this.composerFlybyEvents : [];
        const boundedIndex = Number(eventIndex);
        if (!Number.isInteger(boundedIndex) || boundedIndex < 0 || boundedIndex >= flybyEvents.length) {
            return false;
        }
        const eventInfo = flybyEvents[boundedIndex];
        if (!Number.isFinite(eventInfo?.timeMs)) {
            return false;
        }
        panelState.composerFlybySelectedEventTimeMs = eventInfo.timeMs;
        if (this.composerActivePhaseIndex >= 0) {
            this.composerSelectedPhaseIndex = this.composerActivePhaseIndex;
        }
        this.applyComposerGuidedViewState(panelState, {
            syncComposerLockUi: panelState.syncComposerLockUi,
            syncAutoToggleUi: panelState.syncComposerAutoToggleUi,
            persist: false,
            requestRender: false,
        });
        this.seekMainTimelineTime(eventInfo.timeMs, true);
        this.syncComposerTimelineUi(panelState, { preferredPhaseIndex: this.composerActivePhaseIndex });
        this.syncComposerFlybyEventPills(panelState, eventInfo.timeMs);
        if (panelState.composerFlybyEventsDetails) {
            panelState.composerFlybyEventsDetails.open = false;
        }
        this.requestRender?.();
        return true;
    },
    syncComposerFlybyEventPills(panelState, currentTimeMs) {
        const wrap = panelState?.composerFlybyEventsWrap;
        if (!wrap) {
            return;
        }
        const flybyEvents = Array.isArray(this.composerFlybyEvents) ? this.composerFlybyEvents : [];
        const signature = flybyEvents.map((eventInfo) => `${eventInfo.key || eventInfo.id || ""}:${eventInfo.timeMs}`).join("|");
        if (panelState.composerFlybyEventsSignature !== signature) {
            wrap.replaceChildren();
            panelState.composerFlybyEventNodes = [];
            panelState.composerFlybyEventsSignature = signature;
            panelState.composerFlybySelectedEventTimeMs = Number.NaN;
            for (let eventIndex = 0; eventIndex < flybyEvents.length; eventIndex += 1) {
                const eventInfo = flybyEvents[eventIndex];
                const pill = document.createElement("button");
                pill.type = "button";
                pill.className = "aux-camera-view__composer-event-pill";
                const eventTitle = eventInfo.title || eventInfo.label || eventInfo.sourceLabel || "Event";
                pill.setAttribute("aria-label", `Jump timeline to ${eventTitle}`);
                const title = document.createElement("span");
                title.className = "aux-camera-view__composer-event-pill-title";
                title.textContent = eventTitle;
                const time = document.createElement("span");
                time.className = "aux-camera-view__composer-event-pill-time";
                time.textContent = this.formatLocalDateTime(eventInfo.timeMs);
                pill.appendChild(title);
                pill.appendChild(time);
                pill.addEventListener("click", () => {
                    this.selectComposerFlybyEvent(panelState, eventIndex);
                });
                wrap.appendChild(pill);
                panelState.composerFlybyEventNodes.push({
                    element: pill,
                    id: eventInfo.key || eventInfo.id || "",
                    timeMs: eventInfo.timeMs,
                    title: eventTitle,
                });
            }
        }
        const eventNodes = Array.isArray(panelState.composerFlybyEventNodes)
            ? panelState.composerFlybyEventNodes
            : [];
        if (eventNodes.length === 0) {
            if (panelState.composerFlybyEventsSummary) {
                panelState.composerFlybyEventsSummary.textContent = "Events";
                panelState.composerFlybyEventsSummary.removeAttribute?.("title");
            }
            return;
        }

        const highlightState = resolveTimelineEventHighlightState({
            events: eventNodes,
            currentTimeMs,
        });
        const currentIndexes = new Set(highlightState.currentIndexes);
        const boundaryIndexes = new Set(highlightState.boundaryIndexes);
        const selectedEventTimeMs = panelState.composerFlybySelectedEventTimeMs;
        let selectedEventIndex = -1;
        if (Number.isFinite(selectedEventTimeMs)) {
            selectedEventIndex = eventNodes.findIndex((eventNode) => eventNode.timeMs === selectedEventTimeMs);
            if (!currentIndexes.has(selectedEventIndex)) {
                panelState.composerFlybySelectedEventTimeMs = Number.NaN;
                selectedEventIndex = -1;
            }
        }
        for (let i = 0; i < eventNodes.length; i += 1) {
            const isCurrent = currentIndexes.has(i);
            eventNodes[i].element.classList.toggle("is-active", isCurrent);
            eventNodes[i].element.classList.toggle("is-boundary", !isCurrent && boundaryIndexes.has(i));
        }
        if (panelState.composerFlybyEventsSummary) {
            const selectedTitle = selectedEventIndex >= 0 ? eventNodes[selectedEventIndex]?.title : "";
            panelState.composerFlybyEventsSummary.textContent = selectedTitle || "Events";
            if (selectedTitle) {
                panelState.composerFlybyEventsSummary.setAttribute?.("title", selectedTitle);
            } else {
                panelState.composerFlybyEventsSummary.removeAttribute?.("title");
            }
        }
    },
    resolveLunarFlybyTimeMs(eventInfos) {
        return resolveLunarFlybyTimeMs(eventInfos);
    },
    setComposerLookFromDirection(panelState, directionVector) {
        const len = directionVector?.length?.() || 0;
        if (!Number.isFinite(len) || len <= 1e-9) {
            return false;
        }
        this.composerLookWorld.copy(directionVector).multiplyScalar(1 / len);
        const planar = Math.hypot(this.composerLookWorld.x, this.composerLookWorld.y);
        panelState.composerYawRad = Math.atan2(this.composerLookWorld.y, this.composerLookWorld.x);
        panelState.composerPitchRad = Math.atan2(this.composerLookWorld.z, Math.max(planar, 1e-9));
        panelState.composerPitchRad = this.THREE.MathUtils.clamp(
            panelState.composerPitchRad,
            -COMPOSER_MAX_PITCH_RAD,
            COMPOSER_MAX_PITCH_RAD,
        );
        return true;
    },
    applyComposerPreset(panelState, presetKey, { craftWorld, earthWorld, moonWorld }) {
        const preset = presetKey === "moon" ? "moon" : "earth";
        const source = preset === "moon" ? moonWorld : earthWorld;
        if (!source || !craftWorld) {
            return false;
        }
        this.tmpVectorA.subVectors(source, craftWorld);
        return this.setComposerLookFromDirection(panelState, this.tmpVectorA);
    },
    syncComposerTimelineUi(panelState, { preferredPhaseIndex = -1 } = {}) {
        const slider = panelState.composerTimelineSlider;
        if (!slider) {
            return;
        }
        const timelineState = this.readMainTimelineState();
        this.syncComposerTransportUi(panelState, timelineState);
        if (!timelineState) {
            panelState.composerTimelineLabel.textContent = "Time unavailable";
            this.setComposerTimelineLocalText(panelState, Number.NaN);
            this.syncComposerPhaseSelect(panelState, -1);
            this.syncComposerFlybyEventPills(panelState, Number.NaN);
            this.setComposerInteractionEnabled(panelState, false);
            return;
        }
        const phases = Array.isArray(this.composerTimelinePhases) ? this.composerTimelinePhases : [];
        if (this.composerSelectedPhaseIndex >= phases.length) {
            this.composerSelectedPhaseIndex = -1;
        }
        if (
            this.composerSelectedPhaseIndex >= 0 &&
            !timelinePhaseContainsTime(phases[this.composerSelectedPhaseIndex], timelineState.value)
        ) {
            this.composerSelectedPhaseIndex = -1;
        }
        const boundedPreferredPhaseIndex = Number.isInteger(preferredPhaseIndex) &&
            preferredPhaseIndex >= 0 &&
            preferredPhaseIndex < phases.length
            ? preferredPhaseIndex
            : -1;
        let activePhaseIndex = boundedPreferredPhaseIndex;
        if (activePhaseIndex < 0 && this.composerSelectedPhaseIndex >= 0) {
            activePhaseIndex = this.composerSelectedPhaseIndex;
        }
        if (activePhaseIndex < 0) {
            activePhaseIndex = resolveActiveTimelinePhaseIndex(phases, timelineState.value);
        }
        if (activePhaseIndex < 0) {
            activePhaseIndex = 0;
        }
        this.composerActivePhaseIndex = activePhaseIndex;
        const activePhase = phases[activePhaseIndex] || null;
        let startMs = activePhase
            ? this.THREE.MathUtils.clamp(activePhase.startMs, timelineState.min, timelineState.max)
            : timelineState.min;
        let endMs = activePhase
            ? this.THREE.MathUtils.clamp(activePhase.endMs, timelineState.min, timelineState.max)
            : timelineState.max;
        if (endMs <= startMs) {
            endMs = Math.min(timelineState.max, startMs + 1);
        }

        panelState.composerTimelineStartMs = startMs;
        panelState.composerTimelineEndMs = endMs;
        this.composerFlybyEvents = Array.isArray(activePhase?.events) ? activePhase.events : [];
        this.syncComposerPhaseSelect(panelState, activePhaseIndex);
        this.setComposerInteractionEnabled(panelState, true);
        panelState.composerTimelineLabel.textContent = "Time";
        this.setComposerTimelineLocalText(panelState, timelineState.value);
        this.syncComposerFlybyEventPills(panelState, timelineState.value);

        if (!panelState.composerTimelineDragging) {
            const ratio = this.THREE.MathUtils.clamp((timelineState.value - startMs) / Math.max(endMs - startMs, 1), 0, 1);
            slider.value = String(Math.round(ratio * COMPOSER_TIMELINE_RESOLUTION));
        }
    },
    ensureLunarFeatureMentionTimeline(missionConfig = null) {
        const dataPath = asTrimmedString(
            missionConfig?.dataPath ||
            globalThis.window?.missionConfig?.dataPath ||
            "",
        );
        if (!dataPath) return;
        if (this.lunarFeatureMentionTimelineDataPath !== dataPath) {
            this.lunarFeatureMentionTimelineDataPath = dataPath;
            this.lunarFeatureMentionTimeline = null;
            this.lunarFeatureMentionTimelinePromise = null;
            this.lunarFeatureMentionTimelineMissing = false;
        }
        if (
            this.lunarFeatureMentionTimeline ||
            this.lunarFeatureMentionTimelinePromise ||
            this.lunarFeatureMentionTimelineMissing === true
        ) {
            return;
        }
        this.lunarFeatureMentionTimelinePromise = loadLunarFeatureMentionTimeline({ dataPath })
            .then((timeline) => {
                this.lunarFeatureMentionTimeline = timeline || null;
                this.lunarFeatureMentionTimelineMissing = !timeline;
                this.requestRender?.();
            })
            .catch((error) => {
                console.warn("Unable to load lunar feature mention timeline", error);
                this.lunarFeatureMentionTimeline = null;
                this.lunarFeatureMentionTimelineMissing = true;
            })
            .finally(() => {
                this.lunarFeatureMentionTimelinePromise = null;
            });
    },
    resolveComposerLunarFeatureMentionView(panelState) {
        if (panelState?.composerLunarFeatureSyncedEnabled === false) return null;
        if (!this.lunarFeatureMentionTimeline) return null;
        const timelineState = this.readMainTimelineState();
        if (!timelineState) return null;
        return resolveLunarFeatureMentionView(this.lunarFeatureMentionTimeline, {
            currentTimeMs: timelineState.value,
            missionStartMs: timelineState.min,
            visibleWindowSeconds: panelState.composerLunarFeatureMentionWindowSeconds,
            activeLeadSeconds: panelState.composerLunarFeatureMentionLeadSeconds,
            activeTrailSeconds: panelState.composerLunarFeatureMentionTrailSeconds,
        });
    },
    jumpComposerTranscriptFeature(panelState, direction = 1) {
        if (!this.lunarFeatureMentionTimeline) return false;
        const timelineState = this.readMainTimelineState();
        if (!timelineState) return false;
        const streamStartMs = Number(this.lunarFeatureMentionTimeline.streamStartMs);
        if (!Number.isFinite(streamStartMs)) return false;
        const currentStreamSeconds = (timelineState.value - streamStartMs) / 1000;
        const mentions = Array.isArray(this.lunarFeatureMentionTimeline.mentions)
            ? this.lunarFeatureMentionTimeline.mentions
            : [];
        const forward = direction >= 0;
        const mention = forward
            ? mentions.find((entry) => entry.timeSeconds > currentStreamSeconds + 0.25)
            : [...mentions].reverse().find((entry) => entry.timeSeconds < currentStreamSeconds - 0.25);
        if (!mention) return false;
        this.seekMainTimelineTime(streamStartMs + (mention.timeSeconds * 1000), true);
        panelState.composerLunarFeatureMentionView = this.resolveComposerLunarFeatureMentionView(panelState);
        this.renderComposerLunarFeatureStack(panelState, panelState.composerLunarFeatureMentionView);
        return true;
    },
    resolveComposerTranscriptFeatureNavigation() {
        if (!this.lunarFeatureMentionTimeline) {
            return { hasPrevious: false, hasNext: false };
        }
        const timelineState = this.readMainTimelineState();
        const streamStartMs = Number(this.lunarFeatureMentionTimeline.streamStartMs);
        if (!timelineState || !Number.isFinite(streamStartMs)) {
            return { hasPrevious: false, hasNext: false };
        }
        const currentStreamSeconds = (timelineState.value - streamStartMs) / 1000;
        const mentions = Array.isArray(this.lunarFeatureMentionTimeline.mentions)
            ? this.lunarFeatureMentionTimeline.mentions
            : [];
        return {
            hasPrevious: mentions.some((entry) => entry.timeSeconds < currentStreamSeconds - 0.25),
            hasNext: mentions.some((entry) => entry.timeSeconds > currentStreamSeconds + 0.25),
        };
    },
    renderComposerLunarFeatureStack(panelState, viewModel) {
        const stack = panelState?.composerLunarFeatureStack;
        const list = panelState?.composerLunarFeatureStackList;
        const restoreButton = panelState?.composerLunarFeatureStackRestoreButton;
        if (!isDomInstance(stack, "HTMLElement") || !isDomInstance(list, "HTMLElement")) {
            return;
        }
        const syncEnabled = panelState?.composerLunarFeatureSyncedEnabled !== false;
        const available = viewModel?.available === true;
        const items = Array.isArray(viewModel?.items) ? viewModel.items : [];
        const dismissed = panelState?.composerLunarFeatureStackDismissed === true;
        stack.hidden = !syncEnabled || !available || dismissed;
        if (isDomInstance(restoreButton, "HTMLElement")) {
            restoreButton.hidden = !syncEnabled || !available || !dismissed;
        }
        const navigationState = this.resolveComposerTranscriptFeatureNavigation();
        if (panelState.composerTranscriptPrevButton) {
            panelState.composerTranscriptPrevButton.disabled = stack.hidden || !navigationState.hasPrevious;
        }
        if (panelState.composerTranscriptNextButton) {
            panelState.composerTranscriptNextButton.disabled = stack.hidden || !navigationState.hasNext;
        }
        if (stack.hidden) {
            list.replaceChildren();
            return;
        }
        if (items.length === 0) {
            const empty = document.createElement("div");
            empty.className = "aux-camera-view__composer-feature-stack-empty";
            empty.textContent = "No features in this window";
            list.replaceChildren(empty);
            return;
        }
        const existing = new Map(
            Array.from(list.children)
                .filter((child) => isDomInstance(child, "HTMLElement"))
                .map((child) => [child.dataset.mentionId || "", child]),
        );
        const rendered = [];
        for (const item of items) {
            const key = item.id || `${item.timeSeconds}`;
            let row = existing.get(key);
            if (!row) {
                row = document.createElement("div");
                row.className = "aux-camera-view__composer-feature-stack-item";
                row.dataset.mentionId = key;
                const time = document.createElement("span");
                time.className = "aux-camera-view__composer-feature-stack-time";
                const name = document.createElement("span");
                name.className = "aux-camera-view__composer-feature-stack-name";
                row.appendChild(time);
                row.appendChild(name);
            }
            row.classList.toggle("is-active", item.active === true);
            row.dataset.active = item.active === true ? "true" : "false";
            const timeNode = row.querySelector(".aux-camera-view__composer-feature-stack-time");
            const nameNode = row.querySelector(".aux-camera-view__composer-feature-stack-name");
            if (timeNode) timeNode.textContent = item.metLabel || "";
            if (nameNode) nameNode.textContent = item.featureLabel || "";
            row.title = [item.speaker, item.summary].filter(Boolean).join(": ");
            rendered.push(row);
        }
        list.replaceChildren(...rendered);
    },
};
