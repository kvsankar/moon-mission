import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { renderMissionPageForFolder } from "../scripts/lib/mission-pages.mjs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const expectedVersion = "12.2.0";

describe("patched Swiper distribution contract", () => {
    it("pins npm, lockfile and both CDN assets to the same reviewed version", () => {
        const pkg = JSON.parse(read("../package.json"));
        const lock = JSON.parse(read("../package-lock.json"));
        expect(pkg.dependencies.swiper).toBe(expectedVersion);
        expect(lock.packages["node_modules/swiper"].version).toBe(expectedVersion);
        expect(read("../src/platform/js/mission.js")).toMatch(/import Swiper from ['"]swiper\/bundle['"]/);
        for (const html of [read("../mission.html"), renderMissionPageForFolder("chandrayaan3"), renderMissionPageForFolder("artemis2")]) {
            expect(html).toContain(`https://cdn.jsdelivr.net/npm/swiper@${expectedVersion}/swiper-bundle.min.css`);
            expect(html).toContain(`"swiper/bundle": "https://cdn.jsdelivr.net/npm/swiper@${expectedVersion}/swiper-bundle.min.mjs"`);
            expect(html).not.toMatch(/swiper@(?:10|11)(?:\/|\.)/);
        }
    });

    it("rejects the prototype-pollution bypass in an isolated Node process", () => {
        // Isolate the advisory's deliberate built-in mutation from other tests.
        const code = `
            import assert from 'node:assert/strict';
            import Swiper from 'swiper/bundle';
            const original = Array.prototype.indexOf;
            try {
                Array.prototype.indexOf = () => -1;
                try { Swiper.extendDefaults(JSON.parse('{"__proto__":{"__swiper_pollution_probe__":true}}')); }
                catch { /* Throwing rather than merging unsafe keys is also safe. */ }
            } finally { Array.prototype.indexOf = original; }
            assert.equal(Object.hasOwn(Object.prototype, '__swiper_pollution_probe__'), false);
            Swiper.extendDefaults({ speed: 321 });
            assert.equal(Swiper.extendedDefaults.speed, 321);
            console.log('clean');
        `;
        const result = execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 15000 });
        expect(result.trim()).toBe("clean");
    });
});
