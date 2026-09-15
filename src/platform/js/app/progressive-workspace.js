import { MAIN_PANEL_ID, reconcileWorkspaceLayout, resolveWorkspacePanelPriority, resolveWorkspaceSpaceLevel } from "../core/domain/workspace-disclosure.js";

function createProgressiveWorkspace({ layoutHost, root, documentRef = document, windowRef = window, savedExpandedLayout = null }) {
    const api = layoutHost.api;
    const hiddenGroups = new Set();
    let reference = null;
    let expandedSnapshot = savedExpandedLayout || api.toJSON();
    let selectedTool = null;
    let pendingTool = null;
    let level = "full";
    let constraintLevel = null;
    let applying = false;
    let frame = null;
    let disposed = false;
    const groups = () => api.groups || [];
    const publish = () => documentRef.dispatchEvent(new CustomEvent("moon-mission:workspace-disclosure-change"));

    layoutHost.setPersistenceFilter(current => {
        // Dockview handles the resize event before this controller's RAF.
        // Freeze the last expanded layout before its automatic sizing is saved.
        if (!reference && resolveWorkspaceSpaceLevel(windowRef.innerWidth, windowRef.innerHeight) !== "full") {
            reference = expandedSnapshot;
        }
        if (!reference) {
            expandedSnapshot = structuredClone(current);
            return current;
        }
        reference = reconcileWorkspaceLayout(reference, current);
        return reference;
    });
    // Recover the raw expanded snapshot after a constrained-window bootstrap.
    layoutHost.saveLayout();

    function update() {
        frame = null;
        if (disposed || applying) return;
        const maximized = groups().find(group => group.api.isMaximized?.());
        const next = resolveWorkspaceSpaceLevel(windowRef.innerWidth, windowRef.innerHeight);
        const levelChanged = next !== level || !root.dataset.spaceLevel;
        if (next !== level) selectedTool = null;
        if (windowRef.innerWidth <= 600) selectedTool = null;
        if (pendingTool && api.getPanel?.(pendingTool)) {
            selectedTool = pendingTool;
            pendingTool = null;
        }
        if (selectedTool && !api.getPanel?.(selectedTool)) selectedTool = null;
        level = next;
        root.dataset.spaceLevel = level;
        documentRef.body.dataset.workspaceSpace = level;
        if (maximized && windowRef.innerWidth > 600) { publish(); return; }
        applying = true;
        try {
            maximized?.api.exitMaximized();
            const main = api.getPanel?.(MAIN_PANEL_ID);
            if (constraintLevel !== level) {
                main?.api.setConstraints?.({ minimumWidth: level === "focused" ? 160 : 560, minimumHeight: level === "focused" ? 80 : 260 });
                constraintLevel = level;
            }
            if (level === "full" && reference) {
                const restored = reconcileWorkspaceLayout(reference, api.toJSON());
                reference = null;
                hiddenGroups.clear();
                layoutHost.applyTransientLayout(restored);
            } else if (level !== "full" && !reference) {
                reference = expandedSnapshot;
            }
            const visible = resolveWorkspacePanelPriority(level, selectedTool);
            let focusWasHidden = false;
            for (const group of groups()) {
                if (group.api.location?.type !== "grid") continue;
                const keep = !visible || group.panels.some(panel => visible.has(panel.id));
                if (!keep && group.api.isVisible) {
                    focusWasHidden ||= !!group.element?.contains(documentRef.activeElement);
                    hiddenGroups.add(group.id);
                    group.api.setVisible(false);
                } else if (keep && hiddenGroups.has(group.id)) {
                    hiddenGroups.delete(group.id);
                    group.api.setVisible(true);
                }
            }
            const target = api.getPanel?.(selectedTool || MAIN_PANEL_ID);
            if (target && target.group.api.isVisible && !api.activeGroup?.api.isVisible) target.api.setActive();
            if (levelChanged) layoutHost.layout();
            if (focusWasHidden) documentRef.querySelector(".workspace-tools__summary")?.focus();
        } finally {
            applying = false;
        }
        publish();
    }
    function schedule() {
        if (disposed || applying || frame !== null) return;
        frame = windowRef.requestAnimationFrame(update);
    }
    const subscriptions = [api.onDidLayoutChange?.(schedule), api.onDidAddPanel?.(schedule), api.onDidRemovePanel?.(schedule)];
    windowRef.addEventListener("resize", schedule, { passive: true });
    schedule();

    return {
        get level() { return level; },
        isCollapsed(panelId) {
            const panel = api.getPanel?.(panelId);
            return !!panel && hiddenGroups.has(panel.group.id);
        },
        revealPanel(panelId) {
            const panel = api.getPanel?.(panelId);
            if (!panel) { pendingTool = panelId; schedule(); return false; }
            pendingTool = null;
            selectedTool = panelId === MAIN_PANEL_ID ? null : panelId;
            update();
            panel.api.setActive();
            panel.focus?.();
            return true;
        },
        captureExpandedLayout() {
            reference = null;
            expandedSnapshot = api.toJSON();
            hiddenGroups.clear();
            schedule();
        },
        dispose() {
            disposed = true;
            if (frame !== null) windowRef.cancelAnimationFrame(frame);
            subscriptions.forEach(subscription => subscription?.dispose());
            windowRef.removeEventListener("resize", schedule);
            layoutHost.setPersistenceFilter(null);
            delete documentRef.body.dataset.workspaceSpace;
        },
    };
}

export { createProgressiveWorkspace };
