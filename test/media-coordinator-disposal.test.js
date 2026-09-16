import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ manifest: vi.fn(), render: vi.fn(), backgroundRender: vi.fn(), intent: null, background: null }));
vi.mock("../src/platform/js/data/mission-media.js", () => ({ getMissionMediaManifestUrl: () => "assets/artemis2/data/media-manifest.json", getMissionMediaDataPath: () => "assets/artemis2/data/", loadMissionMediaManifest: mocks.manifest }));
vi.mock("../src/platform/js/app/media-browser-panel.js", () => ({
    MEDIA_BROWSER_PANEL_ID: "workflow:media-browser",
    createMediaBrowserPanelActions: options => { mocks.intent = options.onIntent; return { render: mocks.render, setMissionContext: vi.fn(), setPanelState: vi.fn() }; },
}));
vi.mock("../src/platform/js/app/background-media-panel.js", () => ({
    createBackgroundMediaPanelActions: options => { mocks.background = options; return { render: mocks.backgroundRender, setMissionContext: vi.fn() }; },
}));
import { createMediaTimelineCoordination } from "../src/platform/js/app/media-timeline-coordination.js";

const flush = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
function harness() {
    let resolve, reject;
    mocks.manifest.mockReturnValue(new Promise((pass, fail) => { resolve = pass; reject = fail; }));
    const document = { getElementById: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() };
    vi.stubGlobal("document", document);
    vi.stubGlobal("HTMLInputElement", class {});
    vi.stubGlobal("window", { missionConfig: { dataPath: "assets/artemis2/data/" } });
    const markers = vi.fn(), play = vi.fn(), pause = vi.fn();
    const context = { globalConfig: { ui: { panels: { defaults: { "workflow:media-browser": { enabled: true } } } } }, animTime: 1775147400000 };
    const actions = createMediaTimelineCoordination({ setTimelineMediaMarkers: markers, playAnimation: play, pauseAnimation: pause });
    actions.update(context);
    const queuedEvents = document.addEventListener.mock.calls.map(([, callback]) => callback);
    actions.dispose();
    vi.clearAllMocks();
    return { actions, document, markers, play, pause, resolve, reject, context, queuedEvents };
}

describe("terminal media coordinator disposal", () => {
    for (const result of ["resolve", "reject"]) {
        it(`ignores manifest ${result} after disposal`, async () => {
            const h = harness();
            h[result](result === "resolve" ? { photos: [] } : new Error("offline"));
            await flush();
            expect(h.document.addEventListener).not.toHaveBeenCalled();
            expect(mocks.render).not.toHaveBeenCalled();
            expect(mocks.backgroundRender).not.toHaveBeenCalled();
            expect(h.markers).not.toHaveBeenCalled();
        });
    }

    it("rejects later updates and stale panel/background intents", () => {
        const h = harness();
        h.actions.update(h.context);
        mocks.intent({ type: "setSearchQuery", value: "retired" });
        mocks.background.onRequestPlay();
        mocks.background.onJumpToTime(h.context.animTime + 1000);
        for (const callback of h.queuedEvents) callback({ detail: { isPlaying: true, state: "closed" } });
        expect(h.document.addEventListener).not.toHaveBeenCalled();
        expect(h.play).not.toHaveBeenCalled();
        expect(mocks.render).not.toHaveBeenCalled();
        expect(mocks.backgroundRender).not.toHaveBeenCalled();
        expect(h.markers).not.toHaveBeenCalled();
    });

    it("disposes idempotently without repeating cleanup effects", () => {
        const h = harness();
        h.actions.dispose();
        expect(h.document.removeEventListener).not.toHaveBeenCalled();
        expect(mocks.backgroundRender).not.toHaveBeenCalled();
        expect(h.markers).not.toHaveBeenCalled();
        expect(h.pause).not.toHaveBeenCalled();
    });
});
