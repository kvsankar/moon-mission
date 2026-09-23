import {
    MOON_RENDER_PIPELINE_PRESETS,
    MOON_RENDER_PIPELINE_STAGE_CONTROLS,
    MOON_PHYSICAL_RENDER_CONTROLS,
    normalizeMoonRenderPipelineState,
    resolveMoonRenderPipelinePresetId,
} from "../app/moon-render-pipeline.js";
import { resolveMoonLightingModelStages } from "../app/moon-lighting-models.js";

const MOON_RENDER_TIER_BUTTONS = Object.freeze([
    ["low", "low", "moon-render-tier-low"],
    ["medium", "fast", "moon-render-tier-medium"],
    ["high", "quality", "moon-render-tier-high"],
]);

// Owns Moon Render panel placement, controls and listener lifetime.
export function createMoonRenderPanelController({
    documentRef,
    windowRef,
    getElement,
    moonRenderPillId,
    getActiveMoonRenderProfile,
    getMoonRenderPipeline,
    setMoonRenderPipeline,
    setMoonRenderProfile,
    syncMoonRenderProfilePillState,
    syncPressedState,
    syncProfileDeviceAvailability,
}) {
    let moonRenderPanelHome = null;
    let activeMoonRenderPanelTrigger = null;
    function getMoonRenderPanelElements() {
        const panel = getElement("moon-render-pipeline-panel");
        return {
            pill: getElement(moonRenderPillId),
            panel,
            close: getElement("moon-render-pipeline-close"),
            tierButtons: MOON_RENDER_TIER_BUTTONS
                .map(([tier, profile, id]) => [tier, profile, getElement(id)])
                .filter(([, , button]) => !!button),
            physicalControls: MOON_PHYSICAL_RENDER_CONTROLS.map((control) => ({
                ...control,
                input: getElement(`moon-render-physical-${control.key}`),
                value: getElement(`moon-render-physical-${control.key}-value`),
            })).filter((control) => !!control.input),
            presetButtons: Object.keys(MOON_RENDER_PIPELINE_PRESETS)
                .map((presetId) => [presetId, getElement(`moon-render-preset-${presetId}`)])
                .filter(([, button]) => !!button),
            stageInputs: MOON_RENDER_PIPELINE_STAGE_CONTROLS
                .map(([key]) => [key, getElement(`moon-render-stage-${key}`)])
                .filter(([, input]) => !!input),
        };
    }

    function prepareMoonRenderPanelHost(trigger, panel, pill) {
        if (!panel) return false;
        const externalTrigger = trigger && trigger !== pill && trigger.dataset?.moonRenderPanelTrigger === "true";
        const body = documentRef?.body;
        if (externalTrigger && body?.appendChild && panel.parentElement !== body) {
            moonRenderPanelHome ||= {
                parent: panel.parentElement,
                nextSibling: panel.nextSibling,
            };
            body.appendChild(panel);
            if (panel.dataset) panel.dataset.portaled = "true";
            return true;
        }
        if (!externalTrigger && moonRenderPanelHome?.parent && panel.parentElement !== moonRenderPanelHome.parent) {
            const { parent, nextSibling } = moonRenderPanelHome;
            if (nextSibling && typeof parent.insertBefore === "function") {
                parent.insertBefore(panel, nextSibling);
            } else {
                parent.appendChild?.(panel);
            }
            if (panel.dataset) delete panel.dataset.portaled;
        }
        return panel.dataset?.portaled === "true";
    }

    function positionMoonRenderPanel(trigger, panel) {
        if (!trigger?.getBoundingClientRect || !panel?.style) return;
        const triggerRect = trigger.getBoundingClientRect();
        const panelWidth = panel.offsetWidth || 320;
        const panelHeight = panel.offsetHeight || 330;
        const viewportWidth = windowRef?.innerWidth || panelWidth;
        const viewportHeight = windowRef?.innerHeight || panelHeight;
        const preferredLeft = triggerRect.left + (triggerRect.width / 2) - (panelWidth / 2);
        const nextLeft = Math.min(
            Math.max(8, preferredLeft),
            Math.max(8, viewportWidth - panelWidth - 8),
        );
        const belowTop = triggerRect.bottom + 6;
        const aboveTop = triggerRect.top - panelHeight - 6;
        const preferredTop = belowTop + panelHeight <= viewportHeight - 8
            ? belowTop
            : aboveTop;
        const nextTop = Math.min(
            Math.max(8, preferredTop),
            Math.max(8, viewportHeight - panelHeight - 8),
        );
        panel.style.position = "fixed";
        panel.style.left = `${nextLeft}px`;
        panel.style.right = "auto";
        panel.style.top = `${Math.round(nextTop)}px`;
    }

    function setMoonRenderPanelOpen(open, trigger = null) {
        const { pill, panel } = getMoonRenderPanelElements();
        if (!panel) return;
        const previousTrigger = activeMoonRenderPanelTrigger;
        const activeTrigger = trigger || previousTrigger || pill;
        prepareMoonRenderPanelHost(activeTrigger, panel, pill);
        panel.hidden = open !== true;
        if (open === true) {
            activeMoonRenderPanelTrigger = activeTrigger;
            positionMoonRenderPanel(activeTrigger, panel);
        }
        [pill, activeTrigger, previousTrigger].forEach((button) => {
            if (!button?.setAttribute) return;
            button.classList?.toggle?.("is-open", open === true);
            button.setAttribute("aria-expanded", open === true ? "true" : "false");
        });
        if (open !== true) {
            activeMoonRenderPanelTrigger = null;
        }
    }

    function getActiveMoonRenderPipeline() {
        return normalizeMoonRenderPipelineState(getMoonRenderPipeline());
    }

    function syncMoonRenderPanelState() {
        const pipeline = getActiveMoonRenderPipeline();
        const effectivePipeline = resolveMoonLightingModelStages(pipeline);
        const activePresetId = resolveMoonRenderPipelinePresetId(pipeline);
        const {
            pill,
            tierButtons,
            physicalControls,
            presetButtons,
            stageInputs,
        } = getMoonRenderPanelElements();
        const isCustom = activePresetId === "custom";
        const activeProfile = getActiveMoonRenderProfile();
        syncPressedState(pill, isCustom || activePresetId !== "full");

        tierButtons.forEach(([, profile, button]) => {
            syncPressedState(button, profile === activeProfile);
            syncProfileDeviceAvailability(button, profile);
        });
        physicalControls.forEach(({ key, input, value }) => {
            const numeric = Number(pipeline[key]);
            input.value = String(numeric);
            input.disabled = false;
            if (value) value.textContent = numeric.toFixed(2);
        });
        presetButtons.forEach(([presetId, button]) => {
            syncPressedState(button, presetId === activePresetId);
            button.disabled = false;
        });
        stageInputs.forEach(([key, input]) => {
            input.checked = effectivePipeline[key] === true;
            input.disabled = false;
        });
    }

    function commitMoonRenderPipeline(nextState) {
        const normalized = normalizeMoonRenderPipelineState(nextState);
        if (typeof setMoonRenderPipeline === "function") {
            setMoonRenderPipeline(normalized);
        }
        syncMoonRenderPanelState();
    }

    function bindMoonRenderPanel() {
        const {
            pill,
            close,
            tierButtons,
            physicalControls,
            presetButtons,
            stageInputs,
        } = getMoonRenderPanelElements();
        if (pill) {
            pill.addEventListener("click", function (event) {
                event?.stopPropagation?.();
                const panel = getMoonRenderPanelElements().panel;
                setMoonRenderPanelOpen(panel?.hidden !== false, pill);
                syncMoonRenderPanelState();
            });
        }
        close?.addEventListener?.("click", () => setMoonRenderPanelOpen(false));

        tierButtons.forEach(([, profile, button]) => {
            button.addEventListener("click", () => {
                if (getActiveMoonRenderProfile() === profile) return;
                tierButtons.forEach(([, , tierButton]) => {
                    tierButton.disabled = true;
                });
                Promise.resolve(
                    typeof setMoonRenderProfile === "function"
                        ? setMoonRenderProfile(profile)
                        : profile,
                ).catch((error) => {
                    console.error("Failed to switch Moon resource tier:", error);
                }).finally(() => {
                    tierButtons.forEach(([, , tierButton]) => {
                        tierButton.disabled = false;
                    });
                    syncMoonRenderPanelState();
                    syncMoonRenderProfilePillState();
                });
            });
        });
        physicalControls.forEach(({ key, input }) => {
            input.addEventListener("input", () => {
                commitMoonRenderPipeline({
                    ...getActiveMoonRenderPipeline(),
                    [key]: Number(input.value),
                });
            });
        });
        presetButtons.forEach(([presetId, button]) => {
            button.addEventListener("click", () => {
                const preset = MOON_RENDER_PIPELINE_PRESETS[presetId];
                if (!preset) return;
                commitMoonRenderPipeline({
                    ...getActiveMoonRenderPipeline(),
                    ...preset.state,
                    lightingModel: getActiveMoonRenderPipeline().lightingModel,
                });
            });
        });
        stageInputs.forEach(([key, input]) => {
            input.addEventListener("change", () => {
                commitMoonRenderPipeline({
                    ...getActiveMoonRenderPipeline(),
                    [key]: input.checked === true,
                });
            });
        });
        documentRef?.addEventListener?.("moon-mission:moon-render-panel-request", (event) => {
            const trigger = event?.detail?.trigger;
            if (!trigger) return;
            const panel = getMoonRenderPanelElements().panel;
            setMoonRenderPanelOpen(panel?.hidden !== false, trigger);
            syncMoonRenderPanelState();
        });
        documentRef?.addEventListener?.("moon-mission:moon-render-panel-dismiss", () => {
            setMoonRenderPanelOpen(false);
        });
        documentRef?.addEventListener?.("click", (event) => {
            const trigger = event?.target?.closest?.("[data-moon-render-panel-trigger]");
            if (!trigger) return;
            event?.stopPropagation?.();
            const panel = getMoonRenderPanelElements().panel;
            setMoonRenderPanelOpen(panel?.hidden !== false, trigger);
            syncMoonRenderPanelState();
        });
    }

    return { bindMoonRenderPanel, syncMoonRenderPanelState };
}
