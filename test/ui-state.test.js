import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installFakeDom } from "./helpers/fake-dom.js";
import {
    applyCameraFromTo,
    applyDimensionSelection,
    applyOriginMode,
    applyPlaneSelection,
    applyViewSettings,
    getChecked,
    readCameraLookMode,
    readCameraPositionMode,
    readDimensionSelection,
    readOriginMode,
    readPlaneSelection,
    readViewSettings,
    setChecked,
} from "../src/platform/js/ui/ui-state.js";

let dom = null;

function mount(descriptors, windowOverrides) {
    dom?.restore();
    dom = installFakeDom(descriptors, windowOverrides);
    return dom.document;
}

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("ui-state element accessors", () => {
    beforeEach(() => {
        mount([
            { id: "view-orbit", tag: "input", checked: true },
            { id: "view-poles", tag: "input", checked: false },
        ]);
    });

    it("accepts both bare ids and `#id` selectors", () => {
        expect(getChecked("view-orbit")).toBe(true);
        expect(getChecked("#view-orbit")).toBe(true);
        expect(getChecked("#view-poles")).toBe(false);
    });

    it("reports unknown controls as unchecked instead of throwing", () => {
        expect(getChecked("not-in-the-dom")).toBe(false);
        expect(getChecked("")).toBe(false);
        expect(() => setChecked("not-in-the-dom", true)).not.toThrow();
    });

    it("coerces assigned values to booleans", () => {
        setChecked("view-poles", "yes");
        expect(dom.document.getElementById("view-poles").checked).toBe(true);
        setChecked("view-poles", 0);
        expect(dom.document.getElementById("view-poles").checked).toBe(false);
    });
});

describe("origin mode projection", () => {
    function mountOrigins({ earth = false, moon = false, relative = false } = {}) {
        return mount([
            { id: "origin-earth", tag: "input", checked: earth },
            { id: "origin-moon", tag: "input", checked: moon },
            { id: "origin-relative", tag: "input", checked: relative },
        ]);
    }

    it("reports relative origin as the geocentric data frame", () => {
        mountOrigins({ relative: true });
        expect(readOriginMode()).toBe("geo");
    });

    it("reports Earth and Moon origins as geo and lunar", () => {
        mountOrigins({ earth: true });
        expect(readOriginMode()).toBe("geo");

        mountOrigins({ moon: true });
        expect(readOriginMode()).toBe("lunar");
    });

    it("reports `undefined` when no origin control is selected", () => {
        mountOrigins();
        expect(readOriginMode()).toBe("undefined");
    });

    it("accepts both runtime and UI spellings when applying an origin", () => {
        const documentRef = mountOrigins();

        applyOriginMode("geo");
        expect(documentRef.getElementById("origin-earth").checked).toBe(true);
        expect(documentRef.getElementById("origin-moon").checked).toBe(false);

        applyOriginMode("Moon");
        expect(documentRef.getElementById("origin-moon").checked).toBe(true);
        expect(documentRef.getElementById("origin-earth").checked).toBe(false);

        applyOriginMode("  LUNAR  ");
        expect(documentRef.getElementById("origin-moon").checked).toBe(true);

        applyOriginMode("relative");
        expect(documentRef.getElementById("origin-relative").checked).toBe(true);
        expect(documentRef.getElementById("origin-earth").checked).toBe(false);
        expect(documentRef.getElementById("origin-moon").checked).toBe(false);
    });

    it("clears every origin control for an unknown mode", () => {
        const documentRef = mountOrigins({ earth: true });
        applyOriginMode(null);
        expect(documentRef.getElementById("origin-earth").checked).toBe(false);
        expect(documentRef.getElementById("origin-moon").checked).toBe(false);
        expect(documentRef.getElementById("origin-relative").checked).toBe(false);
    });
});

describe("plane and dimension radio groups", () => {
    function mountRadios() {
        return mount([
            { id: "plane-default", tag: "input", name: "plane", value: "DEFAULT" },
            { id: "plane-xy", tag: "input", name: "plane", value: "XY" },
            { id: "dimension-2d", tag: "input", name: "dimension", value: "2D" },
            { id: "dimension-3d", tag: "input", name: "dimension", value: "3D" },
        ]);
    }

    it("falls back to DEFAULT/3D when nothing is selected", () => {
        mountRadios();
        expect(readPlaneSelection()).toBe("DEFAULT");
        expect(readDimensionSelection()).toBe("3D");
    });

    it("round-trips an applied plane and dimension", () => {
        mountRadios();

        applyPlaneSelection("XY");
        expect(readPlaneSelection()).toBe("XY");

        applyDimensionSelection("2D");
        expect(readDimensionSelection()).toBe("2D");
    });

    it("applies the documented default when given an empty selection", () => {
        const documentRef = mountRadios();

        applyPlaneSelection("");
        expect(documentRef.getElementById("plane-default").checked).toBe(true);

        applyDimensionSelection(undefined);
        expect(documentRef.getElementById("dimension-3d").checked).toBe(true);
    });

    it("leaves the group untouched when the requested value has no control", () => {
        const documentRef = mountRadios();
        applyPlaneSelection("XY");

        applyPlaneSelection("NOT-A-PLANE");

        expect(documentRef.getElementById("plane-xy").checked).toBe(true);
    });
});

describe("readViewSettings", () => {
    function mountSettings(extra = []) {
        return mount([
            { id: "view-orbit", tag: "input", checked: true },
            { id: "view-sky", tag: "input", checked: false },
            { id: "view-fps", tag: "input", checked: true },
            { id: "orbit-style-classic", tag: "input", name: "orbit-style", value: "classic" },
            { id: "orbit-style-trail", tag: "input", name: "orbit-style", value: "trail" },
            ...extra,
        ]);
    }

    it("projects every known checkbox, defaulting missing controls to false", () => {
        mountSettings();

        const settings = readViewSettings();

        expect(settings.viewOrbit).toBe(true);
        expect(settings.viewFPS).toBe(true);
        expect(settings.viewSky).toBe(false);
        // Not present in the DOM at all.
        expect(settings.viewMoonSOI).toBe(false);
    });

    it("reads `classic` unless the trail radio is selected", () => {
        const documentRef = mountSettings();
        expect(readViewSettings().orbitStyle).toBe("classic");

        documentRef.getElementById("orbit-style-trail").checked = true;
        expect(readViewSettings().orbitStyle).toBe("trail");
    });

    it("defaults trail brightness to 1 and reads finite slider values", () => {
        mountSettings([
            { id: "trail-track-brightness-2d", tag: "input", value: "0.4" },
            { id: "trail-tail-brightness-3d", tag: "input", value: "not-a-number" },
        ]);

        const settings = readViewSettings();

        expect(settings.trailTrackBrightness2D).toBe(0.4);
        expect(settings.trailTrackBrightness3D).toBe(1);
        expect(settings.trailTailBrightness3D).toBe(1);
    });

    it("omits the active craft when the selector has no value", () => {
        mountSettings([{ id: "active-craft-select", tag: "select", value: "" }]);
        expect(readViewSettings().activeCraftId).toBeUndefined();

        mountSettings([{ id: "active-craft-select", tag: "select", value: "ORION" }]);
        expect(readViewSettings().activeCraftId).toBe("ORION");
    });

    it("only reports optional sky parameters that are actually present", () => {
        mountSettings();
        const bare = readViewSettings();
        expect(bare.atmosphere_enabled).toBeUndefined();
        expect(bare.bloom_strength).toBeUndefined();

        mountSettings([
            { id: "atmosphere-enabled", tag: "input", checked: true },
            { id: "bloom-strength", tag: "input", value: "0.8" },
            { id: "sky-observer-lat", tag: "input", value: "-33.5" },
        ]);
        const populated = readViewSettings();
        expect(populated.atmosphere_enabled).toBe(true);
        expect(populated.bloom_strength).toBe(0.8);
        expect(populated.observer_lat).toBe(-33.5);
    });

    it("derives sky time in milliseconds from a seconds control", () => {
        mountSettings([{ id: "sky-time-seconds", tag: "input", value: "12" }]);
        expect(readViewSettings().sky_time_ms).toBe(12000);
    });

    it("prefers an explicit millisecond control over the seconds control", () => {
        // Matches `app/sky-actions.js`, which reads the same pair as
        // `readOptionalNumeric("sky-time-ms") ?? (seconds * 1000)`.
        mountSettings([
            { id: "sky-time-ms", tag: "input", value: "500" },
            { id: "sky-time-seconds", tag: "input", value: "12" },
        ]);
        expect(readViewSettings().sky_time_ms).toBe(500);
    });

    it("falls back to the seconds control when no millisecond control exists", () => {
        mountSettings([{ id: "sky-time-seconds", tag: "input", value: "12" }]);
        expect(readViewSettings().sky_time_ms).toBe(12000);
    });

    it("uses the millisecond control when no seconds control is mounted", () => {
        mountSettings([{ id: "sky-time-ms", tag: "input", value: "500" }]);
        expect(readViewSettings().sky_time_ms).toBe(500);
    });
});

describe("applyViewSettings", () => {
    function mountApplyTarget() {
        return mount([
            { id: "view-orbit", tag: "input", checked: false },
            { id: "view-sky", tag: "input", checked: false },
            { id: "orbit-style-classic", tag: "input", name: "orbit-style", value: "classic" },
            { id: "orbit-style-trail", tag: "input", name: "orbit-style", value: "trail" },
            { id: "orbit-row", tag: "div", className: "orbit-style-control" },
            { id: "trail-row", tag: "div", className: "trail-style-control" },
            { id: "trail-track-brightness-2d", tag: "input", value: "1" },
            { id: "trail-track-brightness-2d-value", tag: "span" },
            { id: "trail-track-brightness-3d", tag: "input", value: "1" },
            { id: "trail-track-brightness-3d-value", tag: "span" },
            { id: "trail-tail-brightness-2d", tag: "input", value: "1" },
            { id: "trail-tail-brightness-2d-value", tag: "span" },
            { id: "trail-tail-brightness-3d", tag: "input", value: "1" },
            { id: "trail-tail-brightness-3d-value", tag: "span" },
            { id: "sky-bloom-strength", tag: "input", value: "0" },
            { id: "sky-time-ms", tag: "input", value: "0" },
            { id: "sky-time-seconds", tag: "input", value: "0" },
            { id: "sky-atmosphere-enabled", tag: "input", checked: false },
        ]);
    }

    it("ignores a null patch", () => {
        const documentRef = mountApplyTarget();
        applyViewSettings(null);
        expect(documentRef.getElementById("view-orbit").checked).toBe(false);
    });

    it("writes known checkbox keys and skips unknown keys", () => {
        const documentRef = mountApplyTarget();

        applyViewSettings({ viewOrbit: true, viewSky: true, notARealSetting: true });

        expect(documentRef.getElementById("view-orbit").checked).toBe(true);
        expect(documentRef.getElementById("view-sky").checked).toBe(true);
    });

    it("hides orbit-style rows when the orbit is turned off", () => {
        const documentRef = mountApplyTarget();

        applyViewSettings({ viewOrbit: false, orbitStyle: "trail" });

        expect(documentRef.getElementById("orbit-row").classList.contains("settings-row--hidden")).toBe(true);
        expect(documentRef.getElementById("trail-row").classList.contains("settings-row--hidden")).toBe(true);
    });

    it("shows trail rows only for the trail style with a visible orbit", () => {
        const documentRef = mountApplyTarget();

        applyViewSettings({ viewOrbit: true, orbitStyle: "trail" });
        expect(documentRef.getElementById("orbit-row").classList.contains("settings-row--hidden")).toBe(false);
        expect(documentRef.getElementById("trail-row").classList.contains("settings-row--hidden")).toBe(false);
        expect(documentRef.getElementById("orbit-style-trail").checked).toBe(true);

        applyViewSettings({ viewOrbit: true, orbitStyle: "classic" });
        expect(documentRef.getElementById("trail-row").classList.contains("settings-row--hidden")).toBe(true);
        expect(documentRef.getElementById("orbit-style-classic").checked).toBe(true);
    });

    it("re-evaluates trail row visibility from the DOM when only the orbit toggles", () => {
        const documentRef = mountApplyTarget();
        documentRef.getElementById("orbit-style-trail").checked = true;

        applyViewSettings({ viewOrbit: true });

        expect(documentRef.getElementById("trail-row").classList.contains("settings-row--hidden")).toBe(false);
    });

    it("mirrors trail brightness into both slider and readout, rounded to two places", () => {
        const documentRef = mountApplyTarget();

        applyViewSettings({
            trailTrackBrightness2D: 0.333333,
            trailTrackBrightness3D: 2,
            trailTailBrightness2D: 0.5,
            trailTailBrightness3D: 1.25,
        });

        expect(documentRef.getElementById("trail-track-brightness-2d").value).toBe("0.333333");
        expect(documentRef.getElementById("trail-track-brightness-2d-value").textContent).toBe("0.33");
        expect(documentRef.getElementById("trail-track-brightness-3d-value").textContent).toBe("2.00");
        expect(documentRef.getElementById("trail-tail-brightness-2d-value").textContent).toBe("0.50");
        expect(documentRef.getElementById("trail-tail-brightness-3d-value").textContent).toBe("1.25");
    });

    it("leaves brightness controls alone for non-finite values", () => {
        const documentRef = mountApplyTarget();

        applyViewSettings({ trailTrackBrightness2D: Number.NaN });

        expect(documentRef.getElementById("trail-track-brightness-2d").value).toBe("1");
        expect(documentRef.getElementById("trail-track-brightness-2d-value").textContent).toBe("");
    });

    it("keeps the sky time seconds control consistent with milliseconds", () => {
        const documentRef = mountApplyTarget();

        applyViewSettings({ sky_time_ms: 4500, bloom_strength: 0.9, atmosphere_enabled: true });

        expect(documentRef.getElementById("sky-time-ms").value).toBe("4500");
        expect(documentRef.getElementById("sky-time-seconds").value).toBe("4.5");
        expect(documentRef.getElementById("sky-bloom-strength").value).toBe("0.9");
        expect(documentRef.getElementById("sky-atmosphere-enabled").checked).toBe(true);
    });

    it("ignores non-boolean atmosphere values and non-numeric sky values", () => {
        const documentRef = mountApplyTarget();

        applyViewSettings({ atmosphere_enabled: "true", bloom_strength: "abc" });

        expect(documentRef.getElementById("sky-atmosphere-enabled").checked).toBe(false);
        expect(documentRef.getElementById("sky-bloom-strength").value).toBe("0");
    });
});

describe("camera from/to projection", () => {
    function mountCamera() {
        return mount([
            { id: "camera-position", tag: "select", value: "" },
            { id: "camera-look", tag: "select", value: "" },
            { id: "camera-position-pill-earth", tag: "input", name: "camera-position-pill", value: "EARTH" },
            { id: "camera-look-pill-moon", tag: "input", name: "camera-look-pill", value: "MOON" },
        ]);
    }

    it("falls back to manual when the selects are empty", () => {
        mountCamera();
        expect(readCameraPositionMode()).toBe("manual");
        expect(readCameraLookMode()).toBe("manual");
    });

    it("refuses partial patches so no invalid intermediate pair is published", () => {
        const documentRef = mountCamera();
        const seen = [];
        documentRef.addEventListener("camera-from-to-ui-updated", (event) => seen.push(event.detail));

        applyCameraFromTo({ positionMode: "EARTH" });
        applyCameraFromTo({ lookMode: "MOON" });
        applyCameraFromTo(null);

        expect(seen).toEqual([]);
        expect(documentRef.getElementById("camera-position").value).toBe("");
    });

    it("writes selects, pill radios and announces the committed pair", () => {
        const documentRef = mountCamera();
        const seen = [];
        documentRef.addEventListener("camera-from-to-ui-updated", (event) => seen.push(event.detail));

        applyCameraFromTo({ positionMode: "EARTH", lookMode: "MOON" });

        expect(documentRef.getElementById("camera-position").value).toBe("EARTH");
        expect(documentRef.getElementById("camera-look").value).toBe("MOON");
        expect(documentRef.getElementById("camera-position-pill-earth").checked).toBe(true);
        expect(documentRef.getElementById("camera-look-pill-moon").checked).toBe(true);
        expect(seen).toEqual([{ positionMode: "EARTH", lookMode: "MOON" }]);
        expect(readCameraPositionMode()).toBe("EARTH");
        expect(readCameraLookMode()).toBe("MOON");
    });
});
