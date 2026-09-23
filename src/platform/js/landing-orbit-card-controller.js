import { BRIEF_ORBIT_PLANES, formatPreviewDateTimeUtc, getBriefOrbitMode } from "./landing-orbit-math.js";
import { fetchOrbitPreviewModeOptions, fetchOrbitPreviewData } from "./landing-orbit-data.js";
import { iconForCraftClass } from "./landing-card-model.js";

function mountOrbitCardPreviewController(options, { buildMissionLaunchHref }) {
    var row = options && options.row;
    var host = options && options.host;
    var modePicker = options && options.modePicker;
    var planePicker = options && options.planePicker;
    var launchLink = options && options.launchLink;
    var metaLabel = options && options.metaLabel;
    var stopped = false;
    /** @type {any} */
    var timerId = 0;
    var renderToken = 0;
    var modeOptions = [];
    var activeMode = "geo";
    var activePlane = "XY";

    function stop() {
        stopped = true;
        if (timerId) {
            clearInterval(timerId);
            timerId = 0;
        }
    }

    function updateMeta(modeKey, planeKey) {
        if (!metaLabel || !row) return;
        var mode = getBriefOrbitMode(modeKey);
        var cardCraftIcon = iconForCraftClass(row.craftClass);
        metaLabel.textContent =
            row.country +
            " • " +
            (cardCraftIcon ? (cardCraftIcon + " ") : "") +
            row.craftClass +
            " • " +
            mode.label +
            " origin • " +
            planeKey;
    }

    function setLaunchLink(modeKey) {
        if (!launchLink || !row) return;
        var mode = getBriefOrbitMode(modeKey);
        launchLink.href = buildMissionLaunchHref(row, modeKey);
        launchLink.title = "Open " + row.title + " in " + mode.label + " mode";
    }

    function renderModePicker(selectedModeKey) {
        if (!modePicker) return;
        modePicker.innerHTML = "";
        modeOptions.forEach(function(mode) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "landing-brief-segmented__btn" + (mode.key === selectedModeKey ? " is-active" : "");
            button.textContent = mode.label;
            button.disabled = !mode.available;
            button.setAttribute("aria-pressed", mode.key === selectedModeKey ? "true" : "false");
            button.title = mode.available
                ? ("Show " + mode.label + " origin preview")
                : (mode.label + " preview unavailable for this mission");
            button.addEventListener("click", function() {
                if (!mode.available || mode.key === activeMode) return;
                activeMode = mode.key;
                renderModePicker(activeMode);
                renderPreviewForMode(activeMode);
            });
            modePicker.appendChild(button);
        });
    }

    function renderPlanePicker(selectedPlaneKey) {
        if (!planePicker) return;
        planePicker.innerHTML = "";
        BRIEF_ORBIT_PLANES.forEach(function(plane) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "landing-brief-segmented__btn" + (plane.key === selectedPlaneKey ? " is-active" : "");
            button.textContent = plane.label;
            button.setAttribute("aria-pressed", plane.key === selectedPlaneKey ? "true" : "false");
            button.title = "Show " + plane.label + " projection";
            button.addEventListener("click", function() {
                if (plane.key === activePlane) return;
                activePlane = plane.key;
                renderPlanePicker(activePlane);
                renderPreviewForMode(activeMode);
            });
            planePicker.appendChild(button);
        });
    }

    function renderUnavailable(modeKey) {
        var mode = getBriefOrbitMode(modeKey);
        updateMeta(modeKey, activePlane);
        setLaunchLink(modeKey);
        host.innerHTML = "<div class=\"landing-brief-orbit-empty\">" + escapeHtml(mode.label) + " preview unavailable for this mission.</div>";
    }

    function renderPreviewForMode(modeKey) {
        var nextToken = renderToken + 1;
        renderToken = nextToken;
        if (timerId) {
            clearInterval(timerId);
            timerId = 0;
        }
        updateMeta(modeKey, activePlane);
        setLaunchLink(modeKey);
        var selectedMode = getBriefOrbitMode(modeKey);
        host.innerHTML = "<div class=\"landing-brief-orbit-empty\">Loading " + escapeHtml(selectedMode.label) + " origin preview...</div>";

        fetchOrbitPreviewData(row, modeKey).then(function(preview) {
            if (stopped || !host.isConnected || nextToken !== renderToken) return;
            if (!preview) {
                renderUnavailable(modeKey);
                return;
            }

            var size = 308;
            var center = size / 2;
            var halfSideKm = preview.halfSideKm;
            var earthRadiusKm = 6371;
            var moonRadiusKm = 1737.4;
            var centerRadiusKm = preview.centerBodyKey === "MOON" ? moonRadiusKm : earthRadiusKm;
            var secondaryRadiusKm = preview.secondaryBodyKey === "EARTH" ? earthRadiusKm : moonRadiusKm;
            var axisKey = activePlane;

            function normalizePoint(point, secondaryPoint) {
                if (!point) return null;
                if (modeKey !== "relative" || !secondaryPoint) return point;
                return {
                    x: point.x - (secondaryPoint.x / 2),
                    y: point.y - (secondaryPoint.y / 2),
                    z: point.z - (secondaryPoint.z / 2)
                };
            }

            function projectPoint(point, secondaryPoint) {
                if (!point) return null;
                var normalizedPoint = normalizePoint(point, secondaryPoint);
                if (!normalizedPoint) return null;
                var horizontal = normalizedPoint.x;
                var vertical = normalizedPoint.y;
                if (axisKey === "YZ") {
                    horizontal = normalizedPoint.y;
                    vertical = normalizedPoint.z;
                } else if (axisKey === "ZX") {
                    horizontal = normalizedPoint.z;
                    vertical = normalizedPoint.x;
                }
                return {
                    x: center + (horizontal / halfSideKm) * center,
                    y: center - (vertical / halfSideKm) * center
                };
            }

            function pointsToString(points) {
                return points.filter(Boolean).map(function(point) {
                    return point.x.toFixed(2) + "," + point.y.toFixed(2);
                }).join(" ");
            }

            var scPx = preview.scPoints.map(function(point, index) {
                return projectPoint(point, preview.secondaryPoints[index]);
            });
            var secondaryPx = preview.secondaryPoints.map(function(point) {
                return projectPoint(point, point);
            });
            var centerPx = preview.secondaryPoints.map(function(point) {
                return projectPoint({ x: 0, y: 0, z: 0 }, point);
            });
            var jdPoints = Array.isArray(preview.jdPoints) ? preview.jdPoints : null;
            var secondaryPathStr = pointsToString(secondaryPx);
            var scPathStr = pointsToString(scPx);
            var centerRadiusPx = Math.max(3, (centerRadiusKm / halfSideKm) * center);
            var secondaryRadiusPx = Math.max(4, (secondaryRadiusKm / halfSideKm) * center);

            host.innerHTML = "";
            var ns = "http://www.w3.org/2000/svg";
            var svg = document.createElementNS(ns, "svg");
            svg.setAttribute("viewBox", "0 0 " + size + " " + size);
            svg.setAttribute("width", String(size));
            svg.setAttribute("height", String(size));
            svg.setAttribute("aria-label", row.title + " " + selectedMode.label + " origin " + axisKey + " preview");

            var bg = document.createElementNS(ns, "rect");
            bg.setAttribute("x", "0");
            bg.setAttribute("y", "0");
            bg.setAttribute("width", String(size));
            bg.setAttribute("height", String(size));
            bg.setAttribute("fill", "#090f1f");
            svg.appendChild(bg);

            var grid = document.createElementNS(ns, "g");
            grid.setAttribute("stroke", "#243657");
            grid.setAttribute("stroke-opacity", "0.5");
            grid.setAttribute("stroke-width", "0.7");
            [0.25, 0.5, 0.75].forEach(function(frac) {
                var p = size * frac;
                var v = document.createElementNS(ns, "line");
                v.setAttribute("x1", p.toFixed(1));
                v.setAttribute("y1", "0");
                v.setAttribute("x2", p.toFixed(1));
                v.setAttribute("y2", String(size));
                grid.appendChild(v);
                var h = document.createElementNS(ns, "line");
                h.setAttribute("x1", "0");
                h.setAttribute("y1", p.toFixed(1));
                h.setAttribute("x2", String(size));
                h.setAttribute("y2", p.toFixed(1));
                grid.appendChild(h);
            });
            svg.appendChild(grid);

            if (secondaryPathStr) {
                var secondaryTrack = document.createElementNS(ns, "polyline");
                secondaryTrack.setAttribute("points", secondaryPathStr);
                secondaryTrack.setAttribute("fill", "none");
                secondaryTrack.setAttribute("stroke", "#7ea0cf");
                secondaryTrack.setAttribute("stroke-width", "1.2");
                secondaryTrack.setAttribute("stroke-dasharray", modeKey === "relative" ? "2 2" : "4 4");
                secondaryTrack.setAttribute("stroke-opacity", "0.9");
                svg.appendChild(secondaryTrack);
            }

            var scTrack = document.createElementNS(ns, "polyline");
            scTrack.setAttribute("points", scPathStr);
            scTrack.setAttribute("fill", "none");
            scTrack.setAttribute("stroke", "#f8b84b");
            scTrack.setAttribute("stroke-width", "1.3");
            scTrack.setAttribute("stroke-opacity", "0.28");
            svg.appendChild(scTrack);

            var scTrail = document.createElementNS(ns, "polyline");
            scTrail.setAttribute("fill", "none");
            scTrail.setAttribute("stroke", "#f8b84b");
            scTrail.setAttribute("stroke-width", "2.1");
            scTrail.setAttribute("stroke-linecap", "round");
            scTrail.setAttribute("stroke-linejoin", "round");
            svg.appendChild(scTrail);

            var scHeadTrail = document.createElementNS(ns, "polyline");
            scHeadTrail.setAttribute("fill", "none");
            scHeadTrail.setAttribute("stroke", "#ffd67a");
            scHeadTrail.setAttribute("stroke-width", "2.6");
            scHeadTrail.setAttribute("stroke-linecap", "round");
            scHeadTrail.setAttribute("stroke-linejoin", "round");
            svg.appendChild(scHeadTrail);

            var centerBody = document.createElementNS(ns, "circle");
            var initialCenterBody = centerPx[0] || { x: center, y: center };
            centerBody.setAttribute("cx", initialCenterBody.x.toFixed(2));
            centerBody.setAttribute("cy", initialCenterBody.y.toFixed(2));
            centerBody.setAttribute("r", centerRadiusPx.toFixed(2));
            centerBody.setAttribute("fill", preview.centerBodyKey === "MOON" ? "#cfd9ea" : "#4ea1ff");
            centerBody.setAttribute("stroke", preview.centerBodyKey === "MOON" ? "#f4f8ff" : "#9aceff");
            centerBody.setAttribute("stroke-width", "1");
            svg.appendChild(centerBody);

            var secondaryBody = document.createElementNS(ns, "circle");
            secondaryBody.setAttribute("r", secondaryRadiusPx.toFixed(2));
            secondaryBody.setAttribute("fill", preview.secondaryBodyKey === "EARTH" ? "#4ea1ff" : "#cfd9ea");
            secondaryBody.setAttribute("stroke", preview.secondaryBodyKey === "EARTH" ? "#9aceff" : "#f4f8ff");
            secondaryBody.setAttribute("stroke-width", "0.6");
            secondaryBody.style.display = secondaryPathStr ? "" : "none";
            svg.appendChild(secondaryBody);

            var craft = document.createElementNS(ns, "circle");
            craft.setAttribute("r", "4");
            craft.setAttribute("fill", "#ffce64");
            craft.setAttribute("stroke", "#ffeec2");
            craft.setAttribute("stroke-width", "0.6");
            svg.appendChild(craft);

            host.appendChild(svg);
            var timeLabel = document.createElement("div");
            timeLabel.className = "landing-brief-orbit-time";
            host.appendChild(timeLabel);
            var timeline = document.createElement("div");
            timeline.className = "landing-brief-orbit-timeline";
            var timelineTrack = document.createElement("div");
            timelineTrack.className = "landing-brief-orbit-track";
            var timelineFill = document.createElement("div");
            timelineFill.className = "landing-brief-orbit-fill";
            var timelineThumb = document.createElement("div");
            timelineThumb.className = "landing-brief-orbit-thumb";
            timelineTrack.appendChild(timelineFill);
            timelineTrack.appendChild(timelineThumb);
            timeline.appendChild(timelineTrack);
            host.appendChild(timeline);

            var durationMs = Math.max(15000, Math.min(32000, Math.round(scPx.length * 0.95)));
            var gapDurationMs = 3000;
            var cycleDurationMs = durationMs + gapDurationMs;
            var startTs = Date.now();
            var tailWindow = Math.max(110, Math.min(720, Math.floor(scPx.length / 80)));
            var headWindow = Math.max(26, Math.min(130, Math.floor(tailWindow / 4)));

            function setSecondaryPosition(index) {
                var point = secondaryPx[Math.max(0, Math.min(secondaryPx.length - 1, index))];
                if (!point) {
                    secondaryBody.style.display = "none";
                    return;
                }
                secondaryBody.style.display = "";
                secondaryBody.setAttribute("cx", point.x.toFixed(2));
                secondaryBody.setAttribute("cy", point.y.toFixed(2));
            }

            function setCenterBodyPosition(index) {
                var point = centerPx[Math.max(0, Math.min(centerPx.length - 1, index))];
                if (!point) return;
                centerBody.setAttribute("cx", point.x.toFixed(2));
                centerBody.setAttribute("cy", point.y.toFixed(2));
            }

            function tick() {
                var elapsed = (Date.now() - startTs) % cycleDurationMs;
                var inActivePass = elapsed < durationMs;
                var progress = inActivePass ? (elapsed / durationMs) : 1;
                var idx = Math.min(scPx.length - 1, Math.floor(progress * (scPx.length - 1)));
                var visualOpacity = 1;

                if (inActivePass) {
                    var tailStart = Math.max(0, idx - tailWindow);
                    var pathPoints = scPx.slice(tailStart, idx + 1).map(function(point) {
                        return point.x.toFixed(2) + "," + point.y.toFixed(2);
                    }).join(" ");
                    scTrail.setAttribute("points", pathPoints);
                    var headStart = Math.max(0, idx - headWindow);
                    var headPoints = scPx.slice(headStart, idx + 1).map(function(point) {
                        return point.x.toFixed(2) + "," + point.y.toFixed(2);
                    }).join(" ");
                    scHeadTrail.setAttribute("points", headPoints);
                    craft.setAttribute("cx", scPx[idx].x.toFixed(2));
                    craft.setAttribute("cy", scPx[idx].y.toFixed(2));
                } else {
                    var gapPhase = (elapsed - durationMs) / Math.max(1, gapDurationMs);
                    if (gapPhase < 0.5) {
                        idx = scPx.length - 1;
                        progress = 1;
                        visualOpacity = 1 - (gapPhase / 0.5);
                    } else {
                        idx = 0;
                        progress = 0;
                        visualOpacity = (gapPhase - 0.5) / 0.5;
                    }
                    craft.setAttribute("cx", scPx[idx].x.toFixed(2));
                    craft.setAttribute("cy", scPx[idx].y.toFixed(2));
                    scTrail.setAttribute("points", "");
                    scHeadTrail.setAttribute("points", "");
                }

                setCenterBodyPosition(idx);
                setSecondaryPosition(idx);
                scTrail.setAttribute("stroke-opacity", "0.55");
                scHeadTrail.setAttribute("stroke-opacity", "0.86");
                craft.setAttribute("opacity", (0.78 + 0.22 * Math.sin((elapsed / durationMs) * Math.PI * 8)).toFixed(3));

                var clampedOpacity = Math.max(0, Math.min(1, visualOpacity));
                var opacityText = clampedOpacity.toFixed(3);
                svg.style.opacity = opacityText;
                timeLabel.style.opacity = opacityText;
                timeline.style.opacity = opacityText;

                var jd = jdPoints && Number.isFinite(jdPoints[idx])
                    ? jdPoints[idx]
                    : preview.rangeStartJd + ((preview.rangeEndJd - preview.rangeStartJd) * idx) / Math.max(1, scPx.length - 1);
                timeLabel.textContent = formatPreviewDateTimeUtc(jd);
                var pct = Math.max(0, Math.min(100, progress * 100));
                timelineFill.style.width = pct.toFixed(2) + "%";
                timelineThumb.style.left = pct.toFixed(2) + "%";
            }

            tick();
            timerId = setInterval(tick, 33);
        });
    }

    if (!row || !host) {
        return stop;
    }

    renderPlanePicker(activePlane);
    updateMeta(activeMode, activePlane);
    setLaunchLink(activeMode);
    host.innerHTML = "<div class=\"landing-brief-orbit-empty\">Loading Earth origin preview...</div>";

    fetchOrbitPreviewModeOptions(row).then(function(nextModeOptions) {
        if (stopped || !host.isConnected) return;
        modeOptions = Array.isArray(nextModeOptions) ? nextModeOptions : [];
        var availableModes = modeOptions.filter(function(mode) { return mode.available; });
        if (!availableModes.length) {
            renderModePicker(activeMode);
            renderUnavailable(activeMode);
            return;
        }

        activeMode = availableModes.some(function(mode) { return mode.key === activeMode; })
            ? activeMode
            : availableModes[0].key;
        renderModePicker(activeMode);
        renderPreviewForMode(activeMode);
    });

    return stop;
}

export { mountOrbitCardPreviewController };
