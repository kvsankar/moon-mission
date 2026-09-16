import { describe, expect, it, vi } from "vitest";

import {
    loadComparisonOverlayConfig,
} from "../src/platform/js/app/comparison-overlay-loader.js";
import {
    mapComparisonBodyTimeMs,
    mapComparisonSourceTimeMsToDisplayTime,
    mapOffsetTimeRange,
    resolveComparisonOverlayNormalizationSupportBodyId,
    resolveComparisonDisplayAvailabilityTimeRange,
    resolveComparisonDisplayTimeRange,
} from "../src/platform/js/core/domain/comparison-overlay.js";

function createBaseConfig({
    primaryCraftColor,
    primaryCraftOrbitColor,
} = {}) {
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
                color: primaryCraftColor,
                orbitcolor: primaryCraftOrbitColor,
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

function createCompareMissionConfigWithoutRelative() {
    const config = createCompareMissionConfig();
    delete config.relative;
    return config;
}

describe("comparison overlay", () => {
    it("maps comparison display time into the comparison mission source window without stretching durations", () => {
        const globalConfig = {
            comparisonOverlay: {
                compareCraftId: "CMP_ARTEMIS1_CM",
                displayTimeRangesByOrigin: {
                    geo: {
                        startMs: 0,
                        endMs: 100,
                    },
                },
                sourceTimeRangesByOrigin: {
                    geo: {
                        startMs: 1000,
                        endMs: 2000,
                    },
                },
            },
        };

        expect(resolveComparisonDisplayTimeRange({
            globalConfig,
            bodyId: "CMP_ARTEMIS1_CM",
            config: "geo",
        })).toEqual({
            startMs: 0,
            endMs: 100,
        });
        expect(mapComparisonBodyTimeMs({
            globalConfig,
            bodyId: "CMP_ARTEMIS1_CM",
            config: "geo",
            timeMs: 25,
        })).toBe(1025);
        expect(mapComparisonBodyTimeMs({
            globalConfig,
            bodyId: "PM",
            config: "geo",
            timeMs: 25,
        })).toBe(25);
        expect(mapOffsetTimeRange({
            timeMs: 2000,
            fromRange: { startMs: 1000, endMs: 2000 },
            toRange: { startMs: 0, endMs: 100 },
        })).toBe(1000);
    });

    it("derives a compare craft availability window from the source mission duration without stretching it", () => {
        const globalConfig = {
            comparisonOverlay: {
                compareCraftId: "CMP_ARTEMIS1_CM",
                displayTimeRangesByOrigin: {
                    geo: {
                        startMs: 0,
                        endMs: 100,
                    },
                },
                sourceTimeRangesByOrigin: {
                    geo: {
                        startMs: 1000,
                        endMs: 1060,
                    },
                },
            },
        };

        expect(resolveComparisonDisplayAvailabilityTimeRange({
            globalConfig,
            bodyId: "CMP_ARTEMIS1_CM",
            config: "geo",
        })).toEqual({
            startMs: 0,
            endMs: 60,
        });
    });

    it("maps comparison support body aliases into the comparison mission source window without stretching durations", () => {
        const globalConfig = {
            comparisonOverlay: {
                compareCraftId: "CMP_ARTEMIS1_CM",
                normalizationSupportBodyIdsByOrigin: {
                    geo: "CMP_ARTEMIS1_CM__MOON",
                },
                displayTimeRangesByOrigin: {
                    geo: {
                        startMs: 0,
                        endMs: 100,
                    },
                },
                sourceTimeRangesByOrigin: {
                    geo: {
                        startMs: 1000,
                        endMs: 2000,
                    },
                },
            },
        };

        expect(resolveComparisonOverlayNormalizationSupportBodyId({
            globalConfig,
            bodyId: "CMP_ARTEMIS1_CM",
            config: "geo",
        })).toBe("CMP_ARTEMIS1_CM__MOON");
        expect(mapComparisonBodyTimeMs({
            globalConfig,
            bodyId: "CMP_ARTEMIS1_CM__MOON",
            config: "geo",
            timeMs: 25,
        })).toBe(1025);
    });

    it("supports custom event-pair alignment without stretching the comparison mission timeline", () => {
        const globalConfig = {
            comparisonOverlay: {
                compareCraftId: "CMP_ARTEMIS1_CM",
                selectedPrimaryAlignmentEventKey: "tli",
                selectedComparisonAlignmentEventKey: "loi",
                primaryTimelineEventInfosByOrigin: {
                    geo: [
                        {
                            key: "launch",
                            label: "Launch",
                            startTime: new Date(100),
                        },
                        {
                            key: "tli",
                            label: "TLI",
                            startTime: new Date(400),
                        },
                    ],
                },
                timelineSourceEventInfosByOrigin: {
                    geo: [
                        {
                            key: "launch",
                            label: "Launch",
                            startTime: new Date(1000),
                        },
                        {
                            key: "loi",
                            label: "LOI",
                            startTime: new Date(1600),
                        },
                    ],
                },
                displayTimeRangesByOrigin: {
                    geo: {
                        startMs: 0,
                        endMs: 2000,
                    },
                },
                sourceTimeRangesByOrigin: {
                    geo: {
                        startMs: 1000,
                        endMs: 3000,
                    },
                },
            },
        };

        expect(mapComparisonBodyTimeMs({
            globalConfig,
            bodyId: "CMP_ARTEMIS1_CM",
            config: "geo",
            timeMs: 400,
        })).toBe(1600);
        expect(mapComparisonSourceTimeMsToDisplayTime({
            globalConfig,
            bodyId: "CMP_ARTEMIS1_CM",
            config: "geo",
            timeMs: 1600,
        })).toBe(400);
        expect(resolveComparisonDisplayAvailabilityTimeRange({
            globalConfig,
            bodyId: "CMP_ARTEMIS1_CM",
            config: "geo",
        })).toEqual({
            startMs: -200,
            endMs: 1800,
        });
    });

    it("loads and merges a comparison mission into compare mode runtime config", async () => {
        const fetchImpl = vi.fn(async (url) => {
            if (url === "assets/artemis1/data/config.json") {
                return {
                    ok: true,
                    json: async () => createCompareMissionConfig(),
                };
            }
            if (url === "assets/artemis1/data/ephemeris-manifest.json") {
                return {
                    ok: false,
                    status: 404,
                    json: async () => null,
                };
            }
            throw new Error(`Unexpected fetch URL: ${url}`);
        });

        const mergedConfig = await loadComparisonOverlayConfig({
            baseConfig: createBaseConfig(),
            windowRef: {
                location: {
                    search: "?mode=compare&compareMission=artemis1&comparePrimaryEvent=tli&compareSecondaryEvent=loi",
                },
                missionConfig: {
                    dataPath: "assets/chandrayaan3/data/",
                },
            },
            fetchImpl,
            createUTCTimestamp: () => 0,
        });

        expect(mergedConfig.crafts).toHaveLength(2);
        expect(mergedConfig.comparisonOverlay).toBeTruthy();
        expect(mergedConfig.comparisonOverlay.compareCraftId).toBe("CMP_ARTEMIS1_CM");
        expect(mergedConfig.comparisonOverlay.defaultVisibleCraftIds).toEqual([
            "PM",
            "CMP_ARTEMIS1_CM",
        ]);
        expect(mergedConfig.comparisonOverlay.selectedPrimaryAlignmentEventKey).toBe("tli");
        expect(mergedConfig.comparisonOverlay.selectedComparisonAlignmentEventKey).toBe("loi");
        expect(mergedConfig.comparisonOverlay.normalizationSupportBodyIdsByOrigin).toEqual({
            geo: "CMP_ARTEMIS1_CM__MOON",
            relative: "CMP_ARTEMIS1_CM__MOON",
            lunar: "CMP_ARTEMIS1_CM__EARTH",
        });
        expect(mergedConfig.comparisonOverlay.supportOrbitChebyshevUrlsByOrigin).toEqual({
            geo: "assets/artemis1/data/geo-CM-cheb.json",
            lunar: "assets/artemis1/data/lunar-CM-cheb.json",
            relative: "assets/artemis1/data/relative-CM-cheb.json",
        });
        expect(mergedConfig.ephemeris_sources.CMP_ARTEMIS1_CM).toBe("chebyshev");
        expect(mergedConfig.crafts[1]).toMatchObject({
            id: "CMP_ARTEMIS1_CM",
            viewLabel: "CM Orion",
            comparisonOverlay: true,
            color: "#d946ef",
            orbitcolor: "#22c55e",
        });
        expect(mergedConfig.comparisonOverlay.displayTimeRangesByOrigin.geo).toEqual({
            startMs: Date.parse("2023-01-01T00:00:00Z"),
            endMs: Date.parse("2023-01-11T00:00:00Z"),
        });
        expect(mergedConfig.comparisonOverlay.sourceTimeRangesByOrigin.geo).toEqual({
            startMs: Date.parse("2022-01-01T00:00:00Z"),
            endMs: Date.parse("2022-01-06T00:00:00Z"),
        });
    });

    it("ignores compareMission when compare mode is not active", async () => {
        const baseConfig = createBaseConfig();
        const mergedConfig = await loadComparisonOverlayConfig({
            baseConfig,
            windowRef: {
                location: {
                    search: "?mode=relative&compareMission=artemis1",
                },
                missionConfig: {
                    dataPath: "assets/chandrayaan3/data/",
                },
            },
            fetchImpl: vi.fn(),
            createUTCTimestamp: () => 0,
        });

        expect(mergedConfig).toBe(baseConfig);
    });

    it("falls back to the default relative orbit filename when compare config omits a relative block", async () => {
        const fetchImpl = vi.fn(async (url) => {
            if (url === "assets/artemis1/data/config.json") {
                return {
                    ok: true,
                    json: async () => createCompareMissionConfigWithoutRelative(),
                };
            }
            if (url === "assets/artemis1/data/ephemeris-manifest.json") {
                return {
                    ok: false,
                    status: 404,
                    json: async () => null,
                };
            }
            throw new Error(`Unexpected fetch URL: ${url}`);
        });

        const mergedConfig = await loadComparisonOverlayConfig({
            baseConfig: createBaseConfig(),
            windowRef: {
                location: {
                    search: "?mode=compare&compareMission=artemis1",
                },
                missionConfig: {
                    dataPath: "assets/chandrayaan3/data/",
                },
            },
            fetchImpl,
            createUTCTimestamp: () => 0,
        });

        expect(mergedConfig.comparisonOverlay.supportOrbitChebyshevUrlsByOrigin.relative).toBe(
            "assets/artemis1/data/relative-CM-cheb.json",
        );
    });

    it("picks a different compare palette when the primary craft already uses the default overlay colors", async () => {
        const fetchImpl = vi.fn(async (url) => {
            if (url === "assets/artemis1/data/config.json") {
                return {
                    ok: true,
                    json: async () => createCompareMissionConfig(),
                };
            }
            if (url === "assets/artemis1/data/ephemeris-manifest.json") {
                return {
                    ok: false,
                    status: 404,
                    json: async () => null,
                };
            }
            throw new Error(`Unexpected fetch URL: ${url}`);
        });

        const mergedConfig = await loadComparisonOverlayConfig({
            baseConfig: createBaseConfig({
                primaryCraftColor: "#d946ef",
                primaryCraftOrbitColor: "#22c55e",
            }),
            windowRef: {
                location: {
                    search: "?mode=compare&compareMission=artemis1",
                },
                missionConfig: {
                    dataPath: "assets/chandrayaan3/data/",
                },
            },
            fetchImpl,
            createUTCTimestamp: () => 0,
        });

        expect(mergedConfig.crafts[1]).toMatchObject({
            id: "CMP_ARTEMIS1_CM",
            color: "#38bdf8",
            orbitcolor: "#f97316",
        });
    });
});
