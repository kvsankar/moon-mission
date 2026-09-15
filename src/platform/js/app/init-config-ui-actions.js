import { formatDateTimeUTC } from "../utils/time-utils.js";
import { buildEventHoverText } from "./burn-event-metadata.js";
import {
    resolveTimelineEventHoverText,
    resolveTimelineEventLabel,
} from "./comparison-timeline.js";

function createInitConfigUiActions(deps) {
    const {
        d3,
        getEventInfos,
        getTimelineEventInfos = getEventInfos,
        bindBurnButtons,
        getBurnButtonHandler,
        SwiperClass,
        updateEventInfo,
        clearEventInfo,
    } = deps;
    let eventRangeHoverBound = false;
    const swipersBySelector = new Map();

    function resolveEventTimeMs(eventInfo) {
        if (!eventInfo) return Number.NaN;
        if (eventInfo.startTime instanceof Date) {
            return eventInfo.startTime.getTime();
        }
        if (Number.isFinite(eventInfo.startTime)) {
            return eventInfo.startTime;
        }
        const parsed = new Date(eventInfo.startTime).getTime();
        return Number.isFinite(parsed) ? parsed : Number.NaN;
    }

    function getEventHoverText(eventInfo) {
        if (eventInfo?.timelineHoverText) {
            return eventInfo.timelineHoverText;
        }

        const baseText = resolveTimelineEventHoverText(eventInfo, buildEventHoverText);
        const eventTimeMs = resolveEventTimeMs(eventInfo);
        if (!Number.isFinite(eventTimeMs)) {
            return baseText;
        }

        const when = formatDateTimeUTC(eventTimeMs);
        return baseText ? `${baseText} • ${when}` : when;
    }

    function dispatchTimelineEventHover(eventInfo, eventTimeMs, active) {
        if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") {
            return;
        }
        const detail = {
            active: active === true,
            eventKey: eventInfo?.key || "",
            eventSourceKey: eventInfo?.timelineSourceKey || eventInfo?.key || "",
            eventTimeMs: Number.isFinite(eventTimeMs) ? eventTimeMs : Number.NaN,
        };
        if (typeof CustomEvent === "function") {
            document.dispatchEvent(new CustomEvent("mission-timeline-event-hover", { detail }));
            return;
        }
        document.dispatchEvent({ type: "mission-timeline-event-hover", detail });
    }

    function dispatchTimelineVisibleEventRangeHover(detail) {
        if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") {
            return;
        }
        if (typeof CustomEvent === "function") {
            document.dispatchEvent(new CustomEvent("mission-timeline-visible-event-range-hover", { detail }));
            return;
        }
        document.dispatchEvent({ type: "mission-timeline-visible-event-range-hover", detail });
    }

    function resolveVisibleEventRange(carousel) {
        const carouselRect = carousel?.getBoundingClientRect?.();
        if (!carouselRect) return null;
        const visibleButtons = Array.from(
            carousel.querySelectorAll?.("button[data-event-time-ms]") || [],
        ).filter((button) => {
            const eventTimeMs = Number(button?.dataset?.eventTimeMs);
            if (!Number.isFinite(eventTimeMs)) return false;
            const buttonRect = button.getBoundingClientRect?.();
            if (!buttonRect) return false;
            return buttonRect.right >= carouselRect.left && buttonRect.left <= carouselRect.right;
        });
        if (visibleButtons.length === 0) return null;
        const eventTimes = visibleButtons
            .map((button) => Number(button?.dataset?.eventTimeMs))
            .filter(Number.isFinite);
        if (eventTimes.length === 0) return null;
        return {
            startTimeMs: Math.min(...eventTimes),
            endTimeMs: Math.max(...eventTimes),
        };
    }

    function bindEventRangeHover() {
        if (eventRangeHoverBound || typeof document === "undefined") return;
        const carousel = document.querySelector?.("#timeline-dock .timeline-dock__event-carousel");
        if (!carousel) return;
        eventRangeHoverBound = true;
        let hovered = false;
        const updateVisibleRange = () => {
            if (!hovered) return;
            const range = resolveVisibleEventRange(carousel);
            dispatchTimelineVisibleEventRangeHover({
                active: !!range,
                startTimeMs: range?.startTimeMs ?? Number.NaN,
                endTimeMs: range?.endTimeMs ?? Number.NaN,
            });
        };
        const clearVisibleRange = () => {
            hovered = false;
            dispatchTimelineVisibleEventRangeHover({
                active: false,
                startTimeMs: Number.NaN,
                endTimeMs: Number.NaN,
            });
        };
        carousel.addEventListener("mouseenter", () => {
            hovered = true;
            updateVisibleRange();
        });
        carousel.addEventListener("mousemove", updateVisibleRange);
        carousel.addEventListener("scroll", updateVisibleRange);
        carousel.addEventListener("mouseleave", clearVisibleRange);
        carousel.addEventListener("focusin", () => {
            hovered = true;
            updateVisibleRange();
        });
        carousel.addEventListener("focusout", (event) => {
            if (carousel.contains?.(event.relatedTarget)) return;
            clearVisibleRange();
        });
    }

    function renderBurnButtonsWithEventInfos(eventInfos = []) {
        d3.select("#burnbuttons").html("");
        let numberedButtonIndex = 0;

        for (let i = 0; i < eventInfos.length; ++i) {
            const eventInfo = eventInfos[i];
            const eventTimeMs = resolveEventTimeMs(eventInfo);
            const isNowButton = eventInfo?.kind === "now" || eventInfo?.key === "now";
            const buttonId = isNowButton ? "burn-now" : "burn" + (++numberedButtonIndex);
            const button = d3.select("#burnbuttons")
                .append("div")
                .attr("class", "swiper-slide")
                .append("button")
                .attr("id", buttonId)
                .attr("data-event-index", String(i))
                .attr("data-event-key", eventInfo["key"] || "")
                .attr("data-event-source-key", eventInfo?.timelineSourceKey || eventInfo["key"] || "")
                .attr("data-timeline-role", eventInfo?.timelineRole || "")
                .attr("data-event-time-ms", Number.isFinite(eventTimeMs) ? String(eventTimeMs) : "")
                .attr("data-burn-flag", eventInfo?.burnFlag ? "true" : "false")
                .attr("data-duration-seconds", String(eventInfo?.durationSeconds ?? 0))
                .attr("type", "button")
                .attr(
                    "class",
                    eventInfo.clickable === false
                        ? "button burnbutton burnbutton--inactive"
                        : "button burnbutton",
                )
                .classed("burnbutton--generated", !!eventInfo.generated)
                .classed("burnbutton--comparison", !!eventInfo.comparisonEvent)
                .attr("data-generated", eventInfo.generated ? "true" : "false")
                .attr("aria-disabled", eventInfo.clickable === false ? "true" : "false")
                .attr("title", getEventHoverText(eventInfo))
                .html(resolveTimelineEventLabel(eventInfo));

            const node = button.node();
            if (!node) continue;
            const showHoverText = () => {
                dispatchTimelineEventHover(eventInfo, eventTimeMs, true);
                const hoverText = getEventHoverText(eventInfo);
                if (hoverText) {
                    updateEventInfo?.(hoverText);
                }
            };
            const clearHoverText = () => {
                dispatchTimelineEventHover(eventInfo, eventTimeMs, false);
                clearEventInfo?.();
            };
            node.addEventListener("mouseenter", showHoverText);
            node.addEventListener("focus", showHoverText);
            node.addEventListener("mouseleave", clearHoverText);
            node.addEventListener("blur", clearHoverText);
        }
    }

    function renderBurnButtons() {
        renderBurnButtonsWithEventInfos(getTimelineEventInfos() || []);
    }

    function bindBurnEventButtons(eventInfos = getTimelineEventInfos() || []) {
        bindBurnButtons(eventInfos.length, getBurnButtonHandler());
    }

    function syncBurnButtons(eventInfos = getTimelineEventInfos() || []) {
        renderBurnButtonsWithEventInfos(eventInfos);
        bindEventRangeHover();
        bindBurnEventButtons(eventInfos);
        const eventSwiper = swipersBySelector.get(".swiper2");
        if (eventSwiper && !eventSwiper.destroyed) {
            eventSwiper.update?.();
        }
    }

    function replaceSwiper(selector, options) {
        const previous = swipersBySelector.get(selector);
        if (previous && !previous.destroyed) {
            previous.destroy?.(true, true);
        }
        swipersBySelector.set(selector, new SwiperClass(selector, options));
    }

    function initializeSwipers() {
        replaceSwiper(".swiper1", {
            direction: "horizontal",
            loop: false,
            slidesPerView: "auto",
            watchOverflow: true,
            freeMode: false,
            allowTouchMove: false,
            a11y: { scrollOnFocus: false },
            spaceBetween: 6,
        });

        replaceSwiper(".swiper2", {
            direction: "horizontal",
            loop: false,
            slidesPerView: "auto",
            watchOverflow: true,
            // The timeline controller owns mouse scrolling/click suppression;
            // CSS pan-x and the browser own touch/focus scrolling. A second
            // Swiper transform/momentum owner would move the strip twice.
            freeMode: false,
            allowTouchMove: false,
            a11y: { scrollOnFocus: false },
            noSwiping: false,
            simulateTouch: false,
            touchStartPreventDefault: false,
            touchMoveStopPropagation: false,
            grabCursor: true,
            threshold: 4,
            // Spacing is handled by CSS gap so connector segments can align
            // precisely between adjacent event chips.
            spaceBetween: 0,
        });
    }

    function configureInitConfigControls() {
        renderBurnButtons();
        bindBurnEventButtons();
        initializeSwipers();
    }

    return {
        configureInitConfigControls,
        renderBurnButtons,
        bindBurnEventButtons,
        syncBurnButtons,
        initializeSwipers,
    };
}

export { createInitConfigUiActions };
