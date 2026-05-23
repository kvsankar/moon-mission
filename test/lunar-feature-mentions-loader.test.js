import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(value, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn(async () => value),
    };
}

describe("lunar-feature-mentions loader", () => {
    beforeEach(() => {
        vi.resetModules();
        global.window = {
            missionConfig: {
                missionName: "artemis2",
                dataPath: "https://assets.sankara.net/moon-mission/assets/artemis2/data/",
            },
            __MISSION_PAGE_PRESET: {
                folder: "artemis2",
            },
        };
        global.document = {
            baseURI: "http://127.0.0.1:7275/",
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete global.window;
        delete global.document;
    });

    it("falls back to app-local curated metadata when the remote asset host is missing it", async () => {
        const timeline = {
            streamStartTime: "2026-04-06T16:58:14Z",
            features: {
                grimaldi_crater: {
                    displayName: "Grimaldi",
                    catalogName: "Grimaldi",
                },
            },
            mentions: [
                {
                    timeSeconds: 1431.501,
                    featureSlugs: ["grimaldi_crater"],
                },
            ],
        };
        const fetchFn = vi.fn()
            .mockResolvedValueOnce(createJsonResponse({}, 404))
            .mockResolvedValueOnce(createJsonResponse(timeline));
        const { loadLunarFeatureMentionTimeline } = await import("../src/platform/js/data/lunar-feature-mentions.js");

        const loaded = await loadLunarFeatureMentionTimeline({ fetchFn });

        expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
            "https://assets.sankara.net/moon-mission/assets/artemis2/data/lunar-feature-mentions.json",
            "http://127.0.0.1:7275/assets/artemis2/data/lunar-feature-mentions.json",
        ]);
        expect(loaded.mentions).toHaveLength(1);
        expect(loaded.features.grimaldi_crater.displayName).toBe("Grimaldi");
        expect(loaded.mentions[0].featureSlugs).toEqual(["grimaldi_crater"]);
    });
});
