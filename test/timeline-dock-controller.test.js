import { describe, expect, it } from "vitest";
import { createTimelineDockController } from "../src/platform/js/app/timeline-dock-controller.js";
import { FakeElement } from "./helpers/timeline-dock-element.js";

describe("timeline dock readout and scale", () => {
    it("renders craft chips for multiple visible crafts", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const modeLabel = new FakeElement("div");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        craftStrip.className = "timeline-dock__craft-strip timeline-dock__craft-strip--hidden";

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
        controller.setCrafts([
            {
                id: "CH3L",
                label: "Vikram",
                color: "#f472b6",
                roleLabel: "Primary",
                active: true,
            },
            {
                id: "CH3O",
                label: "Propulsion Module",
                color: "#38bdf8",
                roleLabel: "Additional",
                active: false,
            },
        ]);

        expect(craftStrip.classList.contains("timeline-dock__craft-strip--hidden")).toBe(false);
        expect(craftStrip.children).toHaveLength(2);
        expect(craftStrip.children[0].className).toContain("timeline-dock__craft-chip--active");
        expect(craftStrip.children[0].children[0].className).toBe("timeline-dock__craft-swatch");
        expect(craftStrip.children[0].children[0].style.backgroundColor).toBe("#f472b6");
        expect(craftStrip.children[0].children[1].textContent).toBe("Vikram");
        expect(craftStrip.children[1].children[2].textContent).toBe("Additional");
    });

    it("hides the craft strip when zero or one craft is visible", () => {
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
        controller.setCrafts([{ id: "CH3L", label: "Vikram" }]);

        expect(craftStrip.classList.contains("timeline-dock__craft-strip--hidden")).toBe(true);
        expect(craftStrip.children).toHaveLength(0);
    });

    it("shows current time in inferred local timezone without UTC offset", () => {
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
        const timestamp = Date.UTC(2026, 3, 2, 12, 34, 56);
        controller.setRange({
            startTimeMs: timestamp - 1000,
            endTimeMs: timestamp + 1000,
            stepMs: 1000,
        });
        controller.setCurrentTime(timestamp);

        expect(currentLabel.textContent).not.toMatch(/UTC[+-]\d{2}:\d{2}$/);
        expect(slider.attributes["aria-valuetext"]).toContain(currentLabel.textContent);
        expect(slider.attributes["aria-valuetext"]).toContain("UTC year elapsed time UTC 091:12:34:56");
        expect(slider.attributes["aria-valuetext"]).toContain("mission elapsed time MET +0d 00h 00m 01s");
        expect(startLabel.innerHTML).toMatch(/UTC[+-]\d{2}:\d{2}</);
    });

    it("shows mission elapsed time beside the current timeline date", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input");
        const markers = new FakeElement("div");
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const modeLabel = new FakeElement("div");
        const currentLabel = new FakeElement("div");
        const utcYearElapsedLabel = new FakeElement("div");
        const missionElapsedLabel = new FakeElement("div");
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
                if (id === "timeline-utc-year-elapsed-label") return utcYearElapsedLabel;
                if (id === "timeline-mission-elapsed-label") return missionElapsedLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        };

        const controller = createTimelineDockController({});
        const startTimeMs = Date.UTC(2026, 3, 2, 10, 0, 0);
        const currentTimeMs = startTimeMs + (((4 * 24 + 20) * 60 + 27) * 60 + 8) * 1000;
        controller.setRange({
            startTimeMs,
            endTimeMs: currentTimeMs + 60000,
            stepMs: 1000,
        });
        controller.setCurrentTime(currentTimeMs);

        expect(currentLabel.textContent).not.toContain("MET");
        expect(utcYearElapsedLabel.hidden).toBe(false);
        expect(utcYearElapsedLabel.textContent).toBe("UTC 096:06:27:08");
        expect(missionElapsedLabel.hidden).toBe(false);
        expect(missionElapsedLabel.textContent).toBe("MET +4d 20h 27m 08s");
        expect(slider.attributes["aria-valuetext"]).toContain("UTC year elapsed time UTC 096:06:27:08");
        expect(slider.attributes["aria-valuetext"]).toContain("mission elapsed time MET +4d 20h 27m 08s");
    });

    it("renders progressive time labels and lets scale controls zoom and pan the visible window", () => {
        const dockRoot = new FakeElement("div");
        const slider = new FakeElement("input", { width: 860, height: 40 });
        const markers = new FakeElement("div");
        const timeLabels = new FakeElement("div", { width: 860, height: 14 });
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const modeLabel = new FakeElement("div");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const panLeftButton = new FakeElement("button");
        const scaleContractButton = new FakeElement("button");
        const scaleResetButton = new FakeElement("button");
        const scaleExpandButton = new FakeElement("button");
        const panRightButton = new FakeElement("button");

        global.document = {
            getElementById(id) {
                if (id === "timeline-dock") return dockRoot;
                if (id === "timeline-slider") return slider;
                if (id === "timeline-markers") return markers;
                if (id === "timeline-time-labels") return timeLabels;
                if (id === "timeline-start-label") return startLabel;
                if (id === "timeline-end-label") return endLabel;
                if (id === "timeline-mode-label") return modeLabel;
                if (id === "timeline-current-label") return currentLabel;
                if (id === "timeline-craft-strip") return craftStrip;
                if (id === "timeline-pan-left") return panLeftButton;
                if (id === "timeline-scale-contract") return scaleContractButton;
                if (id === "timeline-scale-reset") return scaleResetButton;
                if (id === "timeline-scale-expand") return scaleExpandButton;
                if (id === "timeline-pan-right") return panRightButton;
                return null;
            },
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        };

        const controller = createTimelineDockController({});
        controller.bind();
        controller.setRange({
            startTimeMs: new Date(2026, 3, 1, 0, 0, 0).getTime(),
            endTimeMs: new Date(2026, 3, 12, 0, 0, 0).getTime(),
            stepMs: 60000,
        });
        controller.setEvents([
            { key: "early", startTime: new Date(2026, 3, 2, 0, 0, 0), label: "Early" },
            { key: "middle", startTime: new Date(2026, 3, 6, 12, 0, 0), label: "Middle" },
            { key: "late", startTime: new Date(2026, 3, 10, 0, 0, 0), label: "Late" },
        ]);

        const initialCount = timeLabels.children.length;
        const initialStart = startLabel.innerHTML;
        expect(initialCount).toBeGreaterThan(0);
        expect(timeLabels.children[0].className).toBe("timeline-dock__time-label");
        expect(timeLabels.children[0].textContent).toMatch(/^Apr \d+$/);
        expect(timeLabels.children.some((child) => (
            child.className === "timeline-dock__time-tick timeline-dock__time-tick--minor"
        ))).toBe(true);
        expect(scaleResetButton.disabled).toBe(true);
        expect(markers.children).toHaveLength(3);

        scaleExpandButton.dispatchEvent({ type: "click" });

        expect(startLabel.innerHTML).not.toBe(initialStart);
        expect(markers.children.length).toBeLessThan(3);
        expect(scaleResetButton.disabled).toBe(false);
        expect(scaleContractButton.disabled).toBe(false);

        const zoomedStart = startLabel.innerHTML;
        panRightButton.dispatchEvent({ type: "click" });

        expect(startLabel.innerHTML).not.toBe(zoomedStart);
        expect(panLeftButton.disabled).toBe(false);

        scaleResetButton.dispatchEvent({ type: "click" });

        expect(timeLabels.children.length).toBe(initialCount);
        expect(startLabel.innerHTML).toBe(initialStart);
        expect(markers.children).toHaveLength(3);
        expect(scaleResetButton.disabled).toBe(true);
    });

    it("supports wheel zoom plus playhead drag and click seeking on the timeline strip", () => {
        const dockRoot = new FakeElement("div");
        const trackWrap = new FakeElement("div", { left: 100, width: 800, height: 42 });
        const scrubLane = new FakeElement("div", { left: 100, width: 800, height: 30 });
        const timeClickLane = new FakeElement("div", { left: 100, width: 800, height: 18 });
        const slider = new FakeElement("input", { left: 100, width: 800, height: 24 });
        const markers = new FakeElement("div");
        const timeLabels = new FakeElement("div", { left: 100, width: 800, height: 14 });
        const startLabel = new FakeElement("span");
        const endLabel = new FakeElement("span");
        const currentLabel = new FakeElement("div");
        const craftStrip = new FakeElement("div");
        const seekTimes = [];

        timeClickLane.appendChild(slider);
        scrubLane.appendChild(timeLabels);
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
                if (id === "timeline-time-labels") return timeLabels;
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
        controller.setCurrentTime(500);

        const fullSpan = Number(slider.max) - Number(slider.min);
        trackWrap.dispatchEvent({
            type: "wheel",
            deltaX: 0,
            deltaY: -100,
            deltaMode: 0,
            clientX: 500,
        });

        const zoomedMin = Number(slider.min);
        const zoomedSpan = Number(slider.max) - zoomedMin;
        expect(zoomedSpan).toBeLessThan(fullSpan);
        expect(dockRoot.classList.contains("timeline-dock--zoomed")).toBe(true);
        const timeBeforePan = slider.dataset.currentTimeMs;

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 1,
            pointerType: "mouse",
            button: 0,
            clientX: 500,
            target: scrubLane,
        });
        expect(seekTimes).toHaveLength(0);
        trackWrap.dispatchEvent({
            type: "pointermove",
            pointerId: 1,
            pointerType: "mouse",
            clientX: 600,
            target: scrubLane,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 1,
            pointerType: "mouse",
            clientX: 600,
            target: scrubLane,
        });

        expect(Number(slider.min)).toBeLessThan(zoomedMin);
        expect(dockRoot.classList.contains("timeline-dock--timeline-dragging")).toBe(false);
        expect(seekTimes).toHaveLength(0);
        expect(slider.dataset.currentTimeMs).toBe(timeBeforePan);

        trackWrap.dispatchEvent({
            type: "pointerdown",
            pointerId: 2,
            pointerType: "mouse",
            button: 0,
            clientX: 700,
            target: timeClickLane,
        });
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 2,
            pointerType: "mouse",
            clientX: 700,
            target: timeClickLane,
        });

        expect(seekTimes).toHaveLength(1);
        const committedSeeks = seekTimes.filter((entry) => entry.commit === true);
        expect(committedSeeks.length).toBe(1);
        const lastSeek = seekTimes[seekTimes.length - 1];
        expect(lastSeek.commit).toBe(true);
        expect(lastSeek.timeMs).toBeGreaterThan(Number(slider.min));
        expect(lastSeek.timeMs).toBeLessThan(Number(slider.max));

        const inertScrubClickEvent = {
            type: "pointerdown",
            pointerId: 3,
            pointerType: "mouse",
            button: 0,
            clientX: 700,
            target: scrubLane,
        };
        trackWrap.dispatchEvent(inertScrubClickEvent);

        expect(inertScrubClickEvent.defaultPrevented).toBe(true);
        expect(dockRoot.classList.contains("timeline-dock--timeline-dragging")).toBe(true);
        expect(seekTimes).toHaveLength(1);
        trackWrap.dispatchEvent({
            type: "pointerup",
            pointerId: 3,
            pointerType: "mouse",
            clientX: 700,
            target: scrubLane,
        });
        expect(dockRoot.classList.contains("timeline-dock--timeline-dragging")).toBe(false);
        expect(seekTimes).toHaveLength(1);
    });
});
