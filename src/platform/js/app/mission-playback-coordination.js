import { resolveMissionCraft } from "../core/domain/mission-config.js";
import { createTimelineDockController } from "./timeline-dock-controller.js";
import {
    getSceneActiveCraftId,
    getSceneVisibleCraftIds,
} from "./scene-craft-helpers.js";
import { buildEventHoverText } from "./burn-event-metadata.js";
import {
    resolveTimelineEventHoverText,
    resolveTimelineMissionLabel,
} from "./comparison-timeline.js";

function resolveCraftLabel(craft, bodyId) {
    return (
        craft?.viewLabel ||
        craft?.name ||
        craft?.mnemonic ||
        craft?.id ||
        bodyId
    );
}

function resolveCraftInfo(globalConfig, bodyId, isActive) {
    const craft = resolveMissionCraft(globalConfig, bodyId);
    return {
        id: bodyId,
        label: resolveCraftLabel(craft, bodyId),
        roleLabel: craft?.primary ? "Primary" : "Additional",
        color: craft?.orbitcolor || craft?.color || null,
        active: isActive,
    };
}

function buildTimelineDockState({
    scene,
    globalConfig,
    startTime,
    latestEndTime,
    animTime,
    eventInfos,
    mediaMarkers = [],
    defaultStepMs,
    maxTimelineStepMs,
    compareMode = false,
}) {
    const stepDurationMs = Math.max(
        1,
        Math.round(scene?.stepDurationInMilliSeconds || defaultStepMs),
    );
    const dockStartTime = Number.isFinite(startTime) ? startTime : 0;
    const rawDockEndTime = Number.isFinite(latestEndTime)
        ? latestEndTime
        : dockStartTime;
    const dockEndTime = Math.max(dockStartTime, rawDockEndTime);
    const visibleCraftIds = getSceneVisibleCraftIds(scene, globalConfig);
    const activeCraftId = getSceneActiveCraftId(scene, globalConfig);

    return {
        range: {
            startTimeMs: dockStartTime,
            endTimeMs: dockEndTime,
            stepMs: Math.min(stepDurationMs, maxTimelineStepMs),
        },
        currentTime: animTime,
        events: eventInfos || [],
        mediaMarkers: mediaMarkers || [],
        presentation: compareMode
            ? {
                compareMode: true,
                label: "Comparison Time",
                detail: "Fictional / relative",
                title: `Comparing ${resolveTimelineMissionLabel({
                    missionShortLabel: globalConfig?.mission_name_short,
                    missionName: globalConfig?.mission_name,
                    fallback: "Primary",
                })} and ${resolveTimelineMissionLabel({
                    missionShortLabel: globalConfig?.comparisonOverlay?.missionShortLabel,
                    missionName: globalConfig?.comparisonOverlay?.missionName,
                    fallback: "Comparison",
                })} with preserved mission pacing on a shared elapsed-time timeline.`,
            }
            : {
                compareMode: false,
                label: "",
                detail: "",
                title: "",
            },
        crafts: Array.isArray(visibleCraftIds)
            ? visibleCraftIds.map((bodyId) =>
                resolveCraftInfo(globalConfig, bodyId, bodyId === activeCraftId),
            )
            : [],
    };
}

function buildActiveCraftControlState({
    globalConfig,
    scene,
}) {
    const missionCraftCount = Array.isArray(globalConfig?.crafts)
        ? globalConfig.crafts.length
        : 1;
    const hasAdditionalCrafts = missionCraftCount > 1;
    const hasDescentOrbit = !!(globalConfig?.landing?.enabled);

    if (!hasAdditionalCrafts) {
        return {
            showAdditionalCraftOption: false,
            showDescentOrbitOption: hasDescentOrbit,
            clearAdditionalCraftToggle: true,
            additionalCraftsEnabled: false,
            showSelectorRow: false,
            options: [],
            optionSignature: "",
            activeCraftId: "",
        };
    }

    const visibleCraftIds = getSceneVisibleCraftIds(scene, globalConfig);
    const activeCraftId = getSceneActiveCraftId(scene, globalConfig);
    if (!Array.isArray(visibleCraftIds) || visibleCraftIds.length <= 1) {
        return {
            showAdditionalCraftOption: true,
            showDescentOrbitOption: hasDescentOrbit,
            clearAdditionalCraftToggle: false,
            additionalCraftsEnabled: false,
            showSelectorRow: false,
            options: [],
            optionSignature: "",
            activeCraftId: activeCraftId || "",
        };
    }

    const options = visibleCraftIds.map((bodyId) => {
        const craft = resolveMissionCraft(globalConfig, bodyId);
        return {
            value: bodyId,
            label: resolveCraftLabel(craft, bodyId),
        };
    });

    return {
        showAdditionalCraftOption: true,
        showDescentOrbitOption: hasDescentOrbit,
        clearAdditionalCraftToggle: false,
        additionalCraftsEnabled: true,
        showSelectorRow: true,
        options,
        optionSignature: options
            .map((option) => `${option.value}:${option.label}`)
            .join("|"),
        activeCraftId: activeCraftId || "",
    };
}

const SPEED_RATE_LABELS = new Map([
    [60, "1 min/sec"],
    [300, "5 min/sec"],
    [900, "15 min/sec"],
    [1800, "30 min/sec"],
    [3600, "1 hr/sec"],
    [10800, "3 hr/sec"],
    [21600, "6 hr/sec"],
    [43200, "12 hr/sec"],
    [86400, "1 day/sec"],
]);

function formatSimRateLabel(multiplier, isRealtime) {
    if (isRealtime) return "1 sec/sec";
    const value = Number(multiplier);
    if (!Number.isFinite(value) || value <= 0) return "1 min/sec";
    const rounded = Math.round(value);
    if (SPEED_RATE_LABELS.has(rounded)) return SPEED_RATE_LABELS.get(rounded);
    const minutesPerSecond = value / 60;
    if (minutesPerSecond >= 60) {
        const hoursPerSecond = minutesPerSecond / 60;
        if (hoursPerSecond >= 24) {
            return `${(hoursPerSecond / 24).toFixed(2).replace(/\.00$/, "")} day/sec`;
        }
        return `${hoursPerSecond.toFixed(2).replace(/\.00$/, "")} hr/sec`;
    }
    return `${minutesPerSecond.toFixed(2).replace(/\.00$/, "")} min/sec`;
}

function toggleClass(element, className, enabled) {
    if (!element?.classList) return;
    if (typeof element.classList.toggle === "function") {
        element.classList.toggle(className, enabled);
        return;
    }
    if (enabled) {
        element.classList.add?.(className);
        return;
    }
    element.classList.remove?.(className);
}

function createAnimationControllerCallbacks({
    runtimeSessionState,
    bridgeActions,
    syncTimelineDock,
    syncActiveCraftControl,
    updateD3ElementText,
    updateTransportControlsUI,
    dispatchAnimationPlayStateUpdated,
    getSetView,
    updateSpeedControlsUI,
    dispatchMissionTimelineUserSeek = () => {},
    eventBus,
}) {
    return {
        onTimeChange: (time, metadata = {}) => {
            runtimeSessionState.setAnimTime(time);
            bridgeActions.setLocation();
            syncTimelineDock();
            syncActiveCraftControl();
            eventBus.emit("animation:timeChanged", { time });
            if (metadata?.seekEvent === true) {
                dispatchMissionTimelineUserSeek({
                    phase: metadata.phase || "commit",
                    source: metadata.source || "animation-controller",
                    commit: metadata.commit !== false,
                    timeMs: time,
                });
            }
        },
        onPlayStateChange: (isPlaying) => {
            runtimeSessionState.setAnimationRunning(isPlaying);
            updateD3ElementText("#animate", isPlaying ? "⏸" : "▶");
            updateTransportControlsUI(isPlaying);
            dispatchAnimationPlayStateUpdated(isPlaying);
            getSetView()?.();
            eventBus.emit(isPlaying ? "animation:play" : "animation:pause", { isPlaying });
        },
        onSpeedChange: (multiplier, isRealtime) => {
            updateSpeedControlsUI(multiplier, isRealtime);
            eventBus.emit("animation:speedChanged", { multiplier, isRealtime });
        },
    };
}

function createMissionPlaybackUiShell({
    documentRef,
    CustomEventClass,
    createTimelineDockControllerImpl = createTimelineDockController,
    buildEventHoverTextImpl = buildEventHoverText,
    getAnimationController,
    getSetView,
    getAnimationScenes,
    getConfig,
    getGlobalConfig,
    getStartTime,
    getLatestEndTime,
    getAnimTime,
    getEventInfos,
    getTimelineEventInfos = getEventInfos,
    getTimelineMediaMarkers = () => [],
    getIsCompareMode = () => false,
    syncTimelineEventButtons,
    defaultStepMs,
    maxTimelineStepMs,
    updateEventInfo,
    clearEventInfo,
}) {
    let timelineDockController = null;
    let lastTimelineEventsRef = null;
    let orbitMilestoneSelectBound = false;

    function ensureTimelineDockController() {
        if (timelineDockController) return timelineDockController;
        timelineDockController = createTimelineDockControllerImpl({
            onSeekTime: (timeMs) => {
                getAnimationController()?.setTime(timeMs);
            },
            onMarkerHover: (eventInfo) => {
                const hoverText = resolveTimelineEventHoverText(
                    eventInfo,
                    buildEventHoverTextImpl,
                );
                if (hoverText) {
                    updateEventInfo(hoverText);
                }
            },
            onMarkerSelect: () => {
                getAnimationController()?.pause?.();
            },
            onMarkerLeave: () => {
                clearEventInfo();
            },
            onCraftSelect: (craftId) => {
                const viewToggle = documentRef?.getElementById?.("view-additional-crafts");
                const craftSelect = documentRef?.getElementById?.("active-craft-select");
                if (viewToggle) {
                    viewToggle.checked = true;
                }
                if (craftSelect) {
                    craftSelect.value = craftId;
                }
                getSetView()?.();
            },
        });
        timelineDockController.bind();
        return timelineDockController;
    }

    function syncTimelineDock() {
        if (!timelineDockController) return;

        const state = buildTimelineDockState({
            scene: getAnimationScenes()[getConfig()],
            globalConfig: getGlobalConfig(),
            startTime: getStartTime(),
            latestEndTime: getLatestEndTime(),
            animTime: getAnimTime(),
            eventInfos: getTimelineEventInfos(),
            mediaMarkers: getTimelineMediaMarkers(),
            defaultStepMs,
            maxTimelineStepMs,
            compareMode: typeof getIsCompareMode === "function" && getIsCompareMode(),
        });

        timelineDockController.setMode(state.presentation);
        timelineDockController.setRange(state.range);
        timelineDockController.setCurrentTime(state.currentTime);

        if (state.events !== lastTimelineEventsRef) {
            timelineDockController.setEvents(state.events);
            syncTimelineEventButtons?.(state.events);
            lastTimelineEventsRef = state.events;
        }

        timelineDockController.setMediaMarkers?.(state.mediaMarkers);

        timelineDockController.setCrafts(state.crafts);
    }

    function syncActiveCraftControl() {
        const additionalCraftOption = documentRef?.getElementById?.("additional-crafts-option");
        const additionalCraftToggle = documentRef?.getElementById?.("view-additional-crafts");
        const descentOrbitOption = documentRef?.getElementById?.("orbit-descent-option");
        const row = documentRef?.getElementById?.("active-craft-row");
        const select = documentRef?.getElementById?.("active-craft-select");
        if (!row || !select) return;

        const state = buildActiveCraftControlState({
            globalConfig: getGlobalConfig(),
            scene: getAnimationScenes()[getConfig()],
        });

        toggleClass(
            additionalCraftOption,
            "settings-option--hidden",
            !state.showAdditionalCraftOption,
        );
        if (additionalCraftToggle) {
            additionalCraftToggle.checked = state.additionalCraftsEnabled;
        }
        toggleClass(
            descentOrbitOption,
            "settings-option--hidden",
            !state.showDescentOrbitOption,
        );

        if (!state.showSelectorRow) {
            row.classList.add("settings-row--hidden");
            select.innerHTML = "";
            return;
        }

        row.classList.remove("settings-row--hidden");
        const dataset = select.dataset || (select.dataset = {});
        if (dataset.optionSignature !== state.optionSignature) {
            select.innerHTML = "";
            for (const optionInfo of state.options) {
                const option = documentRef.createElement("option");
                option.value = optionInfo.value;
                option.textContent = optionInfo.label;
                select.appendChild(option);
            }
            dataset.optionSignature = state.optionSignature;
        }

        if (state.activeCraftId) {
            select.value = state.activeCraftId;
        }
    }

    function updateSpeedControlsUI(multiplier, isRealtime) {
        const slowerButton = documentRef?.getElementById?.("slower");
        const realtimeButton = documentRef?.getElementById?.("realtime");
        const fasterButton = documentRef?.getElementById?.("faster");
        const label = formatSimRateLabel(multiplier, isRealtime);
        const numericMultiplier = Number(multiplier || 0);
        const atMaxSpeed = !isRealtime && Math.abs(numericMultiplier - 86400) < 1e-3;

        if (realtimeButton) {
            const buttonLabel = isRealtime
                ? "Realtime active (1 sec/sec)."
                : `Current speed ${label}. Click to set realtime (1 sec/sec).`;
            realtimeButton.textContent = label;
            realtimeButton.title = buttonLabel;
            realtimeButton.setAttribute("aria-label", buttonLabel);
            toggleClass(realtimeButton, "down", !!isRealtime);
            realtimeButton.setAttribute("aria-pressed", isRealtime ? "true" : "false");
        }

        if (slowerButton) {
            slowerButton.disabled = !!isRealtime;
            slowerButton.setAttribute("aria-disabled", isRealtime ? "true" : "false");
        }

        if (fasterButton) {
            fasterButton.disabled = atMaxSpeed;
            fasterButton.setAttribute("aria-disabled", atMaxSpeed ? "true" : "false");
        }
    }

    function updateTransportControlsUI(isPlaying) {
        const transportCluster = documentRef?.querySelector?.(".controls-cluster--transport");
        if (!transportCluster) return;
        toggleClass(transportCluster, "is-playing", !!isPlaying);
    }

    function dispatchAnimationPlayStateUpdated(isPlaying) {
        if (!documentRef?.dispatchEvent || !CustomEventClass) return;
        documentRef.dispatchEvent(new CustomEventClass("animation-play-state-updated", {
            detail: {
                isPlaying: isPlaying === true,
            },
        }));
    }

    function dispatchMissionTimelineUserSeek({
        phase = "commit",
        source = "animation-controller",
        commit = true,
        timeMs = Number.NaN,
    } = {}) {
        if (!documentRef?.dispatchEvent || !CustomEventClass || !Number.isFinite(timeMs)) return;
        documentRef.dispatchEvent(new CustomEventClass("mission-timeline-user-seek", {
            detail: {
                phase,
                source,
                commit: commit === true,
                timeMs,
            },
        }));
    }

    function bindOrbitMilestoneSelection() {
        if (orbitMilestoneSelectBound || !documentRef?.addEventListener) return;
        orbitMilestoneSelectBound = true;
        documentRef.addEventListener("mission-orbit-milestone-select", (event) => {
            const timeMs = Number(event?.detail?.eventTimeMs);
            if (!Number.isFinite(timeMs)) return;
            getAnimationController()?.setTime(timeMs);
            getAnimationController()?.pause?.();
            dispatchMissionTimelineUserSeek({
                phase: "commit",
                source: event?.detail?.source || "orbit-milestone",
                commit: true,
                timeMs,
            });
        });
    }

    function syncPlaybackStartup({
        isRunning,
        speedMultiplier,
        isRealtimeSpeed,
        goToNow,
    }) {
        updateTransportControlsUI(isRunning);
        dispatchAnimationPlayStateUpdated(isRunning);
        updateSpeedControlsUI(speedMultiplier, isRealtimeSpeed);

        const nowButton = documentRef?.getElementById?.("missionnow");
        if (nowButton && nowButton.dataset?.bound !== "true") {
            nowButton.dataset.bound = "true";
            nowButton.addEventListener("click", () => {
                goToNow();
            });
        }

        ensureTimelineDockController();
        bindOrbitMilestoneSelection();
        syncTimelineDock();
        syncActiveCraftControl();
    }

    return {
        ensureTimelineDockController,
        syncTimelineDock,
        syncActiveCraftControl,
        updateSpeedControlsUI,
        updateTransportControlsUI,
        dispatchAnimationPlayStateUpdated,
        dispatchMissionTimelineUserSeek,
        syncPlaybackStartup,
    };
}

export {
    buildActiveCraftControlState,
    buildTimelineDockState,
    createAnimationControllerCallbacks,
    createMissionPlaybackUiShell,
    formatSimRateLabel,
};
