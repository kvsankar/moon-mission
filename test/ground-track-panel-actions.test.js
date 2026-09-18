import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeEvent, FakeResizeObserver, installFakeDom } from "./helpers/fake-dom.js";
import {
    createGroundTrackPanelActions,
    shouldAutoOpenSplashdownPanel,
} from "../src/platform/js/app/ground-track-panel.js";

const MISSION_CONFIG = JSON.parse(readFileSync("assets/artemis2/data/config.json", "utf8"));
const SPLASHDOWN_MS = Date.parse(MISSION_CONFIG.events?.splashdown?.startTime);

let dom = null;
let actions = null;

/** Element ids the panel resolves by `getElementById`. */
const PANEL_ELEMENT_IDS = [
    ["ground-track-panel-wrapper", "div"],
    ["ground-track-panel", "section"],
    ["ground-track-status", "div"],
    ["ground-track-coords", "div"],
    ["ground-track-map", "div"],
    ["ground-track-globe", "div"],
    ["ground-track-provenance-note", "div"],
    ["ground-track-events", "div"],
    ["ground-track-timeline-card", "div"],
    ["ground-track-panel-close", "button"],
    ["ground-track-panel-minimize", "button"],
    ["ground-track-panel-expand", "button"],
    ["ground-track-button", "button"],
    ["ground-track-style-2d", "button"],
    ["ground-track-style-3d", "button"],
    ["ground-track-zoom-in", "button"],
    ["ground-track-zoom-out", "button"],
    ["ground-track-info-distance", "span"],
    ["ground-track-info-speed", "span"],
    ["ground-track-info-altitude", "span"],
];

function mount({ mission = "artemis2", ok = true } = {}) {
    dom = installFakeDom(
        PANEL_ELEMENT_IDS.map(([id, tag]) => ({ id, tag })),
        {
            innerWidth: 1600,
            innerHeight: 900,
            ResizeObserver: FakeResizeObserver,
            requestAnimationFrame: (callback) => {
                callback(0);
                return 1;
            },
            cancelAnimationFrame: () => {},
            missionConfig: mission ? { dataPath: `assets/${mission}/data` } : undefined,
            location: { pathname: mission ? `/${mission}/` : "/", href: "http://localhost/" },
        },
    );
    vi.stubGlobal("fetch", vi.fn(async (url) => {
        if (ok && String(url).includes("config.json")) {
            return { ok: true, status: 200, json: async () => MISSION_CONFIG };
        }
        return { ok: false, status: 404, json: async () => ({}) };
    }));
    return dom.document;
}

function node(id) {
    return dom.document.getElementById(id);
}

async function settle(times = 20) {
    for (let index = 0; index < times; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
    }
}

function sceneStateWithCraft(position = { x: 7000, y: 0, z: 0 }) {
    return {
        bodies: {
            SC: { available: true, position, velocity: { vx: 0, vy: 7.5, vz: 0 } },
            EARTH: { available: true, position: { x: 0, y: 0, z: 0 } },
        },
    };
}

afterEach(() => {
    actions = null;
    dom?.restore();
    dom = null;
    vi.unstubAllGlobals();
});

describe("auto-open policy", () => {
    beforeEach(() => {
        mount();
    });

    it("refuses to auto-open without a modeled splashdown time", () => {
        expect(shouldAutoOpenSplashdownPanel(null, 0)).toBe(false);
        expect(shouldAutoOpenSplashdownPanel({ events: {} }, 0)).toBe(false);
    });

    it("auto-opens before the modeled splashdown", () => {
        expect(shouldAutoOpenSplashdownPanel(MISSION_CONFIG, SPLASHDOWN_MS - 60_000)).toBe(true);
    });

    it("stops auto-opening once splashdown has passed", () => {
        expect(shouldAutoOpenSplashdownPanel(MISSION_CONFIG, SPLASHDOWN_MS + 60_000)).toBe(false);
    });

    it("refuses to auto-open without a usable current time", () => {
        expect(shouldAutoOpenSplashdownPanel(MISSION_CONFIG, Number.NaN)).toBe(false);
    });
});

describe("mission availability", () => {
    it("hides the panel wrapper for a mission that does not carry it", async () => {
        mount({ mission: "chandrayaan3" });
        actions = createGroundTrackPanelActions({});

        actions.update({ sceneState: sceneStateWithCraft(), config: "geo", animTime: SPLASHDOWN_MS });
        await settle();

        expect(node("ground-track-panel-wrapper").hidden).toBe(true);
    });

    it("shows the panel wrapper for the mission that carries it", async () => {
        mount();
        actions = createGroundTrackPanelActions({});

        actions.update({ sceneState: sceneStateWithCraft(), config: "geo", animTime: SPLASHDOWN_MS });
        await settle();

        expect(node("ground-track-panel-wrapper").hidden).toBe(false);
    });

    it("exposes only an update and a visibility control", () => {
        mount();

        actions = createGroundTrackPanelActions({});

        expect(Object.keys(actions).sort()).toEqual(["setPanelVisible", "update"]);
    });
});

describe("ground track status", () => {
    beforeEach(async () => {
        mount();
        actions = createGroundTrackPanelActions({});
    });

    it("reports that the window has not opened yet before RTC-3", async () => {
        actions.update({
            sceneState: sceneStateWithCraft(),
            config: "geo",
            animTime: Date.UTC(2020, 0, 1),
        });
        await settle();

        expect(node("ground-track-status").textContent).toContain("RTC-3");
    });

    it("reports an unavailable location without craft data", async () => {
        actions.update({
            sceneState: { bodies: {} },
            config: "geo",
            animTime: SPLASHDOWN_MS,
        });
        await settle();

        expect(node("ground-track-status").textContent).toContain("unavailable");
        expect(node("ground-track-coords").textContent).toBe("--");
    });

    it("ignores an update with no scene state or time", async () => {
        actions.update({ sceneState: null, config: "geo", animTime: SPLASHDOWN_MS });
        actions.update({ sceneState: sceneStateWithCraft(), config: "geo", animTime: Number.NaN });
        await settle();

        expect(() => actions.update({ sceneState: sceneStateWithCraft(), config: null })).not.toThrow();
    });

    it("keeps reporting after a repeated update at the same time", async () => {
        const input = {
            sceneState: sceneStateWithCraft(),
            config: "geo",
            animTime: SPLASHDOWN_MS,
        };
        actions.update(input);
        await settle();
        const first = node("ground-track-status").textContent;

        actions.update(input);
        await settle();

        expect(node("ground-track-status").textContent).toBe(first);
    });
});

describe("panel visibility", () => {
    beforeEach(async () => {
        mount();
        actions = createGroundTrackPanelActions({});
        actions.update({
            sceneState: sceneStateWithCraft(),
            config: "geo",
            animTime: SPLASHDOWN_MS,
        });
        await settle();
    });

    it("announces a visibility change to the rest of the shell", () => {
        const seen = [];
        dom.document.addEventListener("ground-track-panel-visibilitychange", (event) => {
            seen.push(event.detail);
        });

        actions.setPanelVisible(true);
        actions.setPanelVisible(false);

        expect(seen.length).toBeGreaterThan(0);
        expect(seen[seen.length - 1].visible).toBe(false);
    });

    it("marks the panel hidden when it is closed", () => {
        actions.setPanelVisible(true);
        actions.setPanelVisible(false);

        expect(node("ground-track-panel").classList.contains("ground-track-panel--hidden")).toBe(true);
    });

    it("clears the hidden class when the panel is opened", () => {
        actions.setPanelVisible(false);

        actions.setPanelVisible(true);

        expect(node("ground-track-panel").classList.contains("ground-track-panel--hidden")).toBe(false);
    });

    it("closes from the panel close button", () => {
        actions.setPanelVisible(true);

        node("ground-track-panel-close").dispatchEvent(new FakeEvent("click", { bubbles: true }));

        expect(node("ground-track-panel").classList.contains("ground-track-panel--hidden")).toBe(true);
    });

    it("keeps the panel open across later updates", async () => {
        actions.setPanelVisible(true);

        actions.update({
            sceneState: sceneStateWithCraft({ x: 6800, y: 100, z: 50 }),
            config: "geo",
            animTime: SPLASHDOWN_MS + 1000,
        });
        await settle();

        expect(node("ground-track-panel").classList.contains("ground-track-panel--hidden")).toBe(false);
        expect(node("ground-track-panel-wrapper").hidden).toBe(false);
    });
});

describe("relative frame", () => {
    beforeEach(async () => {
        mount();
        actions = createGroundTrackPanelActions({});
    });

    it("keeps reporting in the relative frame", async () => {
        actions.update({
            sceneState: sceneStateWithCraft(),
            config: "relative",
            animTime: SPLASHDOWN_MS,
        });
        await settle();

        expect(node("ground-track-panel-wrapper").hidden).toBe(false);
    });

    it("treats a checked origin-relative control as the relative frame", async () => {
        const toggle = dom.document.createElement("input");
        toggle.id = "origin-relative";
        toggle.checked = true;
        dom.document.body.appendChild(toggle);

        actions.update({
            sceneState: sceneStateWithCraft(),
            config: "geo",
            animTime: SPLASHDOWN_MS,
        });
        await settle();

        expect(node("ground-track-panel-wrapper").hidden).toBe(false);
    });
});

describe("metric formatting", () => {
    it("uses a caller-supplied metric formatter", async () => {
        mount();
        const formatMetric = vi.fn(() => "FORMATTED");
        actions = createGroundTrackPanelActions({ formatMetric });

        actions.update({
            sceneState: sceneStateWithCraft(),
            config: "geo",
            animTime: SPLASHDOWN_MS,
        });
        await settle();

        expect(formatMetric).toHaveBeenCalled();
    });

    it("falls back to its own formatter", async () => {
        mount();
        actions = createGroundTrackPanelActions({ formatMetric: "not a function" });

        actions.update({
            sceneState: sceneStateWithCraft(),
            config: "geo",
            animTime: SPLASHDOWN_MS,
        });
        await settle();

        expect(node("ground-track-status").textContent).toBeTruthy();
    });
});

describe("configuration failures", () => {
    it("carries on when the mission config cannot be fetched", async () => {
        mount({ ok: false });
        actions = createGroundTrackPanelActions({});

        actions.update({
            sceneState: sceneStateWithCraft(),
            config: "geo",
            animTime: SPLASHDOWN_MS,
        });
        await settle();

        // The legacy mission match still enables the panel for Artemis II.
        expect(node("ground-track-panel-wrapper").hidden).toBe(false);
    });
});
