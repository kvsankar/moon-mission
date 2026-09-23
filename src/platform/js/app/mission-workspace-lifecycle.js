import { whenMissionConfigLoaded } from "../data/mission-data.js";
import { createViewportCapabilityCoordinator } from "./viewport-capability-coordinator.js";
import { resolveDockviewEnabled } from "../core/domain/dockview-policy.js";

export function startMissionWorkspaceLifecycle({
    windowRef,
    documentRef,
    getMissionRuntimeWireup,
    getAnimationScenes,
    getSceneHandler,
    clearSceneHandler,
}) {
    let runtimeCleanupRegistered = false;
    let runtimeCleanupComplete = false;
    let desktopCapabilityCoordinator = null;

    function disposeMissionRuntimeResources() {
        if (runtimeCleanupComplete) {
            return;
        }
        runtimeCleanupComplete = true;
        desktopCapabilityCoordinator?.dispose?.();
        desktopCapabilityCoordinator = null;
        if (windowRef.__moonMissionResizeMainView) {
            delete windowRef.__moonMissionResizeMainView;
        }
        getMissionRuntimeWireup()?.sceneUiUpdateActions?.dispose?.();
        Object.values(getAnimationScenes() || {}).forEach((scene) => {
            scene?.dispose?.();
        });
        getSceneHandler()?.dispose?.();
        clearSceneHandler();
    }

    function registerMissionRuntimeCleanup() {
        if (runtimeCleanupRegistered || typeof windowRef === "undefined") {
            return;
        }
        runtimeCleanupRegistered = true;
        windowRef.addEventListener("pagehide", (event) => {
            if (event?.persisted === true) {
                return;
            }
            disposeMissionRuntimeResources();
        }, { once: true });
        windowRef.addEventListener("beforeunload", () => {
            disposeMissionRuntimeResources();
        }, { once: true });
    }

    registerMissionRuntimeCleanup();

    // Wait for a successful runtime-driven load (including an explicit retry) before
    // importing or mounting the workspace. Never use defaults after a config failure:
    // CY3's SSIM profile, for example, explicitly selects the legacy scene layout.
    whenMissionConfigLoaded().then((missionConfig) => {
        desktopCapabilityCoordinator?.dispose?.();
        desktopCapabilityCoordinator = createViewportCapabilityCoordinator({
            windowRef: windowRef,
            isEnabled: ({ viewportWidth, missionConfig: config }) => resolveDockviewEnabled({
                urlSearch: windowRef.location.search,
                viewportWidth,
                missionConfig: config,
            }),
            loadCapability: () => import("./experimental-dockview-host.js"),
            activateCapability: ({ initializeExperimentalDockviewHost }, config) => {
                const workspace = initializeExperimentalDockviewHost({ missionConfig: config });
                documentRef.documentElement.dataset.panelLayout = workspace ? "dockview" : "legacy";
                return workspace;
            },
            isCapabilityActive: () => !!windowRef.__moonMissionDockviewSpike,
            onUnavailable: () => { documentRef.documentElement.dataset.panelLayout = "legacy"; },
        });
        return desktopCapabilityCoordinator.start(missionConfig);
    }).catch((error) => {
        documentRef.documentElement.dataset.panelLayout = "error";
        console.warn("Dockview panel workspace failed to initialize", error);
    });

    // end of file

    return { dispose: disposeMissionRuntimeResources };
}
