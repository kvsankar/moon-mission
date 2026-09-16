function createViewportCapabilityCoordinator({
    windowRef,
    isEnabled,
    loadCapability,
    activateCapability,
    isCapabilityActive = () => false,
    onUnavailable = () => {},
} = {}) {
    let disposed = false;
    let revision = 0;
    let missionConfig = null;
    let activation = null;

    async function sync() {
        if (disposed) return null;
        const currentRevision = ++revision;
        const enabled = isEnabled({ missionConfig, viewportWidth: Number(windowRef?.innerWidth) || 0 });
        if (!enabled) {
            if (!isCapabilityActive()) onUnavailable();
            return null;
        }
        if (isCapabilityActive()) return activation;
        const capability = await loadCapability();
        if (disposed || currentRevision !== revision ||
            !isEnabled({ missionConfig, viewportWidth: Number(windowRef?.innerWidth) || 0 }) || isCapabilityActive()) return null;
        activation = activateCapability(capability, missionConfig) || null;
        return activation;
    }
    const onResize = () => { void sync(); };
    return {
        start(config) {
            missionConfig = config;
            windowRef?.addEventListener?.("resize", onResize, { passive: true });
            return sync();
        },
        sync,
        dispose() {
            if (disposed) return;
            disposed = true;
            revision += 1;
            windowRef?.removeEventListener?.("resize", onResize);
        },
    };
}

export { createViewportCapabilityCoordinator };
