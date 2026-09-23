export function applyInitialMissionViewState({ runtimeViewState, cameraState, initialMissionViewState, planeSelection }) {
    runtimeViewState.setConfig(initialMissionViewState.config);
    runtimeViewState.setCurrentViewIdentity({
        originMode: initialMissionViewState.config,
        cameraPositionMode: cameraState.get().positionMode,
        cameraLookMode: cameraState.get().lookMode,
        planeSelection,
        dimension: runtimeViewState.getCurrentDimension(),
    });
    runtimeViewState.setViewFlags({
        viewPhotoMode: runtimeViewState.getViewPhotoMode(),
        viewEarthClouds: runtimeViewState.getViewEarthClouds(),
        viewAuxiliaryPanels: initialMissionViewState.viewAuxiliaryPanels,
        viewOrbit: initialMissionViewState.viewOrbit,
        viewOrbitDescent: initialMissionViewState.viewOrbitDescent,
        viewCraters: initialMissionViewState.viewCraters,
        viewLunarCraters: initialMissionViewState.viewLunarCraters,
        lunarCraterShowAllEnabled:
            initialMissionViewState.lunarCraterShowAllEnabled ?? runtimeViewState.getLunarCraterShowAllEnabled(),
        lunarCraterHoverEnabled:
            initialMissionViewState.lunarCraterHoverEnabled ?? runtimeViewState.getLunarCraterHoverEnabled(),
        viewMoonLatLonGrid: initialMissionViewState.viewMoonLatLonGrid,
        viewMoonLatLonLabels: initialMissionViewState.viewMoonLatLonLabels ?? runtimeViewState.getViewMoonLatLonLabels(),
        viewMoonLatLonHover: initialMissionViewState.viewMoonLatLonHover ?? runtimeViewState.getViewMoonLatLonHover(),
        viewEarthLatLonGrid: initialMissionViewState.viewEarthLatLonGrid,
        viewEarthLatLonLabels: initialMissionViewState.viewEarthLatLonLabels ?? runtimeViewState.getViewEarthLatLonLabels(),
        viewEarthLatLonHover: initialMissionViewState.viewEarthLatLonHover ?? runtimeViewState.getViewEarthLatLonHover(),
        lunarCraterMinDiameterKm:
            initialMissionViewState.lunarCraterMinDiameterKm ?? runtimeViewState.getLunarCraterMinDiameterKm(),
        lunarCraterMaxDiameterKm:
            initialMissionViewState.lunarCraterMaxDiameterKm ?? runtimeViewState.getLunarCraterMaxDiameterKm(),
        lunarCraterHoverMinDiameterKm:
            initialMissionViewState.lunarCraterHoverMinDiameterKm ?? runtimeViewState.getLunarCraterHoverMinDiameterKm(),
        lunarCraterHoverMaxDiameterKm:
            initialMissionViewState.lunarCraterHoverMaxDiameterKm ?? runtimeViewState.getLunarCraterHoverMaxDiameterKm(),
        lunarCraterHoverLabels: initialMissionViewState.lunarCraterHoverLabels ?? runtimeViewState.getLunarCraterHoverLabels(),
        lunarCraterDisplayMode: initialMissionViewState.lunarCraterDisplayMode ?? runtimeViewState.getLunarCraterDisplayMode(),
        lunarFeatureTypeFilters:
            initialMissionViewState.lunarFeatureTypeFilters ?? runtimeViewState.getLunarFeatureTypeFilters(),
        lunarFeatureSearchQuery:
            initialMissionViewState.lunarFeatureSearchQuery ?? runtimeViewState.getLunarFeatureSearchQuery(),
        lunarFeatureExcludedKeys:
            initialMissionViewState.lunarFeatureExcludedKeys ?? runtimeViewState.getLunarFeatureExcludedKeys(),
        lunarFeatureHoverTypeFilters:
            initialMissionViewState.lunarFeatureHoverTypeFilters ?? runtimeViewState.getLunarFeatureHoverTypeFilters(),
        lunarFeatureHoverSearchQuery:
            initialMissionViewState.lunarFeatureHoverSearchQuery ?? runtimeViewState.getLunarFeatureHoverSearchQuery(),
        lunarFeatureHoverExcludedKeys:
            initialMissionViewState.lunarFeatureHoverExcludedKeys ?? runtimeViewState.getLunarFeatureHoverExcludedKeys(),
        viewXYZAxes: initialMissionViewState.viewXYZAxes,
        viewPoles: initialMissionViewState.viewPoles,
        viewPolarAxes: initialMissionViewState.viewPolarAxes,
        viewEarthPoles: initialMissionViewState.viewEarthPoles,
        viewMoonPoles: initialMissionViewState.viewMoonPoles,
        viewEarthPolarAxes: initialMissionViewState.viewEarthPolarAxes,
        viewMoonPolarAxes: initialMissionViewState.viewMoonPolarAxes,
        viewSky: initialMissionViewState.viewSky,
        viewConstellationLines: initialMissionViewState.viewConstellationLines,
        viewMoonSOI: initialMissionViewState.viewMoonSOI,
        viewMoonHillSphere: initialMissionViewState.viewMoonHillSphere,
        viewBodyHalos: initialMissionViewState.viewBodyHalos,
        viewMoonOsculatingOrbit: initialMissionViewState.viewMoonOsculatingOrbit,
        viewSubSolarEarth: initialMissionViewState.viewSubSolarEarth,
        viewSubSolarMoon: initialMissionViewState.viewSubSolarMoon,
        viewSubMoonEarth: initialMissionViewState.viewSubMoonEarth,
        viewSolarGlintEarth: initialMissionViewState.viewSolarGlintEarth,
        viewLunarGlintEarth: initialMissionViewState.viewLunarGlintEarth,
        viewSubCraftEarth: initialMissionViewState.viewSubCraftEarth,
        viewSubCraftMoon: initialMissionViewState.viewSubCraftMoon,
        viewAntiSolarEarth: initialMissionViewState.viewAntiSolarEarth,
        viewAntiSolarMoon: initialMissionViewState.viewAntiSolarMoon,
        viewAntiMoonEarth: initialMissionViewState.viewAntiMoonEarth,
        viewAntiCraftEarth: initialMissionViewState.viewAntiCraftEarth,
        viewAntiCraftMoon: initialMissionViewState.viewAntiCraftMoon,
        viewEclipticPlane: initialMissionViewState.viewEclipticPlane,
        viewEquatorialPlane: initialMissionViewState.viewEquatorialPlane,
        viewFPS: initialMissionViewState.viewFPS,
        orbitStyle: runtimeViewState.getOrbitStyle(),
        trailTrackBrightness2D: runtimeViewState.getTrailTrackBrightness2D(),
        trailTrackBrightness3D: runtimeViewState.getTrailTrackBrightness3D(),
        trailTailBrightness2D: runtimeViewState.getTrailTailBrightness2D(),
        trailTailBrightness3D: runtimeViewState.getTrailTailBrightness3D(),
    });
}
