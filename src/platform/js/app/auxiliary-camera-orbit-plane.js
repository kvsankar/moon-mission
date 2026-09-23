// Earth-origin XY orbit-plane projection and rendering.

export function computeOrbitPlaneHalfHeight(
    dependencies,
    { scene, earthWorld, moonWorld, craftWorld, earthRadius, moonRadius, missionConfig = null },
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    let maxRadius = Math.max(
        Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius * 6 : 1,
        Number.isFinite(moonRadius) && moonRadius > 0 ? moonRadius : 1,
    );

    const includeWorldPoint = (point, radius = 0) => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return;
        }
        const dx = point.x - earthWorld.x;
        const dy = point.y - earthWorld.y;
        const distance = Math.hypot(dx, dy) + Math.max(0, radius);
        if (Number.isFinite(distance)) {
            maxRadius = Math.max(maxRadius, distance);
        }
    };

    includeWorldPoint(moonWorld, moonRadius);
    includeWorldPoint(craftWorld, 0);
    for (const bodyId of this.resolveOrbitPlaneCurveBodyIds(scene, missionConfig)) {
        const curve = scene?.curvesById?.[bodyId] || [];
        for (const point of curve) {
            includeWorldPoint(point, 0);
        }
    }

    scene?.traverse?.((object) => {
        if (!object?.visible || (!object.isLine && !object.isLineLoop && !object.isLineSegments)) {
            return;
        }
        const geometry = object.geometry;
        if (!geometry) {
            return;
        }
        geometry.computeBoundingSphere?.();
        const sphere = geometry.boundingSphere;
        if (!sphere || !Number.isFinite(sphere.radius)) {
            return;
        }
        this.tmpVectorA.copy(sphere.center);
        object.localToWorld?.(this.tmpVectorA);
        const scale = object.getWorldScale ? object.getWorldScale(this.tmpVectorB) : this.tmpVectorB.set(1, 1, 1);
        const worldRadius = sphere.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 1e-6);
        includeWorldPoint(this.tmpVectorA, worldRadius);
    });

    return Math.max(maxRadius * 1.12, 1);
}

export function createOrbitPlaneProjector(
    dependencies,
    { width, height, earthWorld, halfHeight, panOffsetX = 0, panOffsetY = 0 },
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const safeHalfHeight = Math.max(1e-9, halfHeight);
    const aspect = safeWidth / safeHeight;
    const halfWidth = safeHalfHeight * aspect;
    const scaleX = safeWidth / (halfWidth * 2);
    const scaleY = safeHeight / (safeHalfHeight * 2);
    const centerX = earthWorld.x + (Number(panOffsetX) || 0);
    const centerY = earthWorld.y + (Number(panOffsetY) || 0);
    const project = (worldPoint) => ({
        x: (safeWidth * 0.5) + ((worldPoint.x - centerX) * scaleX),
        y: (safeHeight * 0.5) - ((worldPoint.y - centerY) * scaleY),
    });
    project.scaleX = scaleX;
    project.scaleY = scaleY;
    project.centerX = centerX;
    project.centerY = centerY;
    return project;
}

export function drawOrbitPlaneMarker(
    dependencies,
    ctx,
    project,
    worldPoint,
    {
        radiusPx,
        fill,
        stroke = "rgba(218, 235, 255, 0.85)",
        label = "",
        labelOffsetX = 8,
        labelOffsetY = -8,
    },
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y)) {
        return;
    }
    const point = project(worldPoint);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    if (label) {
        ctx.font = "700 10px sans-serif";
        ctx.fillStyle = "rgba(220, 235, 255, 0.88)";
        ctx.textBaseline = "middle";
        ctx.fillText(label, point.x + labelOffsetX, point.y + labelOffsetY);
    }
    ctx.restore();
}

export function drawOrbitPlaneLineObject(
    dependencies,
    ctx,
    object,
    project,
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    const geometry = object?.geometry;
    const position = geometry?.getAttribute?.("position");
    if (!position || position.count < 2) {
        return false;
    }
    const drawRange = geometry.drawRange || {};
    const rangeStart = Number.isFinite(drawRange.start)
        ? Math.max(0, Math.floor(drawRange.start))
        : 0;
    const rangeCount = Number.isFinite(drawRange.count)
        ? Math.max(0, Math.floor(drawRange.count))
        : Infinity;
    const rangeEnd = Math.min(position.count, rangeStart + rangeCount);
    if (rangeEnd - rangeStart < 2) {
        return false;
    }
    const color = object.material?.color;
    const opacity = Number.isFinite(object.material?.opacity) ? object.material.opacity : 1;
    const strokeColor = color
        ? `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${Math.max(0.18, Math.min(0.72, opacity))})`
        : "rgba(117, 176, 255, 0.46)";
    const drawVertex = (index) => {
        this.tmpVectorA.fromBufferAttribute(position, index);
        object.localToWorld?.(this.tmpVectorA);
        return project(this.tmpVectorA);
    };
    const drawPolyline = () => {
        ctx.beginPath();
        let moved = false;
        let drewSegment = false;
        for (let i = rangeStart; i < rangeEnd; i += 1) {
            const point = drawVertex(i);
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                continue;
            }
            if (!moved) {
                ctx.moveTo(point.x, point.y);
                moved = true;
            } else {
                ctx.lineTo(point.x, point.y);
                drewSegment = true;
            }
        }
        if (object.isLineLoop && moved && drewSegment) {
            ctx.closePath();
        }
        if (drewSegment) {
            ctx.stroke();
        }
        return drewSegment;
    };

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = object.isLineSegments ? 1 : 1.35;
    ctx.setLineDash(object.isLineSegments ? [3, 4] : []);
    let drew = false;
    if (object.isLineSegments) {
        for (let i = rangeStart; i + 1 < rangeEnd; i += 2) {
            const a = drawVertex(i);
            const b = drawVertex(i + 1);
            if (
                Number.isFinite(a.x) &&
                Number.isFinite(a.y) &&
                Number.isFinite(b.x) &&
                Number.isFinite(b.y)
            ) {
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                drew = true;
            }
        }
    } else {
        drew = drawPolyline();
    }
    ctx.restore();
    return drew;
}

export function resolveOrbitPlaneCurveBodyIds(
    dependencies,
    scene,
    missionConfig = null,
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    const curvesById = scene?.curvesById || {};
    const bodyIds = [];
    const seen = new Set();
    const addBodyId = (bodyId) => {
        if (!bodyId || seen.has(bodyId)) {
            return;
        }
        const curve = curvesById[bodyId];
        if (!Array.isArray(curve) || curve.length < 2) {
            return;
        }
        seen.add(bodyId);
        bodyIds.push(bodyId);
    };

    try {
        getSceneVisibleCraftIds(scene, missionConfig).forEach(addBodyId);
    } catch {
        // Fall back to scene-local ids below; the overlay should still draw
        // when mission metadata is not available during startup.
    }
    addBodyId(scene?.activeCraftId);
    addBodyId(scene?.primaryCraftId);
    if (bodyIds.length === 0) {
        Object.keys(curvesById).forEach(addBodyId);
    }
    return bodyIds;
}

export function resolveOrbitPlaneCurveStroke(
    dependencies,
    scene,
    bodyId,
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    const lines = scene?.orbitLinesByBodyId?.[bodyId] || [];
    const sourceLine = lines.find((line) => line?.material?.color);
    const color = sourceLine?.material?.color;
    const opacity = Number.isFinite(sourceLine?.material?.opacity)
        ? sourceLine.material.opacity
        : 0.56;
    if (!color) {
        return "rgba(117, 176, 255, 0.56)";
    }
    return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${Math.max(0.22, Math.min(0.76, opacity))})`;
}

export function drawOrbitPlaneCurve(
    dependencies,
    ctx,
    curve,
    project,
    { strokeStyle = "rgba(117, 176, 255, 0.56)", lineWidth = 1.35 } = {},
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    if (!Array.isArray(curve) || curve.length < 2) {
        return false;
    }
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);
    ctx.beginPath();
    let moved = false;
    let drewSegment = false;
    for (const worldPoint of curve) {
        if (
            !worldPoint ||
            !Number.isFinite(worldPoint.x) ||
            !Number.isFinite(worldPoint.y)
        ) {
            moved = false;
            continue;
        }
        const point = project(worldPoint);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            moved = false;
            continue;
        }
        if (!moved) {
            ctx.moveTo(point.x, point.y);
            moved = true;
        } else {
            ctx.lineTo(point.x, point.y);
            drewSegment = true;
        }
    }
    if (drewSegment) {
        ctx.stroke();
    }
    ctx.restore();
    return drewSegment;
}

export function drawOrbitPlaneCurvesFromSceneData(
    dependencies,
    ctx,
    scene,
    project,
    missionConfig = null,
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    let drewAny = false;
    for (const bodyId of this.resolveOrbitPlaneCurveBodyIds(scene, missionConfig)) {
        const curve = scene?.curvesById?.[bodyId] || [];
        const drew = this.drawOrbitPlaneCurve(ctx, curve, project, {
            strokeStyle: this.resolveOrbitPlaneCurveStroke(scene, bodyId),
        });
        drewAny = drewAny || drew;
    }
    return drewAny;
}

export function renderOrbitPlane2DOverlay(
    dependencies,
    panelState,
    { scene, earthWorld, moonWorld, craftWorld, earthRadius, moonRadius, halfHeight, missionConfig = null },
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    const canvas = panelState?.overlayCanvas;
    const ctx = panelState?.overlayCtx;
    if (!canvas || !ctx) {
        return;
    }
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const project = this.createOrbitPlaneProjector({
        width,
        height,
        earthWorld,
        halfHeight,
        panOffsetX: panelState.orbitPanOffsetX,
        panOffsetY: panelState.orbitPanOffsetY,
    });

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(4, 10, 19, 0.96)";
    ctx.fillRect(0, 0, width, height);

    const gridStep = Math.max(1, halfHeight / 4);
    const aspect = width / Math.max(1, height);
    const halfWidth = halfHeight * aspect;
    ctx.strokeStyle = "rgba(120, 166, 232, 0.12)";
    ctx.lineWidth = 1;
    for (let x = -Math.floor(halfWidth / gridStep) * gridStep; x <= halfWidth; x += gridStep) {
        const screenX = project({ x: earthWorld.x + x, y: earthWorld.y }).x;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
        ctx.stroke();
    }
    for (let y = -Math.floor(halfHeight / gridStep) * gridStep; y <= halfHeight; y += gridStep) {
        const screenY = project({ x: earthWorld.x, y: earthWorld.y + y }).y;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
        ctx.stroke();
    }

    ctx.strokeStyle = "rgba(162, 200, 255, 0.28)";
    ctx.lineWidth = 1.25;
    const origin = project(earthWorld);
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.stroke();

    let drewCraftOrbit = false;
    scene?.traverse?.((object) => {
        if (!object?.visible || (!object.isLine && !object.isLineLoop && !object.isLineSegments)) {
            return;
        }
        const drewLine = this.drawOrbitPlaneLineObject(ctx, object, project);
        if (drewLine && object?.userData?.bodyId && scene?.curvesById?.[object.userData.bodyId]) {
            drewCraftOrbit = true;
        }
    });
    if (!drewCraftOrbit) {
        this.drawOrbitPlaneCurvesFromSceneData(ctx, scene, project, missionConfig);
    }

    const earthRadiusPx = Math.max(4, Math.min(16, (earthRadius / Math.max(1e-9, halfHeight)) * (height * 0.5)));
    const moonRadiusPx = Math.max(3, Math.min(10, (moonRadius / Math.max(1e-9, halfHeight)) * (height * 0.5)));
    this.drawOrbitPlaneMarker(ctx, project, earthWorld, {
        radiusPx: earthRadiusPx,
        fill: "rgba(59, 141, 231, 0.9)",
        stroke: "rgba(180, 220, 255, 0.92)",
        label: "Earth",
    });
    this.drawOrbitPlaneMarker(ctx, project, moonWorld, {
        radiusPx: moonRadiusPx,
        fill: "rgba(190, 198, 210, 0.88)",
        stroke: "rgba(240, 246, 255, 0.86)",
        label: "Moon",
    });
    this.drawOrbitPlaneMarker(ctx, project, craftWorld, {
        radiusPx: 4,
        fill: "rgba(255, 207, 101, 0.96)",
        stroke: "rgba(255, 238, 180, 0.94)",
        label: "Orion",
        labelOffsetY: 10,
    });
    ctx.restore();
}

export function renderOrbitPlanePanel(
    dependencies,
    panelState,
    { scene, activeCraft, earth, moon, earthRadius, moonRadius, missionConfig = null },
) {
    const {
        AUTO_FOV_MAX_DEGREES,
        AUTO_FOV_MIN_DEGREES,
        clampFovDegrees,
        getSceneVisibleCraftIds,
    } = dependencies;
    if (!panelState?.camera?.isOrthographicCamera || !earth || !activeCraft) {
        this.setPanelVisible(panelState, false);
        return false;
    }
    if (!this.getObjectWorldPosition(earth, this.earthWorld) || !this.getObjectWorldPosition(activeCraft, this.craftWorld)) {
        this.setPanelVisible(panelState, false);
        return false;
    }
    if (moon) {
        this.getObjectWorldPosition(moon, this.moonWorld);
    }

    this.setPanelVisible(panelState, true);
    this.syncPanelSize(panelState);
    if (panelState.autoFovEnabled === true) {
        this.applyOrbitPlaneAutoFit(panelState);
    }

    const halfHeight = this.computeOrbitPlaneHalfHeight({
        scene,
        earthWorld: this.earthWorld,
        moonWorld: this.moonWorld,
        craftWorld: this.craftWorld,
        earthRadius,
        moonRadius,
        missionConfig,
    });
    const zoomFov = clampFovDegrees(panelState.orbitZoomFovDegrees, {
        minDegrees: panelState.fovMinDegrees ?? AUTO_FOV_MIN_DEGREES,
        maxDegrees: panelState.fovMaxDegrees ?? AUTO_FOV_MAX_DEGREES,
        fallbackDegrees: 45,
    });
    const zoomScale = this.THREE.MathUtils.clamp(zoomFov / 45, 0.08, 4);
    panelState.orthographicHalfHeight = halfHeight * zoomScale;
    panelState.renderer.clear(true, true, true);
    this.renderOrbitPlane2DOverlay(panelState, {
        scene,
        earthWorld: this.earthWorld,
        moonWorld: this.moonWorld,
        craftWorld: this.craftWorld,
        earthRadius: Number.isFinite(earthRadius) && earthRadius > 0 ? earthRadius : 1,
        moonRadius: Number.isFinite(moonRadius) && moonRadius > 0 ? moonRadius : 1,
        halfHeight: panelState.orthographicHalfHeight,
        missionConfig,
    });
    this.setPanelInfo(panelState, "Earth-origin XY plane", "2D projection");
    return true;
}
