import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import {
    MEDIA_BROWSER_PANEL_ID,
    createMediaBrowserPanelActions,
} from "../src/platform/js/app/media-browser-panel.js";

const MISSION_CONFIG = JSON.parse(readFileSync("assets/artemis2/data/config.json", "utf8"));

const PANEL_ELEMENTS = [
    { id: "media-browser-panel-wrapper", tag: "div" },
    { id: "media-browser-panel", tag: "section", parent: "media-browser-panel-wrapper" },
    { id: "mb-header", tag: "div", parent: "media-browser-panel", className: "media-browser-panel__header" },
    { id: "mb-header-controls", tag: "div", parent: "mb-header", className: "media-browser-panel__header-controls" },
    { id: "media-browser-panel-close", tag: "button", parent: "mb-header-controls" },
    { id: "media-browser-panel-minimize", tag: "button", parent: "mb-header-controls" },
    { id: "media-browser-panel-expand", tag: "button", parent: "mb-header-controls" },

    { id: "media-browser-status", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-manifest-retry", tag: "button", parent: "media-browser-panel" },
    { id: "media-browser-time", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-full-time", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-item-title", tag: "h3", parent: "media-browser-panel" },
    { id: "media-browser-camera", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-photographer", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-location", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-source", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-ai-summary", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-scene-type", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-bodies", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-main-body", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-tags", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-subjects", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-composition-hint", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-quality-notes", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-exif-detail", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-exif", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-description", tag: "p", parent: "media-browser-panel" },
    { id: "media-browser-timing-note", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-seed-note", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-stage-badge", tag: "span", parent: "media-browser-panel" },

    { id: "media-browser-stage", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-stage-empty", tag: "div", parent: "media-browser-stage" },
    { id: "media-browser-video", tag: "video", parent: "media-browser-stage" },
    { id: "media-browser-image", tag: "img", parent: "media-browser-stage" },
    { id: "media-browser-audio-placeholder", tag: "div", parent: "media-browser-stage" },
    { id: "media-browser-image-controls", tag: "div", parent: "media-browser-stage" },
    { id: "media-browser-image-zoom-in", tag: "button", parent: "media-browser-image-controls" },
    { id: "media-browser-image-zoom-out", tag: "button", parent: "media-browser-image-controls" },
    { id: "media-browser-image-reset", tag: "button", parent: "media-browser-image-controls" },
    { id: "media-browser-image-zoom-label", tag: "span", parent: "media-browser-image-controls" },

    { id: "media-browser-media-controls", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-media-play", tag: "button", parent: "media-browser-media-controls" },
    { id: "media-browser-media-mute", tag: "button", parent: "media-browser-media-controls" },
    { id: "media-browser-media-restart", tag: "button", parent: "media-browser-media-controls" },
    { id: "media-browser-media-resync", tag: "button", parent: "media-browser-media-controls" },
    { id: "media-browser-media-popout", tag: "button", parent: "media-browser-media-controls" },
    { id: "media-browser-media-elapsed", tag: "span", parent: "media-browser-media-controls" },
    { id: "media-browser-media-timeline", tag: "input", parent: "media-browser-media-controls" },
    { id: "media-browser-media-status", tag: "span", parent: "media-browser-media-controls" },

    { id: "media-browser-filter-toggle", tag: "button", parent: "media-browser-panel" },
    { id: "media-browser-filter-drawer", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-filter-bar", tag: "div", parent: "media-browser-filter-drawer" },
    { id: "media-browser-search", tag: "input", parent: "media-browser-filter-drawer" },
    { id: "media-browser-filter-summary", tag: "span", parent: "media-browser-panel" },
    { id: "media-browser-filter-scroller", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-filter-prev", tag: "button", parent: "media-browser-filter-scroller" },
    { id: "media-browser-filter-next", tag: "button", parent: "media-browser-filter-scroller" },
    { id: "media-browser-filter-position", tag: "span", parent: "media-browser-filter-scroller" },

    { id: "media-browser-thumbnail-list", tag: "div", parent: "media-browser-panel", className: "media-browser-panel__thumbnail-strip" },
    { id: "media-browser-thumbnail-prev", tag: "button", parent: "media-browser-panel" },
    { id: "media-browser-thumbnail-next", tag: "button", parent: "media-browser-panel" },
    { id: "media-browser-thumbnail-collapse", tag: "button", parent: "media-browser-panel" },
    { id: "media-browser-thumbnail-resizer", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-drilldown", tag: "div", parent: "media-browser-panel" },
    { id: "media-browser-drilldown-body", tag: "div", parent: "media-browser-drilldown" },
];

const IMAGE_ITEM = {
    id: "img-1",
    kind: "photo",
    title: "Earthrise",
    timeLabel: "2026-04-08 12:00:00 UTC",
    cameraLabel: "Canon EOS R5",
    photographer: "Crew",
    location: "Cislunar space",
    sourceLabel: "NASA",
    shortDescription: "The Earth above the lunar limb.",
    sceneType: "Earth over Moon",
    bodies: ["Earth", "Moon"],
    mainBody: "Earth",
    tags: ["earthrise", "iconic"],
    subjects: ["Earth"],
    qualityNotes: "Sharp",
    exifLabel: "f/8 1/250s ISO 200",
    description: "A long description of the frame.",
    timingNote: "Timed from the onboard clock.",
    stageBadge: "Hero",
    assetUrl: "media/earthrise.jpg",
    compositionHints: { suggestedLockTarget: "Earth", confidence: 0.82, reason: "Limb centered" },
};

const VIDEO_ITEM = {
    id: "vid-1",
    kind: "videoClip",
    title: "Crew Update",
    timeLabel: "2026-04-09 08:00:00 UTC",
    videoAssetUrl: "media/crew.mp4",
    videoSourceType: "video/mp4",
    thumbnailAssetUrl: "media/crew.jpg",
};

const AUDIO_ITEM = {
    id: "aud-1",
    kind: "audioClip",
    title: "Air-to-ground",
    timeLabel: "2026-04-09 09:00:00 UTC",
};

function thumbnails(activeId = "img-1") {
    return [
        {
            id: "img-1",
            kind: "photo",
            title: "Earthrise",
            meta: "12:00",
            metaFull: "2026-04-08 12:00:00 UTC",
            thumbnailAssetUrl: "media/earthrise-thumb.jpg",
            fallbackAssetUrl: "media/earthrise-fallback.jpg",
            active: activeId === "img-1",
        },
        {
            id: "vid-1",
            kind: "videoClip",
            title: "Crew Update",
            meta: "08:00",
            thumbnailAssetUrl: "media/crew-thumb.jpg",
            active: activeId === "vid-1",
        },
        {
            id: "aud-1",
            kind: "audioClip",
            title: "Air-to-ground",
            meta: "09:00",
            active: activeId === "aud-1",
        },
    ];
}

const FILTER_MODEL = {
    kindPillOptions: [
        { id: "all", label: "All", count: 3, active: true },
        { id: "photo", label: "Photos", count: 1 },
        { id: "videoClip", label: "Video", count: 1 },
        { id: "empty", label: "Nothing", count: 0 },
    ],
    subjectOptions: [
        { id: "earth", label: "Earth", count: 2 },
    ],
    query: "",
};

let dom = null;
let intents = [];
let panel = null;

function mount({ desktop = true } = {}) {
    intents = [];
    dom = installFakeDom(PANEL_ELEMENTS, {
        innerWidth: desktop ? 1600 : 420,
        innerHeight: 900,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: (callback) => { callback(0); return 1; },
        cancelAnimationFrame: () => {},
        matchMedia: () => ({ matches: desktop, addEventListener() {}, removeEventListener() {} }),
        missionConfig: { dataPath: "assets/artemis2/data" },
        location: { pathname: "/artemis2/", href: "http://localhost/artemis2/" },
    });
    panel = createMediaBrowserPanelActions({ onIntent: (intent) => intents.push(intent) });
    return panel;
}

function node(id) {
    return dom.document.getElementById(id);
}

function click(id) {
    node(id).dispatchEvent(new FakeEvent("click", { bubbles: true }));
}

function viewModel(overrides = {}) {
    return {
        panelTitle: "Mission Media",
        statusText: "",
        activeItem: IMAGE_ITEM,
        thumbnailItems: thumbnails(),
        filterModel: FILTER_MODEL,
        navigationModel: {
            available: true,
            previousEnabled: false,
            nextEnabled: true,
            positionLabel: "1 of 3",
        },
        playbackModel: {},
        ...overrides,
    };
}

function openPanel() {
    panel.setMissionContext({
        configData: MISSION_CONFIG,
        available: true,
        title: "Mission Media",
        mediaCount: 3,
    });
    panel.setPanelState("open");
}

beforeEach(() => {
    FakeResizeObserver.instances = [];
});

afterEach(() => {
    panel = null;
    intents = [];
    dom?.restore();
    dom = null;
    vi.unstubAllGlobals();
});

describe("the metadata readout", () => {
    it("fills every detail field from the active item", () => {
        mount();

        panel.render(viewModel());

        expect(node("media-browser-item-title").textContent).toBe("Earthrise");
        expect(node("media-browser-camera").textContent).toBe("Canon EOS R5");
        expect(node("media-browser-photographer").textContent).toBe("Crew");
        expect(node("media-browser-location").textContent).toBe("Cislunar space");
        expect(node("media-browser-source").textContent).toBe("NASA");
        expect(node("media-browser-scene-type").textContent).toBe("Earth over Moon");
        expect(node("media-browser-main-body").textContent).toBe("Earth");
        expect(node("media-browser-quality-notes").textContent).toBe("Sharp");
        expect(node("media-browser-exif-detail").textContent).toBe("f/8 1/250s ISO 200");
        expect(node("media-browser-description").textContent).toBe("A long description of the frame.");
    });

    it("joins list-valued details into a readable sentence", () => {
        mount();

        panel.render(viewModel());

        expect(node("media-browser-bodies").textContent).toBe("Earth, Moon");
        expect(node("media-browser-tags").textContent).toBe("earthrise, iconic");
        expect(node("media-browser-composition-hint").textContent)
            .toBe("Lock Earth - 82% - Limb centered");
    });

    it("shows the full timestamp as the tooltip of the compact one", () => {
        mount();

        panel.render(viewModel());

        expect(node("media-browser-full-time").textContent).toBe("2026-04-08 12:00:00 UTC");
        expect(node("media-browser-time").title).toBe("2026-04-08 12:00:00 UTC");
        expect(node("media-browser-time").textContent.length)
            .toBeLessThanOrEqual("2026-04-08 12:00:00 UTC".length);
    });

    it("falls back to placeholders with no active item", () => {
        mount();

        panel.render(viewModel({ activeItem: null, emptyText: "Nothing selected." }));

        expect(node("media-browser-item-title").textContent).toBe("Mission Media");
        expect(node("media-browser-camera").textContent).toBe("--");
        expect(node("media-browser-camera").hidden).toBe(true);
        expect(node("media-browser-description").textContent).toBe("Nothing selected.");
        expect(node("media-browser-exif").hidden).toBe(true);
        expect(node("media-browser-stage-badge").hidden).toBe(true);
    });

    it("shows the status line only when there is something to say", () => {
        mount();

        panel.render(viewModel({ statusText: "Could not load the manifest." }));
        expect(node("media-browser-status").hidden).toBe(false);
        expect(node("media-browser-status").textContent).toBe("Could not load the manifest.");

        panel.render(viewModel({ statusText: "   " }));
        expect(node("media-browser-status").hidden).toBe(true);
    });

    it("skips the structural rebuild when nothing structural changed", () => {
        mount();
        panel.render(viewModel());
        const firstCard = node("media-browser-thumbnail-list").children[0];

        panel.render(viewModel({ playbackModel: { showControls: true, durationSeconds: 10 } }));

        expect(node("media-browser-thumbnail-list").children[0]).toBe(firstCard);
        expect(node("media-browser-media-controls").hidden).toBe(false);
    });
});

describe("the preview stage", () => {
    it("shows the image and hides the video and audio placeholders", () => {
        mount();

        panel.render(viewModel());

        expect(node("media-browser-image").hidden).toBe(false);
        expect(node("media-browser-image").src).toBe("media/earthrise.jpg");
        expect(node("media-browser-image").alt).toBe("Earthrise");
        expect(node("media-browser-video").hidden).toBe(true);
        expect(node("media-browser-audio-placeholder").hidden).toBe(true);
        expect(node("media-browser-stage-empty").hidden).toBe(true);
    });

    it("attaches a native video source for a video clip", () => {
        mount();

        panel.render(viewModel({ activeItem: VIDEO_ITEM, thumbnailItems: thumbnails("vid-1") }));

        const video = node("media-browser-video");
        expect(video.hidden).toBe(false);
        expect(video.dataset.mediaItemId).toBe("vid-1");
        expect(video.dataset.mediaSourceUrl).toBe("media/crew.mp4");
        expect(node("media-browser-image").hidden).toBe(true);
    });

    it("keeps the pop-out button down where picture-in-picture is unsupported", () => {
        mount();

        panel.render(viewModel({ activeItem: VIDEO_ITEM, thumbnailItems: thumbnails("vid-1") }));

        expect(node("media-browser-media-popout").hidden).toBe(true);
        expect(node("media-browser-media-popout").disabled).toBe(true);
    });

    it("offers the pop-out button once the host supports picture-in-picture", () => {
        mount();
        node("media-browser-video").requestPictureInPicture = () => Promise.resolve();
        dom.document.pictureInPictureEnabled = true;

        panel.render(viewModel({ activeItem: VIDEO_ITEM, thumbnailItems: thumbnails("vid-1") }));

        expect(node("media-browser-media-popout").hidden).toBe(false);
        expect(node("media-browser-media-popout").textContent).toBe("Pop Out");
        expect(node("media-browser-media-popout").getAttribute("aria-pressed")).toBe("false");
    });

    it("labels the pop-out button Dock while the video is already popped out", () => {
        mount();
        const video = node("media-browser-video");
        video.requestPictureInPicture = () => Promise.resolve();
        dom.document.pictureInPictureEnabled = true;
        dom.document.pictureInPictureElement = video;

        panel.render(viewModel({ activeItem: VIDEO_ITEM, thumbnailItems: thumbnails("vid-1") }));

        expect(node("media-browser-media-popout").textContent).toBe("Dock");
        expect(node("media-browser-media-popout").getAttribute("aria-pressed")).toBe("true");
    });

    it("shows the audio placeholder for an audio clip", () => {
        mount();

        panel.render(viewModel({ activeItem: AUDIO_ITEM, thumbnailItems: thumbnails("aud-1") }));

        expect(node("media-browser-audio-placeholder").hidden).toBe(false);
        expect(node("media-browser-image").hidden).toBe(true);
        expect(node("media-browser-video").hidden).toBe(true);
    });

    it("explains an empty stage", () => {
        mount();

        panel.render(viewModel({
            activeItem: { id: "none", kind: "photo", title: "No asset" },
            stageEmptyText: "This item has no preview.",
        }));

        expect(node("media-browser-stage-empty").hidden).toBe(false);
        expect(node("media-browser-stage-empty").textContent).toBe("This item has no preview.");
    });

    it("drops the image source when the selection loses its asset", () => {
        mount();
        panel.render(viewModel());

        panel.render(viewModel({ activeItem: AUDIO_ITEM, thumbnailItems: thumbnails("aud-1") }));

        expect(node("media-browser-image").getAttribute("src")).toBeNull();
        expect(node("media-browser-image").alt).toBe("");
    });
});

describe("the image zoom controls", () => {
    it("starts at one hundred percent", () => {
        mount();

        panel.render(viewModel());

        expect(node("media-browser-image-zoom-label").textContent).toBe("100%");
    });

    it("zooms in, zooms out and resets", () => {
        mount();
        panel.render(viewModel());

        click("media-browser-image-zoom-in");
        const zoomed = node("media-browser-image-zoom-label").textContent;
        expect(Number.parseInt(zoomed, 10)).toBeGreaterThan(100);

        click("media-browser-image-zoom-out");
        expect(Number.parseInt(node("media-browser-image-zoom-label").textContent, 10))
            .toBeLessThan(Number.parseInt(zoomed, 10));

        click("media-browser-image-zoom-in");
        click("media-browser-image-zoom-in");
        click("media-browser-image-reset");
        expect(node("media-browser-image-zoom-label").textContent).toBe("100%");
    });

    it("resets the zoom when a different image is selected", () => {
        mount();
        panel.render(viewModel());
        click("media-browser-image-zoom-in");

        panel.render(viewModel({
            activeItem: { ...IMAGE_ITEM, id: "img-2", assetUrl: "media/other.jpg" },
        }));

        expect(node("media-browser-image-zoom-label").textContent).toBe("100%");
    });
});

describe("the playback controls", () => {
    it("stays hidden until the model asks for it", () => {
        mount();

        panel.render(viewModel());

        expect(node("media-browser-media-controls").hidden).toBe(true);
        expect(node("media-browser-media-play").disabled).toBe(true);
        expect(node("media-browser-media-elapsed").textContent).toBe("");
    });

    it("shows the elapsed and total time", () => {
        mount();

        panel.render(viewModel({
            playbackModel: { showControls: true, elapsedSeconds: 65, durationSeconds: 125 },
        }));

        expect(node("media-browser-media-elapsed").textContent).toBe("01:05 / 02:05");
        expect(node("media-browser-media-timeline").max).toBe("125");
        expect(node("media-browser-media-timeline").value).toBe("65");
        expect(node("media-browser-media-timeline").disabled).toBe(false);
    });

    it("clamps an elapsed time past the end of the clip", () => {
        mount();

        panel.render(viewModel({
            playbackModel: { showControls: true, elapsedSeconds: 900, durationSeconds: 125 },
        }));

        expect(node("media-browser-media-timeline").value).toBe("125");
    });

    it("reports an unknown duration rather than a wrong one", () => {
        mount();

        panel.render(viewModel({ playbackModel: { showControls: true, elapsedSeconds: 3 } }));

        expect(node("media-browser-media-elapsed").textContent).toBe("00:03 / --:--");
        expect(node("media-browser-media-timeline").disabled).toBe(true);
    });

    it("switches the play button to a pause glyph while busy", () => {
        mount();

        panel.render(viewModel({ playbackModel: { showControls: true, playing: true } }));
        expect(node("media-browser-media-play").textContent).toBe("⏸");

        panel.render(viewModel({ playbackModel: { showControls: true, buffering: true } }));
        expect(node("media-browser-media-play").textContent).toBe("⏸");

        panel.render(viewModel({ playbackModel: { showControls: true } }));
        expect(node("media-browser-media-play").textContent).toBe("▶");
    });

    it("announces the mute state on the mute button", () => {
        mount();

        panel.render(viewModel({ playbackModel: { showControls: true, muted: true } }));

        expect(node("media-browser-media-mute").getAttribute("aria-pressed")).toBe("true");
        expect(node("media-browser-media-mute").dataset.icon).toBe("speaker-muted");
        expect(node("media-browser-media-mute").title).toBe("Unmute Mission Media");
    });

    it("emits one intent per transport button", () => {
        mount();
        panel.render(viewModel({ playbackModel: { showControls: true, durationSeconds: 10 } }));

        click("media-browser-media-play");
        click("media-browser-media-mute");
        click("media-browser-media-restart");
        click("media-browser-media-resync");

        expect(intents.map((intent) => intent.type)).toEqual([
            "toggleActiveMediaPlayback",
            "toggleMediaMuted",
            "startActiveMediaFromBeginning",
            "forceResyncActiveMedia",
        ]);
    });

    it("shows the playback status label only while the controls are up", () => {
        mount();

        panel.render(viewModel({
            playbackModel: { showControls: true, statusLabel: "Buffering" },
        }));
        expect(node("media-browser-media-status").textContent).toBe("Buffering");

        panel.render(viewModel({ playbackModel: { statusLabel: "Buffering" } }));
        expect(node("media-browser-media-status").textContent).toBe("");
    });
});

describe("the manifest retry button", () => {
    it("appears with the retry affordance and routes one intent", () => {
        mount();

        panel.render(viewModel({ manifestRetryAvailable: true, statusText: "Could not load" }));
        expect(node("media-browser-manifest-retry").hidden).toBe(false);
        click("media-browser-manifest-retry");

        expect(intents).toEqual([{ type: "retryManifest" }]);
    });

    it("hides once the manifest has loaded", () => {
        mount();
        panel.render(viewModel({ manifestRetryAvailable: true, statusText: "Could not load" }));

        panel.render(viewModel({ manifestRetryAvailable: false, statusText: "Ready" }));

        expect(node("media-browser-manifest-retry").hidden).toBe(true);
        expect(node("media-browser-manifest-retry").disabled).toBe(true);
    });
});

describe("the thumbnail strip", () => {
    it("builds one card per item with its kind and active state", () => {
        mount();

        panel.render(viewModel());

        const cards = node("media-browser-thumbnail-list").children;
        expect(cards).toHaveLength(3);
        expect(cards[0].classList.contains("media-browser-panel__thumbnail-card--photo")).toBe(true);
        expect(cards[0].classList.contains("is-active")).toBe(true);
        expect(cards[0].getAttribute("aria-current")).toBe("true");
        expect(cards[1].classList.contains("media-browser-panel__thumbnail-card--videoClip")).toBe(true);
        expect(cards[1].classList.contains("is-active")).toBe(false);
    });

    it("carries the item id so a click can be routed back", () => {
        mount();
        panel.render(viewModel());

        const card = node("media-browser-thumbnail-list").children[1];
        expect(card.dataset.thumbnailItemId).toBe("vid-1");

        card.dispatchEvent(new FakeEvent("click", { bubbles: true }));
        expect(intents).toContainEqual({ type: "previewItem", value: "vid-1" });
    });

    it("gives every card a descriptive label", () => {
        mount();

        panel.render(viewModel());

        const label = node("media-browser-thumbnail-list").children[0].getAttribute("aria-label");
        expect(label).toContain("Earthrise");
    });

    it("records a fallback image for a thumbnail that fails to load", () => {
        mount();
        panel.render(viewModel());

        const image = node("media-browser-thumbnail-list").children[0]
            .children[0].children[0];
        expect(image.tagName).toBe("IMG");
        expect(image.src).toBe("media/earthrise-thumb.jpg");
        expect(image.dataset.fallbackSrc).toBe("media/earthrise-fallback.jpg");

        image.dispatchEvent(new FakeEvent("error", { bubbles: false }));
        expect(image.src).toBe("media/earthrise-fallback.jpg");

        image.dispatchEvent(new FakeEvent("error", { bubbles: false }));
        expect(image.hidden).toBe(true);
    });

    it("moves the active marker without rebuilding the cards", () => {
        mount();
        panel.render(viewModel());
        const cards = [...node("media-browser-thumbnail-list").children];

        panel.render(viewModel({
            activeItem: VIDEO_ITEM,
            thumbnailItems: thumbnails("vid-1"),
        }));

        const after = node("media-browser-thumbnail-list").children;
        expect(after[0]).toBe(cards[0]);
        expect(after[0].classList.contains("is-active")).toBe(false);
        expect(after[1].classList.contains("is-active")).toBe(true);
    });

    it("rebuilds when the item set itself changes", () => {
        mount();
        panel.render(viewModel());
        const firstCard = node("media-browser-thumbnail-list").children[0];

        panel.render(viewModel({ thumbnailItems: thumbnails().slice(1) }));

        expect(node("media-browser-thumbnail-list").children).toHaveLength(2);
        expect(node("media-browser-thumbnail-list").children[0]).not.toBe(firstCard);
    });

    it("empties the strip when there is no media", () => {
        mount();
        panel.render(viewModel());

        panel.render(viewModel({ thumbnailItems: [] }));

        expect(node("media-browser-thumbnail-list").children).toHaveLength(0);
    });
});

describe("filters and navigation", () => {
    it("renders a button per filter option with its pressed state", () => {
        mount();

        panel.render(viewModel());

        const buttons = collectFilterButtons();
        const all = buttons.find((button) => button.dataset.filterId === "all");
        expect(all.getAttribute("aria-pressed")).toBe("true");
        expect(all.textContent).toBe("All");
    });

    it("disables a filter that would match nothing", () => {
        mount();

        panel.render(viewModel());

        const empty = collectFilterButtons().find((button) => button.dataset.filterId === "empty");
        expect(empty.disabled).toBe(true);
    });

    it("routes a filter press back through the intent boundary", () => {
        mount();
        panel.render(viewModel());

        collectFilterButtons()
            .find((button) => button.dataset.filterId === "photo")
            .dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(intents.some((intent) => intent.value === "photo")).toBe(true);
    });

    it("summarizes the active filters", () => {
        mount();

        panel.render(viewModel({ filterSummaryLabel: "3 of 12 items" }));

        expect(node("media-browser-filter-summary").textContent).toBe("3 of 12 items");
    });

    it("keeps the filter drawer shut until the toggle opens it", () => {
        mount();
        openPanel();
        node("media-browser-panel").setBoundingClientRect({ left: 40, top: 200, width: 640, height: 420 });
        panel.render(viewModel());
        expect(node("media-browser-filter-drawer").hidden).toBe(true);

        click("media-browser-filter-toggle");
        expect(node("media-browser-filter-drawer").hidden).toBe(false);
        expect(node("media-browser-panel").classList.contains("media-browser-panel--filters-open")).toBe(true);

        click("media-browser-filter-toggle");
        expect(node("media-browser-filter-drawer").hidden).toBe(true);
    });

    it("keeps the drawer shut while the panel itself is closed", () => {
        mount();
        openPanel();
        node("media-browser-panel").setBoundingClientRect({ left: 40, top: 200, width: 640, height: 420 });
        panel.render(viewModel());
        click("media-browser-filter-toggle");

        panel.setPanelState("closed");

        expect(node("media-browser-filter-drawer").hidden).toBe(true);
    });

    it("mirrors the search query into the search control", () => {
        mount();

        panel.render(viewModel({
            filterModel: { ...FILTER_MODEL, query: "earthrise" },
        }));

        expect(node("media-browser-search").value).toBe("earthrise");
    });

    it("publishes a typed search query", () => {
        mount();
        panel.render(viewModel());
        const search = node("media-browser-search");

        search.value = "moon";
        search.dispatchEvent(new FakeEvent("input", { bubbles: true }));

        expect(intents).toContainEqual({ type: "setSearchQuery", value: "moon" });
    });

    it("drives the previous and next affordances from the navigation model", () => {
        mount();

        panel.render(viewModel());

        expect(node("media-browser-filter-scroller").hidden).toBe(false);
        expect(node("media-browser-filter-prev").disabled).toBe(true);
        expect(node("media-browser-filter-next").disabled).toBe(false);
        expect(node("media-browser-filter-position").textContent).toBe("1 of 3");
    });

    it("hides the navigation entirely when nothing is filtered", () => {
        mount();

        panel.render(viewModel({ navigationModel: { available: false } }));

        expect(node("media-browser-filter-scroller").hidden).toBe(true);
        expect(node("media-browser-filter-position").textContent).toBe("No media focused");
    });

    it("steps the selection from the navigation buttons", () => {
        mount();
        panel.render(viewModel());

        click("media-browser-filter-next");
        click("media-browser-filter-prev");

        expect(intents).toEqual([
            { type: "selectAdjacentItem", value: "next" },
            { type: "selectAdjacentItem", value: "previous" },
        ]);
    });
});

describe("panel availability and state", () => {
    it("reveals the wrapper once a mission that carries it is set", () => {
        mount();
        panel.render(viewModel());

        openPanel();

        expect(node("media-browser-panel-wrapper").hidden).toBe(false);
    });

    it("hides the wrapper again on a mission that does not carry it", () => {
        mount();
        openPanel();

        panel.setMissionContext({ configData: {}, available: true });

        expect(node("media-browser-panel-wrapper").hidden).toBe(true);
        expect(node("media-browser-panel").classList.contains("media-browser-panel--hidden")).toBe(true);
    });

    it("refuses a mission that does not carry the panel", () => {
        mount();

        panel.setMissionContext({ configData: MISSION_CONFIG, available: false });

        expect(node("media-browser-panel-wrapper").hidden).toBe(true);
    });

    it("opens and closes the panel", () => {
        mount();
        openPanel();
        const element = node("media-browser-panel");
        expect(element.classList.contains("media-browser-panel--hidden")).toBe(false);

        panel.setPanelState("closed");
        expect(element.classList.contains("media-browser-panel--hidden")).toBe(true);

        panel.setPanelState("open");
        expect(element.classList.contains("media-browser-panel--hidden")).toBe(false);
    });

    it("treats minimized as closed", () => {
        mount();
        openPanel();

        panel.setPanelState("minimized");

        expect(node("media-browser-panel").classList.contains("media-browser-panel--hidden")).toBe(true);
    });

    it("closes from the header close button", () => {
        mount();
        openPanel();

        click("media-browser-panel-close");

        expect(node("media-browser-panel").classList.contains("media-browser-panel--hidden")).toBe(true);
    });

    it("removes the minimize button and adds info and delete", () => {
        mount();
        openPanel();

        expect(node("media-browser-panel-minimize")).toBeNull();
        expect(node("media-browser-panel-info")).toBeTruthy();
        expect(node("media-browser-panel-delete")).toBeTruthy();
    });

    it("publishes a stable panel id", () => {
        expect(MEDIA_BROWSER_PANEL_ID).toBe("workflow:media-browser");
    });
});

function collectFilterButtons() {
    const buttons = [];
    const walk = (element) => {
        for (const child of element.children || []) {
            if (child.tagName === "BUTTON" && child.dataset?.filterId !== undefined) buttons.push(child);
            walk(child);
        }
    };
    walk(node("media-browser-filter-bar"));
    return buttons;
}
