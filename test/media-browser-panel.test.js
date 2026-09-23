import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createMediaBrowserPanelActions,
    resolveRangeValueAtClientX,
} from "../src/platform/js/app/media-browser-panel.js";
import {
    FakeElement,
    FakePanel,
    FakeRangeInput,
    clearMediaBrowserPanelGlobals,
} from "./helpers/media-browser-panel-harness.js";

describe("media browser timeline and player intents", () => {
    afterEach(clearMediaBrowserPanelGlobals);

    function retryFixture() {
        const retry = new FakeRangeInput(), panelElement = new FakePanel(), intents = [];
        global.window = { innerWidth: 1280, innerHeight: 800 };
        global.document = { getElementById(id) {
            if (id === "media-browser-panel") return panelElement;
            if (id === "media-browser-manifest-retry") return retry;
            return null;
        }, addEventListener() {}, dispatchEvent() {} };
        return { retry, intents, panel: createMediaBrowserPanelActions({ onIntent: intent => intents.push(intent) }) };
    }

    it("routes the visible manifest Retry button through the panel intent boundary", () => {
        const h = retryFixture();
        h.panel.render({ manifestRetryAvailable: true, statusText: "Could not load" });
        expect(h.retry.hidden).toBe(false);
        expect(h.retry.disabled).toBe(false);
        h.retry.dispatchEvent({ type: "click" });
        expect(h.intents).toEqual([{ type: "retryManifest" }]);
    });

    it("hides and disables Retry when only its availability changes", () => {
        const h = retryFixture();
        h.panel.render({ manifestRetryAvailable: true, statusText: "Status" });
        h.panel.render({ manifestRetryAvailable: false, statusText: "Status" });
        expect(h.retry.hidden).toBe(true);
        expect(h.retry.disabled).toBe(true);
    });

    it("resolves clicked range positions to stepped media seconds", () => {
        const slider = new FakeRangeInput();
        slider.min = "0";
        slider.max = "100";
        slider.step = "0.25";

        expect(resolveRangeValueAtClientX(slider, 100)).toBe(0);
        expect(resolveRangeValueAtClientX(slider, 388)).toBe(72);
        expect(resolveRangeValueAtClientX(slider, 600)).toBe(100);
    });

    it("emits media seek intents on direct pointer clicks", () => {
        const slider = new FakeRangeInput();
        const panelElement = new FakePanel();
        const intents = [];

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
        };
        global.document = {
            getElementById(id) {
                if (id === "media-browser-media-timeline") return slider;
                if (id === "media-browser-panel") return panelElement;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions({
            onIntent(intent) {
                intents.push(intent);
            },
        });

        panel.render({
            playbackModel: {
                showControls: true,
                seekEnabled: true,
                elapsedSeconds: 0,
                durationSeconds: 100,
            },
        });

        slider.dispatchEvent({
            type: "pointerdown",
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
        });
        slider.dispatchEvent({
            type: "pointerup",
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
        });

        expect(intents).toEqual([
            { type: "mediaSeekTime", value: 50, finalize: false },
            { type: "mediaSeekTime", value: 50, finalize: true },
        ]);
        expect(slider.value).toBe("50");
        expect(slider.capturedPointerId).toBeUndefined();
    });

    it("suppresses duplicate native seek events after pointer seeking", () => {
        const slider = new FakeRangeInput();
        const panelElement = new FakePanel();
        const intents = [];

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
        };
        global.document = {
            getElementById(id) {
                if (id === "media-browser-media-timeline") return slider;
                if (id === "media-browser-panel") return panelElement;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions({
            onIntent(intent) {
                intents.push(intent);
            },
        });

        panel.render({
            playbackModel: {
                showControls: true,
                seekEnabled: true,
                elapsedSeconds: 0,
                durationSeconds: 100,
            },
        });

        slider.dispatchEvent({
            type: "pointerdown",
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
        });
        slider.dispatchEvent({ type: "input" });
        slider.dispatchEvent({
            type: "pointerup",
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
        });
        slider.dispatchEvent({ type: "change" });

        expect(intents).toEqual([
            { type: "mediaSeekTime", value: 50, finalize: false },
            { type: "mediaSeekTime", value: 50, finalize: true },
        ]);
    });

    it("updates playback controls without rerunning structural preview work", () => {
        const panelElement = new FakePanel();
        const stage = new FakeElement("div");
        const image = new FakeElement("img");
        const status = new FakeElement("span");
        const elapsed = new FakeElement("span");
        const slider = new FakeRangeInput();
        stage.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            right: 640,
            top: 0,
            bottom: 360,
            width: 640,
            height: 360,
        }));
        const nodes = new Map([
            ["media-browser-panel", panelElement],
            ["media-browser-stage", stage],
            ["media-browser-image", image],
            ["media-browser-media-status", status],
            ["media-browser-media-elapsed", elapsed],
            ["media-browser-media-timeline", slider],
        ]);

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
        };
        global.document = {
            getElementById(id) {
                return nodes.get(id) || null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        const viewModel = {
            panelTitle: "Mission Media",
            activeItem: {
                id: "image-0",
                kind: "image",
                title: "Image 0",
                assetUrl: "image-0.jpg",
                timeLabel: "Apr 2, 2026",
            },
            playbackModel: {
                showControls: true,
                seekEnabled: true,
                elapsedSeconds: 0,
                durationSeconds: 10,
                statusLabel: "Ready",
            },
            thumbnailItems: [],
        };

        panel.render(viewModel);
        expect(image.src).toBe("image-0.jpg");
        expect(status.textContent).toBe("Ready");
        expect(stage.getBoundingClientRect).toHaveBeenCalled();

        stage.getBoundingClientRect.mockClear();
        panel.render({
            ...viewModel,
            playbackModel: {
                ...viewModel.playbackModel,
                elapsedSeconds: 3,
                statusLabel: "Playing",
            },
        });

        expect(stage.getBoundingClientRect).not.toHaveBeenCalled();
        expect(image.src).toBe("image-0.jpg");
        expect(status.textContent).toBe("Playing");
        expect(elapsed.textContent).toBe("00:03 / 00:10");
        expect(slider.value).toBe("3");
    });

    it("does not reload a native video source that is already attached for playback", () => {
        const panelElement = new FakePanel();
        const video = new FakeElement("video");
        video.src = "https://media.example/clip.mp4";
        video.load = vi.fn();
        video.pause = vi.fn();

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-video") return video;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        panel.render({
            activeItem: {
                id: "clip.mp4",
                kind: "videoClip",
                title: "Crew clip",
                videoAssetUrl: "https://media.example/clip.mp4",
                sourceType: "mp4",
            },
        });

        expect(video.load).not.toHaveBeenCalled();
        expect(video.src).toBe("https://media.example/clip.mp4");
        expect(video.dataset).toEqual(expect.objectContaining({
            mediaItemId: "clip.mp4",
            mediaSourceUrl: "https://media.example/clip.mp4",
            sourceType: "mp4",
        }));
        expect(video.hidden).toBe(false);
    });

    it("keeps media filters collapsed until the filter button opens the drawer", () => {
        const panelElement = new FakePanel();
        panelElement.offsetHeight = 520;
        const filterToggle = new FakeElement("button");
        const filterDrawer = new FakeElement("div");
        filterDrawer.hidden = true;
        filterDrawer.clientHeight = 120;
        const filterBar = new FakeElement("div");
        const search = new FakeElement("input");
        const summary = new FakeElement("div");

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-filter-toggle") return filterToggle;
                if (id === "media-browser-filter-drawer") return filterDrawer;
                if (id === "media-browser-filter-bar") return filterBar;
                if (id === "media-browser-search") return search;
                if (id === "media-browser-filter-summary") return summary;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        panel.render({
            filterModel: {
                totalCount: 4,
                matchCount: 2,
                matchKindCounts: { image: 2, audioClip: 0, videoClip: 0 },
                kindPillOptions: [
                    { id: "all", label: "All", count: 4, active: false },
                    { id: "image", label: "Images", count: 2, active: true },
                ],
                subjectOptions: [
                    { id: "all", label: "All", count: 2, active: true },
                ],
                cameraButtonOptions: [
                    { id: "all", label: "All", count: 2, active: true },
                ],
            },
        });

        expect(filterDrawer.hidden).toBe(true);
        expect(filterToggle.textContent).toBe("Filters 1");
        expect(filterToggle.attributes["aria-expanded"]).toBe("false");
        expect(summary.textContent).toContain("2 of 4 media files");
        expect(filterToggle.listeners.get("click")?.length).toBe(1);

        panelElement.classList.remove("media-browser-panel--hidden");
        filterToggle.dispatchEvent({ type: "click" });

        expect(filterDrawer.hidden).toBe(false);
        expect(filterToggle.attributes["aria-expanded"]).toBe("true");
        expect(filterDrawer.style.getPropertyValue("maxHeight")).toBe("");
        expect(filterDrawer.style.maxHeight).toBeTruthy();
    });
});
