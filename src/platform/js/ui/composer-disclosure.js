import { resolveComposerSpaceLevel } from "../core/domain/workspace-disclosure.js";

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
    let disposed = false;
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
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-haspopup", "dialog");
        content.dataset.disclosureSurface = "true";
        content.setAttribute("aria-label", `Frame and Shoot ${label.toLowerCase()}`);
        const position = () => {
            const anchor = button.getBoundingClientRect();
            const rect = content.getBoundingClientRect();
            const left = Math.max(8, Math.min(anchor.left, windowRef.innerWidth - rect.width - 8));
            const top = Math.max(8, Math.min(anchor.bottom + 6, windowRef.innerHeight - rect.height - 8));
            content.style.setProperty("--disclosure-left", `${left}px`);
            content.style.setProperty("--disclosure-top", `${top}px`);
        };
        const onClick = event => {
            event.stopPropagation();
            if (content.matches(":popover-open")) content.hidePopover();
            else { content.showPopover(); position(); }
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
                const containedFocus = content.contains(documentRef.activeElement);
                if (content.matches(":popover-open")) content.hidePopover();
                if (level === "full") {
                    content.removeAttribute("popover");
                    content.removeAttribute("role");
                    if (containedFocus || documentRef.activeElement === button) content.querySelector("button, input, summary")?.focus();
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
    const schedule = () => { if (!disposed && frame === null) frame = windowRef.requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(viewport);
    entries.forEach(({ content }) => observer.observe(content));
    const onExternalPanelRequest = event => {
        const entry = entries.find(({ content }) => content.contains(event.detail?.trigger));
        if (entry?.content.matches(":popover-open")) {
            // Let the destination read its anchor before releasing our top layer.
            queueMicrotask(() => { if (entry.content.matches(":popover-open")) entry.content.hidePopover(); });
        }
    };
    documentRef.addEventListener("moon-mission:moon-render-panel-request", onExternalPanelRequest);
    windowRef.addEventListener("resize", schedule, { passive: true });
    schedule();
    return { dispose() {
        disposed = true;
        observer.disconnect();
        documentRef.removeEventListener("moon-mission:moon-render-panel-request", onExternalPanelRequest);
        if (frame !== null) windowRef.cancelAnimationFrame(frame);
        windowRef.removeEventListener("resize", schedule);
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

export { createComposerDisclosure };
