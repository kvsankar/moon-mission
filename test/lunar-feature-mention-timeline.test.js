import { describe, expect, it } from "vitest";

import {
    normalizeLunarFeatureMentionTimeline,
    resolveLunarFeatureMentionView,
} from "../src/platform/js/core/domain/lunar-feature-mention-timeline.js";

const timeline = normalizeLunarFeatureMentionTimeline({
    streamStartTime: "2026-04-06T16:58:14Z",
    defaults: {
        visibleWindowSeconds: 300,
        activeLeadSeconds: 10,
        activeTrailSeconds: 20,
    },
    features: {
        glushko_crater: {
            displayName: "Glushko",
            catalogName: "Glushko",
        },
        ohm_crater: {
            displayName: "Ohm",
            catalogName: "Ohm",
        },
    },
    mentions: [
        {
            timeSeconds: 100,
            featureSlugs: ["glushko_crater"],
            speaker: "Crew",
        },
        {
            timeSeconds: 130,
            featureSlugs: ["glushko_crater", "ohm_crater"],
            speaker: "Ground",
        },
        {
            timeSeconds: 500,
            featureSlugs: ["ohm_crater"],
            speaker: "Ground",
        },
    ],
});

describe("lunar feature mention timeline", () => {
    it("builds a centered rolling window and highlights active feature mentions", () => {
        const view = resolveLunarFeatureMentionView(timeline, {
            currentTimeMs: Date.parse("2026-04-06T17:00:34Z"),
            missionStartMs: Date.parse("2026-04-02T01:58:33Z"),
        });

        expect(view.items.map((item) => item.timeSeconds)).toEqual([100, 130]);
        expect(view.activeItems.map((item) => item.timeSeconds)).toEqual([130]);
        expect(view.activeFeatureSlugs).toEqual(["glushko_crater", "ohm_crater"]);
        expect(view.activeCatalogNames).toEqual(["Glushko", "Ohm"]);
        expect(view.items[1].featureLabel).toBe("Glushko, Ohm");
        expect(view.items[1].metLabel).toMatch(/^MET \+/);
    });
});
