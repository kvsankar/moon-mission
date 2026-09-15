import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveDockviewEnabled } from "../src/platform/js/core/domain/dockview-policy.js";

describe("configured Dockview policy", () => {
    const disabled = { ui: { dockviewEnabled: false } };
    it("keeps the normal desktop default and the mobile boundary", () => {
        expect(resolveDockviewEnabled({ viewportWidth: 1280 })).toBe(true);
        expect(resolveDockviewEnabled({ viewportWidth: 600 })).toBe(false);
        expect(resolveDockviewEnabled({ viewportWidth: 601 })).toBe(true);
    });
    it("honors the mission/profile feature flag before workspace initialization", () => {
        expect(resolveDockviewEnabled({ viewportWidth: 1920, missionConfig: disabled })).toBe(false);
        const profile = JSON.parse(readFileSync(new URL("../assets/chandrayaan3/data/config.ssim.json", import.meta.url), "utf8"));
        expect(profile.ui.dockviewEnabled).toBe(false);
        expect(resolveDockviewEnabled({ viewportWidth: 1280, missionConfig: profile })).toBe(false);
    });
    it("preserves explicit URL overrides with legacy-off taking precedence", () => {
        expect(resolveDockviewEnabled({ viewportWidth: 1280, missionConfig: disabled, urlSearch: "?dockPanels=1" })).toBe(true);
        expect(resolveDockviewEnabled({ viewportWidth: 1280, urlSearch: "?dockPanels=0" })).toBe(false);
        expect(resolveDockviewEnabled({ viewportWidth: 390, urlSearch: "?dockPanels=yes" })).toBe(true);
        expect(resolveDockviewEnabled({ viewportWidth: 1280, urlSearch: "?legacyPanels=1&dockPanels=1" })).toBe(false);
    });
});
