import { resolveCurrentMissionKey } from "../core/domain/current-mission.js";

export function createFocusPillController(deps = {}) {
    const documentRef = deps.documentRef || document;
    const windowRef = deps.windowRef || window;
    const setView = deps.setView;
    const invokeMissionPanelAction = deps.invokeMissionPanelAction || (() => false);
    const requestAnimationFrameImpl = typeof deps.requestAnimationFrameImpl === "function"
        ? deps.requestAnimationFrameImpl
        : windowRef.requestAnimationFrame?.bind(windowRef) || ((callback) => callback());
    const MutationObserverImpl = deps.MutationObserverImpl
        || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
    const createCustomEvent = typeof deps.createCustomEvent === "function"
        ? deps.createCustomEvent
        : (type) => new CustomEvent(type);

    let bound = false;

    const panelShortcutIds = [
        "panel-pill-background",
        "panel-pill-media",
        "flyby-pill",
        "focus-pill-splashdown",
        "panel-pill-craft-moon",
        "panel-pill-craft-earth",
        "panel-pill-earth-orbit-xy",
    ];

    function getElement(id) {
        return documentRef?.getElementById?.(id) || null;
    }

    function isArtemis2Mission() {
        return resolveCurrentMissionKey(windowRef) === "artemis2";
    }

    function shouldAllowMediaPanel() {
        const mediaQuery = windowRef?.matchMedia?.("(min-width: 601px)");
        return mediaQuery ? mediaQuery.matches === true : true;
    }

    function shouldAllowPanelShortcuts() {
        return shouldAllowMediaPanel();
    }

    function closeMobileOnlyPanelsIfNeeded() {
        if (shouldAllowPanelShortcuts()) return;
        [
            "workflow:background-media",
            "workflow:media-browser",
            "workflow:splashdown",
            "aux:earth-rise-composer",
            "aux:moon",
            "aux:earth",
            "aux:earth-origin-orbit-xy",
        ].forEach((panelId) => closePanel(panelId));
    }

    function resolveTimelineEventButtonByKeys(keys) {
        if (!Array.isArray(keys) || keys.length === 0) return null;
        const normalizedKeys = keys
            .map((key) => String(key || "").trim())
            .filter(Boolean);
        if (normalizedKeys.length === 0) return null;
        const buttons = documentRef?.querySelectorAll?.("#burnbuttons button[data-event-key]") || [];
        for (const button of buttons) {
            const key = String(button?.dataset?.eventKey || "").trim();
            if (normalizedKeys.includes(key)) {
                return button;
            }
        }
        return null;
    }

    function syncPressedState(element, isActive) {
        if (!element) return;
        element.classList?.toggle?.("is-active", !!isActive);
        if (element.getAttribute?.("aria-pressed") !== (isActive ? "true" : "false")) element.setAttribute?.("aria-pressed", isActive ? "true" : "false");
    }

    function setShortcutHidden(id, hidden) {
        const element = getElement(id);
        if (element && element.hidden !== (hidden === true)) {
            element.hidden = hidden === true;
        }
    }

    function queryVisiblePanel(selector) {
        return !!documentRef?.querySelector?.(selector);
    }

    function isAuxPanelVisible(panelId) {
        return queryVisiblePanel(`.aux-camera-view[data-panel-id="${panelId}"]:not([hidden])`) ||
            queryVisiblePanel(`#aux-camera-views .aux-camera-view[data-panel-id="${panelId}"]:not([hidden])`);
    }

    function isAuxComposerPanelVisible() {
        return queryVisiblePanel(".aux-camera-view[data-mode=\"composer\"]:not([hidden])") ||
            queryVisiblePanel("#aux-camera-views .aux-camera-view[data-mode=\"composer\"]:not([hidden])");
    }

    function syncFocusPillVisibility() {
        const flybyPillWrap = getElement("flyby-pill-wrap");
        if (!flybyPillWrap) return;

        const panelShortcutsVisible = isArtemis2Mission() && shouldAllowPanelShortcuts();
        const splashdownVisible = panelShortcutsVisible && !!resolveTimelineEventButtonByKeys(["splashdown"]);
        setShortcutHidden("flyby-pill", !panelShortcutsVisible);
        setShortcutHidden("panel-pill-background", !panelShortcutsVisible);
        setShortcutHidden("panel-pill-media", !panelShortcutsVisible || !shouldAllowMediaPanel());
        setShortcutHidden("focus-pill-splashdown", !splashdownVisible);
        setShortcutHidden("panel-pill-craft-moon", !panelShortcutsVisible);
        setShortcutHidden("panel-pill-craft-earth", !panelShortcutsVisible);
        setShortcutHidden("panel-pill-earth-orbit-xy", !panelShortcutsVisible);

        const visible = panelShortcutIds.some((id) => {
            const element = getElement(id);
            return !!element && element.hidden !== true;
        });
        const flybyGroup = flybyPillWrap.closest?.(".header-pill-group");
        const visibilityTarget = flybyGroup || flybyPillWrap;
        if (visibilityTarget.hidden === !visible) return;
        visibilityTarget.hidden = !visible;
        requestAnimationFrameImpl(() => {
            const tertiaryRow = getElement("header-pill-strip-tertiary");
            if (!tertiaryRow) return;
            tertiaryRow.scrollLeft = 0;
        });
    }

    function syncFocusPillState() {
        const flybyPill = getElement("flyby-pill");
        const backgroundPill = getElement("panel-pill-background");
        const splashdownFocusPill = getElement("focus-pill-splashdown");
        const mediaPill = getElement("panel-pill-media");
        const craftMoonPill = getElement("panel-pill-craft-moon");
        const craftEarthPill = getElement("panel-pill-craft-earth");
        const earthOrbitXyPill = getElement("panel-pill-earth-orbit-xy");
        const composerPanelVisible = isAuxComposerPanelVisible();
        const groundTrackPanelVisible = !!documentRef?.querySelector?.(
            "#ground-track-panel:not(.ground-track-panel--hidden)",
        );
        const mediaPanelVisible = !!documentRef?.querySelector?.(
            "#media-browser-panel:not(.media-browser-panel--hidden)",
        );
        const backgroundPanelVisible = !!documentRef?.querySelector?.(
            "#background-media-panel:not(.background-media-panel--hidden)",
        );
        syncPressedState(flybyPill, composerPanelVisible);
        syncPressedState(backgroundPill, backgroundPanelVisible);
        syncPressedState(splashdownFocusPill, groundTrackPanelVisible);
        syncPressedState(mediaPill, mediaPanelVisible);
        syncPressedState(craftMoonPill, isAuxPanelVisible("aux:moon"));
        syncPressedState(craftEarthPill, isAuxPanelVisible("aux:earth"));
        syncPressedState(earthOrbitXyPill, isAuxPanelVisible("aux:earth-origin-orbit-xy"));
    }

    function isComposerPanelVisible() {
        return isAuxComposerPanelVisible();
    }

    function isGroundTrackPanelVisible() {
        return !!documentRef?.querySelector?.(
            "#ground-track-panel:not(.ground-track-panel--hidden)",
        );
    }

    function isMediaPanelVisible() {
        return !!documentRef?.querySelector?.(
            "#media-browser-panel:not(.media-browser-panel--hidden)",
        );
    }

    function isBackgroundPanelVisible() {
        return !!documentRef?.querySelector?.(
            "#background-media-panel:not(.background-media-panel--hidden)",
        );
    }

    function ensureAuxiliaryPanelsEnabled() {
        const auxiliaryPanelsToggle = getElement("view-aux-camera-panels");
        if (
            auxiliaryPanelsToggle &&
            typeof auxiliaryPanelsToggle.checked === "boolean" &&
            !auxiliaryPanelsToggle.checked &&
            !auxiliaryPanelsToggle.disabled
        ) {
            auxiliaryPanelsToggle.checked = true;
            if (typeof setView === "function") {
                setView();
            }
        }
    }

    function invokeFirstAvailablePanelAction(panelId, actionNames) {
        for (const actionName of actionNames) {
            if (invokeMissionPanelAction(panelId, actionName)) {
                return true;
            }
        }
        return false;
    }

    function restoreComposerPanel() {
        const restored = invokeFirstAvailablePanelAction("aux:earth-rise-composer", ["restoreGuided", "restore", "open"]);
        if (restored) return;

        const composerChip = documentRef?.querySelector?.(
            "#aux-camera-views .aux-camera-chip--composer-tab",
        ) || Array.from(
            documentRef?.querySelectorAll?.("#aux-camera-views .aux-camera-chip") || [],
        ).find((button) => /^flyby\b/i.test((button?.textContent || "").trim()));
        if (composerChip && !composerChip.hidden && typeof composerChip.click === "function") {
            composerChip.click();
        }
    }

    function closePanel(panelId) {
        invokeFirstAvailablePanelAction(panelId, ["close"]);
        requestAnimationFrameImpl(syncFocusPillState);
    }

    function toggleComposerPanel() {
        if (!shouldAllowPanelShortcuts()) {
            closeMobileOnlyPanelsIfNeeded();
            return;
        }
        if (isComposerPanelVisible()) {
            closePanel("aux:earth-rise-composer");
            return;
        }
        ensureAuxiliaryPanelsEnabled();
        restoreComposerPanel();
        requestAnimationFrameImpl(syncFocusPillState);
    }

    function restoreAuxiliaryPanel(panelId) {
        ensureAuxiliaryPanelsEnabled();
        invokeFirstAvailablePanelAction(panelId, ["restore", "open", "focus"]);
        requestAnimationFrameImpl(syncFocusPillState);
    }

    function toggleAuxiliaryPanel(panelId) {
        if (!shouldAllowPanelShortcuts()) {
            closeMobileOnlyPanelsIfNeeded();
            return;
        }
        if (isAuxPanelVisible(panelId)) {
            closePanel(panelId);
            return;
        }
        restoreAuxiliaryPanel(panelId);
    }

    function restoreMediaPanel() {
        if (!shouldAllowPanelShortcuts() || !shouldAllowMediaPanel()) return;
        const restored = invokeFirstAvailablePanelAction("workflow:media-browser", ["restore", "open", "focus"]);
        if (!restored) {
            documentRef?.dispatchEvent?.(createCustomEvent("media-browser-panel-open"));
        }
        requestAnimationFrameImpl(syncFocusPillState);
    }

    function toggleMediaPanel() {
        if (!shouldAllowPanelShortcuts() || !shouldAllowMediaPanel()) {
            closeMobileOnlyPanelsIfNeeded();
            return;
        }
        if (isMediaPanelVisible()) {
            closePanel("workflow:media-browser");
            return;
        }
        restoreMediaPanel();
    }

    function restoreBackgroundPanel() {
        invokeFirstAvailablePanelAction("workflow:background-media", ["restore", "open", "focus"]);
        requestAnimationFrameImpl(syncFocusPillState);
    }

    function toggleBackgroundPanel() {
        if (!shouldAllowPanelShortcuts()) {
            closeMobileOnlyPanelsIfNeeded();
            return;
        }
        if (isBackgroundPanelVisible()) {
            closePanel("workflow:background-media");
            return;
        }
        restoreBackgroundPanel();
    }

    function toggleSplashdownPanel() {
        if (!shouldAllowPanelShortcuts()) {
            closeMobileOnlyPanelsIfNeeded();
            return;
        }
        if (!isArtemis2Mission()) return;
        if (isGroundTrackPanelVisible()) {
            closePanel("workflow:splashdown");
            return;
        }
        invokeFirstAvailablePanelAction("workflow:splashdown", ["restore", "open", "focus"]);
        documentRef?.dispatchEvent?.(createCustomEvent("ground-track-panel-open"));
        syncFocusPillState();
    }

    function bind() {
        if (bound) return;
        bound = true;

        const flybyPill = getElement("flyby-pill");
        const backgroundPill = getElement("panel-pill-background");
        const splashdownFocusPill = getElement("focus-pill-splashdown");
        const mediaPill = getElement("panel-pill-media");
        const craftMoonPill = getElement("panel-pill-craft-moon");
        const craftEarthPill = getElement("panel-pill-craft-earth");
        const earthOrbitXyPill = getElement("panel-pill-earth-orbit-xy");
        const burnButtonsHost = getElement("burnbuttons");

        if (flybyPill) {
            flybyPill.addEventListener("click", function () {
                toggleComposerPanel();
            });
        }

        backgroundPill?.addEventListener?.("click", toggleBackgroundPanel);

        if (splashdownFocusPill) {
            splashdownFocusPill.addEventListener("click", function () {
                toggleSplashdownPanel();
            });
        }

        mediaPill?.addEventListener?.("click", toggleMediaPanel);
        craftMoonPill?.addEventListener?.("click", () => toggleAuxiliaryPanel("aux:moon"));
        craftEarthPill?.addEventListener?.("click", () => toggleAuxiliaryPanel("aux:earth"));
        earthOrbitXyPill?.addEventListener?.("click", () => toggleAuxiliaryPanel("aux:earth-origin-orbit-xy"));

        if (burnButtonsHost && MutationObserverImpl) {
            const observer = new MutationObserverImpl(() => {
                syncFocusPillVisibility();
                syncFocusPillState();
            });
            observer.observe(burnButtonsHost, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["class", "data-event-key", "data-event-time-ms", "title"],
            });
        }

        const panelStateObserverTarget = documentRef?.body || documentRef?.documentElement || null;
        if (panelStateObserverTarget && MutationObserverImpl) {
            const observer = new MutationObserverImpl(() => {
                syncFocusPillState();
            });
            observer.observe(panelStateObserverTarget, {
                subtree: true,
                attributes: true,
                attributeFilter: ["class", "hidden", "data-panel-id"],
            });
        }

        documentRef?.addEventListener?.("ground-track-panel-visibilitychange", syncFocusPillState);
        documentRef?.addEventListener?.("mission-media-panel-state", syncFocusPillState);
        windowRef?.addEventListener?.("resize", () => {
            closeMobileOnlyPanelsIfNeeded();
            sync();
        });
        closeMobileOnlyPanelsIfNeeded();
        sync();
    }

    function sync() {
        syncFocusPillVisibility();
        syncFocusPillState();
    }

    return {
        bind,
        isArtemis2Mission,
        resolveTimelineEventButtonByKeys,
        restoreComposerPanel,
        sync,
        syncFocusPillState,
        syncFocusPillVisibility,
    };
}
