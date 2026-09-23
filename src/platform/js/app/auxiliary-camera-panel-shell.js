export function createAuxiliaryCameraPanelShell(spec, {
    AUTO_FOV_MAX_DEGREES,
    AUTO_FOV_MIN_DEGREES,
    COMPOSER_MANUAL_FOV_MAX_DEGREES,
    mountMissionFovControl,
}) {
    const panel = document.createElement("section");
    panel.className = "aux-camera-view mission-panel-shell";
    panel.dataset.target = spec.targetKey;
    panel.dataset.infoMode = spec.infoMode || "none";

    const header = document.createElement("div");
    header.className = "aux-camera-view__header mission-panel-shell__header";

    const title = document.createElement("div");
    title.className = "aux-camera-view__title mission-panel-shell__title";
    title.textContent = spec.title;
    header.appendChild(title);

    const headerControls = document.createElement("div");
    headerControls.className = "aux-camera-view__header-controls mission-panel-shell__header-controls";

    const isComposerPanel = spec.mode === "composer";
    const maxFovDegrees = isComposerPanel ? COMPOSER_MANUAL_FOV_MAX_DEGREES : AUTO_FOV_MAX_DEGREES;
    const fovControls = document.createElement("div");
    fovControls.className = "aux-camera-view__fov-controls";
    const fovControl = mountMissionFovControl(fovControls, {
        groupAriaLabel: `${spec.title} field of view`,
        autoButtonAriaLabel: `${spec.title} automatic field of view`,
        sliderAriaLabel: `${spec.title} zoom slider`,
        valueAriaLabel: `${spec.title} field of view value`,
        initialFovDegrees: spec.defaultFov,
        minDegrees: AUTO_FOV_MIN_DEGREES,
        maxDegrees: maxFovDegrees,
        classNames: {
            label: ["aux-camera-view__fov-label"],
            autoButton: ["aux-camera-view__auto-toggle"],
            track: ["aux-camera-view__fov-track"],
            edge: ["aux-camera-view__fov-edge"],
            slider: ["aux-camera-view__fov-slider"],
            value: ["aux-camera-view__fov-value"],
        },
    });
    const { autoButton: autoToggle, slider: fovSlider, value: fovValue } = fovControl;

    const createHeaderButton = ({ className, icon, label }) => {
        const button = document.createElement("button");
        button.className = className;
        button.type = "button";
        button.dataset.icon = icon;
        button.textContent = "";
        button.setAttribute("aria-label", label);
        return button;
    };
    const expandButton = createHeaderButton({
        className: "aux-camera-view__header-button aux-camera-view__expand-button mission-panel-shell__button mission-panel-shell__button--icon",
        icon: "expand",
        label: `Expand ${spec.title}`,
    });
    const infoButton = createHeaderButton({
        className: "aux-camera-view__header-button aux-camera-view__info-button mission-panel-shell__button mission-panel-shell__button--icon",
        icon: "info",
        label: `Show info for ${spec.title}`,
    });
    infoButton.dataset.panelInfoTrigger = "true";
    const closeButton = createHeaderButton({
        className: "aux-camera-view__header-button aux-camera-view__close-button mission-panel-shell__button mission-panel-shell__button--icon",
        icon: "close",
        label: `Close ${spec.title}`,
    });
    const deleteButton = createHeaderButton({
        className: "aux-camera-view__header-button aux-camera-view__delete-button mission-panel-shell__button mission-panel-shell__button--icon mission-panel-shell__button--danger",
        icon: "delete",
        label: `Delete ${spec.title}`,
    });

    let composerControlsToggleButton = null;
    if (isComposerPanel) {
        composerControlsToggleButton = document.createElement("button");
        composerControlsToggleButton.className = "aux-camera-view__composer-controls-toggle mission-panel-shell__button mission-panel-shell__button--icon";
        composerControlsToggleButton.type = "button";
        composerControlsToggleButton.textContent = "";
        composerControlsToggleButton.setAttribute("aria-label", "Collapse Frame and Shoot controls");
        composerControlsToggleButton.setAttribute("aria-expanded", "true");
        composerControlsToggleButton.title = "Collapse controls";
    }

    headerControls.append(infoButton, expandButton, closeButton, deleteButton);
    header.appendChild(headerControls);
    panel.appendChild(header);

    const panelMode = spec.mode || "target";
    const panelSide = spec.side === "left" ? "left" : "right";
    panel.dataset.mode = panelMode;
    panel.dataset.side = panelSide;
    let panelControls = null;
    if (isComposerPanel) {
        panel.classList.add("aux-camera-view--composer");
    } else {
        panelControls = document.createElement("div");
        panelControls.className = "aux-camera-view__panel-controls";
        panelControls.appendChild(fovControls);
        panel.appendChild(panelControls);
    }

    return {
        panel,
        header,
        headerControls,
        panelControls,
        panelMode,
        panelSide,
        maxFovDegrees,
        fovControls,
        fovControl,
        autoToggle,
        fovSlider,
        fovValue,
        expandButton,
        infoButton,
        closeButton,
        deleteButton,
        composerControlsToggleButton,
    };
}
