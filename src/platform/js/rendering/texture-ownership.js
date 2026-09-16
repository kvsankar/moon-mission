// Texture lifetime is an effect-layer concern. Owners hold unique identities,
// never cloned images/DEM buffers. A released texture may enter a later epoch.
const ownerResources = new WeakMap();
const textureRecords = new WeakMap();
const dependencies = new WeakMap();

const isTexture = value => value != null && typeof value.dispose === "function";
const uniqueTextures = values => new Set(Array.from(values || []).filter(isTexture));

function recordFor(texture) {
    let record = textureRecords.get(texture);
    if (!record) {
        record = { count: 0, disposed: false, managedDisposal: 0 };
        textureRecords.set(texture, record);
    }
    return record;
}

function retain(texture) {
    const record = recordFor(texture);
    const startsEpoch = record.count === 0;
    record.count += 1;
    if (startsEpoch) {
        record.disposed = false;
        const dependency = dependencies.get(texture);
        if (dependency) replaceTextureOwner(dependency.owner, dependency.children);
    }
}

function disposeUnclaimed(texture, errors) {
    const record = recordFor(texture);
    if (record.count || record.disposed) return;
    record.disposed = true; // Publish before native disposal events can re-enter.
    const dependency = dependencies.get(texture);
    const childLease = dependency && ownerResources.get(dependency.owner);
    record.managedDisposal += 1;
    try { texture.dispose(); } catch (error) { errors.push(error); }
    finally {
        record.managedDisposal -= 1;
        if (dependency && !record.count && ownerResources.get(dependency.owner) === childLease) {
            releaseTextureOwner(dependency.owner);
        }
    }
}

function relinquish(textures, disposePrevious) {
    const errors = [];
    // All counts change before the first event-emitting dispose call.
    for (const texture of textures) recordFor(texture).count -= 1;
    if (disposePrevious) for (const texture of textures) disposeUnclaimed(texture, errors);
    if (errors.length) console.warn("Texture cleanup failed:", ...errors);
    return errors;
}

export function replaceTextureOwner(owner, textures, { disposePrevious = true } = {}) {
    const next = uniqueTextures(textures);
    const previous = ownerResources.get(owner) || new Set();
    for (const texture of next) if (!previous.has(texture)) retain(texture);
    ownerResources.set(owner, next);
    return relinquish([...previous].filter(texture => !next.has(texture)), disposePrevious);
}

export function retainTextureOwner(owner, textures) {
    return replaceTextureOwner(owner, [...(ownerResources.get(owner) || []), ...uniqueTextures(textures)]);
}

export function releaseTextureOwner(owner, { disposePrevious = true } = {}) {
    const previous = ownerResources.get(owner);
    if (!previous) return [];
    ownerResources.delete(owner);
    return relinquish(previous, disposePrevious);
}

export function holdTextures(textures) {
    const owner = {};
    replaceTextureOwner(owner, textures);
    return options => releaseTextureOwner(owner, options);
}

export function detachTextureOwner(owner, additionalTextures = []) {
    const release = holdTextures([...(ownerResources.get(owner) || []), ...uniqueTextures(additionalTextures)]);
    releaseTextureOwner(owner, { disposePrevious: false });
    return release;
}

export function updateTextureOwner(owner, readTextures, update, { disposePrevious = true } = {}) {
    const releasePrevious = holdTextures([...(ownerResources.get(owner) || []), ...uniqueTextures(readTextures())]);
    try { return update(); }
    finally {
        replaceTextureOwner(owner, readTextures(), { disposePrevious });
        // false deliberately relinquishes without destroying: callers retain
        // responsibility for old resources, matching the renderer API contract.
        releasePrevious({ disposePrevious });
    }
}

export function disposeUnclaimedTextures(textures) {
    const errors = [];
    for (const texture of uniqueTextures(textures)) disposeUnclaimed(texture, errors);
    if (errors.length) console.warn("Unclaimed texture cleanup failed:", ...errors);
    return errors;
}

export function registerTextureDependency(parent, child) {
    if (!isTexture(parent) || !isTexture(child) || parent === child) return;
    let dependency = dependencies.get(parent);
    if (!dependency) {
        dependency = { owner: {}, children: new Set() };
        dependencies.set(parent, dependency);
        parent.addEventListener?.("dispose", () => {
            const record = recordFor(parent);
            // Managed disposal decides after the complete native event dispatch:
            // later listeners may retain a new parent epoch and still need its child.
            if (record.count || record.managedDisposal) return;
            record.disposed = true;
            releaseTextureOwner(dependency.owner);
        });
    }
    dependency.children.add(child);
    replaceTextureOwner(dependency.owner, dependency.children);
}
