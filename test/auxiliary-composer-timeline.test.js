import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { AuxiliaryCameraViewsManager } from "../src/platform/js/app/auxiliary-camera-views.js";
import {
    resolveFlybyPlannerEvents,
    resolveLunarFlybyTimeMs,
    resolveLunarFlybyWindowMs,
} from "../src/platform/js/core/domain/composer-flyby-events.js";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("resolveLunarFlybyWindowMs", () => {
    it("returns SOI entry/exit bounds when present in mission events", () => {
        const paddingMs = 5 * 60 * 1000;
        const startMs = Date.UTC(2026, 3, 6, 4, 43, 12);
        const endMs = Date.UTC(2026, 3, 7, 17, 27, 12);
        const window = resolveLunarFlybyWindowMs([
            {
                key: "lunarSoiEntry",
                label: "Lunar SOI In",
                startTime: new Date(startMs),
            },
            {
                key: "closestApproach",
                label: "Lunar Flyby",
                startTime: new Date(Date.UTC(2026, 3, 6, 23, 6, 12)),
            },
            {
                key: "lunarSoiExit",
                label: "Lunar SOI Out",
                startTime: new Date(endMs),
            },
        ]);

        expect(window.startMs).toBe(startMs - paddingMs);
        expect(window.endMs).toBe(endMs + paddingMs);
    });

    it("returns NaN bounds when SOI entry/exit events are missing", () => {
        const window = resolveLunarFlybyWindowMs([
            {
                key: "closestApproach",
                label: "Lunar Flyby",
                startTime: new Date(Date.UTC(2026, 3, 6, 23, 6, 12)),
            },
        ]);

        expect(Number.isNaN(window.startMs)).toBe(true);
        expect(Number.isNaN(window.endMs)).toBe(true);
    });

    it("rejects a reversed SOI window", () => {
        const window = resolveLunarFlybyWindowMs([
            {
                key: "lunarSoiEntry",
                label: "Lunar SOI In",
                startTime: "2026-04-07T17:27:12Z",
            },
            {
                key: "lunarSoiExit",
                label: "Lunar SOI Out",
                startTime: "2026-04-06T04:43:12Z",
            },
        ]);

        expect(Number.isNaN(window.startMs)).toBe(true);
        expect(Number.isNaN(window.endMs)).toBe(true);
    });

    it("accepts authored label, tokenized key, and narrative SOI boundary variants", () => {
        const entryTime = Date.parse("2026-04-06T04:43:12Z");
        const exitTime = Date.parse("2026-04-07T17:27:12Z");
        const window = resolveLunarFlybyWindowMs([
            { key: "invalid", label: "Invalid", startTime: "not-a-date" },
            { key: "boundary", label: "Lunar SOI Entry", startTime: entryTime },
            { key: "moon soi ingress", label: "Boundary", startTime: entryTime + 1_000 },
            {
                key: "narrative-entry",
                label: "Boundary",
                infoText: "The craft enters the lunar sphere of influence",
                startTime: entryTime + 2_000,
            },
            { key: "boundary", label: "Moon SOI Exit", startTime: exitTime },
            { key: "lunar soi egress", label: "Boundary", startTime: exitTime - 1_000 },
            {
                key: "narrative-exit",
                label: "Boundary",
                hoverText: "The craft exits the Moon sphere of influence",
                startTime: exitTime - 2_000,
            },
        ]);

        expect(window).toEqual({
            startMs: entryTime - (5 * 60 * 1000),
            endMs: exitTime + (5 * 60 * 1000),
        });
        const absentWindow = resolveLunarFlybyWindowMs(null);
        expect(Number.isNaN(absentWindow.startMs)).toBe(true);
        expect(Number.isNaN(absentWindow.endMs)).toBe(true);
    });
});

describe("Frame and Shoot flyby event resolution", () => {
    it("prefers a named closest approach over broader lunar-flyby narratives", () => {
        const narrativeTime = Date.parse("2026-04-06T22:00:00Z");
        const explicitTime = Date.parse("2026-04-06T23:06:12Z");

        expect(resolveLunarFlybyTimeMs([
            {
                key: "missionUpdate",
                label: "Mission update",
                hoverText: "The craft begins its lunar flyby",
                startTime: narrativeTime,
            },
            {
                key: "closestApproach",
                label: "Closest Approach",
                startTime: explicitTime,
            },
        ])).toBe(explicitTime);
    });

    it("prefers a non-burn event and then the earliest time for equally strong matches", () => {
        const earliestTime = Date.parse("2026-04-06T23:06:12Z");
        const laterTime = Date.parse("2026-04-06T23:07:12Z");

        expect(resolveLunarFlybyTimeMs([
            {
                key: "closestApproachBurn",
                label: "Closest Approach",
                burnFlag: true,
                startTime: earliestTime - 60_000,
            },
            {
                key: "closestApproachLate",
                label: "Closest Approach",
                startTime: laterTime,
            },
            {
                key: "closestApproachEarly",
                label: "Closest Approach",
                startTime: earliestTime,
            },
        ])).toBe(earliestTime);
    });

    it("recognizes explicit, tokenized, and narrative lunar flyby variants", () => {
        const explicitTime = Date.parse("2026-04-06T23:06:12Z");

        expect(resolveLunarFlybyTimeMs([
            {
                key: "broadcast",
                label: "Moon Flyby",
                startTime: explicitTime,
            },
            {
                key: "moon-pass",
                label: "Flyby",
                startTime: explicitTime - 1_000,
            },
            {
                key: "missionUpdate",
                label: "Mission update",
                infoText: "Lunar perilune is now",
                startTime: explicitTime - 2_000,
            },
        ])).toBe(explicitTime);
    });

    it("returns NaN when no valid lunar flyby event can be identified", () => {
        expect(Number.isNaN(resolveLunarFlybyTimeMs([
            { key: "launch", label: "Launch", startTime: "2026-04-01T00:00:00Z" },
            { key: "lunarFlyby", label: "Lunar Flyby", startTime: "not-a-date" },
        ]))).toBe(true);
        expect(Number.isNaN(resolveLunarFlybyTimeMs(null))).toBe(true);
    });

    it("returns canonical pills in display order from key and label matches", () => {
        const exitTime = Date.parse("2026-04-07T17:27:12Z");
        const entryTime = Date.parse("2026-04-06T04:43:12Z");
        const approachTime = Date.parse("2026-04-06T23:06:12Z");

        expect(resolveFlybyPlannerEvents([
            { key: "lunar_soi_out", label: "Boundary crossed", startTime: exitTime },
            { key: "unknown", label: "Earth set", startTime: "2026-04-06T08:00:00Z" },
            { key: "closest-approach", label: "Perilune", startTime: approachTime },
            { key: "lunarSoiEntry", label: "Lunar SOI In", startTime: entryTime },
            { key: "bad", label: "Earthrise", startTime: "invalid" },
        ])).toEqual([
            {
                id: "lunarSoiEntry",
                title: "Lunar SOI In",
                timeMs: entryTime,
                sourceLabel: "Lunar SOI In",
            },
            {
                id: "earthSet",
                title: "Earthset",
                timeMs: Date.parse("2026-04-06T08:00:00Z"),
                sourceLabel: "Earth set",
            },
            {
                id: "closestApproach",
                title: "Closest Approach",
                timeMs: approachTime,
                sourceLabel: "Perilune",
            },
            {
                id: "lunarSoiExit",
                title: "Lunar SOI Out",
                timeMs: exitTime,
                sourceLabel: "Boundary crossed",
            },
        ]);
    });

    it("returns no planner pills for absent or unmatched events", () => {
        expect(resolveFlybyPlannerEvents()).toEqual([]);
        expect(resolveFlybyPlannerEvents([
            { key: "launch", label: "Launch", startTime: 100 },
        ])).toEqual([]);
    });
});

describe("Frame and Shoot timeline phase tracking", () => {
    const phases = [
        {
            id: "launch",
            label: "Launch & Earth Orbit",
            startMs: 0,
            endMs: 100,
            events: [{ key: "launch" }, { key: "solarArrays" }],
        },
        {
            id: "lunar",
            label: "Lunar Flyby",
            startMs: 100,
            endMs: 200,
            events: [{ key: "lunarSoiEntry" }, { key: "closestApproach" }],
        },
    ];

    function createTimelineHarness() {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
            composerTimelinePhases: phases,
            composerSelectedPhaseIndex: -1,
            composerActivePhaseIndex: -1,
            composerFlybyEvents: [],
            readMainTimelineState: vi.fn(),
            syncComposerTransportUi: vi.fn(),
            syncComposerPhaseSelect: vi.fn(),
            setComposerInteractionEnabled: vi.fn(),
            setComposerTimelineLocalText: vi.fn(),
            syncComposerFlybyEventPills: vi.fn(),
        });
        const panelState = {
            composerTimelineSlider: { value: "" },
            composerTimelineLabel: { textContent: "" },
            composerTimelineDragging: false,
        };
        return { manager, panelState };
    }

    it("does not permanently pin the first rendered phase before the composer seek lands", () => {
        const { manager, panelState } = createTimelineHarness();
        manager.readMainTimelineState.mockReturnValue({
            min: 0,
            max: 200,
            value: 50,
            stepMs: 1,
        });

        manager.syncComposerTimelineUi(panelState);

        expect(manager.composerActivePhaseIndex).toBe(0);
        expect(manager.composerSelectedPhaseIndex).toBe(-1);

        manager.readMainTimelineState.mockReturnValue({
            min: 0,
            max: 200,
            value: 150,
            stepMs: 1,
        });
        manager.syncComposerTimelineUi(panelState);

        expect(manager.composerActivePhaseIndex).toBe(1);
        expect(manager.composerSelectedPhaseIndex).toBe(-1);
        expect(manager.composerFlybyEvents.map((eventInfo) => eventInfo.key)).toEqual([
            "lunarSoiEntry",
            "closestApproach",
        ]);
    });

    it("clears an explicit phase selection after the timeline moves outside it", () => {
        const { manager, panelState } = createTimelineHarness();
        manager.composerSelectedPhaseIndex = 0;
        manager.readMainTimelineState.mockReturnValue({
            min: 0,
            max: 200,
            value: 150,
            stepMs: 1,
        });

        manager.syncComposerTimelineUi(panelState);

        expect(manager.composerSelectedPhaseIndex).toBe(-1);
        expect(manager.composerActivePhaseIndex).toBe(1);
    });

    it("seeks to the middle of a selected phase instead of the boundary", () => {
        const { manager } = createTimelineHarness();

        expect(manager.resolveComposerPhaseSeekTimeMs({
            phase: phases[1],
            timelineMinMs: 0,
            timelineMaxMs: 200,
            stepMs: 10,
        })).toBe(150);
    });

    it("keeps selected phase seeks inside very short phase ranges", () => {
        const { manager } = createTimelineHarness();

        expect(manager.resolveComposerPhaseSeekTimeMs({
            phase: { startMs: 100, endMs: 101 },
            timelineMinMs: 0,
            timelineMaxMs: 200,
            stepMs: 10,
        })).toBe(100);
    });

    it("nudges Frame and Shoot transport by absolute mission time instead of phase bounds", () => {
        const { manager, panelState } = createTimelineHarness();
        panelState.composerTimelineStartMs = 100;
        panelState.composerTimelineEndMs = 200;

        expect(manager.resolveComposerTransportStepTimeMs({
            min: 0,
            max: 1000,
            value: 150,
        }, -60)).toBe(90);
        expect(manager.resolveComposerTransportStepTimeMs({
            min: 0,
            max: 1000,
            value: 150,
        }, 60)).toBe(210);
    });

    it("reads Frame and Shoot transport time from the full timeline range when the playhead is outside the zoomed view", () => {
        class FakeInput {}
        const slider = new FakeInput();
        Object.assign(slider, {
            min: "400000",
            max: "500000",
            value: "400000",
            step: "1000",
            dataset: {
                currentTimeMs: "900000",
                rangeMinMs: "0",
                rangeMaxMs: "1000000",
            },
            ownerDocument: {
                defaultView: {
                    HTMLInputElement: FakeInput,
                },
            },
        });
        vi.stubGlobal("document", {
            getElementById: vi.fn((id) => (id === "timeline-slider" ? slider : null)),
        });
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });

        const timelineState = manager.readMainTimelineState();

        expect(timelineState).toMatchObject({
            min: 0,
            max: 1000000,
            value: 900000,
            stepMs: 1000,
        });
        expect(manager.resolveComposerTransportStepTimeMs(timelineState, -60000)).toBe(840000);
    });

    it("programmatic Frame and Shoot seeks keep the real target time even outside the visible timeline window", () => {
        class FakeInput {
            dispatchEvent(event) {
                this.events.push(event.type);
            }
        }
        class FakeEvent {
            constructor(type, options = {}) {
                this.type = type;
                this.bubbles = options.bubbles === true;
            }
        }
        const slider = new FakeInput();
        Object.assign(slider, {
            min: "400000",
            max: "500000",
            value: "400000",
            step: "1000",
            dataset: {
                currentTimeMs: "900000",
                rangeMinMs: "0",
                rangeMaxMs: "1000000",
            },
            events: [],
            ownerDocument: {
                defaultView: {
                    HTMLInputElement: FakeInput,
                },
            },
        });
        vi.stubGlobal("Event", FakeEvent);
        vi.stubGlobal("document", {
            getElementById: vi.fn((id) => (id === "timeline-slider" ? slider : null)),
        });
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            THREE: {
                MathUtils: {
                    clamp(value, min, max) {
                        return Math.min(Math.max(value, min), max);
                    },
                },
            },
        });

        manager.seekMainTimelineTime(840000, true);

        expect(slider.value).toBe("500000");
        expect(slider.dataset.currentTimeMs).toBe("840000");
        expect(slider.dataset.programmaticSeekSource).toBe("frame-shoot");
        expect(slider.dataset.programmaticSeekTimeMs).toBe("840000");
        expect(slider.events).toEqual(["input", "change"]);
    });

    it("restores the guided composer view without seeking the main timeline by default", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            restorePanel: vi.fn(),
            applyComposerGuidedViewState: vi.fn(() => true),
            seekMainTimelineTime: vi.fn(),
            requestRender: vi.fn(),
            queuePersistPanelState: vi.fn(),
        });
        const panelState = {
            mode: "composer",
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        };

        expect(manager.restoreComposerGuidedPanel(panelState)).toBe(true);

        expect(manager.restorePanel).toHaveBeenCalledWith(panelState);
        expect(manager.applyComposerGuidedViewState).toHaveBeenCalledWith(panelState, expect.objectContaining({
            persist: false,
        }));
        expect(manager.seekMainTimelineTime).not.toHaveBeenCalled();
        expect(manager.requestRender).toHaveBeenCalledTimes(1);
        expect(manager.queuePersistPanelState).toHaveBeenCalledTimes(1);
    });

    it("keeps explicit guided composer seeks available for deliberate jumps", () => {
        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            restorePanel: vi.fn(),
            applyComposerGuidedViewState: vi.fn(() => true),
            seekMainTimelineTime: vi.fn(),
            requestRender: vi.fn(),
            queuePersistPanelState: vi.fn(),
        });
        const panelState = {
            mode: "composer",
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        };

        manager.restoreComposerGuidedPanel(panelState, { seekTimeMs: 150 });

        expect(manager.seekMainTimelineTime).toHaveBeenCalledWith(150, true);
    });

    it("returns phase selection to the guided Moon Auto FoV view", () => {
        const { manager, panelState } = createTimelineHarness();
        Object.assign(manager, {
            seekMainTimelineTime: vi.fn(),
            requestRender: vi.fn(),
        });
        manager.readMainTimelineState.mockReturnValue({
            min: 0,
            max: 200,
            value: 25,
            stepMs: 1,
        });
        Object.assign(panelState, {
            mode: "composer",
            composerLockTarget: "earth",
            composerOrientationReference: "moon-north",
            composerMediaDriven: true,
            composerSurfaceTarget: { bodyId: "moon" },
            autoFovEnabled: false,
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        });

        manager.selectComposerTimelinePhase(panelState, 1);

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.composerOrientationReference).toBe("world");
        expect(panelState.autoFovEnabled).toBe(true);
        expect(panelState.composerMediaDriven).toBe(false);
        expect(panelState.composerSurfaceTarget).toBe(null);
        expect(panelState.syncComposerLockUi).toHaveBeenCalledTimes(1);
        expect(panelState.syncComposerAutoToggleUi).toHaveBeenCalledTimes(1);
    });
});

describe("Frame and Shoot event pill highlighting", () => {
    class FakeElement {
        constructor(tagName = "div") {
            this.tagName = tagName;
            this.children = [];
            this.className = "";
            this.textContent = "";
            this.attributes = {};
            this.listeners = new Map();
            this.classList = {
                add: (...names) => {
                    const values = new Set(this.className.split(/\s+/).filter(Boolean));
                    for (const name of names) values.add(name);
                    this.className = Array.from(values).join(" ");
                },
                remove: (...names) => {
                    const values = new Set(this.className.split(/\s+/).filter(Boolean));
                    for (const name of names) values.delete(name);
                    this.className = Array.from(values).join(" ");
                },
                contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
                toggle: (name, enabled) => {
                    if (enabled) {
                        this.classList.add(name);
                        return true;
                    }
                    this.classList.remove(name);
                    return false;
                },
            };
        }

        appendChild(child) {
            this.children.push(child);
            return child;
        }

        replaceChildren(...children) {
            this.children = children;
        }

        setAttribute(name, value) {
            this.attributes[name] = String(value);
        }

        removeAttribute(name) {
            delete this.attributes[name];
        }

        addEventListener(type, handler) {
            const handlers = this.listeners.get(type) || [];
            handlers.push(handler);
            this.listeners.set(type, handlers);
        }
    }

    function createHarness() {
        vi.stubGlobal("document", {
            createElement(tagName) {
                return new FakeElement(tagName);
            },
        });

        const manager = Object.assign(Object.create(AuxiliaryCameraViewsManager.prototype), {
            composerActivePhaseIndex: -1,
            composerSelectedPhaseIndex: -1,
            composerFlybyEvents: [
                { key: "e1", title: "Event 1", timeMs: 1000 },
                { key: "e2", title: "Event 2", timeMs: 2000 },
            ],
            formatLocalDateTime: (timeMs) => String(timeMs),
            seekMainTimelineTime: vi.fn(),
            syncComposerTimelineUi: vi.fn(),
            requestRender: vi.fn(),
        });
        const composerFlybyEventsDetails = new FakeElement("details");
        composerFlybyEventsDetails.open = false;
        const panelState = {
            mode: "composer",
            composerLockTarget: "earth",
            composerOrientationReference: "moon-north",
            composerMediaDriven: true,
            composerSurfaceTarget: { bodyId: "moon" },
            autoFovEnabled: false,
            composerFlybyEventsDetails,
            composerFlybyEventsSummary: new FakeElement("summary"),
            composerFlybyEventsWrap: new FakeElement(),
            composerFlybyEventsSignature: "",
            composerFlybyEventNodes: [],
            composerFlybySelectedEventTimeMs: Number.NaN,
            syncComposerLockUi: vi.fn(),
            syncComposerAutoToggleUi: vi.fn(),
        };
        return { manager, panelState };
    }

    it("shows dashed boundaries for the two surrounding events between event times", () => {
        const { manager, panelState } = createHarness();

        manager.syncComposerFlybyEventPills(panelState, 1500);

        expect(panelState.composerFlybyEventNodes[0].element.classList.contains("is-boundary")).toBe(true);
        expect(panelState.composerFlybyEventNodes[1].element.classList.contains("is-boundary")).toBe(true);
        expect(panelState.composerFlybyEventNodes[0].element.classList.contains("is-active")).toBe(false);
        expect(panelState.composerFlybyEventNodes[1].element.classList.contains("is-active")).toBe(false);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Events");
    });

    it("uses the solid active pill only on an exact event time", () => {
        const { manager, panelState } = createHarness();

        manager.syncComposerFlybyEventPills(panelState, 1000);

        expect(panelState.composerFlybyEventNodes[0].element.classList.contains("is-active")).toBe(true);
        expect(panelState.composerFlybyEventNodes[0].element.classList.contains("is-boundary")).toBe(false);
        expect(panelState.composerFlybyEventNodes[1].element.classList.contains("is-active")).toBe(false);
        expect(panelState.composerFlybyEventNodes[1].element.classList.contains("is-boundary")).toBe(false);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Events");
    });

    it("returns event selection to the guided Moon Auto FoV view and closes the popup", () => {
        const { manager, panelState } = createHarness();
        panelState.composerFlybyEventsDetails.open = true;
        manager.syncComposerFlybyEventPills(panelState, 1500);

        const clickHandlers = panelState.composerFlybyEventNodes[0].element.listeners.get("click") || [];
        clickHandlers[0]?.();

        expect(panelState.composerLockTarget).toBe("moon");
        expect(panelState.composerOrientationReference).toBe("world");
        expect(panelState.autoFovEnabled).toBe(true);
        expect(panelState.composerMediaDriven).toBe(false);
        expect(panelState.composerSurfaceTarget).toBe(null);
        expect(panelState.syncComposerLockUi).toHaveBeenCalledTimes(1);
        expect(panelState.syncComposerAutoToggleUi).toHaveBeenCalledTimes(1);
        expect(panelState.composerFlybyEventsDetails.open).toBe(false);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Event 1");
    });

    it("clears the selected event label after the animation time moves away", () => {
        const { manager, panelState } = createHarness();
        manager.syncComposerFlybyEventPills(panelState, 1500);

        const jumped = manager.selectComposerFlybyEvent(panelState, 1);

        expect(jumped).toBe(true);
        expect(manager.seekMainTimelineTime).toHaveBeenCalledWith(2000, true);
        expect(panelState.composerFlybySelectedEventTimeMs).toBe(2000);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Event 2");

        manager.syncComposerFlybyEventPills(panelState, 1500);

        expect(Number.isNaN(panelState.composerFlybySelectedEventTimeMs)).toBe(true);
        expect(panelState.composerFlybyEventsSummary.textContent).toBe("Events");
    });
});
