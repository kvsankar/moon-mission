import { applyTimelineSliderMissionSeek, readTimelineSliderMissionState } from "../core/domain/timeline-slider-state.js";
import { VIEW_MODE_2D, GROUND_TRACK_PANEL_EVENT_KEYS, KM_TO_MILES, KMPS_TO_MPH, GROUND_TRACK_EVENT_WINDOW_EPSILON_MS } from "./ground-track-config.js";
import { clamp } from "./ground-track-geometry.js";
import { parseMissionTimeMs, resolveGroundTrackWindowMs, resolvePostHorizonExtension } from "./ground-track-policy.js";

export function createGroundTrackPresentation({
    getNode,
    formatMetric,
    getMissionConfigData,
    getPanelMode,
    setMetricValue,
    setTimelineLocalText,
}) {
    let groundTrackEventSignature = "";
    let groundTrackEventNodes = [];
    let selectedGroundTrackEventTimeMs = Number.NaN;

    function formatDistanceKmText(valueKm) {
        if (!Number.isFinite(valueKm)) return "--";
        return `${formatMetric(valueKm)} km`;
    }

    function formatDistanceMilesText(valueKm) {
        if (!Number.isFinite(valueKm)) return "--";
        return `${formatMetric(valueKm * KM_TO_MILES)} miles`;
    }

    function formatVelocityKmpsText(valueKmPerSec) {
        if (!Number.isFinite(valueKmPerSec)) return "--";
        return `${formatMetric(valueKmPerSec)} km/s`;
    }

    function formatVelocityMphText(valueKmPerSec) {
        if (!Number.isFinite(valueKmPerSec)) return "--";
        return `${formatMetric(valueKmPerSec * KMPS_TO_MPH)} miles/h`;
    }

    function normalizeLongitudeDegrees(lon) {
        if (!Number.isFinite(lon)) return Number.NaN;
        let normalized = lon;
        while (normalized > 180) normalized -= 360;
        while (normalized <= -180) normalized += 360;
        return normalized;
    }

    function formatLatitudeText(lat) {
        if (!Number.isFinite(lat)) return "--";
        const hemisphere = lat > 0 ? "N" : (lat < 0 ? "S" : "");
        const value = `${Math.abs(lat).toFixed(2)}°`;
        return hemisphere ? `${value} ${hemisphere}` : value;
    }

    function formatLongitudeText(lon) {
        const normalized = normalizeLongitudeDegrees(lon);
        if (!Number.isFinite(normalized)) return "--";
        const hemisphere = normalized > 0 ? "E" : (normalized < 0 ? "W" : "");
        const value = `${Math.abs(normalized).toFixed(2)}°`;
        return hemisphere ? `${value} ${hemisphere}` : value;
    }

    function formatLatLonPair(location) {
        if (!Array.isArray(location) || location.length !== 2) return "--";
        return `${formatLatitudeText(location[0])}, ${formatLongitudeText(location[1])}`;
    }

    function formatLocalDateTime(timeMs, { includeSeconds = true } = {}) {
        if (!Number.isFinite(timeMs)) return "--";
        try {
            return new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: includeSeconds ? "2-digit" : undefined,
                hour12: false,
                timeZoneName: "short",
            }).format(timeMs);
        } catch {
            return new Date(timeMs).toLocaleString();
        }
    }

    function updateInfoStrip({ earthDistanceKm, earthSpeedKmPerSec, earthAltitudeKm, location }) {
        setMetricValue("ground-track-metric-earth-distance-km", formatDistanceKmText(earthDistanceKm));
        setMetricValue("ground-track-metric-earth-distance-miles", formatDistanceMilesText(earthDistanceKm));
        setMetricValue("ground-track-metric-velocity-kmps", formatVelocityKmpsText(earthSpeedKmPerSec));
        setMetricValue("ground-track-metric-velocity-mph", formatVelocityMphText(earthSpeedKmPerSec));
        setMetricValue("ground-track-metric-altitude-km", formatDistanceKmText(earthAltitudeKm));
        setMetricValue("ground-track-metric-altitude-miles", formatDistanceMilesText(earthAltitudeKm));
        setMetricValue("ground-track-metric-latitude", formatLatitudeText(location?.[0]));
        setMetricValue("ground-track-metric-longitude", formatLongitudeText(location?.[1]));
    }

    function readMainTimelineState() {
        const slider = document.getElementById("timeline-slider");
        if (!(slider instanceof HTMLInputElement)) return null;
        return readTimelineSliderMissionState(slider);
    }

    function seekMainTimelineTime(timeMs, finalize = false) {
        const timelineState = readMainTimelineState();
        if (!timelineState) return;
        const seekResult = applyTimelineSliderMissionSeek(timelineState.slider, timeMs, {
            source: "ground-track",
        });
        if (!seekResult) return;
        const dataset = timelineState.slider.dataset || (timelineState.slider.dataset = {});
        timelineState.slider.dispatchEvent(new Event("input", { bubbles: true }));
        if (finalize) {
            dataset.programmaticSeekSource = "ground-track";
            dataset.programmaticSeekTimeMs = String(seekResult.timeMs);
            timelineState.slider.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    const REPEAT_PRESS_BUTTON_IDS = new Set(["slower", "faster", "realtime"]);

    function dispatchSyntheticPress(target) {
        if (!(target instanceof HTMLButtonElement) || target.disabled) {
            return false;
        }
        if (typeof window !== "undefined" && typeof window.PointerEvent === "function") {
            target.dispatchEvent(new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
                button: 0,
            }));
            target.dispatchEvent(new PointerEvent("pointerup", {
                bubbles: true,
                cancelable: true,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
                button: 0,
            }));
            return true;
        }
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
        return true;
    }

    function clickMainControlButton(id) {
        const button = document.getElementById(id);
        if (!(button instanceof HTMLButtonElement)) {
            return false;
        }
        if (button.disabled || button.getAttribute("aria-disabled") === "true") {
            return false;
        }
        if (REPEAT_PRESS_BUTTON_IDS.has(id)) {
            return dispatchSyntheticPress(button);
        }
        button.click();
        return true;
    }

    function resolveGroundTrackEvents(config, startMs, endMs) {
        const eventMap = getMissionConfigData()?.events || {};
        const provenance = resolvePostHorizonExtension(getMissionConfigData(), config);
        const sourceEndMs = provenance?.sourceEndMs;
        const events = [];

        for (const eventKey of GROUND_TRACK_PANEL_EVENT_KEYS) {
            const key = String(eventKey || "").trim();
            if (!key || key === "now") continue;
            const eventInfo = eventMap[key];
            if (!eventInfo || typeof eventInfo !== "object") continue;
            const eventTimeMs = parseMissionTimeMs(eventInfo?.startTime);
            if (!Number.isFinite(eventTimeMs)) continue;
            if (Number.isFinite(startMs) && eventTimeMs < (startMs - GROUND_TRACK_EVENT_WINDOW_EPSILON_MS)) continue;
            if (Number.isFinite(endMs) && eventTimeMs > (endMs + GROUND_TRACK_EVENT_WINDOW_EPSILON_MS)) continue;
            const title = String(eventInfo?.label || key || "Event").trim();
            if (!title) continue;
            events.push({
                id: key,
                title,
                timeMs: eventTimeMs,
                generated: Number.isFinite(sourceEndMs) && eventTimeMs > sourceEndMs,
            });
        }

        events.sort((a, b) => a.timeMs - b.timeMs);
        return events;
    }

    function syncGroundTrackEventList(config, currentTimeMs, startMs, endMs) {
        const wrap = getNode("ground-track-event-list");
        if (!wrap) return;
        const events = resolveGroundTrackEvents(config, startMs, endMs);
        const signature = events.map((eventInfo) => `${eventInfo.id}:${eventInfo.timeMs}:${eventInfo.generated ? 1 : 0}`).join("|");
        if (groundTrackEventSignature !== signature) {
            wrap.replaceChildren();
            groundTrackEventSignature = signature;
            groundTrackEventNodes = [];
            selectedGroundTrackEventTimeMs = Number.NaN;
            for (const eventInfo of events) {
                const pill = document.createElement("button");
                pill.type = "button";
                pill.className = "ground-track-panel__event-pill";
                pill.setAttribute("aria-label", `Jump timeline to ${eventInfo.title}`);
                const titleWrap = document.createElement("span");
                titleWrap.className = "ground-track-panel__event-pill-title-wrap";
                const title = document.createElement("span");
                title.className = "ground-track-panel__event-pill-title";
                title.textContent = eventInfo.title;
                titleWrap.appendChild(title);
                if (eventInfo.generated) {
                    const badge = document.createElement("span");
                    badge.className = "ground-track-panel__event-pill-badge";
                    badge.textContent = "Generated";
                    titleWrap.appendChild(badge);
                }
                const time = document.createElement("span");
                time.className = "ground-track-panel__event-pill-time";
                time.textContent = formatLocalDateTime(eventInfo.timeMs);
                pill.appendChild(titleWrap);
                pill.appendChild(time);
                pill.addEventListener("click", () => {
                    selectedGroundTrackEventTimeMs = eventInfo.timeMs;
                    seekMainTimelineTime(eventInfo.timeMs, true);
                    syncGroundTrackEventList(config, eventInfo.timeMs, startMs, endMs);
                });
                wrap.appendChild(pill);
                groundTrackEventNodes.push({
                    element: pill,
                    id: eventInfo.id,
                    timeMs: eventInfo.timeMs,
                });
            }
        }

        if (groundTrackEventNodes.length === 0) {
            return;
        }

        let activeIndex = -1;
        const selectedEventIndex = Number.isFinite(selectedGroundTrackEventTimeMs)
            ? groundTrackEventNodes.findIndex((eventNode) => eventNode.timeMs === selectedGroundTrackEventTimeMs)
            : -1;
        if (selectedEventIndex >= 0 && Number.isFinite(currentTimeMs)) {
            if (Math.abs(currentTimeMs - selectedGroundTrackEventTimeMs) <= 1000) {
                activeIndex = selectedEventIndex;
            } else {
                selectedGroundTrackEventTimeMs = Number.NaN;
            }
        }
        if (Number.isFinite(currentTimeMs) && activeIndex < 0) {
            for (let i = 0; i < groundTrackEventNodes.length; i += 1) {
                if (currentTimeMs >= groundTrackEventNodes[i].timeMs) {
                    activeIndex = i;
                } else {
                    break;
                }
            }
            if (activeIndex < 0) {
                activeIndex = 0;
            }
        }
        for (let i = 0; i < groundTrackEventNodes.length; i += 1) {
            groundTrackEventNodes[i].element.classList.toggle("is-active", i === activeIndex);
        }
    }

    function syncTimelineCardUi(config, animTime, startMs, endMs) {
        const playButton = getNode("ground-track-play");
        const stepBackSecondButton = getNode("ground-track-step-back-second");
        const stepForwardSecondButton = getNode("ground-track-step-forward-second");
        const stepBackMinuteButton = getNode("ground-track-step-back-minute");
        const stepForwardMinuteButton = getNode("ground-track-step-forward-minute");
        const slowerButton = getNode("ground-track-slower");
        const speedButton = getNode("ground-track-speed");
        const fasterButton = getNode("ground-track-faster");
        const slider = getNode("ground-track-timeline-slider");
        const mainTimeline = readMainTimelineState();

        if (playButton instanceof HTMLButtonElement) {
            const mainPlay = document.getElementById("animate");
            if (mainPlay instanceof HTMLButtonElement) {
                playButton.textContent = (mainPlay.textContent || "▶").trim() || "▶";
                playButton.disabled = mainPlay.disabled || mainPlay.getAttribute("aria-disabled") === "true";
                playButton.title = mainPlay.title || "Play or pause animation";
            } else {
                playButton.textContent = "▶";
                playButton.disabled = true;
            }
        }

        if (speedButton instanceof HTMLButtonElement) {
            const mainSpeed = document.getElementById("realtime");
            if (mainSpeed instanceof HTMLButtonElement) {
                speedButton.textContent = (mainSpeed.textContent || "1 sec/sec").trim() || "1 sec/sec";
                speedButton.disabled = mainSpeed.disabled || mainSpeed.getAttribute("aria-disabled") === "true";
                speedButton.title = mainSpeed.title || "Set speed to realtime (1 sec/sec)";
            } else {
                speedButton.textContent = "1 sec/sec";
                speedButton.disabled = true;
            }
        }

        const mainSlower = document.getElementById("slower");
        if (slowerButton instanceof HTMLButtonElement) {
            slowerButton.disabled = !(mainSlower instanceof HTMLButtonElement) ||
                mainSlower.disabled ||
                mainSlower.getAttribute("aria-disabled") === "true";
        }

        const mainFaster = document.getElementById("faster");
        if (fasterButton instanceof HTMLButtonElement) {
            fasterButton.disabled = !(mainFaster instanceof HTMLButtonElement) ||
                mainFaster.disabled ||
                mainFaster.getAttribute("aria-disabled") === "true";
        }

        const rangeStart = Number.isFinite(startMs) ? startMs : mainTimeline?.min;
        const rangeEnd = Number.isFinite(endMs) ? endMs : mainTimeline?.max;
        const configuredWindow = resolveGroundTrackWindowMs(getMissionConfigData(), config);
        const eventRangeEnd = Number.isFinite(configuredWindow?.endMs)
            ? configuredWindow.endMs
            : rangeEnd;
        const activeTime = clamp(animTime, rangeStart, rangeEnd);

        if (slider instanceof HTMLInputElement && Number.isFinite(rangeStart) && Number.isFinite(rangeEnd)) {
            slider.min = String(rangeStart);
            slider.max = String(Math.max(rangeStart + 1000, rangeEnd));
            slider.step = "1000";
            slider.value = String(activeTime);
            slider.disabled = false;
        } else if (slider instanceof HTMLInputElement) {
            slider.disabled = true;
        }

        if (stepBackSecondButton instanceof HTMLButtonElement) {
            stepBackSecondButton.disabled = !Number.isFinite(rangeStart) || activeTime <= rangeStart;
        }
        if (stepForwardSecondButton instanceof HTMLButtonElement) {
            stepForwardSecondButton.disabled = !Number.isFinite(rangeEnd) || activeTime >= rangeEnd;
        }
        if (stepBackMinuteButton instanceof HTMLButtonElement) {
            stepBackMinuteButton.disabled = !Number.isFinite(rangeStart) || activeTime <= rangeStart;
        }
        if (stepForwardMinuteButton instanceof HTMLButtonElement) {
            stepForwardMinuteButton.disabled = !Number.isFinite(rangeEnd) || activeTime >= rangeEnd;
        }

        setTimelineLocalText(`Local: ${formatLocalDateTime(activeTime)}`);
        syncGroundTrackEventList(config, activeTime, rangeStart, eventRangeEnd);
    }

    function updateModeButtons() {
        const button2d = getNode("ground-track-style-2d");
        const button3d = getNode("ground-track-style-3d");
        const is2D = getPanelMode() === VIEW_MODE_2D;
        button2d?.classList.toggle("is-active", is2D);
        button3d?.classList.toggle("is-active", !is2D);
        button2d?.setAttribute("aria-pressed", is2D ? "true" : "false");
        button3d?.setAttribute("aria-pressed", is2D ? "false" : "true");
    }

    return { formatLatLonPair, updateInfoStrip, seekMainTimelineTime,
        clickMainControlButton, syncTimelineCardUi, updateModeButtons };
}
