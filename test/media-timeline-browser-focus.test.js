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

describe("media timeline browsing and proximity focus", () => {
    beforeEach(() => setupMediaTimelineTest(mocks));
    afterEach(restoreMediaTimelineTest);

    it("filters thumbnails from structured AI body metadata when searching", async () => {
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            mediaMetadata: [
                {
                    file: "earth.jpg",
                    shortDescription: "Earth fills the frame.",
                    tags: ["earth", "clouds"],
                    subjects: ["Earth"],
                    sceneType: "earth",
                    bodies: ["Earth"],
                    mainBody: "Earth",
                    compositionHints: {
                        suggestedLockTarget: "earth",
                        confidence: 0.95,
                        reason: "Earth is the main subject.",
                    },
                },
                {
                    file: "prelaunch.jpg",
                    shortDescription: "Pad closeout before launch.",
                    tags: ["prelaunch"],
                    subjects: ["Launch pad"],
                    sceneType: "launch",
                    bodies: ["Orion"],
                    mainBody: "Orion",
                },
            ],
            photos: [
                {
                    time: "2026-04-01 18:30:00",
                    file: "prelaunch.jpg",
                    title: "Prelaunch closeout",
                    enabled: true,
                },
                {
                    time: "2026-04-02 12:00:00",
                    file: "crew.jpg",
                    title: "Crew update",
                    flickr_desc: "The crew talks while far from Earth.",
                    enabled: true,
                },
                {
                    time: "2026-04-02 12:05:00",
                    file: "earth.jpg",
                    title: "Earth portrait",
                    enabled: true,
                },
                {
                    time: "2026-04-02 12:10:00",
                    file: "moon.jpg",
                    title: "Moon portrait",
                    enabled: true,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T22:35:12Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:00:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "setSearchQuery", value: "earth" });

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.filterModel.query).toBe("earth");
        expect(latestRender.thumbnailItems.map((item) => item.id)).toEqual(["earth.jpg"]);
        expect(latestRender.thumbnailItems[0].metadataLabel).toContain("AI:");
        expect(latestRender.thumbnailItems[0].metadataLabel).toContain("Earth");
        expect(latestRender.thumbnailItems[0].meta).toBe("MET 000:17:29");
        expect(latestRender.thumbnailItems[0].metaFull).toBe("MET 000:17:29:48");
        expect(latestRender.thumbnailItems[0].localTimeLabel).toBeTruthy();
        expect(latestRender.thumbnailItems[0].utcTimeLabel).toContain("UTC");
        expect(latestRender.mediaCountLabel).toBe("1");

        mocks.panelIntentHandler?.({ type: "setSearchQuery", value: "prelaunch" });
        const prelaunchRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(prelaunchRender.thumbnailItems.map((item) => item.id)).toEqual(["prelaunch.jpg"]);
        expect(prelaunchRender.thumbnailItems[0].meta).toBe("MET -000:00:05");
        expect(prelaunchRender.thumbnailItems[0].metaFull).toBe("MET -000:00:05:12");
        expect(prelaunchRender.thumbnailItems[0].thumbnailLabel).toBe("MET -000:00:05");
    });

    it("moves adjacent controls from the current time-proximity focus", async () => {
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
                    file: "photo-0.jpg",
                    title: "Photo 0",
                    enabled: true,
                },
                {
                    time: "2026-04-02 12:10:00",
                    file: "photo-10.jpg",
                    title: "Photo 10",
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
            animTime: Date.parse("2026-04-02T16:04:00Z"),
        });
        await flushPromises(8);

        const initialRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(initialRender.activeItem).toEqual(expect.objectContaining({
            id: "photo-0.jpg",
            focusSource: "time-proximity",
            explicit: false,
        }));

        mocks.panelIntentHandler?.({ type: "selectAdjacentItem", value: "next" });

        expect(Number(slider.dataset.currentTimeMs)).toBe(Date.parse("2026-04-02T16:10:00Z"));
        expect(sliderEvents).toEqual(["input", "change"]);
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.activeItem).toEqual(expect.objectContaining({
            id: "photo-10.jpg",
            focusSource: "user-selection",
            explicit: true,
        }));
        expect(latestRender.navigationModel).toEqual(expect.objectContaining({
            positionLabel: "2 of 2",
        }));
    });

    it("starts selected audio when animation play begins from explicit focus", async () => {
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
        const { AudioMock } = createAudioMock();
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
        const playAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            playAnimation,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });
        const audioStartMs = Date.parse("2026-04-02T16:30:00Z");

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:00:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "audio:audio/clip.mp3" });
        expect(AudioMock).not.toHaveBeenCalled();
        expect(Number(slider.dataset.currentTimeMs)).toBe(audioStartMs);

        const [, playStateHandler] = globalThis.document.addEventListener.mock.calls.find(([type]) => (
            type === "animation-play-state-updated"
        ));
        playStateHandler({ detail: { isPlaying: true } });

        expect(AudioMock).toHaveBeenCalledTimes(1);
        expect(playAnimation).not.toHaveBeenCalled();
        expect(Number(slider.dataset.currentTimeMs)).toBe(audioStartMs);
    });

    it("renders a bounded thumbnail window around mission time", async () => {
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        const photos = Array.from({ length: 90 }, (_, index) => {
            const hour = 12 + Math.floor(index / 60);
            const minute = index % 60;
            return {
                time: `2026-04-02 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
                file: `photo-${index}.jpg`,
                title: `Photo ${index}`,
                enabled: true,
            };
        });
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            photos,
        });
        const coordination = createMediaTimelineCoordination();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T17:00:00Z"),
        });
        await flushPromises(8);

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.mediaCountLabel).toBe("90");
        expect(latestRender.thumbnailItems).toHaveLength(64);
        expect(latestRender.thumbnailItems.map((item) => item.id)).toContain("photo-60.jpg");
        expect(latestRender.thumbnailItems).toContainEqual(expect.objectContaining({
            id: "photo-60.jpg",
            active: true,
        }));
        expect(latestRender.thumbnailItems.map((item) => item.id)).not.toContain("photo-0.jpg");
        expect(latestRender.statusText).toBe("");
    });

    it("surfaces enabled mission media streams as playable video items", async () => {
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaStreams: [
                {
                    id: "flyby-stream",
                    title: "Lunar flyby broadcast",
                    description: "Mission-long stream.",
                    enabled: true,
                    streamKind: "video",
                    sourceType: "hls",
                    sourceUrl: "../media/streams/lunar-flyby/v1/master.m3u8",
                    sourceLabel: "NASA broadcast",
                    startTime: "2026-04-06T17:56:00Z",
                    durationSeconds: 36600.13,
                    syncStatus: "provisional",
                },
            ],
        });
        const coordination = createMediaTimelineCoordination();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T17:56:00Z"),
        });
        await flushPromises(8);

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.mediaCountLabel).toBe("1");
        expect(latestRender.activeItem).toMatchObject({
            id: "flyby-stream",
            kind: "videoClip",
            mediaStream: true,
            sourceType: "hls",
            videoAssetUrl: "assets/artemis2/data/../media/streams/lunar-flyby/v1/master.m3u8",
            sourceLabel: "NASA broadcast",
            stageBadge: "Stream • Video • Exterior",
        });
        expect(latestRender.playbackModel).toMatchObject({
            playable: true,
            showControls: true,
        });
    });

    it("keeps background broadcast streams out of the selectable carousel", async () => {
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        const setTimelineMediaMarkers = vi.fn();
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaStreams: [
                {
                    id: "flyby-broadcast",
                    title: "Flyby Broadcast",
                    description: "Mission-long stream.",
                    enabled: true,
                    streamKind: "video",
                    sourceType: "hls",
                    sourceUrl: "../media/streams/lunar-flyby/v1/master.m3u8",
                    sourceLabel: "NASA broadcast",
                    startTime: "2026-04-06T17:56:00Z",
                    durationSeconds: 36600.13,
                    playbackRoles: ["background"],
                    backgroundPlayback: {
                        enabled: true,
                        muted: true,
                    },
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            setTimelineMediaMarkers,
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T17:56:00Z"),
        });
        await flushPromises(8);

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.mediaCountLabel).toBe("0");
        expect(latestRender.thumbnailItems || []).toEqual([]);
        expect(latestRender.activeItem).toBeNull();
        expect(setTimelineMediaMarkers.mock.calls.at(-1)?.[0] || []).toEqual([]);
    });

    it("keeps the thumbnail window stable when selecting an item already away from the rail edge", async () => {
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
        globalThis.document.getElementById = vi.fn((id) => (id === "timeline-slider" ? slider : null));
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        const photos = Array.from({ length: 90 }, (_, index) => {
            const hour = 12 + Math.floor(index / 60);
            const minute = index % 60;
            return {
                time: `2026-04-02 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
                file: `photo-${index}.jpg`,
                title: `Photo ${index}`,
                enabled: true,
            };
        });
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "-04:00",
            photos,
        });
        const coordination = createMediaTimelineCoordination();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T17:00:00Z"),
        });
        await flushPromises(8);
        const initialRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        const initialFirstId = initialRender.thumbnailItems[0]?.id;

        mocks.panelIntentHandler?.({ type: "previewItem", value: "photo-62.jpg" });
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T17:02:00Z"),
        });

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.thumbnailItems[0]?.id).toBe(initialFirstId);
        expect(latestRender.thumbnailItems.find((item) => item.id === "photo-62.jpg")).toEqual(
            expect.objectContaining({ active: true }),
        );
    });

    it("downgrades explicit media selection back to time proximity when mission time moves away", async () => {
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
        globalThis.document.getElementById = vi.fn((id) => (id === "timeline-slider" ? slider : null));
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
                    file: "photo-0.jpg",
                    title: "Photo 0",
                    enabled: true,
                },
                {
                    time: "2026-04-02 12:10:00",
                    file: "photo-10.jpg",
                    title: "Photo 10",
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
            animTime: Date.parse("2026-04-02T16:05:00Z"),
        });
        await flushPromises(8);

        const initialRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(initialRender.activeItem).toEqual(expect.objectContaining({
            id: "photo-0.jpg",
            focusSource: "time-proximity",
            explicit: false,
        }));

        mocks.panelIntentHandler?.({ type: "selectItem", value: "photo-0.jpg" });
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:00:00Z"),
        });
        const selectedRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(selectedRender.activeItem).toEqual(expect.objectContaining({
            id: "photo-0.jpg",
            focusSource: "user-selection",
            explicit: true,
        }));

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:10:00Z"),
        });
        const movedRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(movedRender.activeItem).toEqual(expect.objectContaining({
            id: "photo-10.jpg",
            focusSource: "time-proximity",
            explicit: false,
        }));
    });

    it("keeps explicit selected media pinned while that media still covers mission time", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-02T09:00:00Z"));
        slider.max = String(Date.parse("2026-04-02T12:30:00Z"));
        slider.value = String(Date.parse("2026-04-02T10:30:00Z"));
        slider.dataset = {
            currentTimeMs: String(Date.parse("2026-04-02T10:30:00Z")),
        };
        slider.dispatchEvent = vi.fn();
        globalThis.HTMLInputElement = FakeInput;
        globalThis.Event = class {
            constructor(type) {
                this.type = type;
            }
        };
        globalThis.document.getElementById = vi.fn((id) => (id === "timeline-slider" ? slider : null));
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaBase: "https://media.example/",
            timelineTimezoneOffset: "+00:00",
            photos: [
                {
                    time: "2026-04-02 10:00:00",
                    file: "a.mp4",
                    title: "Video A",
                    enabled: true,
                    video: true,
                    durationSeconds: 7200,
                },
                {
                    time: "2026-04-02 10:30:00",
                    file: "b.mp4",
                    title: "Video B",
                    enabled: true,
                    video: true,
                    durationSeconds: 3600,
                },
                {
                    time: "2026-04-02 11:00:00",
                    file: "still.jpg",
                    title: "Image C",
                    enabled: true,
                },
            ],
            audio: [
                {
                    time: "2026-04-02 10:45:00",
                    file: "audio/d.mp3",
                    desc: "Audio D",
                    enabled: true,
                    durationSeconds: 900,
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-02T09:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-02T12:30:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T10:30:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "a.mp4" });
        const selectedRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(selectedRender.activeItem).toEqual(expect.objectContaining({
            id: "a.mp4",
            focusSource: "user-selection",
            explicit: true,
        }));

        slider.value = String(Date.parse("2026-04-02T11:00:00Z"));
        slider.dataset.currentTimeMs = String(Date.parse("2026-04-02T11:00:00Z"));
        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T11:00:00Z"),
        });
        const pinnedRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(pinnedRender.activeItem).toEqual(expect.objectContaining({
            id: "a.mp4",
            focusSource: "user-selection",
            explicit: true,
        }));
        expect(pinnedRender.activeItem?.id).not.toBe("still.jpg");
    });

    it("uses the filtered media scroller as explicit selection without autoplaying clips", async () => {
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
        const AudioMock = vi.fn();
        globalThis.Audio = AudioMock;
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
        const playAnimation = vi.fn();
        const coordination = createMediaTimelineCoordination({
            playAnimation,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });
        const audioStartMs = Date.parse("2026-04-02T16:30:00Z");

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-02T16:31:00Z"),
        });
        await flushPromises(8);
        mocks.panelIntentHandler?.({ type: "toggleMediaKind", value: "audioClip" });

        mocks.panelIntentHandler?.({ type: "selectAdjacentItem", value: "next" });

        expect(Number(slider.value)).toBe(Date.parse("2026-04-02T16:31:00Z"));
        expect(sliderEvents).toEqual(["input", "change"]);
        expect(AudioMock).not.toHaveBeenCalled();
        expect(playAnimation).not.toHaveBeenCalled();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: audioStartMs,
        });
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.activeItem).toEqual(expect.objectContaining({
            id: "audio:audio/clip.mp3",
            kind: "audioClip",
        }));
        expect(latestRender.navigationModel).toEqual(expect.objectContaining({
            positionLabel: "1 of 1",
        }));
        expect(latestRender.playbackModel).toEqual(expect.objectContaining({
            showControls: true,
            playing: false,
        }));
    });
});
