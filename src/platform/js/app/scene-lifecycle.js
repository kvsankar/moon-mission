// Scene-owned work is distinct from global profile-choice cancellation.
const cleanups = new WeakMap();

export function registerSceneCleanup(scene, cleanup) {
    if (scene.disposed === true) {
        cleanup();
        return () => {};
    }
    let owned = cleanups.get(scene);
    if (!owned) { owned = new Set(); cleanups.set(scene, owned); }
    owned.add(cleanup);
    return () => {
        owned.delete(cleanup);
        if (!owned.size && cleanups.get(scene) === owned) cleanups.delete(scene);
    };
}

export function cancelSceneWork(scene) {
    const owned = cleanups.get(scene);
    cleanups.delete(scene);
    const errors = [];
    for (const cleanup of owned || []) {
        try { cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length) console.warn("Scene work cancellation failed:", ...errors);
    return errors;
}
