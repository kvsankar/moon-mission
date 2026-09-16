// Browser-restored form values are projections, never a new camera intent.
export function bindCameraStartupProjection({
    windowRef,
    project,
    dispose = () => {},
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
    schedule = setTimeout,
    cancel = clearTimeout,
}) {
    let retired = false;
    const timers = new Set();
    const frames = new Set();
    function synchronize() {
        if (retired) return;
        const frame = requestFrame(() => { frames.delete(frame); if (!retired) project(); });
        frames.add(frame);
        for (const delay of [250, 750]) {
            const timer = schedule(() => { timers.delete(timer); if (!retired) project(); }, delay);
            timers.add(timer);
        }
    }
    function retire(event) {
        if (event?.persisted || retired) return;
        retired = true;
        timers.forEach(cancel);
        frames.forEach(cancelFrame);
        timers.clear();
        frames.clear();
        windowRef.removeEventListener?.("pageshow", synchronize);
        windowRef.removeEventListener?.("pagehide", retire);
        dispose();
    }
    windowRef.addEventListener("pageshow", synchronize);
    windowRef.addEventListener("pagehide", retire);
    synchronize();
    return () => retire();
}
