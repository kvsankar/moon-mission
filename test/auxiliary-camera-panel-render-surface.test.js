import { afterEach, describe, expect, it, vi } from "vitest";

import { installFakeDom } from "./helpers/fake-dom.js";
import { createAuxiliaryPanelRenderSurface } from "../src/platform/js/app/auxiliary-camera-panel-render-surface.js";

let dom;

afterEach(() => {
    dom?.restore();
    dom = null;
});

describe("auxiliary panel render surface", () => {
    it("releases an allocated renderer when setup fails", () => {
        dom = installFakeDom([]);
        const panel = dom.document.createElement("section");
        dom.document.body.appendChild(panel);
        const renderer = {
            outputColorSpace: null,
            shadowMap: { enabled: false },
            dispose: vi.fn(),
        };

        const result = createAuxiliaryPanelRenderSurface({
            THREE: { SRGBColorSpace: "srgb", ACESFilmicToneMapping: "aces", PCFShadowMap: 1 },
            panel,
            spec: { id: "failed", title: "Failed", defaultFov: 45 },
            panelMode: "target",
            panelSide: "right",
            chipDockLeft: null,
            chipDockRight: null,
        }, {
            createAuxiliaryWebGLRendererWithFallback: () => renderer,
            registerRenderDeviceCapabilities: () => { throw new Error("capability setup failed"); },
            resolveInteractivePixelRatio: () => 1,
        });

        expect(result).toBeNull();
        expect(renderer.dispose).toHaveBeenCalledOnce();
        expect(dom.document.body.children).not.toContain(panel);
    });
});
