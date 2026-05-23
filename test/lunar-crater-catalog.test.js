import { describe, expect, it } from "vitest";

import {
    craterLatLonToUnitVector,
    getCraterBoundaryTone,
    getCraterHoverLabelScreenAnchor,
    getCraterLabelPlacement,
    getCratersToShow,
    getLunarFeatureKey,
} from "../src/platform/js/core/domain/lunar-crater-catalog.js";

const catalog = {
    display: {
        defaultMinDiameterKm: 0,
        defaultMaxDiameterKm: 600,
        rangeMinDiameterKm: 0,
        rangeMaxDiameterKm: 600,
    },
    features: [
        { name: "Center tiny", latitudeDeg: 0, longitudeDeg: 0, diameterKm: 8 },
        { name: "Center small", latitudeDeg: 0.2, longitudeDeg: 0.2, diameterKm: 16 },
        { name: "East small", latitudeDeg: 0, longitudeDeg: 3, diameterKm: 18 },
        { name: "West small", latitudeDeg: 0, longitudeDeg: -3, diameterKm: 18 },
        { name: "Far large", latitudeDeg: 0, longitudeDeg: 20, diameterKm: 220 },
        { name: "Too small", latitudeDeg: 0.1, longitudeDeg: 0.1, diameterKm: 2 },
        { name: "Back side", latitudeDeg: 0, longitudeDeg: 180, diameterKm: 400 },
    ],
};

function names(plan) {
    return plan.craters.map((entry) => entry.crater.name);
}

describe("lunar crater catalog render planning", () => {
    it("filters by diameter and view FoV before choosing craters to render", () => {
        const plan = getCratersToShow(catalog, {
            lunarCraterMinDiameterKm: 10,
            lunarCraterMaxDiameterKm: 100,
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 10,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 0,
        });

        expect(plan.filteredCount).toBe(3);
        expect(names(plan)).toEqual(["Center small", "East small", "West small"]);
    });

    it("filters lunar features by search query", () => {
        const plan = getCratersToShow({
            display: catalog.display,
            features: [
                ...catalog.features,
                {
                    name: "Mare Tranquillitatis",
                    cleanName: "mare-tranquillitatis",
                    featureType: "Mare, maria",
                    latitudeDeg: 8,
                    longitudeDeg: 31,
                    diameterKm: 500,
                },
            ],
        }, {
            lunarCraterMinDiameterKm: 0,
            lunarCraterMaxDiameterKm: 1000,
            lunarFeatureSearchQuery: "tranquil",
            minScreenDiameterPx: 0,
        });

        expect(names(plan)).toEqual(["Mare Tranquillitatis"]);
        expect(plan.filteredCount).toBe(1);
    });

    it("pins named lunar features outside the configured diameter range", () => {
        const plan = getCratersToShow({
            display: catalog.display,
            features: [
                ...catalog.features,
                {
                    name: "Glushko",
                    cleanName: "Glushko",
                    featureType: "Crater, craters",
                    latitudeDeg: 8,
                    longitudeDeg: 282,
                    diameterKm: 40,
                },
                {
                    name: "Mare Orientale",
                    cleanName: "Mare Orientale",
                    featureType: "Mare, maria",
                    latitudeDeg: -20,
                    longitudeDeg: 265,
                    diameterKm: 294,
                },
            ],
        }, {
            lunarCraterMinDiameterKm: 100,
            lunarCraterMaxDiameterKm: 200,
            lunarFeaturePinnedNames: ["Glushko", "Mare Orientale"],
            minScreenDiameterPx: 0,
        });

        expect(names(plan)).toEqual(["Mare Orientale", "Glushko"]);
        expect(plan.filteredCount).toBe(2);
    });

    it("excludes unchecked lunar feature search results by key", () => {
        const tycho = {
            name: "Tycho",
            featureType: "Crater, craters",
            latitudeDeg: -43.31,
            longitudeDeg: 348.82,
            diameterKm: 85.3,
            link: "https://example.test/tycho",
        };
        const plan = getCratersToShow({
            display: catalog.display,
            features: [...catalog.features, tycho],
        }, {
            lunarCraterMinDiameterKm: 0,
            lunarCraterMaxDiameterKm: 600,
            lunarFeatureSearchQuery: "tycho",
            lunarFeatureExcludedKeys: [getLunarFeatureKey(tycho)],
            minScreenDiameterPx: 0,
        });

        expect(names(plan)).toEqual([]);
        expect(plan.filteredCount).toBe(0);
    });

    it("prioritizes the center of the selected FoV over a larger crater outside that view", () => {
        const plan = getCratersToShow(catalog, {
            lunarCraterMinDiameterKm: 0,
            lunarCraterMaxDiameterKm: 600,
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 8,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 0,
            maxCount: 1,
        });

        expect(names(plan)).toEqual(["Center tiny"]);
    });

    it("uses camera projection so the selected patch covers the visible lunar surface", () => {
        const plan = getCratersToShow(catalog, {
            lunarCraterMinDiameterKm: 0,
            lunarCraterMaxDiameterKm: 600,
            viewCenterNormal: craterLatLonToUnitVector(0, 0),
            observerNormal: craterLatLonToUnitVector(0, 0),
            cameraPositionMoonRadii: { x: 100, y: 0, z: 0 },
            cameraForwardNormal: { x: -1, y: 0, z: 0 },
            cameraUpNormal: { x: 0, y: 0, z: 1 },
            cameraRightNormal: { x: 0, y: 1, z: 0 },
            verticalFovDeg: 0.5,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 0,
        });

        expect(names(plan)).toContain("Far large");
        expect(plan.craters.find((entry) => entry.crater.name === "Far large").screenX).toBeLessThan(1000);
    });

    it("uses the supplied view rectangle to render only craters in that screen region", () => {
        const rightHalf = getCratersToShow(catalog, {
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 10,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            viewRectPx: { left: 500, top: 0, width: 500, height: 1000 },
            minScreenDiameterPx: 0,
        });

        expect(names(rightHalf)).toContain("East small");
        expect(names(rightHalf)).not.toContain("West small");
    });

    it("raises apparent crater size as the FoV narrows", () => {
        const wide = getCratersToShow(catalog, {
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 40,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 0,
        }).craters.find((entry) => entry.crater.name === "Center small");
        const narrow = getCratersToShow(catalog, {
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 4,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 0,
        }).craters.find((entry) => entry.crater.name === "Center small");

        expect(narrow.projectedDiameterPx).toBeGreaterThan(wide.projectedDiameterPx * 8);
    });

    it("clips craters below the minimum apparent screen size", () => {
        const plan = getCratersToShow(catalog, {
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 40,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 50,
        });

        expect(names(plan)).not.toContain("Center tiny");
        expect(names(plan)).toContain("Far large");
    });

    it("marks a small, spaced set of labels instead of labeling every rendered crater", () => {
        const plan = getCratersToShow(catalog, {
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 10,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 0,
            labelMaxCount: 1,
            labelMinScreenDiameterPx: 0,
        });

        expect(plan.craters.filter((entry) => entry.showLabel)).toHaveLength(1);
    });

    it("can require every rendered crater boundary to have a label", () => {
        const plan = getCratersToShow(catalog, {
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 10,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 0,
            labelMaxCount: 1,
            labelEveryRenderedCrater: true,
        });

        expect(plan.craters.length).toBeGreaterThan(1);
        expect(plan.craters.every((entry) => entry.showLabel)).toBe(true);
    });

    it("honors zero max count and zero label count explicitly", () => {
        const hidden = getCratersToShow(catalog, {
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 10,
            maxCount: 0,
        });
        const unlabeled = getCratersToShow(catalog, {
            viewCenterLatitudeDeg: 0,
            viewCenterLongitudeDeg: 0,
            verticalFovDeg: 10,
            minScreenDiameterPx: 0,
            labelMaxCount: 0,
        });

        expect(hidden.craters).toEqual([]);
        expect(unlabeled.craters.length).toBeGreaterThan(0);
        expect(unlabeled.craters.some((entry) => entry.showLabel)).toBe(false);
    });

    it("accepts a view center normal as an alternative to lat/lon", () => {
        const plan = getCratersToShow(catalog, {
            viewCenterNormal: craterLatLonToUnitVector(0, 3),
            verticalFovDeg: 5,
            viewportWidthPx: 1000,
            viewportHeightPx: 1000,
            minScreenDiameterPx: 0,
        });

        expect(names(plan)[0]).toBe("East small");
    });

    it("resolves label placement from camera-up instead of a fixed lunar direction", () => {
        const placement = getCraterLabelPlacement({
            centerNormal: { x: 1, y: 0, z: 0 },
            offsetAngularRadius: 0.1,
            cameraUpNormal: { x: 0, y: 1, z: 0 },
            cameraRightNormal: { x: 0, y: 0, z: 1 },
        });

        expect(placement.labelNormal.x).toBeCloseTo(Math.cos(0.1), 6);
        expect(placement.labelNormal.y).toBeGreaterThan(0.09);
        expect(placement.labelNormal.z).toBeCloseTo(0, 6);
    });

    it("places hover label anchors just above the apparent crater top edge", () => {
        const anchor = getCraterHoverLabelScreenAnchor({
            craterScreenBounds: {
                left: 280,
                right: 360,
                top: 210,
                bottom: 292,
                centerX: 320,
            },
            viewportWidthPx: 800,
            viewportHeightPx: 600,
            labelScreenHeightPx: 36,
            gapPx: 6,
        });

        expect(anchor).toMatchObject({
            screenX: 320,
            screenY: 186,
            placement: "above",
        });
    });

    it("keeps hover label anchors in view when a crater is near the top edge", () => {
        const anchor = getCraterHoverLabelScreenAnchor({
            craterScreenBounds: {
                left: 280,
                right: 360,
                top: 8,
                bottom: 70,
                centerX: 320,
            },
            viewportWidthPx: 800,
            viewportHeightPx: 600,
            labelScreenHeightPx: 36,
            gapPx: 6,
        });

        expect(anchor.screenY).toBeGreaterThan(70);
        expect(anchor.placement).toBe("below");
    });

    it("classifies crater boundary tone from local sun direction", () => {
        expect(getCraterBoundaryTone({
            centerNormal: { x: 1, y: 0, z: 0 },
            sunNormal: { x: 1, y: 0, z: 0 },
        })).toMatchObject({ sunlit: true, tone: "lit" });
        expect(getCraterBoundaryTone({
            centerNormal: { x: -1, y: 0, z: 0 },
            sunNormal: { x: 1, y: 0, z: 0 },
        })).toMatchObject({ sunlit: false, tone: "unlit" });
    });
});
