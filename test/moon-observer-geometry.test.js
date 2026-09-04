import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
    resolveBrightLimbAngleDegrees,
    resolveMoonObserverGeometry,
    rotateObserverScreenUp,
} from "../src/platform/js/app/moon-observer-geometry.js";
import { MoonRenderer } from "../src/platform/js/rendering/moon-renderer.js";

function dot(left, right) {
    return left.x * right.x + left.y * right.y + left.z * right.z;
}

describe("moon observer geometry", () => {
    it("resolves known new- and full-moon illumination", () => {
        const newMoon = resolveMoonObserverGeometry({
            date: new Date("2024-04-08T18:21:00Z"),
        });
        const fullMoon = resolveMoonObserverGeometry({
            date: new Date("2024-03-25T07:00:00Z"),
        });

        expect(newMoon.illuminatedFraction).toBeLessThan(0.01);
        expect(fullMoon.illuminatedFraction).toBeGreaterThan(0.99);
        expect(newMoon.observerDistanceKm).toBeGreaterThan(350000);
        expect(newMoon.angularDiameterDegrees).toBeGreaterThan(0.45);
        expect(newMoon.angularDiameterDegrees).toBeLessThan(0.60);
    });

    it("applies topocentric parallax and local horizontal coordinates", () => {
        const date = new Date("2026-04-06T22:41:58Z");
        const geocenter = resolveMoonObserverGeometry({ date });
        const bengaluru = resolveMoonObserverGeometry({
            date,
            observerMode: "site",
            latitude: 12.9716,
            longitude: 77.5946,
            elevationMeters: 920,
        });

        expect(bengaluru.observerMode).toBe("site");
        expect(Number.isFinite(bengaluru.altitudeDegrees)).toBe(true);
        expect(Number.isFinite(bengaluru.azimuthDegrees)).toBe(true);
        expect(dot(geocenter.observerDirection, bengaluru.observerDirection)).toBeLessThan(0.9999999);
        expect(Math.abs(dot(bengaluru.screenUp, bengaluru.observerDirection))).toBeLessThan(1e-10);
    });

    it("matches the NASA Dial-A-Moon geocentric reference", () => {
        // https://svs.gsfc.nasa.gov/api/dialamoon/2026-04-06T22:00
        const geometry = resolveMoonObserverGeometry({
            date: new Date("2026-04-06T22:00:00Z"),
        });

        expect(geometry.illuminatedFraction * 100).toBeCloseTo(79.32, 1);
        expect(geometry.observerDistanceKm).toBeCloseTo(404830, -2);
        expect(geometry.angularDiameterDegrees * 3600).toBeCloseTo(1770.4, 0);

        const moonRenderer = new MoonRenderer(1);
        moonRenderer.container = new THREE.Group();
        moonRenderer.updateRotation(geometry.date);
        const inverseMoonRotation = moonRenderer.container.quaternion.clone().invert();
        const toSelenographic = (direction) => {
            const local = new THREE.Vector3(direction.x, direction.y, direction.z)
                .applyQuaternion(inverseMoonRotation)
                .normalize();
            const renderLongitude = THREE.MathUtils.radToDeg(Math.atan2(local.x, local.y));
            return {
                latitude: THREE.MathUtils.radToDeg(Math.asin(local.z)),
                longitude: THREE.MathUtils.euclideanModulo(90 - renderLongitude + 180, 360) - 180,
            };
        };
        const subEarth = toSelenographic(geometry.observerDirection);
        const subsolar = toSelenographic(geometry.sunDirection);
        const lunarNorthWorld = new THREE.Vector3(0, 0, 1)
            .applyQuaternion(moonRenderer.container.quaternion);
        const northClockwiseAngle = resolveBrightLimbAngleDegrees({
            observerDirection: geometry.observerDirection,
            sunDirection: lunarNorthWorld,
            screenUp: geometry.screenUp,
        });

        expect(subEarth.longitude).toBeCloseTo(-0.663, 2);
        expect(subEarth.latitude).toBeCloseTo(6.731, 2);
        expect(subsolar.longitude).toBeCloseTo(-54.621, 2);
        expect(subsolar.latitude).toBeCloseTo(1.03, 2);
        expect(-northClockwiseAngle).toBeCloseTo(8.565, 2);
    });

    it("rotates screen-up without changing its view-plane constraint", () => {
        const observerDirection = { x: 0, y: 0, z: 1 };
        const rolled = rotateObserverScreenUp(
            { x: 0, y: 1, z: 0 },
            observerDirection,
            90,
        );

        expect(rolled.x).toBeCloseTo(1, 10);
        expect(rolled.y).toBeCloseTo(0, 10);
        expect(dot(rolled, observerDirection)).toBeCloseTo(0, 10);
        expect(resolveBrightLimbAngleDegrees({
            observerDirection,
            sunDirection: { x: 1, y: 0, z: 0 },
            screenUp: rolled,
        })).toBeCloseTo(0, 10);
    });

    it("rejects invalid observation times", () => {
        expect(() => resolveMoonObserverGeometry({ date: "not-a-date" })).toThrow(
            "valid UTC observation time",
        );
    });
});
