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

async function flushPromises(count = 1) {
    for (let index = 0; index < count; index += 1) {
        await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function createDocumentStub() {
    return {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        getElementById: vi.fn(() => null),
    };
}

function createMissionConfig({ mediaEnabled } = {}) {
    return {
        mission_name: "Test Mission",
        ui: {
            panels: {
                defaults: {
                    "workflow:media-browser": {
                        enabled: mediaEnabled,
                        defaultState: "closed",
                    },
                },
            },
        },
    };
}

function createAudioMock() {
    const instances = [];
    class FakeAudio {
        constructor(src) {
            this.src = src;
            this.currentTime = 0;
            this.volume = 1;
            this.ended = false;
            this.listeners = new Map();
            this.play = vi.fn(() => Promise.resolve());
            this.pause = vi.fn();
            instances.push(this);
        }

        addEventListener(type, handler) {
            const handlers = this.listeners.get(type) || [];
            handlers.push(handler);
            this.listeners.set(type, handlers);
        }

        emit(type) {
            for (const handler of this.listeners.get(type) || []) {
                handler();
            }
        }
    }
    return {
        AudioMock: vi.fn((src) => new FakeAudio(src)),
        instances,
    };
}

describe("createMediaTimelineCoordination", () => {
    let originalDocument;
    let originalEvent;
    let originalHtmlInputElement;
    let originalWindow;
    let originalAudio;
    let originalHls;

    beforeEach(() => {
        originalDocument = globalThis.document;
        originalEvent = globalThis.Event;
        originalHtmlInputElement = globalThis.HTMLInputElement;
        originalWindow = globalThis.window;
        originalAudio = globalThis.Audio;
        originalHls = globalThis.Hls;
        globalThis.document = createDocumentStub();
        mocks.getMissionMediaDataPath.mockReset();
        mocks.getMissionMediaDataPath.mockReturnValue("assets/artemis2/data/");
        mocks.loadMissionMediaManifest.mockReset();
        mocks.panelRender.mockReset();
        mocks.panelSetMissionContext.mockReset();
        mocks.panelSetPanelState.mockReset();
        mocks.panelIntentHandler = null;
    });

    afterEach(() => {
        vi.useRealTimers();
        globalThis.document = originalDocument;
        globalThis.Event = originalEvent;
        globalThis.HTMLInputElement = originalHtmlInputElement;
        globalThis.window = originalWindow;
        globalThis.Audio = originalAudio;
        globalThis.Hls = originalHls;
    });

    it("does not load or bind mission media when the workflow panel is not enabled by config", () => {
        const setTimelineMediaMarkers = vi.fn();
        const coordination = createMediaTimelineCoordination({
            setTimelineMediaMarkers,
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: false }),
            animTime: 1234,
        });

        expect(mocks.loadMissionMediaManifest).not.toHaveBeenCalled();
        expect(globalThis.document.addEventListener).not.toHaveBeenCalled();
        expect(setTimelineMediaMarkers).toHaveBeenCalledWith([]);
        expect(mocks.panelSetMissionContext).toHaveBeenCalledWith(expect.objectContaining({
            available: false,
            mediaCount: 0,
        }));
        expect(mocks.panelRender).toHaveBeenCalledWith(expect.objectContaining({
            statusText: "Mission media is disabled for this mission.",
        }));
    });

    it("loads and binds mission media when the workflow panel is explicitly enabled", () => {
        mocks.loadMissionMediaManifest.mockResolvedValue(null);
        const coordination = createMediaTimelineCoordination();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: 1234,
        });

        expect(mocks.loadMissionMediaManifest).toHaveBeenCalledTimes(1);
        expect(globalThis.document.addEventListener).toHaveBeenCalledWith(
            "mission-media-marker-select",
            expect.any(Function),
        );
    });

    it("includes mediaStreams entries as playable video items in the panel list", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(Date.parse("2026-04-06T17:30:00Z"));
        slider.dataset = {
            currentTimeMs: String(Date.parse("2026-04-06T17:30:00Z")),
        };
        slider.dispatchEvent = vi.fn((event) => {
            if (event.type === "input" || event.type === "change") {
                slider.value = String(slider.dataset.programmaticSeekTimeMs || slider.value);
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
        const setTimelineMediaMarkers = vi.fn();
        const coordination = createMediaTimelineCoordination({
            setTimelineMediaMarkers,
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T16:58:14Z"),
        });
        await flushPromises(8);

        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.mediaCountLabel).toBe("1");
        expect(latestRender.thumbnailItems).toContainEqual(expect.objectContaining({
            id: "lunar-flyby-stream",
        }));

        const latestMarkers = setTimelineMediaMarkers.mock.calls.at(-1)?.[0] || [];
        expect(latestMarkers).toContainEqual(expect.objectContaining({
            id: "lunar-flyby-stream",
            mediaKind: "videoClip",
        }));
    });

    it("skips unchanged panel context, panel render, and media marker updates on repeated animation ticks", async () => {
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaItems: [
                {
                    id: "crew-photo",
                    title: "Crew Photo",
                    kind: "image",
                    assetUrl: "../media/crew.jpg",
                    thumbnailAssetUrl: "../media/thumbs/crew.jpg",
                    startTime: "2026-04-06T16:58:14Z",
                    sourceLabel: "NASA",
                },
            ],
        });
        const setTimelineMediaMarkers = vi.fn();
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
            setTimelineMediaMarkers,
        });
        const context = {
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T16:58:14Z"),
        };

        coordination.update(context);
        await flushPromises(8);
        mocks.panelSetMissionContext.mockClear();
        mocks.panelRender.mockClear();
        setTimelineMediaMarkers.mockClear();

        coordination.update(context);

        expect(mocks.panelSetMissionContext).not.toHaveBeenCalled();
        expect(mocks.panelRender).not.toHaveBeenCalled();
        expect(setTimelineMediaMarkers).not.toHaveBeenCalled();
    });

    it("refreshes panel mission context when the mission config object changes", async () => {
        globalThis.window = {
            missionConfig: {
                dataPath: "assets/artemis2/data",
            },
        };
        mocks.loadMissionMediaManifest.mockResolvedValue({
            mediaItems: [
                {
                    id: "crew-photo",
                    title: "Crew Photo",
                    kind: "image",
                    assetUrl: "../media/crew.jpg",
                    thumbnailAssetUrl: "../media/thumbs/crew.jpg",
                    startTime: "2026-04-06T16:58:14Z",
                    sourceLabel: "NASA",
                },
            ],
        });
        const coordination = createMediaTimelineCoordination();
        const firstConfig = createMissionConfig({ mediaEnabled: true });
        const secondConfig = createMissionConfig({ mediaEnabled: true });
        const animTime = Date.parse("2026-04-06T16:58:14Z");

        coordination.update({
            globalConfig: firstConfig,
            animTime,
        });
        await flushPromises(8);
        mocks.panelSetMissionContext.mockClear();

        coordination.update({
            globalConfig: firstConfig,
            animTime,
        });
        expect(mocks.panelSetMissionContext).not.toHaveBeenCalled();

        coordination.update({
            globalConfig: secondConfig,
            animTime,
        });
        expect(mocks.panelSetMissionContext).toHaveBeenCalledWith(expect.objectContaining({
            configData: secondConfig,
            mediaCount: 1,
        }));
    });

    it("does not start a background-role stream in the foreground Mission Media player", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = String(Date.parse("2026-04-06T17:30:00Z"));
        slider.dataset = {
            currentTimeMs: String(Date.parse("2026-04-06T17:30:00Z")),
        };
        slider.dispatchEvent = vi.fn();
        const video = {
            dataset: {},
            src: "",
            currentTime: 0,
            getAttribute(name) {
                return name === "src" ? this.src : "";
            },
            play: vi.fn(() => Promise.resolve()),
            pause: vi.fn(),
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
                    playbackRoles: ["background"],
                    backgroundPlayback: {
                        enabled: true,
                    },
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T17:30:00Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "lunar-flyby-stream" });
        mocks.panelIntentHandler?.({ type: "toggleActiveMediaPlayback" });
        await flushPromises(2);

        expect(video.play).not.toHaveBeenCalled();
        expect(video.dataset.mediaItemId || "").toBe("");
        expect(slider.dispatchEvent).not.toHaveBeenCalled();
        expect(Number(slider.dataset.currentTimeMs)).toBe(Date.parse("2026-04-06T17:30:00Z"));
        const latestRender = mocks.panelRender.mock.calls.at(-1)?.[0] || {};
        expect(latestRender.mediaCountLabel).toBe("0");
        expect(latestRender.activeItem).toBeNull();
        expect(latestRender.thumbnailItems || []).toEqual([]);
        expect(latestRender.playbackModel).toEqual(expect.objectContaining({
            playable: false,
            showControls: false,
        }));
    });

    it("leaves HLS stream attachment to the media panel while preserving source metadata", async () => {
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
            paused: true,
            canPlayType: vi.fn(() => ""),
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
        const hlsInstance = {
            attachMedia: vi.fn(),
            loadSource: vi.fn(),
            destroy: vi.fn(),
            on: vi.fn(),
        };
        const HlsMock = vi.fn(() => hlsInstance);
        HlsMock.isSupported = vi.fn(() => true);
        HlsMock.Events = {
            MANIFEST_PARSED: "MANIFEST_PARSED",
        };
        globalThis.Hls = HlsMock;

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
            mediaStreams: [
                {
                    id: "lunar-flyby-stream",
                    title: "Lunar Flyby Stream",
                    enabled: true,
                    streamKind: "video",
                    sourceType: "hls",
                    sourceUrl: "../media/streams/lunar-flyby/v1/master.m3u8",
                    posterAsset: "assets/artemis2/media/streams/lunar-flyby/v1/poster.jpg",
                    startTime: "2026-04-06T16:58:14Z",
                    endTime: "2026-04-07T03:08:14.130Z",
                },
            ],
        });
        const coordination = createMediaTimelineCoordination({
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T16:58:14Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "lunar-flyby-stream" });
        mocks.panelIntentHandler?.({ type: "toggleActiveMediaPlayback" });
        await flushPromises(2);

        expect(HlsMock).not.toHaveBeenCalled();
        expect(hlsInstance.attachMedia).not.toHaveBeenCalled();
        expect(hlsInstance.loadSource).not.toHaveBeenCalled();
        expect(video.play).not.toHaveBeenCalled();
        expect(video.dataset).toEqual(expect.objectContaining({
            mediaItemId: "lunar-flyby-stream",
            mediaSourceUrl: "assets/artemis2/data/../media/streams/lunar-flyby/v1/master.m3u8",
            sourceType: "hls",
        }));
        expect(video.src).toBe("");

        video.src = "blob:hls-stream";
        mocks.panelIntentHandler?.({
            type: "mediaVideoSourceReady",
            value: "lunar-flyby-stream",
            mediaKind: "videoClip",
            currentTime: 0,
        });
        await flushPromises(2);

        expect(video.play).toHaveBeenCalledTimes(1);
    });

    it("does not reinitialize HLS attachment from timeline rerenders for the same stream", async () => {
        class FakeInput {}
        const slider = new FakeInput();
        slider.min = String(Date.parse("2026-04-01T00:00:00Z"));
        slider.max = String(Date.parse("2026-04-08T00:00:00Z"));
        slider.value = "";
        slider.dataset = { currentTimeMs: String(Date.parse("2026-04-06T16:58:14Z")) };
        slider.dispatchEvent = vi.fn();
        const video = {
            dataset: {},
            src: "",
            poster: "",
            currentTime: 0,
            paused: true,
            canPlayType: vi.fn(() => ""),
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
        const hlsInstance = {
            attachMedia: vi.fn(),
            loadSource: vi.fn(),
            destroy: vi.fn(),
            on: vi.fn(),
        };
        const HlsMock = vi.fn(() => hlsInstance);
        HlsMock.isSupported = vi.fn(() => true);
        HlsMock.Events = {
            MANIFEST_PARSED: "MANIFEST_PARSED",
        };
        globalThis.Hls = HlsMock;

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
        const coordination = createMediaTimelineCoordination({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
            getAnimationSpeedMultiplier: () => 1,
            getStartTime: () => Date.parse("2026-04-01T00:00:00Z"),
            getLatestEndTime: () => Date.parse("2026-04-08T00:00:00Z"),
        });

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T16:58:14Z"),
        });
        await flushPromises(8);

        mocks.panelIntentHandler?.({ type: "selectItem", value: "lunar-flyby-stream" });
        mocks.panelIntentHandler?.({ type: "startActiveMediaFromBeginning" });
        await flushPromises(2);
        expect(HlsMock).not.toHaveBeenCalled();

        coordination.update({
            globalConfig: createMissionConfig({ mediaEnabled: true }),
            animTime: Date.parse("2026-04-06T17:00:14Z"),
        });
        await flushPromises(2);

        expect(HlsMock).not.toHaveBeenCalled();
        expect(hlsInstance.attachMedia).not.toHaveBeenCalled();
        expect(hlsInstance.loadSource).not.toHaveBeenCalled();
        expect(video.load).not.toHaveBeenCalled();
    });

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

        mocks.panelIntentHandler?.({
            type: "mediaPlaybackPaused",
            value: "clip.mp4",
            mediaKind: "videoClip",
            currentTime: 7,
            mediaElement: {
                ended: false,
                readyState: 2,
                networkState: 2,
                seeking: false,
            },
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
