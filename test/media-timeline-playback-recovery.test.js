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

describe("media timeline buffering and playback end", () => {
    beforeEach(() => setupMediaTimelineTest(mocks));
    afterEach(restoreMediaTimelineTest);

    it("moves the mission timeline when scrubbing active media during playback", async () => {
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
        mocks.panelIntentHandler?.({ type: "startActiveMediaFromBeginning" });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 0,
        });
        mocks.panelIntentHandler?.({
            type: "mediaSeekTime",
            value: 120,
            finalize: true,
        });

        expect(video.currentTime).toBe(120);
        expect(Number(slider.dataset.currentTimeMs)).toBe(clipStartMs + 120000);
        expect(Number(slider.value)).toBe(clipStartMs + 120000);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.elapsedSeconds).toBe(120);
    });

    it("force resync keeps media paused and aligned when animation is paused", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dataset = { currentTimeMs: String(clipStartMs + 20000) };
        slider.dispatchEvent = vi.fn();
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
        let animationRunning = false;
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => animationRunning,
            getAnimationRealtime: () => true,
            getAnimationSpeedMultiplier: () => 60,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs + 20000,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        mocks.panelIntentHandler?.({ type: "startActiveMediaFromBeginning" });
        slider.dataset.currentTimeMs = String(clipStartMs + 20000);
        slider.value = String(clipStartMs + 20000);
        mocks.panelIntentHandler?.({ type: "forceResyncActiveMedia" });

        expect(video.pause).toHaveBeenCalled();
        expect(video.currentTime).toBeGreaterThanOrEqual(0);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.statusLabel).toContain("paused");
    });

    it("force resync aligns timeline-driven media position when animation is running fast", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dataset = { currentTimeMs: String(clipStartMs + 45000) };
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
            getAnimationRealtime: () => false,
            getAnimationSpeedMultiplier: () => 60,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: clipStartMs + 45000,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "previewItem", value: "clip.mp4" });
        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });
        await flushPromises(2);
        video.pause.mockClear();
        slider.dataset.currentTimeMs = String(clipStartMs + 45000);
        slider.value = String(clipStartMs + 45000);
        mocks.panelIntentHandler?.({ type: "forceResyncActiveMedia" });

        expect(video.pause).toHaveBeenCalled();
        expect(video.currentTime).toBeGreaterThanOrEqual(0);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.statusLabel).toContain("frame preview");
        expect(latestRender.playbackModel.statusLabel).toContain("60x");
    });

    it("shows buffering while keeping mission animation play state stable", async () => {
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
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            playAnimation,
            pauseAnimation,
            getAnimationRunning: () => playAnimation.mock.calls.length > pauseAnimation.mock.calls.length,
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
            currentTime: 4,
        });
        expect(playAnimation).toHaveBeenCalledTimes(1);

        const bufferingVideo = { ended: false, readyState: 2, networkState: 2, seeking: false };
        globalThis.document.getElementById = vi.fn(id => id === "timeline-slider" ? slider
            : id === "media-browser-video" ? bufferingVideo : null);
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackPaused",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 7,
            mediaElement: bufferingVideo,
        });

        expect(pauseAnimation).not.toHaveBeenCalled();
        expect(Number(slider.dataset.currentTimeMs)).toBe(Date.parse("2026-04-02T16:00:07Z"));
        const earlyPauseRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(earlyPauseRender.playbackModel).toEqual(expect.objectContaining({
            buffering: true,
            playing: true,
            showControls: true,
        }));

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackBuffering",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 7,
        });

        expect(pauseAnimation).not.toHaveBeenCalled();
        expect(Number(slider.dataset.currentTimeMs)).toBe(Date.parse("2026-04-02T16:00:07Z"));
        const bufferingRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(bufferingRender.playbackModel).toEqual(expect.objectContaining({
            buffering: true,
            playing: true,
            playLabel: "▶",
            showControls: true,
        }));

        mocks.panelIntentHandler?.({ type: "toggleActiveMediaPlayback" });
        expect(pauseAnimation).not.toHaveBeenCalled();

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 7,
        });
        expect(playAnimation).toHaveBeenCalledTimes(1);
    });

    it("stops media and animation at playable duration instead of looping", async () => {
        class FakeInput {}
        const startTimeMs = Date.parse("2026-04-02T16:00:00Z");
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(startTimeMs);
        slider.dataset = {
            currentTimeMs: String(startTimeMs),
        };
        slider.dispatchEvent = vi.fn();
        const video = {
            dataset: {},
            src: "",
            poster: "",
            currentTime: 0,
            loop: true,
            paused: false,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            removeAttribute: vi.fn((name) => {
                if (name === "loop") video.loop = false;
            }),
            play: vi.fn(() => Promise.resolve()),
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
            timelineTimezoneOffset: "+00:00",
            photos: [
                {
                    time: "2026-04-02 16:00:00",
                    file: "clip.mp4",
                    title: "Crew video",
                    enabled: true,
                    video: true,
                    durationSeconds: 30,
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
            animTime: startTimeMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        mocks.panelIntentHandler?.({ type: "startActiveMediaFromBeginning" });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 0,
        });
        pauseAnimation.mockClear();
        video.loop = true;
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1000);

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackTimeUpdate",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 30,
        });

        expect(video.loop).toBe(false);
        expect(video.removeAttribute).toHaveBeenCalledWith("loop");
        expect(video.pause).toHaveBeenCalled();
        expect(pauseAnimation).toHaveBeenCalledTimes(1);
        expect(Number(slider.dataset.currentTimeMs)).toBe(startTimeMs + 30000);
        const timelineEventCountAfterTimeUpdate = slider.dispatchEvent.mock.calls.length;
        const renderCountAfterTimeUpdate = mocks.panelRender.mock.calls.length;

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackEnded",
            value: "clip.mp4",
            mediaKind: "videoClip",
        });

        expect(pauseAnimation).toHaveBeenCalledTimes(1);
        expect(slider.dispatchEvent).toHaveBeenCalledTimes(timelineEventCountAfterTimeUpdate);
        expect(mocks.panelRender).toHaveBeenCalledTimes(renderCountAfterTimeUpdate);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel).toEqual(expect.objectContaining({
            showControls: true,
            playing: false,
            buffering: false,
        }));

        const pauseAnimationCountAfterEnd = pauseAnimation.mock.calls.length;
        const renderCountAfterEnd = mocks.panelRender.mock.calls.length;
        nowSpy.mockReturnValue(2001);
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackPaused",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 30,
            mediaElement: video,
        });

        expect(pauseAnimation).toHaveBeenCalledTimes(pauseAnimationCountAfterEnd);
        expect(mocks.panelRender).toHaveBeenCalledTimes(renderCountAfterEnd);
        nowSpy.mockRestore();
    });

    it("lets animation continue when animation-started media reaches its end", async () => {
        class FakeInput {}
        const startTimeMs = Date.parse("2026-04-02T16:00:00Z");
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(startTimeMs);
        slider.dataset = {
            currentTimeMs: String(startTimeMs),
        };
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
            loop: true,
            paused: false,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            removeAttribute: vi.fn((name) => {
                if (name === "loop") video.loop = false;
            }),
            play: vi.fn(() => Promise.resolve()),
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
            timelineTimezoneOffset: "+00:00",
            photos: [
                {
                    time: "2026-04-02 16:00:00",
                    file: "clip.mp4",
                    title: "Crew video",
                    enabled: true,
                    video: true,
                    durationSeconds: 30,
                },
            ],
        });
        let animationRunning = false;
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            pauseAnimation,
            getAnimationRunning: () => animationRunning,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: startTimeMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        animationRunning = true;
        playStateHandler({ detail: { isPlaying: true } });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 0,
        });
        pauseAnimation.mockClear();

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackTimeUpdate",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 30,
        });

        expect(video.loop).toBe(false);
        expect(video.pause).toHaveBeenCalled();
        expect(pauseAnimation).not.toHaveBeenCalled();
        expect(Number(slider.dataset.currentTimeMs)).toBe(startTimeMs + 30000);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel).toEqual(expect.objectContaining({
            playing: false,
            buffering: false,
        }));
    });

    it("shows a status toast when an hls stream reports buffering without toggling animation", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dispatchEvent = vi.fn();
        const hiddenClasses = new Set(["media-buffering-status--hidden"]);
        const bufferingStatus = {
            hidden: true,
            dataset: {},
            classList: {
                toggle: vi.fn((className, force) => {
                    if (force) {
                        hiddenClasses.add(className);
                    } else {
                        hiddenClasses.delete(className);
                    }
                }),
            },
        };
        const bufferingStatusText = {
            textContent: "",
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
            if (id === "media-buffering-status") return bufferingStatus;
            if (id === "media-buffering-status-text") return bufferingStatusText;
            return null;
        });
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaStreams: [
                {
                    id: "lunar-flyby-stream",
                    title: "Lunar Flyby Stream",
                    enabled: true,
                    streamKind: "video",
                    sourceType: "hls",
                    sourceUrl: "../media/streams/lunar-flyby/v1/master.m3u8",
                    startTime: "2026-04-06T16:58:14Z",
                    endTime: "2026-04-07T03:08:14.130Z",
                },
            ],
        });
        const playAnimation = vi.fn();
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            playAnimation,
            pauseAnimation,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T16:58:14Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "lunar-flyby-stream" });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "lunar-flyby-stream",
            mediaKind: "videoClip",
            currentTime: 2,
        });
        expect(playAnimation).toHaveBeenCalledTimes(1);

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackBuffering",
            value: "lunar-flyby-stream",
            mediaKind: "videoClip",
            currentTime: 4,
        });

        expect(pauseAnimation).not.toHaveBeenCalled();
        expect(bufferingStatus.hidden).toBe(false);
        expect(bufferingStatus.dataset.status).toBe("buffering");
        expect(hiddenClasses.has("media-buffering-status--hidden")).toBe(false);
        expect(bufferingStatusText.textContent).toContain("holding sync");
        const bufferingRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(bufferingRender.playbackModel).toEqual(expect.objectContaining({
            buffering: true,
            playing: true,
            showControls: true,
        }));

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "lunar-flyby-stream",
            mediaKind: "videoClip",
            currentTime: 4,
        });

        expect(playAnimation).toHaveBeenCalledTimes(1);
        expect(bufferingStatus.hidden).toBe(true);
        expect(bufferingStatus.dataset.status).toBe("");
        expect(hiddenClasses.has("media-buffering-status--hidden")).toBe(true);
    });

    it("treats direct media play as media authority even while animation is already running", async () => {
        class FakeInput {}
        const clipStartMs = Date.parse("2026-04-02T16:00:00Z");
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(clipStartMs);
        slider.dataset = {
            currentTimeMs: String(clipStartMs),
        };
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
            loop: false,
            paused: true,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            removeAttribute: vi.fn((name) => {
                if (name === "loop") video.loop = false;
            }),
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
                    durationSeconds: 30,
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
            animTime: clipStartMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "clip.mp4" });
        mocks.panelIntentHandler?.({ type: "toggleActiveMediaPlayback" });
        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 0,
        });
        pauseAnimation.mockClear();

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackEnded",
            value: "clip.mp4",
            mediaKind: "videoClip",
        });

        expect(pauseAnimation).toHaveBeenCalledTimes(1);
    });
});
