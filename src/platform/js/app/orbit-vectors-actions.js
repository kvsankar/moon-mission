import { resolveMissionCraft } from "../core/domain/mission-config.js";
import { generateCurveFromChebyshev } from "../chebyshev.js";
import { generateCurveFromNpz } from "../data/npz-ephemeris.js";
import { shouldShowSceneCraft } from "./scene-craft-helpers.js";
import {
    selectSeriesFromChebyshev,
    selectSeriesFromNpz,
} from "../data/ephemeris-provider.js";
import {
    buildCurveTimes,
    mixColors,
    normalizeHexColor,
    ORBIT_TRAIL_STYLE,
    resolveTailVisualStyle,
    resolveTrackOpacity2D,
} from "./orbit-trail-style.js";
import { invalidateSceneOrbitOverlap } from "./orbit-overlap-manager.js";
import {
    resolveGeneratedCurvePoints,
    resolvePostHorizonExtension,
} from "./post-horizons-extension.js";
import { normalizeComparisonCurveVectors } from "./comparison-normalization.js";

const GENERATED_ORBIT_SEGMENT_COLOR = "#ffb347";

export function createOrbitVectorsActions({
    d3,
    sleep,
    getSvgContainer,
    getCurrentDimension,
    getConfig,
    animationScenes,
    planetProperties,
    shouldDrawOrbit,
    chebyshevDataLoaded,
    chebyshevData,
    npzData,
    npzDataLoaded,
    getEphemerisSource,
    resolveBodySource,
    generateBodyCurve,
    getStartTime,
    getLatestEndTime,
    getZoomFactor,
    getPlaneVariables,
    getGlobalConfig,
    getOrbitStyle = () => "classic",
    getTrailTrackBrightness2D = () => 1,
    getTrailTailBrightness2D = () => 1,
    planetStartTime,
    PC,
    UC,
    getPixelsPerAU,
    getEpochJD,
    getEpochDate,
    setEpochDisplay,
    getIsCompareMode = () => false,
}) {
    const curveCacheByConfig = new Map();
    const readGlobalConfig =
        typeof getGlobalConfig === "function"
            ? getGlobalConfig
            : () => null;
    const readOrbitStyle =
        typeof getOrbitStyle === "function"
            ? getOrbitStyle
            : () => "classic";
    const readTrailTrackBrightness2D =
        typeof getTrailTrackBrightness2D === "function"
            ? getTrailTrackBrightness2D
            : () => 1;
    const readTrailTailBrightness2D =
        typeof getTrailTailBrightness2D === "function"
            ? getTrailTailBrightness2D
            : () => 1;
    const ORBIT_BACKGROUND_CHUNK_SIZE = 80;

    function chunkOrbitPoints(points, chunkSize = ORBIT_BACKGROUND_CHUNK_SIZE) {
        const chunks = [];
        if (!Array.isArray(points) || points.length < 2) {
            return chunks;
        }
        const size = Math.max(8, chunkSize);
        for (let start = 0; start < points.length - 1; start += size - 1) {
            const end = Math.min(points.length - 1, start + size - 1);
            const chunk = points.slice(start, end + 1);
            if (chunk.length >= 2) {
                chunks.push({
                    points: chunk,
                    startIndex: start,
                    endIndex: end,
                });
            }
        }
        return chunks;
    }

    function applyOrbitSvgStyle(
        orbitElement,
        orbitStyle,
        trailTrackBrightness2D = 1,
        trailTailBrightness2D = 1,
    ) {
        if (!orbitElement) return;
        const style = "classic";
        const showTrail = false;
        const tailStyle = resolveTailVisualStyle({
            dimension: "2D",
            prominence: trailTailBrightness2D,
        });
        orbitElement.setAttribute("data-orbit-style", style);
        orbitElement
            .querySelectorAll(".orbit-classic-path")
            .forEach((element) =>
                element.setAttribute("visibility", style === "classic" ? "inherit" : "hidden"),
            );
        orbitElement
            .querySelectorAll(".orbit-trail-background, .orbit-trail-tail, .orbit-trail-mid, .orbit-trail-head-glow, .orbit-trail-head")
            .forEach((element) =>
                element.setAttribute("visibility", showTrail ? "inherit" : "hidden"),
            );
        orbitElement
            .querySelectorAll(".orbit-trail-background")
            .forEach((element) =>
                element.setAttribute(
                    "stroke-opacity",
                    String(resolveTrackOpacity2D(trailTrackBrightness2D)),
                ),
            );
        orbitElement
            .querySelectorAll(".orbit-trail-tail")
            .forEach((element) =>
                element.setAttribute(
                    "stroke-opacity",
                    String(tailStyle.tailOpacity),
                ),
            );
        orbitElement
            .querySelectorAll(".orbit-trail-mid")
            .forEach((element) =>
                element.setAttribute(
                    "stroke-opacity",
                    String(tailStyle.midOpacity),
                ),
            );
        orbitElement
            .querySelectorAll(".orbit-trail-head-glow")
            .forEach((element) =>
                element.setAttribute(
                    "stroke-opacity",
                    String(tailStyle.headGlowOpacity),
                ),
            );
        orbitElement
            .querySelectorAll(".orbit-trail-head")
            .forEach((element) =>
                element.setAttribute(
                    "stroke-opacity",
                    String(tailStyle.headOpacity),
                ),
            );
    }

    function getPlanetProps(bodyId) {
        const missionCraft = resolveMissionCraft(readGlobalConfig(), bodyId);
        if (!missionCraft) {
            return planetProperties[bodyId];
        }

        const explicitProps =
            planetProperties[missionCraft.id] ||
            planetProperties[missionCraft.mnemonic] ||
            planetProperties[bodyId];

        if (explicitProps) {
            return explicitProps;
        }

        const fallbackProps = planetProperties.SC;
        if (!fallbackProps) {
            return null;
        }

        return {
            ...fallbackProps,
            id: missionCraft.id || bodyId,
            name: missionCraft.viewLabel || missionCraft.name || missionCraft.mnemonic || bodyId,
            color: missionCraft.color || fallbackProps.color,
            orbitcolor: missionCraft.orbitcolor || missionCraft.color || fallbackProps.orbitcolor,
        };
    }

    function resolveBodyOrbitVectors({
        bodyId,
        config,
        stepMs,
        resolvedSource,
        defaultSpacecraftSource,
        compareMode = false,
    }) {
        const globalConfig = readGlobalConfig();
        const missionCraft = resolveMissionCraft(globalConfig, bodyId);
        const startTimeMs = getStartTime();
        const endTimeMs = getLatestEndTime();
        const useSampledCurve = compareMode && !!missionCraft && typeof generateBodyCurve === "function";
        const cacheKey =
            `${resolvedSource}|${startTimeMs}|${endTimeMs}|${stepMs}|${useSampledCurve ? "sampled" : "series"}`;

        let configCache = curveCacheByConfig.get(config);
        if (!configCache) {
            configCache = new Map();
            curveCacheByConfig.set(config, configCache);
        }

        const cached = configCache.get(bodyId);
        if (cached && cached.cacheKey === cacheKey) {
            return cached.vectors;
        }

        const spacecraftMnemonic =
            missionCraft?.mnemonic ||
            globalConfig?.spacecraft_mnemonic ||
            "SC";
        let vectors = [];

        if (useSampledCurve) {
            vectors = generateBodyCurve({
                bodyId,
                config,
                startTimeMs,
                endTimeMs,
                stepMs,
                npzData,
                npzDataLoaded,
                chebyshevData,
                chebyshevDataLoaded,
                globalConfig,
                resolvedSource,
                spacecraftMnemonic,
                defaultSpacecraftSource,
            });
        } else if (resolvedSource === "npz" && npzDataLoaded?.[config]) {
            const series = selectSeriesFromNpz(
                npzData,
                config,
                bodyId,
                spacecraftMnemonic,
            );
            if (series) {
                vectors = generateCurveFromNpz(
                    series,
                    startTimeMs,
                    endTimeMs,
                    stepMs,
                );
            }
        } else if (resolvedSource === "chebyshev" && chebyshevDataLoaded?.[config]) {
            const series = selectSeriesFromChebyshev(
                chebyshevData,
                config,
                bodyId,
                spacecraftMnemonic,
            );
            if (series) {
                vectors = generateCurveFromChebyshev(
                    series,
                    startTimeMs,
                    endTimeMs,
                    stepMs,
                );
            }
        } else if (typeof generateBodyCurve === "function") {
            vectors = generateBodyCurve({
                bodyId,
                config,
                startTimeMs,
                endTimeMs,
                stepMs,
                npzData,
                npzDataLoaded,
                chebyshevData,
                chebyshevDataLoaded,
                globalConfig,
                resolvedSource,
                spacecraftMnemonic,
                defaultSpacecraftSource,
            });
        }

        configCache.set(bodyId, { cacheKey, vectors });
        return vectors;
    }

    async function processOrbitVectorsData(context = {}) {
        // Add spacecraft orbits (2D SVG mode)
        const config = context.config ?? getConfig();
        const scene = animationScenes[config];
        const initialSvgContainer = getSvgContainer();
        const dimension = getCurrentDimension();
        // An origin can be revisited, or its SVG recreated, while this job yields.
        // Matching the current mode alone does not identify the work's owner.
        const isCurrent = () =>
            !!scene && !!initialSvgContainer && dimension === "2D" &&
            getConfig() === config && getCurrentDimension() === dimension &&
            animationScenes[config] === scene && scene.stopCreationFlag !== true &&
            getSvgContainer() === initialSvgContainer &&
            (typeof context.isCurrent !== "function" || context.isCurrent());
        if (!isCurrent()) return false;

        invalidateSceneOrbitOverlap(scene);
        scene.orbitSvgPointsByBodyId = {};
        scene.orbitSvgBackgroundChunksByBodyId = {};
        scene.orbitSvgBackgroundBaseOpacitiesByBodyId = {};
        scene.orbitTimesByBodyId = {};
        scene.orbitSvgGeneratedPointsByBodyId = {};
        const postHorizonExtension = resolvePostHorizonExtension(readGlobalConfig(), config);
        const compareMode = typeof getIsCompareMode === "function"
            ? !!getIsCompareMode()
            : false;

        for (let i = 0; i < scene.planetsForLocations.length; ++i) {
            const planetKey = scene.planetsForLocations[i];
            const planetProps = getPlanetProps(planetKey);

            if (!planetProps) {
                continue;
            }

            if (shouldDrawOrbit(planetKey)) {
                if (!isCurrent()) {
                    return false;
                }

                const stepMs = animationScenes[config].stepDurationInMilliSeconds;
                const resolvedSource =
                    typeof resolveBodySource === "function"
                        ? resolveBodySource(planetKey)
                        : typeof getEphemerisSource === "function"
                          ? getEphemerisSource()
                          : "chebyshev";
                const defaultSpacecraftSource =
                    typeof getEphemerisSource === "function"
                        ? getEphemerisSource()
                        : "chebyshev";
                const rawVectors = resolveBodyOrbitVectors({
                    bodyId: planetKey,
                    config,
                    stepMs,
                    resolvedSource,
                    defaultSpacecraftSource,
                    compareMode,
                });
                const vectors = normalizeComparisonCurveVectors({
                    compareMode,
                    bodyId: planetKey,
                    vectors: rawVectors,
                    config,
                    globalConfig: readGlobalConfig(),
                    npzData,
                    npzDataLoaded,
                    chebyshevData,
                    chebyshevDataLoaded,
                    resolveBodySource,
                    defaultSpacecraftSource,
                });

                if (vectors.length === 0) {
                    console.warn(
                        `No orbit data available for ${planetKey} in 2D mode`,
                    );
                    continue;
                }

                const svgContainer = getSvgContainer();
                if (!svgContainer) return;

                svgContainer
                    .append("g")
                    .attr("id", "orbit-" + planetKey)
                    .attr("visibility", shouldShowSceneCraft({
                        scene,
                        globalConfig: readGlobalConfig(),
                        bodyId: planetKey,
                    }) ? "visible" : "hidden");

                const { xFactor, yFactor, xVariable, yVariable } = getPlaneVariables();
                const zoomFactor = getZoomFactor();
                const pixelsPerAU = getPixelsPerAU();
                const orbitColor = normalizeHexColor(
                    planetProps.orbitcolor,
                    "#6ccfff",
                );
                const headColor = mixColors(orbitColor, "#ffffff", 0.42);
                const tailStyle = resolveTailVisualStyle({
                    dimension: "2D",
                    prominence: scene?.trailTailProminence2D,
                });
                const orbitPoints = vectors.map((d) => ({
                    x: (+1 * xFactor * d[xVariable]) / PC.KM_PER_AU * pixelsPerAU,
                    y: (-1 * yFactor * d[yVariable]) / PC.KM_PER_AU * pixelsPerAU,
                }));
                scene.orbitSvgPointsByBodyId[planetKey] = orbitPoints;
                scene.orbitTimesByBodyId[planetKey] = buildCurveTimes(
                    vectors,
                    getStartTime(),
                    stepMs,
                );
                // Post-horizon extension belongs to the primary mission — e.g.
                // Artemis 2's splashdown continuation past its HORIZONS data end.
                // In compare mode the compare craft carries its own mission's
                // real HORIZONS data (alignment-mapped into the display window),
                // so skip the "generated" dashed overlay for it; otherwise the
                // entire compare-craft trajectory past the primary's
                // sourceEndMs gets flagged as generated and repainted as a
                // dashed orange curve on top of its real orbit.
                const comparisonOverlayCraftId = readGlobalConfig()?.comparisonOverlay?.compareCraftId;
                const isComparisonCraft =
                    !!comparisonOverlayCraftId && planetKey === comparisonOverlayCraftId;
                scene.orbitSvgGeneratedPointsByBodyId[planetKey] = isComparisonCraft
                    ? []
                    : resolveGeneratedCurvePoints(
                        orbitPoints,
                        scene.orbitTimesByBodyId[planetKey],
                        postHorizonExtension?.sourceEndMs,
                    );
                scene.orbitSvgBackgroundChunksByBodyId[planetKey] = chunkOrbitPoints(orbitPoints);
                scene.orbitSvgBackgroundBaseOpacitiesByBodyId[planetKey] =
                    scene.orbitSvgBackgroundChunksByBodyId[planetKey].map(() =>
                        resolveTrackOpacity2D(readTrailTrackBrightness2D()),
                    );
                const pointsToAttr = (points) =>
                    points
                        .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
                        .join(" ");

                var line = d3.svg
                    .line()
                    .x(function (d) {
                        return d.x;
                    })
                    .y(function (d) {
                        return d.y;
                    })
                    .interpolate("cardinal-open");

                svgContainer
                    .select("#" + "orbit-" + planetKey)
                    .append("path")
                    .attr("class", "orbit-classic-path")
                    .attr("d", line(orbitPoints))
                    .attr(
                        "style",
                        "stroke: " +
                            planetProps.orbitcolor +
                            "; stroke-width: " +
                            1.0 / zoomFactor +
                            "; fill: none",
                    )
                    .attr("visibility", "inherit");

                if (scene.orbitSvgGeneratedPointsByBodyId[planetKey].length >= 2) {
                    svgContainer
                        .select("#" + "orbit-" + planetKey)
                        .append("polyline")
                        .attr("class", "orbit-generated-path")
                        .attr("points", pointsToAttr(scene.orbitSvgGeneratedPointsByBodyId[planetKey]))
                        .attr("fill", "none")
                        .attr("stroke", GENERATED_ORBIT_SEGMENT_COLOR)
                        .attr("stroke-width", 1.6 / zoomFactor)
                        .attr("stroke-opacity", 0.98)
                        .attr("stroke-dasharray", `${6 / zoomFactor} ${4 / zoomFactor}`)
                        .attr("stroke-linecap", "round")
                        .attr("stroke-linejoin", "round")
                        .attr("visibility", "inherit");
                }

                scene.orbitSvgBackgroundChunksByBodyId[planetKey].forEach((chunk, index) => {
                    svgContainer
                        .select("#" + "orbit-" + planetKey)
                        .append("polyline")
                        .attr("class", "orbit-trail-background")
                        .attr("data-chunk-index", String(index))
                        .attr("points", pointsToAttr(chunk.points))
                        .attr("fill", "none")
                        .attr("stroke", orbitColor)
                        .attr("stroke-width", ORBIT_TRAIL_STYLE.backgroundWidth2D / zoomFactor)
                        .attr(
                            "stroke-opacity",
                            scene.orbitSvgBackgroundBaseOpacitiesByBodyId[planetKey][index],
                        )
                        .attr("stroke-linecap", "butt")
                        .attr("stroke-linejoin", "round")
                        .attr("visibility", "hidden");
                });

                svgContainer
                    .select("#" + "orbit-" + planetKey)
                    .append("polyline")
                    .attr("class", "orbit-trail-tail")
                    .attr("id", `orbit-trail-${planetKey}`)
                    .attr("points", "")
                    .attr("fill", "none")
                    .attr("stroke", orbitColor)
                    .attr("stroke-width", tailStyle.tailWidth / zoomFactor)
                    .attr("stroke-opacity", tailStyle.tailOpacity)
                    .attr("stroke-linecap", "round")
                    .attr("stroke-linejoin", "round")
                    .attr("visibility", "hidden");

                svgContainer
                    .select("#" + "orbit-" + planetKey)
                    .append("polyline")
                    .attr("class", "orbit-trail-mid")
                    .attr("id", `orbit-mid-${planetKey}`)
                    .attr("points", "")
                    .attr("fill", "none")
                    .attr("stroke", mixColors(orbitColor, "#ffffff", 0.22))
                    .attr("stroke-width", tailStyle.midWidth / zoomFactor)
                    .attr("stroke-opacity", tailStyle.midOpacity)
                    .attr("stroke-linecap", "round")
                    .attr("stroke-linejoin", "round")
                    .attr("visibility", "hidden");

                svgContainer
                    .select("#" + "orbit-" + planetKey)
                    .append("polyline")
                    .attr("class", "orbit-trail-head-glow")
                    .attr("id", `orbit-head-glow-${planetKey}`)
                    .attr("points", "")
                    .attr("fill", "none")
                    .attr("stroke", mixColors(orbitColor, "#ffffff", 0.58))
                    .attr("stroke-width", tailStyle.headGlowWidth / zoomFactor)
                    .attr("stroke-opacity", tailStyle.headGlowOpacity)
                    .attr("stroke-linecap", "round")
                    .attr("stroke-linejoin", "round")
                    .attr("visibility", "hidden");

                svgContainer
                    .select("#" + "orbit-" + planetKey)
                    .append("polyline")
                    .attr("class", "orbit-trail-head")
                    .attr("id", `orbit-head-${planetKey}`)
                    .attr("points", "")
                    .attr("fill", "none")
                    .attr("stroke", headColor)
                    .attr("stroke-width", tailStyle.headWidth / zoomFactor)
                    .attr("stroke-opacity", tailStyle.headOpacity)
                    .attr("stroke-linecap", "round")
                    .attr("stroke-linejoin", "round")
                    .attr("visibility", "hidden");

                svgContainer
                    .select(`#orbit-trail-${planetKey}`)
                    .attr("points", pointsToAttr([]));
                svgContainer
                    .select(`#orbit-mid-${planetKey}`)
                    .attr("points", pointsToAttr([]));
                svgContainer
                    .select(`#orbit-head-glow-${planetKey}`)
                    .attr("points", pointsToAttr([]));
                svgContainer
                    .select(`#orbit-head-${planetKey}`)
                    .attr("points", pointsToAttr([]));

                const orbitElement = typeof document !== "undefined"
                    ? document.getElementById(`orbit-${planetKey}`)
                    : null;
                applyOrbitSvgStyle(
                    orbitElement,
                    readOrbitStyle(),
                    readTrailTrackBrightness2D(),
                    readTrailTailBrightness2D(),
                );
            }
        }

        await sleep();
        if (!isCurrent()) {
            return false;
        }

        // Add center planet - Sun/Earth/Mars/Moon
        {
            const svgContainer = getSvgContainer();
            if (!svgContainer) return;

            svgContainer
                .append("circle")
                .attr("id", scene.primaryBody)
                .attr("cx", 0)
                .attr("cy", 0)
                .attr("r", animationScenes[config].primaryBodyRadius)
                .attr("fill-opacity", "0.6")
                .attr("stroke", "none")
                .attr("stroke-width", 0)
                .attr(
                    "fill",
                    planetProperties[scene.primaryBody].color,
                );
        }

        await sleep();
        if (!isCurrent()) {
            return false;
        }

        if (config == "geo" || config == "helio") {
            const svgContainer = getSvgContainer();
            if (!svgContainer) return;

            svgContainer
                .append("g")
                .attr("class", "label")
                .append("text")
                .attr("id", "label-" + scene.primaryBody)
                .attr("x", UC.CENTER_LABEL_OFFSET_X)
                .attr("y", UC.CENTER_LABEL_OFFSET_Y)
                .attr("font-size", 10 / getZoomFactor())
                .attr(
                    "fill",
                    planetProperties[scene.primaryBody].color,
                )
                .text(planetProperties[scene.primaryBody].name);
        }

        await sleep();
        if (!isCurrent()) {
            return false;
        }

        if (config == "martian") {
            const svgContainer = getSvgContainer();
            if (!svgContainer) return;

            const r = (3390 / PC.KM_PER_AU) * getPixelsPerAU() / getZoomFactor();
            svgContainer
                .append("image")
                .attr("id", "mars-image")
                .attr("xlink:href", "cy3-mars-image-transparent.gif")
                .attr("x", -r)
                .attr("y", -r)
                .attr("height", 2 * r)
                .attr("width", 2 * r);
        }

        await sleep();
        if (!isCurrent()) {
            return false;
        }

        // Add planetary positions
        for (let i = 0; i < scene.planetsForLocations.length; ++i) {
            const planetKey = scene.planetsForLocations[i];
            const planetProps = getPlanetProps(planetKey);

            if (!planetProps) {
                continue;
            }

            // If a planet location is avialable only after an interval of time from the epoch (startTime)
            // For example, Maven and the Mars Orbiter Mission were launched at different times.
            // The "offset" vallue is to take care of such scenarios.

            const planetIndexOffset =
                (planetStartTime(planetKey) - getStartTime()) /
                animationScenes[config].stepDurationInMilliSeconds;
            if (planetProperties[planetKey]) {
                planetProperties[planetKey].offset = planetIndexOffset;
            }

            const svgContainer = getSvgContainer();
            if (!svgContainer) return;

            svgContainer
                .append("circle")
                .attr("id", planetKey)
                .attr("cx", 0)
                .attr("cy", 0)
                .attr("r", planetProps.r / getZoomFactor())
                .attr("stroke", "none")
                .attr("stroke-width", 0)
                .attr("fill", planetProps.color)
                .attr("visibility", shouldShowSceneCraft({
                    scene,
                    globalConfig: readGlobalConfig(),
                    bodyId: planetKey,
                }) ? "visible" : "hidden");
        }

        await sleep();
        if (!isCurrent()) {
            return false;
        }

        // Add fire
        {
            const svgContainer = getSvgContainer();
            if (!svgContainer) return;

            svgContainer
                .append("g")
                .attr("id", "burng")
                .style("visibility", "hidden")
                .append("polygon")
                .attr("id", "burn")
                .attr("points", "3 9 3 -9 45 0")
                .attr("fill", "red");
        }

        await sleep();
        if (!isCurrent()) {
            return false;
        }

        // Add labels
        {
            const svgContainer = getSvgContainer();
            if (!svgContainer) return;

            svgContainer.append("g").attr("id", "labels").attr("class", "label");
        }

        for (let i = 0; i < scene.planetsForLocations.length; ++i) {
            const planetKey = scene.planetsForLocations[i];
            const planetProps = getPlanetProps(planetKey);

            if (!planetProps) {
                continue;
            }

            d3.select("#labels")
                .append("text")
                .attr("id", "label-" + planetKey)
                .attr("x", 0)
                .attr("y", 0)
                .attr("font-size", 10 / getZoomFactor())
                .attr("fill", planetProps.color)
                .attr("visibility", shouldShowSceneCraft({
                    scene,
                    globalConfig: readGlobalConfig(),
                    bodyId: planetKey,
                }) ? "visible" : "hidden");

            d3.select("#label-" + planetKey).text(planetProps.name);
        }

        await sleep();
        if (!isCurrent()) {
            return false;
        }

        if (config == "geo") {
            // Add Greenwich longitude
            const svgContainer = getSvgContainer();
            if (!svgContainer) return;

            svgContainer
                .append("line")
                .attr("id", "Greenwich")
                .attr("class", "geo")
                .attr("x1", 0)
                .attr("y1", 0)
                .attr("x2", 0)
                .attr("y2", 0)
                .attr(
                    "style",
                    "stroke: DarkGray; stroke-opacity: 0.5; stroke-width: " +
                        0.5 / getZoomFactor(),
                )
                .attr("visibility", "inherit");
        }

        await sleep();
        if (!isCurrent()) return false;

        setEpochDisplay({ epochJD: getEpochJD(), epochDate: getEpochDate() });
        return true;
    }

    return { processOrbitVectorsData };
}
