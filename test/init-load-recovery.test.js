import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/platform/js/ui/mission-loading-overlay.js", () => ({
    failMissionLoadingOverlay: vi.fn(), hideMissionLoadingOverlay: vi.fn(),
    setMissionLoadingOverlayBlocking: vi.fn(), setMissionLoadingMessage: vi.fn(),
    showMissionLoadingOverlay: vi.fn(), setMissionLoadingRetry: vi.fn(),
}));
import * as overlay from "../src/platform/js/ui/mission-loading-overlay.js";
import { createInitOrchestrationActions } from "../src/platform/js/app/init-orchestration.js";

function harness() {
    const init = vi.fn().mockResolvedValue({ status: "ready", config: "geo" });
    const render = vi.fn(), raf = vi.fn(), schedule = vi.fn(), setDimension = vi.fn();
    const actions = createInitOrchestrationActions({
        initConfig: vi.fn().mockResolvedValue(undefined), init, getConfig: () => "geo",
        isOrbitDataProcessed: () => false,
        missionStart: vi.fn(), setLocation: vi.fn(), setDimension,
        getSetView: () => vi.fn(), getChangeCameraFromTo: () => vi.fn(),
        updateCraftScale: vi.fn(), d3: { select: () => ({ text: vi.fn() }) },
        d3SelectAll: () => ({ attr: vi.fn() }), render, requestAnimationFrame: raf,
        animateLoop: vi.fn(), scheduleTimeout: schedule,
        getStartTime: () => 0, getLatestEndTime: () => 1000,
    });
    const retry = () => overlay.setMissionLoadingRetry.mock.calls.map(([handler]) => handler).filter(Boolean).at(-1);
    return { init, render, raf, schedule, setDimension, actions, retry };
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("document", undefined); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("terminal startup outcomes and retry", () => {
    it("shows a retryable error instead of polling a failed load forever", async () => {
        const h = harness();
        h.init.mockResolvedValueOnce({ status: "failed", config: "geo", error: new Error("503") });
        await h.actions.initAnimation({ reset: false });
        expect(overlay.failMissionLoadingOverlay).toHaveBeenCalledOnce();
        expect(h.retry()).toBeTypeOf("function");
        expect(h.schedule).not.toHaveBeenCalled();
        expect(h.setDimension).not.toHaveBeenCalled();
        expect(h.raf).not.toHaveBeenCalled();
    });

    it("retries a failure once and starts only one animation loop", async () => {
        const h = harness();
        h.init.mockResolvedValueOnce({ status: "failed", error: new Error("offline") });
        await h.actions.initAnimation({ reset: false });
        const retry = h.retry();
        expect(retry).toBeTypeOf("function");
        const first = retry();
        const duplicate = retry();
        await Promise.all([first, duplicate]);
        expect(h.init).toHaveBeenCalledTimes(2);
        expect(h.setDimension).toHaveBeenCalledOnce();
        expect(h.raf).toHaveBeenCalledOnce();
        expect(h.schedule).not.toHaveBeenCalled();
    });

    it("ignores failure from a superseded retry after a new startup succeeds", async () => {
        const h = harness();
        h.init.mockResolvedValueOnce({ status: "failed", error: new Error("offline") });
        await h.actions.initAnimation({ reset: false });
        let finish;
        h.init.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = h.retry()();
        await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
        await h.actions.initAnimation({ reset: false });
        finish({ status: "failed", error: new Error("old origin failure") });
        await pending;
        expect(overlay.failMissionLoadingOverlay).toHaveBeenCalledOnce();
        expect(h.raf).toHaveBeenCalledOnce();
    });

    it("hands internally superseded work to a fresh startup for the latest view", async () => {
        const h = harness();
        h.init.mockResolvedValueOnce({ status: "superseded", config: "geo" });
        await h.actions.initAnimation({ reset: false });
        expect(overlay.failMissionLoadingOverlay).not.toHaveBeenCalled();
        expect(h.schedule).not.toHaveBeenCalled();
        expect(h.init).toHaveBeenCalledTimes(2);
        expect(h.setDimension).toHaveBeenCalledOnce();
        expect(h.render).toHaveBeenCalledOnce();
    });

    it("bounds internal handoffs and offers retry when no startup settles", async () => {
        const h = harness();
        h.init.mockResolvedValue({ status: "superseded" });
        await h.actions.initAnimation({ reset: false });
        expect(h.init).toHaveBeenCalledTimes(2);
        expect(overlay.failMissionLoadingOverlay).toHaveBeenCalledOnce();
        expect(h.retry()).toBeTypeOf("function");
        expect(h.schedule).not.toHaveBeenCalled();
    });
});
