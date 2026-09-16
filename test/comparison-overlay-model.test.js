import { describe, expect, it } from "vitest";

import {
    buildComparisonOverlayAugmentation,
    buildComparisonTimeRanges,
    mergeComparisonOverlayIntoBaseConfig,
} from "../src/platform/js/app/comparison-overlay-model.js";

function createBaseConfig() {
    return {
        mission_name: "Primary Mission",
        mission_name_short: "PM",
        spacecraft_mnemonic: "PM",
        primaryCraftId: "PM",
        ephemeris_source: "chebyshev",
        ephemeris_sources: {
            PM: "chebyshev",
            SC: "chebyshev",
        },
        origins: ["geo", "lunar"],
        crafts: [
            {
                id: "PM",
                mnemonic: "PM",
                primary: true,
                aliases: ["SC"],
                spans: {},
            },
        ],
        geo: {
            startTime: "2023-01-01T00:00:00Z",
            endTime: "2023-01-11T00:00:00Z",
            step_size_in_seconds: 60,
            planets: ["MOON", "PM"],
            center: "earth_center",
            orbits_file: "geo-PM",
        },
        lunar: {
            startTime: "2023-01-01T00:00:00Z",
            endTime: "2023-01-11T00:00:00Z",
            step_size_in_seconds: 60,
            planets: ["PM", "EARTH"],
            center: "moon_center",
            orbits_file: "lunar-PM",
        },
    };
}

function createCompareMissionConfig() {
    return {
        mission_name: "Compare Mission",
        mission_name_short: "CM",
        spacecraft_mnemonic: "CM",
        primaryCraftId: "CM",
        ephemeris_source: "chebyshev",
        origins: ["geo", "lunar"],
        crafts: [
            {
                id: "CM",
                mnemonic: "CM",
                name: "Orion",
                primary: true,
                color: "#ff00ff",
                orbitcolor: "#00ffff",
            },
        ],
        geo: {
            startTime: "2022-01-01T00:00:00Z",
            endTime: "2022-01-06T00:00:00Z",
            step_size_in_seconds: 60,
            planets: ["MOON", "SC"],
            center: "earth_center",
            orbits_file: "geo-CM",
        },
        lunar: {
            startTime: "2022-01-01T00:00:00Z",
            endTime: "2022-01-06T00:00:00Z",
            step_size_in_seconds: 60,
            planets: ["SC", "EARTH"],
            center: "moon_center",
            orbits_file: "lunar-CM",
        },
        relative: {
            orbits_file: "relative-CM",
        },
    };
}

describe("comparison overlay model", () => {
    it("does not coerce missing range endpoints into epoch-zero comparison coverage", () => {
        const { sourceTimeRangesByOrigin } = buildComparisonTimeRanges({
            primaryConfig: createBaseConfig(), primaryCraftId: "PM",
            comparisonConfig: { origins: ["geo"], geo: {} }, comparisonCraftId: "CM",
        });
        expect(sourceTimeRangesByOrigin).toEqual({});
    });

    it("preserves a real epoch-zero range without inventing absent origin ranges", () => {
        const zeroConfig = {
            origins: ["geo"], spacecraft_mnemonic: "CM",
            geo: { startTime: "1970-01-01T00:00:00Z", endTime: "1970-01-01T00:00:01Z" },
        };
        const ranges = buildComparisonTimeRanges({ primaryConfig: zeroConfig, primaryCraftId: "CM",
            comparisonConfig: zeroConfig, comparisonCraftId: "CM" });
        expect(ranges.sourceTimeRangesByOrigin).toEqual({ geo: { startMs: 0, endMs: 1000 } });
        expect(ranges.displayTimeRangesByOrigin).toEqual({ geo: { startMs: 0, endMs: 1000 } });
    });

    it("builds a pure compare overlay augmentation that can be merged into runtime config", () => {
        const baseConfig = createBaseConfig();
        const augmentation = buildComparisonOverlayAugmentation({
            baseConfig,
            comparisonConfig: createCompareMissionConfig(),
            comparisonDataPath: "assets/artemis1/data/",
            compareMission: {
                folder: "artemis1",
                missionName: "Artemis 1",
            },
            currentMissionFolder: "chandrayaan3",
            createUTCTimestamp: () => 0,
            selectedPrimaryAlignmentEventKey: "tli",
            selectedComparisonAlignmentEventKey: "loi",
        });

        expect(augmentation).toBeTruthy();
        expect(augmentation.compareCraft).toMatchObject({
            id: "CMP_ARTEMIS1_CM",
            viewLabel: "CM Orion",
            comparisonOverlay: true,
        });
        expect(augmentation.ephemerisSourceByCraftId).toEqual({
            CMP_ARTEMIS1_CM: "chebyshev",
        });
        expect(augmentation.comparisonOverlay).toMatchObject({
            missionFolder: "artemis1",
            compareCraftId: "CMP_ARTEMIS1_CM",
            selectedPrimaryAlignmentEventKey: "tli",
            selectedComparisonAlignmentEventKey: "loi",
            defaultVisibleCraftIds: ["PM", "CMP_ARTEMIS1_CM"],
        });

        const mergedConfig = mergeComparisonOverlayIntoBaseConfig(
            baseConfig,
            augmentation,
        );
        expect(mergedConfig.crafts).toHaveLength(2);
        expect(mergedConfig.ephemeris_sources.CMP_ARTEMIS1_CM).toBe("chebyshev");
        expect(mergedConfig.comparisonOverlay.compareCraftId).toBe("CMP_ARTEMIS1_CM");
    });

    it("returns null when no valid comparison time ranges are available", () => {
        const augmentation = buildComparisonOverlayAugmentation({
            baseConfig: createBaseConfig(),
            comparisonConfig: createCompareMissionConfig(),
            comparisonDataPath: "assets/artemis1/data/",
            compareMission: {
                folder: "artemis1",
            },
            createUTCTimestamp: () => 0,
            buildComparisonTimeRangesImpl: () => ({
                displayTimeRangesByOrigin: {},
                sourceTimeRangesByOrigin: {},
            }),
        });

        expect(augmentation).toBeNull();
    });
});
