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
} from "./helpers/media-timeline-coordination-harness.js";

describe("media timeline clock authority and resynchronization", () => {
    beforeEach(() => setupMediaTimelineTest(mocks));
    afterEach(restoreMediaTimelineTest);

    it("syncs mission time when native video playback starts", async () => {
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
                    durationSeconds: 30,
                },
            ],
        });
        const playAnimation = vi.fn();
        const setRealtimeSpeed = vi.fn();
        const coordination = createMediaTimelineCoordination({
            playAnimation,
            setRealtimeSpeed,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T15:55:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 12,
        });

        expect(Number(slider.value)).toBe(Date.parse("2026-04-02T16:00:12Z"));
        expect(setRealtimeSpeed).not.toHaveBeenCalled();
        expect(playAnimation).toHaveBeenCalled();
        expect(sliderEvents).toEqual(["input", "change", "input"]);
    });

    it("does not let animation-owned video events drag the mission clock backward", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        const animationTimeMs = clipStartMs + 65000;
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(animationTimeMs);
        slider.dataset = { currentTimeMs: String(animationTimeMs) };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.value = String(slider.dataset.programmaticSeekTimeMs || slider.value);
                slider.dataset.currentTimeMs = slider.dataset.programmaticSeekTimeMs || slider.dataset.currentTimeMs;
            }
        });
        const video = {
            dataset: {},
            src: "",
            poster: "",
            currentTime: 0,
            paused: false,
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
                    durationSeconds: 300,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
            getAnimationSpeedMultiplier: () => 1,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: animationTimeMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "previewItem", value: "clip.mp4" });
        slider.value = String(animationTimeMs);
        slider.dataset.currentTimeMs = String(animationTimeMs);
        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);
        slider.dispatchEvent.mockClear();

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 0,
        });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackTimeUpdate",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 1,
        });

        expect(Number(slider.dataset.currentTimeMs)).toBe(animationTimeMs);
        expect(Number(slider.value)).toBe(animationTimeMs);
        expect(slider.dispatchEvent).not.toHaveBeenCalled();
    });

    it("seeks delayed video sources to the mission offset before playing", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        const animationTimeMs = clipStartMs + 45000;
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(animationTimeMs);
        slider.dataset = { currentTimeMs: String(animationTimeMs) };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.dataset.currentTimeMs = slider.dataset.programmaticSeekTimeMs || slider.dataset.currentTimeMs;
            }
        });
        const video = {
            dataset: {},
            src: "",
            currentSrc: "",
            poster: "",
            currentTime: 0,
            paused: true,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            play: vi.fn(() => {
                video.paused = false;
                return Promise.resolve();
            }),
            pause: vi.fn(() => {
                video.paused = true;
            }),
            load: vi.fn(),
            removeAttribute: vi.fn(),
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
                    file: "clip.m3u8",
                    title: "Crew video",
                    enabled: true,
                    video: true,
                    sourceType: "hls",
                    durationSeconds: 300,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
            getAnimationSpeedMultiplier: () => 1,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: animationTimeMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.m3u8" });
        video.currentTime = 0;
        mocks.panelIntentHandler?.({
            type: "mediaVideoSourceReady",
            value: "clip.m3u8",
            mediaKind: "videoClip",
            currentTime: 0,
        });

        expect(video.currentTime).toBe(45);
        expect(video.play).toHaveBeenCalled();
    });

    it("keeps active video synced when switching fast sim speed back to realtime", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dataset = { currentTimeMs: String(clipStartMs) };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.dataset.currentTimeMs = slider.dataset.programmaticSeekTimeMs || slider.dataset.currentTimeMs;
            }
        });
        const video = {
            dataset: {},
            src: "",
            poster: "",
            currentTime: 0,
            paused: true,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            play: vi.fn(() => {
                video.paused = false;
                return Promise.resolve();
            }),
            pause: vi.fn(() => {
                video.paused = true;
            }),
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
                    durationSeconds: 300,
                },
            ],
        });
        let animationRealtime = true;
        let animationSpeedMultiplier = 60;
        let animationRunning = true;
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => animationRunning,
            getAnimationRealtime: () => animationRealtime,
            getAnimationSpeedMultiplier: () => animationSpeedMultiplier,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        const initialPlayCalls = video.play.mock.calls.length;
        expect(initialPlayCalls).toBeGreaterThan(0);

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 0,
        });

        animationRealtime = false;
        animationSpeedMultiplier = 60;
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs + 60000,
        });

        expect(video.pause).toHaveBeenCalled();
        expect(video.currentTime).toBe(60);

        animationRealtime = true;
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs + 61000,
        });

        expect(video.play.mock.calls.length).toBeGreaterThan(initialPlayCalls);
        expect(video.currentTime).toBeGreaterThanOrEqual(60);
    });

    it("keeps active video synced when timeline jumps during playback", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dataset = { currentTimeMs: String(clipStartMs) };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.dataset.currentTimeMs = slider.dataset.programmaticSeekTimeMs || slider.dataset.currentTimeMs;
            }
        });
        const video = {
            dataset: {},
            src: "",
            poster: "",
            currentTime: 0,
            paused: true,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            play: vi.fn(() => {
                video.paused = false;
                return Promise.resolve();
            }),
            pause: vi.fn(() => {
                video.paused = true;
            }),
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
                    durationSeconds: 300,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
            getAnimationSpeedMultiplier: () => 1,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        mocks.panelIntentHandler?.({ type: "startActiveMediaFromBeginning" });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 5,
        });
        const pauseCallsBeforeJump = video.pause.mock.calls.length;

        slider.dataset.currentTimeMs = String(clipStartMs + 65000);
        slider.value = String(clipStartMs + 65000);
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackTimeUpdate",
            value: "clip.mp4",
            currentTime: 6,
        });

        expect(video.pause.mock.calls.length).toBe(pauseCallsBeforeJump);
        expect(Number(slider.dataset.currentTimeMs)).toBe(clipStartMs + 65000);
        expect(Number(slider.value)).toBe(clipStartMs + 65000);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.statusLabel).toContain("playing");
    });

    it("seeks active media when Frame and Shoot nudges the mission timeline", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(clipStartMs);
        slider.dataset = { currentTimeMs: String(clipStartMs) };
        slider.dispatchEvent = vi.fn();
        const video = {
            dataset: {},
            src: "",
            poster: "",
            currentTime: 0,
            paused: false,
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
                    durationSeconds: 300,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
            getAnimationSpeedMultiplier: () => 1,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 0,
        });
        const [, seekHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-timeline-user-seek"
        ));

        seekHandler({
            detail: {
                phase: "commit",
                source: "frame-shoot",
                commit: true,
                timeMs: clipStartMs + 65000,
            },
        });

        expect(video.currentTime).toBe(65);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.elapsedSeconds).toBe(65);
    });

    it("keeps Frame and Shoot nudges authoritative while playing media emits stale seek events", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        const targetTimeMs = clipStartMs + 60000;
        const staleTimeMs = clipStartMs + 120000;
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(staleTimeMs);
        slider.dataset = { currentTimeMs: String(staleTimeMs) };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.value = String(slider.dataset.programmaticSeekTimeMs || slider.value);
                slider.dataset.currentTimeMs = slider.dataset.programmaticSeekTimeMs || slider.dataset.currentTimeMs;
            }
        });
        const video = {
            dataset: {},
            src: "",
            poster: "",
            currentTime: 120,
            paused: false,
            readyState: 2,
            networkState: 2,
            seeking: true,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            play: vi.fn(() => {
                video.paused = false;
                return Promise.resolve();
            }),
            pause: vi.fn(() => {
                video.paused = true;
            }),
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
                    durationSeconds: 300,
                },
            ],
        });
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            pauseAnimation,
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
            getAnimationSpeedMultiplier: () => 1,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: staleTimeMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 120,
        });
        pauseAnimation.mockClear();
        video.play.mockClear();
        const [, seekHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-timeline-user-seek"
        ));

        slider.value = String(targetTimeMs);
        slider.dataset.currentTimeMs = String(targetTimeMs);
        seekHandler({
            detail: {
                phase: "commit",
                source: "frame-shoot",
                commit: true,
                timeMs: targetTimeMs,
            },
        });

        expect(video.currentTime).toBe(60);
        video.currentTime = 120;
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackBuffering",
            value: "clip.mp4",
            currentTime: 120,
        });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackPaused",
            value: "clip.mp4",
            mediaElement: video,
            currentTime: 120,
        });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackTimeUpdate",
            value: "clip.mp4",
            currentTime: 120,
        });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackEnded",
            value: "clip.mp4",
        });

        expect(Number(slider.dataset.currentTimeMs)).toBe(targetTimeMs);
        expect(Number(slider.value)).toBe(targetTimeMs);
        expect(pauseAnimation).not.toHaveBeenCalled();
        expect(video.play).toHaveBeenCalled();
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.statusLabel).not.toContain("paused");
    });
});
