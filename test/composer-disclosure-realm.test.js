import { describe, expect, it } from "vitest";
import { resolveComposerDisclosurePosition, resolveElementRealm } from "../src/platform/js/ui/composer-disclosure.js";

describe("composer disclosure owner realm", () => {
    it("uses the adopted element's current owner window", () => {
        const opener = { innerWidth: 1920, innerHeight: 1080 };
        const popup = { innerWidth: 480, innerHeight: 700 };
        const popupDocument = { defaultView: popup };
        expect(resolveElementRealm({ ownerDocument: popupDocument }, { windowRef: opener }).windowRef).toBe(popup);
        expect(resolveElementRealm({}, { windowRef: opener, documentRef: {} }).windowRef).toBe(opener);
    });

    it("clamps disclosure geometry within a narrow owning viewport", () => {
        const position = resolveComposerDisclosurePosition({
            anchorRect: { left: 320, bottom: 90 }, contentRect: { width: 292, height: 420 },
            viewportWidth: 480, viewportHeight: 700,
        });
        expect(position.left).toBe(180);
        expect(position.top).toBe(96);
        expect(position.left + 292).toBeLessThanOrEqual(472);
        expect(position.top + 420).toBeLessThanOrEqual(692);
    });
});
