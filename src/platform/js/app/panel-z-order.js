const PANEL_Z_ORDER_STATE_KEY = "__moonMissionPanelZOrder";
const PANEL_Z_ORDER_BASE = 5200;

function getPanelZOrderState() {
    const existing = globalThis[PANEL_Z_ORDER_STATE_KEY];
    if (existing && typeof existing === "object") {
        return existing;
    }
    const state = {
        next: PANEL_Z_ORDER_BASE,
    };
    globalThis[PANEL_Z_ORDER_STATE_KEY] = state;
    return state;
}

function bringPanelElementToFront(element) {
    if (!element?.style) return 0;
    const state = getPanelZOrderState();
    state.next += 1;
    element.style.zIndex = String(state.next);
    return state.next;
}

export {
    bringPanelElementToFront,
};
