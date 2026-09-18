import { afterEach, describe, expect, it, vi } from "vitest";

import {
    DOCKED_WORKFLOW_PANEL_IDS,
    MAIN_VIEW_PANEL_ID,
    focusDockviewWorkflowPanel,
    getDockviewSpikeLayoutHost,
    resolveDockedWorkflowPanelPosition,
} from "../src/platform/js/app/dockview-workflow-panels.js";

function makeLayoutHost(panelIds = []) {
    const present = new Set(panelIds);
    return {
        api: {
            getPanel: (id) => (present.has(id) ? { id } : undefined),
        },
        focusPanel: vi.fn(() => true),
    };
}

afterEach(() => {
    delete globalThis.__moonMissionDockviewSpike;
});

describe("layout host discovery", () => {
    it("reports no host before the workspace mounts", () => {
        expect(getDockviewSpikeLayoutHost()).toBeNull();
    });

    it("reports the mounted workspace host", () => {
        const layoutHost = makeLayoutHost();
        globalThis.__moonMissionDockviewSpike = { layoutHost };

        expect(getDockviewSpikeLayoutHost()).toBe(layoutHost);
    });

    it("reports no host for a workspace without one", () => {
        globalThis.__moonMissionDockviewSpike = {};

        expect(getDockviewSpikeLayoutHost()).toBeNull();
    });
});

describe("workflow focus", () => {
    it("refuses to focus without a workspace or a panel id", () => {
        expect(focusDockviewWorkflowPanel("workflow:media-browser")).toBe(false);

        globalThis.__moonMissionDockviewSpike = { layoutHost: makeLayoutHost() };
        expect(focusDockviewWorkflowPanel("   ")).toBe(false);
    });

    it("prefers the progressive workspace reveal so focus also discloses the tool", () => {
        const revealPanel = vi.fn(() => true);
        const layoutHost = makeLayoutHost();
        globalThis.__moonMissionDockviewSpike = {
            layoutHost,
            progressiveWorkspace: { revealPanel },
        };

        expect(focusDockviewWorkflowPanel("workflow:media-browser")).toBe(true);
        expect(revealPanel).toHaveBeenCalledWith("workflow:media-browser");
        expect(layoutHost.focusPanel).not.toHaveBeenCalled();
    });

    it("falls back to the raw host focus when there is no progressive workspace", () => {
        const layoutHost = makeLayoutHost();
        globalThis.__moonMissionDockviewSpike = { layoutHost };

        expect(focusDockviewWorkflowPanel("aux:moon")).toBe(true);
        expect(layoutHost.focusPanel).toHaveBeenCalledWith("aux:moon");
    });

    it("reports failure when the raw host cannot focus the panel", () => {
        const layoutHost = makeLayoutHost();
        layoutHost.focusPanel.mockReturnValue(false);
        globalThis.__moonMissionDockviewSpike = { layoutHost };

        expect(focusDockviewWorkflowPanel("aux:moon")).toBe(false);
    });
});

describe("docked panel placement", () => {
    it("declines to place anything without a layout host", () => {
        expect(resolveDockedWorkflowPanelPosition(null, "workflow:media-browser")).toBeUndefined();
    });

    it("leaves an unknown panel to the host's own default", () => {
        expect(resolveDockedWorkflowPanelPosition(makeLayoutHost([MAIN_VIEW_PANEL_ID]), "mystery"))
            .toBeUndefined();
    });

    it("stacks the media browser under the background media player", () => {
        const host = makeLayoutHost(["workflow:background-media", MAIN_VIEW_PANEL_ID]);

        expect(resolveDockedWorkflowPanelPosition(host, "workflow:media-browser")).toEqual({
            direction: "below",
            referencePanel: "workflow:background-media",
        });
    });

    it("walks the media browser fallbacks down to the main view", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["workflow:splashdown"]),
            "workflow:media-browser",
        )).toEqual({ direction: "above", referencePanel: "workflow:splashdown" });

        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost([MAIN_VIEW_PANEL_ID]),
            "workflow:media-browser",
        )).toEqual({ direction: "left", referencePanel: MAIN_VIEW_PANEL_ID });

        expect(resolveDockedWorkflowPanelPosition(makeLayoutHost([]), "workflow:media-browser"))
            .toBeUndefined();
    });

    it("places the background media player above the media browser", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["workflow:media-browser"]),
            "workflow:background-media",
        )).toEqual({ direction: "above", referencePanel: "workflow:media-browser" });
    });

    it("tabs the background media player onto the splashdown panel", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["workflow:splashdown"]),
            "workflow:background-media",
        )).toEqual({ direction: "within", referencePanel: "workflow:splashdown" });
    });

    it("keeps the transcript next to whichever media surface exists", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["workflow:background-media"]),
            "workflow:background-transcript",
        )).toEqual({ direction: "below", referencePanel: "workflow:background-media" });

        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["workflow:media-browser"]),
            "workflow:background-transcript",
        )).toEqual({ direction: "above", referencePanel: "workflow:media-browser" });
    });

    it("puts the splashdown panel beside the main view when no media panel exists", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost([MAIN_VIEW_PANEL_ID]),
            "workflow:splashdown",
        )).toEqual({ direction: "right", referencePanel: MAIN_VIEW_PANEL_ID });
    });

    it("places the composer to the left of an existing camera panel", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["aux:moon"]),
            "aux:earth-rise-composer",
        )).toEqual({ direction: "left", referencePanel: "aux:moon" });

        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["aux:earth"]),
            "aux:earth-rise-composer",
        )).toEqual({ direction: "left", referencePanel: "aux:earth" });
    });

    it("keeps the composer controls beside the main view", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost([MAIN_VIEW_PANEL_ID, "aux:earth-rise-composer"]),
            "aux:earth-rise-composer-controls",
        )).toEqual({ direction: "right", referencePanel: MAIN_VIEW_PANEL_ID });

        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["aux:earth-rise-composer"]),
            "aux:earth-rise-composer-controls",
        )).toEqual({ direction: "left", referencePanel: "aux:earth-rise-composer" });
    });

    it("stacks the Earth camera under the Moon camera", () => {
        expect(resolveDockedWorkflowPanelPosition(makeLayoutHost(["aux:moon"]), "aux:earth"))
            .toEqual({ direction: "below", referencePanel: "aux:moon" });
    });

    it("stacks the Moon camera above the Earth camera", () => {
        expect(resolveDockedWorkflowPanelPosition(makeLayoutHost(["aux:earth"]), "aux:moon"))
            .toEqual({ direction: "above", referencePanel: "aux:earth" });
    });

    it("tabs the Earth-to-Moon view onto an existing camera panel", () => {
        expect(resolveDockedWorkflowPanelPosition(makeLayoutHost(["aux:moon"]), "aux:earth-to-moon"))
            .toEqual({ direction: "within", referencePanel: "aux:moon" });

        expect(resolveDockedWorkflowPanelPosition(makeLayoutHost(["aux:earth"]), "aux:earth-to-moon"))
            .toEqual({ direction: "within", referencePanel: "aux:earth" });
    });

    it("stacks the orbit plane under a camera panel", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["aux:earth"]),
            "aux:earth-origin-orbit-xy",
        )).toEqual({ direction: "below", referencePanel: "aux:earth" });
    });

    it("trims a padded panel id before placing it", () => {
        expect(resolveDockedWorkflowPanelPosition(
            makeLayoutHost(["workflow:background-media"]),
            "  workflow:media-browser  ",
        )).toEqual({ direction: "below", referencePanel: "workflow:background-media" });
    });

    it("gives every docked workflow panel a placement rule", () => {
        const host = makeLayoutHost([MAIN_VIEW_PANEL_ID]);

        for (const panelId of DOCKED_WORKFLOW_PANEL_IDS) {
            expect(resolveDockedWorkflowPanelPosition(host, panelId)).toMatchObject({
                referencePanel: MAIN_VIEW_PANEL_ID,
            });
        }
    });
});
