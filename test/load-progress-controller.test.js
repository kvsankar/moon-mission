import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLoadProgressController } from "../src/platform/js/app/load-progress-controller.js";

let sinks = null;

function makeSinks(overrides = {}) {
    return {
        ensureDeterminateProgressBar: vi.fn(),
        setProgressBarValue: vi.fn(),
        showElementById: vi.fn(),
        hideElementById: vi.fn(),
        updateProgressLabel: vi.fn(),
        clearProgressLabel: vi.fn(),
        ...overrides,
    };
}

function lastPercent() {
    const calls = sinks.setProgressBarValue.mock.calls;
    return calls.length ? calls[calls.length - 1][1] : null;
}

beforeEach(() => {
    sinks = makeSinks();
});

describe("degraded construction", () => {
    it("returns an inert controller when a required sink is missing", () => {
        const controller = createLoadProgressController({
            ...makeSinks(),
            setProgressBarValue: null,
        });

        controller.beginSession();
        controller.setStage("config", 1);
        controller.completeStage("config");
        controller.completeSession();
        controller.abortSession();

        expect(controller.isActive()).toBe(false);
    });

    it("tolerates a missing label-clearing sink", () => {
        const controller = createLoadProgressController(
            makeSinks({ clearProgressLabel: undefined }),
        );
        controller.beginSession();

        controller.completeSession();

        expect(sinks.updateProgressLabel).not.toBe(undefined);
        expect(controller.isActive()).toBe(false);
    });
});

describe("session lifecycle", () => {
    it("is inactive before a session begins", () => {
        const controller = createLoadProgressController(sinks);

        expect(controller.isActive()).toBe(false);
        expect(sinks.showElementById).not.toHaveBeenCalled();
    });

    it("shows the bar and reports the starting percentage", () => {
        const controller = createLoadProgressController(sinks);

        controller.beginSession();

        expect(controller.isActive()).toBe(true);
        expect(sinks.showElementById).toHaveBeenCalledWith("progressbar");
        expect(sinks.ensureDeterminateProgressBar).toHaveBeenCalledWith("progressbar", 0);
        expect(sinks.updateProgressLabel).toHaveBeenCalledWith("Loading mission data... (0%)");
    });

    it("uses a caller-supplied label", () => {
        const controller = createLoadProgressController(sinks);

        controller.beginSession({ label: "Staging orbits" });

        expect(sinks.updateProgressLabel).toHaveBeenCalledWith("Staging orbits (0%)");
    });

    it("does not restart an active session", () => {
        const controller = createLoadProgressController(sinks);
        controller.beginSession();
        controller.setStage("config", 1);
        const percentBefore = lastPercent();

        controller.beginSessionIfNeeded();

        expect(lastPercent()).toBe(percentBefore);
        expect(sinks.showElementById).toHaveBeenCalledTimes(1);
    });

    it("starts a session when none is running", () => {
        const controller = createLoadProgressController(sinks);

        controller.beginSessionIfNeeded({ label: "Resuming" });

        expect(controller.isActive()).toBe(true);
        expect(sinks.updateProgressLabel).toHaveBeenCalledWith("Resuming (0%)");
    });
});

describe("stage progress", () => {
    it("ignores stage updates outside a session", () => {
        const controller = createLoadProgressController(sinks);

        controller.setStage("config", 1);
        controller.completeStage("config");
        controller.completeSession();

        expect(sinks.setProgressBarValue).not.toHaveBeenCalled();
        expect(sinks.hideElementById).not.toHaveBeenCalled();
    });

    it("advances the bar as stages progress", () => {
        const controller = createLoadProgressController(sinks);
        controller.beginSession();
        const start = lastPercent();

        controller.setStage("config", 0.5);
        const half = lastPercent();
        controller.completeStage("config");

        expect(half).toBeGreaterThan(start);
        expect(lastPercent()).toBeGreaterThan(half);
    });

    it("only writes the label when one is supplied", () => {
        const controller = createLoadProgressController(sinks);
        controller.beginSession();
        sinks.updateProgressLabel.mockClear();

        controller.setStage("config", 0.5);
        expect(sinks.updateProgressLabel).not.toHaveBeenCalled();

        controller.setStage("config", 0.75, "Reading config");
        expect(sinks.updateProgressLabel).toHaveBeenCalledWith(expect.stringContaining("Reading config"));
    });

    it("reaches 100% once every stage is complete", () => {
        const controller = createLoadProgressController(sinks);
        controller.beginSession();

        controller.completeSession();

        expect(lastPercent()).toBe(100);
    });

    it("weights stages differently with and without a landing phase", () => {
        const withLanding = createLoadProgressController(sinks);
        withLanding.beginSession({ includeLanding: true });
        withLanding.completeStage("config");
        const landingPercent = lastPercent();

        sinks = makeSinks();
        const withoutLanding = createLoadProgressController(sinks);
        withoutLanding.beginSession({ includeLanding: false });
        withoutLanding.completeStage("config");

        expect(lastPercent()).toBeGreaterThan(landingPercent);
    });
});

describe("session teardown", () => {
    it("hides the bar and clears the label when the load completes", () => {
        const controller = createLoadProgressController(sinks);
        controller.beginSession();

        controller.completeSession();

        expect(sinks.updateProgressLabel).toHaveBeenCalledWith("Ready (100%)");
        expect(sinks.hideElementById).toHaveBeenCalledWith("progressbar");
        expect(sinks.clearProgressLabel).toHaveBeenCalledTimes(1);
        expect(controller.isActive()).toBe(false);
    });

    it("accepts a closing label", () => {
        const controller = createLoadProgressController(sinks);
        controller.beginSession();

        controller.completeSession("Mission loaded");

        expect(sinks.updateProgressLabel).toHaveBeenCalledWith("Mission loaded (100%)");
    });

    it("hides the bar without reporting completion when the load is abandoned", () => {
        const controller = createLoadProgressController(sinks);
        controller.beginSession();
        sinks.setProgressBarValue.mockClear();

        controller.abortSession();

        expect(sinks.setProgressBarValue).not.toHaveBeenCalled();
        expect(sinks.hideElementById).toHaveBeenCalledWith("progressbar");
        expect(sinks.clearProgressLabel).toHaveBeenCalledTimes(1);
        expect(controller.isActive()).toBe(false);
    });

    it("ignores an abort with no session running", () => {
        const controller = createLoadProgressController(sinks);

        controller.abortSession();

        expect(sinks.hideElementById).not.toHaveBeenCalled();
    });

    it("can run a second session after the first finishes", () => {
        const controller = createLoadProgressController(sinks);
        controller.beginSession();
        controller.completeSession();

        controller.beginSession({ label: "Second load" });

        expect(controller.isActive()).toBe(true);
        expect(lastPercent()).toBe(0);
    });
});
