import { supportsLunarCraterView } from "../core/domain/lunar-crater-view.js";
import {
    createDefaultLunarFeatureViewState,
    normalizeLunarFeatureViewState,
} from "../core/domain/lunar-feature-view.js";

function resolveCraterGroup({ animationScene = null, scene = null } = {}) {
    return animationScene?.lunarCraterGroup ||
        scene?.getObjectByName?.("lunar-crater-annotations") ||
        null;
}

function captureCraterPresentation(animationScene) {
    if (!animationScene) return null;
    return {
        hadGroup: !!animationScene.lunarCraterGroup,
        visible: animationScene.lunarCraterGroup?.visible === true,
        displayMode: animationScene.lunarCraterDisplayMode,
        minDiameterKm: animationScene.lunarCraterMinDiameterKm,
        maxDiameterKm: animationScene.lunarCraterMaxDiameterKm,
        showAllEnabled: animationScene.lunarCraterShowAllEnabled,
        hoverEnabled: animationScene.lunarCraterHoverEnabled,
        hoverMinDiameterKm: animationScene.lunarCraterHoverMinDiameterKm,
        hoverMaxDiameterKm: animationScene.lunarCraterHoverMaxDiameterKm,
        typeFilters: animationScene.lunarFeatureTypeFilters,
        searchQuery: animationScene.lunarFeatureSearchQuery,
        pinnedNames: animationScene.lunarFeaturePinnedNames,
        excludedKeys: animationScene.lunarFeatureExcludedKeys,
        hoverTypeFilters: animationScene.lunarFeatureHoverTypeFilters,
        hoverSearchQuery: animationScene.lunarFeatureHoverSearchQuery,
        hoverExcludedKeys: animationScene.lunarFeatureHoverExcludedKeys,
        hoverLabelsEnabled: animationScene.lunarCraterHoverLabelsEnabled,
    };
}

function restoreCraterPresentation(animationScene, previous) {
    if (!animationScene || !previous) return false;
    if (!previous.hadGroup) {
        animationScene.disposeLunarCraterAnnotations?.();
        return true;
    }

    animationScene.lunarCraterDisplayMode = previous.displayMode;
    animationScene.lunarCraterMinDiameterKm = previous.minDiameterKm;
    animationScene.lunarCraterMaxDiameterKm = previous.maxDiameterKm;
    animationScene.lunarCraterShowAllEnabled = previous.showAllEnabled;
    animationScene.lunarCraterHoverEnabled = previous.hoverEnabled;
    animationScene.lunarCraterHoverMinDiameterKm = previous.hoverMinDiameterKm;
    animationScene.lunarCraterHoverMaxDiameterKm = previous.hoverMaxDiameterKm;
    animationScene.lunarFeatureTypeFilters = previous.typeFilters;
    animationScene.lunarFeatureSearchQuery = previous.searchQuery;
    animationScene.lunarFeaturePinnedNames = previous.pinnedNames;
    animationScene.lunarFeatureExcludedKeys = previous.excludedKeys;
    animationScene.lunarFeatureHoverTypeFilters = previous.hoverTypeFilters;
    animationScene.lunarFeatureHoverSearchQuery = previous.hoverSearchQuery;
    animationScene.lunarFeatureHoverExcludedKeys = previous.hoverExcludedKeys;
    animationScene.addLunarCraterAnnotations?.();
    animationScene.setLunarCraterHoverLabelsEnabled?.(previous.hoverLabelsEnabled);
    if (animationScene.lunarCraterGroup) {
        animationScene.lunarCraterGroup.visible = previous.visible;
    }
    return true;
}

function setCraterGroupVisibleTemporarily(group, visible, render) {
    if (!group) {
        render();
        return;
    }
    const previousVisible = group.visible;
    group.visible = visible === true;
    try {
        render();
    } finally {
        group.visible = previousVisible;
    }
}

export function renderWithLunarCraterView({
    viewId,
    viewState,
    animationScene = null,
    scene = null,
    camera = null,
    rendererDomElement = null,
    pointer = null,
    freezeLabelScale = false,
    render,
}) {
    if (typeof render !== "function") return;

    const supported = supportsLunarCraterView(viewId);
    const craterState = supported
        ? normalizeLunarFeatureViewState(viewState)
        : createDefaultLunarFeatureViewState();

    const hasSearchResultsOverlay = craterState.lunarFeatureSearchQuery.length > 0 ||
        craterState.lunarFeaturePinnedNames.length > 0;
    if ((craterState.viewLunarCraters !== true && !hasSearchResultsOverlay) || !supported) {
        setCraterGroupVisibleTemporarily(
            resolveCraterGroup({ animationScene, scene }),
            false,
            render,
        );
        return;
    }

    const previousPresentation = captureCraterPresentation(animationScene);
    const canApplyPresentation = !!(
        animationScene?.addLunarCraterAnnotations &&
        animationScene?.setLunarCraterHoverLabelsEnabled
    );
    if (canApplyPresentation) {
        animationScene.lunarCraterDisplayMode = craterState.lunarCraterDisplayMode;
        animationScene.lunarCraterMinDiameterKm = craterState.lunarCraterMinDiameterKm;
        animationScene.lunarCraterMaxDiameterKm = craterState.lunarCraterMaxDiameterKm;
        animationScene.lunarCraterShowAllEnabled = craterState.lunarCraterShowAllEnabled;
        animationScene.lunarCraterHoverEnabled = craterState.lunarCraterHoverEnabled;
        animationScene.lunarCraterHoverMinDiameterKm = craterState.lunarCraterHoverMinDiameterKm;
        animationScene.lunarCraterHoverMaxDiameterKm = craterState.lunarCraterHoverMaxDiameterKm;
        animationScene.lunarFeatureTypeFilters = craterState.lunarFeatureTypeFilters;
        animationScene.lunarFeatureSearchQuery = craterState.lunarFeatureSearchQuery;
        animationScene.lunarFeaturePinnedNames = craterState.lunarFeaturePinnedNames;
        animationScene.lunarFeatureExcludedKeys = craterState.lunarFeatureExcludedKeys;
        animationScene.lunarFeatureHoverTypeFilters = craterState.lunarFeatureHoverTypeFilters;
        animationScene.lunarFeatureHoverSearchQuery = craterState.lunarFeatureHoverSearchQuery;
        animationScene.lunarFeatureHoverExcludedKeys = craterState.lunarFeatureHoverExcludedKeys;
        animationScene.addLunarCraterAnnotations({
            camera,
            rendererDomElement,
        });
        animationScene.setLunarCraterHoverLabelsEnabled(craterState.lunarCraterHoverLabels !== false);
    }

    const craterGroup = resolveCraterGroup({ animationScene, scene });
    const previousVisible = craterGroup?.visible;
    if (craterGroup) {
        craterGroup.visible = true;
    }
    try {
        if (
            canApplyPresentation &&
            craterState.lunarCraterHoverLabels !== false
        ) {
            if (pointer) {
                animationScene.updateLunarCraterHoverFromPointer?.({
                    camera,
                    rendererDomElement,
                    clientX: pointer.clientX,
                    clientY: pointer.clientY,
                });
            } else {
                animationScene.clearLunarCraterHover?.();
            }
        }
        animationScene?.updateLunarCraterLabelScales?.({
            camera,
            rendererDomElement,
            freezeScale: freezeLabelScale === true,
        });
        render();
    } finally {
        if (!restoreCraterPresentation(animationScene, previousPresentation) && craterGroup) {
            craterGroup.visible = previousVisible === true;
        }
    }
}
