export function createLandingLoadActions({
    getGlobalConfig,
    getConfigsList,
    getConfig = () => null,
    getScene = () => null,
    setLandingDataLoaded,
    setLandingNpzLoaded,
    setLandingNpzData,
    setLandingChebyshevLoaded,
    setLandingChebyshevData,
    resolveLandingChebyshevUrl,
    loadChebyshev,
    loadProgress,
    onEphemerisLoaded = () => {},
    onEphemerisStatus = () => {},
    onLandingDataReady = () => {},
}) {
    // Data requests belong to a mission/source, not to the active view. Each
    // activation observes shared requests but owns its own scene publication.
    const requestsByMission = new WeakMap();
    const progress = loadProgress &&
        typeof loadProgress.setStage === "function" &&
        typeof loadProgress.completeStage === "function" &&
        typeof loadProgress.isActive === "function" ? loadProgress : null;

    function ensureLandingData(globalConfig, config) {
        const url = resolveLandingChebyshevUrl(globalConfig, config);
        const isSourceCurrent = () => getGlobalConfig() === globalConfig &&
            resolveLandingChebyshevUrl(globalConfig, config) === url;
        let requests = requestsByMission.get(globalConfig);
        if (!requests) {
            requests = new Map();
            requestsByMission.set(globalConfig, requests);
        }
        const existing = requests.get(config);
        if (existing?.url === url) {
            if (existing.data) return Promise.resolve(existing.data);
            if (existing.promise) return existing.promise;
        }

        const entry = { url, data: null, promise: null };
        requests.set(config, entry);
        const run = async () => {
            setLandingNpzData(config, null);
            setLandingNpzLoaded(config, false);
            onEphemerisStatus(config, "landing-npz", "ok", "Not used (Chebyshev-only runtime)");
            try {
                if (!url) throw new Error("Landing Chebyshev path unavailable");
                onEphemerisStatus(config, "landing-chebyshev", "loading");
                const data = await loadChebyshev(url);
                if (!isSourceCurrent() || requests.get(config) !== entry) return null;
                entry.data = data;
                setLandingChebyshevData(config, data);
                setLandingChebyshevLoaded(config, true);
                onEphemerisLoaded({ config, source: "landing-chebyshev", url, bodies: Object.keys(data || {}) });
                onEphemerisStatus(config, "landing-chebyshev", "ok");
                return data;
            } catch (error) {
                if (!isSourceCurrent() || requests.get(config) !== entry) return null;
                setLandingChebyshevLoaded(config, false);
                onEphemerisStatus(config, "landing-chebyshev", "error", error?.message || String(error));
                console.warn(`Failed to load landing Chebyshev data for ${config}: ${error}`);
                return null;
            }
        };
        entry.promise = run().finally(() => {
            entry.promise = null;
            if (!entry.data && requests.get(config) === entry) requests.delete(config);
        });
        return entry.promise;
    }

    async function loadLandingDataAndProcess() {
        const globalConfig = getGlobalConfig();
        if (!globalConfig?.landing?.enabled) return { status: "disabled" };
        const activeConfig = getConfig();
        const scene = getScene(activeConfig);
        const initialGeneration = Number(scene?.deferred3DInitRunId || 0);
        const wasInitialized = scene?.initialized3D === true;
        const isActivationCurrent = () => getGlobalConfig() === globalConfig &&
            getConfig() === activeConfig && getScene(activeConfig) === scene &&
            scene?.stopCreationFlag !== true;
        const isSceneCurrent = () => {
            const generation = Number(scene?.deferred3DInitRunId || 0);
            return !!scene && isActivationCurrent() &&
                (generation === initialGeneration || (!wasInitialized && generation === initialGeneration + 1));
        };
        const configs = [...getConfigsList()];
        const sourceUrls = configs.map((config) => resolveLandingChebyshevUrl(globalConfig, config));
        let completed = 0;
        const shouldTrackProgress = !!progress?.isActive();
        const updateProgress = () => {
            if (!shouldTrackProgress || !isActivationCurrent() || !progress.isActive()) return;
            progress.setStage("landing", configs.length ? completed / configs.length : 1, "Loading landing data ...");
        };
        updateProgress();
        const results = await Promise.all(configs.map(async (config, index) => {
            const data = await ensureLandingData(globalConfig, config);
            const sourceStillCurrent = resolveLandingChebyshevUrl(globalConfig, config) === sourceUrls[index];
            if (data && sourceStillCurrent && config === activeConfig && isSceneCurrent()) {
                try {
                    onLandingDataReady({ config, scene, data });
                } catch (error) {
                    console.warn("Landing data is ready but its scene refresh failed:", error);
                }
            }
            completed += 1;
            updateProgress();
            return { config, ready: !!data };
        }));
        if (getGlobalConfig() !== globalConfig || configs.some((config, index) =>
            resolveLandingChebyshevUrl(globalConfig, config) !== sourceUrls[index])) {
            return { status: "superseded" };
        }
        const loadedConfigs = results.filter((result) => result.ready).map((result) => result.config);
        const failedConfigs = results.filter((result) => !result.ready).map((result) => result.config);
        setLandingDataLoaded(loadedConfigs.length > 0);
        if (shouldTrackProgress && isActivationCurrent() && progress.isActive()) {
            progress.completeStage("landing", "Loading landing data ...");
        }
        const status = failedConfigs.length ? (loadedConfigs.length ? "partial" : "failed") : "ready";
        return { status, loadedConfigs, failedConfigs };
    }

    return { loadLandingDataAndProcess };
}
