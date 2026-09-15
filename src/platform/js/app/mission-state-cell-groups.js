function createMutableStateCell(get, set) {
    return { get, set };
}

function createReadonlyStateCell(get) {
    return { get, set: () => {} };
}

function createMissionViewStateCells(runtimeViewState, getEffectiveOrbitStyle) {
    return {
        transitionRevision: createReadonlyStateCell(() => runtimeViewState.getTransitionRevision()),
        config: createMutableStateCell(
            () => runtimeViewState.getConfig(),
            (value) => { runtimeViewState.setConfig(value); },
        ),
        currentDimension: createMutableStateCell(
            () => runtimeViewState.getCurrentDimension(),
            (value) => { runtimeViewState.setCurrentDimension(value); },
        ),
        previousDimension: createMutableStateCell(
            () => runtimeViewState.getPreviousDimension(),
            (value) => { runtimeViewState.setPreviousDimension(value); },
        ),
        dimensionChanged: createMutableStateCell(
            () => runtimeViewState.getDimensionChanged(),
            (value) => { runtimeViewState.setDimensionChanged(value); },
        ),
        viewPhotoMode: createMutableStateCell(
            () => runtimeViewState.getViewPhotoMode(),
            (value) => { runtimeViewState.setViewPhotoMode(value); },
        ),
        viewEarthClouds: createMutableStateCell(
            () => runtimeViewState.getViewEarthClouds(),
            (value) => { runtimeViewState.setViewEarthClouds(value); },
        ),
        viewAuxiliaryPanels: createMutableStateCell(
            () => runtimeViewState.getViewAuxiliaryPanels(),
            (value) => { runtimeViewState.setViewAuxiliaryPanels(value); },
        ),
        viewOrbit: createMutableStateCell(
            () => runtimeViewState.getViewOrbit(),
            (value) => { runtimeViewState.setViewOrbit(value); },
        ),
        viewOrbitDescent: createMutableStateCell(
            () => runtimeViewState.getViewOrbitDescent(),
            (value) => { runtimeViewState.setViewOrbitDescent(value); },
        ),
        viewCraters: createMutableStateCell(
            () => runtimeViewState.getViewCraters(),
            (value) => { runtimeViewState.setViewCraters(value); },
        ),
        viewLunarCraters: createMutableStateCell(
            () => runtimeViewState.getViewLunarCraters(),
            (value) => { runtimeViewState.setViewLunarCraters(value); },
        ),
        lunarCraterShowAllEnabled: createMutableStateCell(
            () => runtimeViewState.getLunarCraterShowAllEnabled(),
            (value) => { runtimeViewState.setLunarCraterShowAllEnabled(value); },
        ),
        lunarCraterHoverEnabled: createMutableStateCell(
            () => runtimeViewState.getLunarCraterHoverEnabled(),
            (value) => { runtimeViewState.setLunarCraterHoverEnabled(value); },
        ),
        viewMoonLatLonGrid: createMutableStateCell(
            () => runtimeViewState.getViewMoonLatLonGrid(),
            (value) => { runtimeViewState.setViewMoonLatLonGrid(value); },
        ),
        viewMoonLatLonLabels: createMutableStateCell(
            () => runtimeViewState.getViewMoonLatLonLabels(),
            (value) => { runtimeViewState.setViewMoonLatLonLabels(value); },
        ),
        viewMoonLatLonHover: createMutableStateCell(
            () => runtimeViewState.getViewMoonLatLonHover(),
            (value) => { runtimeViewState.setViewMoonLatLonHover(value); },
        ),
        viewEarthLatLonGrid: createMutableStateCell(
            () => runtimeViewState.getViewEarthLatLonGrid(),
            (value) => { runtimeViewState.setViewEarthLatLonGrid(value); },
        ),
        viewEarthLatLonLabels: createMutableStateCell(
            () => runtimeViewState.getViewEarthLatLonLabels(),
            (value) => { runtimeViewState.setViewEarthLatLonLabels(value); },
        ),
        viewEarthLatLonHover: createMutableStateCell(
            () => runtimeViewState.getViewEarthLatLonHover(),
            (value) => { runtimeViewState.setViewEarthLatLonHover(value); },
        ),
        lunarCraterHoverLabels: createMutableStateCell(
            () => runtimeViewState.getLunarCraterHoverLabels(),
            (value) => { runtimeViewState.setLunarCraterHoverLabels(value); },
        ),
        lunarCraterDisplayMode: createMutableStateCell(
            () => runtimeViewState.getLunarCraterDisplayMode(),
            (value) => { runtimeViewState.setLunarCraterDisplayMode(value); },
        ),
        lunarCraterMinDiameterKm: createMutableStateCell(
            () => runtimeViewState.getLunarCraterMinDiameterKm(),
            (value) => { runtimeViewState.setLunarCraterMinDiameterKm(value); },
        ),
        lunarCraterMaxDiameterKm: createMutableStateCell(
            () => runtimeViewState.getLunarCraterMaxDiameterKm(),
            (value) => { runtimeViewState.setLunarCraterMaxDiameterKm(value); },
        ),
        lunarCraterHoverMinDiameterKm: createMutableStateCell(
            () => runtimeViewState.getLunarCraterHoverMinDiameterKm(),
            (value) => { runtimeViewState.setLunarCraterHoverMinDiameterKm(value); },
        ),
        lunarCraterHoverMaxDiameterKm: createMutableStateCell(
            () => runtimeViewState.getLunarCraterHoverMaxDiameterKm(),
            (value) => { runtimeViewState.setLunarCraterHoverMaxDiameterKm(value); },
        ),
        lunarFeatureTypeFilters: createMutableStateCell(
            () => runtimeViewState.getLunarFeatureTypeFilters(),
            (value) => { runtimeViewState.setLunarFeatureTypeFilters(value); },
        ),
        lunarFeatureSearchQuery: createMutableStateCell(
            () => runtimeViewState.getLunarFeatureSearchQuery(),
            (value) => { runtimeViewState.setLunarFeatureSearchQuery(value); },
        ),
        lunarFeatureExcludedKeys: createMutableStateCell(
            () => runtimeViewState.getLunarFeatureExcludedKeys(),
            (value) => { runtimeViewState.setLunarFeatureExcludedKeys(value); },
        ),
        lunarFeatureHoverTypeFilters: createMutableStateCell(
            () => runtimeViewState.getLunarFeatureHoverTypeFilters(),
            (value) => { runtimeViewState.setLunarFeatureHoverTypeFilters(value); },
        ),
        lunarFeatureHoverSearchQuery: createMutableStateCell(
            () => runtimeViewState.getLunarFeatureHoverSearchQuery(),
            (value) => { runtimeViewState.setLunarFeatureHoverSearchQuery(value); },
        ),
        lunarFeatureHoverExcludedKeys: createMutableStateCell(
            () => runtimeViewState.getLunarFeatureHoverExcludedKeys(),
            (value) => { runtimeViewState.setLunarFeatureHoverExcludedKeys(value); },
        ),
        viewXYZAxes: createMutableStateCell(
            () => runtimeViewState.getViewXYZAxes(),
            (value) => { runtimeViewState.setViewXYZAxes(value); },
        ),
        viewPoles: createMutableStateCell(
            () => runtimeViewState.getViewPoles(),
            (value) => { runtimeViewState.setViewPoles(value); },
        ),
        viewPolarAxes: createMutableStateCell(
            () => runtimeViewState.getViewPolarAxes(),
            (value) => { runtimeViewState.setViewPolarAxes(value); },
        ),
        viewEarthPoles: createMutableStateCell(
            () => runtimeViewState.getViewEarthPoles(),
            (value) => { runtimeViewState.setViewEarthPoles(value); },
        ),
        viewMoonPoles: createMutableStateCell(
            () => runtimeViewState.getViewMoonPoles(),
            (value) => { runtimeViewState.setViewMoonPoles(value); },
        ),
        viewEarthPolarAxes: createMutableStateCell(
            () => runtimeViewState.getViewEarthPolarAxes(),
            (value) => { runtimeViewState.setViewEarthPolarAxes(value); },
        ),
        viewMoonPolarAxes: createMutableStateCell(
            () => runtimeViewState.getViewMoonPolarAxes(),
            (value) => { runtimeViewState.setViewMoonPolarAxes(value); },
        ),
        viewSky: createMutableStateCell(
            () => runtimeViewState.getViewSky(),
            (value) => { runtimeViewState.setViewSky(value); },
        ),
        viewConstellationLines: createMutableStateCell(
            () => runtimeViewState.getViewConstellationLines(),
            (value) => { runtimeViewState.setViewConstellationLines(value); },
        ),
        viewMoonSOI: createMutableStateCell(
            () => runtimeViewState.getViewMoonSOI(),
            (value) => { runtimeViewState.setViewMoonSOI(value); },
        ),
        viewMoonHillSphere: createMutableStateCell(
            () => runtimeViewState.getViewMoonHillSphere(),
            (value) => { runtimeViewState.setViewMoonHillSphere(value); },
        ),
        viewBodyHalos: createMutableStateCell(
            () => runtimeViewState.getViewBodyHalos(),
            (value) => { runtimeViewState.setViewBodyHalos(value); },
        ),
        viewMoonOsculatingOrbit: createMutableStateCell(
            () => runtimeViewState.getViewMoonOsculatingOrbit(),
            (value) => { runtimeViewState.setViewMoonOsculatingOrbit(value); },
        ),
        viewSubSolarEarth: createMutableStateCell(
            () => runtimeViewState.getViewSubSolarEarth(),
            (value) => { runtimeViewState.setViewSubSolarEarth(value); },
        ),
        viewSubSolarMoon: createMutableStateCell(
            () => runtimeViewState.getViewSubSolarMoon(),
            (value) => { runtimeViewState.setViewSubSolarMoon(value); },
        ),
        viewSubMoonEarth: createMutableStateCell(
            () => runtimeViewState.getViewSubMoonEarth(),
            (value) => { runtimeViewState.setViewSubMoonEarth(value); },
        ),
        viewSolarGlintEarth: createMutableStateCell(
            () => runtimeViewState.getViewSolarGlintEarth(),
            (value) => { runtimeViewState.setViewSolarGlintEarth(value); },
        ),
        viewLunarGlintEarth: createMutableStateCell(
            () => runtimeViewState.getViewLunarGlintEarth(),
            (value) => { runtimeViewState.setViewLunarGlintEarth(value); },
        ),
        viewSubCraftEarth: createMutableStateCell(
            () => runtimeViewState.getViewSubCraftEarth(),
            (value) => { runtimeViewState.setViewSubCraftEarth(value); },
        ),
        viewSubCraftMoon: createMutableStateCell(
            () => runtimeViewState.getViewSubCraftMoon(),
            (value) => { runtimeViewState.setViewSubCraftMoon(value); },
        ),
        viewAntiSolarEarth: createMutableStateCell(
            () => runtimeViewState.getViewAntiSolarEarth(),
            (value) => { runtimeViewState.setViewAntiSolarEarth(value); },
        ),
        viewAntiSolarMoon: createMutableStateCell(
            () => runtimeViewState.getViewAntiSolarMoon(),
            (value) => { runtimeViewState.setViewAntiSolarMoon(value); },
        ),
        viewAntiMoonEarth: createMutableStateCell(
            () => runtimeViewState.getViewAntiMoonEarth(),
            (value) => { runtimeViewState.setViewAntiMoonEarth(value); },
        ),
        viewAntiCraftEarth: createMutableStateCell(
            () => runtimeViewState.getViewAntiCraftEarth(),
            (value) => { runtimeViewState.setViewAntiCraftEarth(value); },
        ),
        viewAntiCraftMoon: createMutableStateCell(
            () => runtimeViewState.getViewAntiCraftMoon(),
            (value) => { runtimeViewState.setViewAntiCraftMoon(value); },
        ),
        viewEclipticPlane: createMutableStateCell(
            () => runtimeViewState.getViewEclipticPlane(),
            (value) => { runtimeViewState.setViewEclipticPlane(value); },
        ),
        viewEquatorialPlane: createMutableStateCell(
            () => runtimeViewState.getViewEquatorialPlane(),
            (value) => { runtimeViewState.setViewEquatorialPlane(value); },
        ),
        viewFPS: createMutableStateCell(
            () => runtimeViewState.getViewFPS(),
            (value) => { runtimeViewState.setViewFPS(value); },
        ),
        orbitStyle: createMutableStateCell(
            () => runtimeViewState.getOrbitStyle(),
            (value) => { runtimeViewState.setOrbitStyle(value); },
        ),
        effectiveOrbitStyle: createReadonlyStateCell(() => getEffectiveOrbitStyle()),
        trailTrackBrightness2D: createMutableStateCell(
            () => runtimeViewState.getTrailTrackBrightness2D(),
            (value) => { runtimeViewState.setTrailTrackBrightness2D(value); },
        ),
        trailTrackBrightness3D: createMutableStateCell(
            () => runtimeViewState.getTrailTrackBrightness3D(),
            (value) => { runtimeViewState.setTrailTrackBrightness3D(value); },
        ),
        trailTailBrightness2D: createMutableStateCell(
            () => runtimeViewState.getTrailTailBrightness2D(),
            (value) => { runtimeViewState.setTrailTailBrightness2D(value); },
        ),
        trailTailBrightness3D: createMutableStateCell(
            () => runtimeViewState.getTrailTailBrightness3D(),
            (value) => { runtimeViewState.setTrailTailBrightness3D(value); },
        ),
    };
}

function createMissionSessionStateCells(runtimeSessionState) {
    return {
        animTime: createMutableStateCell(
            () => runtimeSessionState.getAnimTime(),
            (value) => { runtimeSessionState.setAnimTime(value); },
        ),
        animationRunning: createReadonlyStateCell(
            () => runtimeSessionState.getAnimationRunning(),
        ),
    };
}

function createMissionInteractionStateCells(runtimeInteractionState) {
    return {
        startLandingFlag: createMutableStateCell(
            () => runtimeInteractionState.getStartLandingFlag(),
            (value) => { runtimeInteractionState.setStartLandingFlag(value); },
        ),
        mousedownTimeout: createMutableStateCell(
            () => runtimeInteractionState.getMouseDownTimeout(),
            (value) => { runtimeInteractionState.setMouseDownTimeout(value); },
        ),
        timeoutHandleZoom: createMutableStateCell(
            () => runtimeInteractionState.getTimeoutHandleZoom(),
            (value) => { runtimeInteractionState.setTimeoutHandleZoom(value); },
        ),
        mouseDown: createMutableStateCell(
            () => runtimeInteractionState.getMouseDown(),
            (value) => { runtimeInteractionState.setMouseDown(value); },
        ),
        missionStartCalled: createMutableStateCell(
            () => runtimeInteractionState.getMissionStartCalled(),
            (value) => { runtimeInteractionState.setMissionStartCalled(value); },
        ),
        timeoutHandle: createReadonlyStateCell(
            () => runtimeInteractionState.getLegacyTimeoutHandle(),
        ),
        lastInputActivityMs: createMutableStateCell(
            () => runtimeInteractionState.getLastInputActivityMs(),
            (value) => { runtimeInteractionState.markInputActivity(value); },
        ),
    };
}

export {
    createMissionInteractionStateCells,
    createMissionSessionStateCells,
    createMissionViewStateCells,
    createMutableStateCell,
    createReadonlyStateCell,
};
