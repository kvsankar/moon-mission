import {
    buildMilestoneViewModels,
    computeMilestoneLabelPlan,
    getEventTimeMs,
} from "../core/domain/orbit-milestones.js";
import { formatDateTimeUTC } from "../utils/time-utils.js";
import { buildEventHoverText, resolveBurnMetadata } from "./burn-event-metadata.js";
import { shouldShowSceneCraft } from "./scene-craft-helpers.js";

const MARKER_COLORS = {
    burn: "#ff8a4d",
    event: "#9ad7ff",
    generated: "#ffb347",
};

function dispatchDocumentEvent(type, detail) {
    if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") return;
    if (typeof CustomEvent === "function") {
        document.dispatchEvent(new CustomEvent(type, { detail }));
        return;
    }
    const fallbackEvent = document.createEvent?.("CustomEvent");
    if (fallbackEvent?.initCustomEvent) {
        fallbackEvent.initCustomEvent(type, false, false, detail);
        document.dispatchEvent(fallbackEvent);
    }
}

function buildMilestoneTitle(model) {
    const eventInfo = model?.eventInfo || {};
    const label = model?.label || eventInfo.label || "Mission event";
    const timeMs = getEventTimeMs(eventInfo);
    const lines = [label];
    if (Number.isFinite(timeMs)) {
        lines.push(formatDateTimeUTC(timeMs));
    }
    if (eventInfo.burnFlag) {
        const burn = resolveBurnMetadata(eventInfo);
        if (burn.summaryLabel) {
            lines.push(burn.summaryLabel);
        }
    }
    const text = buildEventHoverText(eventInfo);
    if (text && !lines.includes(text)) {
        lines.push(text);
    }
    if (eventInfo.generatedNote) {
        lines.push(eventInfo.generatedNote);
    } else if (eventInfo.generatedLabel) {
        lines.push(eventInfo.generatedLabel);
    }
    return lines.filter(Boolean).join("\n");
}

function ensurePopover(documentRef = document) {
    if (!documentRef?.body) return null;
    let popover = documentRef.getElementById("orbit-milestone-popout");
    if (popover) return popover;
    popover = documentRef.createElement("div");
    popover.id = "orbit-milestone-popout";
    popover.className = "orbit-milestone-popout";
    popover.hidden = true;
    documentRef.body.appendChild(popover);
    return popover;
}

function showPopover({ model, clientX, clientY, documentRef = document }) {
    const popover = ensurePopover(documentRef);
    if (!popover || !model) return;
    const eventInfo = model.eventInfo || {};
    const burn = eventInfo.burnFlag ? resolveBurnMetadata(eventInfo) : null;
    const timeMs = getEventTimeMs(eventInfo);
    const detailText = buildEventHoverText(eventInfo);
    const meta = [
        Number.isFinite(timeMs) ? formatDateTimeUTC(timeMs) : "",
        burn?.summaryLabel || "",
        model.generated ? (eventInfo.generatedLabel || "Generated segment") : "",
    ].filter(Boolean);

    popover.innerHTML = "";
    const title = documentRef.createElement("div");
    title.className = "orbit-milestone-popout__title";
    title.textContent = model.label || eventInfo.label || "Mission event";
    popover.appendChild(title);
    if (meta.length > 0) {
        const metaNode = documentRef.createElement("div");
        metaNode.className = "orbit-milestone-popout__meta";
        metaNode.textContent = meta.join(" | ");
        popover.appendChild(metaNode);
    }
    if (detailText) {
        const body = documentRef.createElement("div");
        body.className = "orbit-milestone-popout__body";
        body.textContent = detailText;
        popover.appendChild(body);
    }
    if (eventInfo.generatedNote) {
        const note = documentRef.createElement("div");
        note.className = "orbit-milestone-popout__note";
        note.textContent = eventInfo.generatedNote;
        popover.appendChild(note);
    }

    popover.hidden = false;
    const margin = 12;
    const offset = 14;
    const viewportWidth = documentRef.defaultView?.innerWidth || 1024;
    const viewportHeight = documentRef.defaultView?.innerHeight || 768;
    const rect = popover.getBoundingClientRect?.() || { width: 260, height: 120 };
    const left = Math.min(
        Math.max(margin, Number(clientX || 0) + offset),
        Math.max(margin, viewportWidth - rect.width - margin),
    );
    const top = Math.min(
        Math.max(margin, Number(clientY || 0) + offset),
        Math.max(margin, viewportHeight - rect.height - margin),
    );
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
}

function hidePopover(documentRef = document) {
    const popover = documentRef?.getElementById?.("orbit-milestone-popout");
    if (popover) {
        popover.hidden = true;
    }
}

function dispatchMilestoneHover(model, active) {
    dispatchDocumentEvent("mission-timeline-event-hover", {
        active: active === true,
        eventKey: model?.eventInfo?.key || model?.key || "",
        eventSourceKey: model?.eventInfo?.timelineSourceKey || model?.eventInfo?.key || model?.key || "",
        eventTimeMs: Number.isFinite(model?.timeMs) ? model.timeMs : Number.NaN,
    });
}

function dispatchMilestoneSelect(model) {
    if (!model?.clickable || !Number.isFinite(model.timeMs)) return;
    dispatchDocumentEvent("mission-orbit-milestone-select", {
        eventKey: model.eventInfo?.key || model.key || "",
        eventTimeMs: model.timeMs,
        source: "orbit-milestone",
    });
}

function createLabelCanvas({ label, color, fontSize = 12 }) {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext?.("2d");
    if (!context) return null;
    const safeFontSize = Math.max(10, Math.min(14, Number(fontSize) || 12));
    context.font = `${safeFontSize}px IBM Plex Sans, Arial, sans-serif`;
    const text = String(label || "Event").slice(0, 24);
    const metrics = context.measureText(text);
    const paddingX = 5;
    const paddingY = 4;
    canvas.width = Math.ceil(metrics.width + paddingX * 2 + 6);
    canvas.height = Math.ceil(safeFontSize + paddingY * 2 + 4);
    context.font = `${safeFontSize}px IBM Plex Sans, Arial, sans-serif`;
    context.shadowColor = "rgba(0, 0, 0, 0.85)";
    context.shadowBlur = 4;
    context.lineWidth = 2;
    context.strokeStyle = "rgba(3, 9, 14, 0.92)";
    context.fillStyle = color || "rgba(230, 247, 255, 0.78)";
    context.globalAlpha = 0.82;
    context.strokeText(text, paddingX + 3, safeFontSize + paddingY - 1);
    context.fillText(text, paddingX + 3, safeFontSize + paddingY - 1);
    return canvas;
}

function readViewport(documentRef) {
    return {
        width: Math.max(1, Number(documentRef?.defaultView?.innerWidth) || 1024),
        height: Math.max(1, Number(documentRef?.defaultView?.innerHeight) || 768),
    };
}

function estimate3DZoomFactor({ THREE, scene, extent }) {
    if (!THREE || !scene?.camera) return 1;
    const target = scene.cameraController?.controls?.target || new THREE.Vector3(0, 0, 0);
    const distance = typeof scene.camera.position?.distanceTo === "function"
        ? scene.camera.position.distanceTo(target)
        : Number.NaN;
    if (!Number.isFinite(distance) || distance <= 0) return 1;
    return Math.max(0.05, (Number(extent) || 1) / distance);
}

function project3DModelToScreen({ THREE, scene, viewport, model }) {
    if (!THREE || !scene?.camera || !model?.position?.position) return null;
    const vector = model.position.position.clone?.() || new THREE.Vector3(
        model.position.position.x || 0,
        model.position.position.y || 0,
        model.position.position.z || 0,
    );
    vector.project(scene.camera);
    if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || vector.z < -1 || vector.z > 1) return null;
    return {
        x: (vector.x * 0.5 + 0.5) * viewport.width,
        y: (-vector.y * 0.5 + 0.5) * viewport.height,
    };
}

function createOrbitMilestoneActions({
    THREE,
    d3 = null,
    getEventInfos = () => [],
    getGlobalConfig = () => null,
    getViewOrbit = () => true,
    getZoomFactor = () => 1,
    render = () => {},
    documentRef = typeof document !== "undefined" ? document : null,
}) {
    const raycaster = THREE ? new THREE.Raycaster() : null;
    const pointer = THREE ? new THREE.Vector2() : null;
    let hovered3DMarker = null;

    function getMarkerColor(model) {
        if (model.generated) return MARKER_COLORS.generated;
        return model.category === "burn" ? MARKER_COLORS.burn : MARKER_COLORS.event;
    }

    function setMarkerHoverState(marker, hovered) {
        if (!marker) return;
        const baseScale = Number(marker.userData?.baseScale || 1);
        marker.scale.setScalar(hovered ? baseScale * 1.55 : baseScale);
        if (marker.material) {
            marker.material.opacity = hovered ? 1 : 0.92;
            marker.material.needsUpdate = true;
        }
    }

    function clear3DHover() {
        if (!hovered3DMarker) return false;
        setMarkerHoverState(hovered3DMarker, false);
        dispatchMilestoneHover(hovered3DMarker.userData?.milestoneModel, false);
        hovered3DMarker = null;
        hidePopover(documentRef);
        return true;
    }

    function dispose3DMilestones({ scene }) {
        if (!scene) return;
        clear3DHover();
        const group = scene.orbitMilestoneGroup;
        if (group) {
            group.traverse?.((object) => {
                object.geometry?.dispose?.();
                if (object.material?.map) {
                    object.material.map.dispose?.();
                }
                object.material?.dispose?.();
            });
            scene.motherContainer?.remove?.(group);
        }
        scene.orbitMilestoneGroup = null;
        scene.orbitMilestonePickTargets = [];
        scene.orbitMilestoneLabelSprites = [];
        scene.orbitMilestoneObjectsByBodyId = {};
    }

    function update3DLabels({ scene }) {
        if (!THREE || !scene?.orbitMilestoneLabelSprites?.length) return;
        const viewport = readViewport(documentRef);
        const zoomFactor = estimate3DZoomFactor({
            THREE,
            scene,
            extent: scene.orbitMilestoneExtent || 1,
        });
        const models = scene.orbitMilestoneModels || [];
        const plans = computeMilestoneLabelPlan({
            models,
            dimension: "3D",
            zoomFactor,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            reservedTop: 84,
            reservedBottom: 132,
            projectPoint: (model) => project3DModelToScreen({ THREE, scene, viewport, model }),
        });
        const planByKey = new Map(plans.map((plan) => [plan.key, plan]));
        for (const sprite of scene.orbitMilestoneLabelSprites) {
            const model = sprite.userData?.milestoneModel;
            const plan = planByKey.get(model?.key);
            const bodyVisible = shouldShowSceneCraft({
                scene,
                globalConfig: getGlobalConfig(),
                bodyId: model?.bodyId,
            });
            sprite.visible = Boolean(plan) && bodyVisible && getViewOrbit() !== false;
        }
    }

    function add3DMilestones({ scene }) {
        if (!THREE || !scene?.motherContainer) return;
        dispose3DMilestones({ scene });

        const globalConfig = getGlobalConfig();
        const models = buildMilestoneViewModels({
            eventInfos: getEventInfos(),
            scene,
            globalConfig,
            dimension: "3D",
            maxVisible: 24,
        });
        if (models.length === 0) return;

        const group = new THREE.Group();
        group.name = "orbit-milestones";
        group.visible = getViewOrbit() !== false;
        const pickTargets = [];
        const labelSprites = [];
        const objectsByBodyId = {};
        const geometry = new THREE.SphereGeometry(1, 16, 12);
        const extent = scene.curve?.reduce((max, point) => Math.max(max, point.length?.() || 0), 0) || 1000;
        const baseScale = Math.max(0.8, Math.min(8, extent * 0.004));

        for (const model of models) {
            if (!shouldShowSceneCraft({ scene, globalConfig, bodyId: model.bodyId })) continue;
            const color = getMarkerColor(model);
            const marker = new THREE.Mesh(
                geometry.clone(),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.92,
                    depthTest: true,
                    depthWrite: false,
                }),
            );
            marker.position.copy(model.position.position);
            marker.scale.setScalar(baseScale);
            marker.renderOrder = 40;
            marker.userData = {
                ...(marker.userData || {}),
                orbitMilestone: true,
                milestoneModel: model,
                baseScale,
            };
            group.add(marker);
            pickTargets.push(marker);
            objectsByBodyId[model.bodyId] ||= [];
            objectsByBodyId[model.bodyId].push(marker);

            const labelCanvas = createLabelCanvas({ label: model.label, color, fontSize: 12 });
            if (labelCanvas) {
                const texture = new THREE.CanvasTexture(labelCanvas);
                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true,
                    depthTest: false,
                    depthWrite: false,
                }));
                const labelHeight = baseScale * 1.05;
                const labelWidth = labelHeight * (labelCanvas.width / Math.max(1, labelCanvas.height));
                sprite.position.copy(model.position.position);
                sprite.position.y += baseScale * 1.55;
                sprite.scale.set(labelWidth, labelHeight, 1);
                sprite.renderOrder = 41;
                sprite.visible = false;
                sprite.userData = {
                    orbitMilestoneLabel: true,
                    bodyId: model.bodyId,
                    milestoneModel: model,
                };
                group.add(sprite);
                labelSprites.push(sprite);
                objectsByBodyId[model.bodyId].push(sprite);
            }
        }
        geometry.dispose?.();

        scene.orbitMilestoneGroup = group;
        scene.orbitMilestonePickTargets = pickTargets;
        scene.orbitMilestoneLabelSprites = labelSprites;
        scene.orbitMilestoneModels = models;
        scene.orbitMilestoneExtent = extent;
        scene.orbitMilestoneObjectsByBodyId = objectsByBodyId;
        scene.motherContainer.add(group);
        update3DLabels({ scene });
        render();
    }

    function update3DVisibility({ scene }) {
        if (!scene?.orbitMilestoneGroup) return;
        const globalConfig = getGlobalConfig();
        const viewOrbit = getViewOrbit() !== false;
        scene.orbitMilestoneGroup.visible = viewOrbit;
        for (const [bodyId, objects] of Object.entries(scene.orbitMilestoneObjectsByBodyId || {})) {
            const visible = viewOrbit && shouldShowSceneCraft({ scene, globalConfig, bodyId });
            for (const object of objects || []) {
                object.visible = visible;
            }
        }
        update3DLabels({ scene });
    }

    function update3DHoverFromPointer({ scene, camera, rendererDomElement, clientX, clientY }) {
        if (!raycaster || !pointer || !scene?.orbitMilestonePickTargets?.length || !camera || !rendererDomElement) {
            return false;
        }
        const rect = rendererDomElement.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const [hit] = raycaster.intersectObjects(scene.orbitMilestonePickTargets, false);
        const nextMarker = hit?.object || null;
        if (nextMarker === hovered3DMarker) {
            if (nextMarker) {
                showPopover({
                    model: nextMarker.userData?.milestoneModel,
                    clientX,
                    clientY,
                    documentRef,
                });
            }
            return false;
        }
        clear3DHover();
        hovered3DMarker = nextMarker;
        if (hovered3DMarker) {
            setMarkerHoverState(hovered3DMarker, true);
            dispatchMilestoneHover(hovered3DMarker.userData?.milestoneModel, true);
            showPopover({
                model: hovered3DMarker.userData?.milestoneModel,
                clientX,
                clientY,
                documentRef,
            });
        }
        return true;
    }

    function select3DHover() {
        if (!hovered3DMarker) return false;
        dispatchMilestoneSelect(hovered3DMarker.userData?.milestoneModel);
        return true;
    }

    function add2DMilestones({ scene, svgContainer }) {
        if (!d3 || !scene || !svgContainer) return;
        svgContainer.select("#orbit-milestones").remove();
        const globalConfig = getGlobalConfig();
        const zoomFactor = Math.max(0.25, Number(getZoomFactor?.()) || 1);
        const models = buildMilestoneViewModels({
            eventInfos: getEventInfos(),
            scene,
            globalConfig,
            dimension: "2D",
            maxVisible: 24,
        });
        if (models.length === 0) return;
        const viewport = readViewport(documentRef);
        const labelPlans = computeMilestoneLabelPlan({
            models,
            dimension: "2D",
            zoomFactor,
            transform: scene.orbitSvgTransformMatrix || svgContainer.attr?.("transform") || "",
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            reservedTop: 84,
            reservedBottom: 132,
        });
        const labelPlanByKey = new Map(labelPlans.map((plan) => [plan.key, plan]));

        const group = svgContainer
            .append("g")
            .attr("id", "orbit-milestones")
            .attr("class", "orbit-milestones")
            .attr("visibility", getViewOrbit() === false ? "hidden" : "inherit");
        const groupNode = group.node?.();
        const scheduleToFront = documentRef?.defaultView?.setTimeout?.bind(documentRef.defaultView) ||
            globalThis.setTimeout?.bind(globalThis);
        if (groupNode?.parentNode && typeof scheduleToFront === "function") {
            scheduleToFront(() => {
                groupNode.parentNode?.appendChild?.(groupNode);
            }, 0);
        }

        const markerGroups = group
            .selectAll("g.orbit-milestone")
            .data(models)
            .enter()
            .append("g")
            .attr("class", (model) => [
                "orbit-milestone",
                model.category === "burn" ? "orbit-milestone--burn" : "orbit-milestone--event",
                model.generated ? "orbit-milestone--generated" : "",
                model.clickable ? "orbit-milestone--clickable" : "orbit-milestone--disabled",
            ].filter(Boolean).join(" "))
            .attr("data-event-key", (model) => model.eventInfo?.key || model.key)
            .attr("data-event-time-ms", (model) => String(model.timeMs))
            .attr("data-body-id", (model) => model.bodyId)
            .attr("tabindex", (model) => model.clickable ? "0" : "-1")
            .attr("role", "button")
            .attr("aria-disabled", (model) => model.clickable ? "false" : "true")
            .attr("aria-label", (model) => buildMilestoneTitle(model).replace(/\n/g, ", "))
            .attr("title", (model) => buildMilestoneTitle(model))
            .attr("transform", (model) => {
                const point = model.position.position;
                return `translate(${point.x}, ${point.y})`;
            })
            .style("display", (model) =>
                shouldShowSceneCraft({ scene, globalConfig, bodyId: model.bodyId }) ? null : "none",
            );

        markerGroups
            .append("circle")
            .attr("class", "orbit-milestone__hit")
            .attr("r", 10 / zoomFactor)
            .attr("fill", "transparent");

        markerGroups
            .append("circle")
            .attr("class", "orbit-milestone__dot")
            .attr("r", (model) => (model.category === "burn" ? 4.5 : 3.5) / zoomFactor)
            .attr("fill", (model) => getMarkerColor(model));

        markerGroups
            .filter((model) => labelPlanByKey.has(model.key))
            .append("text")
            .attr("class", "orbit-milestone__label")
            .attr("x", (model) => (labelPlanByKey.get(model.key)?.offsetX || 9) / zoomFactor)
            .attr("y", (model) => (labelPlanByKey.get(model.key)?.offsetY || -9) / zoomFactor)
            .attr("font-size", (model) => {
                const fontSize = labelPlanByKey.get(model.key)?.fontSize || 9;
                return fontSize / zoomFactor;
            })
            .text((model) => labelPlanByKey.get(model.key)?.label || model.label);

        markerGroups.each(function attachHandlers(model) {
            const node = this;
            const show = (event) => {
                node.classList?.add?.("orbit-milestone--hovered");
                dispatchMilestoneHover(model, true);
                showPopover({
                    model,
                    clientX: event?.clientX ?? 0,
                    clientY: event?.clientY ?? 0,
                    documentRef,
                });
            };
            const hide = () => {
                node.classList?.remove?.("orbit-milestone--hovered");
                dispatchMilestoneHover(model, false);
                hidePopover(documentRef);
            };
            const select = (event) => {
                event?.preventDefault?.();
                dispatchMilestoneSelect(model);
            };
            node.addEventListener?.("mouseenter", show);
            node.addEventListener?.("focus", show);
            node.addEventListener?.("mouseleave", hide);
            node.addEventListener?.("blur", hide);
            node.addEventListener?.("click", select);
            node.addEventListener?.("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    select(event);
                }
                if (event.key === "Escape") {
                    hide();
                }
            });
        });
    }

    return {
        add2DMilestones,
        add3DMilestones,
        clear3DHover,
        dispose3DMilestones,
        select3DHover,
        update3DLabels,
        update3DHoverFromPointer,
        update3DVisibility,
    };
}

export { createOrbitMilestoneActions };
