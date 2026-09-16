const panelEntries = new Map();
const panelListeners = new Set();

function clonePanelDescriptorData(value, seen = new WeakMap()) {
    if (value == null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (value instanceof Date) return new Date(value.getTime());
    if (Array.isArray(value)) {
        const clone = [];
        seen.set(value, clone);
        value.forEach(item => clone.push(clonePanelDescriptorData(item, seen)));
        return clone;
    }
    if (value instanceof Map) {
        const clone = new Map();
        seen.set(value, clone);
        value.forEach((item, key) => clone.set(clonePanelDescriptorData(key, seen), clonePanelDescriptorData(item, seen)));
        return clone;
    }
    if (value instanceof Set) {
        const clone = new Set();
        seen.set(value, clone);
        value.forEach(item => clone.add(clonePanelDescriptorData(item, seen)));
        return clone;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    const clone = prototype === null ? Object.create(null) : {};
    seen.set(value, clone);
    for (const [key, item] of Object.entries(value)) clone[key] = clonePanelDescriptorData(item, seen);
    return clone;
}

function sanitizeSnapshotEntry(entry) {
    if (!entry || typeof entry !== "object") {
        return null;
    }

    const {
        actions,
        ...rest
    } = entry;

    return {
        ...clonePanelDescriptorData(rest),
        actions: {
            open: typeof actions?.open === "function",
            restore: typeof actions?.restore === "function",
            focus: typeof actions?.focus === "function",
            minimize: typeof actions?.minimize === "function",
            close: typeof actions?.close === "function",
            delete: typeof actions?.delete === "function",
        },
    };
}

function getMissionPanelDetails(id) {
    const key = String(id || "").trim();
    if (!key) {
        return null;
    }
    const entry = panelEntries.get(key);
    return entry ? sanitizeSnapshotEntry(entry) : null;
}

function sortSnapshotEntries(entries) {
    return [...entries].sort((a, b) => {
        const orderA = Number.isFinite(a?.sortOrder) ? a.sortOrder : 0;
        const orderB = Number.isFinite(b?.sortOrder) ? b.sortOrder : 0;
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        return String(a?.title || "").localeCompare(String(b?.title || ""));
    });
}

function snapshotValuesEqual(a, b) {
    if (Object.is(a, b)) {
        return true;
    }
    if (typeof a !== typeof b || !a || !b || typeof a !== "object") {
        return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return false;
        }
        return a.every((value, index) => snapshotValuesEqual(value, b[index]));
    }
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    return aKeys.every((key, index) =>
        key === bKeys[index] && snapshotValuesEqual(a[key], b[key]));
}

function emitPanelRegistryChange() {
    const snapshot = sortSnapshotEntries(
        Array.from(panelEntries.values())
            .map(sanitizeSnapshotEntry)
            .filter(Boolean),
    );

    for (const listener of panelListeners) listener(clonePanelDescriptorData(snapshot));
}

function normalizePanelEntry(id, descriptor, previous = null) {
    const safeDescriptor = descriptor && typeof descriptor === "object" ? descriptor : {};
    const { actions: descriptorActions, ...descriptorData } = safeDescriptor;
    const nextActions = {
        ...(previous?.actions || {}),
        ...(descriptorActions || {}),
    };

    return {
        ...(previous || {}),
        ...clonePanelDescriptorData(descriptorData),
        id,
        actions: nextActions,
    };
}

function registerMissionPanel(descriptor) {
    const id = String(descriptor?.id || "").trim();
    if (!id) {
        throw new Error("registerMissionPanel requires a non-empty id");
    }
    const previous = panelEntries.get(id) || null;
    const previousSnapshot = getMissionPanelSnapshot();
    const nextEntry = normalizePanelEntry(id, descriptor, previous);
    panelEntries.set(id, nextEntry);
    if (!snapshotValuesEqual(previousSnapshot, getMissionPanelSnapshot())) {
        emitPanelRegistryChange();
    }
    return id;
}

function updateMissionPanel(id, patch) {
    const key = String(id || "").trim();
    if (!key) {
        return null;
    }
    const previous = panelEntries.get(key) || null;
    if (!previous) {
        return registerMissionPanel({ id: key, ...patch });
    }
    const previousSnapshot = getMissionPanelSnapshot();
    const nextEntry = normalizePanelEntry(key, patch, previous);
    panelEntries.set(key, nextEntry);
    if (!snapshotValuesEqual(previousSnapshot, getMissionPanelSnapshot())) {
        emitPanelRegistryChange();
    }
    return key;
}

function unregisterMissionPanel(id) {
    const key = String(id || "").trim();
    if (!key || !panelEntries.has(key)) {
        return false;
    }
    panelEntries.delete(key);
    emitPanelRegistryChange();
    return true;
}

function subscribeMissionPanels(listener) {
    if (typeof listener !== "function") {
        return () => {};
    }
    panelListeners.add(listener);
    try {
        listener(getMissionPanelSnapshot());
    } catch (error) {
        // The caller never received its unsubscribe handle.
        panelListeners.delete(listener);
        throw error;
    }
    return () => {
        panelListeners.delete(listener);
    };
}

function invokeMissionPanelAction(id, actionName) {
    const key = String(id || "").trim();
    const actionKey = String(actionName || "").trim();
    const entry = panelEntries.get(key);
    const action = entry?.actions?.[actionKey];
    if (typeof action !== "function") {
        return false;
    }
    action();
    return true;
}

function getMissionPanelSnapshot() {
    return sortSnapshotEntries(
        Array.from(panelEntries.values())
            .map(sanitizeSnapshotEntry)
            .filter(Boolean),
    );
}

export {
    getMissionPanelDetails,
    getMissionPanelSnapshot,
    invokeMissionPanelAction,
    registerMissionPanel,
    subscribeMissionPanels,
    unregisterMissionPanel,
    updateMissionPanel,
};
