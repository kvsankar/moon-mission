import { describe, expect, it, vi } from "vitest";
import { loadSceneTexturesProgressively } from "../src/platform/js/app/texture-loader.js";
import { applyAndRefreshSceneTextures } from "../src/platform/js/app/scene-texture-actions.js";
import { createScene3dInitActions } from "../src/platform/js/app/scene-3d-init-actions.js";

function harness() {
    const textures = [];
    const THREE = {
        LinearFilter: "linear", SRGBColorSpace: "srgb",
        TextureLoader: class {
            load(url, onLoad) {
                const texture = { url, dispose: vi.fn() };
                textures.push(texture);
                onLoad(texture);
            }
        },
    };
    const load = options => loadSceneTexturesProgressively({
        THREE, globalObject: {}, files: { earthTexture: "/earth.jpg", earthNightTexture: "/night.jpg" },
        textureGroups: [["earthTexture"]], ...options,
    });
    return { textures, load };
}

describe("progressive texture ownership handoff", () => {
    it("accepts the original resource identities even if the consumer moves payload fields", async () => {
        const h = harness();
        let installed;
        await expect(h.load({ onTexturesReady: (textures, info) => {
            installed = textures.earthTexture;
            delete textures.earthTexture;
            info.acceptOwnership();
            throw new Error("later render failed");
        } })).rejects.toThrow("later render failed");
        expect(installed).toBe(h.textures[0]);
        expect(installed.dispose).not.toHaveBeenCalled();
        installed.dispose();
    });

    it("wires acceptance through real scene initialization before renderer refresh errors", async () => {
        const h = harness();
        const failure = new Error("refresh failed after assignment");
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        let accepted;
        const scene = { initialized3D: false,
            init3dRest() { this.initialized3D = true; this.deferred3DInitRunId = 1; },
            earthRenderer: { updateTextures: () => { throw failure; } },
        };
        const actions = createScene3dInitActions({
            THREE: {}, globalObject: { MOON_RENDER_ASSET_PROFILE: "fast" },
            createPlaceholderSceneTextures: () => ({ moonRenderProfile: "fast" }),
            loadSceneTextures: vi.fn(), applyAndRefreshSceneTextures, render: vi.fn(),
            loadSceneTexturesProgressively: options => h.load({
                signal: options.signal, beforeLoadGroup: options.beforeLoadGroup,
                beforeApplyGroup: options.beforeApplyGroup,
                onTexturesReady(textures, info) {
                    accepted = vi.fn(info.acceptOwnership);
                    return options.onTexturesReady(textures, { ...info, acceptOwnership: accepted });
                },
            }),
        });
        try {
            actions.init3d(scene, vi.fn());
            await scene.beginTextureLoad();
            expect(accepted).toHaveBeenCalledOnce();
            expect(scene.textureLoadState).toBe("error");
            expect(scene.earthTexture).toBe(h.textures[0]);
            expect(h.textures[0].dispose).not.toHaveBeenCalled();
        } finally {
            logged.mockRestore();
            scene.earthTexture?.dispose();
        }
    });

    for (const asyncFailure of [false, true]) {
        it(`disposes an unaccepted group after ${asyncFailure ? "asynchronous" : "synchronous"} consumer rejection`, async () => {
            const h = harness();
            const error = Object.assign(new Error("scene superseded"), { name: "TextureLoadStaleError" });
            await expect(h.load({ onTexturesReady: () => {
                if (asyncFailure) return Promise.reject(error);
                throw error;
            } })).rejects.toBe(error);
            expect(h.textures).toHaveLength(1);
            expect(h.textures[0].dispose).toHaveBeenCalledOnce();
        });
    }

    it("keeps previously accepted groups when a later group is rejected", async () => {
        const h = harness();
        await expect(h.load({ textureGroups: [["earthTexture"], ["earthNightTexture"]],
            onTexturesReady: (_textures, info) => { if (info.groupIndex === 1) throw new Error("later rejection"); },
        })).rejects.toThrow("later rejection");
        expect(h.textures).toHaveLength(2);
        expect(h.textures[0].dispose).not.toHaveBeenCalled();
        expect(h.textures[1].dispose).toHaveBeenCalledOnce();
    });

    it("does not reclaim explicitly accepted textures when rendering fails after scene assignment", async () => {
        const h = harness();
        const error = new Error("renderer refresh failed");
        const scene = { earthRenderer: { updateTextures: () => { throw error; } } };
        await expect(h.load({ onTexturesReady: (textures, info) => {
            expect(info.acceptOwnership).toBeTypeOf("function");
            applyAndRefreshSceneTextures(scene, textures, { onAccepted: info.acceptOwnership });
        } })).rejects.toBe(error);
        expect(scene.earthTexture).toBe(h.textures[0]);
        expect(h.textures[0].dispose).not.toHaveBeenCalled();
        // The scene accepted ownership and is responsible for eventual cleanup.
        scene.earthTexture.dispose();
        expect(h.textures[0].dispose).toHaveBeenCalledOnce();
    });

    it("does not dispose accepted textures when cancellation follows a successful callback", async () => {
        const h = harness();
        const controller = new AbortController();
        await expect(h.load({ signal: controller.signal,
            onTexturesReady: () => { controller.abort(); },
        })).rejects.toMatchObject({ name: "AbortError" });
        expect(h.textures[0].dispose).not.toHaveBeenCalled();
    });

    it("closes acceptance after a rejected callback so late acceptance cannot reclaim disposed textures", async () => {
        const h = harness();
        let accept;
        await expect(h.load({ onTexturesReady: (_textures, info) => {
            accept = info.acceptOwnership;
            throw new Error("rejected");
        } })).rejects.toThrow("rejected");
        expect(accept).toBeTypeOf("function");
        expect(accept()).toBe(false);
        expect(h.textures[0].dispose).toHaveBeenCalledOnce();
    });
});
