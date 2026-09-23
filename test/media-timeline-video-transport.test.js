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

describe("media timeline video transport", () => {
    beforeEach(() => setupMediaTimelineTest(mocks));
    afterEach(restoreMediaTimelineTest);

    it("starts selected video when animation play begins from explicit focus", async () => {
        const sliderEvents = [];
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dispatchEvent = (event) => sliderEvents.push(event.type);
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
                    durationSeconds: 180,
                    enabled: true,
                    video: true,
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

        expect(Number(slider.value)).toBe(Date.parse("2026-04-02T16:00:00Z"));
        expect(video.play).not.toHaveBeenCalled();

        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);

        expect(video.src).toBe("https://media.example/web/clip.mp4");
        expect(video.poster).toBe("https://media.example/web/clip-poster.jpg");
        expect(video.play).toHaveBeenCalledTimes(1);
        expect(setRealtimeSpeed).not.toHaveBeenCalled();
        expect(playAnimation).toHaveBeenCalled();
    });

    it("starts timeline-selected video when animation play begins from a media region", async () => {
        class FakeInput {}
        const selectedTimeMs = Date.parse("2026-04-02T16:02:00Z");
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(selectedTimeMs);
        slider.dataset = {
            currentTimeMs: String(selectedTimeMs),
        };
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
                    durationSeconds: 180,
                    enabled: true,
                    video: true,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: selectedTimeMs,
        });
        await flushPromises(8);

        const [, markerSelectHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-media-marker-select"
        ));
        markerSelectHandler({
            detail: {
                marker: {
                    id: "clip.mp4",
                },
                timeMs: selectedTimeMs,
            },
        });

        expect(video.play).not.toHaveBeenCalled();

        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);

        expect(video.src).toBe("https://media.example/web/clip.mp4");
        expect(video.currentTime).toBe(120);
        expect(video.play).toHaveBeenCalledTimes(1);
    });

    it("seeks the active playing video when clicking another time inside its media marker", async () => {
        class FakeInput {}
        const startTimeMs = Date.parse("2026-04-02T10:00:00Z");
        const firstTimeMs = Date.parse("2026-04-02T10:05:00Z");
        const clickedTimeMs = Date.parse("2026-04-02T10:30:00Z");
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-02T09:00:00Z"));
        slider.max = String(Date.parse("2026-04-02T12:00:00Z"));
        slider.value = String(firstTimeMs);
        slider.dataset = {
            currentTimeMs: String(firstTimeMs),
        };
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
            timelineTimezoneOffset: "+00:00",
            photos: [
                {
                    time: "2026-04-02 10:00:00",
                    file: "clip.mp4",
                    title: "One hour video",
                    enabled: true,
                    video: true,
                    durationSeconds: 3600,
                },
            ],
        });
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            pauseAnimation,
            getAnimationRunning: () => true,
            getStartTime: () => Date.parse("2026-04-02T09:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-02T12:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: firstTimeMs,
        });
        await flushPromises(8);

        const [, markerSelectHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-media-marker-select"
        ));
        const [, timelineSeekHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-timeline-user-seek"
        ));
        markerSelectHandler({
            detail: {
                marker: {
                    id: "clip.mp4",
                },
                timeMs: firstTimeMs,
            },
        });

        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);
        expect(video.currentTime).toBe(300);
        pauseAnimation.mockClear();

        slider.value = String(clickedTimeMs);
        slider.dataset.currentTimeMs = String(clickedTimeMs);
        timelineSeekHandler({
            detail: {
                phase: "commit",
                source: "timeline-media-marker",
                commit: true,
                timeMs: clickedTimeMs,
            },
        });
        markerSelectHandler({
            detail: {
                marker: {
                    id: "clip.mp4",
                },
                timeMs: clickedTimeMs,
            },
        });
        await flushPromises(2);

        expect(Number(slider.dataset.currentTimeMs)).toBe(clickedTimeMs);
        expect(Number(slider.value)).toBe(clickedTimeMs);
        expect(video.currentTime).toBe(1800);
        expect(video.play).toHaveBeenCalledTimes(1);
        expect(pauseAnimation).not.toHaveBeenCalled();
    });

    it("seeks active playing video from an estimated-duration marker", async () => {
        class FakeInput {}
        const firstTimeMs = Date.parse("2026-04-02T10:00:05Z");
        const clickedTimeMs = Date.parse("2026-04-02T10:00:20Z");
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-02T09:00:00Z"));
        slider.max = String(Date.parse("2026-04-02T12:00:00Z"));
        slider.value = String(firstTimeMs);
        slider.dataset = {
            currentTimeMs: String(firstTimeMs),
        };
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
            timelineTimezoneOffset: "+00:00",
            photos: [
                {
                    time: "2026-04-02 10:00:00",
                    file: "clip.mp4",
                    title: "Estimated video",
                    durationSeconds: 30,
                    enabled: true,
                    video: true,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getStartTime: () => Date.parse("2026-04-02T09:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-02T12:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: firstTimeMs,
        });
        await flushPromises(8);

        const [, markerSelectHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-media-marker-select"
        ));
        const [, timelineSeekHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-timeline-user-seek"
        ));
        markerSelectHandler({
            detail: {
                marker: {
                    id: "clip.mp4",
                },
                timeMs: firstTimeMs,
            },
        });
        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);
        expect(video.currentTime).toBe(5);

        slider.value = String(clickedTimeMs);
        slider.dataset.currentTimeMs = String(clickedTimeMs);
        timelineSeekHandler({
            detail: {
                phase: "commit",
                source: "timeline-media-marker",
                commit: true,
                timeMs: clickedTimeMs,
            },
        });
        markerSelectHandler({
            detail: {
                marker: {
                    id: "clip.mp4",
                },
                timeMs: clickedTimeMs,
            },
        });
        await flushPromises(2);

        expect(Number(slider.dataset.currentTimeMs)).toBe(clickedTimeMs);
        expect(video.currentTime).toBe(20);
        expect(video.play).toHaveBeenCalledTimes(1);
    });

    it("starts selected video from the current mission offset when media controls play", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
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
                    durationSeconds: 600,
                },
            ],
        });
        const playAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            playAnimation,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T15:55:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        slider.dataset.currentTimeMs = String(Date.parse("2026-04-02T16:05:00Z"));
        slider.value = String(Date.parse("2026-04-02T16:05:00Z"));
        mocks.panelIntentHandler?.({ type: "toggleActiveMediaPlayback" });

        expect(video.currentTime).toBe(300);
        expect(video.play).toHaveBeenCalledTimes(1);
        expect(playAnimation).not.toHaveBeenCalled();
    });

    it("keeps in-range timeline position when selecting a playable video", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(Date.parse("2026-04-02T16:30:00Z"));
        slider.dataset = {
            currentTimeMs: String(Date.parse("2026-04-02T16:30:00Z")),
        };
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
                    durationSeconds: 3600,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:30:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        expect(Number(slider.value)).toBe(Date.parse("2026-04-02T16:30:00Z"));
        expect(video.play).not.toHaveBeenCalled();
    });

    it("uses frame-scrub preview instead of transport playback at high animation rates", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
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
                    durationSeconds: 600,
                },
            ],
        });
        const playAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            playAnimation,
            getAnimationSpeedMultiplier: () => 60,
            getAnimationRealtime: () => false,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:10:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "previewItem", value: "clip.mp4" });
        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);

        expect(video.play).not.toHaveBeenCalled();
        expect(video.pause).toHaveBeenCalled();
        expect(video.currentTime).toBe(0);
        expect(playAnimation).toHaveBeenCalled();
    });

    it("plays a directly selected foreground video even when animation is running fast", async () => {
        class FakeInput {}
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        const selectedTimeMs = clipStartMs + 300000;
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(selectedTimeMs);
        slider.dataset = {
            currentTimeMs: String(selectedTimeMs),
        };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.value = String(slider.dataset.programmaticSeekTimeMs || slider.value);
                slider.dataset.currentTimeMs = slider.dataset.programmaticSeekTimeMs || slider.dataset.currentTimeMs;
            }
        });
        let resolvePlay = null;
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
                return new Promise((resolve) => {
                    resolvePlay = resolve;
                });
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
                    file: "clip.mp4",
                    title: "Crew video",
                    enabled: true,
                    video: true,
                    durationSeconds: 600,
                },
            ],
        });
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            pauseAnimation,
            getAnimationRunning: () => true,
            getAnimationSpeedMultiplier: () => 60,
            getAnimationRealtime: () => false,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: selectedTimeMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        await flushPromises(3);

        expect(video.currentTime).toBe(300);
        expect(video.play).toHaveBeenCalledTimes(1);

        video.pause.mockClear();
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: selectedTimeMs + 1000,
        });

        expect(video.currentTime).toBe(300);
        expect(video.pause).not.toHaveBeenCalled();
        resolvePlay?.();
        await flushPromises(3);

        pauseAnimation.mockClear();
        video.currentTime = 600;
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackTimeUpdate",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 600,
        });

        expect(pauseAnimation).not.toHaveBeenCalled();
    });

    it("keeps frame-scrub preview pauses from toggling animation playback", async () => {
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
            readyState: 4,
            networkState: 1,
            seeking: false,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            play: vi.fn(() => Promise.resolve()),
            pause: vi.fn(() => {
                video.paused = true;
                setTimeout(() => {
                    mocks.panelIntentHandler?.({
                        type: "mediaPlaybackPaused",
                        value: "clip.mp4",
                        mediaKind: "videoClip",
                        mediaElement: video,
                        currentTime: video.currentTime,
                    });
                }, 0);
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
                    durationSeconds: 600,
                },
            ],
        });
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            pauseAnimation,
            getAnimationRunning: () => true,
            getAnimationRealtime: () => false,
            getAnimationSpeedMultiplier: () => 60,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "previewItem", value: "clip.mp4" });
        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);
        pauseAnimation.mockClear();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs + 10000,
        });
        await flushPromises(2);

        expect(video.pause).toHaveBeenCalled();
        expect(video.currentTime).toBe(10);
        expect(pauseAnimation).not.toHaveBeenCalled();
    });

    it("resumes transport playback when switching from high-speed scrub mode to realtime", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
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
        let speedMultiplier = 60;
        let isRealtime = false;
        let animationRunning = false;
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
                    durationSeconds: 600,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationSpeedMultiplier: () => speedMultiplier,
            getAnimationRealtime: () => isRealtime,
            getAnimationRunning: () => animationRunning,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:10:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "previewItem", value: "clip.mp4" });
        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        animationRunning = true;
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);
        expect(video.play).not.toHaveBeenCalled();

        speedMultiplier = 60;
        isRealtime = true;
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:10:01Z"),
        });
        await flushPromises(2);

        expect(video.play).toHaveBeenCalledTimes(1);
    });
});
