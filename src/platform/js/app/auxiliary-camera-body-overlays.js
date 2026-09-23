// Sky labels, body markers, outlines and metrics overlays.

export function renderComposerSkyLabelOverlay(
    panelState,
    {
            scene = null,
            skyContainer = null,
            skyRenderer = null,
            earthWorld = null,
            moonWorld = null,
            earthRadius = null,
            moonRadius = null,
        } = {},
    dependencies,
) {
    const {
        COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT,
        COMPOSER_CONSTELLATION_LABELS,
        COMPOSER_MOON_OUTLINE_RGBA,
        COMPOSER_MOON_OUTLINE_THICKNESS_PX,
        COMPOSER_PLANET_MAGNITUDE_BY_BODY,
        COMPOSER_RA_DEC_GRID_DEC_STEP_DEG,
        COMPOSER_RA_DEC_GRID_RA_STEP_DEG,
        COMPOSER_SEE_THROUGH_DASH_PX,
        COMPOSER_SEE_THROUGH_LINE_WIDTH_PX,
        COMPOSER_SKY_LABEL_EDGE_MARGIN_PX,
        COMPOSER_SKY_LABEL_VISIBLE_FRACTION,
        KM_TO_MILES,
        isComposerPlanetVisibleForMagnitudeLimit,
        isComposerSkyLabelPointOccluded,
        isDomInstance,
        resolveComposerSeeThroughMarkers,
        resolveComposerSkyLabelOccluders,
        selectSkyLabelCandidates,
    } = dependencies;
    if (!panelState?.overlayCtx || !panelState?.overlayCanvas) {
        return;
    }
    const skyLabelsEnabled = panelState.composerSkyLabelsEnabled === true;
    const constellationLabelsEnabled = panelState.composerConstellationLabelsEnabled === true;
    if (!skyLabelsEnabled && !constellationLabelsEnabled) {
        return;
    }

    const canvas = panelState.overlayCanvas;
    const ctx = panelState.overlayCtx;
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 1 || height <= 1) {
        return;
    }

    const resolvedSkyRenderer = skyRenderer || scene?.skyRenderer || null;
    const activeSkyContainer = skyContainer || scene?.skyContainer || resolvedSkyRenderer?.container || null;
    const planetRenderer = resolvedSkyRenderer?.planetRenderer || null;
    const skyRadius = Number.isFinite(Number(resolvedSkyRenderer?.radius))
        ? Number(resolvedSkyRenderer.radius)
        : 1300000;
    if (!activeSkyContainer?.getWorldQuaternion) {
        return;
    }

    const occupied = [];
    const edge = COMPOSER_SKY_LABEL_EDGE_MARGIN_PX;
    const labelOccluders = resolveComposerSkyLabelOccluders({
        THREE: this.THREE,
        camera: panelState.camera,
        width,
        height,
        bodies: [
            { bodyId: "earth", centerWorld: earthWorld || this.earthWorld, radius: earthRadius },
            { bodyId: "moon", centerWorld: moonWorld || this.moonWorld, radius: moonRadius },
        ],
    });
    const isLabelOccluded = (point) => isComposerSkyLabelPointOccluded(point, labelOccluders);
    activeSkyContainer.getWorldQuaternion(this.tmpQuatA);
    const projectSkyPointFromLocal = (x, y, z) => {
        this.tmpVectorB.set(x, y, z);
        if (activeSkyContainer?.matrixWorld) {
            this.tmpVectorB.applyMatrix4(activeSkyContainer.matrixWorld);
        } else {
            this.tmpVectorB.applyQuaternion(this.tmpQuatA);
        }
        this.tmpVectorC.copy(this.tmpVectorB).project(panelState.camera);
        if (
            !Number.isFinite(this.tmpVectorC.x) ||
            !Number.isFinite(this.tmpVectorC.y) ||
            !Number.isFinite(this.tmpVectorC.z)
        ) {
            return null;
        }
        if (this.tmpVectorC.z < -1 || this.tmpVectorC.z > 1) {
            return null;
        }
        return {
            x: ((this.tmpVectorC.x * 0.5) + 0.5) * width,
            y: (1 - ((this.tmpVectorC.y * 0.5) + 0.5)) * height,
        };
    };

    const intersects = (a, b) => !(
        a.right < b.left ||
        a.left > b.right ||
        a.bottom < b.top ||
        a.top > b.bottom
    );

    const drawLabel = (text, point, style = "star") => {
        if (!text || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return false;
        }
        const font = style === "constellation"
            ? "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            : "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.save();
        ctx.font = font;
        const textWidth = ctx.measureText(text).width;
        ctx.restore();

        const textHeight = style === "constellation" ? 12 : 11;
        const padX = 4;
        const padY = 3;
        const preferLeft = point.x < (width * 0.5);
        const preferTop = point.y < (height * 0.5);
        const baseOffsetX = preferLeft ? 8 : -8;
        const baseOffsetY = preferTop ? -8 : 10;
        const baseAlign = preferLeft ? "left" : "right";
        const candidates = [
            { dx: baseOffsetX, dy: baseOffsetY, align: baseAlign },
            { dx: baseOffsetX, dy: -baseOffsetY, align: baseAlign },
            { dx: 0, dy: preferTop ? -12 : 12, align: "center" },
            { dx: -baseOffsetX, dy: baseOffsetY, align: preferLeft ? "right" : "left" },
            { dx: baseOffsetX + 10, dy: baseOffsetY + 8, align: baseAlign },
            { dx: baseOffsetX - 10, dy: baseOffsetY - 8, align: baseAlign },
        ];

        const computeBox = (x, y, align) => {
            let left;
            let right;
            if (align === "right") {
                left = x - textWidth - padX;
                right = x + padX;
            } else if (align === "center") {
                left = x - (textWidth * 0.5) - padX;
                right = x + (textWidth * 0.5) + padX;
            } else {
                left = x - padX;
                right = x + textWidth + padX;
            }
            return {
                left,
                right,
                top: y - (textHeight * 0.5) - padY,
                bottom: y + (textHeight * 0.5) + padY,
            };
        };

        for (const candidate of candidates) {
            const x = Math.round((point.x + candidate.dx) * 2) / 2;
            const y = Math.round((point.y + candidate.dy) * 2) / 2;
            const box = computeBox(x, y, candidate.align);
            if (
                box.left < edge ||
                box.right > (width - edge) ||
                box.top < edge ||
                box.bottom > (height - edge)
            ) {
                continue;
            }
            if (occupied.some((existing) => intersects(existing, box))) {
                continue;
            }

            ctx.save();
            ctx.font = font;
            ctx.textAlign = candidate.align;
            ctx.textBaseline = "middle";
            ctx.lineJoin = "round";
            ctx.lineWidth = style === "constellation" ? 3.2 : 2.4;
            ctx.strokeStyle = style === "constellation"
                ? "rgba(3, 9, 18, 0.78)"
                : "rgba(7, 14, 24, 0.74)";
            ctx.fillStyle = style === "planet"
                ? "rgba(226, 238, 255, 0.92)"
                : style === "constellation"
                    ? "rgba(143, 183, 238, 0.66)"
                    : "rgba(205, 220, 242, 0.86)";
            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
            ctx.restore();
            occupied.push(box);
            return true;
        }
        return false;
    };

    const drawConstellationLabels = () => {
        if (!constellationLabelsEnabled) {
            return;
        }
        for (const label of COMPOSER_CONSTELLATION_LABELS) {
            const raRad = this.THREE.MathUtils.degToRad(label.raDeg);
            const decRad = this.THREE.MathUtils.degToRad(label.decDeg);
            const cosDec = Math.cos(decRad);
            const point = projectSkyPointFromLocal(
                cosDec * Math.cos(raRad) * skyRadius,
                -cosDec * Math.sin(raRad) * skyRadius,
                Math.sin(decRad) * skyRadius,
            );
            if (!point) {
                continue;
            }
            if (
                point.x < 0 ||
                point.x > width ||
                point.y < 0 ||
                point.y > height
            ) {
                continue;
            }
            if (isLabelOccluded(point)) {
                continue;
            }
            drawLabel(label.name, point, "constellation");
        }
    };

    if (!skyLabelsEnabled) {
        drawConstellationLabels();
        return;
    }

    const objectLabelCandidates = [];
    const planetPositionAttr = planetRenderer?.geometry?.getAttribute?.("position") || null;
    const planetAlphaAttr = planetRenderer?.geometry?.getAttribute?.("aAlpha") || null;
    const planetBodySlots = Array.isArray(planetRenderer?.bodySlots) ? planetRenderer.bodySlots : [];
    const planetPositionArray = planetPositionAttr?.array || null;
    const planetAlphaArray = planetAlphaAttr?.array || null;
    if (planetPositionArray && planetAlphaArray && planetBodySlots.length > 0) {
        const planetCount = Math.min(
            planetBodySlots.length,
            planetPositionAttr.count || 0,
            planetAlphaAttr.count || 0,
        );
        for (let i = 0; i < planetCount; i += 1) {
            const label = String(planetBodySlots[i] || "").trim();
            if (!label) {
                continue;
            }
            // In Flyby panel these are already represented by foreground bodies
            // and can be visually misleading when treated as sky markers.
            if (label === "Moon" || label === "Sun") {
                continue;
            }
            const alpha = Number(planetAlphaArray[i]);
            if (!Number.isFinite(alpha) || alpha <= 0.001) {
                continue;
            }
            if (!isComposerPlanetVisibleForMagnitudeLimit(label, panelState.composerStarMagnitudeLimit)) {
                continue;
            }
            const idx3 = i * 3;
            const point = projectSkyPointFromLocal(
                Number(planetPositionArray[idx3]),
                Number(planetPositionArray[idx3 + 1]),
                Number(planetPositionArray[idx3 + 2]),
            );
            if (!point) {
                continue;
            }
            if (isLabelOccluded(point)) {
                continue;
            }
            const magnitude = COMPOSER_PLANET_MAGNITUDE_BY_BODY[label];
            objectLabelCandidates.push({
                text: label,
                magnitude: Number.isFinite(magnitude) ? magnitude : 99,
                point,
                style: "planet",
            });
        }
    }

    const brightStarDescriptors = this.resolveComposerBrightStarLabelDescriptors(panelState.composerStarMagnitudeLimit);
    if (brightStarDescriptors.length > 0) {
        for (const descriptor of brightStarDescriptors) {
            const localDirection = descriptor?.localDirection;
            if (!localDirection) {
                continue;
            }
            const point = projectSkyPointFromLocal(
                Number(localDirection.x) * skyRadius,
                Number(localDirection.y) * skyRadius,
                Number(localDirection.z) * skyRadius,
            );
            if (!point) {
                continue;
            }
            if (
                point.x < 0 ||
                point.x > width ||
                point.y < 0 ||
                point.y > height
            ) {
                continue;
            }
            if (isLabelOccluded(point)) {
                continue;
            }
            objectLabelCandidates.push({
                ...descriptor,
                point,
                style: "star",
            });
        }
    }

    if (objectLabelCandidates.length > 0) {
        const targetObjectLabelCount = Math.min(
            objectLabelCandidates.length,
            COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT,
            Math.max(1, Math.ceil(objectLabelCandidates.length * COMPOSER_SKY_LABEL_VISIBLE_FRACTION)),
        );
        const sortedObjectLabels = selectSkyLabelCandidates(objectLabelCandidates, {
            visibleFraction: 1,
            maxCount: objectLabelCandidates.length,
        });
        let placedObjectLabels = 0;
        for (const descriptor of sortedObjectLabels) {
            if (drawLabel(descriptor.text, descriptor.point, descriptor.style || "star")) {
                placedObjectLabels += 1;
                if (placedObjectLabels >= targetObjectLabelCount) {
                    break;
                }
            }
        }
    }

    drawConstellationLabels();
}

export function renderMoonFarSideOverlay(
    panelState,
    { distanceToTarget, targetRadius, earthDirectionWorld },
    dependencies,
) {
    const {
        COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT,
        COMPOSER_CONSTELLATION_LABELS,
        COMPOSER_MOON_OUTLINE_RGBA,
        COMPOSER_MOON_OUTLINE_THICKNESS_PX,
        COMPOSER_PLANET_MAGNITUDE_BY_BODY,
        COMPOSER_RA_DEC_GRID_DEC_STEP_DEG,
        COMPOSER_RA_DEC_GRID_RA_STEP_DEG,
        COMPOSER_SEE_THROUGH_DASH_PX,
        COMPOSER_SEE_THROUGH_LINE_WIDTH_PX,
        COMPOSER_SKY_LABEL_EDGE_MARGIN_PX,
        COMPOSER_SKY_LABEL_VISIBLE_FRACTION,
        KM_TO_MILES,
        isComposerPlanetVisibleForMagnitudeLimit,
        isComposerSkyLabelPointOccluded,
        isDomInstance,
        resolveComposerSeeThroughMarkers,
        resolveComposerSkyLabelOccluders,
        selectSkyLabelCandidates,
    } = dependencies;
    if (!panelState?.overlayCtx || !panelState?.overlayCanvas) {
        return;
    }
    const nowMs = performance.now();
    const shouldRefresh = panelState.overlayDirty || (nowMs - panelState.lastOverlayUpdateMs) >= 90;
    if (!shouldRefresh) {
        return;
    }
    panelState.lastOverlayUpdateMs = nowMs;
    panelState.overlayDirty = false;

    const canvas = panelState.overlayCanvas;
    const ctx = panelState.overlayCtx;
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 1 || height <= 1) {
        return;
    }
    ctx.clearRect(0, 0, width, height);

    if (!panelState.farSideTintEnabled) {
        return;
    }
    if (!Number.isFinite(distanceToTarget) || !Number.isFinite(targetRadius) || targetRadius <= 0) {
        return;
    }

    const ratio = this.THREE.MathUtils.clamp(targetRadius / Math.max(distanceToTarget, targetRadius + 1e-9), 0, 0.999999);
    const angularRadius = Math.asin(ratio);
    const vFov = this.THREE.MathUtils.degToRad(panelState.camera.fov);
    const radiusPx = (Math.tan(angularRadius) / Math.max(Math.tan(vFov * 0.5), 1e-9)) * (height * 0.5);
    if (!Number.isFinite(radiusPx) || radiusPx < 2) {
        return;
    }

    panelState.camera.getWorldQuaternion(this.panelCameraWorldQuat);
    this.panelCameraWorldQuatInv.copy(this.panelCameraWorldQuat).invert();
    this.earthDirInCamera.copy(earthDirectionWorld).applyQuaternion(this.panelCameraWorldQuatInv);
    const earthDirLen = this.earthDirInCamera.length();
    if (!Number.isFinite(earthDirLen) || earthDirLen <= 1e-9) {
        return;
    }
    this.earthDirInCamera.multiplyScalar(1 / earthDirLen);

    const ex = this.earthDirInCamera.x;
    const ey = this.earthDirInCamera.y;
    const ez = this.earthDirInCamera.z;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const left = Math.max(0, Math.floor(cx - radiusPx - 1));
    const top = Math.max(0, Math.floor(cy - radiusPx - 1));
    const right = Math.min(width - 1, Math.ceil(cx + radiusPx + 1));
    const bottom = Math.min(height - 1, Math.ceil(cy + radiusPx + 1));
    const w = right - left + 1;
    const h = bottom - top + 1;
    if (w <= 0 || h <= 0) {
        return;
    }

    const img = ctx.createImageData(w, h);
    const data = img.data;
    const baseR = 124;
    const baseG = 84;
    const baseB = 224;
    // Keep far-side tint readable but highly transparent (~80% transparent).
    const baseAlpha = 52;
    const edgeR = 193;
    const edgeG = 170;
    const edgeB = 255;
    const edgeAlpha = 108;
    const terminatorBand = 0.06;
    const limbBand = 0.035;

    let idx = 0;
    for (let py = top; py <= bottom; py += 1) {
        const ny = (cy - (py + 0.5)) / radiusPx;
        for (let px = left; px <= right; px += 1) {
            const nx = ((px + 0.5) - cx) / radiusPx;
            const rr = nx * nx + ny * ny;
            if (rr <= 1) {
                const nz = Math.sqrt(Math.max(0, 1 - rr));
                const dot = nx * ex + ny * ey + nz * ez;
                if (dot < 0) {
                    const intensity = Math.min(1, Math.max(0.2, -dot * 1.3));
                    const limbFade = 0.6 + nz * 0.4;
                    let r = baseR;
                    let g = baseG;
                    let b = baseB;
                    let a = Math.round(baseAlpha * intensity * limbFade);

                    // Crisp glass-like edge at the far/near divider.
                    const absDot = Math.abs(dot);
                    if (absDot < terminatorBand) {
                        const edgeMix = 1 - (absDot / terminatorBand);
                        r = Math.round(baseR * (1 - edgeMix) + edgeR * edgeMix);
                        g = Math.round(baseG * (1 - edgeMix) + edgeG * edgeMix);
                        b = Math.round(baseB * (1 - edgeMix) + edgeB * edgeMix);
                        a = Math.max(a, Math.round(edgeAlpha * edgeMix));
                    }

                    // Slight perimeter reinforcement for a clearer "panel".
                    const rim = 1 - Math.sqrt(rr);
                    if (rim < limbBand) {
                        const rimMix = 1 - (rim / limbBand);
                        r = Math.round(r * (1 - rimMix * 0.35) + edgeR * rimMix * 0.35);
                        g = Math.round(g * (1 - rimMix * 0.35) + edgeG * rimMix * 0.35);
                        b = Math.round(b * (1 - rimMix * 0.35) + edgeB * rimMix * 0.35);
                        a = Math.max(a, Math.round(170 * rimMix));
                    }

                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    data[idx + 3] = Math.min(255, a);
                }
            }
            idx += 4;
        }
    }
    ctx.putImageData(img, left, top);
}

export function renderComposerMoonOutlineOverlay(
    panelState,
    { moonWorld, moonRadius },
    dependencies,
) {
    const {
        COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT,
        COMPOSER_CONSTELLATION_LABELS,
        COMPOSER_MOON_OUTLINE_RGBA,
        COMPOSER_MOON_OUTLINE_THICKNESS_PX,
        COMPOSER_PLANET_MAGNITUDE_BY_BODY,
        COMPOSER_RA_DEC_GRID_DEC_STEP_DEG,
        COMPOSER_RA_DEC_GRID_RA_STEP_DEG,
        COMPOSER_SEE_THROUGH_DASH_PX,
        COMPOSER_SEE_THROUGH_LINE_WIDTH_PX,
        COMPOSER_SKY_LABEL_EDGE_MARGIN_PX,
        COMPOSER_SKY_LABEL_VISIBLE_FRACTION,
        KM_TO_MILES,
        isComposerPlanetVisibleForMagnitudeLimit,
        isComposerSkyLabelPointOccluded,
        isDomInstance,
        resolveComposerSeeThroughMarkers,
        resolveComposerSkyLabelOccluders,
        selectSkyLabelCandidates,
    } = dependencies;
    if (!panelState?.overlayCtx || !panelState?.overlayCanvas || panelState.composerMoonOutlineEnabled !== true) {
        return;
    }
    if (!moonWorld || !Number.isFinite(moonRadius) || moonRadius <= 0) {
        return;
    }
    const canvas = panelState.overlayCanvas;
    const ctx = panelState.overlayCtx;
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 1 || height <= 1) {
        return;
    }

    this.tmpVectorA.copy(moonWorld).project(panelState.camera);
    if (!Number.isFinite(this.tmpVectorA.x) || !Number.isFinite(this.tmpVectorA.y) || !Number.isFinite(this.tmpVectorA.z)) {
        return;
    }
    if (this.tmpVectorA.z < -1 || this.tmpVectorA.z > 1) {
        return;
    }

    const cx = (this.tmpVectorA.x * 0.5 + 0.5) * width;
    const cy = (1 - (this.tmpVectorA.y * 0.5 + 0.5)) * height;
    const distanceToMoon = panelState.camera.position.distanceTo(moonWorld);
    if (!Number.isFinite(distanceToMoon) || distanceToMoon <= moonRadius + 1e-9) {
        return;
    }
    const angularRadius = Math.asin(this.THREE.MathUtils.clamp(moonRadius / distanceToMoon, 0, 0.999999));
    const verticalFovRad = this.THREE.MathUtils.degToRad(panelState.camera.fov);
    const radiusPx = (Math.tan(angularRadius) / Math.max(Math.tan(verticalFovRad * 0.5), 1e-9)) * (height * 0.5);
    if (!Number.isFinite(radiusPx) || radiusPx < 2) {
        return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
    ctx.strokeStyle = COMPOSER_MOON_OUTLINE_RGBA;
    ctx.lineWidth = COMPOSER_MOON_OUTLINE_THICKNESS_PX;
    ctx.shadowColor = "rgba(13, 24, 40, 0.62)";
    ctx.shadowBlur = 2;
    ctx.stroke();
    ctx.restore();
}

export function renderComposerSeeThroughOverlay(
    panelState,
    {
            scene = null,
            skyContainer = null,
            skyRenderer = null,
            earthWorld = null,
            moonWorld = null,
            earthRadius = null,
            moonRadius = null,
        } = {},
    dependencies,
) {
    const {
        COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT,
        COMPOSER_CONSTELLATION_LABELS,
        COMPOSER_MOON_OUTLINE_RGBA,
        COMPOSER_MOON_OUTLINE_THICKNESS_PX,
        COMPOSER_PLANET_MAGNITUDE_BY_BODY,
        COMPOSER_RA_DEC_GRID_DEC_STEP_DEG,
        COMPOSER_RA_DEC_GRID_RA_STEP_DEG,
        COMPOSER_SEE_THROUGH_DASH_PX,
        COMPOSER_SEE_THROUGH_LINE_WIDTH_PX,
        COMPOSER_SKY_LABEL_EDGE_MARGIN_PX,
        COMPOSER_SKY_LABEL_VISIBLE_FRACTION,
        KM_TO_MILES,
        isComposerPlanetVisibleForMagnitudeLimit,
        isComposerSkyLabelPointOccluded,
        isDomInstance,
        resolveComposerSeeThroughMarkers,
        resolveComposerSkyLabelOccluders,
        selectSkyLabelCandidates,
    } = dependencies;
    if (
        !panelState?.overlayCtx ||
        !panelState?.overlayCanvas ||
        panelState.composerSeeThroughEnabled !== true
    ) {
        return;
    }
    const canvas = panelState.overlayCanvas;
    const ctx = panelState.overlayCtx;
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 1 || height <= 1) {
        return;
    }

    const resolvedSkyRenderer = skyRenderer || scene?.skyRenderer || null;
    const activeSkyContainer = skyContainer || scene?.skyContainer || resolvedSkyRenderer?.container || null;
    if (!activeSkyContainer?.getWorldQuaternion) {
        return;
    }

    const occluders = resolveComposerSkyLabelOccluders({
        THREE: this.THREE,
        camera: panelState.camera,
        width,
        height,
        bodies: [
            { bodyId: "earth", centerWorld: earthWorld || this.earthWorld, radius: earthRadius },
            { bodyId: "moon", centerWorld: moonWorld || this.moonWorld, radius: moonRadius },
        ],
        paddingPx: 0,
    });
    if (occluders.length <= 0) {
        return;
    }

    const markers = resolveComposerSeeThroughMarkers({
        THREE: this.THREE,
        camera: panelState.camera,
        width,
        height,
        skyContainer: activeSkyContainer,
        planetRenderer: resolvedSkyRenderer?.planetRenderer || null,
        occluders,
    });
    if (markers.length <= 0) {
        return;
    }

    ctx.save();
    ctx.setLineDash(COMPOSER_SEE_THROUGH_DASH_PX);
    ctx.lineWidth = COMPOSER_SEE_THROUGH_LINE_WIDTH_PX;
    ctx.lineCap = "round";
    for (const marker of markers) {
        const x = Number(marker?.x);
        const y = Number(marker?.y);
        const radiusPx = Number(marker?.radiusPx);
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(radiusPx) ||
            radiusPx <= 0
        ) {
            continue;
        }
        ctx.beginPath();
        ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
        ctx.strokeStyle = marker?.strokeStyle || "rgba(239, 246, 255, 0.90)";
        ctx.stroke();
    }
    ctx.restore();
}

export function renderComposerBottomMetricsOverlay(
    panelState,
    { craftWorld, moonWorld, earthWorld, telemetry = null },
    dependencies,
) {
    const {
        COMPOSER_BRIGHT_STAR_LABEL_MAX_COUNT,
        COMPOSER_CONSTELLATION_LABELS,
        COMPOSER_MOON_OUTLINE_RGBA,
        COMPOSER_MOON_OUTLINE_THICKNESS_PX,
        COMPOSER_PLANET_MAGNITUDE_BY_BODY,
        COMPOSER_RA_DEC_GRID_DEC_STEP_DEG,
        COMPOSER_RA_DEC_GRID_RA_STEP_DEG,
        COMPOSER_SEE_THROUGH_DASH_PX,
        COMPOSER_SEE_THROUGH_LINE_WIDTH_PX,
        COMPOSER_SKY_LABEL_EDGE_MARGIN_PX,
        COMPOSER_SKY_LABEL_VISIBLE_FRACTION,
        KM_TO_MILES,
        isComposerPlanetVisibleForMagnitudeLimit,
        isComposerSkyLabelPointOccluded,
        isDomInstance,
        resolveComposerSeeThroughMarkers,
        resolveComposerSkyLabelOccluders,
        selectSkyLabelCandidates,
    } = dependencies;
    if (!panelState?.camera) {
        return;
    }
    const strip = panelState?.composerMetricsStrip;
    if (!isDomInstance(strip, "HTMLElement")) {
        return;
    }
    strip.hidden = panelState.composerInfoOverlayEnabled !== true;
    if (strip.hidden) {
        return;
    }
    if (!craftWorld || !moonWorld || !earthWorld) {
        if (panelState.composerMetricFovHValue) panelState.composerMetricFovHValue.textContent = "--";
        if (panelState.composerMetricFovVValue) panelState.composerMetricFovVValue.textContent = "--";
        if (panelState.composerMetricDistanceMoonValue) panelState.composerMetricDistanceMoonValue.textContent = "--";
        if (panelState.composerMetricAngleValue) panelState.composerMetricAngleValue.textContent = "--";
        return;
    }

    const verticalFovDeg = Number.isFinite(panelState.camera.fov) ? panelState.camera.fov : Number.NaN;
    const aspect = Math.max(1e-6, Number.isFinite(panelState.camera.aspect) ? panelState.camera.aspect : 1);
    const verticalFovRad = this.THREE.MathUtils.degToRad(verticalFovDeg);
    const horizontalFovDeg = Number.isFinite(verticalFovDeg)
        ? this.THREE.MathUtils.radToDeg(Math.atan(Math.tan(verticalFovRad * 0.5) * aspect) * 2)
        : Number.NaN;

    const telemetryDistanceMoon = Number.isFinite(telemetry?.distanceMoon)
        ? telemetry.distanceMoon
        : (Number.isFinite(telemetry?.distancePrimary) ? telemetry.distancePrimary : Number.NaN);
    const distanceToMoonKm = Number.isFinite(telemetryDistanceMoon)
        ? telemetryDistanceMoon
        : Number.NaN;
    this.tmpVectorA.subVectors(craftWorld, moonWorld);
    this.tmpVectorB.subVectors(earthWorld, moonWorld);
    const lenA = this.tmpVectorA.length();
    const lenB = this.tmpVectorB.length();
    let craftMoonEarthDeg = Number.NaN;
    if (lenA > 1e-9 && lenB > 1e-9) {
        this.tmpVectorA.multiplyScalar(1 / lenA);
        this.tmpVectorB.multiplyScalar(1 / lenB);
        const dot = this.THREE.MathUtils.clamp(this.tmpVectorA.dot(this.tmpVectorB), -1, 1);
        craftMoonEarthDeg = this.THREE.MathUtils.radToDeg(Math.acos(dot));
    }

    const safeFovH = Number.isFinite(horizontalFovDeg) ? `${horizontalFovDeg.toFixed(1)}°` : "--";
    const safeFovV = Number.isFinite(verticalFovDeg) ? `${verticalFovDeg.toFixed(1)}°` : "--";
    const safeDistance = Number.isFinite(distanceToMoonKm)
        ? `${Math.round(distanceToMoonKm).toLocaleString()} km / ${Math.round(distanceToMoonKm * KM_TO_MILES).toLocaleString()} mi`
        : "--";
    const safeAngle = Number.isFinite(craftMoonEarthDeg) ? `${craftMoonEarthDeg.toFixed(1)}°` : "--";

    if (panelState.composerMetricFovHValue) panelState.composerMetricFovHValue.textContent = safeFovH;
    if (panelState.composerMetricFovVValue) panelState.composerMetricFovVValue.textContent = safeFovV;
    if (panelState.composerMetricDistanceMoonValue) panelState.composerMetricDistanceMoonValue.textContent = safeDistance;
    if (panelState.composerMetricAngleValue) panelState.composerMetricAngleValue.textContent = safeAngle;
}
