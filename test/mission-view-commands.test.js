import { describe, expect, it, vi } from "vitest";
import { createMissionViewCommands } from "../src/platform/js/app/mission-view-commands.js";

function createElement() {
    return { classList: { toggle: vi.fn() }, setAttribute: vi.fn(), textContent: "" };
}

describe("mission view commands", () => {
    it("keeps Lunar Features separate from legacy Moon Sites", () => {
        let enabled = false;
        const pill = createElement();
        const visible = createElement();
        const legacySites = createElement();
        const nodes = new Map([
            ["toggle-pill-lunar-craters", pill],
            ["lunar-crater-visible-toggle", visible],
            ["view-craters", legacySites],
        ]);
        const applyViewSettings = vi.fn();
        const setView = vi.fn();
        const runtimeViewState = new Proxy({
            setViewLunarCraters: value => { enabled = value === true; },
            getViewLunarCraters: () => enabled,
            getViewCraters: () => false,
            getLunarCraterDisplayMode: () => "always",
        }, {
            get(target, key) { return target[key] || (() => null); },
        });
        const commands = createMissionViewCommands({
            runtimeViewState,
            documentRef: { getElementById: id => nodes.get(id) || null },
            applyViewSettings,
            getSetView: () => setView,
            render: vi.fn(),
        });

        expect(commands.setViewLunarCraters(true)).toBe(true);
        expect(applyViewSettings).toHaveBeenCalledWith(expect.objectContaining({
            viewCraters: false, viewLunarCraters: true, lunarCraterDisplayMode: "always",
        }));
        expect(pill.setAttribute).toHaveBeenCalledWith("aria-pressed", "true");
        expect(visible.setAttribute).toHaveBeenCalledWith("aria-pressed", "true");
        expect(legacySites.setAttribute).not.toHaveBeenCalled();
        expect(setView).toHaveBeenCalledTimes(1);
    });

    it("renders a photo-mode change and returns the owned state", () => {
        let photoMode = false;
        const render = vi.fn();
        const commands = createMissionViewCommands({
            runtimeViewState: {
                setViewPhotoMode: value => { photoMode = value === true; },
                getViewPhotoMode: () => photoMode,
            },
            documentRef: { getElementById: () => null },
            applyViewSettings: vi.fn(),
            getSetView: () => null,
            render,
        });
        expect(commands.setPhotoMode(true)).toBe(true);
        expect(commands.getPhotoMode()).toBe(true);
        expect(render).toHaveBeenCalledTimes(1);
    });
});
