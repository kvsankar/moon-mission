import { STAGE_OVERLAY_REVEAL_MS } from "./media-browser-config.js";
import { getWindowRef } from "./media-browser-dom.js";

export function createMediaBrowserStageOverlay({ getNode }) {
    let stageOverlayRevealTimer = 0;
    let stageOverlayRevealSignature = null;
    let stageOverlayHovering = false;
    let stageOverlayFocusWithin = false;

    function setStageOverlayRevealed(revealed) {
        const stage = getNode("media-browser-stage");
        stage?.classList?.toggle?.("is-overlay-revealed", revealed === true);
    }

    function revealStageOverlays({
        durationMs = STAGE_OVERLAY_REVEAL_MS,
    } = {}) {
        const windowRef = getWindowRef();
        if (stageOverlayRevealTimer) {
            windowRef?.clearTimeout?.(stageOverlayRevealTimer);
            stageOverlayRevealTimer = 0;
        }
        setStageOverlayRevealed(true);
        const delay = Number(durationMs);
        if (!Number.isFinite(delay) || delay <= 0) return;
        stageOverlayRevealTimer = windowRef?.setTimeout?.(() => {
            stageOverlayRevealTimer = 0;
            if (stageOverlayHovering === true || stageOverlayFocusWithin === true) return;
            setStageOverlayRevealed(false);
        }, delay) || 0;
    }

    function revealStageOverlaysForSignature(signature) {
        const normalizedSignature = String(signature || "").trim();
        if (normalizedSignature === stageOverlayRevealSignature) return;
        stageOverlayRevealSignature = normalizedSignature;
        revealStageOverlays();
    }

    function bindStageEvents() {
        const stage = getNode("media-browser-stage");
        stage?.addEventListener?.("pointerenter", () => {
            stageOverlayHovering = true;
            revealStageOverlays({ durationMs: 0 });
        });
        stage?.addEventListener?.("pointerleave", () => {
            stageOverlayHovering = false;
            if (stageOverlayFocusWithin !== true) setStageOverlayRevealed(false);
        });
        stage?.addEventListener?.("pointerdown", () => revealStageOverlays());
        stage?.addEventListener?.("focusin", () => {
            stageOverlayFocusWithin = true;
            revealStageOverlays({ durationMs: 0 });
        });
        stage?.addEventListener?.("focusout", () => {
            stageOverlayFocusWithin = !!stage?.matches?.(":focus-within");
            if (stageOverlayFocusWithin !== true && stageOverlayHovering !== true) setStageOverlayRevealed(false);
        });
    }

    return { revealStageOverlays, revealStageOverlaysForSignature, bindStageEvents };
}
