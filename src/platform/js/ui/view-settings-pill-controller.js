import { constrainMoonRenderProfile } from "../core/domain/render-device-policy.js";
import { resolveMoonRenderAssetProfile } from "../app/moon-render-asset-profiles.js";
import {
    resolveMoonRenderPipelineState,
} from "../app/moon-render-pipeline.js";
import { createMoonRenderPanelController } from "./view-settings-moon-render-panel.js";
import {
    resolveBodyOrbitCopy,
    resolveCraftOrbitCopy,
} from "./orbit-control-labels.js";
import {
    getLunarCraterControlPanelElements as getSharedLunarCraterControlPanelElements,
    readLunarCraterControlState,
    syncLunarCraterControlPanel,
} from "./lunar-crater-control-panel.js";
import { createAnnotationPanelController } from "./view-settings-annotation-panels.js";

export const DEFAULT_ORIGIN_PILL_PAIRS = [
    ["origin-pill-earth", "origin-earth", "geo"],
    ["origin-pill-moon", "origin-moon", "lunar"],
    ["origin-pill-relative", "origin-relative", "relative"],
];

export const DEFAULT_DIMENSION_PILL_PAIRS = [
    ["dimension-pill-3d", "dimension-3D", "3D"],
    ["dimension-pill-2d", "dimension-2D", "2D"],
];

export const DEFAULT_MOON_PROFILE_PILL_PAIRS = [
    ["moon-profile-pill-fast", "fast"],
    ["moon-profile-pill-quality", "quality"],
];
export const DEFAULT_PHOTO_MODE_PILL_ID = "photo-mode-pill";
export const DEFAULT_MOON_RENDER_PILL_ID = "moon-render-pill";

export const DEFAULT_TOGGLE_PILL_PAIRS = [
    ["toggle-pill-orbit", "view-orbit", "viewOrbit"],
    ["toggle-pill-descent", "view-orbit-descent", "viewOrbitDescent"],
    ["toggle-pill-sky", "view-sky", "viewSky"],
    ["toggle-pill-xyz", "view-xyz-axes", "viewXYZAxes"],
    ["toggle-pill-earth-poles", "view-earth-poles", "viewEarthPoles"],
    ["toggle-pill-moon-poles", "view-moon-poles", "viewMoonPoles"],
    ["toggle-pill-earth-polar-axes", "view-earth-polar-axes", "viewEarthPolarAxes"],
    ["toggle-pill-moon-polar-axes", "view-moon-polar-axes", "viewMoonPolarAxes"],
    ["toggle-pill-earth-grid", "view-earth-lat-lon-grid", "viewEarthLatLonGrid"],
    ["toggle-pill-earth-labels", "view-earth-lat-lon-labels", "viewEarthLatLonLabels"],
    ["toggle-pill-earth-hover", "view-earth-lat-lon-hover", "viewEarthLatLonHover"],
    ["toggle-pill-moon-grid-legacy", "view-moon-lat-lon-grid", "viewMoonLatLonGrid"],
    ["toggle-pill-moon-labels", "view-moon-lat-lon-labels", "viewMoonLatLonLabels"],
    ["toggle-pill-moon-hover", "view-moon-lat-lon-hover", "viewMoonLatLonHover"],
    ["toggle-pill-constellations", "view-constellation-lines", "viewConstellationLines"],
    ["toggle-pill-moon-soi", "view-moonsoi", "viewMoonSOI"],
    ["toggle-pill-moon-hill-sphere", "view-moon-hill-sphere", "viewMoonHillSphere"],
    ["toggle-pill-moon-orbit", "view-moon-osculating-orbit", "viewMoonOsculatingOrbit"],
    ["toggle-pill-ecliptic", "view-eclipticplane", "viewEclipticPlane"],
    ["toggle-pill-equatorial", "view-equatorialplane", "viewEquatorialPlane"],
];

export function createViewSettingsPillController(deps = {}) {
    const documentRef = deps.documentRef || document;
    const windowRef = deps.windowRef || window;
    const controlBackend = deps.controlBackend || {};
    const requestAnimationFrameImpl = typeof deps.requestAnimationFrameImpl === "function"
        ? deps.requestAnimationFrameImpl
        : windowRef.requestAnimationFrame?.bind(windowRef) || ((callback) => callback());
    const MutationObserverImpl = deps.MutationObserverImpl
        || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
    const originPillPairs = deps.originPillPairs || DEFAULT_ORIGIN_PILL_PAIRS;
    const dimensionPillPairs = deps.dimensionPillPairs || DEFAULT_DIMENSION_PILL_PAIRS;
    const moonProfilePillPairs = deps.moonProfilePillPairs || DEFAULT_MOON_PROFILE_PILL_PAIRS;
    const photoModePillId = deps.photoModePillId || DEFAULT_PHOTO_MODE_PILL_ID;
    const togglePillPairs = deps.togglePillPairs || DEFAULT_TOGGLE_PILL_PAIRS;
    const getMoonRenderProfile = typeof deps.getMoonRenderProfile === "function"
        ? deps.getMoonRenderProfile
        : resolveMoonRenderAssetProfile;
    const setMoonRenderProfile = deps.setMoonRenderProfile;
    const moonRenderPillId = deps.moonRenderPillId || DEFAULT_MOON_RENDER_PILL_ID;
    const getMoonRenderPipeline = typeof deps.getMoonRenderPipeline === "function"
        ? deps.getMoonRenderPipeline
        : (() => resolveMoonRenderPipelineState({ globalObject: windowRef }));
    const setMoonRenderPipeline = typeof deps.setMoonRenderPipeline === "function"
        ? deps.setMoonRenderPipeline
        : null;
    const getPhotoMode = typeof deps.getPhotoMode === "function"
        ? deps.getPhotoMode
        : (() => false);
    const setPhotoMode = typeof deps.setPhotoMode === "function"
        ? deps.setPhotoMode
        : null;
    const resolveCraftOrbitCopyImpl = deps.resolveCraftOrbitCopyImpl || resolveCraftOrbitCopy;
    const resolveBodyOrbitCopyImpl = deps.resolveBodyOrbitCopyImpl || resolveBodyOrbitCopy;

    let bound = false;
    let landingPillSyncScheduled = false;

    function getElement(id) {
        return documentRef?.getElementById?.(id) || null;
    }

    function isElementVisible(element) {
        if (!element) return false;
        if (element.classList?.contains?.("settings-option--hidden")) return false;
        const style = windowRef.getComputedStyle?.(element);
        return style ? style.display !== "none" && style.visibility !== "hidden" : true;
    }

    function isRelativeOriginActive() {
        return !!getElement("origin-relative")?.checked;
    }

    function getActiveMoonRenderProfile() {
        return constrainMoonRenderProfile(getMoonRenderProfile(), windowRef);
    }

    function syncPressedState(pill, isActive) {
        if (!pill) return;
        pill.classList?.toggle?.("is-active", !!isActive);
        pill.setAttribute?.("aria-pressed", isActive ? "true" : "false");
    }

    function syncPairPressedState(pairs) {
        pairs.forEach(([pillId, inputId]) => {
            const pill = getElement(pillId);
            const input = getElement(inputId);
            if (!pill || !input) return;
            syncPressedState(pill, input.checked === true);
        });
    }

    function syncLocatorsPillState() {
        const locatorsPill = getElement("locators-pill");
        const bodyHaloToggle = getElement("view-body-halos");
        if (!locatorsPill || !bodyHaloToggle) return;
        locatorsPill.setAttribute("aria-pressed", bodyHaloToggle.checked ? "true" : "false");
    }

    function syncOriginPillState() {
        syncPairPressedState(originPillPairs);
    }

    function syncDimensionPillState() {
        syncPairPressedState(dimensionPillPairs);
    }

    function syncProfileDeviceAvailability(button, profile) {
        if (!button) return;
        const unsupported = constrainMoonRenderProfile(profile, windowRef) !== profile;
        if (unsupported) {
            button.disabled = true;
            button.dataset.deviceLimited = "true";
            button.title = "This tier is unavailable on this device.";
        } else if (button.dataset.deviceLimited === "true") {
            button.disabled = false;
            delete button.dataset.deviceLimited;
            button.title = "";
        }
    }

    function syncMoonRenderProfilePillState() {
        const activeProfile = getActiveMoonRenderProfile();
        moonProfilePillPairs.forEach(([pillId, profile]) => {
            syncPressedState(getElement(pillId), activeProfile === profile);
            syncProfileDeviceAvailability(getElement(pillId), profile);
        });
    }

    function syncPhotoModePillState() {
        syncPressedState(getElement(photoModePillId), !!getPhotoMode());
    }

    function syncTogglePillState() {
        syncPairPressedState(togglePillPairs);
    }

    function getCraterPanelElements() {
        return getSharedLunarCraterControlPanelElements(documentRef, {
            idPrefix: "lunar-crater",
            pillId: "toggle-pill-lunar-craters",
            visibleInputId: "view-lunar-craters",
        });
    }

    function syncLunarCraterPanelState() {
        const elements = getCraterPanelElements();
        syncLunarCraterControlPanel(elements, readLunarCraterControlState(elements));
    }

    function isMobileControlLayout() {
        return documentRef?.body?.classList?.contains?.("mobile-shell-enabled") ||
            windowRef?.matchMedia?.("(max-width: 600px)")?.matches === true;
    }

    function closeMobileOnlyPanelsIfNeeded() {
        if (!isMobileControlLayout()) return;
        setLunarCraterPanelOpen(false);
        setGuidesPanelOpen(false);
        setSurfacePointPanelOpen(false);
    }

    function setLunarCraterPanelOpen(open) {
        const { pill, panel } = getCraterPanelElements();
        if (!panel) return;
        if (open === true && isMobileControlLayout()) {
            open = false;
        }
        panel.hidden = open !== true;
        if (open === true) {
            positionPanelFromPill(panel, pill);
        }
        if (pill) {
            pill.classList?.toggle?.("is-open", open === true);
            pill.setAttribute?.("aria-expanded", open === true ? "true" : "false");
        }
    }

    const { bindMoonRenderPanel, syncMoonRenderPanelState } = createMoonRenderPanelController({
        documentRef,
        windowRef,
        getElement,
        moonRenderPillId,
        getActiveMoonRenderProfile,
        getMoonRenderPipeline,
        setMoonRenderPipeline,
        setMoonRenderProfile,
        syncMoonRenderProfilePillState,
        syncPressedState,
        syncProfileDeviceAvailability,
    });

    const {
        getLunarGridPanelElements,
        getGuidesPanelElements,
        getSurfacePointPanelElements,
        positionPanelFromPill,
        setLunarGridPanelOpen,
        setGuidesPanelOpen,
        setSurfacePointPanelOpen,
        closeAnnotationPanels,
        syncGuidesPanelState,
        syncSurfacePointPanelState,
        syncLunarGridPanelState,
        commitLunarGridSetting,
        commitGuidesSetting,
        commitSurfacePointSetting,
        bindLunarCraterControlPanel,
    } = createAnnotationPanelController({
        documentRef,
        windowRef,
        getElement,
        controlBackend,
        getCraterPanelElements,
        setLunarCraterPanelOpen,
        isMobileControlLayout,
        closeMobileOnlyPanelsIfNeeded,
        syncLunarCraterPanelState,
        syncPressedState,
        syncTogglePillState,
        syncTogglePillVisibility,
        sync,
    });

    function syncTogglePillVisibility() {
        const landingToggle = getElement("landing");
        const landingPill = getElement("toggle-pill-landing");
        const landingOptionRow = landingToggle?.closest?.(".settings-option")
            || landingToggle?.closest?.("label")
            || null;
        const descentOrbitOption = getElement("orbit-descent-option");
        const secondaryOrbitToggle = getElement("view-moon-osculating-orbit");
        const secondaryOrbitOption = secondaryOrbitToggle?.closest?.(".settings-option") || null;
        const secondaryOrbitPill = getElement("toggle-pill-moon-orbit");
        const moonSitesToggle = getElement("view-craters");
        const moonSitesPill = getElement("toggle-pill-craters");
        const isRelativeOrigin = isRelativeOriginActive();
        const hasLanding = !!landingToggle
            && !landingToggle.disabled
            && isElementVisible(landingOptionRow);

        if (landingPill) {
            landingPill.hidden = !hasLanding;
            landingPill.disabled = !hasLanding;
            landingPill.setAttribute("aria-disabled", hasLanding ? "false" : "true");
            if (!hasLanding) {
                syncPressedState(landingPill, false);
            }
        }

        const descentPill = getElement("toggle-pill-descent");
        if (descentPill) {
            const hasDescentOrbit = !!descentOrbitOption
                && !descentOrbitOption.classList?.contains?.("settings-option--hidden");
            descentPill.hidden = !hasDescentOrbit;
        }

        if (secondaryOrbitToggle) {
            secondaryOrbitToggle.disabled = isRelativeOrigin;
            if (isRelativeOrigin) {
                secondaryOrbitToggle.checked = false;
            }
        }
        if (secondaryOrbitOption) {
            secondaryOrbitOption.classList?.toggle?.("settings-option--hidden", isRelativeOrigin);
        }
        if (secondaryOrbitPill) {
            secondaryOrbitPill.hidden = isRelativeOrigin;
            secondaryOrbitPill.disabled = isRelativeOrigin;
            secondaryOrbitPill.setAttribute("aria-disabled", isRelativeOrigin ? "true" : "false");
            if (isRelativeOrigin) {
                syncPressedState(secondaryOrbitPill, false);
            }
        }

        if (moonSitesPill) {
            if (moonSitesToggle) {
                moonSitesToggle.disabled = !hasLanding;
                if (!hasLanding) {
                    moonSitesToggle.checked = false;
                }
            }
            moonSitesPill.disabled = !hasLanding;
            moonSitesPill.setAttribute("aria-disabled", hasLanding ? "false" : "true");
            if (!hasLanding) {
                syncPressedState(moonSitesPill, false);
                moonSitesPill.title = "Moon Sites available for landing missions";
            } else {
                moonSitesPill.title = "Toggle legacy Moon Sites overlay";
            }
        }
    }

    function syncLandingPillState() {
        const landingPill = getElement("toggle-pill-landing");
        const landingToggle = getElement("landing");
        if (!landingPill || !landingToggle) return;
        syncPressedState(landingPill, landingToggle.checked === true);
    }

    function scheduleLandingPillSync() {
        if (landingPillSyncScheduled) return;
        landingPillSyncScheduled = true;
        requestAnimationFrameImpl(() => {
            landingPillSyncScheduled = false;
            syncTogglePillVisibility();
            syncLandingPillState();
        });
    }

    function bindLandingPillVisibilityObserver() {
        const landingToggle = getElement("landing");
        if (!landingToggle || !MutationObserverImpl) return;
        const landingOptionRow = landingToggle?.closest?.(".settings-option")
            || landingToggle?.closest?.("label")
            || null;
        const observerTargets = [
            landingOptionRow,
            landingToggle,
            getElement("landingbutton"),
        ].filter(Boolean);
        if (!observerTargets.length) return;
        const observer = new MutationObserverImpl(() => {
            scheduleLandingPillSync();
        });
        observerTargets.forEach((target) => {
            observer.observe(target, {
                attributes: true,
                attributeFilter: ["class", "style", "hidden", "disabled", "aria-hidden"],
            });
        });
    }

    function syncOrbitLabels() {
        const originMode = isRelativeOriginActive()
            ? "relative"
            : getElement("origin-moon")?.checked
                ? "lunar"
                : "geo";
        const craftOrbitCopy = resolveCraftOrbitCopyImpl();
        const bodyOrbitCopy = resolveBodyOrbitCopyImpl(originMode);
        const orbitLabel = getElement("label-orbit");
        const orbitPill = getElement("toggle-pill-orbit");
        const secondaryOrbitLabel = getElement("label-secondary-body-orbit");
        const secondaryOrbitPill = getElement("toggle-pill-moon-orbit");

        if (orbitLabel) {
            orbitLabel.title = craftOrbitCopy.title;
        }
        if (orbitPill) {
            orbitPill.textContent = craftOrbitCopy.label;
            orbitPill.title = craftOrbitCopy.title;
        }
        if (secondaryOrbitLabel) {
            secondaryOrbitLabel.textContent = bodyOrbitCopy.label;
            secondaryOrbitLabel.title = bodyOrbitCopy.title;
        }
        if (secondaryOrbitPill) {
            secondaryOrbitPill.textContent = bodyOrbitCopy.label;
            secondaryOrbitPill.title = bodyOrbitCopy.title;
        }
    }

    function isMobileViewsOrComposeTab() {
        if (!windowRef || windowRef.innerWidth > 600) return false;
        const activeTab = documentRef?.body?.dataset?.mobileActiveTab || "";
        return activeTab === "views" || activeTab === "compose";
    }

    function enforceMobileLocatorTabPolicy() {
        const bodyHaloToggle = getElement("view-body-halos");
        if (!bodyHaloToggle) return;
        if (isMobileViewsOrComposeTab()) {
            bodyHaloToggle.checked = false;
        }
    }

    function commitOriginMode(originMode) {
        controlBackend.commitOriginMode?.(originMode);
        syncOriginPillState();
        syncOrbitLabels();
        syncTogglePillVisibility();
        syncSurfacePointPanelState();
    }

    function commitDimensionSelection(dimension) {
        controlBackend.commitDimensionSelection?.(dimension);
        syncDimensionPillState();
    }

    function commitSharedViewSetting(settingKey, value, options = {}) {
        controlBackend.commitViewSetting?.(settingKey, value, options);
        syncTogglePillVisibility();
        syncTogglePillState();
        syncGuidesPanelState();
        syncSurfacePointPanelState();
        syncLunarGridPanelState();
        syncLunarCraterPanelState();
        syncLocatorsPillState();
    }

    function commitBodyHaloSetting(value, options = {}) {
        enforceMobileLocatorTabPolicy();
        const nextValue = isMobileViewsOrComposeTab() ? false : !!value;
        commitSharedViewSetting("viewBodyHalos", nextValue, options);
    }

    function toggleLandingMode(options = {}) {
        controlBackend.toggleLandingMode?.(options);
        syncTogglePillVisibility();
        syncLandingPillState();
    }

    function bind() {
        if (bound) return;
        bound = true;

        originPillPairs.forEach(([pillId, inputId, originMode]) => {
            const pill = getElement(pillId);
            const input = getElement(inputId);
            if (pill) {
                pill.addEventListener("click", function () {
                    if (pill.disabled || input?.disabled || pill.getAttribute?.("aria-disabled") === "true") {
                        return;
                    }
                    commitOriginMode(originMode);
                });
            }
            if (input) {
                input.addEventListener("click", function () {
                    if (input.disabled) return;
                    commitOriginMode(originMode);
                });
                input.addEventListener("change", function () {
                    syncOriginPillState();
                    syncOrbitLabels();
                    syncTogglePillVisibility();
                    syncSurfacePointPanelState();
                });
            }
        });

        dimensionPillPairs.forEach(([pillId, inputId, dimension]) => {
            const pill = getElement(pillId);
            const input = getElement(inputId);
            if (pill) {
                pill.addEventListener("click", function () {
                    commitDimensionSelection(dimension);
                });
            }
            if (input) {
                input.addEventListener("click", function () {
                    commitDimensionSelection(dimension);
                });
                input.addEventListener("change", syncDimensionPillState);
            }
        });

        togglePillPairs.forEach(([pillId, inputId, settingKey]) => {
            const pill = getElement(pillId);
            const input = getElement(inputId);
            if (pill) {
                pill.addEventListener("click", function () {
                    if (pill.disabled || pill.getAttribute?.("aria-disabled") === "true") return;
                    commitSharedViewSetting(settingKey, !input?.checked, {
                        sourceId: pillId,
                    });
                });
            }
            if (input) {
                input.addEventListener("click", function (event) {
                    commitSharedViewSetting(settingKey, !!event?.target?.checked, {
                        sourceId: inputId,
                    });
                });
                input.addEventListener("change", function () {
                    syncTogglePillVisibility();
                    syncTogglePillState();
                    syncLunarGridPanelState();
                    syncSurfacePointPanelState();
                    syncLocatorsPillState();
                });
            }
        });

        const {
            pill: guidesPill,
            close: guidesClose,
            settingEntries: guideSettingEntries,
        } = getGuidesPanelElements();
        if (guidesPill) {
            guidesPill.addEventListener("click", function (event) {
                if (guidesPill.disabled || guidesPill.getAttribute?.("aria-disabled") === "true") return;
                if (isMobileControlLayout()) {
                    closeMobileOnlyPanelsIfNeeded();
                    return;
                }
                event?.stopPropagation?.();
                const panelOpen = getGuidesPanelElements().panel?.hidden === false;
                closeAnnotationPanels(panelOpen ? "" : "guides-controls-panel");
                setGuidesPanelOpen(!panelOpen);
                syncGuidesPanelState();
            });
        }
        guidesClose?.addEventListener?.("click", function () {
            setGuidesPanelOpen(false);
        });
        guideSettingEntries.forEach(({ settingKey, input, toggle, toggleId }) => {
            toggle?.addEventListener?.("click", function (event) {
                commitGuidesSetting(settingKey, !!event?.target?.checked, toggleId);
            });
            input?.addEventListener?.("change", syncGuidesPanelState);
        });

        const {
            pill: surfacePointsPill,
            close: surfacePointsClose,
            settingEntries: surfacePointSettingEntries,
        } = getSurfacePointPanelElements();
        if (surfacePointsPill) {
            surfacePointsPill.addEventListener("click", function (event) {
                if (surfacePointsPill.disabled || surfacePointsPill.getAttribute?.("aria-disabled") === "true") return;
                if (isMobileControlLayout()) {
                    closeMobileOnlyPanelsIfNeeded();
                    return;
                }
                event?.stopPropagation?.();
                const panelOpen = getSurfacePointPanelElements().panel?.hidden === false;
                closeAnnotationPanels(panelOpen ? "" : "surface-points-controls-panel");
                setSurfacePointPanelOpen(!panelOpen);
                syncSurfacePointPanelState();
            });
        }
        surfacePointsClose?.addEventListener?.("click", function () {
            setSurfacePointPanelOpen(false);
        });
        surfacePointSettingEntries.forEach(({ settingKey, input, toggle, toggleId }) => {
            toggle?.addEventListener?.("click", function (event) {
                commitSurfacePointSetting(settingKey, !!event?.target?.checked, toggleId);
            });
            input?.addEventListener?.("click", function (event) {
                commitSurfacePointSetting(settingKey, !!event?.target?.checked, input.id);
            });
            input?.addEventListener?.("change", syncSurfacePointPanelState);
        });

        const {
            pill: lunarGridPill,
            close: lunarGridClose,
            gridInput: lunarGridInput,
            labelsInput: lunarGridLabelsInput,
            hoverInput: lunarGridHoverInput,
            gridToggle: lunarGridToggle,
            labelsToggle: lunarGridLabelsToggle,
            hoverToggle: lunarGridHoverToggle,
        } = getLunarGridPanelElements();
        if (lunarGridPill) {
            lunarGridPill.addEventListener("click", function (event) {
                if (lunarGridPill.disabled || lunarGridPill.getAttribute?.("aria-disabled") === "true") return;
                event?.stopPropagation?.();
                setLunarGridPanelOpen(true);
                syncLunarGridPanelState();
            });
        }
        lunarGridClose?.addEventListener?.("click", function () {
            setLunarGridPanelOpen(false);
        });
        [
            [lunarGridToggle, "viewMoonLatLonGrid"],
            [lunarGridLabelsToggle, "viewMoonLatLonLabels"],
            [lunarGridHoverToggle, "viewMoonLatLonHover"],
        ].forEach(([toggle, settingKey]) => {
            toggle?.addEventListener?.("click", function (event) {
                commitLunarGridSetting(settingKey, !!event?.target?.checked, toggle.id);
            });
        });
        [
            [lunarGridInput, "viewMoonLatLonGrid"],
            [lunarGridLabelsInput, "viewMoonLatLonLabels"],
            [lunarGridHoverInput, "viewMoonLatLonHover"],
        ].forEach(([input, settingKey]) => {
            input?.addEventListener?.("click", function (event) {
                commitLunarGridSetting(settingKey, !!event?.target?.checked, input.id);
            });
            input?.addEventListener?.("change", syncLunarGridPanelState);
        });

        const bodyHaloToggle = getElement("view-body-halos");
        if (bodyHaloToggle) {
            bodyHaloToggle.addEventListener("click", function (event) {
                commitBodyHaloSetting(!!event?.target?.checked, {
                    sourceId: "view-body-halos",
                });
            });
        }

        const locatorsPill = getElement("locators-pill");
        if (locatorsPill) {
            locatorsPill.addEventListener("click", function () {
                if (!bodyHaloToggle) return;
                commitBodyHaloSetting(!bodyHaloToggle.checked, {
                    sourceId: "locators-pill",
                });
            });
        }

        moonProfilePillPairs.forEach(([pillId, profile]) => {
            const pill = getElement(pillId);
            if (!pill) return;
            pill.addEventListener("click", function () {
                const currentProfile = getActiveMoonRenderProfile();
                const offProfile = pill.dataset?.toggleProfileOff;
                const nextProfile = currentProfile === profile && offProfile ? offProfile : profile;
                if (currentProfile === nextProfile) {
                    syncMoonRenderProfilePillState();
                    return;
                }
                pill.disabled = true;
                Promise.resolve(
                    typeof setMoonRenderProfile === "function"
                        ? setMoonRenderProfile(nextProfile)
                        : nextProfile,
                ).catch((error) => {
                    console.error("Failed to switch Moon render profile:", error);
                }).finally(() => {
                    pill.disabled = false;
                    syncMoonRenderProfilePillState();
                });
            });
        });

        const photoModePill = getElement(photoModePillId);
        if (photoModePill) {
            photoModePill.addEventListener("click", function () {
                const nextValue = !getPhotoMode();
                photoModePill.disabled = true;
                Promise.resolve(
                    typeof setPhotoMode === "function"
                        ? setPhotoMode(nextValue)
                        : nextValue,
                ).catch((error) => {
                    console.error("Failed to toggle photo mode:", error);
                }).finally(() => {
                    photoModePill.disabled = false;
                    syncPhotoModePillState();
                });
            });
        }

        bindLunarCraterControlPanel();
        bindMoonRenderPanel();
        documentRef?.addEventListener?.("moon-mission:view-identity-settings-applied", sync);

        const landingToggle = getElement("landing");
        if (landingToggle) {
            landingToggle.addEventListener("change", function () {
                syncTogglePillVisibility();
                syncLandingPillState();
            });
            landingToggle.addEventListener("click", function () {
                toggleLandingMode({ sourceId: "landing" });
            });
        }

        const landingPill = getElement("toggle-pill-landing");
        if (landingPill) {
            landingPill.addEventListener("click", function () {
                if (!landingToggle || landingToggle.disabled) return;
                toggleLandingMode({ sourceId: "toggle-pill-landing" });
            });
        }

        bindLandingPillVisibilityObserver();
        windowRef?.addEventListener?.("resize", closeMobileOnlyPanelsIfNeeded);
        windowRef?.addEventListener?.("moon-mission:render-capabilities", sync);
        closeMobileOnlyPanelsIfNeeded();
        sync();
    }

    function sync() {
        syncOriginPillState();
        syncLocatorsPillState();
        syncOrbitLabels();
        syncTogglePillVisibility();
        syncTogglePillState();
        syncGuidesPanelState();
        syncSurfacePointPanelState();
        syncLunarCraterPanelState();
        syncLandingPillState();
        syncDimensionPillState();
        syncMoonRenderProfilePillState();
        syncMoonRenderPanelState();
        syncPhotoModePillState();
    }

    return {
        bind,
        commitBodyHaloSetting,
        commitDimensionSelection,
        commitOriginMode,
        commitSharedViewSetting,
        scheduleLandingPillSync,
        sync,
        syncDimensionPillState,
        syncLandingPillState,
        syncLunarCraterPanelState,
        syncLocatorsPillState,
        syncMoonRenderProfilePillState,
        syncMoonRenderPanelState,
        syncPhotoModePillState,
        syncOrbitLabels,
        syncOriginPillState,
        syncTogglePillState,
        syncTogglePillVisibility,
        toggleLandingMode,
    };
}
