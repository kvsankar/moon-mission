import { asTrimmedString, escapeHtml, ensureTrailingPeriod } from "./landing-text.js";
import { flagForCountry } from "./landing-card-model.js";

function renderTimelineSegmentsHtml(segments) {
    if (!Array.isArray(segments) || !segments.length) return "";
    var html = "";
    html += "<div class=\"landing-brief-timeline-block\">";
    segments.forEach(function(segment) {
        var leftPct = Number.isFinite(segment.leftPct) ? segment.leftPct : 0;
        var widthPct = Number.isFinite(segment.widthPct) ? segment.widthPct : 0;
        html += "<div class=\"landing-brief-timeline-row\">";
        html += "<div class=\"landing-brief-timeline-head\">";
        html += "<span class=\"landing-brief-timeline-label\">" + escapeHtml(segment.label || "Timeline") + "</span>";
        html += "<span class=\"landing-brief-timeline-range\">" + escapeHtml((segment.startLabel || "N/A") + " → " + (segment.endLabel || "N/A")) + "</span>";
        html += "</div>";
        html += "<div class=\"landing-brief-timeline-bar" + (segment.available ? "" : " is-unavailable") + "\">";
        if (segment.available) {
            html += "<span class=\"landing-brief-timeline-segment\" style=\"left:" + leftPct.toFixed(3) + "%;width:" + widthPct.toFixed(3) + "%;background:" + escapeHtml(segment.color || "#7cb3ff") + ";\"></span>";
        }
        html += "</div>";
        html += "</div>";
    });
    html += "</div>";
    return html;
}

function renderInlineRichText(text) {
    var escaped = escapeHtml(text || "");
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/\[([^\]]+)\]\(((?:https?:\/\/|(?:\.{1,2}\/)?docs\/)[^\s)]+)\)/g, function(_, label, url) {
        return "<a href=\"" + escapeHtml(url) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + label + "</a>";
    });
    escaped = escaped.replace(/(^|[\s(])((?:https?:\/\/|(?:\.{1,2}\/)?docs\/)[^\s)]+)/g, function(_, prefix, url) {
        return prefix + "<a href=\"" + escapeHtml(url) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(url) + "</a>";
    });
    return escaped;
}

function renderRichBlocks(text) {
    var raw = asTrimmedString(text);
    if (!raw) return "";
    var lines = raw.replace(/\r/g, "").split("\n");
    var html = "";
    var para = [];
    var listItems = [];

    function flushPara() {
        if (!para.length) return;
        html += "<p class=\"landing-brief-summary\">" + renderInlineRichText(para.join(" ")) + "</p>";
        para = [];
    }

    function flushList() {
        if (!listItems.length) return;
        html += "<ul class=\"landing-brief-list\">";
        for (var i = 0; i < listItems.length; i += 1) {
            html += "<li>" + renderInlineRichText(listItems[i]) + "</li>";
        }
        html += "</ul>";
        listItems = [];
    }

    for (var i = 0; i < lines.length; i += 1) {
        var line = asTrimmedString(lines[i]);
        if (!line) {
            flushPara();
            flushList();
            continue;
        }
        if (/^[-*]\s+/.test(line)) {
            flushPara();
            listItems.push(line.replace(/^[-*]\s+/, ""));
            continue;
        }
        flushList();
        para.push(line);
    }
    flushPara();
    flushList();

    if (!html) {
        html = "<p class=\"landing-brief-summary\">" + renderInlineRichText(raw) + "</p>";
    }
    return html;
}

function buildBriefImageCarouselHtml(images, safeTitle) {
    if (!Array.isArray(images) || !images.length) {
        return "<p class=\"landing-brief-attribution\">CC BY-SA craft image not mapped yet for this mission.</p>";
    }
    var firstImage = images[0];
    var showControls = images.length > 1;
    var html = "";
    html += "<div class=\"landing-brief-carousel\" data-brief-carousel>";
    html += "<figure class=\"landing-brief-hero\">";
    html += "<img data-brief-carousel-image src=\"" + escapeHtml(firstImage.url) + "\" alt=\"" + escapeHtml(firstImage.alt || (safeTitle + " image")) + "\">";
    html += "</figure>";
    if (showControls) {
        html += "<div class=\"landing-brief-carousel-controls\">";
        html += "<button type=\"button\" class=\"landing-brief-carousel-btn\" data-brief-image-nav=\"-1\" aria-label=\"Previous image\">←</button>";
        html += "<span class=\"landing-brief-carousel-counter\" data-brief-image-counter>1 / " + images.length + "</span>";
        html += "<button type=\"button\" class=\"landing-brief-carousel-btn\" data-brief-image-nav=\"1\" aria-label=\"Next image\">→</button>";
        html += "</div>";
    }
    html += "<p class=\"landing-brief-summary landing-brief-summary--compact\" data-brief-image-caption>";
    html += escapeHtml(asTrimmedString(firstImage.caption) || "CC BY-SA mission image.");
    html += "</p>";
    html += "<p class=\"landing-brief-attribution\" data-brief-image-attribution></p>";
    html += "</div>";
    return html;
}

function buildBriefPanelContent(row, brief, currentIndex, totalCount) {
    var images = brief && Array.isArray(brief.images) ? brief.images : [];
    var missionText = asTrimmedString(brief && (brief.mission || brief.missionStory || brief.summary));
    var horizonsDataText = asTrimmedString(brief && (brief.horizonsData || brief.horizonsScope));
    var timelinesText = asTrimmedString(brief && (brief.timelines || brief.missionTimeline));
    var timelineSegments = brief && Array.isArray(brief.timelineSegments) ? brief.timelineSegments : [];
    var rawTitle = asTrimmedString(row.title);
    var safeTitle = escapeHtml(rawTitle);
    var safeCountry = escapeHtml(row.country);
    var safeRange = escapeHtml(row.rangeLabel);
    var safeCounter = (Number.isFinite(currentIndex) ? (currentIndex + 1) : 1) + " / " + (totalCount || 1);
    var html = "";
    html += "<div class=\"landing-brief-header\">";
    html += "<div class=\"landing-brief-header-left\">";
    html += "<div class=\"landing-brief-title-row\">";
    html += "<h2 class=\"landing-brief-title\">" + safeTitle + "</h2>";
    html += "<a class=\"landing-card__btn landing-card__btn--launch landing-brief-header-launch\" id=\"landing-brief-launch\" href=\"" + escapeHtml(row.href) + "\">Launch Animation</a>";
    html += "</div>";
    html += "<p class=\"landing-brief-meta\">" + (flagForCountry(row.country) ? (flagForCountry(row.country) + " ") : "") + safeCountry + " • " + safeRange + "</p>";
    html += "</div>";
    html += "<div class=\"landing-brief-header-right\">";
    html += "<span class=\"landing-brief-counter\">" + escapeHtml(safeCounter) + "</span>";
    html += "<div class=\"landing-brief-nav\">";
    html += "<button type=\"button\" class=\"landing-brief-nav-btn\" data-brief-nav=\"-1\" aria-label=\"Previous mission\">← Prev</button>";
    html += "<button type=\"button\" class=\"landing-brief-nav-btn\" data-brief-nav=\"1\" aria-label=\"Next mission\">Next →</button>";
    html += "</div>";
    html += "<button type=\"button\" class=\"landing-brief-close\" id=\"landing-brief-close\" aria-label=\"Close brief\">×</button>";
    html += "</div>";
    html += "</div>";

    html += "<div class=\"landing-brief-body\">";
    html += "<section class=\"landing-brief-col landing-brief-col--text\">";

    html += "<p class=\"landing-brief-section-title\">Mission</p>";
    html += renderRichBlocks(missionText || ensureTrailingPeriod(row.description));
    html += "<p class=\"landing-brief-section-title\">HORIZONS Data</p>";
    html += renderRichBlocks(horizonsDataText || "HORIZONS object coverage details are being curated.");
    html += "<p class=\"landing-brief-section-title\">Timelines</p>";
    html += renderRichBlocks(timelinesText || "The timeline bars below show mission, HORIZONS, and animation coverage ranges.");
    html += renderTimelineSegmentsHtml(timelineSegments);

    html += "<p class=\"landing-brief-source\">Source: " + escapeHtml(brief.sourceLabel || "Mission metadata");
    if (asTrimmedString(brief.sourceUrl)) {
        html += " • <a href=\"" + escapeHtml(brief.sourceUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(brief.sourceUrl) + "</a>";
    }
    html += "</p>";
    html += "</section>";

    html += "<section class=\"landing-brief-col landing-brief-col--viz\">";
    html += "<div class=\"landing-brief-orbit-header\">";
    html += "<p class=\"landing-brief-section-title\">Orbit Preview</p>";
    html += "<div class=\"landing-brief-orbit-controls\">";
    html += "<div id=\"landing-brief-orbit-mode-picker\" class=\"landing-brief-segmented\" role=\"group\" aria-label=\"Orbit preview mode\"></div>";
    html += "<div id=\"landing-brief-orbit-plane-picker\" class=\"landing-brief-segmented\" role=\"group\" aria-label=\"Orbit preview plane\"></div>";
    html += "</div>";
    html += "</div>";
    html += "<div id=\"landing-brief-orbit-anim\" class=\"landing-brief-orbit-anim\">Loading 2D preview...</div>";
    html += "<p class=\"landing-brief-section-title\">Images</p>";
    html += buildBriefImageCarouselHtml(images, rawTitle);
    html += "</section>";
    html += "</div>";

    html += "<div class=\"landing-brief-actions\">";
    html += "<div class=\"landing-brief-actions-left\">";
    html += "<button type=\"button\" class=\"landing-card__btn landing-brief-nav-btn\" data-brief-nav=\"-1\">← Prev</button>";
    html += "<button type=\"button\" class=\"landing-card__btn landing-brief-nav-btn\" data-brief-nav=\"1\">Next →</button>";
    html += "</div>";
    html += "<div class=\"landing-brief-actions-right\">";
    html += "<button type=\"button\" class=\"landing-card__btn\" id=\"landing-brief-close-footer\">Close</button>";
    html += "</div>";
    html += "</div>";
    return html;
}

function mountBriefImageCarousel(images, briefPanel) {
    var carousel = briefPanel ? briefPanel.querySelector("[data-brief-carousel]") : null;
    if (!carousel || !Array.isArray(images) || !images.length) return;

    var imageEl = carousel.querySelector("[data-brief-carousel-image]");
    var captionEl = carousel.querySelector("[data-brief-image-caption]");
    var attributionEl = carousel.querySelector("[data-brief-image-attribution]");
    var counterEl = carousel.querySelector("[data-brief-image-counter]");
    var navButtons = Array.from(carousel.querySelectorAll("[data-brief-image-nav]"));
    var activeIndex = 0;

    function renderAttribution(image) {
        var html = "Image: " + escapeHtml(asTrimmedString(image.attribution) || "Wikimedia Commons contributors");
        if (asTrimmedString(image.license)) {
            html += " • " + escapeHtml(image.license);
        }
        if (asTrimmedString(image.sourceUrl)) {
            html += " • <a href=\"" + escapeHtml(image.sourceUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Source</a>";
        }
        if (asTrimmedString(image.kind)) {
            html += " • " + escapeHtml(image.kind);
        }
        return html;
    }

    function updateImage(nextIndex) {
        var image = images[nextIndex];
        if (!image || !imageEl || !captionEl || !attributionEl) return;
        activeIndex = nextIndex;
        imageEl.src = image.url;
        imageEl.alt = image.alt || "Mission image";
        captionEl.textContent = asTrimmedString(image.caption) || "CC BY-SA mission image.";
        attributionEl.innerHTML = renderAttribution(image);
        if (counterEl) {
            counterEl.textContent = (activeIndex + 1) + " / " + images.length;
        }
    }

    navButtons.forEach(function(button) {
        button.addEventListener("click", function() {
            var delta = parseInt(button.getAttribute("data-brief-image-nav"), 10);
            if (delta !== -1 && delta !== 1) return;
            updateImage((activeIndex + delta + images.length) % images.length);
        });
    });

    updateImage(0);
}

export { buildBriefPanelContent, mountBriefImageCarousel };
