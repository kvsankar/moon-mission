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

    async function load(profile) {
        const requestId = ++latestRequestId;
        const resources = await loadResources(profile);
        if (requestId !== latestRequestId) {
            disposeResources(resources);
            return false;
        }
        await applyResources({
            profile,
            resources,
            isCurrent: () => requestId === latestRequestId,
        });
        return true;
    }

    return { load };
}
