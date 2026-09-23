import { vi } from "vitest";
import * as THREE from "three";

import { FakeResizeObserver, installFakeDom } from "./fake-dom.js";
import { AuxiliaryCameraViewsManager } from "../../src/platform/js/app/auxiliary-camera-views.js";

// The manager injects Three.js, so tests can mount real panels without WebGL.
export class FakeWebGLRenderer {
    constructor(options) {
        this.options = options;
        this.domElement = globalThis.document.createElement("canvas");
        this.shadowMap = { enabled: false, type: null };
        this.capabilities = {
            isWebGL2: true,
            maxTextureSize: 4096,
            getMaxAnisotropy: () => 4,
        };
        this.outputColorSpace = null;
        this.toneMapping = null;
        this.toneMappingExposure = 1;
        this.setPixelRatio = vi.fn();
        this.setSize = vi.fn();
        this.setViewport = vi.fn();
        this.setScissorTest = vi.fn();
        this.clear = vi.fn();
        this.render = vi.fn();
        this.dispose = vi.fn();
        this.getContext = () => ({ getExtension: () => null, getParameter: () => 0 });
    }
}

const fakeThree = { ...THREE, WebGLRenderer: FakeWebGLRenderer };

export function createManagerHarness(windowOverrides = {}) {
    const dom = installFakeDom([], {
        innerWidth: 1600,
        innerHeight: 900,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
        ...windowOverrides,
    });
    const requestRender = vi.fn();
    const manager = new AuxiliaryCameraViewsManager({
        THREE: fakeThree,
        overlayHost: dom.document.body,
        requestRender,
    });
    return { dom, manager, requestRender };
}
