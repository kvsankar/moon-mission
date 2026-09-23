import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    buildTimelineEventInfos: vi.fn(({ config }) => [{ config }]),
}));
vi.mock("../src/platform/js/app/comparison-timeline.js", () => ({
    buildTimelineEventInfos: mocks.buildTimelineEventInfos,
}));

import { createMissionTimelineSource } from "../src/platform/js/app/mission-timeline-source.js";

describe("mission timeline source", () => {
    it("caches event projection by view inputs and publishes media markers", () => {
        mocks.buildTimelineEventInfos.mockClear();
        let config = "geo";
        const globalConfig = {};
        const eventInfos = [];
        const onMediaMarkersChanged = vi.fn();
        const source = createMissionTimelineSource({
            getConfig: () => config,
            getGlobalConfig: () => globalConfig,
            getPrimaryEventInfos: () => eventInfos,
            isCompareMode: false,
            onMediaMarkersChanged,
        });

        const first = source.getTimelineEventInfos();
        expect(source.getTimelineEventInfos()).toBe(first);
        config = "lunar";
        expect(source.getTimelineEventInfos()).not.toBe(first);
        expect(mocks.buildTimelineEventInfos).toHaveBeenCalledTimes(2);

        const markers = [{ id: "photo" }];
        source.setTimelineMediaMarkers(markers);
        expect(source.getTimelineMediaMarkers()).toBe(markers);
        source.setTimelineMediaMarkers(null);
        expect(source.getTimelineMediaMarkers()).toEqual([]);
        expect(onMediaMarkersChanged).toHaveBeenCalledTimes(2);
    });
});
