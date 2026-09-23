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

describe("media timeline manifest and stream publication", () => {
    beforeEach(() => setupMediaTimelineTest(mocks));
    afterEach(restoreMediaTimelineTest);

    it("keeps transient manifest failure retryable without an automatic request loop", async () => {
        let finishRetry;
        mocks.loadMissionMediaManifest.mockRejectedValueOnce(new Error("503"))
            .mockImplementationOnce(() => new Promise(resolve => { finishRetry = resolve; }));
        const coordination = createMediaTimelineCoordination();
        const context = { globalConfig: createMissionConfig({ mediaEnabled: true }), animTime: 1234 };
        coordination.update(context);
        await flushPromises(8);
        expect(mocks.panelRender.mock.calls.at(-1)[0]).toMatchObject({
            statusText: "Mission media could not be loaded.", manifestRetryAvailable: true,
        });
        expect(mocks.panelSetMissionContext.mock.calls.at(-1)[0].available).toBe(true);
        for (let i = 0; i < 3; i++) coordination.update(context);
        await flushPromises(8);
        expect(mocks.loadMissionMediaManifest).toHaveBeenCalledOnce();
        mocks.panelIntentHandler({ type: "retryManifest" });
        mocks.panelIntentHandler({ type: "retryManifest" });
        expect(mocks.loadMissionMediaManifest).toHaveBeenCalledTimes(2);
        expect(mocks.panelRender.mock.calls.at(-1)[0].manifestRetryAvailable).not.toBe(true);
        finishRetry({ ui: { panelTitle: "Recovered Mission Media" } });
        await flushPromises(8);
        expect(mocks.panelRender.mock.calls.at(-1)[0].panelTitle).toBe("Recovered Mission Media");
        expect(mocks.panelRender.mock.calls.at(-1)[0].manifestRetryAvailable).not.toBe(true);
        coordination.dispose();
    });

    it("keeps genuine manifest absence distinct from a retryable failure", async () => {
        mocks.loadMissionMediaManifest.mockResolvedValue(null);
        const coordination = createMediaTimelineCoordination();
        const context = { globalConfig: createMissionConfig({ mediaEnabled: true }), animTime: 1234 };
        coordination.update(context); await flushPromises(8);
        expect(mocks.panelRender.mock.calls.at(-1)[0].statusText).toMatch(/No media manifest/);
        expect(mocks.panelRender.mock.calls.at(-1)[0].manifestRetryAvailable).not.toBe(true);
        mocks.panelIntentHandler({ type: "retryManifest" });
        coordination.update(context); await flushPromises(8);
        expect(mocks.loadMissionMediaManifest).toHaveBeenCalledOnce();
        coordination.dispose();
    });

    it("ignores a late manifest from the previous mission URL", async () => {
        let finishA, finishB;
        mocks.loadMissionMediaManifest
            .mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; }));
        const coordination = createMediaTimelineCoordination();
        const context = { globalConfig: createMissionConfig({ mediaEnabled: true }), animTime: 1234 };
        coordination.update(context);
        mocks.getMissionMediaDataPath.mockReturnValue("assets/second/data/");
        coordination.update(context);
        expect(mocks.loadMissionMediaManifest).toHaveBeenCalledTimes(2);
        finishB({ ui: { panelTitle: "Second Mission" } }); await flushPromises(8);
        finishA({ ui: { panelTitle: "First Mission" } }); await flushPromises(8);
        expect(mocks.panelRender.mock.calls.at(-1)[0].panelTitle).toBe("Second Mission");
        coordination.dispose();
    });

    it("does not publish a retried manifest after coordinator disposal", async () => {
        let finishRetry;
        mocks.loadMissionMediaManifest.mockRejectedValueOnce(new Error("offline"))
            .mockImplementationOnce(() => new Promise(resolve => { finishRetry = resolve; }));
        const coordination = createMediaTimelineCoordination();
        coordination.update({ globalConfig: createMissionConfig({ mediaEnabled: true }), animTime: 1234 });
        await flushPromises(8);
        mocks.panelIntentHandler({ type: "retryManifest" });
        expect(mocks.loadMissionMediaManifest).toHaveBeenCalledTimes(2);
        coordination.dispose();
        mocks.panelRender.mockClear();
        finishRetry({ ui: { panelTitle: "Late" } }); await flushPromises(8);
        mocks.panelIntentHandler({ type: "retryManifest" });
        expect(mocks.panelRender).not.toHaveBeenCalled();
        expect(mocks.loadMissionMediaManifest).toHaveBeenCalledTimes(2);
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
        const HlsMock = vi.fn(function () { return hlsInstance; });
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
        const HlsMock = vi.fn(function () { return hlsInstance; });
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
});
