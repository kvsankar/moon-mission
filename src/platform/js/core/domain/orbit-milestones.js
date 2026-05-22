function getEventTimeMs(eventInfo) {
    if (!eventInfo) return Number.NaN;
    if (eventInfo.startTime instanceof Date) {
        return eventInfo.startTime.getTime();
    }
    if (Number.isFinite(eventInfo.startTime)) {
        return eventInfo.startTime;
    }
    const parsed = Date.parse(eventInfo.startTime);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function cloneInterpolatedPoint(leftPoint, rightPoint, ratio) {
    const x = leftPoint.x + (rightPoint.x - leftPoint.x) * ratio;
    const y = leftPoint.y + (rightPoint.y - leftPoint.y) * ratio;
    const z = Number.isFinite(leftPoint.z) && Number.isFinite(rightPoint.z)
        ? leftPoint.z + (rightPoint.z - leftPoint.z) * ratio
        : undefined;

    if (typeof leftPoint.clone === "function") {
        const cloned = leftPoint.clone();
        cloned.x = x;
        cloned.y = y;
        if (z !== undefined) cloned.z = z;
        return cloned;
    }

    return z === undefined ? { x, y } : { x, y, z };
}

function interpolatePointAtTime({ points, times, timeMs }) {
    if (!Array.isArray(points) || !Array.isArray(times) || points.length === 0 || times.length === 0) {
        return { ok: false, reason: "missing-data" };
    }
    if (!Number.isFinite(timeMs)) {
        return { ok: false, reason: "invalid-time" };
    }

    const count = Math.min(points.length, times.length);
    if (count <= 0) {
        return { ok: false, reason: "missing-data" };
    }

    const firstTime = Number(times[0]);
    const lastTime = Number(times[count - 1]);
    if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) {
        return { ok: false, reason: "missing-data" };
    }
    if (timeMs < firstTime || timeMs > lastTime) {
        return { ok: false, reason: "out-of-range" };
    }

    for (let index = 0; index < count; index += 1) {
        const sampleTime = Number(times[index]);
        if (!Number.isFinite(sampleTime)) continue;
        if (sampleTime === timeMs) {
            return {
                ok: true,
                position: typeof points[index]?.clone === "function" ? points[index].clone() : { ...points[index] },
                index,
                ratio: 0,
            };
        }
        if (sampleTime > timeMs && index > 0) {
            const previousTime = Number(times[index - 1]);
            if (!Number.isFinite(previousTime) || sampleTime <= previousTime) {
                return { ok: false, reason: "missing-data" };
            }
            const ratio = (timeMs - previousTime) / (sampleTime - previousTime);
            return {
                ok: true,
                position: cloneInterpolatedPoint(points[index - 1], points[index], ratio),
                index: index - 1,
                ratio,
            };
        }
    }

    return { ok: false, reason: "out-of-range" };
}

function resolveMilestoneBodyId({ eventInfo, scene, globalConfig }) {
    const explicitBody = typeof eventInfo?.body === "string" ? eventInfo.body.trim() : "";
    if (explicitBody) return explicitBody;
    return scene?.primaryCraftId ||
        globalConfig?.primaryCraftId ||
        globalConfig?.spacecraft_mnemonic ||
        "SC";
}

function resolveMilestonePositionFromSamples({
    eventInfo,
    scene,
    globalConfig,
    dimension = "3D",
}) {
    if (eventInfo?.preEphemeris) {
        return { ok: false, reason: "pre-ephemeris" };
    }

    const timeMs = getEventTimeMs(eventInfo);
    if (!Number.isFinite(timeMs)) {
        return { ok: false, reason: "invalid-time" };
    }

    const bodyId = resolveMilestoneBodyId({ eventInfo, scene, globalConfig });
    const pointMap = dimension === "2D"
        ? scene?.orbitSvgPointsByBodyId
        : scene?.curvesById;
    const timeMap = dimension === "2D"
        ? scene?.orbitTimesByBodyId
        : scene?.curveTimesById;
    const points = pointMap?.[bodyId];
    const times = timeMap?.[bodyId];

    if (!Array.isArray(points) || !Array.isArray(times)) {
        return { ok: false, reason: "missing-body", bodyId, timeMs };
    }

    const resolved = interpolatePointAtTime({ points, times, timeMs });
    if (!resolved.ok) {
        return { ...resolved, bodyId, timeMs };
    }

    return {
        ok: true,
        bodyId,
        timeMs,
        position: resolved.position,
        source: eventInfo?.generated ? "generated-extension" : "sampled",
        sampleIndex: resolved.index,
        ratio: resolved.ratio,
    };
}

function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
}

function isMajorGeometryEvent(eventInfo) {
    const text = [
        eventInfo?.label,
        eventInfo?.infoText,
        eventInfo?.hoverText,
        eventInfo?.burnTypeLabel,
    ].map(normalizeText).join(" ").toLowerCase();
    return /(closest|approach|soi|sphere|maximum|distance|eclipse|shadow|entry|splashdown|earthrise|earthset|injection|insertion|launch)/.test(text);
}

function getMilestonePriority(eventInfo) {
    if (!eventInfo) return 99;
    if (eventInfo.key === "now" || eventInfo.kind === "now") return 0;
    if (eventInfo.burnFlag) return 1;
    if (isMajorGeometryEvent(eventInfo)) return 2;
    if (eventInfo.generated) return 3;
    return 4;
}

function shortenMilestoneLabel(label, maxChars = 18) {
    const text = normalizeText(label).replace(/\s+/g, " ");
    const limit = Math.max(6, Math.round(Number(maxChars) || 18));
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(1, limit - 3)).trim()}...`;
}

/**
 * @param {{ zoomFactor?: number, dimension?: string }} [options]
 */
function getMilestoneLabelFontSize({ zoomFactor = 1, dimension = "2D" } = {}) {
    const zoom = Math.max(0.25, Number(zoomFactor) || 1);
    const min = dimension === "3D" ? 10 : 8;
    const max = dimension === "3D" ? 13 : 12;
    const normalized = clampNumber((Math.log2(zoom) + 1.4) / 3.2, 0, 1);
    return min + (max - min) * normalized;
}

/**
 * @param {{ zoomFactor?: number, dimension?: string, maxLabels?: number }} [options]
 */
function getMilestoneLabelLimit({ zoomFactor = 1, dimension = "2D", maxLabels } = {}) {
    if (Number.isFinite(maxLabels)) return Math.max(0, Math.round(maxLabels));
    const zoom = Math.max(0.01, Number(zoomFactor) || 1);
    if (dimension === "3D") {
        if (zoom < 0.45) return 0;
        if (zoom < 0.9) return 2;
        if (zoom < 1.35) return 3;
        if (zoom < 2.2) return 5;
        return 7;
    }
    if (zoom < 0.7) return 0;
    if (zoom < 1.05) return 2;
    if (zoom < 1.7) return 4;
    if (zoom < 2.8) return 7;
    return 10;
}

function parseSvgTransformMatrix(transform) {
    const text = normalizeText(transform);
    const matrixMatch = text.match(/matrix\(([^)]+)\)/);
    if (matrixMatch) {
        const parts = matrixMatch[1].split(/[\s,]+/).map(Number);
        if (parts.length >= 6 && parts.every(Number.isFinite)) {
            return {
                a: parts[0],
                b: parts[1],
                c: parts[2],
                d: parts[3],
                e: parts[4],
                f: parts[5],
            };
        }
    }
    const scaleMatch = text.match(/scale\(([^)]+)\)/);
    if (scaleMatch) {
        const parts = scaleMatch[1].split(/[\s,]+/).map(Number).filter(Number.isFinite);
        const x = parts[0] || 1;
        const y = parts[1] || x;
        return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
    }
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function projectPointWithSvgMatrix(point, transform) {
    const matrix = typeof transform === "string"
        ? parseSvgTransformMatrix(transform)
        : (transform || parseSvgTransformMatrix(""));
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f,
    };
}

function estimateLabelRect({ screenPoint, label, fontSize, offsetX = 9, offsetY = -9 }) {
    if (!screenPoint || !Number.isFinite(screenPoint.x) || !Number.isFinite(screenPoint.y)) return null;
    const width = Math.max(24, String(label || "").length * fontSize * 0.56 + 8);
    const height = fontSize + 6;
    const left = screenPoint.x + offsetX;
    const top = screenPoint.y + offsetY - height;
    return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
    };
}

function rectsOverlap(left, right, padding = 0) {
    return !(
        left.right + padding <= right.left ||
        right.right + padding <= left.left ||
        left.bottom + padding <= right.top ||
        right.bottom + padding <= left.top
    );
}

function rectFitsViewport(rect, {
    viewportWidth = 1024,
    viewportHeight = 768,
    reservedTop = 84,
    reservedBottom = 132,
    reservedLeft = 8,
    reservedRight = 8,
} = {}) {
    return rect.left >= reservedLeft &&
        rect.right <= viewportWidth - reservedRight &&
        rect.top >= reservedTop &&
        rect.bottom <= viewportHeight - reservedBottom;
}

/**
 * @param {{
 *   models?: any[],
 *   dimension?: string,
 *   zoomFactor?: number,
 *   transform?: string | object,
 *   viewportWidth?: number,
 *   viewportHeight?: number,
 *   maxLabels?: number,
 *   selectedKey?: string,
 *   projectPoint?: ((model: any) => { x: number, y: number } | null) | null,
 *   collisionPadding?: number,
 *   reservedTop?: number,
 *   reservedBottom?: number,
 * }} [options]
 */
function computeMilestoneLabelPlan({
    models,
    dimension = "2D",
    zoomFactor = 1,
    transform = "",
    viewportWidth = 1024,
    viewportHeight = 768,
    maxLabels,
    selectedKey = "",
    projectPoint = null,
    collisionPadding = 6,
    reservedTop,
    reservedBottom,
} = {}) {
    const items = Array.isArray(models) ? models : [];
    const limit = getMilestoneLabelLimit({ zoomFactor, dimension, maxLabels });
    if (limit <= 0 && !selectedKey) return [];
    const fontSize = getMilestoneLabelFontSize({ zoomFactor, dimension });
    const accepted = [];
    const acceptedRects = [];
    const candidates = items
        .map((model, index) => {
            const selected = selectedKey && (model.key === selectedKey || model.eventInfo?.key === selectedKey);
            return {
                model,
                index,
                selected,
                priority: selected ? -1 : Number(model.priority ?? 99),
                timeMs: Number(model.timeMs),
            };
        })
        .sort((left, right) => {
            if (left.priority !== right.priority) return left.priority - right.priority;
            if (Number.isFinite(left.timeMs) && Number.isFinite(right.timeMs) && left.timeMs !== right.timeMs) {
                return left.timeMs - right.timeMs;
            }
            return left.index - right.index;
        });

    for (const candidate of candidates) {
        if (accepted.length >= limit && !candidate.selected) continue;
        const model = candidate.model;
        const rawPoint = model?.position?.position || model?.position || null;
        const screenPoint = typeof projectPoint === "function"
            ? projectPoint(model)
            : projectPointWithSvgMatrix(rawPoint, transform);
        const label = shortenMilestoneLabel(model?.label || model?.eventInfo?.label || "Event");
        const rect = estimateLabelRect({ screenPoint, label, fontSize });
        if (!rect) continue;
        if (!rectFitsViewport(rect, { viewportWidth, viewportHeight, reservedTop, reservedBottom })) continue;
        if (acceptedRects.some((existing) => rectsOverlap(rect, existing, collisionPadding))) continue;
        accepted.push({
            key: model.key,
            eventKey: model.eventInfo?.key || model.key,
            model,
            label,
            fontSize,
            screenPoint,
            rect,
            offsetX: 9,
            offsetY: -9,
        });
        acceptedRects.push(rect);
    }

    return accepted;
}

function buildMilestoneViewModels({
    eventInfos,
    scene,
    globalConfig,
    dimension = "3D",
    maxVisible = 24,
}) {
    const events = Array.isArray(eventInfos) ? eventInfos : [];
    const candidates = events
        .map((eventInfo, index) => {
            const position = resolveMilestonePositionFromSamples({
                eventInfo,
                scene,
                globalConfig,
                dimension,
            });
            return {
                eventInfo,
                index,
                key: eventInfo?.key || `event-${index}`,
                label: normalizeText(eventInfo?.label) || "Event",
                timeMs: getEventTimeMs(eventInfo),
                bodyId: position.bodyId || resolveMilestoneBodyId({ eventInfo, scene, globalConfig }),
                position,
                priority: getMilestonePriority(eventInfo),
                category: eventInfo?.burnFlag ? "burn" : "event",
                clickable: eventInfo?.clickable !== false && position.ok,
                disabledReason: position.ok ? "" : position.reason,
                generated: eventInfo?.generated === true || position.source === "generated-extension",
            };
        })
        .filter((model) => model.position.ok);

    const keepCount = Math.max(1, Math.round(Number(maxVisible) || 24));
    return candidates
        .sort((left, right) => {
            if (left.priority !== right.priority) return left.priority - right.priority;
            return left.timeMs - right.timeMs;
        })
        .slice(0, keepCount)
        .sort((left, right) => left.timeMs - right.timeMs);
}

export {
    buildMilestoneViewModels,
    computeMilestoneLabelPlan,
    getEventTimeMs,
    getMilestoneLabelFontSize,
    getMilestoneLabelLimit,
    getMilestonePriority,
    interpolatePointAtTime,
    isMajorGeometryEvent,
    parseSvgTransformMatrix,
    projectPointWithSvgMatrix,
    resolveMilestoneBodyId,
    resolveMilestonePositionFromSamples,
    shortenMilestoneLabel,
};
