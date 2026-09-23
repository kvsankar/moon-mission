import * as shared from "./auxiliary-camera-shared.js";

const {
    AUX_FOV_PREFERENCE_VERSION,
    COMPOSER_AUTO_FOV_PREFERENCE_VERSION,
    COMPOSER_CONTROLS_COLLAPSE_STATE_VERSION,
    COMPOSER_DEFAULT_ASPECT_RATIO,
    COMPOSER_STAR_LABEL_CATALOG,
    COMPOSER_STAR_MAGNITUDE_DEFAULT,
    COMPOSER_STAR_MAGNITUDE_MAX,
    COMPOSER_STAR_MAGNITUDE_MIN,
    PANEL_ABOUT_ALIGNED_MIN_VIEWPORT_WIDTH,
    PANEL_CSS_MIN_SIDE_DEFAULT,
    PANEL_DEFAULT_HEIGHT_RATIO,
    PANEL_DEFAULT_HEIGHT_RATIO_COMPOSER,
    PANEL_DEFAULT_WIDTH_COMPOSER,
    PANEL_GAP_PX,
    PANEL_MARGIN_PX,
    PANEL_MIN_SIDE_COMPOSER,
    PANEL_MIN_SIDE_DEFAULT,
    PANEL_SPECS,
    PANEL_STATE_STORAGE_KEY,
    PANEL_TOP_OFFSET_PX,
    PANEL_TRANSPORT_CLEARANCE_PX,
    STAR_NAME_CROSS_INDEX,
    asTrimmedString,
    focusDockviewWorkflowPanel,
    normalizeMissionPanelState,
    resolveStarDisplayName,
    safeParseJson,
    updateMissionPanel,
    writeMissionPanelStates,
} = shared;

export const panelLayoutMethods = {
    getPanelResizeObserver() {
        if (typeof ResizeObserver === "undefined") {
            return null;
        }
        if (!this.panelResizeObserver) {
            this.panelResizeObserver = new ResizeObserver(this.handlePanelResizeEntriesBound);
        }
        return this.panelResizeObserver;
    },
    createDom() {
        this.root = document.createElement("div");
        this.root.id = "aux-camera-views";
        this.root.className = "aux-camera-views";
        this.overlayHost.appendChild(this.root);

        PANEL_SPECS.forEach((spec, index) => {
            this.createPanel(spec, index);
        });

        this.applyDefaultPanelLayout();
        this.scheduleDefaultPanelLayout();
    },
    readPersistedPanelState() {
        const storage = globalThis?.localStorage;
        if (!storage) {
            return {};
        }
        let raw = null;
        try {
            raw = storage.getItem(PANEL_STATE_STORAGE_KEY);
        } catch {
            return {};
        }
        if (!raw) {
            return {};
        }
        const parsed = safeParseJson(raw, {});
        return parsed && typeof parsed === "object" ? parsed : {};
    },
    queuePersistPanelState() {
        if (this.persistStateTimeout != null) {
            clearTimeout(this.persistStateTimeout);
        }
        this.persistStateTimeout = setTimeout(() => {
            this.persistStateTimeout = null;
            this.persistPanelState();
        }, 120);
    },
    persistPanelState() {
        const storage = globalThis?.localStorage;
        const payload = {};
        const layoutPayload = {};
        for (const panelState of this.panels) {
            const persistedFov = panelState.camera?.isOrthographicCamera
                ? panelState.orbitZoomFovDegrees
                : panelState.camera?.fov;
            payload[panelState.id] = {
                fovPreferenceVersion: AUX_FOV_PREFERENCE_VERSION,
                fov: Number.isFinite(persistedFov) ? Number(persistedFov) : null,
                composerControlsCollapsed: panelState.composerControlsCollapsed === true,
                composerControlsCollapseVersion: panelState.mode === "composer"
                    ? COMPOSER_CONTROLS_COLLAPSE_STATE_VERSION
                    : undefined,
                composerAutoFovPreferenceVersion: panelState.mode === "composer"
                    ? COMPOSER_AUTO_FOV_PREFERENCE_VERSION
                    : undefined,
                composerExposureEv: panelState.mode === "composer" &&
                    Number.isFinite(Number(panelState.composerExposureEv))
                    ? Number(panelState.composerExposureEv)
                    : undefined,
                composerAutoExposureEnabled: panelState.mode === "composer"
                    ? panelState.composerAutoExposureEnabled !== false
                    : undefined,
            };
            layoutPayload[panelState.panelRegistryId] = {
                x: Math.round(Number.isFinite(panelState.x) ? panelState.x : panelState.panel.offsetLeft || 0),
                y: Math.round(Number.isFinite(panelState.y) ? panelState.y : panelState.panel.offsetTop || 0),
                width: Math.round(panelState.panel.offsetWidth || panelState.width || 0),
                height: Math.round(panelState.panel.offsetHeight || panelState.height || 0),
                state: this.getPanelRegistryState(panelState),
                maximized: panelState.maximized === true,
                layoutPresetVersion: asTrimmedString(panelState.layoutPresetVersion),
                restoreFrame: panelState.restoreFrame && typeof panelState.restoreFrame === "object"
                    ? {
                        x: Math.round(Number(panelState.restoreFrame.x) || 0),
                        y: Math.round(Number(panelState.restoreFrame.y) || 0),
                        width: Math.round(Number(panelState.restoreFrame.width) || 0),
                        height: Math.round(Number(panelState.restoreFrame.height) || 0),
                    }
                    : null,
            };
        }
        if (!storage) {
            writeMissionPanelStates(layoutPayload);
            return;
        }
        try {
            storage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            // Ignore persistence failures (privacy mode/quota).
        }
        writeMissionPanelStates(layoutPayload);
    },
    getPanelRegistryState(panelState) {
        if (!panelState || panelState.missionEnabled !== true) {
            return "unavailable";
        }
        if (panelState.deleted === true) {
            return "deleted";
        }
        if (panelState.closed === true) {
            return "closed";
        }
        if (panelState.minimized === true) {
            return "closed";
        }
        return "open";
    },
    syncPanelRegistry(panelState) {
        if (!panelState?.panelRegistryId) {
            return;
        }
        const panelStateName = this.getPanelRegistryState(panelState);
        const infoItems = panelState.mode === "composer"
            ? [
                { label: "Panel Kind", value: "Flyby workflow" },
                { label: "Mode", value: "composer" },
            ]
            : [
                { label: "Panel Kind", value: "view" },
                { label: "Anchor", value: panelState.anchorKey || "--" },
                { label: "Target", value: panelState.targetKey || "--" },
            ];

        updateMissionPanel(panelState.panelRegistryId, {
            id: panelState.panelRegistryId,
            title: panelState.title,
            kind: panelState.mode === "composer" ? "workflow" : "view",
            panelType: panelState.mode === "composer" ? "flyby-focus" : "aux-camera-view",
            builtIn: true,
            available: panelState.missionEnabled === true,
            state: panelStateName,
            sortOrder: panelState.sortOrder,
            infoItems,
            actions: {
                open: () => this.restorePanel(panelState),
                restore: () => this.restorePanel(panelState),
                restoreGuided: panelState.mode === "composer"
                    ? () => this.restoreComposerGuidedPanel(panelState)
                    : undefined,
                focus: panelStateName === "open"
                    ? () => { this.restorePanel(panelState); focusDockviewWorkflowPanel(panelState.panelRegistryId); }
                    : undefined,
                close: panelStateName === "open"
                    ? () => this.setPanelClosed(panelState, true)
                    : undefined,
                delete: panelStateName !== "deleted"
                    ? () => this.confirmAndDeletePanel(panelState)
                    : undefined,
            },
        });
        if (panelState.mode === "composer") {
            this.syncComposerControlsPanelRegistry(panelState);
        }
    },
    applyPanelVisibilityState(panelState, state, { persist = true, requestRender = true } = {}) {
        if (!panelState) {
            return;
        }
        const nextState = normalizeMissionPanelState(state, "open");
        if (nextState === "deleted") {
            this.setPanelDeleted(panelState, true, { persist, requestRender });
            return;
        }
        if (nextState === "closed") {
            this.setPanelClosed(panelState, true, { persist, requestRender });
            return;
        }
        if (nextState === "minimized") {
            this.setPanelClosed(panelState, true, { persist, requestRender });
            return;
        }
        panelState.deleted = false;
        panelState.closed = false;
        this.setPanelMinimized(panelState, false, { persist, requestRender });
    },
    confirmAndDeletePanel(panelState) {
        const confirmFn = globalThis?.confirm;
        if (typeof confirmFn === "function") {
            const accepted = confirmFn(
                `Delete "${panelState?.title || "panel"}" from this mission layout? You can add it back from the Panels menu.`,
            );
            if (!accepted) {
                return false;
            }
        }
        this.setPanelDeleted(panelState, true);
        return true;
    },
    resolveComposerBrightStarLabelDescriptors(maxMagnitude = COMPOSER_STAR_MAGNITUDE_DEFAULT) {
        const catalog = Array.isArray(COMPOSER_STAR_LABEL_CATALOG)
            ? COMPOSER_STAR_LABEL_CATALOG
            : null;
        const boundedMaxMagnitude = this.THREE.MathUtils.clamp(
            Number(maxMagnitude),
            COMPOSER_STAR_MAGNITUDE_MIN,
            COMPOSER_STAR_MAGNITUDE_MAX,
        );
        if (!catalog || catalog.length === 0) {
            this.composerBrightStarCatalogRef = null;
            this.composerBrightStarLabelDescriptors = [];
            return this.composerBrightStarLabelDescriptors;
        }
        if (
            this.composerBrightStarCatalogRef === catalog &&
            this.composerBrightStarMagnitudeLimit === boundedMaxMagnitude &&
            this.composerBrightStarLabelDescriptors.length > 0
        ) {
            return this.composerBrightStarLabelDescriptors;
        }

        const descriptors = [];
        const seenLabels = new Set();
        for (let i = 0; i < catalog.length; i += 1) {
            const star = catalog[i];
            const magnitude = Number(star?.vmag);
            const raDeg = Number(star?.raDeg);
            const decDeg = Number(star?.decDeg);
            if (!Number.isFinite(magnitude) || magnitude > boundedMaxMagnitude) {
                continue;
            }
            if (!Number.isFinite(raDeg) || !Number.isFinite(decDeg)) {
                continue;
            }
            const label = resolveStarDisplayName(star, STAR_NAME_CROSS_INDEX);
            if (!label) {
                continue;
            }
            const dedupeKey = label.toLowerCase();
            if (seenLabels.has(dedupeKey)) {
                continue;
            }
            seenLabels.add(dedupeKey);
            const raRad = this.THREE.MathUtils.degToRad(raDeg);
            const decRad = this.THREE.MathUtils.degToRad(decDeg);
            const cosDec = Math.cos(decRad);
            descriptors.push({
                text: label,
                magnitude,
                localDirection: {
                    x: cosDec * Math.cos(raRad),
                    y: -cosDec * Math.sin(raRad),
                    z: Math.sin(decRad),
                },
            });
        }
        descriptors.sort((a, b) => (a.magnitude - b.magnitude) || a.text.localeCompare(b.text));
        this.composerBrightStarCatalogRef = catalog;
        this.composerBrightStarMagnitudeLimit = boundedMaxMagnitude;
        this.composerBrightStarLabelDescriptors = descriptors;
        return this.composerBrightStarLabelDescriptors;
    },
    readTimelineDockOffset() {
        const cssValue = getComputedStyle(document.documentElement)
            .getPropertyValue("--timeline-dock-offset")
            .trim();
        const parsed = Number.parseFloat(cssValue);
        return Number.isFinite(parsed) ? parsed : PANEL_MARGIN_PX;
    },
    handleExternalLayoutRequest() {
        if (!this.root) {
            return;
        }
        this.scheduleDefaultPanelLayout();
    },
    clampPanelRect({ x, y, width, height }) {
        const viewportWidth = Math.max(window.innerWidth, 1);
        const viewportHeight = Math.max(window.innerHeight, 1);
        const maxX = Math.max(PANEL_MARGIN_PX, viewportWidth - width - PANEL_MARGIN_PX);
        const maxY = Math.max(PANEL_MARGIN_PX, viewportHeight - height - PANEL_MARGIN_PX);
        return {
            x: Math.min(Math.max(Math.round(x), PANEL_MARGIN_PX), maxX),
            y: Math.min(Math.max(Math.round(y), PANEL_MARGIN_PX), maxY),
        };
    },
    getDefaultPanelPosition(panel, index) {
        const width = Math.max(120, Math.round(panel.offsetWidth || 280));
        const height = Math.max(80, Math.round(panel.offsetHeight || 192));
        const dockOffset = this.readTimelineDockOffset();
        const x = window.innerWidth - width - dockOffset;
        const y = dockOffset + PANEL_TOP_OFFSET_PX + index * (height + PANEL_GAP_PX);
        return this.clampPanelRect({
            x,
            y,
            width,
            height,
        });
    },
    resolvePanelViewportBounds() {
        const viewportWidth = Math.max(window.innerWidth, 1);
        const viewportHeight = Math.max(window.innerHeight, 1);
        const headerEl = document.querySelector(".header");
        const controlPanelEl = document.getElementById("control-panel");
        const timelineEl = document.querySelector(".timeline-dock");
        const headerRect = headerEl?.getBoundingClientRect?.() || null;
        const controlPanelRect = controlPanelEl?.getBoundingClientRect?.() || null;
        const timelineRect = timelineEl?.getBoundingClientRect?.() || null;
        const left = PANEL_MARGIN_PX;
        const right = viewportWidth - PANEL_MARGIN_PX;
        const top = Number.isFinite(headerRect?.bottom)
            ? Math.round(headerRect.bottom + PANEL_GAP_PX)
            : (this.readTimelineDockOffset() + PANEL_TOP_OFFSET_PX);
        const transportTop = Number.isFinite(controlPanelRect?.top) &&
            controlPanelRect.width > 0 &&
            controlPanelRect.height > 0 &&
            controlPanelEl?.hidden !== true
            ? controlPanelRect.top
            : Number.NaN;
        const timelineTop = Number.isFinite(timelineRect?.top)
            ? timelineRect.top
            : Number.NaN;
        const bottomBoundary = Math.min(
            Number.isFinite(transportTop) ? transportTop : Infinity,
            Number.isFinite(timelineTop) ? timelineTop : Infinity,
        );
        const bottom = Number.isFinite(bottomBoundary)
            ? Math.round(bottomBoundary - PANEL_TRANSPORT_CLEARANCE_PX)
            : (viewportHeight - PANEL_MARGIN_PX);
        return {
            left,
            top,
            right,
            bottom,
            width: Math.max(160, right - left),
            height: Math.max(160, bottom - top),
        };
    },
    resolveRightStackTop({ bounds, columnLeft, columnRight }) {
        if (window.innerWidth < PANEL_ABOUT_ALIGNED_MIN_VIEWPORT_WIDTH) {
            return bounds.top;
        }

        const toggleRect = document.getElementById("blurb-toggle")?.getBoundingClientRect?.() || null;
        const toggleBottom = Number.isFinite(toggleRect?.bottom)
            ? Math.round(toggleRect.bottom)
            : null;
        let top = toggleBottom == null
            ? bounds.top
            : toggleBottom + PANEL_GAP_PX;

        const headerControls = document.querySelectorAll(
            "#header-pill-strip button:not([hidden]), #header-pill-strip .header-pill-group:not([hidden])",
        );
        for (const control of headerControls) {
            const rect = control?.getBoundingClientRect?.();
            if (!rect || rect.width <= 0 || rect.height <= 0) {
                continue;
            }
            const overlapsColumn = rect.left < columnRight && rect.right > columnLeft;
            if (overlapsColumn) {
                top = Math.max(top, Math.round(rect.bottom) + PANEL_GAP_PX);
            }
        }

        return Math.max(PANEL_MARGIN_PX, top);
    },
    getManagedMediaBrowserPanel() {
        const documentRef = typeof document !== "undefined" ? document : null;
        const panel = typeof documentRef?.getElementById === "function"
            ? documentRef.getElementById("media-browser-panel")
            : null;
        if (!panel || panel.classList.contains("media-browser-panel--hidden")) {
            return null;
        }
        if (panel.classList.contains("is-maximized") || panel.dataset.defaultLayoutManaged === "false") {
            return null;
        }
        return panel;
    },
    applyManagedMediaBrowserFrame(frame) {
        const panel = this.getManagedMediaBrowserPanel();
        if (!panel || typeof CustomEvent !== "function") {
            return false;
        }
        panel.dispatchEvent(new CustomEvent("moon-mission:media-browser-default-frame", {
            detail: frame,
        }));
        return true;
    },
    capturePanelFrame(panelState) {
        if (!panelState?.panel) {
            return null;
        }
        const panel = panelState.panel;
        return {
            x: Math.round(Number.isFinite(panelState.x) ? panelState.x : (panel.offsetLeft || 0)),
            y: Math.round(Number.isFinite(panelState.y) ? panelState.y : (panel.offsetTop || 0)),
            width: Math.round(panel.offsetWidth || panelState.width || 0),
            height: Math.round(panel.offsetHeight || panelState.height || 0),
        };
    },
    normalizePanelRestoreFrame(frame, fallbackFrame = null) {
        const source = frame && typeof frame === "object" ? frame : null;
        if (!source) {
            return fallbackFrame;
        }
        const width = Math.round(Number(source.width) || 0);
        const height = Math.round(Number(source.height) || 0);
        const x = Math.round(Number(source.x) || 0);
        const y = Math.round(Number(source.y) || 0);
        if (width <= 0 || height <= 0) {
            return fallbackFrame;
        }
        return { x, y, width, height };
    },
    resolveMaximizedPanelFrame(panelState) {
        const bounds = this.resolvePanelViewportBounds();
        if (panelState?.mode === "composer") {
            let width = Math.max(
                PANEL_MIN_SIDE_COMPOSER,
                Math.min(bounds.width, Math.round(bounds.height * COMPOSER_DEFAULT_ASPECT_RATIO)),
            );
            let height = Math.round(width / COMPOSER_DEFAULT_ASPECT_RATIO);
            if (height > bounds.height) {
                height = bounds.height;
                width = Math.round(height * COMPOSER_DEFAULT_ASPECT_RATIO);
            }
            width = Math.max(PANEL_MIN_SIDE_COMPOSER, Math.min(width, bounds.width));
            height = Math.max(PANEL_MIN_SIDE_COMPOSER, Math.min(height, bounds.height));
            return {
                x: Math.round(bounds.left + ((bounds.width - width) * 0.5)),
                y: Math.round(bounds.top + ((bounds.height - height) * 0.5)),
                width,
                height,
            };
        }

        const side = Math.max(PANEL_MIN_SIDE_DEFAULT, Math.min(bounds.width, bounds.height));
        return {
            x: Math.round(bounds.left + ((bounds.width - side) * 0.5)),
            y: Math.round(bounds.top + ((bounds.height - side) * 0.5)),
            width: side,
            height: side,
        };
    },
    applyMaximizedPanelFrame(panelState) {
        if (!panelState?.panel) {
            return;
        }
        const nextFrame = this.resolveMaximizedPanelFrame(panelState);
        panelState.panel.style.width = `${nextFrame.width}px`;
        panelState.panel.style.height = `${nextFrame.height}px`;
        this.applyPanelPosition(panelState, nextFrame.x, nextFrame.y);
    },
    syncPanelExpandButton(panelState) {
        const button = panelState?.expandButton;
        if (!button) {
            return;
        }
        const maximized = panelState.maximized === true;
        button.dataset.icon = maximized ? "restore" : "expand";
        button.textContent = "";
        button.title = maximized ? `Restore ${panelState.title}` : `Expand ${panelState.title}`;
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", maximized ? "true" : "false");
    },
    resolveComposerRequiredPanelHeight(panelState) {
        if (!panelState || panelState.mode !== "composer" || !panelState.panel) {
            return Number.NaN;
        }
        const header = panelState.panel.querySelector(".aux-camera-view__header");
        const controls = panelState.panel.querySelector(".aux-camera-view__composer-control-matrix");
        if (!header || !controls) {
            return Number.NaN;
        }
        const headerHeight = Math.ceil(header.getBoundingClientRect().height || 0);
        const controlsHeight = Math.ceil(controls.scrollHeight || 0);
        if (headerHeight <= 0 || controlsHeight <= 0) {
            return Number.NaN;
        }
        return headerHeight + controlsHeight + PANEL_GAP_PX;
    },
    scheduleDefaultPanelLayout() {
        if (this.defaultLayoutRaf != null) {
            cancelAnimationFrame(this.defaultLayoutRaf);
        }
        this.defaultLayoutRaf = requestAnimationFrame(() => {
            this.defaultLayoutRaf = null;
            if (!this.root) {
                return;
            }
            this.applyDefaultPanelLayout();
            this.queuePersistPanelState();
            this.requestRender?.();
        });
    },
    applyDefaultPanelLayout() {
        if (!this.panels.length) {
            return;
        }
        const viewportWidth = Math.max(window.innerWidth, 1);
        const viewportHeight = Math.max(window.innerHeight, 1);
        const bounds = this.resolvePanelViewportBounds();
        const dockOffset = this.readTimelineDockOffset();
        const maxSideFromWidth = Math.max(PANEL_MIN_SIDE_DEFAULT, viewportWidth - dockOffset - PANEL_MARGIN_PX * 2);
        const maxPanelWidth = Math.max(PANEL_MIN_SIDE_DEFAULT, viewportWidth - (PANEL_MARGIN_PX * 2));
        const maxPanelHeight = Math.max(PANEL_MIN_SIDE_DEFAULT, bounds.height);
        const panelRects = this.panels
            .filter((panelState) => panelState.defaultLayoutManaged !== false)
            .filter((panelState) => panelState.panel?.hidden !== true)
            .map((panelState) => {
            const isComposer = panelState.mode === "composer";
            const sideFromFormula = PANEL_DEFAULT_HEIGHT_RATIO * viewportHeight;
            const composerHeightFromFormula = PANEL_DEFAULT_HEIGHT_RATIO_COMPOSER * viewportHeight;
            const minSideTarget = isComposer ? PANEL_MIN_SIDE_COMPOSER : PANEL_MIN_SIDE_DEFAULT;
            const minSide = Math.min(minSideTarget, maxSideFromWidth);
            let width = isComposer
                ? Math.round(this.THREE.MathUtils.clamp(PANEL_DEFAULT_WIDTH_COMPOSER, minSide, maxPanelWidth))
                : Math.round(this.THREE.MathUtils.clamp(sideFromFormula, minSide, maxSideFromWidth));
            let height = isComposer
                ? Math.round(this.THREE.MathUtils.clamp(composerHeightFromFormula, minSide, maxPanelHeight))
                : width;
            if (isComposer) {
                // The controls column scrolls; don't let controls force the shooting frame huge.
                panelState.panel.style.width = `${width}px`;
            }
            panelState.panel.style.width = `${width}px`;
            panelState.panel.style.height = `${height}px`;
            return { panelState, width, height };
            });

        const composerRects = panelRects.filter((item) => item.panelState.mode === "composer");
        const rightPanelOrder = new Map([
            ["moon", 0],
            ["earth", 1],
            ["earth-to-moon", 2],
            ["earth-origin-orbit-xy", 3],
        ]);
        const rightPanelRects = panelRects
            .filter((item) => item.panelState.mode !== "composer" && item.panelState.side !== "left")
            .sort((a, b) => {
                const aOrder = rightPanelOrder.get(a.panelState.id) ?? Number.MAX_SAFE_INTEGER;
                const bOrder = rightPanelOrder.get(b.panelState.id) ?? Number.MAX_SAFE_INTEGER;
                return aOrder - bOrder;
            });
        const threePanelStackCanFit = rightPanelRects.length === 3 &&
            Math.floor((bounds.height - (2 * PANEL_GAP_PX)) / 3) >= PANEL_CSS_MIN_SIDE_DEFAULT;
        if (threePanelStackCanFit) {
            const preferredSide = Math.min(...rightPanelRects.map((item) => Math.min(item.width, item.height)));
            const maxSideFromHeight = Math.floor((bounds.height - (2 * PANEL_GAP_PX)) / 3);
            const mediaBrowserPanel = composerRects.length > 0 ? this.getManagedMediaBrowserPanel() : null;

            if (mediaBrowserPanel && composerRects.length > 0) {
                const mediaRect = mediaBrowserPanel.getBoundingClientRect?.() || null;
                const mediaWidth = Math.round(mediaRect?.width || mediaBrowserPanel.offsetWidth || 0);
                const mediaHeight = Math.round(mediaRect?.height || mediaBrowserPanel.offsetHeight || 0);
                const composerItem = composerRects[0];
                const composerWidth = Math.round(composerItem.width || composerItem.panelState.panel.offsetWidth || 0);
                const composerHeight = Math.round(composerItem.height || composerItem.panelState.panel.offsetHeight || 0);
                const maxColumnSide = Math.min(preferredSide, maxSideFromHeight);
                const sceneGapWidth = Math.max(
                    88,
                    Math.min(maxColumnSide, Math.round(bounds.width * 0.1)),
                );
                const maxSideFromWidth = Math.floor(
                    bounds.width - mediaWidth - sceneGapWidth - composerWidth - PANEL_GAP_PX,
                );
                if (
                    mediaWidth > 0 &&
                    mediaHeight > 0 &&
                    composerWidth > 0 &&
                    composerHeight > 0 &&
                    maxSideFromWidth >= PANEL_MIN_SIDE_DEFAULT
                ) {
                    const columnSide = Math.max(
                        PANEL_MIN_SIDE_DEFAULT,
                        Math.min(maxColumnSide, maxSideFromWidth),
                    );
                    const columnLeft = Math.round(bounds.right - columnSide);
                    const columnRight = columnLeft + columnSide;
                    const composerLeft = Math.round(columnLeft - PANEL_GAP_PX - composerWidth);
                    const mediaLeft = Math.round(bounds.left);
                    const columnTop = this.resolveRightStackTop({
                        bounds,
                        columnLeft,
                        columnRight,
                    });
                    const pairHeight = Math.max(mediaHeight, composerHeight);
                    const pairTop = bounds.top;

                    rightPanelRects.forEach((item, index) => {
                        item.width = columnSide;
                        item.height = columnSide;
                        item.panelState.panel.style.width = `${columnSide}px`;
                        item.panelState.panel.style.height = `${columnSide}px`;
                        this.applyPanelPosition(
                            item.panelState,
                            columnLeft,
                            columnTop + (index * (columnSide + PANEL_GAP_PX)),
                        );
                    });

                    for (const item of composerRects) {
                        this.applyPanelPosition(
                            item.panelState,
                            composerLeft,
                            pairTop + Math.round((pairHeight - composerHeight) * 0.5),
                        );
                    }

                    this.applyManagedMediaBrowserFrame({
                        x: mediaLeft,
                        y: pairTop + Math.round((pairHeight - mediaHeight) * 0.5),
                        width: mediaWidth,
                        height: mediaHeight,
                    });
                    return;
                }
            }

            const composerWidth = composerRects.length ? Math.max(...composerRects.map((item) => item.width)) : 0;
            const maxSideFromWidth = Math.floor(
                bounds.width - (composerWidth > 0 ? composerWidth + PANEL_GAP_PX : 0),
            );
            const columnSide = Math.max(
                PANEL_MIN_SIDE_DEFAULT,
                Math.min(preferredSide, maxSideFromHeight, maxSideFromWidth),
            );
            const columnHeight = (3 * columnSide) + (2 * PANEL_GAP_PX);
            const columnLeft = Math.round(bounds.right - columnSide);
            const columnRight = columnLeft + columnSide;
            const columnTop = this.resolveRightStackTop({
                bounds,
                columnLeft,
                columnRight,
            });

            rightPanelRects.forEach((item, index) => {
                item.width = columnSide;
                item.height = columnSide;
                item.panelState.panel.style.width = `${columnSide}px`;
                item.panelState.panel.style.height = `${columnSide}px`;
                this.applyPanelPosition(
                    item.panelState,
                    columnLeft,
                    columnTop + (index * (columnSide + PANEL_GAP_PX)),
                );
            });

            for (const item of composerRects) {
                const x = Math.round(columnLeft - PANEL_GAP_PX - item.width);
                this.applyPanelPosition(item.panelState, x, bounds.top);
            }
            return;
        }
        if (rightPanelRects.length === 4) {
            const columns = 2;
            const rows = 2;
            const preferredSide = Math.min(...rightPanelRects.map((item) => Math.min(item.width, item.height)));
            const maxSideFromHeight = Math.floor((bounds.height - ((rows - 1) * PANEL_GAP_PX)) / rows);
            const maxSideFromWidth = Math.floor((bounds.width - ((columns - 1) * PANEL_GAP_PX)) / columns);
            const gridSide = Math.max(
                PANEL_MIN_SIDE_DEFAULT,
                Math.min(preferredSide, maxSideFromHeight, maxSideFromWidth),
            );
            const gridWidth = (columns * gridSide) + ((columns - 1) * PANEL_GAP_PX);
            const gridHeight = (rows * gridSide) + ((rows - 1) * PANEL_GAP_PX);
            const gridLeft = Math.round(bounds.right - gridWidth);
            const gridTop = Math.round(bounds.top + Math.max(0, (bounds.height - gridHeight) * 0.5));

            rightPanelRects.forEach((item, index) => {
                item.width = gridSide;
                item.height = gridSide;
                item.panelState.panel.style.width = `${gridSide}px`;
                item.panelState.panel.style.height = `${gridSide}px`;
                const col = index % columns;
                const row = Math.floor(index / columns);
                this.applyPanelPosition(
                    item.panelState,
                    gridLeft + (col * (gridSide + PANEL_GAP_PX)),
                    gridTop + (row * (gridSide + PANEL_GAP_PX)),
                );
            });
            for (const item of composerRects) {
                const x = Math.round(bounds.left + ((bounds.width - item.width) * 0.5));
                const y = Math.round(bounds.top + ((bounds.height - item.height) * 0.5));
                this.applyPanelPosition(item.panelState, x, y);
            }
            return;
        }

        let rightColumnEdge = bounds.right;
        let rightColumnWidth = 0;
        let rightY = bounds.top;
        let rightPanelLeftEdge = bounds.right;
        for (const item of rightPanelRects) {
            if (rightY > bounds.top && (rightY + item.height) > bounds.bottom) {
                rightColumnEdge -= (rightColumnWidth + PANEL_GAP_PX);
                rightColumnWidth = 0;
                rightY = bounds.top;
            }

            const x = rightColumnEdge - item.width;
            rightPanelLeftEdge = Math.min(rightPanelLeftEdge, x);
            this.applyPanelPosition(item.panelState, x, rightY);
            rightY += item.height + PANEL_GAP_PX;
            if (item.width > rightColumnWidth) {
                rightColumnWidth = item.width;
            }
        }

        for (const item of composerRects) {
            const hasRightPanels = rightPanelRects.length > 0 && rightPanelLeftEdge < bounds.right;
            const x = hasRightPanels
                ? Math.max(bounds.left, Math.round(rightPanelLeftEdge - PANEL_GAP_PX - item.width))
                : Math.round(bounds.left + ((bounds.width - item.width) * 0.5));
            const y = hasRightPanels
                ? bounds.top
                : Math.round(bounds.top + ((bounds.height - item.height) * 0.5));
            this.applyPanelPosition(item.panelState, x, y);
        }
    },
};
