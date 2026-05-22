import { describe, expect, it } from "vitest";
import {
    buildMilestoneViewModels,
    computeMilestoneLabelPlan,
    getMilestoneLabelLimit,
    interpolatePointAtTime,
    resolveMilestonePositionFromSamples,
    shortenMilestoneLabel,
} from "../src/platform/js/core/domain/orbit-milestones.js";

describe("orbit milestone helpers", () => {
    it("interpolates midpoint positions from sampled times", () => {
        const result = interpolatePointAtTime({
            points: [
                { x: 0, y: 0, z: 0 },
                { x: 10, y: 20, z: 30 },
            ],
            times: [1000, 3000],
            timeMs: 2000,
        });

        expect(result.ok).toBe(true);
        expect(result.position).toEqual({ x: 5, y: 10, z: 15 });
        expect(result.ratio).toBe(0.5);
    });

    it("uses exact sample coordinates without drifting", () => {
        const point = { x: 4, y: 8 };
        const result = interpolatePointAtTime({
            points: [{ x: 0, y: 0 }, point],
            times: [1000, 2000],
            timeMs: 2000,
        });

        expect(result.ok).toBe(true);
        expect(result.position).toEqual(point);
    });

    it("does not clamp out-of-range events to path endpoints", () => {
        const result = interpolatePointAtTime({
            points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
            times: [1000, 2000],
            timeMs: 2500,
        });

        expect(result).toEqual({ ok: false, reason: "out-of-range" });
    });

    it("returns pre-ephemeris events as unavailable", () => {
        const result = resolveMilestonePositionFromSamples({
            eventInfo: {
                startTime: new Date(1000),
                preEphemeris: true,
                body: "SC",
            },
            scene: {
                curvesById: { SC: [{ x: 0, y: 0, z: 0 }] },
                curveTimesById: { SC: [1000] },
            },
            dimension: "3D",
        });

        expect(result).toEqual({ ok: false, reason: "pre-ephemeris" });
    });

    it("builds visible milestone models in priority order then returns chronological rendering order", () => {
        const scene = {
            primaryCraftId: "SC",
            curvesById: {
                SC: [
                    { x: 0, y: 0, z: 0 },
                    { x: 10, y: 0, z: 0 },
                    { x: 20, y: 0, z: 0 },
                    { x: 30, y: 0, z: 0 },
                ],
            },
            curveTimesById: {
                SC: [1000, 2000, 3000, 4000],
            },
        };

        const models = buildMilestoneViewModels({
            eventInfos: [
                { key: "routine", label: "Routine", startTime: new Date(1000) },
                { key: "closest", label: "Closest Approach", startTime: new Date(2000) },
                { key: "burn", label: "Burn", startTime: new Date(3000), burnFlag: true },
            ],
            scene,
            dimension: "3D",
            maxVisible: 2,
        });

        expect(models.map((model) => model.key)).toEqual(["closest", "burn"]);
        expect(models[1].category).toBe("burn");
    });

    it("reduces visible label count when zoomed out", () => {
        expect(getMilestoneLabelLimit({ zoomFactor: 0.5, dimension: "2D" })).toBe(0);
        expect(getMilestoneLabelLimit({ zoomFactor: 1, dimension: "2D" })).toBe(2);
        expect(getMilestoneLabelLimit({ zoomFactor: 3, dimension: "2D" })).toBe(10);
    });

    it("shortens long labels before layout", () => {
        expect(shortenMilestoneLabel("Maximum Distance From Earth", 14)).toBe("Maximum Dis...");
    });

    it("hides lower priority labels when screen boxes collide", () => {
        const models = [
            {
                key: "burn",
                label: "Burn",
                priority: 1,
                timeMs: 1000,
                position: { position: { x: 100, y: 100 } },
            },
            {
                key: "soi",
                label: "Lunar SOI In",
                priority: 2,
                timeMs: 2000,
                position: { position: { x: 103, y: 100 } },
            },
            {
                key: "far",
                label: "Far Label",
                priority: 2,
                timeMs: 3000,
                position: { position: { x: 260, y: 100 } },
            },
        ];

        const plan = computeMilestoneLabelPlan({
            models,
            zoomFactor: 3,
            viewportWidth: 600,
            viewportHeight: 500,
            reservedTop: 0,
            reservedBottom: 0,
        });

        expect(plan.map((label) => label.key)).toEqual(["burn", "far"]);
    });

    it("uses screen-space transform when testing label collisions", () => {
        const models = [
            {
                key: "left",
                label: "Left",
                priority: 1,
                timeMs: 1000,
                position: { position: { x: 10, y: 10 } },
            },
            {
                key: "right",
                label: "Right",
                priority: 1,
                timeMs: 2000,
                position: { position: { x: 25, y: 10 } },
            },
        ];

        const plan = computeMilestoneLabelPlan({
            models,
            zoomFactor: 3,
            transform: "matrix(5, 0, 0, 5, 0, 0)",
            viewportWidth: 600,
            viewportHeight: 500,
            reservedTop: 0,
            reservedBottom: 0,
        });

        expect(plan.map((label) => label.key)).toEqual(["left", "right"]);
    });
});
