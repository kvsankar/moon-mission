import { describe, expect, it, vi } from "vitest";
import { createMediaBrowserVideoSource } from "../src/platform/js/app/media-browser-video-source.js";

function createVideo() {
    const attributes = new Map();
    return {
        dataset: {},
        currentTime: 12,
        getAttribute: name => attributes.get(name) || null,
        removeAttribute: vi.fn(name => attributes.delete(name)),
        load: vi.fn(),
        pause: vi.fn(),
        canPlayType: vi.fn(() => ""),
    };
}

const item = {
    id: "flyby-stream",
    videoAssetUrl: "https://example.test/flyby.m3u8",
    sourceType: "hls",
};

describe("media browser video-source ownership", () => {
    it("invalidates a pending HLS attachment when the selected source is cleared", async () => {
        let finishLoad;
        const loadHlsLibraryFn = vi.fn(() => new Promise(resolve => { finishLoad = resolve; }));
        const onIntent = vi.fn();
        const video = createVideo();
        const source = createMediaBrowserVideoSource({ loadHlsLibraryFn, onIntent });

        source.configureVideoSource(video, item);
        expect(video.dataset.mediaSourceUrl).toBe(item.videoAssetUrl);
        source.clearVideoSource(video);
        const Hls = vi.fn();
        Hls.isSupported = () => true;
        finishLoad(Hls);
        await Promise.resolve();
        await Promise.resolve();

        expect(Hls).not.toHaveBeenCalled();
        expect(video.dataset.mediaSourceUrl).toBe("");
        expect(onIntent).not.toHaveBeenCalled();
    });

    it("publishes readiness from the current attached HLS source and disposes it", async () => {
        const listeners = new Map();
        const instance = {
            on: vi.fn((event, handler) => listeners.set(event, handler)),
            attachMedia: vi.fn(),
            loadSource: vi.fn(),
            startLoad: vi.fn(),
            destroy: vi.fn(),
        };
        const Hls = vi.fn(function FakeHls() { return instance; });
        Hls.isSupported = () => true;
        Hls.Events = { MEDIA_ATTACHED: "attached", MANIFEST_PARSED: "parsed", ERROR: "error" };
        const onIntent = vi.fn();
        const video = createVideo();
        const source = createMediaBrowserVideoSource({ loadHlsLibraryFn: () => Promise.resolve(Hls), onIntent });

        source.configureVideoSource(video, item);
        await vi.waitFor(() => expect(instance.attachMedia).toHaveBeenCalledWith(video));
        listeners.get("attached")();
        expect(instance.loadSource).toHaveBeenCalledWith(item.videoAssetUrl);
        listeners.get("parsed")();
        expect(onIntent).toHaveBeenCalledWith(expect.objectContaining({
            type: "mediaVideoSourceReady",
            value: item.id,
            mediaElement: video,
        }));

        source.clearVideoSource(video);
        expect(instance.destroy).toHaveBeenCalledTimes(1);
    });
});
