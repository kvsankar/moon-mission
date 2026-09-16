import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let load, fetchImpl, windowRef;
beforeEach(async () => {
    vi.resetModules();
    windowRef = { location: { hostname: "example.test", href: "https://example.test/mission/" }, missionConfig: { dataPath: "assets/a/data/" } };
    fetchImpl = vi.fn();
    vi.stubGlobal("window", windowRef);
    vi.stubGlobal("fetch", fetchImpl);
    ({ loadMissionMediaManifest: load } = await import("../src/platform/js/data/mission-media.js"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const select = name => { windowRef.missionConfig.dataPath = `assets/${name}/data/`; };

describe("mission media load recovery and URL ownership", () => {
    it.each(["http", "network", "parse"])("does not cache %s failure and deduplicates explicit retry", async kind => {
        const cause = new Error("private-host/internal");
        if (kind === "http") fetchImpl.mockResolvedValueOnce(response(null, 503));
        if (kind === "network") fetchImpl.mockRejectedValueOnce(cause);
        if (kind === "parse") fetchImpl.mockResolvedValueOnce({ ok: true, json: async () => { throw cause; } });
        const errors = await Promise.all([load().catch(error => error), load().catch(error => error)]);
        expect(errors[0]).toMatchObject({ name: "MediaManifestLoadError", kind });
        expect(errors[1]).toBe(errors[0]);
        expect(errors[0].message).not.toContain("private-host");
        if (kind === "http") expect(errors[0].status).toBe(503);
        else expect(errors[0].cause).toBe(cause);
        expect(fetchImpl).toHaveBeenCalledOnce();
        const value = { mediaItems: [] };
        fetchImpl.mockResolvedValueOnce(response(value));
        const retried = await Promise.all([load(), load()]);
        expect(retried).toEqual([value, value]);
        expect(retried[0]).toBe(value);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("caches a genuine 404 absence without parsing the response", async () => {
        const absent = response(null, 404);
        absent.json = vi.fn();
        fetchImpl.mockResolvedValueOnce(absent);
        expect(await load()).toBeNull();
        expect(await load()).toBeNull();
        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(absent.json).not.toHaveBeenCalled();
    });

    it.each([null, [], 42, { mediaItems: {} }, { audioItems: {} }, { mediaStreams: "bad" },
        { photos: {} }, { audio: false }, { mediaMetadata: {} }, { ui: [] }, { filters: null },
        { provenance: "bad" }, { thumbnails: [] }, { cameraProfiles: 42 }])(
        "rejects invalid supplied manifest shape %# without poisoning recovery", async value => {
            fetchImpl.mockResolvedValueOnce(response(value)).mockResolvedValueOnce(response({}));
            await expect(load()).rejects.toMatchObject({ name: "MediaManifestLoadError", kind: "shape" });
            expect(await load()).toEqual({});
            expect(fetchImpl).toHaveBeenCalledTimes(2);
        },
    );

    it.each([{}, { cameraProfiles: [] }, { cameraProfiles: {} },
        JSON.parse(readFileSync(new URL("../assets/artemis2/data/media-manifest.json", import.meta.url), "utf8"))])(
        "accepts and caches supported manifest %# without copying", async value => {
            fetchImpl.mockResolvedValueOnce(response(value));
            const values = await Promise.all([load(), load()]);
            expect(values[0]).toBe(value);
            expect(values[1]).toBe(value);
            expect(await load()).toBe(value);
            expect(fetchImpl).toHaveBeenCalledExactlyOnceWith("assets/a/data/media-manifest.json", { cache: "no-store" });
        },
    );

    it("returns absent for missing URL without preventing later configured loading", async () => {
        windowRef.missionConfig.dataPath = "";
        expect(await load()).toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
        select("a");
        fetchImpl.mockResolvedValueOnce(response({}));
        expect(await load()).toEqual({});
    });

    it("keeps A/B caches isolated when A finishes last and ABA rejoins A", async () => {
        const a = deferred(), b = deferred();
        fetchImpl.mockImplementation(url => url.includes("/a/") ? a.promise : b.promise);
        const firstA = load();
        select("b"); const firstB = load();
        select("a"); const secondA = load();
        await Promise.resolve();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        b.resolve(response({ title: "B" })); await firstB;
        a.resolve(response({ title: "A" }));
        expect(await firstA).toEqual({ title: "A" });
        expect(await secondA).toEqual({ title: "A" });
        select("b"); expect(await load()).toEqual({ title: "B" });
        select("a"); expect(await load()).toEqual({ title: "A" });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("old A failure cannot clear B's pending owner", async () => {
        const a = deferred(), b = deferred();
        fetchImpl.mockImplementation(url => url.includes("/a/") ? a.promise : b.promise);
        const firstA = load().catch(error => error);
        select("b"); const firstB = load();
        a.reject(new Error("A offline")); await firstA;
        const secondB = load();
        b.resolve(response({ title: "B" }));
        expect(await firstB).toEqual({ title: "B" });
        expect(await secondB).toEqual({ title: "B" });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("B404 remains absent after a late A success", async () => {
        const a = deferred();
        fetchImpl.mockImplementation(url => url.includes("/a/") ? a.promise : Promise.resolve(response(null, 404)));
        const firstA = load();
        select("b"); expect(await load()).toBeNull();
        a.resolve(response({ title: "A" })); await firstA;
        expect(await load()).toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});
