import {
    PANEL_EDGE_MARGIN_PX,
    PANEL_MIN_WIDTH_PX,
    DRILLDOWN_DRAWER_WIDTH_PX,
    DRILLDOWN_DRAWER_MIN_WIDTH_PX,
    DRILLDOWN_DRAWER_MIN_HEIGHT_PX,
} from "./media-browser-config.js";
import { clamp } from "./media-browser-policy.js";
import { isElementLike, getViewportWidth, getViewportHeight, getPanelDefaultHeightPx } from "./media-browser-dom.js";

export function createMediaBrowserFilterDrawer({ getNode }) {
    let filterDrawerOpen = false;
    let currentFilterModel = {};

    function formatCountLabel(count, singular, plural = `${singular}s`) {
        const normalizedCount = Number(count);
        if (!Number.isFinite(normalizedCount)) return "";
        return `${normalizedCount} ${normalizedCount === 1 ? singular : plural}`;
    }

    function formatMediaFilterSummary(filterModel = {}) {
        const matchCount = Number(filterModel.matchCount);
        const totalCount = Number(filterModel.totalCount);
        if (!Number.isFinite(matchCount) || !Number.isFinite(totalCount)) {
            return "";
        }
        const kindCounts = filterModel.matchKindCounts || {};
        const breakdown = [
            formatCountLabel(kindCounts.image, "image"),
            formatCountLabel(kindCounts.audioClip, "audio", "audio"),
            formatCountLabel(kindCounts.videoClip, "video"),
        ].filter((part) => part && !part.startsWith("0 "));
        const base = `${matchCount} of ${formatCountLabel(totalCount, "media file")} filtered in`;
        return breakdown.length > 0 ? `${base} (${breakdown.join(", ")}).` : `${base}.`;
    }

    function countActiveMediaFilters(filterModel = {}) {
        const groups = [
            filterModel?.kindPillOptions || [],
            filterModel?.subjectOptions || filterModel?.quickOptions || [],
            filterModel?.cameraButtonOptions || [],
        ];
        const facetCount = groups.reduce((total, options) => total + (Array.isArray(options)
            ? options.filter((option) => option?.active === true && option?.id !== "all").length
            : 0), 0);
        const query = String(filterModel?.query || "").trim();
        return facetCount + (query ? 1 : 0);
    }

    function syncMediaFilterToggle(filterModel = currentFilterModel) {
        const button = getNode("media-browser-filter-toggle");
        if (!button) return;
        const activeCount = countActiveMediaFilters(filterModel);
        const label = activeCount > 0 ? `Filters ${activeCount}` : "Filter...";
        button.textContent = label;
        button.title = filterDrawerOpen ? "Hide media filters" : "Show media filters";
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-expanded", filterDrawerOpen ? "true" : "false");
        button.classList?.toggle?.("is-active", filterDrawerOpen || activeCount > 0);
    }

    function syncFilterDrawerPlacement() {
        const panel = getNode("media-browser-panel");
        const drawer = getNode("media-browser-filter-drawer");
        if (!isElementLike(drawer)) return;
        if (
            filterDrawerOpen !== true ||
            !isElementLike(panel) ||
            panel.classList.contains("media-browser-panel--hidden")
        ) {
            drawer.hidden = true;
            panel?.classList?.remove?.("media-browser-panel--filters-open");
            return;
        }

        const panelRect = panel.getBoundingClientRect?.();
        if (!panelRect || !Number.isFinite(panelRect.width) || panelRect.width <= 0) {
            drawer.hidden = true;
            panel.classList.remove("media-browser-panel--filters-open");
            return;
        }

        const viewportWidth = getViewportWidth();
        const viewportHeight = getViewportHeight();
        const width = Math.min(
            Math.round(panelRect.width),
            Math.max(PANEL_MIN_WIDTH_PX, viewportWidth - (PANEL_EDGE_MARGIN_PX * 2)),
        );
        const left = clamp(
            Math.round(panelRect.left),
            PANEL_EDGE_MARGIN_PX,
            Math.max(PANEL_EDGE_MARGIN_PX, viewportWidth - width - PANEL_EDGE_MARGIN_PX),
        );
        const preferredMaxHeight = Math.min(260, Math.max(120, viewportHeight - (PANEL_EDGE_MARGIN_PX * 2)));
        const availableAbove = Math.max(0, Math.round(panelRect.top) - PANEL_EDGE_MARGIN_PX + 1);
        const maxHeight = availableAbove >= 112
            ? Math.min(preferredMaxHeight, availableAbove)
            : Math.min(preferredMaxHeight, Math.max(160, Math.round((panelRect.height || 360) * 0.45)));

        drawer.hidden = false;
        panel.classList.add("media-browser-panel--filters-open");
        drawer.style.left = `${left}px`;
        drawer.style.width = `${width}px`;
        drawer.style.maxHeight = `${Math.round(maxHeight)}px`;

        const measuredHeight = Math.min(
            Math.round(drawer.getBoundingClientRect?.().height || drawer.offsetHeight || maxHeight),
            maxHeight,
        );
        const opensAbove = availableAbove >= 112;
        const top = opensAbove
            ? Math.round(panelRect.top - measuredHeight + 1)
            : Math.round(Math.min(
                viewportHeight - measuredHeight - PANEL_EDGE_MARGIN_PX,
                panelRect.top + 34,
            ));
        drawer.style.top = `${clamp(
            top,
            PANEL_EDGE_MARGIN_PX,
            Math.max(PANEL_EDGE_MARGIN_PX, viewportHeight - measuredHeight - PANEL_EDGE_MARGIN_PX),
        )}px`;
    }

    function setFilterDrawerOpen(open) {
        const nextOpen = open === true;
        if (filterDrawerOpen === nextOpen) {
            syncMediaFilterToggle();
            syncFilterDrawerPlacement();
            return;
        }
        filterDrawerOpen = nextOpen;
        syncMediaFilterToggle();
        syncFilterDrawerPlacement();
    }

    function syncDrilldownFlyoutPlacement() {
        const panel = getNode("media-browser-panel");
        const drilldown = getNode("media-browser-drilldown");
        const flyout = getNode("media-browser-drilldown-body");
        if (!isElementLike(flyout)) return;
        if (
            !isElementLike(panel)
            || !isElementLike(drilldown)
            || drilldown.open !== true
            || panel.classList.contains("media-browser-panel--hidden")
        ) {
            flyout.hidden = true;
            panel?.classList?.remove("media-browser-panel--drilldown-open");
            return;
        }

        const panelRect = panel.getBoundingClientRect();
        if (!Number.isFinite(panelRect.width) || panelRect.width <= 0 || panelRect.height <= 0) {
            flyout.hidden = true;
            panel.classList.remove("media-browser-panel--drilldown-open");
            return;
        }

        const viewportWidth = getViewportWidth();
        const viewportHeight = getViewportHeight();
        const maxWidth = Math.max(DRILLDOWN_DRAWER_MIN_WIDTH_PX, viewportWidth - (PANEL_EDGE_MARGIN_PX * 2));
        const availableRight = Math.max(DRILLDOWN_DRAWER_MIN_WIDTH_PX, viewportWidth - panelRect.right - PANEL_EDGE_MARGIN_PX);
        const flyoutWidth = Math.min(DRILLDOWN_DRAWER_WIDTH_PX, maxWidth, availableRight);
        const maxLeft = Math.max(PANEL_EDGE_MARGIN_PX, viewportWidth - flyoutWidth - PANEL_EDGE_MARGIN_PX);
        const desiredLeft = Math.round(panelRect.right) - 1;
        const top = clamp(
            Math.round(panelRect.top),
            PANEL_EDGE_MARGIN_PX,
            Math.max(PANEL_EDGE_MARGIN_PX, viewportHeight - DRILLDOWN_DRAWER_MIN_HEIGHT_PX),
        );
        const height = clamp(
            Math.round(panelRect.height || getPanelDefaultHeightPx()),
            DRILLDOWN_DRAWER_MIN_HEIGHT_PX,
            Math.max(DRILLDOWN_DRAWER_MIN_HEIGHT_PX, viewportHeight - top - PANEL_EDGE_MARGIN_PX),
        );

        flyout.hidden = false;
        panel.classList.add("media-browser-panel--drilldown-open");
        flyout.style.left = `${Math.round(clamp(desiredLeft, PANEL_EDGE_MARGIN_PX, maxLeft))}px`;
        flyout.style.top = `${Math.round(top)}px`;
        flyout.style.width = `${Math.round(flyoutWidth)}px`;
        flyout.style.height = `${Math.round(height)}px`;
    }

    return {
        formatMediaFilterSummary,
        syncMediaFilterToggle,
        syncFilterDrawerPlacement,
        setFilterDrawerOpen,
        syncDrilldownFlyoutPlacement,
        setModel: (model) => { currentFilterModel = model || {}; },
        getModel: () => currentFilterModel,
        isOpen: () => filterDrawerOpen === true,
    };
}
