export function createMissionViewCommands({ runtimeViewState, documentRef, applyViewSettings, getSetView, render }) {
    function setViewLunarCraters(value) {
        runtimeViewState.setViewLunarCraters(value);
        const enabled = runtimeViewState.getViewLunarCraters();
        const craterDisplayMode = runtimeViewState.getLunarCraterDisplayMode();
        applyViewSettings({
            viewCraters: runtimeViewState.getViewCraters(),
            viewLunarCraters: enabled,
            lunarCraterDisplayMode: craterDisplayMode,
            lunarCraterMinDiameterKm: runtimeViewState.getLunarCraterMinDiameterKm(),
            lunarCraterMaxDiameterKm: runtimeViewState.getLunarCraterMaxDiameterKm(),
            lunarCraterHoverMinDiameterKm: runtimeViewState.getLunarCraterHoverMinDiameterKm(),
            lunarCraterHoverMaxDiameterKm: runtimeViewState.getLunarCraterHoverMaxDiameterKm(),
            lunarFeatureTypeFilters: runtimeViewState.getLunarFeatureTypeFilters(),
            lunarFeatureSearchQuery: runtimeViewState.getLunarFeatureSearchQuery(),
            lunarFeatureExcludedKeys: runtimeViewState.getLunarFeatureExcludedKeys(),
            lunarFeatureHoverTypeFilters: runtimeViewState.getLunarFeatureHoverTypeFilters(),
            lunarFeatureHoverSearchQuery: runtimeViewState.getLunarFeatureHoverSearchQuery(),
            lunarFeatureHoverExcludedKeys: runtimeViewState.getLunarFeatureHoverExcludedKeys(),
        });
        const lunarCraterPill = documentRef.getElementById("toggle-pill-lunar-craters");
        if (lunarCraterPill) {
            lunarCraterPill.classList.toggle("is-active", enabled);
            lunarCraterPill.setAttribute("aria-pressed", enabled ? "true" : "false");
        }
        const lunarCraterOffToggle = documentRef.getElementById("lunar-crater-off-toggle");
        if (lunarCraterOffToggle) {
            lunarCraterOffToggle.classList.toggle("is-active", !enabled);
            lunarCraterOffToggle.setAttribute("aria-pressed", enabled ? "false" : "true");
            lunarCraterOffToggle.textContent = "Off";
        }
        const lunarCraterVisibleToggle = documentRef.getElementById("lunar-crater-visible-toggle");
        if (lunarCraterVisibleToggle) {
            const active = enabled && craterDisplayMode === "always";
            lunarCraterVisibleToggle.classList.toggle("is-active", active);
            lunarCraterVisibleToggle.setAttribute("aria-pressed", active ? "true" : "false");
            lunarCraterVisibleToggle.textContent = "Show always";
        }
        const lunarCraterHoverToggle = documentRef.getElementById("lunar-crater-hover-toggle");
        if (lunarCraterHoverToggle) {
            const active = enabled && craterDisplayMode === "hover";
            lunarCraterHoverToggle.classList.toggle("is-active", active);
            lunarCraterHoverToggle.setAttribute("aria-pressed", active ? "true" : "false");
            lunarCraterHoverToggle.textContent = "Show on hover";
        }
        const setView = getSetView();
        if (typeof setView === "function") {
            setView();
        } else {
            render();
        }
        return enabled;
    }

    function getPhotoMode() {
        return runtimeViewState.getViewPhotoMode();
    }

    function setPhotoMode(value) {
        runtimeViewState.setViewPhotoMode(value);
        render();
        return runtimeViewState.getViewPhotoMode();
    }

    return { setViewLunarCraters, getPhotoMode, setPhotoMode };
}
