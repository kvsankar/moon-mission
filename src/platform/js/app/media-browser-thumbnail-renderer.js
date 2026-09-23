import { createElement, createSvgElement, getWindowRef, isElementLike } from "./media-browser-dom.js";
import { resolveThumbnailPopoverPosition } from "./media-browser-policy.js";

export function createMediaBrowserThumbnailRenderer({
    getNode,
    isThumbnailStripVertical,
    syncThumbnailPageButtons,
    getThumbnailPagingTargetScrollLeft,
    resetThumbnailPagingTargetScrollLeft,
    isThumbnailClickSuppressed,
    onIntent,
}) {
    let thumbnailStructureSignature = "";
    let thumbnailActiveSignature = "";

    function formatThumbnailKindLabel(kind) {
        switch (kind) {
        case "audioClip":
            return "Audio";
        case "videoClip":
            return "Video";
        case "image":
            return "Image";
        default:
            return String(kind || "Media").trim() || "Media";
        }
    }

    function buildThumbnailAriaLabel(item = {}) {
        return [
            item.title,
            item.metaFull || item.meta || item.thumbnailLabel,
            item.localTimeLabel ? `Local ${item.localTimeLabel}` : "",
            item.utcTimeLabel ? `UTC ${item.utcTimeLabel}` : "",
            item.cameraLabel,
            item.metadataLabel,
        ].filter(Boolean).join(" - ") || "Mission media item";
    }

    function appendThumbnailPopoverRow(list, label, value) {
        const text = String(value || "").trim();
        if (!isElementLike(list) || !text) return;
        const key = createElement("dt");
        const detail = createElement("dd");
        if (!key || !detail) return;
        key.className = "media-browser-panel__thumbnail-popover-key";
        key.textContent = label;
        detail.className = "media-browser-panel__thumbnail-popover-value";
        detail.textContent = text;
        list.appendChild(key);
        list.appendChild(detail);
    }

    function ensureThumbnailPopover() {
        let popover = getNode("media-browser-thumbnail-popover");
        if (isElementLike(popover)) return popover;
        const panel = getNode("media-browser-panel");
        if (!isElementLike(panel)) return null;
        popover = createElement("div");
        if (!popover) return null;
        popover.id = "media-browser-thumbnail-popover";
        popover.className = "media-browser-panel__thumbnail-popover";
        popover.hidden = true;
        popover.setAttribute?.("role", "status");
        panel.appendChild?.(popover);
        return popover;
    }

    function positionThumbnailPopover(popover, anchor) {
        const panel = getNode("media-browser-panel");
        if (!isElementLike(popover) || !isElementLike(anchor) || !isElementLike(panel)) return;
        const panelRect = panel.getBoundingClientRect?.() || {};
        const anchorRect = anchor.getBoundingClientRect?.() || {};
        const popoverRect = popover.getBoundingClientRect?.() || {};
        const panelWidth = Number(panelRect.width) || panel.offsetWidth || 0;
        const panelHeight = Number(panelRect.height) || panel.offsetHeight || 0;
        const popoverWidth = Number(popoverRect.width) || 280;
        const popoverHeight = Number(popoverRect.height) || 152;
        const anchorLeft = Number(anchorRect.left) - (Number(panelRect.left) || 0);
        const anchorRight = Number(anchorRect.right) - (Number(panelRect.left) || 0);
        const anchorTop = Number(anchorRect.top) - (Number(panelRect.top) || 0);
        const anchorBottom = Number(anchorRect.bottom) - (Number(panelRect.top) || 0);
        const position = resolveThumbnailPopoverPosition({
            panelWidth,
            panelHeight,
            anchorLeft,
            anchorTop,
            anchorRight,
            anchorBottom,
            popoverWidth,
            popoverHeight,
        });
        popover.dataset.placement = position.placement;
        popover.style.left = `${position.left}px`;
        popover.style.top = `${position.top}px`;
    }

    function showThumbnailPopover(item, anchor) {
        const popover = ensureThumbnailPopover();
        if (!isElementLike(popover)) return;
        const title = createElement("div");
        const subtitle = createElement("div");
        const details = createElement("dl");
        if (!title || !subtitle || !details) return;
        title.className = "media-browser-panel__thumbnail-popover-title";
        title.textContent = item.title || "Mission media item";
        subtitle.className = "media-browser-panel__thumbnail-popover-subtitle";
        subtitle.textContent = [formatThumbnailKindLabel(item.kind), item.stageBadge]
            .filter(Boolean)
            .join(" • ");
        details.className = "media-browser-panel__thumbnail-popover-details";
        appendThumbnailPopoverRow(details, "MET", item.metaFull || item.meta);
        appendThumbnailPopoverRow(details, "Local", item.localTimeLabel);
        appendThumbnailPopoverRow(details, "UTC", item.utcTimeLabel);
        appendThumbnailPopoverRow(details, "Camera", item.cameraLabel);
        appendThumbnailPopoverRow(details, "Photographer", item.photographer);
        appendThumbnailPopoverRow(details, "Location", item.location);
        appendThumbnailPopoverRow(details, "Source", item.sourceLabel);
        appendThumbnailPopoverRow(details, "AI", String(item.metadataLabel || "").replace(/^AI:\s*/i, ""));
        if (typeof popover.replaceChildren === "function") {
            popover.replaceChildren(title, subtitle, details);
        } else {
            popover.innerHTML = "";
            popover.appendChild(title);
            popover.appendChild(subtitle);
            popover.appendChild(details);
        }
        popover.hidden = false;
        positionThumbnailPopover(popover, anchor);
    }

    function hideThumbnailPopover() {
        const popover = getNode("media-browser-thumbnail-popover");
        if (!isElementLike(popover)) return;
        popover.hidden = true;
    }

    function appendResponsiveThumbnailMetLabel(host, item = {}) {
        if (!isElementLike(host)) return;
        const fullLabel = String(item.metaFull || item.thumbnailLabel || item.meta || "MET --").trim();
        const shortLabel = String(item.thumbnailLabel || item.meta || fullLabel).trim();
        if (fullLabel && shortLabel && fullLabel !== shortLabel) {
            const full = createElement("span");
            const short = createElement("span");
            if (full && short) {
                full.className = "media-browser-panel__thumbnail-meta-full";
                full.textContent = fullLabel;
                short.className = "media-browser-panel__thumbnail-meta-short";
                short.textContent = shortLabel;
                host.appendChild(full);
                host.appendChild(short);
                host.setAttribute?.("aria-label", fullLabel);
                return;
            }
        }
        host.textContent = shortLabel || fullLabel || "MET --";
    }

    function createAudioWaveformThumbnail() {
        const svg = createSvgElement("svg");
        const glow = createSvgElement("path");
        const line = createSvgElement("path");
        if (!svg || !glow || !line) return null;
        const path = "M12 36 C24 18 38 18 52 36 S78 54 92 36 S118 12 134 36 S166 60 182 36 S210 20 226 36 S252 52 268 36";
        svg.classList.add("media-browser-panel__thumbnail-waveform");
        svg.setAttribute("viewBox", "0 0 280 72");
        svg.setAttribute("focusable", "false");
        svg.setAttribute("aria-hidden", "true");
        svg.addEventListener("dragstart", (event) => event.preventDefault());
        glow.classList.add("media-browser-panel__thumbnail-waveform-glow");
        glow.setAttribute("d", path);
        line.classList.add("media-browser-panel__thumbnail-waveform-line");
        line.setAttribute("d", path);
        svg.appendChild(glow);
        svg.appendChild(line);
        return svg;
    }

    function createThumbnailFallback(kind) {
        if (kind === "audioClip") {
            return createAudioWaveformThumbnail();
        }
        const fallback = createElement("span");
        if (!fallback) return null;
        fallback.className = "media-browser-panel__thumbnail-fallback";
        fallback.textContent = kind === "videoClip" ? "Video" : "Image";
        fallback.addEventListener("dragstart", (event) => event.preventDefault());
        return fallback;
    }

    function revealActiveThumbnail() {
        const host = getNode("media-browser-thumbnail-list");
        if (!host) return;
        const activeButton = host.querySelector?.(".media-browser-panel__thumbnail-card.is-active");
        if (!activeButton || typeof activeButton.getBoundingClientRect !== "function") return;
        if (typeof host.getBoundingClientRect !== "function") return;
        const hostRect = host.getBoundingClientRect();
        const activeRect = activeButton.getBoundingClientRect();
        const vertical = isThumbnailStripVertical();
        const hostSize = vertical ? hostRect.height : hostRect.width;
        const activeStart = vertical ? activeRect.top : activeRect.left;
        const activeEnd = vertical ? activeRect.bottom : activeRect.right;
        const hostStart = vertical ? hostRect.top : hostRect.left;
        const hostEnd = vertical ? hostRect.bottom : hostRect.right;
        const activeSize = vertical ? activeRect.height : activeRect.width;
        const edgePadding = Math.min(120, Math.max(48, hostSize * 0.18));
        const isNearEdge = activeStart < (hostStart + edgePadding)
            || activeEnd > (hostEnd - edgePadding);
        if (!isNearEdge) return;
        const currentScroll = vertical ? Number(host.scrollTop) || 0 : Number(host.scrollLeft) || 0;
        const targetScroll = Math.max(
            0,
            currentScroll
                + (activeStart - hostStart)
                - ((hostSize - activeSize) / 2),
        );
        try {
            if (typeof host.scrollTo === "function") {
                host.scrollTo({
                    left: vertical ? Number(host.scrollLeft) || 0 : targetScroll,
                    top: vertical ? targetScroll : Number(host.scrollTop) || 0,
                    behavior: "auto",
                });
            } else {
                if (vertical) host.scrollTop = targetScroll;
                else host.scrollLeft = targetScroll;
            }
        } catch {
            if (vertical) host.scrollTop = targetScroll;
            else host.scrollLeft = targetScroll;
        }
        syncThumbnailPageButtons();
    }

    function scheduleActiveThumbnailReveal() {
        revealActiveThumbnail();
        const windowRef = getWindowRef();
        windowRef?.requestAnimationFrame?.(revealActiveThumbnail);
        windowRef?.setTimeout?.(revealActiveThumbnail, 80);
    }

    function buildThumbnailStructureSignature(thumbnailItems) {
        return JSON.stringify((thumbnailItems || []).map((item) => ({
            id: item.id,
            kind: item.kind,
            title: item.title,
            thumbnailAssetUrl: item.thumbnailAssetUrl,
            fallbackAssetUrl: item.fallbackAssetUrl,
            meta: item.meta,
            metaFull: item.metaFull,
            localTimeLabel: item.localTimeLabel,
            utcTimeLabel: item.utcTimeLabel,
            cameraLabel: item.cameraLabel,
            photographer: item.photographer,
            location: item.location,
            sourceLabel: item.sourceLabel,
            stageBadge: item.stageBadge,
            thumbnailLabel: item.thumbnailLabel,
            metadataLabel: item.metadataLabel,
        })));
    }

    function buildThumbnailActiveSignature(thumbnailItems) {
        return JSON.stringify((thumbnailItems || []).map((item) => [
            item.id,
            Boolean(item.active),
        ]));
    }

    function setThumbnailCardActive(button, active) {
        if (!button) return;
        const nextActive = Boolean(active);
        button.classList?.toggle?.("is-active", nextActive);
        if (typeof button.className === "string") {
            const classes = new Set(String(button.className || "").split(/\s+/).filter(Boolean));
            if (nextActive) classes.add("is-active");
            else classes.delete("is-active");
            button.className = Array.from(classes).join(" ");
        }
        if (nextActive) {
            button.setAttribute?.("aria-current", "true");
        } else {
            button.removeAttribute?.("aria-current");
        }
    }

    function updateThumbnailActiveStates(host, thumbnailItems) {
        const children = Array.from(host?.children || []);
        (thumbnailItems || []).forEach((item, index) => {
            const button = children[index];
            if (!button || button.dataset?.thumbnailItemId !== String(item.id || "")) return;
            setThumbnailCardActive(button, item.active);
        });
    }

    function thumbnailDomMatchesItems(host, thumbnailItems) {
        const children = Array.from(host?.children || []);
        const items = Array.isArray(thumbnailItems) ? thumbnailItems : [];
        if (children.length !== items.length) return false;
        return items.every((item, index) => (
            children[index]?.dataset?.thumbnailItemId === String(item.id || "")
        ));
    }

    function renderThumbnailItems(thumbnailItems) {
        const host = getNode("media-browser-thumbnail-list");
        if (!host) return;
        const nextStructureSignature = buildThumbnailStructureSignature(thumbnailItems);
        const nextActiveSignature = buildThumbnailActiveSignature(thumbnailItems);
        if (
            nextStructureSignature === thumbnailStructureSignature
            && thumbnailDomMatchesItems(host, thumbnailItems)
        ) {
            if (nextActiveSignature !== thumbnailActiveSignature) {
                thumbnailActiveSignature = nextActiveSignature;
                updateThumbnailActiveStates(host, thumbnailItems);
                scheduleActiveThumbnailReveal();
            }
            if (getThumbnailPagingTargetScrollLeft() != null) {
                syncThumbnailPageButtons();
            }
            return;
        }
        thumbnailStructureSignature = nextStructureSignature;
        thumbnailActiveSignature = nextActiveSignature;
        resetThumbnailPagingTargetScrollLeft();
        if (typeof host.replaceChildren === "function") {
            host.replaceChildren();
        } else {
            host.innerHTML = "";
        }

        for (const item of thumbnailItems || []) {
            const button = createElement("button");
            const media = createElement("span");
            const image = createElement("img");
            const fallback = createThumbnailFallback(item.kind);
            const title = createElement("span");
            const meta = createElement("span");
            const metadata = createElement("span");
            if (!button || !media || !title || !meta || !metadata) return;
            button.type = "button";
            if (button.dataset) {
                button.dataset.thumbnailItemId = String(item.id || "");
            }
            button.className = [
                "media-browser-panel__thumbnail-card",
                item.kind ? `media-browser-panel__thumbnail-card--${item.kind}` : "",
                item.active ? "is-active" : "",
            ].filter(Boolean).join(" ");
            if (item.active) {
                button.setAttribute("aria-current", "true");
            }
            button.draggable = false;
            button.removeAttribute?.("title");
            button.setAttribute("aria-label", buildThumbnailAriaLabel(item));
            media.className = "media-browser-panel__thumbnail-media";
            media.addEventListener("dragstart", (event) => event.preventDefault());
            if (image && item.thumbnailAssetUrl) {
                image.alt = "";
                image.loading = "lazy";
                image.decoding = "async";
                image.draggable = false;
                image.src = item.thumbnailAssetUrl;
                image.addEventListener("dragstart", (event) => event.preventDefault());
                if (item.fallbackAssetUrl && item.fallbackAssetUrl !== item.thumbnailAssetUrl) {
                    image.dataset.fallbackSrc = item.fallbackAssetUrl;
                }
                image.addEventListener("error", () => {
                    const fallbackSrc = image.dataset?.fallbackSrc || "";
                    if (fallbackSrc && image.src !== fallbackSrc) {
                        image.removeAttribute("data-fallback-src");
                        image.src = fallbackSrc;
                        return;
                    }
                    image.hidden = true;
                    fallback?.removeAttribute?.("hidden");
                });
                media.appendChild(image);
                if (fallback) {
                    fallback.setAttribute("hidden", "");
                    media.appendChild(fallback);
                }
            } else if (fallback) {
                media.appendChild(fallback);
            }
            if (item.kind === "videoClip") {
                const videoIcon = createElement("span");
                if (videoIcon) {
                    videoIcon.className = "media-browser-panel__thumbnail-video-icon";
                    videoIcon.setAttribute("aria-hidden", "true");
                    media.appendChild(videoIcon);
                }
            }
            title.className = "media-browser-panel__thumbnail-title";
            appendResponsiveThumbnailMetLabel(title, item);
            meta.className = "media-browser-panel__thumbnail-meta";
            if (item.metaFull && item.meta && item.metaFull !== item.meta) {
                const metaFull = createElement("span");
                const metaShort = createElement("span");
                if (metaFull && metaShort) {
                    metaFull.className = "media-browser-panel__thumbnail-meta-full";
                    metaFull.textContent = item.metaFull;
                    metaShort.className = "media-browser-panel__thumbnail-meta-short";
                    metaShort.textContent = item.meta;
                    meta.appendChild(metaFull);
                    meta.appendChild(metaShort);
                    meta.setAttribute?.("aria-label", item.metaFull);
                } else {
                    meta.textContent = item.metaFull || item.meta;
                }
            } else {
                meta.textContent = item.metaFull || item.meta || "";
            }
            metadata.className = "media-browser-panel__thumbnail-metadata";
            metadata.textContent = item.metadataLabel || "";
            meta.hidden = true;
            metadata.hidden = true;
            button.appendChild(media);
            button.appendChild(title);
            button.appendChild(meta);
            button.appendChild(metadata);
            button.addEventListener("click", () => {
                if (isThumbnailClickSuppressed() === true) return;
                onIntent?.({ type: "previewItem", value: item.id });
            });
            button.addEventListener("pointerenter", () => showThumbnailPopover(item, button));
            button.addEventListener("pointerleave", hideThumbnailPopover);
            button.addEventListener("focus", () => showThumbnailPopover(item, button));
            button.addEventListener("blur", hideThumbnailPopover);
            host.appendChild(button);
        }

        scheduleActiveThumbnailReveal();
        syncThumbnailPageButtons();
    }

    return { renderThumbnailItems, revealActiveThumbnail, scheduleActiveThumbnailReveal };
}
