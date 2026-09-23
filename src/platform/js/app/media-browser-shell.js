import { isElementLike, createElement } from "./media-browser-dom.js";

export function prepareMediaBrowserShell({
    getNode,
    restoredPanelLayout,
    panelExpanded,
    defaultLayoutManaged,
    setDefaultLayoutManaged,
    bringPanelToFront,
}) {
    let restoredPosition = null;
    let restoredVisibilityState = null;

        const panel = getNode("media-browser-panel");
        const header = panel?.querySelector(".media-browser-panel__header");
        const headerControls = panel?.querySelector(".media-browser-panel__header-controls");
        let closeButton = getNode("media-browser-panel-close");
        const minimizeButton = getNode("media-browser-panel-minimize");
        let expandButton = getNode("media-browser-panel-expand");
        let infoButton = getNode("media-browser-panel-info");
        let deleteButton = getNode("media-browser-panel-delete");

        if (isElementLike(panel)) {
            const persistedWidth = Number(restoredPanelLayout?.width);
            const persistedHeight = Number(restoredPanelLayout?.height);
            if (Number.isFinite(persistedWidth) && persistedWidth > 0) {
                panel.style.width = `${Math.round(persistedWidth)}px`;
            }
            if (Number.isFinite(persistedHeight) && persistedHeight > 0) {
                panel.style.height = `${Math.round(persistedHeight)}px`;
            }
            const persistedX = Number(restoredPanelLayout?.x);
            const persistedY = Number(restoredPanelLayout?.y);
            if (Number.isFinite(persistedX) && Number.isFinite(persistedY)) {
                restoredPosition = {
                    x: Math.round(persistedX),
                    y: Math.round(persistedY),
                };
            }
            const persistedState = String(restoredPanelLayout?.state || "").trim().toLowerCase();
            if (persistedState === "open" || persistedState === "minimized" || persistedState === "closed" || persistedState === "deleted") {
                restoredVisibilityState = persistedState === "minimized" ? "closed" : persistedState;
            }
            panel.classList.toggle("is-maximized", panelExpanded === true);
            setDefaultLayoutManaged(defaultLayoutManaged, panel);
            panel.addEventListener?.("pointerdown", bringPanelToFront, true);
        }

        if (!infoButton && isElementLike(headerControls) && typeof headerControls.insertBefore === "function") {
            infoButton = createElement("button");
            if (!infoButton) return null;
            infoButton.id = "media-browser-panel-info";
            infoButton.className = "media-browser-panel__icon-button mission-panel-shell__button mission-panel-shell__button--icon";
            infoButton.type = "button";
            infoButton.title = "Info";
            infoButton.setAttribute("aria-label", "Show panel info");
            infoButton.dataset.icon = "info";
            infoButton.textContent = "";
            infoButton.dataset.panelInfoTrigger = "true";
            headerControls.insertBefore(infoButton, closeButton || null);
        }

        if (minimizeButton && typeof minimizeButton.remove === "function") {
            minimizeButton.remove();
        }

        if (!deleteButton && isElementLike(headerControls) && typeof headerControls.appendChild === "function") {
            deleteButton = createElement("button");
            if (!deleteButton) return null;
            deleteButton.id = "media-browser-panel-delete";
            deleteButton.className = "media-browser-panel__icon-button mission-panel-shell__button mission-panel-shell__button--icon mission-panel-shell__button--danger";
            deleteButton.type = "button";
            deleteButton.title = "Delete";
            deleteButton.setAttribute("aria-label", "Delete");
            deleteButton.dataset.icon = "delete";
            deleteButton.textContent = "";
            headerControls.appendChild(deleteButton);
        }

    return { panel, header, closeButton, expandButton, infoButton, deleteButton,
        restoredPosition, restoredVisibilityState };
}
