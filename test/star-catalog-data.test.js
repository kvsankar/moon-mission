import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
    BRIGHT_STAR_CATALOG,
    HIPPARCOS_VMAG6_CATALOG,
    STAR_CATALOG_BRIGHT,
    STAR_CATALOG_HIPPARCOS_V6,
    getBrightStarCatalog,
    getHipparcosVmag6Catalog,
} from "../src/platform/js/rendering/star-catalog-hipparcos.js";
import { STAR_NAME_CROSS_INDEX } from "../src/platform/js/rendering/star-name-cross-index.js";

function dataHash(value) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

describe("generated star catalog assembly", () => {
    it("preserves every Hipparcos row, order, and compatibility alias", () => {
        expect(HIPPARCOS_VMAG6_CATALOG).toHaveLength(5041);
        expect(dataHash(HIPPARCOS_VMAG6_CATALOG)).toBe(
            "8cc9a70b541a71b85c30dc334fd915681ed1503be483d19517b1a5590ee4fe63",
        );
        expect(Object.isFrozen(HIPPARCOS_VMAG6_CATALOG)).toBe(true);
        for (const alias of [STAR_CATALOG_HIPPARCOS_V6, STAR_CATALOG_BRIGHT,
            BRIGHT_STAR_CATALOG, getHipparcosVmag6Catalog(), getBrightStarCatalog()]) {
            expect(alias).toBe(HIPPARCOS_VMAG6_CATALOG);
        }
    });

    it("preserves every HIP-keyed display name", () => {
        expect(Object.keys(STAR_NAME_CROSS_INDEX)).toHaveLength(2914);
        expect(dataHash(STAR_NAME_CROSS_INDEX)).toBe(
            "094d7ab1d0c638b678a15f76879a6a6ea3462595979a9311647b489263475eeb",
        );
        expect(Object.isFrozen(STAR_NAME_CROSS_INDEX)).toBe(true);
    });
});
