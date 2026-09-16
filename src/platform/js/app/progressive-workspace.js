import { MAIN_PANEL_ID, reconcileWorkspaceLayout, resolveWorkspacePanelPriority, resolveWorkspaceSpaceLevel } from "../core/domain/workspace-disclosure.js";

function createProgressiveWorkspace({ layoutHost, root, documentRef = document, windowRef = window, savedExpandedLayout = null }) {
    const api = layoutHost.api;
    const hiddenGroups = new Set();
    // Element identity matters: restoring a layout can replace group objects
    // and DOM while retaining group IDs. Never clear another owner's inert.
    const inertElements = new Set();
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

    function syncKeyboardOwnership() {
        if (disposed) return false;
        const suppressed = new Set(groups()
            .filter(group => group.api.location?.type === "grid" && !group.api.isVisible)
            .map(group => group.element).filter(Boolean));
        let focusWasHidden = false;
        for (const element of inertElements) {
            if (disposed) return false;
            if (suppressed.has(element)) continue;
            inertElements.delete(element);
            element.inert = false;
        }
        for (const element of suppressed) {
            if (disposed) return false;
            focusWasHidden ||= !!element.contains(documentRef.activeElement);
            if (!element.inert) {
                inertElements.add(element);
                element.inert = true;
            }
        }
        return focusWasHidden;
    }

    function finishUpdate(focusWasHidden = false) {
        if (disposed) return;
        focusWasHidden = syncKeyboardOwnership() || focusWasHidden;
        if (disposed) return;
        // The launch strip updates control visibility in response to publish.
        publish();
        if (disposed || !focusWasHidden) return;
        for (const selector of [".workspace-tools__summary", ".workspace-scene-return"]) {
            if (disposed) return;
            const control = documentRef.querySelector(selector);
            if (!control || control.closest?.("[inert], [hidden]") || !control.getClientRects?.().length) continue;
            control.focus();
            if (documentRef.activeElement === control) break;
        }
    }

    layoutHost.setPersistenceFilter(current => {
        if (disposed) return current;
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
        if (maximized && windowRef.innerWidth > 600) { finishUpdate(); return; }
        applying = true;
        let focusWasHidden = false;
        try {
            maximized?.api.exitMaximized();
            if (disposed) return;
            const main = api.getPanel?.(MAIN_PANEL_ID);
            if (constraintLevel !== level) {
                main?.api.setConstraints?.({ minimumWidth: level === "focused" ? 160 : 560, minimumHeight: level === "focused" ? 80 : 260 });
                if (disposed) return;
                constraintLevel = level;
            }
            if (level === "full" && reference) {
                const restored = reconcileWorkspaceLayout(reference, api.toJSON());
                reference = null;
                hiddenGroups.clear();
                layoutHost.applyTransientLayout(restored);
                if (disposed) return;
            } else if (level !== "full" && !reference) {
                reference = expandedSnapshot;
            }
            const visible = resolveWorkspacePanelPriority(level, selectedTool);
            for (const group of groups()) {
                if (disposed) return;
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
            if (disposed) return;
            const target = api.getPanel?.(selectedTool || MAIN_PANEL_ID);
            if (target && target.group.api.isVisible && !api.activeGroup?.api.isVisible) target.api.setActive();
            if (disposed) return;
            if (levelChanged) layoutHost.layout();
        } finally {
            applying = false;
        }
        finishUpdate(focusWasHidden);
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
            if (disposed) return false;
            const panel = api.getPanel?.(panelId);
            return !!panel && hiddenGroups.has(panel.group.id);
        },
        revealPanel(panelId) {
            if (disposed) return false;
            const panel = api.getPanel?.(panelId);
            if (!panel) { pendingTool = panelId; schedule(); return false; }
            pendingTool = null;
            selectedTool = panelId === MAIN_PANEL_ID ? null : panelId;
            update();
            if (disposed) return false;
            panel.api.setActive();
            if (disposed) return false;
            panel.focus?.();
            return true;
        },
        captureExpandedLayout() {
            if (disposed) return;
            reference = null;
            expandedSnapshot = api.toJSON();
            hiddenGroups.clear();
            schedule();
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            if (frame !== null) windowRef.cancelAnimationFrame(frame);
            frame = null;
            for (const element of inertElements) element.inert = false;
            inertElements.clear();
            subscriptions.forEach(subscription => subscription?.dispose());
            windowRef.removeEventListener("resize", schedule);
            layoutHost.setPersistenceFilter(null);
            delete documentRef.body.dataset.workspaceSpace;
        },
    };
}

export { createProgressiveWorkspace };
