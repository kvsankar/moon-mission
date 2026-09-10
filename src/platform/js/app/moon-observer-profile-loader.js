function disposeMoonProfileTextures(textures) {
    const uniqueTextures = new Set([
        textures?.moonMap,
        textures?.moonDisplacementMap,
    ]);
    uniqueTextures.delete(null);
    uniqueTextures.delete(undefined);
    uniqueTextures.forEach((texture) => texture?.dispose?.());
}

export function createMoonObserverProfileLoader({
    loadResources,
    applyResources,
    disposeResources = disposeMoonProfileTextures,
}) {
    let latestRequestId = 0;
    let activeController = null;

    async function load(profile) {
        const requestId = ++latestRequestId;
        activeController?.abort?.();
        const controller = typeof AbortController === "function"
            ? new AbortController()
            : null;
        activeController = controller;
        let applied = false;
        try {
            let resources;
            try {
                resources = await loadResources(profile, { signal: controller?.signal || null });
            } catch (error) {
                if (requestId !== latestRequestId || error?.name === "AbortError") return false;
                throw error;
            }
            if (requestId !== latestRequestId) {
                disposeResources(resources);
                return false;
            }
            await applyResources({
                profile,
                resources,
                isCurrent: () => requestId === latestRequestId,
            });
            applied = true;
            return true;
        } finally {
            if (!applied) controller?.abort?.();
            if (activeController === controller) activeController = null;
        }
    }

    return { load };
}
