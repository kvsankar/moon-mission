import { afterEach, describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import {
    disposeUnclaimedTextures,
    registerTextureDependency,
    releaseTextureOwner,
    replaceTextureOwner,
    updateTextureOwner,
} from "../src/platform/js/rendering/texture-ownership.js";

function resource() {
    const texture = new Texture();
    const disposed = vi.fn();
    texture.addEventListener("dispose", disposed);
    return { texture, disposed };
}

afterEach(() => vi.restoreAllMocks());

describe("texture ownership protocol", () => {
    it("counts aliases once per owner and preserves a second consumer", () => {
        const { texture, disposed } = resource();
        const first = {}, second = {};
        replaceTextureOwner(first, [texture, texture]);
        replaceTextureOwner(first, [texture]);
        replaceTextureOwner(second, [texture]);
        releaseTextureOwner(first);
        expect(disposed).not.toHaveBeenCalled();
        releaseTextureOwner(second);
        releaseTextureOwner(second);
        expect(disposed).toHaveBeenCalledOnce();
    });

    it("acquires incoming resources before disposing outgoing resources", () => {
        const a = resource(), b = resource(), owner = {};
        a.texture.addEventListener("dispose", () => disposeUnclaimedTextures([b.texture]));
        replaceTextureOwner(owner, [a.texture]);
        replaceTextureOwner(owner, [b.texture]);
        expect(a.disposed).toHaveBeenCalledOnce();
        expect(b.disposed).not.toHaveBeenCalled();
        releaseTextureOwner(owner);
        expect(b.disposed).toHaveBeenCalledOnce();
    });

    it("preserves a lease reacquired from a disposal callback", () => {
        const a = resource(), b = resource(), owner = {};
        a.texture.addEventListener("dispose", () => replaceTextureOwner(owner, [b.texture]));
        replaceTextureOwner(owner, [a.texture, b.texture]);
        releaseTextureOwner(owner);
        expect(b.disposed).not.toHaveBeenCalled();
        releaseTextureOwner(owner);
        expect(b.disposed).toHaveBeenCalledOnce();
    });

    it("allows the same texture to enter a later ownership epoch", () => {
        const { texture, disposed } = resource();
        for (let epoch = 0; epoch < 2; epoch += 1) {
            const owner = {};
            replaceTextureOwner(owner, [texture]);
            releaseTextureOwner(owner);
            disposeUnclaimedTextures([texture]);
        }
        expect(disposed).toHaveBeenCalledTimes(2);
    });

    it("unclaimed cleanup is idempotent and never reclaims a live consumer", () => {
        const free = resource(), used = resource(), owner = {};
        replaceTextureOwner(owner, [used.texture]);
        disposeUnclaimedTextures([free.texture, free.texture, used.texture]);
        disposeUnclaimedTextures([free.texture, used.texture]);
        expect(free.disposed).toHaveBeenCalledOnce();
        expect(used.disposed).not.toHaveBeenCalled();
        releaseTextureOwner(owner);
        expect(used.disposed).toHaveBeenCalledOnce();
    });

    it("keeps a generated dependency alive while an independent consumer uses it", () => {
        const parent = resource(), child = resource(), owner = {}, consumer = {};
        registerTextureDependency(parent.texture, child.texture);
        registerTextureDependency(parent.texture, child.texture);
        replaceTextureOwner(owner, [parent.texture]);
        replaceTextureOwner(consumer, [child.texture]);
        releaseTextureOwner(owner);
        expect(parent.disposed).toHaveBeenCalledOnce();
        expect(child.disposed).not.toHaveBeenCalled();
        releaseTextureOwner(consumer);
        expect(child.disposed).toHaveBeenCalledOnce();
    });

    it("cleans an unclaimed parent and its dependency exactly once", () => {
        const parent = resource(), child = resource();
        registerTextureDependency(parent.texture, child.texture);
        disposeUnclaimedTextures([parent.texture, child.texture]);
        disposeUnclaimedTextures([parent.texture, child.texture]);
        expect(parent.disposed).toHaveBeenCalledOnce();
        expect(child.disposed).toHaveBeenCalledOnce();
    });

    it.each(["before", "after"])("preserves dependencies when reacquisition is registered %s the dependency listener", (order) => {
        const parent = resource(), child = resource(), owner = {}, next = {};
        const reacquire = () => replaceTextureOwner(next, [parent.texture]);
        if (order === "before") parent.texture.addEventListener("dispose", reacquire);
        registerTextureDependency(parent.texture, child.texture);
        if (order === "after") parent.texture.addEventListener("dispose", reacquire);
        replaceTextureOwner(owner, [parent.texture]);
        releaseTextureOwner(owner);
        expect(child.disposed).not.toHaveBeenCalled();
        parent.texture.removeEventListener("dispose", reacquire);
        releaseTextureOwner(next);
        expect(child.disposed).toHaveBeenCalledOnce();
    });

    it("tracks the installed inputs even when a renderer update throws", () => {
        const old = resource(), next = resource(), owner = {};
        let inputs = [old.texture];
        replaceTextureOwner(owner, inputs);
        expect(() => updateTextureOwner(owner, () => inputs, () => {
            inputs = [next.texture];
            throw new Error("refresh failed");
        })).toThrow("refresh failed");
        expect(old.disposed).toHaveBeenCalledOnce();
        expect(next.disposed).not.toHaveBeenCalled();
        releaseTextureOwner(owner);
        expect(next.disposed).toHaveBeenCalledOnce();
    });

    it("supports relinquishing responsibility without destroying old resources", () => {
        const old = resource(), next = resource(), owner = {};
        replaceTextureOwner(owner, [old.texture]);
        replaceTextureOwner(owner, [next.texture], { disposePrevious: false });
        expect(old.disposed).not.toHaveBeenCalled();
        releaseTextureOwner(owner);
        expect(next.disposed).toHaveBeenCalledOnce();
        disposeUnclaimedTextures([old.texture]);
        expect(old.disposed).toHaveBeenCalledOnce();
    });

    it("continues cleanup after a resource throws", () => {
        const bad = resource(), good = resource(), owner = {};
        const error = new Error("native cleanup failed");
        bad.texture.addEventListener("dispose", () => { throw error; });
        vi.spyOn(console, "warn").mockImplementation(() => {});
        replaceTextureOwner(owner, [bad.texture, good.texture]);
        expect(releaseTextureOwner(owner)).toEqual([error]);
        expect(good.disposed).toHaveBeenCalledOnce();
        expect(releaseTextureOwner(owner)).toEqual([]);
    });
});
