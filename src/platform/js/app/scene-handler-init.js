import { registerRenderDeviceCapabilities, resolveInteractivePixelRatio } from "../core/domain/render-device-policy.js";

export function initSceneHandlerDom({
    d3,
    bindSettingsPanel,
    computeSVGDimensions,
    getSvgWidth,
    getSvgHeight,
    isTestMode,
    onWindowResize,
    THREE,
}) {
    computeSVGDimensions();

    const width = getSvgWidth();
    const height = getSvgHeight();

    const createRendererWithFallback = () => {
        const attempts = [
            { antialias: true },
            { antialias: false, powerPreference: "high-performance" },
            { antialias: false, powerPreference: "low-power", preserveDrawingBuffer: false },
        ];

        let lastError = null;
        for (const options of attempts) {
            try {
                return new THREE.WebGLRenderer(options);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError || new Error("Unable to create WebGLRenderer with fallback options");
    };

    const renderer = createRendererWithFallback();
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = true;
    if (THREE.PCFShadowMap) {
        renderer.shadowMap.type = THREE.PCFShadowMap;
    } else if (THREE.PCFSoftShadowMap) {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    registerRenderDeviceCapabilities(renderer, window);
    renderer.setPixelRatio(isTestMode ? 1.0 : resolveInteractivePixelRatio(window));
    renderer.setSize(width, height);

    const canvasNode = d3.select("#canvas-wrapper")[0][0].appendChild(renderer.domElement);

    window.addEventListener("resize", onWindowResize, { passive: false });

    renderer.domElement.addEventListener("dragstart", function (e) {
        e.preventDefault();
        return false;
    });

    renderer.domElement.style.userSelect = "none";
    renderer.domElement.style.webkitUserSelect = "none";
    renderer.domElement.style.MozUserSelect = "none";

    bindSettingsPanel();

    return { renderer, canvasNode };
}
