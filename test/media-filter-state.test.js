import { describe, expect, it } from "vitest";

import {
    buildMediaFilterModel,
    filterMediaItems,
    resolveMediaFilterIntent,
} from "../src/platform/js/core/domain/media-filter-state.js";

const ITEMS = [
    {
        id: "a",
        enabled: true,
        kind: "image",
        crewCaptured: true,
        external: false,
        batch: 2,
        cameraId: "iphone",
        cameraLabel: "Crew iPhone",
        tags: ["gloves", "orange suit"],
        subjects: ["suited crew member", "gloved hands"],
        sceneType: "crew",
    },
    {
        id: "b",
        enabled: true,
        kind: "image",
        crewCaptured: false,
        external: true,
        batch: 1,
        cameraId: "d5",
        cameraLabel: "D5 #1",
        tags: ["craters"],
        subjects: ["Moon"],
        bodies: ["Moon"],
        mainBody: "Moon",
        sceneType: "moon",
    },
    {
        id: "c",
        enabled: false,
        kind: "audioClip",
        crewCaptured: false,
        external: true,
        batch: 0,
        cameraId: "audio",
        cameraLabel: "Audio",
    },
    {
        id: "e",
        enabled: true,
        kind: "audioClip",
        crewCaptured: false,
        external: false,
        batch: 1,
        cameraId: "",
        cameraLabel: "",
        mainBody: "Sun",
    },
    {
        id: "d",
        enabled: true,
        kind: "videoClip",
        crewCaptured: true,
        external: false,
        batch: 1,
        cameraId: "z9",
        cameraLabel: "Z9",
        description: "A crew video near Earth through a spacecraft window.",
    },
    {
        id: "f",
        enabled: true,
        kind: "image",
        crewCaptured: false,
        external: false,
        batch: 1,
        cameraId: "",
        cameraLabel: "",
        shortDescription: "A crew member looks through a spacecraft window.",
        subjects: ["spacecraft window"],
    },
];

describe("media filter state", () => {
    it("filters by audience and camera while ignoring disabled items", () => {
        expect(filterMediaItems(ITEMS, { audience: "crew" }).map((item) => item.id)).toEqual(["a", "d"]);
        expect(filterMediaItems(ITEMS, { audience: "external" }).map((item) => item.id)).toEqual(["b"]);
        expect(filterMediaItems(ITEMS, { cameraId: "d5" }).map((item) => item.id)).toEqual(["b"]);
    });

    it("matches upstream quick filters and multi-select camera buttons", () => {
        expect(filterMediaItems(ITEMS, { quick: "new" }).map((item) => item.id)).toEqual(["a", "d"]);
        expect(filterMediaItems(ITEMS, { quick: "exterior" }).map((item) => item.id)).toEqual(["b"]);
        expect(filterMediaItems(ITEMS, { quick: "videos" }).map((item) => item.id)).toEqual(["d"]);
        expect(filterMediaItems(ITEMS, { cameraIds: ["iphone", "z9"] }).map((item) => item.id)).toEqual(["a", "d"]);
    });

    it("filters by independently selectable subjects", () => {
        expect(filterMediaItems(ITEMS, { subjects: [] }).map((item) => item.id)).toEqual(["a", "b", "e", "d", "f"]);
        expect(filterMediaItems(ITEMS, { subjects: ["crew"] }).map((item) => item.id)).toEqual(["a", "d"]);
        expect(filterMediaItems(ITEMS, { subjects: ["space"] }).map((item) => item.id)).toEqual(["b"]);
        expect(filterMediaItems(ITEMS, { subjects: ["crew", "space"] }).map((item) => item.id)).toEqual(["a", "b", "d"]);
    });

    it("searches title, description, tags, subjects, bodies, and scene metadata", () => {
        expect(filterMediaItems(ITEMS, { query: "gloves" }).map((item) => item.id)).toEqual(["a"]);
        expect(filterMediaItems(ITEMS, { query: "window" }).map((item) => item.id)).toEqual(["f"]);
        expect(filterMediaItems(ITEMS, { query: "earth" }).map((item) => item.id)).toEqual([]);
        expect(filterMediaItems(ITEMS, { query: "sun" }).map((item) => item.id)).toEqual(["e"]);
        expect(filterMediaItems(ITEMS, { query: "moon craters" }).map((item) => item.id)).toEqual(["b"]);
        expect(filterMediaItems(ITEMS, { query: "crew", mediaKinds: ["image"] }).map((item) => item.id)).toEqual(["a", "f"]);
    });

    it("filters by independently selectable media kinds", () => {
        expect(filterMediaItems(ITEMS, { mediaKinds: ["image"] }).map((item) => item.id)).toEqual(["a", "b", "f"]);
        expect(filterMediaItems(ITEMS, { mediaKinds: ["audioClip"] }).map((item) => item.id)).toEqual(["e"]);
        expect(filterMediaItems(ITEMS, { mediaKinds: ["image", "audioClip"] }).map((item) => item.id)).toEqual(["a", "b", "e", "f"]);
        expect(filterMediaItems(ITEMS, { mediaKinds: [] }).map((item) => item.id)).toEqual([]);
    });

    it("builds UI-facing filter counts", () => {
        const model = buildMediaFilterModel(ITEMS, { audience: "all", cameraId: "all" });

        expect(model.subjectOptions.find((option) => option.id === "all")).toEqual(expect.objectContaining({
            count: 5,
            active: true,
        }));
        expect(model.subjectOptions.find((option) => option.id === "crew")?.count).toBe(2);
        expect(model.subjectOptions.find((option) => option.id === "new")).toBeUndefined();
        expect(model.subjectOptions.find((option) => option.id === "crew")?.label).toBe("Crew");
        expect(model.subjectOptions.find((option) => option.id === "space")?.label).toBe("Space");
        expect(model.videoOption.count).toBe(1);
        expect(model.matchCount).toBe(5);
        expect(model.totalCount).toBe(5);
        expect(model.matchKindCounts).toEqual({
            all: 5,
            image: 3,
            audioClip: 1,
            videoClip: 1,
        });
        expect(model.kindPillOptions.map((option) => [option.id, option.count, option.active])).toEqual([
            ["all", 5, true],
            ["image", 3, false],
            ["audioClip", 1, false],
            ["videoClip", 1, false],
        ]);
        expect(model.cameraOptions.map((option) => option.id)).toEqual(["all", "iphone", "d5", "z9"]);
        expect(model.cameraButtonOptions.map((option) => option.id)).toEqual(["all", "d5a", "d5b", "z9", "gopro", "iphone"]);
    });

    it("marks selected facet pills as active", () => {
        const model = buildMediaFilterModel(ITEMS, { mediaKinds: ["image", "videoClip"] });

        expect(model.subjectOptions.map((option) => [option.id, option.active])).toEqual([
            ["all", true],
            ["crew", false],
            ["space", false],
        ]);
        expect(model.kindPillOptions.map((option) => [option.id, option.active])).toEqual([
            ["all", false],
            ["image", true],
            ["audioClip", false],
            ["videoClip", true],
        ]);
    });

    it("marks multi-selected subject pills as active", () => {
        const model = buildMediaFilterModel(ITEMS, { subjects: ["crew", "space"] });

        expect(model.subjectOptions.map((option) => [option.id, option.active])).toEqual([
            ["all", false],
            ["crew", true],
            ["space", true],
        ]);
    });

    it("scopes facet counts by the other selected facets", () => {
        const crewModel = buildMediaFilterModel(ITEMS, { subjects: ["crew"] });

        expect(crewModel.matchCount).toBe(2);
        expect(crewModel.matchKindCounts).toEqual({
            all: 2,
            image: 1,
            audioClip: 0,
            videoClip: 1,
        });
        expect(crewModel.kindPillOptions.map((option) => [option.id, option.count, option.active])).toEqual([
            ["all", 2, true],
            ["image", 1, false],
            ["audioClip", 0, false],
            ["videoClip", 1, false],
        ]);

        const audioModel = buildMediaFilterModel(ITEMS, { mediaKinds: ["audioClip"] });

        expect(audioModel.matchCount).toBe(1);
        expect(audioModel.subjectOptions.map((option) => [option.id, option.count, option.active])).toEqual([
            ["all", 1, true],
            ["crew", 0, false],
            ["space", 0, false],
        ]);
        expect(audioModel.cameraButtonOptions.map((option) => [option.id, option.count, option.active])).toEqual([
            ["all", 1, true],
            ["d5a", 0, false],
            ["d5b", 0, false],
            ["z9", 0, false],
            ["gopro", 0, false],
            ["iphone", 0, false],
        ]);

        const cameraModel = buildMediaFilterModel(ITEMS, { cameraIds: ["z9"] });

        expect(cameraModel.matchCount).toBe(1);
        expect(cameraModel.kindPillOptions.map((option) => [option.id, option.count, option.active])).toEqual([
            ["all", 1, true],
            ["image", 0, false],
            ["audioClip", 0, false],
            ["videoClip", 1, false],
        ]);
        expect(cameraModel.subjectOptions.map((option) => [option.id, option.count, option.active])).toEqual([
            ["all", 1, true],
            ["crew", 1, false],
            ["space", 0, false],
        ]);
    });
});

describe("media filter intents", () => {
    it("selects a single kind from an unrestricted view and reports excluded audio", () => {
        const result = resolveMediaFilterIntent({ type: "toggleMediaKind", value: "videoClip" }, {
            quick: "all", mediaKinds: ["image", "audioClip", "videoClip"],
        });
        expect(result).toEqual({ handled: true, patch: {
            quick: "all", kind: "all", mediaKinds: ["videoClip"],
        }, stopAudioIfExcluded: true });
    });

    it("returns to all kinds when the last selected kind is toggled off", () => {
        const result = resolveMediaFilterIntent({ type: "toggleMediaKind", value: "image" }, {
            quick: "all", mediaKinds: ["image"],
        });
        expect(result.patch.mediaKinds).toEqual(["image", "audioClip", "videoClip"]);
        expect(result.stopAudioIfExcluded).toBe(false);
    });

    it("consumes invalid filter inputs without publishing a patch", () => {
        expect(resolveMediaFilterIntent({ type: "toggleSubject", value: "bogus" })).toEqual({ handled: true });
        expect(resolveMediaFilterIntent({ type: "unrelated" })).toEqual({ handled: false });
    });
});
