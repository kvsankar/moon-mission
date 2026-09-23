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

describe("media timeline selection and metadata", () => {
    beforeEach(() => setupMediaTimelineTest(mocks));
    afterEach(restoreMediaTimelineTest);

    it("opens the media panel and seeks when a timeline media marker is selected", async () => {
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
            mediaMetadata: [
                {
                    file: "photo.jpg",
                    tags: ["gloves", "crew"],
                    subjects: ["gloved hands"],
                    bodies: ["Moon"],
                    sceneType: "crew",
                    qualityNotes: "Readable thumbnail.",
                },
            ],
            photos: [
                {
                    time: "2026-04-02 12:00:00",
                    file: "photo.jpg",
                    title: "Crew photo",
                    camera: "Canon EOS R5",
                    settings: "57mm · f/4 · 1/200 · ISO 1250",
                    enabled: true,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:00:00Z"),
        });
        await flushPromises(8);
        const [, handler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-media-marker-select"
        ));

        handler({
            detail: {
                marker: {
                    id: "photo.jpg",
                },
            },
        });

        expect(mocks.panelSetPanelState).toHaveBeenCalledWith("open");
        expect(Number(slider.value)).toBe(Date.parse("2026-04-02T16:00:00Z"));
        expect(sliderEvents).toEqual(["input", "change"]);
        expect(globalThis.document.dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "mission-media-item-select",
                detail: expect.objectContaining({
                    item: expect.objectContaining({
                        id: "photo.jpg",
                        title: "Crew photo",
                    }),
                }),
            }),
        );
    });

    it("seeks media selections by absolute mission time when the timeline view is zoomed", async () => {
        const sliderEvents = [];
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-03T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-03T12:00:00Z"));
        slider.value = "";
        slider.dispatchEvent = (event) => {
            sliderEvents.push({
                type: event.type,
                programmaticSeekTimeMs: Number(slider.dataset?.programmaticSeekTimeMs),
            });
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
        globalThis.document.getElementById = vi.fn((id) => (id === "timeline-slider" ? slider : null));
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            mediaMetadata: [
                {
                    file: "photo.jpg",
                    tags: ["gloves", "crew"],
                    subjects: ["gloved hands"],
                    bodies: ["Moon"],
                    sceneType: "crew",
                    qualityNotes: "Readable thumbnail.",
                },
            ],
            photos: [
                {
                    time: "2026-04-02 12:00:00",
                    file: "photo.jpg",
                    title: "Crew photo",
                    camera: "Canon EOS R5",
                    settings: "57mm · f/4 · 1/200 · ISO 1250",
                    enabled: true,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-03T02:00:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "photo.jpg" });

        const targetTimeMs = Date.parse("2026-04-02T16:00:00Z");
        expect(Number(slider.value)).toBe(Date.parse("2026-04-03T00:00:00Z"));
        expect(Number(slider.dataset.currentTimeMs)).toBe(targetTimeMs);
        expect(sliderEvents).toEqual([
            { type: "input", programmaticSeekTimeMs: targetTimeMs },
            { type: "change", programmaticSeekTimeMs: targetTimeMs },
        ]);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.activeItem).toEqual(expect.objectContaining({
            id: "photo.jpg",
            focusSource: "user-selection",
            explicit: true,
            tags: ["gloves", "crew"],
            subjects: ["gloved hands"],
            bodies: ["Moon"],
            sceneType: "crew",
            qualityNotes: "Readable thumbnail.",
            exifLabel: "Canon EOS R5 - 57mm · f/4 · 1/200 · ISO 1250",
        }));
    });

    it("releases the media marker listener when config disables the workflow panel", () => {
        mocks.loadMissionMediaManifest.mockResolvedValue(null);
        const coordination = createMediaTimelineCoordination();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: 1234,
        });
        const [, handler] = globalThis.document.addEventListener.mock.calls[0];

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: false }),
            animTime: 2345,
        });

        expect(globalThis.document.removeEventListener).toHaveBeenCalledWith(
            "mission-media-marker-select",
            handler,
        );
    });

    it("stops active media playback and animation when the media browser panel is hidden", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(Date.parse("2026-04-02T16:00:00Z"));
        slider.dispatchEvent = vi.fn();
        const video = {
            pause: vi.fn(),
            dataset: {
                mediaItemId: "video:clip.mp4",
                mediaSourceUrl: "https://media.example/clip.mp4",
                sourceType: "mp4",
            },
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
                    file: "photo.jpg",
                    title: "Crew photo",
                    enabled: true,
                },
            ],
            videos: [
                {
                    id: "video:clip.mp4",
                    time: "2026-04-02 12:00:00",
                    file: "clip.mp4",
                    title: "Crew clip",
                    enabled: true,
                },
            ],
        });
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
            pauseAnimation,
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:00:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "video:clip.mp4",
            mediaKind: "videoClip",
            currentTime: 12,
        });

        const [, panelStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "mission-media-panel-state"
        ));
        panelStateHandler({
            detail: {
                state: "open",
            },
        });

        expect(video.pause).not.toHaveBeenCalled();
        expect(pauseAnimation).not.toHaveBeenCalled();

        panelStateHandler({
            detail: {
                state: "closed",
            },
        });

        expect(video.pause).toHaveBeenCalledTimes(1);
        expect(pauseAnimation).toHaveBeenCalledTimes(1);

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "video:clip.mp4",
            mediaKind: "videoClip",
            currentTime: 20,
        });
        panelStateHandler({
            detail: {
                state: "minimized",
            },
        });

        expect(video.pause).toHaveBeenCalledTimes(2);
        expect(pauseAnimation).toHaveBeenCalledTimes(2);

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "video:clip.mp4",
            mediaKind: "videoClip",
            currentTime: 24,
        });
        panelStateHandler({
            detail: {
                state: "deleted",
            },
        });

        expect(video.pause).toHaveBeenCalledTimes(3);
        expect(pauseAnimation).toHaveBeenCalledTimes(3);
    });

    it("selects an image by mission time without pausing a running animation", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(Date.parse("2026-04-02T16:00:00Z"));
        slider.dataset = {
            currentTimeMs: String(Date.parse("2026-04-02T16:00:00Z")),
        };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.value = String(slider.dataset.programmaticSeekTimeMs || slider.value);
                slider.dataset.currentTimeMs = slider.dataset.programmaticSeekTimeMs || slider.dataset.currentTimeMs;
            }
        });
        const video = {
            pause: vi.fn(),
            dataset: {
                mediaItemId: "video:clip.mp4",
                mediaSourceUrl: "https://media.example/clip.mp4",
                sourceType: "mp4",
            },
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
                    time: "2026-04-02 12:10:00",
                    file: "photo.jpg",
                    title: "Crew photo",
                    enabled: true,
                },
            ],
            videos: [
                {
                    id: "video:clip.mp4",
                    time: "2026-04-02 12:00:00",
                    file: "clip.mp4",
                    title: "Crew clip",
                    enabled: true,
                },
            ],
        });
        const pauseAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
            getAnimationRunning: () => true,
            pauseAnimation,
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:00:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackStarted",
            value: "video:clip.mp4",
            mediaKind: "videoClip",
            currentTime: 5,
        });
        mocks.panelIntentHandler?.({ type: "selectItem", value: "photo.jpg" });

        expect(video.pause).toHaveBeenCalledTimes(1);
        expect(pauseAnimation).not.toHaveBeenCalled();
        expect(Number(slider.dataset.currentTimeMs)).toBe(Date.parse("2026-04-02T16:10:00Z"));
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.activeItem).toEqual(expect.objectContaining({
            id: "photo.jpg",
            focusSource: "user-selection",
        }));
    });

    it("adds audio markers and seeks to an audio clip when selected", async () => {
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
                    file: "photo.jpg",
                    title: "Crew photo",
                    enabled: true,
                },
            ],
            audio: [
                {
                    time: "2026-04-02 12:30:00",
                    file: "audio/clip.mp3",
                    desc: "Audio clip",
                    durationSeconds: 29.992521,
                    enabled: true,
                },
            ],
        });
        const setTimelineMediaMarkers = vi.fn();
        const coordination = createMediaTimelineCoordination({
            setTimelineMediaMarkers,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:00:00Z"),
        });
        await flushPromises(8);
        expect(setTimelineMediaMarkers.mock.calls.some(([markers]) => (
            markers || []
        ).some((marker) => marker.mediaKind === "image"))).toBe(true);

        const latestMarkers = setTimelineMediaMarkers.mock.calls.at(-1)?.[0] || [];
        expect(latestMarkers.map((marker) => marker.mediaKind)).toContain("audioClip");
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.thumbnailItems.map((item) => item.id)).toContain("audio:audio/clip.mp3");

        mocks.panelIntentHandler?.({ type: "selectItem", value: "audio:audio/clip.mp3" });

        expect(Number(slider.value)).toBe(Date.parse("2026-04-02T16:30:00Z"));
        expect(sliderEvents).toEqual(["input", "change"]);
        const selectedRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(selectedRender.playbackModel.durationSeconds).toBe(29.992521);
        expect(selectedRender.playbackModel.durationSeconds).not.toBe(300);
    });

    it("focuses nearby media by mission time without making it an explicit selection", async () => {
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            photos: [
                {
                    time: "2026-04-02 12:00:00",
                    file: "photo.jpg",
                    title: "Crew photo",
                    enabled: true,
                },
            ],
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
        const coordination = createMediaTimelineCoordination();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:31:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "toggleMediaKind", value: "audioClip" });

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.filterModel.mediaKinds).toEqual(["audioClip"]);
        expect(latestRender.focusSource).toBe("time-proximity");
        expect(latestRender.activeItem).toEqual(expect.objectContaining({
            id: "audio:audio/clip.mp3",
            kind: "audioClip",
            focusSource: "time-proximity",
            explicit: false,
        }));
        expect(latestRender.thumbnailItems).toContainEqual(expect.objectContaining({
            id: "audio:audio/clip.mp3",
            active: true,
        }));
        expect(latestRender.navigationModel).toEqual(expect.objectContaining({
            positionLabel: "1 of 1",
            previousEnabled: false,
            nextEnabled: false,
        }));
        expect(latestRender.playbackModel).toEqual(expect.objectContaining({
            showControls: true,
            playing: false,
        }));
        expect(latestRender.statusText).toBe("");
        expect(latestRender.statusText).not.toContain("Following mission time");
        expect(latestRender.statusText).not.toContain("Selected");
    });

    it("does not show the audio fallback duration when manifest duration is missing", async () => {
        class FakeInput {}
        globalThis.HTMLInputElement = FakeInput;
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
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
        const coordination = createMediaTimelineCoordination();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:35:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "toggleMediaKind", value: "audioClip" });
        const focusedRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(focusedRender.playbackModel.elapsedSeconds).toBe(0);
        expect(focusedRender.playbackModel.elapsedSeconds).not.toBe(300);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "audio:audio/clip.mp3" });

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.durationSeconds).toBeNaN();
        expect(latestRender.playbackModel.durationSeconds).not.toBe(300);
        expect(latestRender.playbackModel.elapsedSeconds).toBe(0);
        expect(latestRender.playbackModel.elapsedSeconds).not.toBe(300);
        expect(latestRender.playbackModel.seekEnabled).toBe(false);
    });

    it("fills a missing audio duration from browser metadata", async () => {
        class FakeInput {}
        globalThis.HTMLInputElement = FakeInput;
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
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
        const setTimelineMediaMarkers = vi.fn();
        const coordination = createMediaTimelineCoordination({
            setTimelineMediaMarkers,
        });
        const audioStartMs = Date.parse("2026-04-02T16:30:00Z");

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: audioStartMs,
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "audio:audio/clip.mp3" });
        const initialRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(initialRender.playbackModel.durationSeconds).toBeNaN();

        const probeAudio = instances[instances.length - 1];
        expect(probeAudio).toBeTruthy();
        probeAudio.duration = 10.973083;
        probeAudio.emit("loadedmetadata");
        await flushPromises(2);

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.playbackModel.durationSeconds).toBe(10.973083);
        expect(latestRender.playbackModel.durationSeconds).not.toBe(300);
        const latestMarkers = setTimelineMediaMarkers.mock.calls.at(-1)?.[0] || [];
        const marker = latestMarkers.find((item) => item.id === "audio:audio/clip.mp3");
        expect(marker).toEqual(expect.objectContaining({
            durationEstimated: false,
        }));
        expect(marker.endTimeMs).toBeCloseTo(audioStartMs + 10973.083, 3);
    });
});
