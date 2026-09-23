import { describe, expect, it } from "vitest";
import { createTimelineDockController } from "../src/platform/js/app/timeline-dock-controller.js";
import { FakeElement } from "./helpers/timeline-dock-element.js";

describe("timeline dock pointer seeking", () => {
    it("drags the visible playhead to seek the timeline time", () => {
        const dockRoot = new FakeElement("div");
        const trackWrap = new FakeElement("div", { left: 100, top: 100, width: 800, height: 76 });
        const timeClickLane = new FakeElement("div", { left: 100, top: 126, width: 800, height: 16 });
        const scrubLane = new FakeElement("div", { left: 100, top: 152, width: 800, height: 24 });
        const slider = new FakeElement("input", { left: 100, top: 126, width: 800, height: 16 });
        const playhead = new FakeElement("div", { left: 498, top: 108, width: 4, height: 68 });
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const seekTimes = [];
        const dispatchedEvents = [];

        timeClickLane.appendChild(slider);
        timeClickLane.appendChild(playhead);
        trackWrap.appendChild(timeClickLane);
        trackWrap.appendChild(scrubLane);
        trackWrap.appendChild(markers);

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-playhead") return playhead;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-time-click-lane") return timeClickLane;
                if (id === "timeline-scrub-lane") return scrubLane;
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
        controller.bind();
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 1,
        });
        controller.setCurrentTime(500);

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 31,
            pointerType: "mouse",
            button: 0,
            clientX: 500,
            clientY: 140,
            target: playhead,
        });
        trackWrap.dispatchEvent({
            type: "pointermove",
            pointerId: 31,
            pointerType: "mouse",
            clientX: 660,
            clientY: 140,
            target: playhead,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 31,
            pointerType: "mouse",
            clientX: 660,
            clientY: 140,
            target: playhead,
        });

        expect(seekTimes).toEqual([
            { timeMs: 700, commit: false },
            { timeMs: 700, commit: true },
        ]);
        expect(dispatchedEvents.map((event) => event.detail)).toEqual([
            { phase: "update", source: "timeline-playhead", commit: false, timeMs: 700 },
            { phase: "end", source: "timeline-playhead", commit: true, timeMs: 700 },
        ]);
        expect(slider.dataset.currentTimeMs).toBe("700");
    });

    it("still seeks when clicking a marker hitbox away from the visible glyph", () => {
        const dockRoot = new FakeElement("div");
        const trackWrap = new FakeElement("div", { left: 100, width: 800, height: 42 });
        const timeClickLane = new FakeElement("div", { left: 100, width: 800, height: 18 });
        const scrubLane = new FakeElement("div", { left: 100, width: 800, height: 30 });
        const slider = new FakeElement("input", { left: 100, width: 800, height: 24 });
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const seekTimes = [];

        timeClickLane.appendChild(slider);
        trackWrap.appendChild(timeClickLane);
        trackWrap.appendChild(scrubLane);
        trackWrap.appendChild(markers);

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-time-click-lane") return timeClickLane;
                if (id === "timeline-scrub-lane") return scrubLane;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        };

        const controller = createTimelineDockController({
            onSeekTime(timeMs, commit) {
                seekTimes.push({ timeMs, commit });
            },
        });
        controller.bind();
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 1,
        });
        controller.setEvents([
            { key: "event-mid", startTime: new Date(500), label: "Midpoint Event", clickable: true },
        ]);

        const marker = markers.children[0];
        const markerCenterX = 500;
        const markerHitboxButNotGlyphX = markerCenterX + 20;

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 9,
            pointerType: "mouse",
            button: 0,
            clientX: markerHitboxButNotGlyphX,
            target: marker,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 9,
            pointerType: "mouse",
            clientX: markerHitboxButNotGlyphX,
            target: marker,
        });

        expect(seekTimes).toHaveLength(1);
        expect(seekTimes[0].commit).toBe(true);
        expect(seekTimes[0].timeMs).toBeGreaterThan(500);
    });

    it("seeks when clicking the empty media marker lane", () => {
        const dockRoot = new FakeElement("div");
        const trackWrap = new FakeElement("div", { left: 100, width: 800, height: 42 });
        const scrubLane = new FakeElement("div", { left: 100, width: 800, height: 30 });
        const timeClickLane = new FakeElement("div", { left: 100, width: 800, height: 18 });
        const slider = new FakeElement("input", { left: 100, width: 800, height: 24 });
        const markers = new FakeElement("div");
        const mediaMarkers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const seekTimes = [];

        scrubLane.appendChild(slider);
        trackWrap.appendChild(scrubLane);
        trackWrap.appendChild(markers);
        trackWrap.appendChild(mediaMarkers);

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-media-markers") return mediaMarkers;
                if (id === "timeline-scrub-lane") return scrubLane;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        };

        const controller = createTimelineDockController({
            onSeekTime(timeMs, commit) {
                seekTimes.push({ timeMs, commit });
            },
        });
        controller.bind();
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 1,
        });

        const laneClickX = 700;
        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 12,
            pointerType: "mouse",
            button: 0,
            clientX: laneClickX,
            target: mediaMarkers,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 12,
            pointerType: "mouse",
            clientX: laneClickX,
            target: mediaMarkers,
        });

        expect(seekTimes).toEqual([
            { timeMs: 750, commit: true },
        ]);
    });

    it("selects and seeks media segments from direct media-lane clicks", () => {
        const dockRoot = new FakeElement("div");
        const trackWrap = new FakeElement("div", { left: 100, top: 100, width: 800, height: 76 });
        const mediaMarkers = new FakeElement("div", { left: 100, top: 100, width: 800, height: 18 });
        const markers = new FakeElement("div", { left: 100, top: 123, width: 800, height: 20 });
        const timeClickLane = new FakeElement("div", { left: 100, top: 126, width: 800, height: 16 });
        const scrubLane = new FakeElement("div", { left: 100, top: 152, width: 800, height: 24 });
        const slider = new FakeElement("input", { left: 100, top: 126, width: 800, height: 16 });
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const seekTimes = [];
        const dispatchedEvents = [];

        timeClickLane.appendChild(slider);
        trackWrap.appendChild(mediaMarkers);
        trackWrap.appendChild(markers);
        trackWrap.appendChild(timeClickLane);
        trackWrap.appendChild(scrubLane);

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
                if (id === "timeline-time-click-lane") return timeClickLane;
                if (id === "timeline-scrub-lane") return scrubLane;
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
        controller.bind();
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 1,
        });
        controller.setMediaMarkers([
            {
                id: "earthrise-video",
                startTimeMs: 200,
                endTimeMs: 500,
                label: "Earthrise Video",
                mediaKind: "videoClip",
                mediaDisplayMode: "segment",
                clickable: true,
            },
            {
                id: "earthrise-photo",
                startTimeMs: 200,
                endTimeMs: 500,
                label: "Earthrise Photo",
                mediaKind: "image",
                mediaDisplayMode: "segment",
                clickable: true,
            },
        ]);
        mediaMarkers.children[0].rect = { left: 260, top: 100, width: 240, height: 10 };
        mediaMarkers.children[1].rect = { left: 260, top: 100, width: 240, height: 10 };
        const visibleVideoMarker = mediaMarkers.children[0];

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 13,
            pointerType: "mouse",
            button: 0,
            clientX: 420,
            clientY: 108,
            target: visibleVideoMarker,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 13,
            pointerType: "mouse",
            clientX: 420,
            clientY: 108,
            target: visibleVideoMarker,
        });

        expect(seekTimes).toEqual([{ timeMs: 400, commit: true }]);
        expect(dispatchedEvents).toHaveLength(2);
        expect(dispatchedEvents[0].type).toBe("mission-timeline-user-seek");
        expect(dispatchedEvents[0].detail.source).toBe("timeline-media-marker");
        expect(dispatchedEvents[0].detail.timeMs).toBe(400);
        expect(dispatchedEvents[1].type).toBe("mission-media-marker-select");
        expect(dispatchedEvents[1].detail.marker.id).toBe("earthrise-video");
        expect(dispatchedEvents[1].detail.timeMs).toBe(400);

        delete global.CustomEvent;
    });

    it("uses pointer coordinates to keep click and scrub bands distinct", () => {
        const dockRoot = new FakeElement("div");
        const trackWrap = new FakeElement("div", { left: 100, top: 100, width: 800, height: 76 });
        const mediaMarkers = new FakeElement("div", { left: 100, top: 100, width: 800, height: 18 });
        const markers = new FakeElement("div", { left: 100, top: 123, width: 800, height: 20 });
        const timeClickLane = new FakeElement("div", { left: 100, top: 126, width: 800, height: 16 });
        const scrubLane = new FakeElement("div", { left: 100, top: 152, width: 800, height: 24 });
        const slider = new FakeElement("input", { left: 100, top: 126, width: 800, height: 16 });
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const seekTimes = [];

        timeClickLane.appendChild(slider);
        trackWrap.appendChild(mediaMarkers);
        trackWrap.appendChild(markers);
        trackWrap.appendChild(timeClickLane);
        trackWrap.appendChild(scrubLane);

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-media-markers") return mediaMarkers;
                if (id === "timeline-time-click-lane") return timeClickLane;
                if (id === "timeline-scrub-lane") return scrubLane;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        };

        const controller = createTimelineDockController({
            onSeekTime(timeMs, commit) {
                seekTimes.push({ timeMs, commit });
            },
        });
        controller.bind();
        controller.setRange({
            startTimeMs: 0,
            endTimeMs: 1000,
            stepMs: 1,
        });

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 21,
            pointerType: "mouse",
            button: 0,
            clientX: 500,
            clientY: 146,
            target: trackWrap,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 21,
            pointerType: "mouse",
            clientX: 500,
            clientY: 146,
            target: trackWrap,
        });
        expect(seekTimes).toHaveLength(0);

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 22,
            pointerType: "mouse",
            button: 0,
            clientX: 500,
            clientY: 134,
            target: trackWrap,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 22,
            pointerType: "mouse",
            clientX: 500,
            clientY: 134,
            target: trackWrap,
        });
        expect(seekTimes).toEqual([{ timeMs: 500, commit: true }]);

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 23,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
            clientY: 164,
            target: trackWrap,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 23,
            pointerType: "mouse",
            clientX: 300,
            clientY: 164,
            target: trackWrap,
        });
        expect(seekTimes).toEqual([{ timeMs: 500, commit: true }]);

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 24,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
            clientY: 164,
            target: trackWrap,
        });
        trackWrap.dispatchEvent({
            type: "pointermove",
            pointerId: 24,
            pointerType: "mouse",
            clientX: 500,
            clientY: 164,
            target: trackWrap,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 24,
            pointerType: "mouse",
            clientX: 500,
            clientY: 164,
            target: trackWrap,
        });
        expect(seekTimes).toEqual([
            { timeMs: 500, commit: true },
        ]);
    });

    it("does not seek when grab-bar pointer input arrives before controller range state", () => {
        const dockRoot = new FakeElement("div");
        const trackWrap = new FakeElement("div", { left: 100, width: 800, height: 42 });
        const scrubLane = new FakeElement("div", { left: 100, width: 800, height: 30 });
        const timeClickLane = new FakeElement("div", { left: 100, width: 800, height: 18 });
        const slider = new FakeElement("input", { left: 100, width: 800, height: 24 });
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const seekTimes = [];

        slider.min = "1000";
        slider.max = "2000";
        slider.value = "1200";
        timeClickLane.appendChild(slider);
        trackWrap.appendChild(timeClickLane);
        trackWrap.appendChild(scrubLane);
        trackWrap.appendChild(markers);

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-time-click-lane") return timeClickLane;
                if (id === "timeline-scrub-lane") return scrubLane;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        };

        const controller = createTimelineDockController({
            onSeekTime(timeMs, commit) {
                seekTimes.push({ timeMs, commit });
            },
        });
        controller.bind();

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 42,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
            target: scrubLane,
        });

        expect(seekTimes).toHaveLength(0);

        trackWrap.dispatchEvent({
            type: "pointermove",
            pointerId: 42,
            pointerType: "mouse",
            clientX: 500,
            target: scrubLane,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 42,
            pointerType: "mouse",
            clientX: 500,
            target: scrubLane,
        });

        expect(seekTimes).toEqual([]);
    });

    it("uses programmatic seek precision and source when range input values snap to the step grid", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const modeLabel = new FakeElement("div");
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
            dispatchEvent(event) {
                dispatchedEvents.push(event);
            },
        };

        const controller = createTimelineDockController({
            onSeekTime(timeMs) {
                seekTimes.push(timeMs);
            },
        });
        controller.setRange({
            startTimeMs: 1000,
            endTimeMs: 3000,
            stepMs: 100,
        });
        controller.setEvents([
            { key: "e1", startTime: new Date(1234), label: "E1" },
            { key: "e2", startTime: new Date(2000), label: "E2" },
        ]);
        controller.bind();

        slider.value = "1200";
        slider.dataset.programmaticSeekTimeMs = "1234";
        slider.dataset.programmaticSeekSource = "frame-shoot";
        slider.dispatchEvent({ type: "input" });

        expect(seekTimes).toEqual([1234]);
        expect(slider.dataset.currentTimeMs).toBe("1234");
        expect(dispatchedEvents).toHaveLength(1);
        expect(dispatchedEvents[0].type).toBe("mission-timeline-user-seek");
        expect(dispatchedEvents[0].detail).toEqual(expect.objectContaining({
            phase: "update",
            source: "frame-shoot",
            timeMs: 1234,
            commit: false,
        }));
        expect(markers.children[0].className).toContain("timeline-dock__marker--current-event");
        expect(markers.children[0].className).not.toContain("timeline-dock__marker--time-boundary");

        delete global.CustomEvent;
    });
});
