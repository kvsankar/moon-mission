import { applyOrbitStyleMetadataToScene } from "./orbit-style-meta-actions.js";
import {
    resolveComparisonOverlayNormalizationSourceBodyId,
    resolveComparisonOverlayNormalizationSupportBodyId,
} from "../core/domain/comparison-overlay.js";

/** @type {any} */
let orbitStyleMetaHideTimer = null;

export function createOrbitLoadActions({
    d3,
    sleep,
    getConfig,
    getCurrentDimension = () => undefined,
    getTransitionRevision = () => 0,
    animationScenes,
    orbitDataLoaded,
    chebyshevData,
    chebyshevDataLoaded,
    npzData,
    npzDataLoaded,
    getDataLoaded,
    setDataLoaded,
    loadChebyshev,
    loadJson,
    loadNpz,
    processOrbitData,
    ensureIndeterminateProgressBar,
    showElementById,
    hideElementById,
    updateProgressLabel,
    setEventInfoText,
    getEphemerisSource,
    getBodySource,
    getBodiesForConfig,
    onEphemerisLoaded,
    onEphemerisStatus,
    getGlobalConfig,
    getViewOrbit,
    getOrbitStyle,
    render,
    loadProgress,
}) {
    const orbitStyleMetaByConfig = new Map();
    const orbitStyleMetaPromiseByConfig = new Map();
    const latestRequestByConfig = new Map();
    const orbitRecordsByConfig = new Map();

    function getChebyshevBodySeries(chebData, bodyId, primaryCraftId = null) {
        if (!chebData || !bodyId) return null;
        if (chebData[bodyId]) return chebData[bodyId];
        if ((bodyId === "SC" || bodyId === primaryCraftId) && chebData.segments) return chebData;
        if (bodyId === primaryCraftId && chebData.SC) return chebData.SC;
        return null;
    }

    function getSupportChebyshevBodySeries(chebData, bodyId) {
        if (!chebData || !bodyId) return null;
        if (chebData[bodyId]) return chebData[bodyId];
        if (bodyId !== "MOON" && bodyId !== "EARTH" && bodyId !== "SUN" && chebData.SC) {
            return chebData.SC;
        }
        if (bodyId !== "MOON" && bodyId !== "EARTH" && bodyId !== "SUN" && chebData.segments) {
            return chebData;
        }
        if (bodyId === "SC" && chebData.segments) return chebData;
        return null;
    }

    function getChebyshevSegmentCount(chebData) {
        if (!chebData || typeof chebData !== "object") return 0;
        if (Array.isArray(chebData.segments)) return chebData.segments.length;
        const seriesList = Object.values(chebData).filter(
            (value) => value && Array.isArray(value.segments),
        );
        if (seriesList.length === 0) return 0;
        return Math.max(...seriesList.map((series) => series.segments.length));
    }

    function setSunFrame(chebData, sunFrame) {
        if (!chebData || typeof chebData !== "object" || !sunFrame) {
            return;
        }
        if (!chebData.metadata || typeof chebData.metadata !== "object") {
            chebData.metadata = {};
        }
        chebData.metadata.sun_frame = sunFrame;
    }

    function mergeMissingChebyshevBodySeries(
        targetChebData,
        supportChebData,
        bodyId,
        primaryCraftId = null,
    ) {
        if (
            !targetChebData ||
            typeof targetChebData !== "object" ||
            !supportChebData ||
            typeof supportChebData !== "object" ||
            !bodyId
        ) {
            return false;
        }

        if (getChebyshevBodySeries(targetChebData, bodyId, primaryCraftId)) {
            return false;
        }

        const supportSeries = getSupportChebyshevBodySeries(supportChebData, bodyId);
        if (!supportSeries || !Array.isArray(supportSeries.segments)) {
            return false;
        }

        targetChebData[bodyId] = supportSeries;
        return true;
    }

    function normalizeBodyId(bodyId) {
        return typeof bodyId === "string" ? bodyId.toUpperCase() : "";
    }

    function mergeComparisonNormalizationSupportSeries({
        targetChebData,
        supportChebData,
        bodyId,
        config,
        globalConfig,
    }) {
        const compareCraftId = normalizeBodyId(globalConfig?.comparisonOverlay?.compareCraftId);
        if (!compareCraftId || normalizeBodyId(bodyId) !== compareCraftId) {
            return false;
        }

        const aliasBodyId = resolveComparisonOverlayNormalizationSupportBodyId({
            globalConfig,
            bodyId,
            config,
        });
        const sourceBodyId = resolveComparisonOverlayNormalizationSourceBodyId({
            globalConfig,
            bodyId,
            config,
        });
        if (!aliasBodyId || !sourceBodyId || targetChebData?.[aliasBodyId]) {
            return false;
        }

        const supportSeries = supportChebData?.[sourceBodyId];
        if (!supportSeries || !Array.isArray(supportSeries.segments)) {
            return false;
        }

        targetChebData[aliasBodyId] = supportSeries;
        return true;
    }

    const recordEphemeris =
        typeof onEphemerisLoaded === "function"
            ? onEphemerisLoaded
            : () => {};
    const setStatus =
        typeof onEphemerisStatus === "function"
            ? onEphemerisStatus
            : () => {};
    const progress =
        loadProgress &&
        typeof loadProgress.beginSessionIfNeeded === "function" &&
        typeof loadProgress.setStage === "function" &&
        typeof loadProgress.completeStage === "function" &&
        typeof loadProgress.abortSession === "function" &&
        typeof loadProgress.isActive === "function"
            ? loadProgress
            : null;

    function setOrbitStyleMetaIndicator(status, text, { sticky = false } = {}) {
        if (typeof document === "undefined") {
            return;
        }
        const host = document.getElementById("orbit-style-meta-status");
        const label = document.getElementById("orbit-style-meta-status-text");
        if (!host || !label) {
            return;
        }

        if (orbitStyleMetaHideTimer) {
            clearTimeout(orbitStyleMetaHideTimer);
            orbitStyleMetaHideTimer = null;
        }

        if (!status) {
            host.hidden = true;
            host.classList.add("orbit-style-meta-status--hidden");
            host.removeAttribute("data-status");
            label.textContent = "";
            return;
        }

        host.hidden = false;
        host.classList.remove("orbit-style-meta-status--hidden");
        host.setAttribute("data-status", status);
        label.textContent = text || "Style data ready";

        if (status === "applied" && !sticky) {
            orbitStyleMetaHideTimer = window.setTimeout(() => {
                const currentHost = document.getElementById("orbit-style-meta-status");
                if (!currentHost) return;
                currentHost.hidden = true;
                currentHost.classList.add("orbit-style-meta-status--hidden");
                currentHost.removeAttribute("data-status");
                const currentLabel = document.getElementById("orbit-style-meta-status-text");
                if (currentLabel) currentLabel.textContent = "";
                orbitStyleMetaHideTimer = null;
            }, 1800);
        }
    }

    function applyOrbitStyleMetaForConfig(config, phaseMeta) {
        const scene = animationScenes?.[config];
        if (!scene || !phaseMeta) return;
        const applied = applyOrbitStyleMetadataToScene({
            scene,
            phaseMeta,
            render,
            globalConfig: typeof getGlobalConfig === "function" ? getGlobalConfig() : null,
            viewOrbit: typeof getViewOrbit === "function" ? getViewOrbit() : undefined,
            orbitStyle: typeof getOrbitStyle === "function" ? getOrbitStyle() : "trail",
        });
        if (applied) {
            setOrbitStyleMetaIndicator("applied", "Style data applied");
        }
    }

    function loadOrbitStyleMetaInBackground(config, isCurrent) {
        const scene = animationScenes?.[config];
        const metaUrl = scene?.orbitsMeta;
        if (!metaUrl || typeof loadJson !== "function") {
            setOrbitStyleMetaIndicator(null);
            return;
        }

        if (orbitStyleMetaByConfig.has(config)) {
            applyOrbitStyleMetaForConfig(config, orbitStyleMetaByConfig.get(config));
            return;
        }

        if (orbitStyleMetaPromiseByConfig.has(config)) {
            setOrbitStyleMetaIndicator("queued", "Style data queued", { sticky: true });
            orbitStyleMetaPromiseByConfig.get(config).then(phaseMeta => {
                if (phaseMeta && isCurrent()) applyOrbitStyleMetaForConfig(config, phaseMeta);
            });
            return;
        }

        setOrbitStyleMetaIndicator("loading", "Style data loading", { sticky: true });
        const promise = loadJson(metaUrl)
            .then((phaseMeta) => {
                orbitStyleMetaPromiseByConfig.delete(config);
                orbitStyleMetaByConfig.set(config, phaseMeta);
                if (isCurrent()) applyOrbitStyleMetaForConfig(config, phaseMeta);
                return phaseMeta;
            })
            .catch((error) => {
                orbitStyleMetaPromiseByConfig.delete(config);
                console.debug(`Orbit style metadata unavailable for ${config} at ${metaUrl}`, error);
                if (isCurrent()) setOrbitStyleMetaIndicator("error", "Style data failed", { sticky: true });
                return null;
            });

        orbitStyleMetaPromiseByConfig.set(config, promise);
    }

    function ensure3DCurvesReady(config) {
        const scene = animationScenes?.[config];
        if (!scene?.initialized3D) {
            return;
        }

        const primaryCraftId = scene.primaryCraftId || "SC";
        const primaryCurveCount = Array.isArray(scene.curvesById?.[primaryCraftId])
            ? scene.curvesById[primaryCraftId].length
            : 0;
        const orbitLineCount = Array.isArray(scene.orbitLines)
            ? scene.orbitLines.length
            : 0;

        if (primaryCurveCount > 0 && orbitLineCount > 0) {
            return;
        }

        scene.disposeSpacecraftCurve?.();
        scene.processOrbitVectorsData3D?.();
        scene.processLandingVectors?.();
        scene.addSpacecraftCurve?.();
    }

    async function loadOrbitDataIfNeededAndProcess(callback, { isCurrent: isParentCurrent = () => true } = {}) {
        const config = getConfig();
        const superseded = () => ({ status: "superseded", config });
        const scene = animationScenes[config];
        if (!isParentCurrent()) return superseded();
        if (!scene) return { status: "failed", config, error: new Error(`Scene unavailable for ${config}`) };
        const dimension = getCurrentDimension();
        const revision = getTransitionRevision();
        const request = {};
        latestRequestByConfig.set(config, request);
        const ownsCache = () => latestRequestByConfig.get(config) === request
            && animationScenes[config] === scene;
        const isCurrent = () => isParentCurrent() && ownsCache() && getConfig() === config
            && getCurrentDimension() === dimension && getTransitionRevision() === revision;
        const context = { config, isCurrent };
        // Resolve source policy and URLs before yielding; callbacks must never
        // borrow metadata or scene paths from a later active origin.
        const configuredBodies = typeof getBodiesForConfig === "function"
            ? getBodiesForConfig(config) : scene.planetsForLocations || [];
        const requiredBodies = new Set([...(Array.isArray(configuredBodies) ? configuredBodies : []), "SUN"]);
        const sourcesByBody = new Map([...requiredBodies].map(bodyId => [bodyId,
            typeof getBodySource === "function" ? getBodySource(bodyId)
                : typeof getEphemerisSource === "function" ? getEphemerisSource() : "chebyshev",
        ]));
        const globalConfig = typeof getGlobalConfig === "function" ? getGlobalConfig() : null;
        const urls = {
            npz: scene.orbitsNpz, cheb: scene.orbitsCheb, sun: scene.orbitsSunCheb,
            relative: scene.relativeSupportOrbitsCheb,
            support: { ...(scene.supportOrbitsChebByBodyId || {}) },
        };
        const primaryCraftId = scene.primaryCraftId || "SC";
        const reportStatus = (...args) => { if (isCurrent()) setStatus(...args); };
        const records = [];
        const reportEphemeris = value => {
            records.push(value);
            if (isCurrent()) recordEphemeris(value);
        };

        if (!orbitDataLoaded[config]) {
            const msg = getDataLoaded() ? "" : "Loading orbit data ... ";
            if (progress) {
                progress.beginSessionIfNeeded({
                    includeLanding: true,
                    label: msg || "Loading orbit data ...",
                });
                progress.setStage("orbit", 0, msg || "Loading orbit data ...");
            } else {
                ensureIndeterminateProgressBar("progressbar");
                showElementById("progressbar");
                updateProgressLabel(msg);
            }
            await sleep();
            if (!ownsCache()) return superseded();
            const requiredSources = new Set();

            try {
                for (const bodyId of requiredBodies) {
                    const source = sourcesByBody.get(bodyId);
                    if (source === "npz" || source === "chebyshev") {
                        requiredSources.add(source);
                    }
                }

                const totalSources = Math.max(1, requiredSources.size);
                let completedSources = 0;
                const updateOrbitSourceProgress = () => {
                    completedSources += 1;
                    if (progress && isCurrent()) {
                        progress.setStage(
                            "orbit",
                            completedSources / totalSources,
                            "Loading orbit data ...",
                        );
                    }
                };

                if (requiredSources.has("npz")) {
                    reportStatus(config, "npz", "loading");
                    const npzUrl = urls.npz;
                    if (!npzUrl) {
                        throw new Error(`NPZ ephemeris path not configured for ${config}`);
                    }
                    console.log(`Loading NPZ ephemeris from ${npzUrl}`);
                    const loadedNpz = await loadNpz(npzUrl);
                    if (!ownsCache()) return superseded();
                    npzData[config] = loadedNpz;
                    npzDataLoaded[config] = true;
                    console.log(
                        `NPZ ephemeris loaded for ${config}: bodies=${Object.keys(npzData[config]).join(",")}`,
                    );
                    reportEphemeris({
                        config,
                        source: "npz",
                        url: npzUrl,
                        bodies: Object.keys(npzData[config] || {}),
                    });
                    reportStatus(config, "npz", "ok");
                    updateOrbitSourceProgress();
                }

                if (requiredSources.has("chebyshev")) {
                    reportStatus(config, "chebyshev", "loading");
                    const chebUrl = urls.cheb;
                    if (!chebUrl) {
                        throw new Error(`Chebyshev ephemeris path not configured for ${config}`);
                    }
                    console.log(`Loading Chebyshev data from ${chebUrl}`);

                    const loadedChebyshev = await loadChebyshev(chebUrl);
                    if (!ownsCache()) return superseded();
                    chebyshevData[config] = loadedChebyshev;
                    chebyshevDataLoaded[config] = true;
                    console.log(
                        `Chebyshev data loaded for ${config}: ${getChebyshevSegmentCount(chebyshevData[config])} segments`,
                    );
                    const primaryHasRelativeSun =
                        chebyshevData[config]?.metadata?.mode === "relative" &&
                        !!getChebyshevBodySeries(chebyshevData[config], "SUN", primaryCraftId);
                    setSunFrame(
                        chebyshevData[config],
                        primaryHasRelativeSun ? "relative" : "inertial",
                    );

                    const sunSource = sourcesByBody.get("SUN");
                    if (sunSource === "chebyshev") {
                        const hasSunInPrimaryFile = !!getChebyshevBodySeries(
                            chebyshevData[config],
                            "SUN",
                            primaryCraftId,
                        );
                        if (!hasSunInPrimaryFile) {
                            const sunChebUrl = urls.sun;
                            if (!sunChebUrl) {
                                throw new Error(`Sun Chebyshev ephemeris path not configured for ${config}`);
                            }
                            console.log(`Loading Sun Chebyshev data from ${sunChebUrl}`);
                            const sunChebData = await loadChebyshev(sunChebUrl);
                            if (!ownsCache()) return superseded();
                            chebyshevData[config].SUN = sunChebData;
                        }
                    }

                    const supportChebByBodyId = {
                        ...urls.support,
                    };
                    if (
                        urls.relative &&
                        !supportChebByBodyId.MOON
                    ) {
                        supportChebByBodyId.MOON = urls.relative;
                    }
                    const supportChebDataCache = new Map();

                    for (const bodyId of requiredBodies) {
                        const hasBodySeries = !!getChebyshevBodySeries(
                            chebyshevData[config],
                            bodyId,
                            primaryCraftId,
                        );
                        if (hasBodySeries) continue;

                        const supportChebUrl = supportChebByBodyId[bodyId];
                        if (!supportChebUrl || supportChebUrl === chebUrl) {
                            continue;
                        }

                        if (!supportChebDataCache.has(supportChebUrl)) {
                            console.log(`Loading support Chebyshev data from ${supportChebUrl}`);
                            supportChebDataCache.set(
                                supportChebUrl,
                                await loadChebyshev(supportChebUrl),
                            );
                            if (!ownsCache()) return superseded();
                        }

                        const merged = mergeMissingChebyshevBodySeries(
                            chebyshevData[config],
                            supportChebDataCache.get(supportChebUrl),
                            bodyId,
                            primaryCraftId,
                        );
                        if (merged) {
                            console.log(
                                `Merged support Chebyshev series for ${config}: ${bodyId}`,
                            );
                        }

                        const mergedNormalizationSupport = mergeComparisonNormalizationSupportSeries({
                            targetChebData: chebyshevData[config],
                            supportChebData: supportChebDataCache.get(supportChebUrl),
                            bodyId,
                            config,
                            globalConfig,
                        });
                        if (mergedNormalizationSupport) {
                            console.log(
                                `Merged comparison normalization support series for ${config}: ${bodyId}`,
                            );
                        }
                    }

                    reportEphemeris({
                        config,
                        source: "chebyshev",
                        url: chebUrl,
                    });
                    reportStatus(config, "chebyshev", "ok");
                    updateOrbitSourceProgress();
                }

                if (requiredSources.size === 0 && progress && isCurrent()) {
                    progress.completeStage("orbit", "Loading orbit data ...");
                }

                orbitDataLoaded[config] = true;
                orbitRecordsByConfig.set(config, records);
                if (!isCurrent()) return superseded();
                setDataLoaded(true);

                if (progress) {
                    progress.completeStage("orbit", "Loading orbit data ...");
                    progress.setStage("process", 0, "Processing orbit data ...");
                } else {
                    hideElementById("progressbar");
                }
                const completed = await processOrbitData(context);
                if (completed === false || !isCurrent()) return superseded();
                if (progress) {
                    progress.completeStage("process", "Processing orbit data ...");
                }
                ensure3DCurvesReady(config);
                loadOrbitStyleMetaInBackground(config, isCurrent);
                await sleep();
                if (!isCurrent()) return superseded();
                callback();
                return { status: "ready", config };
            } catch (error) {
                if (!isCurrent()) return superseded();
                console.error("Error loading orbit ephemeris data:", error);
                if (progress) {
                    progress.abortSession();
                } else {
                    hideElementById("progressbar");
                }
                setEventInfoText("Error: failed to load orbit data.");
                for (const source of requiredSources) {
                    reportStatus(config, source, "error", error?.message || String(error));
                }
                return { status: "failed", config, error };
            }
        }

        try {
            if (progress && progress.isActive()) {
                progress.setStage("process", 0, "Processing orbit data ...");
            }
            // Inactive requests may fill their own cache, but their shared UI
            // publications were suppressed. Replay provenance when activated.
            for (const record of orbitRecordsByConfig.get(config) || []) {
                recordEphemeris(record);
                setStatus(config, record.source, "ok");
            }
            const completed = await processOrbitData(context);
            if (completed === false || !isCurrent()) return superseded();
            if (progress && progress.isActive()) {
                progress.completeStage("process", "Processing orbit data ...");
            }
            ensure3DCurvesReady(config);
            loadOrbitStyleMetaInBackground(config, isCurrent);
            await sleep();
            if (!isCurrent()) return superseded();
            callback();
            return { status: "ready", config };
        } catch (error) {
            if (!isCurrent()) return superseded();
            progress?.abortSession();
            return { status: "failed", config, error };
        }
    }

    return { loadOrbitDataIfNeededAndProcess };
}
