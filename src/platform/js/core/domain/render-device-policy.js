const browserGlobal = () => typeof window !== "undefined" ? window : globalThis;

function deviceHints(globalObject) {
    const navigator = globalObject?.navigator || {};
    const memory = Number(navigator.deviceMemory);
    const cores = Number(navigator.hardwareConcurrency);
    const touch = Number(navigator.maxTouchPoints) > 0
        || globalObject?.matchMedia?.("(pointer: coarse)")?.matches === true;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    const constrained = connection.saveData === true
        || ["slow-2g", "2g", "3g"].includes(connection.effectiveType)
        || (Number.isFinite(memory) && memory > 0 && memory <= 2)
        || (Number.isFinite(cores) && cores > 0 && cores <= 2);
    return { memory, touch, constrained };
}

// Hints are optional (notably on Safari/Firefox). An absent hint never selects
// High automatically. Explicit user choices are resolved before this default.
export function resolveDefaultMoonProfile(globalObject = browserGlobal()) {
    const { memory, touch, constrained } = deviceHints(globalObject);
    if (constrained || (touch && (!Number.isFinite(memory) || memory <= 4))) return "low";
    return "fast";
}

export function constrainMoonRenderProfile(profile, globalObject = browserGlobal()) {
    const maximum = Number(globalObject?.MOON_RENDER_MAX_TEXTURE_SIZE);
    if (!Number.isFinite(maximum) || maximum <= 0) return profile;
    if (maximum < 2048 && profile !== "low") return "low";
    // High's typed height/normal textures are 5760 wide. Unlike an HTML image,
    // these data textures cannot be resized automatically by Three.js.
    if (maximum < 5760 && profile === "quality") return "fast";
    return profile;
}

export function resolveInteractivePixelRatio(globalObject = browserGlobal()) {
    const { touch, constrained } = deviceHints(globalObject);
    const requested = Number(globalObject?.devicePixelRatio) || 1;
    return Math.max(0.5, Math.min(requested, constrained ? 1 : touch ? 1.5 : 2));
}

export function registerRenderDeviceCapabilities(renderer, globalObject = browserGlobal()) {
    const maximum = Number(renderer?.capabilities?.maxTextureSize);
    if (!Number.isFinite(maximum) || maximum <= 0) return;
    const previous = Number(globalObject.MOON_RENDER_MAX_TEXTURE_SIZE);
    const supported = Number.isFinite(previous) && previous > 0 ? Math.min(previous, maximum) : maximum;
    globalObject.MOON_RENDER_MAX_TEXTURE_SIZE = supported;
    if (supported !== previous && typeof globalObject.dispatchEvent === "function") {
        const EventClass = globalObject.Event || globalThis.Event;
        if (typeof EventClass === "function") globalObject.dispatchEvent(new EventClass("moon-mission:render-capabilities"));
    }
}
