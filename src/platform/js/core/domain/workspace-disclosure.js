const MAIN_PANEL_ID = "mission:main-view";
const MEDIA_PANEL_ID = "workflow:media-browser";
const SPACE_LEVELS = [
    { name: "full", width: 1680, height: 860 },
    { name: "compact", width: 1280, height: 680 },
    { name: "minimal", width: 960, height: 600 },
];

function resolveWorkspaceSpaceLevel(width, height) {
    return SPACE_LEVELS.find(level => width >= level.width && height >= level.height)?.name || "focused";
}

function resolveWorkspacePanelPriority(level, selectedTool = null) {
    if (level === "full") return null;
    if (level === "compact") return new Set([
        MAIN_PANEL_ID, "workflow:background-media", "aux:earth-rise-composer", MEDIA_PANEL_ID,
        ...(selectedTool ? [selectedTool] : []),
    ]);
    if (level === "minimal") return new Set([MAIN_PANEL_ID, selectedTool || MEDIA_PANEL_ID]);
    return new Set([selectedTool || MAIN_PANEL_ID]);
}

function resolveComposerSpaceLevel(width, height) {
    if (width >= 560 && height >= 420) return "full";
    if (width >= 340 && height >= 260) return "compact";
    return "minimal";
}

// Keep the expanded arrangement while honoring explicit opens, closes, floats
// and popouts made in a reduced workspace. Never resurrect a closed panel.
function reconcileWorkspaceLayout(reference, current) {
    const result = structuredClone(reference);
    const panels = current.panels || {};
    const outside = new Set();
    const collect = node => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node.views)) node.views.forEach(id => outside.add(id));
        Object.values(node).forEach(value => { if (typeof value === "object") collect(value); });
    };
    collect(current.floatingGroups);
    collect(current.popoutGroups);
    collect(current.edgeGroups);
    const included = new Set(outside);
    const prune = node => {
        if (node.type === "branch") {
            node.data = node.data.map(prune).filter(Boolean);
            return node.data.length ? node : null;
        }
        node.data.views = node.data.views.filter(id => panels[id] && !outside.has(id));
        if (!node.data.views.length) return null;
        node.data.views.forEach(id => included.add(id));
        if (!node.data.views.includes(node.data.activeView)) node.data.activeView = node.data.views[0];
        return node;
    };
    result.grid.root = prune(result.grid.root) || { type: "branch", data: [], size: current.grid.root.size };
    const findLocation = (node, predicate) => {
        if (node.type !== "branch") return null;
        for (const [index, child] of node.data.entries()) {
            if (child.type === "leaf" && predicate(child)) return { parent: node, index, leaf: child };
            const found = findLocation(child, predicate);
            if (found) return found;
        }
        return null;
    };
    const addNew = (node, currentParent = null) => {
        if (node.type === "branch") { node.data.forEach(child => addNew(child, node)); return; }
        const views = node.data.views.filter(id => panels[id] && !included.has(id));
        if (!views.length) return;
        views.forEach(id => included.add(id));
        const existing = findLocation(result.grid.root, leaf => leaf.data.id === node.data.id);
        if (existing) { existing.leaf.data.views.push(...views); return; }
        const newLeaf = { ...structuredClone(node), data: { ...node.data, views, activeView: views[0] } };
        delete newLeaf.visible;
        const siblings = currentParent?.data || [];
        const index = siblings.indexOf(node);
        // Reopened panes retain their neighborhood (e.g. Craft→Moon above
        // Craft→Earth) rather than acquiring a new top-level column.
        for (const offset of [1, -1]) {
            for (let i = index + offset; i >= 0 && i < siblings.length; i += offset) {
                const sibling = siblings[i];
                if (sibling.type !== "leaf") continue;
                const anchor = findLocation(result.grid.root, leaf => leaf.data.views.some(id => sibling.data.views.includes(id)));
                if (!anchor) continue;
                anchor.parent.data.splice(anchor.index + (offset < 0 ? 1 : 0), 0, newLeaf);
                return;
            }
        }
        result.grid.root.data.push(newLeaf);
    };
    addNew(current.grid.root);
    result.panels = structuredClone(panels);
    for (const key of ["floatingGroups", "popoutGroups", "edgeGroups"]) {
        if (current[key]) result[key] = structuredClone(current[key]); else delete result[key];
    }
    if (!findLocation(result.grid.root, leaf => leaf.data.id === result.activeGroup)) {
        result.activeGroup = findLocation(result.grid.root, leaf => leaf.data.views.includes(MAIN_PANEL_ID))?.leaf.data.id
            || findLocation(result.grid.root, () => true)?.leaf.data.id;
    }
    return result;
}

export { MAIN_PANEL_ID, MEDIA_PANEL_ID, SPACE_LEVELS, resolveWorkspaceSpaceLevel, resolveWorkspacePanelPriority, resolveComposerSpaceLevel, reconcileWorkspaceLayout };
