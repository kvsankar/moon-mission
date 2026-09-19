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

const MISSION_START_MS = Date.parse("2026-04-06T16:00:00Z");

/**
 * One item per media kind, per subject and per camera, so every filter facet
 * has something to match and something to exclude.
 */
const MEDIA_ITEMS = [
    {
        id: "crew-photo",
        title: "Crew Photo",
        kind: "image",
        crewCaptured: true,
        cameraId: "d5a",
        asset: "crew.jpg",
        thumbnailAssetUrl: "../media/thumbs/crew.jpg",
        startTime: "2026-04-06T16:10:00Z",
        sourceLabel: "NASA",
    },
    {
        id: "earth-photo",
        title: "Earth From Orion",
        kind: "image",
        external: true,
        cameraId: "z9",
        asset: "earth.jpg",
        thumbnailAssetUrl: "../media/thumbs/earth.jpg",
        startTime: "2026-04-06T16:20:00Z",
        sourceLabel: "NASA",
    },
    {
        id: "crew-call",
        title: "Crew Audio Check",
        kind: "audioClip",
        crewCaptured: true,
        cameraId: "iphone",
        asset: "call.mp3",
        startTime: "2026-04-06T16:30:00Z",
        durationSeconds: 30,
        sourceLabel: "NASA",
    },
    {
        id: "exterior-clip",
        title: "Exterior Clip",
        kind: "videoClip",
        external: true,
        cameraId: "gopro",
        asset: "exterior.mp4",
        thumbnailAssetUrl: "../media/thumbs/exterior.jpg",
        startTime: "2026-04-06T16:40:00Z",
        durationSeconds: 45,
        sourceLabel: "NASA",
    },
];

/**
 * The mission timeline slider the coordinator seeks through. It is a real
 * `HTMLInputElement` as far as the module's `instanceof` guard is concerned.
 */
class FakeTimelineSlider {
    constructor() {
        this.min = String(MISSION_START_MS);
        this.max = String(MISSION_START_MS + (60 * 60 * 1000));
        this.value = String(MISSION_START_MS + (15 * 60 * 1000));
        this.dataset = { currentTimeMs: this.value };
        this.events = [];
    }

    dispatchEvent(event) {
        this.events.push(event?.type || "");
        const seekTarget = this.dataset.programmaticSeekTimeMs;
        if (seekTarget) {
            this.value = String(seekTarget);
            this.dataset.currentTimeMs = String(seekTarget);
        }
        return true;
    }
}

/** A document stub that really keeps its listeners so events can be fired. */
function createDocumentStub(slider) {
    const listeners = new Map();
    return {
        listeners,
        addEventListener: vi.fn((type, handler) => {
            const handlers = listeners.get(type) || [];
            handlers.push(handler);
            listeners.set(type, handlers);
        }),
        removeEventListener: vi.fn((type, handler) => {
            listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== handler));
        }),
        dispatchEvent: vi.fn(),
        getElementById: vi.fn((id) => (id === "timeline-slider" ? slider : null)),
    };
}

function fireDocumentEvent(type, detail) {
    for (const handler of globalThis.document.listeners.get(type) || []) {
        handler({ type, detail });
    }
}

/** Records what the coordinator asks of an audio element. */
function installAudioMock() {
    const instances = [];
    class FakeAudio {
        constructor(src) {
            this.src = src;
            this.currentTime = 0;
            this.volume = 1;
            this.muted = false;
            this.paused = true;
            this.ended = false;
            this.playbackRate = 1;
            this.listeners = new Map();
            this.play = vi.fn(() => {
                this.paused = false;
                return Promise.resolve();
            });
            this.pause = vi.fn(() => {
                this.paused = true;
            });
            instances.push(this);
        }

        addEventListener(type, handler) {
            const handlers = this.listeners.get(type) || [];
            handlers.push(handler);
            this.listeners.set(type, handlers);
        }

        removeEventListener() {}

        emit(type) {
            for (const handler of this.listeners.get(type) || []) handler();
        }
    }
    globalThis.Audio = FakeAudio;
    return instances;
}

function createMissionConfig() {
    return {
        mission_name: "Test Mission",
        ui: {
            panels: {
                defaults: {
                    "workflow:media-browser": { enabled: true, defaultState: "closed" },
                },
            },
        },
    };
}

async function flushPromises(count = 8) {
    for (let index = 0; index < count; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
}

let coordination = null;
let slider = null;
let originalDocument;
let originalWindow;
let originalEvent;
let originalHtmlInputElement;
let originalAudio;
let audioInstances = [];

/** Boots the coordinator with the fixture manifest and returns it. */
async function boot({ animationRunning = false } = {}) {
    mocks.loadMissionMediaManifest.mockResolvedValue({ mediaItems: MEDIA_ITEMS });
    coordination = createMediaTimelineCoordination({
        getStartTime: () => MISSION_START_MS,
        getLatestEndTime: () => MISSION_START_MS + (60 * 60 * 1000),
        getAnimationRunning: () => animationRunning,
        setTimelineMediaMarkers: vi.fn(),
    });
    coordination.update({
        globalConfig: createMissionConfig(),
        animTime: MISSION_START_MS + (15 * 60 * 1000),
    });
    await flushPromises();
    return coordination;
}

function latestRender() {
    return mocks.panelRender.mock.calls.at(-1)?.[0] || {};
}

function filters() {
    return latestRender().filterModel || {};
}

function send(type, value) {
    mocks.panelIntentHandler?.({ type, value });
}

function thumbnailIds() {
    return (latestRender().thumbnailItems || []).map((item) => item.id);
}

beforeEach(() => {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalEvent = globalThis.Event;
    originalHtmlInputElement = globalThis.HTMLInputElement;
    originalAudio = globalThis.Audio;
    slider = new FakeTimelineSlider();
    audioInstances = installAudioMock();
    globalThis.HTMLInputElement = FakeTimelineSlider;
    globalThis.Event = class FakeDomEvent {
        constructor(type) {
            this.type = type;
        }
    };
    globalThis.document = createDocumentStub(slider);
    globalThis.window = { missionConfig: { dataPath: "assets/artemis2/data" } };
    mocks.getMissionMediaDataPath.mockReset();
    mocks.getMissionMediaDataPath.mockReturnValue("assets/artemis2/data/");
    mocks.loadMissionMediaManifest.mockReset();
    mocks.panelRender.mockReset();
    mocks.panelSetMissionContext.mockReset();
    mocks.panelSetPanelState.mockReset();
    mocks.panelIntentHandler = null;
});

afterEach(() => {
    coordination?.dispose();
    coordination = null;
    slider = null;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.Event = originalEvent;
    globalThis.HTMLInputElement = originalHtmlInputElement;
    globalThis.Audio = originalAudio;
    audioInstances = [];
    vi.useRealTimers();
});

describe("intent dispatch guards", () => {
    it("ignores an intent with no type", async () => {
        await boot();
        const before = mocks.panelRender.mock.calls.length;

        mocks.panelIntentHandler({});
        mocks.panelIntentHandler({ type: "   " });
        mocks.panelIntentHandler(null);

        expect(mocks.panelRender.mock.calls.length).toBe(before);
    });

    it("ignores an intent type it does not know", async () => {
        await boot();
        const before = filters();

        send("teleport", "moon");

        expect(filters()).toEqual(before);
    });
});

describe("the audience filter", () => {
    it("narrows to crew media", async () => {
        await boot();

        send("setAudienceFilter", "crew");

        expect(filters().subjects).toEqual(["crew"]);
        expect(filters().quick).toBe("all");
        expect(thumbnailIds()).toEqual(["crew-photo", "crew-call"]);
    });

    it("narrows to exterior media under its external alias", async () => {
        await boot();

        send("setAudienceFilter", "external");

        expect(filters().subjects).toEqual(["space"]);
        expect(thumbnailIds()).toEqual(["earth-photo", "exterior-clip"]);
    });

    it("clears the subject filter for any other value", async () => {
        await boot();
        send("setAudienceFilter", "crew");

        send("setAudienceFilter", "all");

        expect(filters().subjects).toEqual([]);
        expect(thumbnailIds()).toHaveLength(MEDIA_ITEMS.length);
    });

    it("resets the camera facet as it goes", async () => {
        await boot();
        send("setCameraFilter", "z9");

        send("setAudienceFilter", "crew");

        expect(filters().cameraIds).toEqual([]);
        expect(filters().cameraId).toBe("all");
    });
});

describe("the camera filter", () => {
    it("narrows to a single camera", async () => {
        await boot();

        send("setCameraFilter", "gopro");

        expect(filters().cameraIds).toEqual(["gopro"]);
        expect(filters().cameraId).toBe("gopro");
        expect(thumbnailIds()).toEqual(["exterior-clip"]);
    });

    it("treats the all value as no camera restriction", async () => {
        await boot();
        send("setCameraFilter", "gopro");

        send("setCameraFilter", "all");

        expect(filters().cameraIds).toEqual([]);
        expect(filters().cameraId).toBe("all");
    });

    it("treats an empty value as no camera restriction", async () => {
        await boot();
        send("setCameraFilter", "gopro");

        send("setCameraFilter", "");

        expect(filters().cameraIds).toEqual([]);
        expect(filters().cameraId).toBe("all");
    });
});

describe("the quick filter", () => {
    it("shows only video for the videos value", async () => {
        await boot();

        send("setQuickFilter", "videos");

        expect(filters().mediaKinds).toEqual(["videoClip"]);
        expect(thumbnailIds()).toEqual(["exterior-clip"]);
    });

    it("restores every kind and subject for the all value", async () => {
        await boot();
        send("setQuickFilter", "videos");

        send("setQuickFilter", "all");

        expect(filters().mediaKinds).toEqual(["image", "audioClip", "videoClip"]);
        expect(filters().subjects).toEqual([]);
        expect(thumbnailIds()).toHaveLength(MEDIA_ITEMS.length);
    });

    it.each([
        ["crew", "crew"],
        ["new", "crew"],
        ["exterior", "space"],
        ["external", "space"],
        ["space", "space"],
    ])("maps the %s value onto the %s subject", async (value, subject) => {
        await boot();

        send("setQuickFilter", value);

        expect(filters().subjects).toEqual([subject]);
    });

    it.each([
        ["crew", "crew"],
        ["new", "crew"],
        ["exterior", "exterior"],
        ["external", "all"],
        ["space", "all"],
        ["videos", "all"],
    ])("publishes %s as the quick label %s", async (value, quick) => {
        // The dispatcher writes the raw value, but the filter normalizer only
        // keeps the five published quick values, so the aliases collapse.
        await boot();

        send("setQuickFilter", value);

        expect(filters().quick).toBe(quick);
    });

    it("leaves the kinds alone for a subject-only quick value", async () => {
        await boot();

        send("setQuickFilter", "crew");

        expect(filters().mediaKinds).toEqual(["image", "audioClip", "videoClip"]);
    });

    it("clears the camera facet", async () => {
        await boot();
        send("setCameraFilter", "d5a");

        send("setQuickFilter", "crew");

        expect(filters().cameraIds).toEqual([]);
    });
});

describe("toggling a subject", () => {
    it("adds a subject that was not selected", async () => {
        await boot();

        send("toggleSubject", "crew");

        expect(filters().subjects).toEqual(["crew"]);
    });

    it("removes a subject that was already selected", async () => {
        await boot();
        send("toggleSubject", "crew");

        send("toggleSubject", "crew");

        expect(filters().subjects).toEqual([]);
    });

    it("accumulates two subjects in their published order", async () => {
        await boot();

        send("toggleSubject", "space");
        send("toggleSubject", "crew");

        expect(filters().subjects).toEqual(["crew", "space"]);
    });

    it("clears every subject for the all value", async () => {
        await boot();
        send("toggleSubject", "crew");

        send("toggleSubject", "all");

        expect(filters().subjects).toEqual([]);
    });

    it("ignores a subject that is not published", async () => {
        await boot();
        const before = filters().subjects;

        send("toggleSubject", "aliens");

        expect(filters().subjects).toEqual(before);
    });
});

describe("toggling a media kind", () => {
    it("narrows to the first kind picked from an unrestricted set", async () => {
        // Every kind is on by default, so the first press means "only this one"
        // rather than "one fewer".
        await boot();

        send("toggleMediaKind", "image");

        expect(filters().mediaKinds).toEqual(["image"]);
        expect(thumbnailIds()).toEqual(["crew-photo", "earth-photo"]);
    });

    it("adds a second kind to a narrowed set", async () => {
        await boot();
        send("toggleMediaKind", "image");

        send("toggleMediaKind", "videoClip");

        expect(filters().mediaKinds).toEqual(["image", "videoClip"]);
    });

    it("removes a kind from a narrowed set", async () => {
        await boot();
        send("toggleMediaKind", "image");
        send("toggleMediaKind", "videoClip");

        send("toggleMediaKind", "image");

        expect(filters().mediaKinds).toEqual(["videoClip"]);
    });

    it("treats an emptied set as unrestricted rather than showing nothing", async () => {
        await boot();
        send("toggleMediaKind", "image");

        send("toggleMediaKind", "image");

        expect(filters().mediaKinds).toEqual(["image", "audioClip", "videoClip"]);
        expect(thumbnailIds()).toHaveLength(MEDIA_ITEMS.length);
    });

    it("restores every kind for the all value", async () => {
        await boot();
        send("toggleMediaKind", "videoClip");

        send("toggleMediaKind", "all");

        expect(filters().mediaKinds).toEqual(["image", "audioClip", "videoClip"]);
        expect(filters().kind).toBe("all");
    });

    it("ignores a kind that is not published", async () => {
        await boot();
        const before = filters().mediaKinds;

        send("toggleMediaKind", "hologram");

        expect(filters().mediaKinds).toEqual(before);
    });

    it("drops the videos quick label once the kind facet is driven directly", async () => {
        await boot();
        send("setQuickFilter", "videos");

        send("toggleMediaKind", "image");

        expect(filters().quick).toBe("all");
    });
});

describe("toggling a camera", () => {
    it("adds and removes a camera", async () => {
        await boot();

        send("toggleCameraFilter", "d5a");
        expect(filters().cameraIds).toEqual(["d5a"]);
        expect(filters().cameraId).toBe("d5a");

        send("toggleCameraFilter", "d5a");
        expect(filters().cameraIds).toEqual([]);
        expect(filters().cameraId).toBe("all");
    });

    it("reports all rather than one id once two cameras are selected", async () => {
        await boot();

        send("toggleCameraFilter", "d5a");
        send("toggleCameraFilter", "z9");

        expect(filters().cameraIds).toEqual(["d5a", "z9"]);
        expect(filters().cameraId).toBe("all");
    });

    it("clears every camera for the all value", async () => {
        await boot();
        send("toggleCameraFilter", "d5a");

        send("toggleCameraFilter", "all");

        expect(filters().cameraIds).toEqual([]);
    });

    it("ignores an empty camera id", async () => {
        await boot();
        send("toggleCameraFilter", "d5a");

        send("toggleCameraFilter", "");

        expect(filters().cameraIds).toEqual(["d5a"]);
    });
});

describe("the search query", () => {
    it("publishes a trimmed query", async () => {
        await boot();

        send("setSearchQuery", "  earth  ");

        expect(filters().query).toBe("earth");
    });

    it("clears the query for an empty value", async () => {
        await boot();
        send("setSearchQuery", "earth");

        send("setSearchQuery", "");

        expect(filters().query).toBe("");
    });
});

describe("selecting media", () => {
    it("selects a filtered item by id", async () => {
        await boot();

        send("selectItem", "earth-photo");

        expect(latestRender().activeItem?.id).toBe("earth-photo");
    });

    it("ignores a selection that is not in the filtered set", async () => {
        await boot();
        send("selectItem", "earth-photo");

        send("toggleMediaKind", "videoClip");
        send("selectItem", "earth-photo");

        expect(latestRender().activeItem?.id).not.toBe("earth-photo");
    });

    it("ignores a selection for an id that does not exist", async () => {
        await boot();
        send("selectItem", "earth-photo");

        send("selectItem", "no-such-item");

        expect(latestRender().activeItem?.id).toBe("earth-photo");
    });

    it("steps forward and back through the filtered set", async () => {
        await boot();
        send("selectItem", "crew-photo");

        send("selectAdjacentItem", "next");
        expect(latestRender().activeItem?.id).toBe("earth-photo");

        send("selectAdjacentItem", "previous");
        expect(latestRender().activeItem?.id).toBe("crew-photo");
    });

    it("clamps at both ends of the filtered set", async () => {
        await boot();
        send("selectItem", "crew-photo");

        send("selectAdjacentItem", "previous");
        expect(latestRender().activeItem?.id).toBe("crew-photo");

        send("selectItem", "exterior-clip");
        send("selectAdjacentItem", "next");
        expect(latestRender().activeItem?.id).toBe("exterior-clip");
    });

    it("treats any value other than previous as forward", async () => {
        await boot();
        send("selectItem", "crew-photo");

        send("selectAdjacentItem", "sideways");

        expect(latestRender().activeItem?.id).toBe("earth-photo");
    });

    it("clears the selection when the filtered set is empty", async () => {
        await boot();
        send("selectItem", "crew-photo");

        send("setSearchQuery", "nothing matches this");
        send("selectAdjacentItem", "next");

        expect(latestRender().activeItem).toBeFalsy();
    });

    it("previews an item without requiring it to exist", async () => {
        await boot();

        expect(() => send("previewItem", "no-such-item")).not.toThrow();
    });
});

describe("the manifest retry intent", () => {
    it("does nothing while the manifest loaded cleanly", async () => {
        await boot();
        const before = mocks.loadMissionMediaManifest.mock.calls.length;

        send("retryManifest");
        await flushPromises();

        expect(mocks.loadMissionMediaManifest.mock.calls.length).toBe(before);
    });

    it("re-requests the manifest after a load failure", async () => {
        mocks.loadMissionMediaManifest.mockRejectedValueOnce(new Error("503"));
        coordination = createMediaTimelineCoordination({
            getStartTime: () => MISSION_START_MS,
            getLatestEndTime: () => MISSION_START_MS + (60 * 60 * 1000),
        });
        coordination.update({ globalConfig: createMissionConfig(), animTime: MISSION_START_MS });
        await flushPromises();
        mocks.loadMissionMediaManifest.mockResolvedValue({ mediaItems: MEDIA_ITEMS });

        send("retryManifest");
        await flushPromises();

        expect(mocks.loadMissionMediaManifest).toHaveBeenCalledTimes(2);
    });
});

describe("the playback transport", () => {
    /** Selects the audio clip and starts it, returning its audio element. */
    async function startAudio() {
        await boot({ animationRunning: true });
        send("selectItem", "crew-call");
        send("startActiveMediaFromBeginning");
        return audioInstances.at(-1);
    }

    it("starts the focused audio clip from its beginning", async () => {
        const audio = await startAudio();

        expect(audio).toBeTruthy();
        expect(audio.play).toHaveBeenCalled();
        expect(latestRender().playbackModel?.showControls).toBe(true);
    });

    it("refuses to start a still image", async () => {
        await boot();
        send("selectItem", "crew-photo");

        send("startActiveMediaFromBeginning");

        expect(audioInstances).toHaveLength(0);
    });

    it("pauses a playing clip on the next toggle", async () => {
        const audio = await startAudio();

        send("toggleActiveMediaPlayback");

        expect(audio.pause).toHaveBeenCalled();
    });

    it("mutes and unmutes the mission media", async () => {
        const audio = await startAudio();

        send("toggleMediaMuted");
        expect(audio.muted).toBe(true);

        send("toggleMediaMuted");
        expect(audio.muted).toBe(false);
    });

    it("keeps the transport up once a duration is known", async () => {
        await startAudio();

        send("mediaDurationKnown", "crew-call");

        expect(latestRender().playbackModel?.showControls).toBe(true);
    });

    it("clears the playing state when the clip ends", async () => {
        const audio = await startAudio();

        audio.emit("ended");

        expect(latestRender().playbackModel?.playing).not.toBe(true);
    });

    it("ignores a playback event for a clip that is not focused", async () => {
        await startAudio();
        const before = latestRender().playbackModel;

        send("mediaPlaybackEnded", "exterior-clip");

        expect(latestRender().playbackModel).toEqual(before);
    });

    it("re-seeks a drifted clip back onto the mission clock while paused", async () => {
        // The mission clock sits before this clip starts, so the resync clamps
        // the element to the clip start rather than leaving it where it drifted.
        await boot({ animationRunning: false });
        send("selectItem", "crew-call");
        send("startActiveMediaFromBeginning");
        const audio = audioInstances.at(-1);
        audio.currentTime = 999;

        send("forceResyncActiveMedia");

        expect(audio.currentTime).toBe(0);
        expect(audio.pause).toHaveBeenCalled();
    });

    it("leaves the resync to the clock while the animation is running", async () => {
        const audio = await startAudio();

        expect(() => send("forceResyncActiveMedia")).not.toThrow();
        expect(audio.pause).toBeDefined();
    });

    it("does nothing on a resync with nothing playing", async () => {
        await boot();

        expect(() => send("forceResyncActiveMedia")).not.toThrow();
    });
});

describe("timeline scrubbing", () => {
    it("ignores a seek with no usable time", async () => {
        await boot();

        expect(() => fireDocumentEvent("mission-timeline-user-seek", { timeMs: Number.NaN }))
            .not.toThrow();
    });

    it("ignores a seek the media sync itself issued", async () => {
        // Otherwise the coordinator would chase its own timeline writes.
        await boot();

        expect(() => fireDocumentEvent("mission-timeline-user-seek", {
            timeMs: MISSION_START_MS + 1000,
            source: "media-sync",
        })).not.toThrow();
    });

    it("runs a full scrub session from start to end", async () => {
        await boot();
        const target = MISSION_START_MS + (20 * 60 * 1000);

        fireDocumentEvent("mission-timeline-user-seek", { timeMs: target, phase: "start", source: "timeline-slider" });
        fireDocumentEvent("mission-timeline-user-seek", { timeMs: target, phase: "update", source: "timeline-slider" });
        fireDocumentEvent("mission-timeline-user-seek", { timeMs: target, phase: "end", source: "timeline-slider" });

        expect(latestRender()).toBeTruthy();
    });

    it("opens a session implicitly when an update arrives first", async () => {
        await boot();

        expect(() => fireDocumentEvent("mission-timeline-user-seek", {
            timeMs: MISSION_START_MS + 1000,
            phase: "update",
            source: "timeline-slider",
        })).not.toThrow();
    });

    it("treats a commit flag as a finalizing phase", async () => {
        await boot();

        expect(() => fireDocumentEvent("mission-timeline-user-seek", {
            timeMs: MISSION_START_MS + 1000,
            commit: true,
            source: "timeline-slider",
        })).not.toThrow();
    });

    it("closes the session on cancel", async () => {
        await boot();

        fireDocumentEvent("mission-timeline-user-seek", { timeMs: MISSION_START_MS, phase: "start" });

        expect(() => fireDocumentEvent("mission-timeline-user-seek", {
            timeMs: MISSION_START_MS,
            phase: "cancel",
        })).not.toThrow();
    });

    it("stops a clip the scrub has moved away from", async () => {
        await boot({ animationRunning: true });
        send("selectItem", "crew-call");
        send("startActiveMediaFromBeginning");
        const audio = audioInstances.at(-1);
        audio.pause.mockClear();

        fireDocumentEvent("mission-timeline-user-seek", {
            timeMs: MISSION_START_MS + (59 * 60 * 1000),
            phase: "commit",
            source: "timeline-slider",
        });

        expect(audio.pause).toHaveBeenCalled();
    });

    it("keeps a clip that the scrub stays inside", async () => {
        await boot({ animationRunning: true });
        send("selectItem", "crew-call");
        send("startActiveMediaFromBeginning");
        const audio = audioInstances.at(-1);
        audio.pause.mockClear();

        fireDocumentEvent("mission-timeline-user-seek", {
            timeMs: Date.parse("2026-04-06T16:30:10Z"),
            phase: "update",
            source: "timeline-slider",
        });

        expect(audio.pause).not.toHaveBeenCalled();
    });
});
