const TRUE_VALUES = new Set(["1", "true", "yes"]);
const FALSE_VALUES = new Set(["0", "false", "no"]);

function resolveDockviewEnabled({ urlSearch = "", viewportWidth = 0, missionConfig = null } = {}) {
    const params = new URLSearchParams(urlSearch);
    const normalize = value => String(value || "").trim().toLowerCase();
    if (TRUE_VALUES.has(normalize(params.get("legacyPanels")))) return false;
    const override = normalize(params.get("dockPanels"));
    if (TRUE_VALUES.has(override)) return true;
    if (FALSE_VALUES.has(override)) return false;
    return missionConfig?.ui?.dockviewEnabled !== false && viewportWidth > 600;
}

export { resolveDockviewEnabled };
