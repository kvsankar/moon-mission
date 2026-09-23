import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getMissionMediaDataPath: vi.fn(),
    loadMissionMediaManifest: vi.fn(),
    panelRender: vi.fn(),
    panelSetMissionContext: vi.fn(),
    panelSetPanelState: vi.fn(),
    panelIntentHandler: null,
}));

vi.mock("../src/platform/js/data/mission-media.js", () => ({
    getMissionMediaManifestUrl: () => `${mocks.getMissionMediaDataPath()}media-manifest.json`,
    getMissionMediaDataPath: mocks.getMissionMediaDataPath,
    loadMissionMediaManifest: mocks.loadMissionMediaManifest,
}));

vi.mock("../src/platform/js/app/media-browser-panel.js", () => ({
    MEDIA_BROWSER_PANEL_ID: "workflow:media-browser",
    createMediaBrowserPanelActions: vi.fn((options = {}) => {
        mocks.panelIntentHandler = options.onIntent;
        return {
            render: mocks.panelRender,
            setMissionContext: mocks.panelSetMissionContext,
            setPanelState: mocks.panelSetPanelState,
        };
    }),
}));

import { createMediaTimelineCoordination } from "../src/platform/js/app/media-timeline-coordination.js";
import {
    restoreMediaTimelineTest,
    setupMediaTimelineTest,
    flushPromises,
    createMissionConfig,
    createAudioMock,
} from "./helpers/media-timeline-coordination-harness.js";

describe("media timeline audio transport", () => {
    beforeEach(() => setupMediaTimelineTest(mocks));
    afterEach(restoreMediaTimelineTest);

    it("pauses animation at commit when mission media is open and seek lands outside playable coverage", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dataset = {};
        slider.dispatchEvent = vi.fn();
        const video = {
            dataset: {},
            src: "",
            poster: "",
            currentTime: 0,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            play: vi.fn(() => Promise.resolve()),
            pause: vi.fn(),
            load: vi.fn(),
        };
        globalThis.HTMLInputElement = FakeInput;
        globalThis.Event = class {
            constructor(type) {
                this.type = type;
            }
        };
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        globalThis.document.getElementById = vi.fn((id) => {
            if (id === "timeline-slider") return slider;
            if (id === "media-browser-video") return video;
            return null;
        });
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            photos: [
                {
                    time: "2026-04-02 12:00:00",
                    file: "clip.mp4",
                    title: "Crew video",
                    enabled: true,
                    video: true,
                    durationSeconds: 900,
                },
            ],
        });

        let animationRunning = true;
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            pauseAnimation,
            getAnimationRunning: () => animationRunning,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:00:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 180,
        });
        const pauseCallsBeforeSeek = pauseAnimation.mock.calls.length;

        const [, panelStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-media-panel-state"
        ));
        panelStateHandler({
            detail: {
                state: "open",
            },
        });

        const [, timelineSeekHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-timeline-user-seek"
        ));
        timelineSeekHandler({
            detail: {
                phase: "commit",
                source: "timeline-event-marker",
                commit: true,
                timeMs: Date.parse("2026-04-02T17:00:00Z"),
            },
        });

        expect(video.pause).toHaveBeenCalled();
        expect(pauseAnimation.mock.calls.length).toBeGreaterThan(pauseCallsBeforeSeek);
    });

    it("seeks active audio to the manually selected mission time", async () => {
        const sliderEvents = [];
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dispatchEvent = (event) => sliderEvents.push(event.type);
        globalThis.HTMLInputElement = FakeInput;
        globalThis.Event = class {
            constructor(type) {
                this.type = type;
            }
        };
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        globalThis.document.getElementById = vi.fn((id) => (id === "timeline-slider" ? slider : null));
        const { AudioMock, instances } = createAudioMock();
        globalThis.Audio = AudioMock;
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            audio: [
                {
                    time: "2026-04-02 12:30:00",
                    file: "audio/clip.mp3",
                    desc: "Audio clip",
                    durationSeconds: 180,
                    enabled: true,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });
        const audioStartMs = Date.parse("2026-04-02T16:30:00Z");
        const manualTimeMs = audioStartMs + 120000;

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: audioStartMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "audio:audio/clip.mp3" });
        mocks.panelIntentHandler?.({ type: "startActiveMediaFromBeginning" });
        const audio = instances[instances.length - 1];
        expect(audio).toBeTruthy();
        audio.emit("playing");

        slider.value = String(manualTimeMs);
        slider.dataset.currentTimeMs = String(manualTimeMs);
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: manualTimeMs,
        });

        audio.currentTime = 8;
        audio.emit("timeupdate");

        expect(Number(slider.dataset.currentTimeMs)).toBe(manualTimeMs);
        expect(Number(slider.value)).toBe(manualTimeMs);
        expect(audio.currentTime).toBe(120);
        expect(audio.pause).toHaveBeenCalled();
        expect(sliderEvents).toEqual(["input", "change", "input", "change", "input"]);
    });

    it("keeps direct audio playback at normal speed while media drives the mission clock", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dispatchEvent = vi.fn();
        globalThis.HTMLInputElement = FakeInput;
        globalThis.Event = class {
            constructor(type) {
                this.type = type;
            }
        };
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        globalThis.document.getElementById = vi.fn((id) => (id === "timeline-slider" ? slider : null));
        const { AudioMock, instances } = createAudioMock();
        globalThis.Audio = AudioMock;
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            audio: [
                {
                    time: "2026-04-02 12:30:00",
                    file: "audio/clip.mp3",
                    desc: "Audio clip",
                    enabled: true,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => false,
            getAnimationSpeedMultiplier: () => 60,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });
        const audioStartMs = Date.parse("2026-04-02T16:30:00Z");

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: audioStartMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "audio:audio/clip.mp3" });
        mocks.panelIntentHandler?.({ type: "startActiveMediaFromBeginning" });
        const audio = instances[instances.length - 1];
        expect(audio).toBeTruthy();
        expect(audio.playbackRate).toBe(1);

        audio.emit("playing");
        audio.currentTime = 3;
        audio.emit("timeupdate");
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: audioStartMs + 3000,
        });

        expect(audio.playbackRate).toBe(1);
        expect(Number(slider.dataset.currentTimeMs)).toBe(audioStartMs + 3000);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.statusLabel).toContain("1x");
        expect(latestRender.playbackModel.statusLabel).not.toContain("60x");
    });

    it("starts unknown-duration audio at the current mission offset", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const audioStartMs = Date.parse("2026-04-02T16:30:00Z");
        const currentTimeMs = audioStartMs + 12000;
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(currentTimeMs);
        slider.dataset = { currentTimeMs: String(currentTimeMs) };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.dataset.currentTimeMs = slider.dataset.programmaticSeekTimeMs || slider.dataset.currentTimeMs;
            }
        });
        globalThis.HTMLInputElement = FakeInput;
        globalThis.Event = class {
            constructor(type) {
                this.type = type;
            }
        };
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        globalThis.document.getElementById = vi.fn((id) => (id === "timeline-slider" ? slider : null));
        const { AudioMock, instances } = createAudioMock();
        globalThis.Audio = AudioMock;
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            audio: [
                {
                    time: "2026-04-02 12:30:00",
                    file: "audio/clip.mp3",
                    desc: "Audio clip",
                    enabled: true,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: currentTimeMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "audio:audio/clip.mp3" });
        const audio = instances[instances.length - 1];

        expect(audio).toBeTruthy();
        expect(audio.currentTime).toBe(12);
        expect(audio.play).toHaveBeenCalled();
    });

    it("clears audio playback state when the audio element fails", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dispatchEvent = vi.fn();
        globalThis.HTMLInputElement = FakeInput;
        globalThis.Event = class {
            constructor(type) {
                this.type = type;
            }
        };
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        globalThis.document.getElementById = vi.fn((id) => (id === "timeline-slider" ? slider : null));
        const { AudioMock, instances } = createAudioMock();
        globalThis.Audio = AudioMock;
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            audio: [
                {
                    time: "2026-04-02 12:30:00",
                    file: "audio/clip.mp3",
                    desc: "Audio clip",
                    enabled: true,
                },
            ],
        });
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            pauseAnimation,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:30:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "audio:audio/clip.mp3" });
        mocks.panelIntentHandler?.({ type: "startActiveMediaFromBeginning" });
        instances[0].emit("error");

        expect(pauseAnimation).toHaveBeenCalled();
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel).toEqual(expect.objectContaining({
            playing: false,
            showControls: true,
        }));
    });
});
