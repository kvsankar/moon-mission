import { createDockview } from "dockview-core";

const PANEL_LAYOUT_HOST_STORAGE_PREFIX = "moon-mission:dockview-layout:v1";

function normalizePanelLayoutMissionKey(missionKey) {
    return String(missionKey || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "unknown";
}

function getPanelLayoutHostStorageKey(missionKey) {
    return `${PANEL_LAYOUT_HOST_STORAGE_PREFIX}:${normalizePanelLayoutMissionKey(missionKey)}`;
}

function readPanelLayoutHostState(storageKey) {
    try {
        const raw = globalThis?.localStorage?.getItem?.(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function writePanelLayoutHostState(storageKey, layout) {
    if (!storageKey) return;
    try {
        globalThis?.localStorage?.setItem?.(storageKey, JSON.stringify(layout || {}));
    } catch {
        // Layout persistence is best-effort.
    }
}

function clearPanelLayoutHostState(storageKey) {
    if (!storageKey) return;
    try {
        globalThis?.localStorage?.removeItem?.(storageKey);
    } catch {
        // Layout persistence is best-effort.
    }
}

function createNoopDisposable() {
    return { dispose() {} };
}

function asDisposable(value) {
    return value && typeof value.dispose === "function" ? value : createNoopDisposable();
}

function normalizeRenderedPanel(rendered) {
    if (typeof HTMLElement !== "undefined" && rendered instanceof HTMLElement) {
        return {
            element: rendered,
            dispose: null,
            focus: null,
            layout: null,
        };
    }
    if (typeof HTMLElement !== "undefined" && rendered?.element instanceof HTMLElement) {
        return {
            element: rendered.element,
            dispose: typeof rendered.dispose === "function" ? rendered.dispose.bind(rendered) : null,
            focus: typeof rendered.focus === "function" ? rendered.focus.bind(rendered) : null,
            layout: typeof rendered.layout === "function" ? rendered.layout.bind(rendered) : null,
        };
    }
    const fallback = document.createElement("div");
    return {
        element: fallback,
        dispose: null,
        focus: null,
        layout: null,
    };
}

class PanelLayoutHostRenderer {
    constructor({ renderPanel, onPanelResize }) {
        this.element = document.createElement("div");
        this.element.className = "panel-layout-host__panel";
        this.renderPanel = renderPanel;
        this.onPanelResize = onPanelResize;
        this.rendered = null;
        this.panelId = "";
    }

    init(parameters) {
        this.panelId = String(parameters?.api?.id || parameters?.id || "").trim();
        const rendered = normalizeRenderedPanel(this.renderPanel({
            id: this.panelId,
            title: parameters?.title || parameters?.api?.title || "",
            params: parameters?.params || {},
            api: parameters?.api || null,
            containerApi: parameters?.containerApi || null,
            dockview: parameters,
        }));
        this.rendered = rendered;
        this.element.replaceChildren(rendered.element);
    }

    focus() {
        this.rendered?.focus?.();
    }

    layout(width, height) {
        this.rendered?.layout?.(width, height);
        this.onPanelResize?.({
            id: this.panelId,
            width,
            height,
        });
    }

    dispose() {
        this.rendered?.dispose?.();
        this.rendered = null;
        this.element.replaceChildren();
    }
}

function addPanelDescriptor(api, panel) {
    const id = String(panel?.id || "").trim();
    if (!id || api.getPanel(id)) {
        return null;
    }
    return api.addPanel({
        id,
        component: panel.component || "default",
        title: panel.title || id,
        params: panel.params || {},
        position: panel.position,
        floating: panel.floating,
        inactive: panel.inactive === true,
        initialWidth: panel.initialWidth,
        initialHeight: panel.initialHeight,
        minimumWidth: panel.minimumWidth,
        minimumHeight: panel.minimumHeight,
        maximumWidth: panel.maximumWidth,
        maximumHeight: panel.maximumHeight,
    });
}

function createPanelLayoutHost({
    container,
    missionKey,
    panels = [],
    storageKey = getPanelLayoutHostStorageKey(missionKey),
    renderPanel,
    onPanelFocus = null,
    onPanelClose = null,
    onPanelLayoutChange = null,
    onPanelResize = null,
    dockviewOptions = null,
    createDockviewImpl = createDockview,
} = {}) {
    if (!container) {
        throw new Error("createPanelLayoutHost requires a container element");
    }
    if (typeof renderPanel !== "function") {
        throw new Error("createPanelLayoutHost requires a renderPanel callback");
    }

    const disposables = [];
    let persistenceFilter = null;
    let applyingTransientLayout = false;
    const api = createDockviewImpl(container, {
        ...(dockviewOptions && typeof dockviewOptions === "object" ? dockviewOptions : {}),
        createComponent() {
            return new PanelLayoutHostRenderer({
                renderPanel,
                onPanelResize,
            });
        },
    });

    function layoutToContainer() {
        const rect = container.getBoundingClientRect?.() || {};
        const width = Math.max(1, Math.round(Number(rect.width) || container.clientWidth || 1));
        const height = Math.max(1, Math.round(Number(rect.height) || container.clientHeight || 1));
        api.layout(width, height);
    }

    function saveLayout() {
        const current = api.toJSON();
        const layout = persistenceFilter ? persistenceFilter(current) : current;
        writePanelLayoutHostState(storageKey, layout);
        onPanelLayoutChange?.(layout);
        return layout;
    }

    function addDefaultPanels(nextPanels = panels) {
        for (const panel of nextPanels || []) {
            addPanelDescriptor(api, panel);
        }
    }

    function restoreLayout(savedLayout = readPanelLayoutHostState(storageKey)) {
        if (!savedLayout) {
            addDefaultPanels();
            return false;
        }
        try {
            api.fromJSON(savedLayout, { reuseExistingPanels: false });
            return true;
        } catch {
            api.clear();
            addDefaultPanels();
            saveLayout();
            return false;
        }
    }

    restoreLayout();
    saveLayout();

    disposables.push(asDisposable(api.onDidLayoutChange?.(() => {
        saveLayout();
    })));
    disposables.push(asDisposable(api.onDidActivePanelChange?.((panel) => {
        if (panel?.id) {
            onPanelFocus?.(panel.id);
        }
    })));
    disposables.push(asDisposable(api.onDidRemovePanel?.((panel) => {
        if (panel?.id && !applyingTransientLayout) {
            onPanelClose?.(panel.id);
        }
    })));

    const resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(layoutToContainer)
        : null;
    resizeObserver?.observe?.(container);
    globalThis?.addEventListener?.("resize", layoutToContainer, { passive: true });
    if (typeof globalThis?.requestAnimationFrame === "function") {
        globalThis.requestAnimationFrame(layoutToContainer);
    } else {
        setTimeout(layoutToContainer, 0);
    }

    return {
        api,
        storageKey,
        addPanel(panel) {
            const added = addPanelDescriptor(api, panel);
            saveLayout();
            return added;
        },
        focusPanel(panelId) {
            const panel = api.getPanel(String(panelId || "").trim());
            panel?.focus?.();
            return Boolean(panel);
        },
        closePanel(panelId) {
            const panel = api.getPanel(String(panelId || "").trim());
            if (!panel) return false;
            panel.api?.close?.();
            saveLayout();
            return true;
        },
        removePanel(panelId) {
            const panel = api.getPanel(String(panelId || "").trim());
            if (!panel) return false;
            api.removePanel(panel);
            saveLayout();
            return true;
        },
        layout: layoutToContainer,
        restoreLayout,
        resetLayout(nextPanels = panels) {
            clearPanelLayoutHostState(storageKey);
            api.clear();
            addDefaultPanels(nextPanels);
            layoutToContainer();
            return saveLayout();
        },
        toJSON() {
            return api.toJSON();
        },
        saveLayout,
        setPersistenceFilter(filter) {
            persistenceFilter = typeof filter === "function" ? filter : null;
        },
        applyTransientLayout(layout) {
            applyingTransientLayout = true;
            try {
                api.fromJSON(layout, { reuseExistingPanels: true });
                layoutToContainer();
            } finally {
                applyingTransientLayout = false;
            }
            saveLayout();
        },
        dispose() {
            for (const disposable of disposables.splice(0)) {
                disposable.dispose();
            }
            resizeObserver?.disconnect?.();
            globalThis?.removeEventListener?.("resize", layoutToContainer);
            api.dispose?.();
        },
    };
}

export {
    PANEL_LAYOUT_HOST_STORAGE_PREFIX,
    createPanelLayoutHost,
    getPanelLayoutHostStorageKey,
    normalizePanelLayoutMissionKey,
    readPanelLayoutHostState,
    writePanelLayoutHostState,
};
