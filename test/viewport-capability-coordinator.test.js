import { describe, expect, it, vi } from "vitest";
import { createViewportCapabilityCoordinator } from "../src/platform/js/app/viewport-capability-coordinator.js";

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function harness(width = 390) {
    const listeners = new Map(), loading = deferred(), activate = vi.fn(() => ({ mounted: true }));
    let active = false;
    activate.mockImplementation(() => { active = true; return { mounted: true }; });
    const windowRef = { innerWidth: width,
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); } };
    const coordinator = createViewportCapabilityCoordinator({ windowRef,
        isEnabled: ({ viewportWidth, missionConfig }) => viewportWidth > 600 && missionConfig?.enabled !== false,
        loadCapability: vi.fn(() => loading.promise), activateCapability: activate,
        isCapabilityActive: () => active, onUnavailable: vi.fn() });
    return { coordinator, windowRef, listeners, loading, activate };
}
describe("viewport capability coordinator", () => {
    it("mounts once when a mobile-start session widens", async () => {
        const h = harness(); await h.coordinator.start({ enabled: true });
        h.windowRef.innerWidth = 1280; h.listeners.get("resize")(); h.loading.resolve({ initializer: true });
        await Promise.resolve(); await Promise.resolve();
        expect(h.activate).toHaveBeenCalledOnce();
        h.listeners.get("resize")(); await Promise.resolve();
        expect(h.activate).toHaveBeenCalledOnce();
    });
    it("invalidates a lazy mount when the viewport shrinks before loading completes", async () => {
        const h = harness(1280); const pending = h.coordinator.start({ enabled: true });
        h.windowRef.innerWidth = 390; h.listeners.get("resize")();
        h.loading.resolve({ initializer: true }); await pending;
        expect(h.activate).not.toHaveBeenCalled();
    });
    it("honors explicit disable and disposal across later resizes", async () => {
        const h = harness(1280); await h.coordinator.start({ enabled: false });
        expect(h.activate).not.toHaveBeenCalled();
        h.coordinator.dispose(); h.windowRef.innerWidth = 1400;
        expect(h.listeners.has("resize")).toBe(false);
    });
});
