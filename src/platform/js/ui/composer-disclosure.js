import { resolveComposerSpaceLevel } from "../core/domain/workspace-disclosure.js";

function resolveElementRealm(element, { windowRef = globalThis?.window, documentRef = globalThis?.document } = {}) {
    const ownerDocument = element?.ownerDocument || documentRef || null;
    return {
        documentRef: ownerDocument,
        windowRef: ownerDocument?.defaultView || windowRef || null,
    };
}

function resolveComposerDisclosurePosition({ anchorRect, contentRect, viewportWidth, viewportHeight }) {
    const width = Math.max(1, Number(viewportWidth) || 1);
    const height = Math.max(1, Number(viewportHeight) || 1);
    const contentWidth = Math.max(0, Number(contentRect?.width) || 0);
    const contentHeight = Math.max(0, Number(contentRect?.height) || 0);
    return {
        left: Math.max(8, Math.min(Number(anchorRect?.left) || 0, width - contentWidth - 8)),
        top: Math.max(8, Math.min((Number(anchorRect?.bottom) || 0) + 6, height - contentHeight - 8)),
    };
}

// Keep the original controls and listeners in place. Native popovers lift them
// above clipping ancestors without duplicating camera or mission state.
function createComposerDisclosure({ panel, viewport, windowRef = window, documentRef = document }) {
    const launchers = documentRef.createElement("div");
    launchers.className = "composer-disclosure-launchers";
    const stopDrag = event => event.stopPropagation();
    launchers.addEventListener("pointerdown", stopDrag);
    viewport.appendChild(launchers);
    let level = "full";
    let frame = null;
    let cancelFrame = null;
    let disposed = false;
    let observer = null;
    let realmWindow = null;
    let realmDocument = null;
    const entries = [
        [".aux-camera-view__composer-sky-controls", "View options"],
        [".aux-camera-view__composer-sky-timeline", "Time controls"],
    ].map(([selector, label], index) => {
        const content = viewport.querySelector(selector);
        if (!content) return null;
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "composer-disclosure-launcher";
        button.textContent = label;
        content.id ||= `${panel.id || "composer"}-disclosure-${index}`;
        button.setAttribute("aria-controls", content.id);
        button.setAttribute("popovertarget", content.id);
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-haspopup", "dialog");
        content.dataset.disclosureSurface = "true";
        content.setAttribute("aria-label", `Frame and Shoot ${label.toLowerCase()}`);
        const position = () => {
            const anchor = button.getBoundingClientRect();
            const rect = content.getBoundingClientRect();
            const realm = resolveElementRealm(button, { windowRef, documentRef });
            const { left, top } = resolveComposerDisclosurePosition({
                anchorRect: anchor,
                contentRect: rect,
                viewportWidth: realm.windowRef?.innerWidth,
                viewportHeight: realm.windowRef?.innerHeight,
            });
            content.style.setProperty("--disclosure-left", `${left}px`);
            content.style.setProperty("--disclosure-top", `${top}px`);
        };
        const onClick = event => {
            event.stopPropagation();
        };
        const onToggle = event => {
            const open = event.newState === "open";
            button.setAttribute("aria-expanded", String(open));
            if (open) position();
        };
        button.addEventListener("click", onClick);
        content.addEventListener("toggle", onToggle);
        launchers.appendChild(button);
        return { content, button, position, onClick, onToggle };
    }).filter(Boolean);

    function update() {
        frame = null;
        cancelFrame = null;
        if (disposed) return;
        const { width, height } = viewport.getBoundingClientRect();
        if (width === 0 || height === 0) {
            entries.forEach(({ content }) => { if (content.matches(":popover-open")) content.hidePopover(); });
            return;
        }
        const next = resolveComposerSpaceLevel(width, height);
        if (next !== level || !panel.dataset.spaceLevel) {
            level = next;
            panel.dataset.spaceLevel = level;
            launchers.hidden = level === "full";
            for (const { content, button } of entries) {
                const activeDocument = content.ownerDocument || realmDocument || documentRef;
                const containedFocus = content.contains(activeDocument.activeElement);
                if (content.matches(":popover-open")) content.hidePopover();
                if (level === "full") {
                    content.removeAttribute("popover");
                    content.removeAttribute("role");
                    if (containedFocus || activeDocument.activeElement === button) content.querySelector("button, input, summary")?.focus();
                } else {
                    content.setAttribute("popover", "auto");
                    content.setAttribute("role", "dialog");
                    if (containedFocus) button.focus();
                }
                button.setAttribute("aria-expanded", "false");
            }
        }
        entries.forEach(entry => { if (entry.content.matches(":popover-open")) entry.position(); });
    }
    const schedule = () => {
        if (disposed || frame !== null) return;
        const requestFrame = realmWindow?.requestAnimationFrame?.bind(realmWindow)
            || windowRef?.requestAnimationFrame?.bind(windowRef);
        if (requestFrame) {
            frame = requestFrame(update);
            cancelFrame = () => (realmWindow?.cancelAnimationFrame || windowRef?.cancelAnimationFrame)?.(frame);
        } else {
            frame = setTimeout(update, 0);
            cancelFrame = () => clearTimeout(frame);
        }
    };
    const onExternalPanelRequest = event => {
        const entry = entries.find(({ content }) => content.contains(event.detail?.trigger));
        if (entry?.content.matches(":popover-open")) {
            // Let the destination read its anchor before releasing our top layer.
            queueMicrotask(() => { if (entry.content.matches(":popover-open")) entry.content.hidePopover(); });
        }
    };
    const unbindRealm = () => {
        if (frame !== null) {
            cancelFrame?.();
            frame = null;
            cancelFrame = null;
        }
        observer?.disconnect?.();
        observer = null;
        realmDocument?.removeEventListener?.("moon-mission:moon-render-panel-request", onExternalPanelRequest);
        realmWindow?.removeEventListener?.("resize", schedule);
    };
    const bindRealm = () => {
        if (disposed) return;
        const next = resolveElementRealm(panel, { windowRef, documentRef });
        if (next.windowRef === realmWindow && next.documentRef === realmDocument && observer) {
            schedule();
            return;
        }
        unbindRealm();
        realmWindow = next.windowRef;
        realmDocument = next.documentRef;
        const ResizeObserverClass = realmWindow?.ResizeObserver || globalThis?.ResizeObserver;
        observer = typeof ResizeObserverClass === "function" ? new ResizeObserverClass(schedule) : null;
        observer?.observe?.(viewport);
        entries.forEach(({ content }) => observer?.observe?.(content));
        realmDocument?.addEventListener?.("moon-mission:moon-render-panel-request", onExternalPanelRequest);
        realmWindow?.addEventListener?.("resize", schedule, { passive: true });
        schedule();
    };
    const onRealmChange = () => queueMicrotask(() => { if (!disposed) bindRealm(); });
    for (const eventName of ["moon-mission:dockview-panel-mounted", "moon-mission:dockview-panel-unmounted", "moon-mission:dockview-panel-layout"]) {
        panel.addEventListener(eventName, onRealmChange);
    }
    bindRealm();
    return { dispose() {
        disposed = true;
        for (const eventName of ["moon-mission:dockview-panel-mounted", "moon-mission:dockview-panel-unmounted", "moon-mission:dockview-panel-layout"]) {
            panel.removeEventListener(eventName, onRealmChange);
        }
        unbindRealm();
        entries.forEach(({ content, button, onClick, onToggle }) => {
            if (content.matches(":popover-open")) content.hidePopover();
            content.removeAttribute("popover");
            content.removeEventListener("toggle", onToggle);
            button.removeEventListener("click", onClick);
        });
        launchers.remove();
        launchers.removeEventListener("pointerdown", stopDrag);
    } };
}

export { createComposerDisclosure, resolveComposerDisclosurePosition, resolveElementRealm };
