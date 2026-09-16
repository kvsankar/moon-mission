import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ render: vi.fn(), intent: null, manifest: vi.fn() }));
vi.mock("../src/platform/js/data/mission-media.js", () => ({
    getMissionMediaManifestUrl: () => "assets/artemis2/data/media-manifest.json",
    getMissionMediaDataPath: () => "assets/artemis2/data/", loadMissionMediaManifest: mocks.manifest,
}));
vi.mock("../src/platform/js/app/media-browser-panel.js", () => ({
    MEDIA_BROWSER_PANEL_ID: "workflow:media-browser",
    createMediaBrowserPanelActions: options => {
        mocks.intent = options.onIntent;
        return { render: mocks.render, setMissionContext: vi.fn(), setPanelState: vi.fn() };
    },
}));
vi.mock("../src/platform/js/app/background-media-panel.js", () => ({
    createBackgroundMediaPanelActions: () => ({ render: vi.fn(), setMissionContext: vi.fn() }),
}));
import { createMediaTimelineCoordination } from "../src/platform/js/app/media-timeline-coordination.js";

const flush = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function harness({ videoMode = false } = {}) {
    const start = Date.parse("2026-04-02T16:30:00Z");
    class Input {}
    const slider = Object.assign(new Input(), {
        min: String(start - 10000), max: String(start + 600000), value: String(start),
        dataset: { currentTimeMs: String(start) }, dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("HTMLInputElement", Input);
    vi.stubGlobal("document", { getElementById: id => id === "timeline-slider" ? slider : null,
        addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
    vi.stubGlobal("window", { missionConfig: { dataPath: "assets/artemis2/data/" } });
    const audio = [];
    vi.stubGlobal("Audio", class {
        constructor(src) {
            this.src = src; this.currentTime = 0; this.paused = true;
            this.listeners = new Map(); this.requests = []; this.dataset = {}; audio.push(this);
        }
        addEventListener(type, fn) {
            if (!this.listeners.has(type)) this.listeners.set(type, new Set());
            this.listeners.get(type).add(fn);
        }
        removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
        queued(type) { const handlers = [...(this.listeners.get(type) || [])]; return () => handlers.forEach(fn => fn()); }
        emit(type) { this.queued(type)(); }
        pause() { this.paused = true; }
        getAttribute(name) { return this[name] || null; }
        removeAttribute(name) { delete this[name]; }
        load() {}
        play() {
            this.paused = false;
            return new Promise((resolve, reject) => this.requests.push({ resolve, reject }));
        }
    });
    const video = videoMode ? new globalThis.Audio("") : null;
    if (video) globalThis.document.getElementById = id => id === "timeline-slider" ? slider : id === "media-browser-video" ? video : null;
    mocks.manifest.mockResolvedValue({ mediaBase: "https://media.example/", timelineTimezoneOffset: "-04:00", photos: videoMode ? [
        { time: "2026-04-02 12:30:00", file: "a.mp4", durationSeconds: 180, enabled: true, video: true },
        { time: "2026-04-02 12:35:00", file: "b.mp4", durationSeconds: 180, enabled: true, video: true },
    ] : [], audio: videoMode ? [] : [
        { time: "2026-04-02 12:30:00", file: "audio/a.mp3", durationSeconds: 180, enabled: true },
        { time: "2026-04-02 12:35:00", file: "audio/b.mp3", durationSeconds: 180, enabled: true },
    ] });
    let running = false;
    const play = vi.fn(() => { running = true; }), pause = vi.fn(() => { running = false; });
    const coordination = createMediaTimelineCoordination({ getStartTime: () => start - 10000,
        getLatestEndTime: () => start + 600000, getAnimationRunning: () => running,
        playAnimation: play, pauseAnimation: pause });
    coordination.update({ globalConfig: { ui: { panels: { defaults: { "workflow:media-browser": { enabled: true } } } } }, animTime: start });
    await flush();
    const model = () => mocks.render.mock.calls.at(-1)[0];
    const startItem = name => {
        mocks.intent({ type: "selectItem", value: videoMode ? `${name}.mp4` : `audio:audio/${name}.mp3` });
        mocks.intent({ type: "startActiveMediaFromBeginning" });
        return video || audio.at(-1);
    };
    return { coordination, model, startItem, audio, video, slider, play, pause };
}

describe("foreground playback session ownership", () => {
    it("ignores queued video buffering and source-ready after an explicit pause", async () => {
        const h = await harness({ videoMode: true });
        h.startItem("a");
        h.video.requests.at(-1).resolve();
        await flush();
        expect(h.model().playbackModel.playing).toBe(true);
        mocks.intent({ type: "toggleActiveMediaPlayback" });
        const requests = h.video.requests.length;
        const playback = { ...h.model().playbackModel };
        for (const type of ["mediaPlaybackBuffering", "mediaVideoSourceReady", "mediaPlaybackTimeUpdate"]) {
            mocks.intent({ type, value: "a.mp4", mediaKind: "videoClip", currentTime: 20, mediaElement: h.video });
        }
        await flush();
        expect(h.video.requests).toHaveLength(requests);
        expect(h.model().playbackModel).toEqual(playback);
        h.coordination.dispose();
    });

    it("honors animation Pause before the pending media play has started", async () => {
        const h = await harness();
        h.play();
        const audio = h.startItem("a");
        expect(h.model().playbackModel.buffering).toBe(true);
        h.pause();
        const [, onPlayState] = document.addEventListener.mock.calls.find(([name]) => name === "animation-play-state-updated");
        onPlayState({ detail: { isPlaying: false } });
        const plays = h.play.mock.calls.length;
        audio.requests.at(-1).resolve();
        await flush();
        expect(h.play).toHaveBeenCalledTimes(plays);
        expect(h.model().playbackModel.playing).toBe(false);
        expect(h.model().playbackModel.buffering).toBe(false);
        h.coordination.dispose();
    });

    for (const settlement of ["resolve", "reject"]) {
        it(`ignores old video play ${settlement} when the same element/item has a newer request`, async () => {
            const h = await harness({ videoMode: true });
            h.startItem("a");
            const old = h.video.requests.at(-1);
            h.startItem("a");
            expect(h.video.requests.length).toBeGreaterThan(1);
            const playback = { ...h.model().playbackModel };
            old[settlement](new Error("old video play"));
            await flush();
            expect(h.model().playbackModel).toEqual(playback);
            h.video.requests.at(-1).resolve();
            await flush();
            expect(h.model().playbackModel.playing).toBe(true);
            h.coordination.dispose();
        });
    }

    it("rejects retired video item/element events but still adopts a native current video start", async () => {
        const h = await harness({ videoMode: true });
        mocks.intent({ type: "selectItem", value: "b.mp4" });
        const time = h.slider.dataset.currentTimeMs;
        mocks.intent({ type: "mediaPlaybackStarted", value: "a.mp4", mediaKind: "videoClip", currentTime: 0, mediaElement: h.video });
        expect(h.model().activeItem.id).toBe("b.mp4");
        expect(h.slider.dataset.currentTimeMs).toBe(time);
        mocks.intent({ type: "mediaPlaybackStarted", value: "b.mp4", mediaKind: "videoClip", currentTime: 0, mediaElement: {} });
        expect(h.play).not.toHaveBeenCalled();
        h.video.paused = false;
        mocks.intent({ type: "mediaPlaybackStarted", value: "b.mp4", mediaKind: "videoClip", currentTime: 2, mediaElement: h.video });
        expect(h.model().playbackModel.playing).toBe(true);
        h.coordination.dispose();
    });

    for (const event of ["playing", "waiting", "stalled", "pause", "ended", "timeupdate", "error", "abort"]) {
        it(`ignores queued ${event} from retired A after A-B-A`, async () => {
            const h = await harness();
            const old = h.startItem("a"), queued = old.queued(event);
            h.startItem("b");
            const live = h.startItem("a");
            live.emit("playing");
            expect(h.model().playbackModel.playing).toBe(true);
            const time = h.slider.dataset.currentTimeMs;
            const playback = { ...h.model().playbackModel };
            const playCalls = h.play.mock.calls.length, pauseCalls = h.pause.mock.calls.length;
            old.currentTime = 170;
            queued();
            expect(h.model().activeItem.id).toBe("audio:audio/a.mp3");
            expect(h.model().playbackModel).toEqual(playback);
            expect(h.slider.dataset.currentTimeMs).toBe(time);
            expect(h.play).toHaveBeenCalledTimes(playCalls);
            expect(h.pause).toHaveBeenCalledTimes(pauseCalls);
            h.coordination.dispose();
        });
    }

    it("does not let a retired A playing event replace selected B", async () => {
        const h = await harness();
        const old = h.startItem("a"), queued = old.queued("playing");
        h.startItem("b");
        const time = h.slider.dataset.currentTimeMs;
        queued();
        expect(h.model().activeItem.id).toBe("audio:audio/b.mp3");
        expect(h.slider.dataset.currentTimeMs).toBe(time);
        h.coordination.dispose();
    });

    for (const settlement of ["resolve", "reject"]) {
        it(`ignores old play ${settlement} after restarting the same item`, async () => {
            const h = await harness();
            const old = h.startItem("a");
            const live = h.startItem("a");
            live.emit("playing");
            expect(h.model().playbackModel.playing).toBe(true);
            const playback = { ...h.model().playbackModel };
            old.requests[0][settlement](new Error("retired play"));
            await flush();
            expect(h.model().playbackModel).toEqual(playback);
            expect(h.model().playbackModel.playing).toBe(true);
            h.coordination.dispose();
        });
    }

    it("does not restart paused playback from a pending play settlement or queued playing", async () => {
        const h = await harness();
        const audio = h.startItem("a");
        audio.emit("playing");
        mocks.intent({ type: "toggleActiveMediaPlayback" });
        const playCalls = h.play.mock.calls.length;
        audio.emit("playing");
        audio.requests[0].resolve();
        await flush();
        expect(h.model().playbackModel.playing).toBe(false);
        expect(h.play).toHaveBeenCalledTimes(playCalls);
        h.coordination.dispose();
    });
});
