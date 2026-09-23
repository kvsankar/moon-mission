import { describe, expect, it } from "vitest";
import { createTimelineDockController } from "../src/platform/js/app/timeline-dock-controller.js";
import { FakeElement } from "./helpers/timeline-dock-element.js";

describe("timeline dock event and media markers", () => {
    it("switches to explicit compare-mode labels and styles comparison markers", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const modeLabel = new FakeElement("div");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-mode-label") return modeLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        };

        const controller = createTimelineDockController({});
        controller.setMode({
            compareMode: true,
            label: "Comparison Time",
            detail: "Fictional / relative",
            title: "Aligned mission comparison",
        });
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 3600000,
            stepMs: 60000,
        });
        controller.setEvents([
            {
                key: "compare-burn",
                startTime: new Date(900000),
                timelineLabel: "CM: TLI",
                timelineHoverText: "CM • Tue, Jan 01, 2024 • TLI",
                comparisonEvent: true,
                burnFlag: true,
            },
        ]);
        controller.setCurrentTime(900000);

        expect(dockRoot.classList.contains("timeline-dock--compare")).toBe(true);
        expect(modeLabel.hidden).toBe(false);
        expect(modeLabel.textContent).toContain("Comparison Time");
        expect(currentLabel.textContent).toContain("Comparison Elapsed");
        expect(currentLabel.textContent).toContain("T+15m");
        expect(startLabel.innerHTML).toContain("Start");
        expect(startLabel.innerHTML).toContain("T+0");
        expect(endLabel.innerHTML).toContain("End");
        expect(endLabel.innerHTML).toContain("T+1h");
        expect(markers.children).toHaveLength(1);
        expect(markers.children[0].className).toContain("timeline-dock__marker--comparison");
        expect(markers.children[0].title).not.toContain(" - ");
        expect(slider.attributes["aria-valuetext"]).toContain("Comparison elapsed time");
    });

    it("marks bracketing event markers as dashed boundaries between events", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const modeLabel = new FakeElement("div");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-mode-label") return modeLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        };

        const controller = createTimelineDockController({});
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 3000,
            stepMs: 1,
        });
        controller.setEvents([
            { key: "e1", startTime: new Date(1000), label: "E1" },
            { key: "e2", startTime: new Date(2000), label: "E2" },
        ]);
        controller.setCurrentTime(1500);

        expect(markers.children[0].className).toContain("timeline-dock__marker--time-boundary");
        expect(markers.children[1].className).toContain("timeline-dock__marker--time-boundary");
        expect(markers.children[0].className).not.toContain("timeline-dock__marker--current-event");
        expect(markers.children[1].className).not.toContain("timeline-dock__marker--current-event");

        controller.setCurrentTime(1000);

        expect(markers.children[0].className).toContain("timeline-dock__marker--current-event");
        expect(markers.children[0].className).not.toContain("timeline-dock__marker--time-boundary");
        expect(markers.children[1].className).not.toContain("timeline-dock__marker--time-boundary");
    });

    it("extends the matching timeline marker while an event pill is hovered", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const modeLabel = new FakeElement("div");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const eventVisibleRange = new FakeElement("div");
        const documentHandlers = new Map();

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-event-visible-range") return eventVisibleRange;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-mode-label") return modeLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
            addEventListener(type, handler) {
                const handlers = documentHandlers.get(type) || [];
                handlers.push(handler);
                documentHandlers.set(type, handlers);
            },
            dispatchEvent(event) {
                const handlers = documentHandlers.get(event.type) || [];
                handlers.forEach((handler) => handler(event));
            },
        };

        const controller = createTimelineDockController({});
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 3000,
            stepMs: 1,
        });
        controller.setEvents([
            { key: "e1", startTime: new Date(1000), label: "E1" },
            { key: "e2", startTime: new Date(2000), label: "E2" },
        ]);
        controller.bind();

        global.document.dispatchEvent({
            type: "mission-timeline-event-hover",
            detail: {
                active: true,
                eventKey: "e2",
                eventTimeMs: 2000,
            },
        });

        expect(markers.children[0].className).not.toContain("timeline-dock__marker--hovered");
        expect(markers.children[1].className).toContain("timeline-dock__marker--hovered");

        global.document.dispatchEvent({
            type: "mission-timeline-event-hover",
            detail: {
                active: false,
                eventKey: "e2",
                eventTimeMs: 2000,
            },
        });

        expect(markers.children[1].className).not.toContain("timeline-dock__marker--hovered");

        global.document.dispatchEvent({
            type: "mission-timeline-visible-event-range-hover",
            detail: {
                active: true,
                startTimeMs: 1000,
                endTimeMs: 2000,
            },
        });

        expect(eventVisibleRange.hidden).toBe(false);
        expect(eventVisibleRange.style.left).toBe("33.33333333333333%");
        expect(eventVisibleRange.style.width).toBe("33.33333333333333%");

        global.document.dispatchEvent({
            type: "mission-timeline-visible-event-range-hover",
            detail: {
                active: false,
                startTimeMs: 1000,
                endTimeMs: 2000,
            },
        });

        expect(eventVisibleRange.hidden).toBe(true);
    });

    it("emits a timeline seek event when clicking a reachable timeline event marker", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const dispatchedEvents = [];
        const selectedMarkers = [];
        const onMarkerSelect = (eventInfo, index) => {
            selectedMarkers.push({ eventInfo, index });
        };

        global.CustomEvent = class {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        };
        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
            dispatchEvent(event) {
                dispatchedEvents.push(event);
            },
        };

        const controller = createTimelineDockController({
            onMarkerSelect,
        });
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 100,
        });
        controller.setEvents([
            {
                key: "event-1",
                startTime: new Date(500),
                label: "Event 1",
                clickable: true,
            },
        ]);

        markers.children[0].dispatchEvent({ type: "click" });

        expect(dispatchedEvents).toHaveLength(1);
        expect(dispatchedEvents[0].type).toBe("mission-timeline-user-seek");
        expect(dispatchedEvents[0].detail.phase).toBe("commit");
        expect(dispatchedEvents[0].detail.source).toBe("timeline-event-marker");
        expect(dispatchedEvents[0].detail.timeMs).toBe(500);
        expect(selectedMarkers).toHaveLength(1);
        expect(selectedMarkers[0]).toEqual(expect.objectContaining({
            eventInfo: expect.objectContaining({
                key: "event-1",
            }),
            index: 0,
        }));

        delete global.CustomEvent;
    });

    it("renders media markers on a separate rail", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const mediaMarkers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const modeLabel = new FakeElement("div");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-media-markers") return mediaMarkers;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-mode-label") return modeLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
            dispatchEvent() {},
        };

        const controller = createTimelineDockController({});
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 100,
        });
        controller.setMediaMarkers([
            {
                id: "earthrise",
                startTimeMs: 500,
                label: "Earthrise",
                hoverText: "Earthrise • Crew iPhone",
                mediaKind: "image",
                thumbnailAssetUrl: "/assets/thumbs/earthrise.jpg",
                selected: true,
                clickable: true,
            },
            {
                id: "earthshine-video",
                startTimeMs: 200,
                endTimeMs: 500,
                label: "Earthshine Video",
                hoverText: "Earthshine Video • 30s",
                mediaKind: "videoClip",
                mediaDisplayMode: "segment",
                clickable: true,
            },
            {
                id: "mission-audio",
                startTimeMs: -100,
                endTimeMs: 100,
                label: "Mission Audio",
                hoverText: "Mission Audio • Approx. 30s",
                mediaKind: "audioClip",
                mediaDisplayMode: "segment",
                durationEstimated: true,
                clickable: true,
            },
        ]);

        expect(mediaMarkers.children).toHaveLength(3);
        expect(mediaMarkers.children[0].className).toContain("timeline-dock__media-marker");
        expect(mediaMarkers.children[0].className).not.toContain("timeline-dock__media-marker--segment");
        expect(mediaMarkers.children[0].className).toContain("timeline-dock__media-marker--selected");
        expect(mediaMarkers.children[0].title).toBe("Earthrise • Crew iPhone");
        expect(mediaMarkers.children[0].children.find((child) => child.className === "timeline-dock__media-preview")).toBeUndefined();
        mediaMarkers.children[0].dispatchEvent({ type: "pointerenter" });
        const preview = mediaMarkers.children.find((child) => child.className === "timeline-dock__media-preview");
        expect(preview).toBeTruthy();
        expect(preview.hidden).toBe(false);
        expect(preview.children[0].className).toBe("timeline-dock__media-preview-image");
        expect(preview.children[0].src).toBe("/assets/thumbs/earthrise.jpg");
        expect(preview.children[0].hidden).toBe(false);
        preview.children[0].dispatchEvent({ type: "load" });
        expect(preview.className).toBe("timeline-dock__media-preview is-visible");
        expect(preview.hidden).toBe(false);
        expect(preview.children[0].hidden).toBe(false);
        expect(preview.children[1].textContent).toBe("Earthrise");
        expect(mediaMarkers.children[1].className).toContain("timeline-dock__media-marker--segment");
        expect(mediaMarkers.children[1].className).toContain("timeline-dock__media-marker--videoClip");
        expect(mediaMarkers.children[1].style.left).toBe("20%");
        expect(mediaMarkers.children[1].style.width).toBe("30%");
        expect(mediaMarkers.children[2].className).toContain("timeline-dock__media-marker--segment");
        expect(mediaMarkers.children[2].className).toContain("timeline-dock__media-marker--audioClip");
        expect(mediaMarkers.children[2].className).toContain("timeline-dock__media-marker--estimated");
        expect(mediaMarkers.children[2].className).toContain("timeline-dock__media-marker--segment-clipped-start");
        expect(mediaMarkers.children[2].style.left).toBe("0%");
        expect(mediaMarkers.children[2].style.width).toBe("10%");
    });

    it("emits a media marker selection event when clicking a reachable media marker", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const mediaMarkers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const dispatchedEvents = [];

        global.CustomEvent = class {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        };
        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-media-markers") return mediaMarkers;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
            dispatchEvent(event) {
                dispatchedEvents.push(event);
            },
        };

        const controller = createTimelineDockController({});
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 100,
        });
        controller.setMediaMarkers([
            {
                id: "earthset-photo",
                startTimeMs: 500,
                label: "Earthset Photo",
                mediaKind: "image",
                clickable: true,
            },
        ]);

        mediaMarkers.children[0].dispatchEvent({ type: "click" });

        expect(dispatchedEvents).toHaveLength(2);
        expect(dispatchedEvents[0].type).toBe("mission-timeline-user-seek");
        expect(dispatchedEvents[0].detail.phase).toBe("commit");
        expect(dispatchedEvents[0].detail.source).toBe("timeline-media-marker");
        expect(dispatchedEvents[0].detail.timeMs).toBe(500);
        expect(dispatchedEvents[1].type).toBe("mission-media-marker-select");
        expect(dispatchedEvents[1].detail.marker.id).toBe("earthset-photo");
        expect(dispatchedEvents[1].detail.timeMs).toBe(500);

        delete global.CustomEvent;
    });

    it("selects the exact media marker that receives a direct click", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const mediaMarkers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const dispatchedEvents = [];

        global.CustomEvent = class {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        };
        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-media-markers") return mediaMarkers;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
            dispatchEvent(event) {
                dispatchedEvents.push(event);
            },
        };

        const controller = createTimelineDockController({});
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 100,
        });
        controller.setMediaMarkers([
            {
                id: "earthrise-video",
                startTimeMs: 500,
                label: "Earthrise Video",
                mediaKind: "videoClip",
                mediaDisplayMode: "segment",
                endTimeMs: 800,
                clickable: true,
            },
            {
                id: "earthrise-photo",
                startTimeMs: 500,
                label: "Earthrise Photo",
                mediaKind: "image",
                clickable: true,
            },
        ]);

        mediaMarkers.children[1].dispatchEvent({
            type: "click",
            clientX: 500,
        });

        expect(dispatchedEvents[1].type).toBe("mission-media-marker-select");
        expect(dispatchedEvents[1].detail.marker.id).toBe("earthrise-photo");

        delete global.CustomEvent;
    });

    it("keeps media marker pointer clicks working while the hover thumbnail is still loading", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const mediaMarkers = new FakeElement("div", { left: 100, top: 120, width: 800, height: 20 });
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const trackWrap = new FakeElement("div", { left: 100, top: 100, width: 800, height: 90 });
        const scrubLane = new FakeElement("div", { left: 100, top: 152, width: 800, height: 24 });
        const timeClickLane = new FakeElement("div", { left: 100, top: 176, width: 800, height: 16 });
        const dispatchedEvents = [];

        trackWrap.appendChild(mediaMarkers);
        trackWrap.appendChild(scrubLane);
        trackWrap.appendChild(timeClickLane);
        timeClickLane.appendChild(slider);

        global.CustomEvent = class {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        };
        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-media-markers") return mediaMarkers;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                if (id === "timeline-time-click-lane") return timeClickLane;
                if (id === "timeline-scrub-lane") return scrubLane;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
            dispatchEvent(event) {
                dispatchedEvents.push(event);
            },
            addEventListener() {},
        };

        const controller = createTimelineDockController({});
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 100,
        });
        controller.setMediaMarkers([
            {
                id: "pending-thumb-photo",
                startTimeMs: 500,
                label: "Pending Thumb Photo",
                mediaKind: "image",
                thumbnailAssetUrl: "/assets/thumbs/pending.jpg",
                clickable: true,
            },
        ]);
        controller.bind();

        const marker = mediaMarkers.children[0];
        marker.rect = { left: 496, top: 120, width: 8, height: 20 };
        marker.dispatchEvent({ type: "pointerenter" });
        const preview = mediaMarkers.children.find((child) => child.className === "timeline-dock__media-preview");
        expect(preview).toBeTruthy();
        expect(preview.hidden).toBe(false);
        expect(preview.className).not.toContain("is-visible");

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerType: "mouse",
            button: 0,
            pointerId: 1,
            clientX: 500,
            clientY: 130,
            target: marker,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerType: "mouse",
            button: 0,
            pointerId: 1,
            clientX: 500,
            clientY: 130,
            target: marker,
        });

        expect(dispatchedEvents.find((event) => event.type === "mission-media-marker-select")?.detail.marker.id)
            .toBe("pending-thumb-photo");

        delete global.CustomEvent;
    });

    it("does not select or seek inactive background media markers", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const mediaMarkers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const seekTimes = [];
        const dispatchedEvents = [];

        global.CustomEvent = class {
            constructor(type, init = {}) {
                this.type = type;
                this.detail = init.detail;
            }
        };
        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-media-markers") return mediaMarkers;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
            dispatchEvent(event) {
                dispatchedEvents.push(event);
            },
        };

        const controller = createTimelineDockController({
            onSeekTime(timeMs, commit) {
                seekTimes.push({ timeMs, commit });
            },
        });
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 100,
        });
        controller.setMediaMarkers([
            {
                id: "broadcast-video",
                startTimeMs: 200,
                endTimeMs: 500,
                label: "Broadcast Video",
                mediaKind: "videoClip",
                mediaDisplayMode: "segment",
                clickable: false,
            },
        ]);

        expect(mediaMarkers.children[0].className).toContain("timeline-dock__media-marker--inactive");
        expect(mediaMarkers.children[0].getAttribute("aria-disabled")).toBe("true");

        mediaMarkers.children[0].dispatchEvent({ type: "click" });
        controller.setCurrentTime(300);

        expect(seekTimes).toEqual([]);
        expect(dispatchedEvents).toEqual([]);

        delete global.CustomEvent;
    });
});
