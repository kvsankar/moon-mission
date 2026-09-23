// Coordinate-grid overlay rendering for Frame and Shoot.

// Canvas and DOM overlays for auxiliary camera panels.
// Functions run with the manager as `this` while the public manager methods remain stable wrappers.

export function clearPanelOverlay(
    panelState,
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
    panelState.overlayCtx.clearRect(0, 0, panelState.overlayCanvas.width, panelState.overlayCanvas.height);
}

export function renderComposerRaDecGridOverlay(
    panelState,
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
    if (panelState.composerRaDecGridEnabled !== true) {
        return;
    }
    const canvas = panelState.overlayCanvas;
    const ctx = panelState.overlayCtx;
    const width = canvas.width;
    const height = canvas.height;
    if (width <= 1 || height <= 1) {
        return;
    }
    const verticalFovDeg = Number.isFinite(panelState?.camera?.fov) ? panelState.camera.fov : 50;
    const resolveGridDensity = () => {
        let raStepDeg = COMPOSER_RA_DEC_GRID_RA_STEP_DEG;
        let decStepDeg = COMPOSER_RA_DEC_GRID_DEC_STEP_DEG;
        let sampleStepDeg = 3;
        let raLabelEvery = 1;
        let decLabelEvery = 1;
        let raLabelMargin = 22;
        let decLabelMargin = 20;

        if (verticalFovDeg <= 8) {
            raStepDeg = 15;
            decStepDeg = 5;
            sampleStepDeg = 1;
            raLabelEvery = 2;
            decLabelEvery = 2;
            raLabelMargin = 16;
            decLabelMargin = 16;
        } else if (verticalFovDeg <= 16) {
            raStepDeg = 30;
            decStepDeg = 10;
            sampleStepDeg = 2;
            raLabelEvery = 2;
            decLabelEvery = 2;
            raLabelMargin = 18;
            decLabelMargin = 18;
        } else if (verticalFovDeg <= 32) {
            raStepDeg = 45;
            decStepDeg = 10;
            sampleStepDeg = 2;
            raLabelEvery = 1;
            decLabelEvery = 2;
            raLabelMargin = 20;
            decLabelMargin = 18;
        } else if (verticalFovDeg <= 60) {
            raStepDeg = 60;
            decStepDeg = 15;
            sampleStepDeg = 3;
        } else if (verticalFovDeg <= 95) {
            raStepDeg = 90;
            decStepDeg = 30;
            sampleStepDeg = 4;
            raLabelMargin = 18;
            decLabelMargin = 18;
        } else {
            raStepDeg = 120;
            decStepDeg = 45;
            sampleStepDeg = 5;
            raLabelMargin = 14;
            decLabelMargin = 14;
        }

        // Keep at least ~4 lines visible in view for both RA/Dec.
        // We derive spacing from FoV coverage, then snap to "nice" angular steps.
        const aspect = Math.max(1e-6, Number.isFinite(panelState?.camera?.aspect) ? panelState.camera.aspect : (width / Math.max(1, height)));
        const verticalFovRad = this.THREE.MathUtils.degToRad(verticalFovDeg);
        const horizontalFovDeg = this.THREE.MathUtils.radToDeg(Math.atan(Math.tan(verticalFovRad * 0.5) * aspect) * 2);
        const minVisibleLines = 4;
        const maxSpacingFromCoverage = Math.max(1, verticalFovDeg / Math.max(1, minVisibleLines - 1));
        const maxSpacingFromCoverageRa = Math.max(1, horizontalFovDeg / Math.max(1, minVisibleLines - 1));
        const niceSteps = [120, 90, 60, 45, 30, 20, 15, 12, 10, 6, 5, 4, 3, 2, 1];
        const snapStep = (maxAllowedStep, minStep, fallbackStep) => {
            for (const step of niceSteps) {
                if (step <= maxAllowedStep && step >= minStep) {
                    return step;
                }
            }
            return fallbackStep;
        };
        const minDecStep = 3;
        const minRaStep = 5;
        const targetDecStep = snapStep(maxSpacingFromCoverage, minDecStep, minDecStep);
        const targetRaStep = snapStep(maxSpacingFromCoverageRa, minRaStep, minRaStep);

        decStepDeg = Math.max(minDecStep, Math.min(decStepDeg, targetDecStep));
        raStepDeg = Math.max(minRaStep, Math.min(raStepDeg, targetRaStep));

        // As line density increases, back off label density to prevent clutter.
        decLabelEvery = Math.max(1, Math.round(18 / Math.max(decStepDeg, 1)));
        raLabelEvery = Math.max(1, Math.round(24 / Math.max(raStepDeg, 1)));
        sampleStepDeg = Math.max(1, Math.min(sampleStepDeg, Math.max(1, Math.floor(Math.min(decStepDeg, raStepDeg) / 2))));

        return {
            raStepDeg,
            decStepDeg,
            sampleStepDeg,
            raLabelEvery,
            decLabelEvery,
            raLabelMargin,
            decLabelMargin,
        };
    };
    const gridDensity = resolveGridDensity();
    const occupiedLabelBoxes = [];

    panelState.camera.getWorldQuaternion(this.panelCameraWorldQuat);
    this.panelCameraWorldQuatInv.copy(this.panelCameraWorldQuat).invert();
    const tanHalfY = Math.tan(this.THREE.MathUtils.degToRad(panelState.camera.fov * 0.5));
    const tanHalfX = tanHalfY * Math.max(panelState.camera.aspect, 1e-6);

    const projectDirection = (x, y, z) => {
        this.tmpVectorA.set(x, y, z).applyQuaternion(this.panelCameraWorldQuatInv);
        const cz = this.tmpVectorA.z;
        if (cz <= 1e-4) {
            return null;
        }
        const ndcX = (this.tmpVectorA.x / cz) / Math.max(tanHalfX, 1e-9);
        const ndcY = (this.tmpVectorA.y / cz) / Math.max(tanHalfY, 1e-9);
        if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) {
            return null;
        }
        if (Math.abs(ndcX) > 1.35 || Math.abs(ndcY) > 1.35) {
            return null;
        }
        return {
            x: ((ndcX * 0.5) + 0.5) * width,
            y: (1 - ((ndcY * 0.5) + 0.5)) * height,
        };
    };

    const drawCurve = (samples, strokeStyle, lineWidth) => {
        let penDown = false;
        const visiblePoints = [];
        ctx.beginPath();
        for (const sample of samples) {
            const projected = projectDirection(sample.x, sample.y, sample.z);
            if (!projected) {
                penDown = false;
                continue;
            }
            visiblePoints.push(projected);
            if (!penDown) {
                ctx.moveTo(projected.x, projected.y);
                penDown = true;
            } else {
                ctx.lineTo(projected.x, projected.y);
            }
        }
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        return visiblePoints;
    };

    const drawGridLabel = (text, point, {
        offsetX = 4,
        offsetY = -4,
        align = "left",
        relaxed = false,
        zone = null,
        capture = null,
        key = "",
    } = {}) => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return false;
        }
        const font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.save();
        ctx.font = font;
        const textWidth = ctx.measureText(text).width;
        ctx.restore();
        const textHeight = 11;
        const paddingX = 4;
        const paddingY = 3;

        const offsets = [
            { dx: offsetX, dy: offsetY, textAlign: align },
            { dx: offsetX + 12, dy: offsetY - 10, textAlign: align },
            { dx: offsetX - 12, dy: offsetY + 10, textAlign: align },
            { dx: offsetX + 8, dy: offsetY + 12, textAlign: align },
            { dx: offsetX - 14, dy: offsetY - 12, textAlign: "right" },
            { dx: offsetX + 14, dy: offsetY + 14, textAlign: "left" },
            { dx: offsetX, dy: offsetY - 16, textAlign: "center" },
            { dx: offsetX, dy: offsetY + 16, textAlign: "center" },
        ];

        const computeBox = (x, y, textAlign) => {
            let left;
            let right;
            if (textAlign === "right") {
                left = x - textWidth - paddingX;
                right = x + paddingX;
            } else if (textAlign === "center") {
                left = x - (textWidth * 0.5) - paddingX;
                right = x + (textWidth * 0.5) + paddingX;
            } else {
                left = x - paddingX;
                right = x + textWidth + paddingX;
            }
            const top = y - (textHeight * 0.5) - paddingY;
            const bottom = y + (textHeight * 0.5) + paddingY;
            return { left, right, top, bottom };
        };

        const intersects = (a, b) => !(
            a.right < b.left ||
            a.left > b.right ||
            a.bottom < b.top ||
            a.top > b.bottom
        );

        for (const candidate of offsets) {
            const x = Math.round((point.x + candidate.dx) * 2) / 2;
            const y = Math.round((point.y + candidate.dy) * 2) / 2;
            const box = computeBox(x, y, candidate.textAlign);
            const allowOverflowPx = relaxed ? 8 : 0;
            if (box.left < (6 - allowOverflowPx) || box.right > ((width - 6) + allowOverflowPx) || box.top < (8 - allowOverflowPx) || box.bottom > ((height - 6) + allowOverflowPx)) {
                continue;
            }
            if (zone === "top-bottom" && !relaxed) {
                const bandTop = height * 0.36;
                const bandBottom = height * 0.64;
                if (!(box.bottom <= bandTop || box.top >= bandBottom)) {
                    continue;
                }
            }
            if (zone === "left-right" && !relaxed) {
                const bandLeft = width * 0.36;
                const bandRight = width * 0.64;
                if (!(box.right <= bandLeft || box.left >= bandRight)) {
                    continue;
                }
            }
            if (occupiedLabelBoxes.some((existing) => intersects(existing, box))) {
                continue;
            }
            ctx.save();
            ctx.font = font;
            ctx.textAlign = candidate.textAlign;
            ctx.textBaseline = "middle";
            ctx.lineJoin = "round";
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "rgba(7, 14, 24, 0.7)";
            ctx.fillStyle = "rgba(180, 194, 214, 0.62)";
            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
            ctx.restore();
            occupiedLabelBoxes.push(box);
            if (capture && typeof capture.push === "function") {
                capture.push({
                    key,
                    text,
                    x,
                    y,
                    align: candidate.textAlign,
                });
            }
            return true;
        }

        return false;
    };

    const getFovReadout = () => {
        const verticalFovDeg = Number.isFinite(panelState?.camera?.fov) ? panelState.camera.fov : Number.NaN;
        if (!Number.isFinite(verticalFovDeg)) {
            return null;
        }
        const aspect = Math.max(1e-6, Number.isFinite(panelState?.camera?.aspect) ? panelState.camera.aspect : (width / Math.max(1, height)));
        const verticalFovRad = this.THREE.MathUtils.degToRad(verticalFovDeg);
        const horizontalFovRad = Math.atan(Math.tan(verticalFovRad * 0.5) * aspect) * 2;
        const horizontalFovDeg = this.THREE.MathUtils.radToDeg(horizontalFovRad);

        const fovText = `FoV H ${horizontalFovDeg.toFixed(1)}°  V ${verticalFovDeg.toFixed(1)}°`;
        return { fovText, x: 12, y: 16 };
    };

    const reserveFovReadoutBox = () => {
        const fov = getFovReadout();
        if (!fov) {
            return;
        }
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        const textWidth = ctx.measureText(fov.fovText).width;
        occupiedLabelBoxes.push({
            left: fov.x - 4,
            right: fov.x + textWidth + 4,
            top: fov.y - 9,
            bottom: fov.y + 9,
        });
    };

    const drawFovReadout = () => {
        const fov = getFovReadout();
        if (!fov) {
            return;
        }
        ctx.save();
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(7, 14, 24, 0.72)";
        ctx.fillStyle = "rgba(180, 194, 214, 0.66)";
        ctx.strokeText(fov.fovText, fov.x, fov.y);
        ctx.fillText(fov.fovText, fov.x, fov.y);
        ctx.restore();
    };

    const drawPlacedLabel = (placedLabel) => {
        if (!placedLabel || !Number.isFinite(placedLabel.x) || !Number.isFinite(placedLabel.y)) {
            return;
        }
        ctx.save();
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        ctx.textAlign = placedLabel.align || "left";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(7, 14, 24, 0.7)";
        ctx.fillStyle = "rgba(180, 194, 214, 0.62)";
        ctx.strokeText(placedLabel.text, placedLabel.x, placedLabel.y);
        ctx.fillText(placedLabel.text, placedLabel.x, placedLabel.y);
        ctx.restore();
    };

    const labelCache = panelState.composerGridLabelCache || (panelState.composerGridLabelCache = Object.create(null));
    const nowMs = performance.now();
    const inLabelBounds = (point, marginPx) => (
        !!point &&
        point.x >= marginPx &&
        point.x <= (width - marginPx) &&
        point.y >= marginPx &&
        point.y <= (height - marginPx)
    );
    const chooseStableLabelPoint = (key, directionCandidates, {
        marginPx = 18,
        holdMs = 260,
    } = {}) => {
        if (!Array.isArray(directionCandidates) || directionCandidates.length === 0) {
            return null;
        }
        const prev = labelCache[key] || null;
        const order = [];
        if (Number.isInteger(prev?.index) && prev.index >= 0 && prev.index < directionCandidates.length) {
            order.push(prev.index);
        }
        for (let i = 0; i < directionCandidates.length; i += 1) {
            if (!order.includes(i)) {
                order.push(i);
            }
        }

        let relaxedCandidate = null;
        for (const index of order) {
            const dir = directionCandidates[index];
            const projected = projectDirection(dir.x, dir.y, dir.z);
            if (!projected) {
                continue;
            }
            if (inLabelBounds(projected, marginPx)) {
                labelCache[key] = { index, point: projected, ts: nowMs };
                return projected;
            }
            if (!relaxedCandidate) {
                relaxedCandidate = { index, point: projected };
            }
        }

        if (prev?.point && Number.isFinite(prev.ts) && (nowMs - prev.ts) <= holdMs) {
            return prev.point;
        }
        if (relaxedCandidate) {
            labelCache[key] = { index: relaxedCandidate.index, point: relaxedCandidate.point, ts: nowMs };
            return relaxedCandidate.point;
        }
        return null;
    };

    const buildDirection = (raDeg, decDeg) => {
        const ra = this.THREE.MathUtils.degToRad(raDeg);
        const dec = this.THREE.MathUtils.degToRad(decDeg);
        const cosDec = Math.cos(dec);
        return {
            x: cosDec * Math.cos(ra),
            y: cosDec * Math.sin(ra),
            z: Math.sin(dec),
        };
    };

    const baseLineColor = "rgba(146, 186, 244, 0.34)";
    const accentLineColor = "rgba(188, 218, 255, 0.52)";
    const decDescriptors = [];
    const raDescriptors = [];
    let visibleDecLines = 0;
    let visibleRaLines = 0;
    reserveFovReadoutBox();

    // Dec lines (parallels).
    for (let dec = -75; dec <= 75; dec += gridDensity.decStepDeg) {
        const samples = [];
        for (let ra = 0; ra <= 360; ra += gridDensity.sampleStepDeg) {
            samples.push(buildDirection(ra, dec));
        }
        const isEquator = dec === 0;
        const visiblePoints = drawCurve(samples, isEquator ? accentLineColor : baseLineColor, isEquator ? 1.1 : 0.8);
        const onScreenVisiblePoints = visiblePoints.filter((p) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
        if (onScreenVisiblePoints.length >= 2) {
            visibleDecLines += 1;
        }
        const decSign = dec > 0 ? "+" : "";
        const text = `Dec ${decSign}${dec}°`;
        if (onScreenVisiblePoints.length > 0) {
            let minX = onScreenVisiblePoints[0];
            let maxX = onScreenVisiblePoints[0];
            for (const screenPoint of onScreenVisiblePoints) {
                if (screenPoint.x < minX.x) {
                    minX = screenPoint;
                }
                if (screenPoint.x > maxX.x) {
                    maxX = screenPoint;
                }
            }
            decDescriptors.push({
                key: `dec:${dec}`,
                text,
                leftPoint: minX,
                rightPoint: maxX,
                points: onScreenVisiblePoints,
            });
        }
    }

    // RA lines (meridians).
    for (let ra = 0; ra < 360; ra += gridDensity.raStepDeg) {
        const samples = [];
        for (let dec = -87; dec <= 87; dec += gridDensity.sampleStepDeg) {
            samples.push(buildDirection(ra, dec));
        }
        const isPrime = ra === 0;
        const visiblePoints = drawCurve(samples, isPrime ? accentLineColor : baseLineColor, isPrime ? 1.1 : 0.8);
        const onScreenVisiblePoints = visiblePoints.filter((p) => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
        if (onScreenVisiblePoints.length >= 2) {
            visibleRaLines += 1;
        }
        const raHours = Math.round((ra % 360) / 15);
        const text = `RA ${raHours}h`;
        if (onScreenVisiblePoints.length > 0) {
            let minY = onScreenVisiblePoints[0];
            let maxY = onScreenVisiblePoints[0];
            for (const screenPoint of onScreenVisiblePoints) {
                if (screenPoint.y < minY.y) {
                    minY = screenPoint;
                }
                if (screenPoint.y > maxY.y) {
                    maxY = screenPoint;
                }
            }
            raDescriptors.push({
                key: `ra:${ra}`,
                text,
                topPoint: minY,
                bottomPoint: maxY,
                points: onScreenVisiblePoints,
            });
        }
    }

    const pickSpread = (items, targetCount) => {
        if (!Array.isArray(items) || items.length === 0 || targetCount <= 0) {
            return [];
        }
        if (items.length <= targetCount) {
            return items.slice();
        }
        if (targetCount === 1) {
            return [items[Math.floor(items.length * 0.5)]];
        }
        const picked = [];
        const used = new Set();
        for (let i = 0; i < targetCount; i += 1) {
            const rawIndex = Math.round((i * (items.length - 1)) / (targetCount - 1));
            const boundedIndex = Math.max(0, Math.min(items.length - 1, rawIndex));
            if (used.has(boundedIndex)) {
                continue;
            }
            used.add(boundedIndex);
            picked.push(items[boundedIndex]);
        }
        return picked;
    };

    const composerGridPlacementState = panelState.composerGridPlacementState || (panelState.composerGridPlacementState = {
        ra: { activeKeys: [], anchors: Object.create(null) },
        dec: { activeKeys: [], anchors: Object.create(null) },
    });
    const composerGridTemporalState = panelState.composerGridTemporalState || (panelState.composerGridTemporalState = {
        hasPose: false,
        quatX: 0,
        quatY: 0,
        quatZ: 0,
        quatW: 1,
        fov: Number.NaN,
        aspect: Number.NaN,
        cachedPlacedRa: [],
        cachedPlacedDec: [],
    });
    const currentQuat = panelState.camera.quaternion;
    const quantize = (value, step) => Math.round(value / step) * step;
    const pose = {
        quatX: quantize(currentQuat.x, 1e-4),
        quatY: quantize(currentQuat.y, 1e-4),
        quatZ: quantize(currentQuat.z, 1e-4),
        quatW: quantize(currentQuat.w, 1e-4),
        fov: quantize(panelState.camera.fov, 0.05),
        aspect: quantize(panelState.camera.aspect, 1e-3),
    };
    const shouldReusePlacement =
        composerGridTemporalState.hasPose === true &&
        pose.quatX === composerGridTemporalState.quatX &&
        pose.quatY === composerGridTemporalState.quatY &&
        pose.quatZ === composerGridTemporalState.quatZ &&
        pose.quatW === composerGridTemporalState.quatW &&
        pose.fov === composerGridTemporalState.fov &&
        pose.aspect === composerGridTemporalState.aspect &&
        Array.isArray(composerGridTemporalState.cachedPlacedRa) &&
        Array.isArray(composerGridTemporalState.cachedPlacedDec) &&
        (composerGridTemporalState.cachedPlacedRa.length > 0 || composerGridTemporalState.cachedPlacedDec.length > 0);
    const placedLabelsRa = [];
    const placedLabelsDec = [];

    const placeDeterministicLabels = (descriptors, kind) => {
        if (!Array.isArray(descriptors) || descriptors.length === 0) {
            return 0;
        }
        const familyState = composerGridPlacementState[kind] || (composerGridPlacementState[kind] = {
            activeKeys: [],
            anchors: Object.create(null),
        });
        const descriptorByKey = new Map(descriptors.map((descriptor) => [descriptor.key, descriptor]));
        const targetCount = descriptors.length >= 4 ? 4 : descriptors.length;
        const keptKeys = familyState.activeKeys.filter((key) => descriptorByKey.has(key));
        const keptDescriptors = keptKeys.map((key) => descriptorByKey.get(key)).filter(Boolean);
        const remainingDescriptors = descriptors.filter((descriptor) => !keptKeys.includes(descriptor.key));
        const fillCount = Math.max(0, targetCount - keptDescriptors.length);
        const spreadFill = pickSpread(remainingDescriptors, fillCount);
        const selected = [...keptDescriptors, ...spreadFill];
        const selectedKeySet = new Set(selected.map((descriptor) => descriptor.key));
        const backups = descriptors.filter((descriptor) => !selectedKeySet.has(descriptor.key));
        let placed = 0;

        const buildCandidates = (descriptor) => {
            if (kind === "ra") {
                const topDistance = Number.isFinite(descriptor?.topPoint?.y) ? descriptor.topPoint.y : Infinity;
                const bottomDistance = Number.isFinite(descriptor?.bottomPoint?.y) ? (height - descriptor.bottomPoint.y) : Infinity;
                const preferTop = topDistance <= bottomDistance;
                return preferTop
                    ? [
                        { id: "top-center", point: descriptor.topPoint, offsetX: 0, offsetY: 12, align: "center" },
                        { id: "bottom-center", point: descriptor.bottomPoint, offsetX: 0, offsetY: -12, align: "center" },
                        { id: "top-left", point: descriptor.topPoint, offsetX: 10, offsetY: 12, align: "left" },
                        { id: "bottom-right", point: descriptor.bottomPoint, offsetX: -10, offsetY: -12, align: "right" },
                    ]
                    : [
                        { id: "bottom-center", point: descriptor.bottomPoint, offsetX: 0, offsetY: -12, align: "center" },
                        { id: "top-center", point: descriptor.topPoint, offsetX: 0, offsetY: 12, align: "center" },
                        { id: "bottom-left", point: descriptor.bottomPoint, offsetX: 10, offsetY: -12, align: "left" },
                        { id: "top-right", point: descriptor.topPoint, offsetX: -10, offsetY: 12, align: "right" },
                    ];
            }
            const leftDistance = Number.isFinite(descriptor?.leftPoint?.x) ? descriptor.leftPoint.x : Infinity;
            const rightDistance = Number.isFinite(descriptor?.rightPoint?.x) ? (width - descriptor.rightPoint.x) : Infinity;
            const preferLeft = leftDistance <= rightDistance;
            return preferLeft
                ? [
                    { id: "left-high", point: descriptor.leftPoint, offsetX: 8, offsetY: -6, align: "left" },
                    { id: "right-high", point: descriptor.rightPoint, offsetX: -8, offsetY: -6, align: "right" },
                    { id: "left-low", point: descriptor.leftPoint, offsetX: 8, offsetY: 10, align: "left" },
                    { id: "right-low", point: descriptor.rightPoint, offsetX: -8, offsetY: 10, align: "right" },
                ]
                : [
                    { id: "right-high", point: descriptor.rightPoint, offsetX: -8, offsetY: -6, align: "right" },
                    { id: "left-high", point: descriptor.leftPoint, offsetX: 8, offsetY: -6, align: "left" },
                    { id: "right-low", point: descriptor.rightPoint, offsetX: -8, offsetY: 10, align: "right" },
                    { id: "left-low", point: descriptor.leftPoint, offsetX: 8, offsetY: 10, align: "left" },
                ];
        };

        const tryPlace = (descriptor) => {
            if (!descriptor) {
                return false;
            }
            const candidates = buildCandidates(descriptor);
            const previousAnchorId = familyState.anchors[descriptor.key];
            if (typeof previousAnchorId === "string" && previousAnchorId.length > 0) {
                candidates.sort((a, b) => {
                    if (a.id === previousAnchorId) {
                        return -1;
                    }
                    if (b.id === previousAnchorId) {
                        return 1;
                    }
                    return 0;
                });
            }
            for (const candidate of candidates) {
                if (drawGridLabel(descriptor.text, candidate.point, {
                    offsetX: candidate.offsetX,
                    offsetY: candidate.offsetY,
                    align: candidate.align,
                    relaxed: false,
                    capture: kind === "ra" ? placedLabelsRa : placedLabelsDec,
                    key: descriptor.key,
                })) {
                    familyState.anchors[descriptor.key] = candidate.id;
                    return true;
                }
            }
            return false;
        };

        for (const descriptor of selected) {
            if (tryPlace(descriptor)) {
                placed += 1;
            }
        }
        if (placed < targetCount) {
            for (const descriptor of backups) {
                if (tryPlace(descriptor)) {
                    placed += 1;
                    if (placed >= targetCount) {
                        break;
                    }
                }
            }
        }
        familyState.activeKeys = selected.map((descriptor) => descriptor.key);
        const visibleKeys = new Set(descriptors.map((descriptor) => descriptor.key));
        for (const anchorKey of Object.keys(familyState.anchors)) {
            if (!visibleKeys.has(anchorKey)) {
                delete familyState.anchors[anchorKey];
            }
        }
        return placed;
    };

    if (shouldReusePlacement) {
        for (const placed of composerGridTemporalState.cachedPlacedRa) {
            drawPlacedLabel(placed);
        }
        for (const placed of composerGridTemporalState.cachedPlacedDec) {
            drawPlacedLabel(placed);
        }
    } else {
        placeDeterministicLabels(raDescriptors, "ra");
        placeDeterministicLabels(decDescriptors, "dec");
        composerGridTemporalState.cachedPlacedRa = placedLabelsRa.map((label) => ({ ...label }));
        composerGridTemporalState.cachedPlacedDec = placedLabelsDec.map((label) => ({ ...label }));
        composerGridTemporalState.quatX = pose.quatX;
        composerGridTemporalState.quatY = pose.quatY;
        composerGridTemporalState.quatZ = pose.quatZ;
        composerGridTemporalState.quatW = pose.quatW;
        composerGridTemporalState.fov = pose.fov;
        composerGridTemporalState.aspect = pose.aspect;
        composerGridTemporalState.hasPose = true;
    }
    // Safety net: if extreme framing still gives sparse coverage, draw denser center-aligned helpers.
    if (visibleDecLines < 4 || visibleRaLines < 4) {
        const denserDecStep = Math.max(3, Math.min(gridDensity.decStepDeg, 5));
        const denserRaStep = Math.max(5, Math.min(gridDensity.raStepDeg, 15));
        if (visibleDecLines < 4) {
            for (let dec = -45; dec <= 45; dec += denserDecStep) {
                const samples = [];
                for (let ra = 0; ra <= 360; ra += 2) {
                    samples.push(buildDirection(ra, dec));
                }
                drawCurve(samples, baseLineColor, 0.7);
            }
        }
        if (visibleRaLines < 4) {
            for (let ra = 0; ra < 360; ra += denserRaStep) {
                const samples = [];
                for (let dec = -75; dec <= 75; dec += 2) {
                    samples.push(buildDirection(ra, dec));
                }
                drawCurve(samples, baseLineColor, 0.7);
            }
        }
    }

    drawFovReadout();
}
