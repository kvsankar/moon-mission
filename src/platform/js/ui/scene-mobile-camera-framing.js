// Applies the compact Artemis II card geometry to a scene camera look target.
function isArtemis2MissionContext(runtimeState, windowRef) {
    const missionName = String(
        runtimeState?.globalConfig?.mission_name_short ||
        runtimeState?.globalConfig?.mission_name ||
        "",
    ).toLowerCase();
    if (missionName.includes("artemis 2") || missionName.includes("artemis ii")) {
        return true;
    }
    const dataPath = String(windowRef?.missionConfig?.dataPath || "").toLowerCase();
    return dataPath.includes("/artemis2/") || dataPath.includes("\\artemis2\\");
}

export function resolvePanelAnchoredLookTarget({ scene, baseLookTarget, runtimeState }, { THREE, windowRef = globalThis.window, documentRef = globalThis.document }) {
    if (typeof windowRef === "undefined" || typeof documentRef === "undefined") {
        return baseLookTarget;
    }
    if (windowRef.innerWidth > 600) return baseLookTarget;
    if (scene?.name !== "geo") return baseLookTarget;
    if (!isArtemis2MissionContext(runtimeState, windowRef)) return baseLookTarget;
    if (!scene?.camera || !scene?.cameraController?.controls) return baseLookTarget;

    const panel = documentRef.getElementById("mobile-card-mission");
    if (!panel) return baseLookTarget;
    const panelBottom = panel.getBoundingClientRect?.().bottom;
    if (!Number.isFinite(panelBottom)) return baseLookTarget;

    const anchorObject = scene.earthContainer || scene.earth;
    if (!anchorObject) return baseLookTarget;

    const base = {
        x: Number.isFinite(baseLookTarget?.x) ? baseLookTarget.x : 0,
        y: Number.isFinite(baseLookTarget?.y) ? baseLookTarget.y : 0,
        z: Number.isFinite(baseLookTarget?.z) ? baseLookTarget.z : 0,
    };

    const PANEL_EDGE_PADDING_PX = 50;
    const desiredScreenY = Math.max(
        0,
        Math.min(windowRef.innerHeight * 0.8, panelBottom + PANEL_EDGE_PADDING_PX),
    );

    const anchorWorld = new THREE.Vector3();
    const ndcPoint = new THREE.Vector3();
    const projectScreenY = (targetY) => {
        const target = scene.cameraController.controls.target;
        target.set(base.x, targetY, base.z);
        scene.camera.lookAt(target);
        scene.camera.updateProjectionMatrix?.();
        scene.camera.updateMatrixWorld?.(true);
        anchorObject.getWorldPosition?.(anchorWorld);
        ndcPoint.copy(anchorWorld).project(scene.camera);
        return (-ndcPoint.y * 0.5 + 0.5) * windowRef.innerHeight;
    };

    const cameraDistance = Math.max(1, scene.camera.position.length?.() || 1);
    let low = -6 * cameraDistance;
    let high = 6 * cameraDistance;
    let lowY = projectScreenY(low);
    let highY = projectScreenY(high);
    if (!Number.isFinite(lowY) || !Number.isFinite(highY)) {
        return base;
    }
    if (lowY > highY) {
        const tmp = low;
        low = high;
        high = tmp;
        const t = lowY;
        lowY = highY;
        highY = t;
    }

    if (desiredScreenY <= lowY) {
        return { x: base.x, y: low, z: base.z };
    }
    if (desiredScreenY >= highY) {
        return { x: base.x, y: high, z: base.z };
    }

    for (let i = 0; i < 24; i += 1) {
        const mid = (low + high) * 0.5;
        const midY = projectScreenY(mid);
        if (!Number.isFinite(midY)) break;
        if (midY < desiredScreenY) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return { x: base.x, y: (low + high) * 0.5, z: base.z };
}
