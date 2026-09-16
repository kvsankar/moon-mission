import { describe, expect, it, vi } from "vitest";
import { AnimationController } from "../src/platform/js/animation/animation-controller.js";
import { createAnimationControllerCallbacks } from "../src/platform/js/app/mission-playback-coordination.js";
import { createRuntimeSessionState } from "../src/platform/js/core/state/runtime-session-state.js";

describe("playback restart time authority", () => {
    it("commits and notifies restart time before announcing Play", () => {
        const events = [];
        const controller = new AnimationController({
            onTimeChange: (time, metadata) => events.push({ kind: "time", time, metadata }),
            onPlayStateChange: playing => events.push({ kind: "play", playing, time: controller.getTime() }),
        });
        controller.configure({ startTime: 1000, endTime: 5000 });
        controller.setTime(5000, false);
        controller.play();
        expect(events).toEqual([
            { kind: "time", time: 1000, metadata: { source: "transport-restart", phase: "commit", commit: true, seekEvent: true } },
            { kind: "play", playing: true, time: 1000 },
        ]);
    });

    it("projects the rewound time through real session, scene and timeline callbacks before Play consumers run", () => {
        const runtimeSessionState = createRuntimeSessionState({ initialAnimTime: 5000 });
        const seen = [], seek = vi.fn();
        const record = label => () => seen.push([label, runtimeSessionState.getAnimTime()]);
        const callbacks = createAnimationControllerCallbacks({ runtimeSessionState,
            bridgeActions: { setLocation: record("scene") }, syncTimelineDock: record("timeline"),
            syncActiveCraftControl: vi.fn(), updateD3ElementText: vi.fn(), updateTransportControlsUI: vi.fn(),
            dispatchAnimationPlayStateUpdated: record("play"), getSetView: () => record("view"),
            updateSpeedControlsUI: vi.fn(), dispatchMissionTimelineUserSeek: seek, eventBus: { emit: vi.fn() },
        });
        const controller = new AnimationController(callbacks);
        controller.configure({ startTime: 1000, endTime: 5000 });
        controller.setTime(5000, false);
        controller.play();
        expect(seen).toEqual([["scene", 1000], ["timeline", 1000], ["play", 1000], ["view", 1000]]);
        expect(seek).toHaveBeenCalledExactlyOnceWith({ source: "transport-restart", phase: "commit", commit: true, timeMs: 1000 });
    });

    it("does not create a seek when resuming before the mission end", () => {
        const onTimeChange = vi.fn(), onPlayStateChange = vi.fn();
        const controller = new AnimationController({ onTimeChange, onPlayStateChange });
        controller.configure({ startTime: 1000, endTime: 5000 });
        controller.setTime(3000, false);
        controller.pause(); onPlayStateChange.mockClear();
        controller.play();
        expect(controller.getTime()).toBe(3000);
        expect(onTimeChange).not.toHaveBeenCalled();
        expect(onPlayStateChange).toHaveBeenCalledExactlyOnceWith(true);
    });

    it("starts the restarted frame clock from a fresh baseline", () => {
        const controller = new AnimationController();
        controller.configure({ startTime: 1000, endTime: 5000 });
        controller.prevFrameTime = 100;
        controller.deltaFrameTime = 4000;
        controller.setTime(5000, false);
        controller.play();
        controller.tick(100000);
        expect(controller.getTime()).toBe(1000);
        controller.tick(100100);
        expect(controller.getTime()).toBe(1100);
    });
});
