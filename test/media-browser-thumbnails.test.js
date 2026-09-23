import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createMediaBrowserPanelActions,
    resolveThumbnailDisclosureLevel,
    resolveThumbnailPopoverPosition,
} from "../src/platform/js/app/media-browser-panel.js";
import {
    FakeElement,
    FakePanel,
    FakeRangeInput,
    clearMediaBrowserPanelGlobals,
} from "./helpers/media-browser-panel-harness.js";

describe("media browser thumbnail disclosure and paging", () => {
    afterEach(clearMediaBrowserPanelGlobals);

    it("derives horizontal thumbnail disclosure levels from strip geometry", () => {
        expect(resolveThumbnailDisclosureLevel({
            placement: "bottom",
            stripSize: 170,
            panelWidth: 672,
        })).toBe("full");
        expect(resolveThumbnailDisclosureLevel({
            placement: "top",
            stripSize: 132,
            panelWidth: 672,
        })).toBe("compact");
        expect(resolveThumbnailDisclosureLevel({
            placement: "bottom",
            stripSize: 104,
            panelWidth: 672,
        })).toBe("minimal");
        expect(resolveThumbnailDisclosureLevel({
            placement: "top",
            stripSize: 86,
            panelWidth: 672,
        })).toBe("media-only");
    });

    it("derives vertical thumbnail disclosure levels from strip geometry", () => {
        expect(resolveThumbnailDisclosureLevel({
            placement: "left",
            stripSize: 224,
            panelHeight: 520,
        })).toBe("full");
        expect(resolveThumbnailDisclosureLevel({
            placement: "right",
            stripSize: 188,
            panelHeight: 520,
        })).toBe("compact");
        expect(resolveThumbnailDisclosureLevel({
            placement: "left",
            stripSize: 148,
            panelHeight: 520,
        })).toBe("minimal");
        expect(resolveThumbnailDisclosureLevel({
            placement: "right",
            stripSize: 126,
            panelHeight: 520,
        })).toBe("media-only");
    });

    it("positions thumbnail popovers away from the hovered thumbnail when clamped", () => {
        const position = resolveThumbnailPopoverPosition({
            panelWidth: 560,
            panelHeight: 240,
            anchorLeft: 20,
            anchorTop: 88,
            anchorRight: 110,
            anchorBottom: 170,
            popoverWidth: 292,
            popoverHeight: 152,
        });
        const popoverRect = {
            left: position.left,
            top: position.top,
            right: position.left + 292,
            bottom: position.top + 152,
        };
        const anchorRect = {
            left: 20,
            top: 88,
            right: 110,
            bottom: 170,
        };
        const overlaps = popoverRect.left < anchorRect.right &&
            popoverRect.right > anchorRect.left &&
            popoverRect.top < anchorRect.bottom &&
            popoverRect.bottom > anchorRect.top;
        expect(overlaps).toBe(false);
        expect(position.placement).toBe("right");
    });

    it("applies derived thumbnail disclosure classes to the strip", () => {
        const panelElement = new FakePanel();
        const thumbnailStrip = new FakeElement("div");
        thumbnailStrip.className = "media-browser-panel__thumbnail-strip";
        panelElement.children.push(thumbnailStrip);
        const resizer = new FakeElement("div");
        const thumbnailList = new FakeElement("div");

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-thumbnail-resizer") return resizer;
                if (id === "media-browser-thumbnail-list") return thumbnailList;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();

        panel.render({ thumbnailItems: [] });

        expect(thumbnailStrip.dataset.thumbnailDisclosureLevel).toBe("media-only");
        expect(thumbnailStrip.classList.contains("media-browser-panel__thumbnail-strip--level-media-only")).toBe(true);
        expect(thumbnailStrip.classList.contains("is-compact")).toBe(true);
        expect(thumbnailStrip.classList.contains("is-minimal")).toBe(true);
    });

    it("pages thumbnails without selecting media or waiting for image load", () => {
        const panelElement = new FakePanel();
        const thumbnailStrip = new FakeElement("div");
        thumbnailStrip.className = "media-browser-panel__thumbnail-strip";
        panelElement.children.push(thumbnailStrip);
        const thumbnailList = new FakeElement("div");
        thumbnailList.clientWidth = 240;
        thumbnailList.clientHeight = 80;
        thumbnailList.scrollWidth = 900;
        thumbnailList.scrollLeft = 0;
        thumbnailList.scrollTo = vi.fn(({ left }) => {
            thumbnailList.scrollLeft = left;
        });
        const previousButton = new FakeElement("button");
        const nextButton = new FakeElement("button");
        const intents = [];

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
            setTimeout: (callback) => {
                callback();
                return 1;
            },
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-thumbnail-list") return thumbnailList;
                if (id === "media-browser-thumbnail-prev") return previousButton;
                if (id === "media-browser-thumbnail-next") return nextButton;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions({
            onIntent(intent) {
                intents.push(intent);
            },
        });

        panel.render({
            thumbnailItems: Array.from({ length: 8 }, (_value, index) => ({
                id: `image-${index}`,
                kind: "image",
                title: `Image ${index}`,
                meta: "MET",
                thumbnailAssetUrl: `thumb-${index}.jpg`,
            })),
        });

        nextButton.dispatchEvent({ type: "click" });

        expect(thumbnailList.scrollTo).toHaveBeenCalledWith(expect.objectContaining({
            left: 208,
        }));
        expect(intents).toEqual([]);
    });

    it("refreshes thumbnail paging controls when panel geometry changes", () => {
        const panelElement = new FakePanel();
        const thumbnailList = new FakeElement("div");
        thumbnailList.clientWidth = 240;
        thumbnailList.clientHeight = 80;
        thumbnailList.scrollWidth = 900;
        thumbnailList.scrollLeft = 0;
        const previousButton = new FakeElement("button");
        const nextButton = new FakeElement("button");
        const resizeCallbacks = [];
        const windowListeners = new Map();

        global.ResizeObserver = class {
            constructor(callback) {
                resizeCallbacks.push(callback);
            }

            observe() {}
        };
        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
            setTimeout: (callback) => {
                callback();
                return 1;
            },
            addEventListener(type, handler) {
                const handlers = windowListeners.get(type) || [];
                handlers.push(handler);
                windowListeners.set(type, handlers);
            },
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-thumbnail-list") return thumbnailList;
                if (id === "media-browser-thumbnail-prev") return previousButton;
                if (id === "media-browser-thumbnail-next") return nextButton;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        panel.render({
            thumbnailItems: Array.from({ length: 8 }, (_value, index) => ({
                id: `image-${index}`,
                kind: "image",
                title: `Image ${index}`,
                meta: "MET",
                thumbnailAssetUrl: `thumb-${index}.jpg`,
            })),
        });

        expect(previousButton.disabled).toBe(true);
        expect(nextButton.disabled).toBe(false);

        thumbnailList.scrollWidth = 200;
        panelElement.classList.remove("media-browser-panel--hidden");
        resizeCallbacks.forEach((callback) => callback());
        for (const handler of windowListeners.get("resize") || []) {
            handler();
        }

        expect(previousButton.disabled).toBe(true);
        expect(nextButton.disabled).toBe(true);
    });

    it("collapses and restores the thumbnail strip from the disclosure button", () => {
        const panelElement = new FakePanel();
        const thumbnailStrip = new FakeElement("div");
        thumbnailStrip.className = "media-browser-panel__thumbnail-strip";
        panelElement.children.push(thumbnailStrip);
        const resizer = new FakeElement("div");
        const collapseButton = new FakeElement("button");
        collapseButton.id = "media-browser-thumbnail-collapse";
        const thumbnailList = new FakeElement("div");
        thumbnailList.clientWidth = 240;
        thumbnailList.clientHeight = 80;
        thumbnailList.scrollWidth = 900;
        const wrapper = new FakeElement("div");

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-thumbnail-resizer") return resizer;
                if (id === "media-browser-thumbnail-collapse") return collapseButton;
                if (id === "media-browser-thumbnail-list") return thumbnailList;
                if (id === "media-browser-panel-wrapper") return wrapper;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        panel.render({
            thumbnailItems: Array.from({ length: 2 }, (_value, index) => ({
                id: `image-${index}`,
                kind: "image",
                title: `Image ${index}`,
                meta: "MET",
                thumbnailAssetUrl: `thumb-${index}.jpg`,
            })),
        });

        expect(collapseButton.textContent).toBe("▴");
        expect(collapseButton.attributes["aria-expanded"]).toBe("true");

        collapseButton.dispatchEvent({ type: "click" });

        expect(panelElement.classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(true);
        expect(thumbnailStrip.hidden).toBe(true);
        expect(wrapper.classList.contains("media-browser-panel-wrapper--thumbnail-disclosure-active")).toBe(true);
        expect(collapseButton.textContent).toBe("▾");
        expect(collapseButton.attributes["aria-expanded"]).toBe("false");

        collapseButton.dispatchEvent({ type: "click" });

        expect(panelElement.classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(false);
        expect(thumbnailStrip.hidden).toBe(false);
        expect(wrapper.classList.contains("media-browser-panel-wrapper--thumbnail-disclosure-active")).toBe(false);
        expect(collapseButton.textContent).toBe("▴");
        expect(collapseButton.attributes["aria-expanded"]).toBe("true");
    });

    it("restores the thumbnail strip when the collapsed separator bar is clicked", () => {
        const panelElement = new FakePanel();
        const thumbnailStrip = new FakeElement("div");
        thumbnailStrip.className = "media-browser-panel__thumbnail-strip";
        panelElement.children.push(thumbnailStrip);
        const resizer = new FakeElement("div");
        const collapseButton = new FakeElement("button");
        collapseButton.id = "media-browser-thumbnail-collapse";
        const thumbnailList = new FakeElement("div");
        thumbnailList.clientWidth = 240;
        thumbnailList.clientHeight = 80;
        thumbnailList.scrollWidth = 900;

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-thumbnail-resizer") return resizer;
                if (id === "media-browser-thumbnail-collapse") return collapseButton;
                if (id === "media-browser-thumbnail-list") return thumbnailList;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        panel.render({
            thumbnailItems: [{
                id: "image-0",
                kind: "image",
                title: "Image 0",
                meta: "MET",
                thumbnailAssetUrl: "thumb-0.jpg",
            }],
        });

        collapseButton.dispatchEvent({ type: "click" });
        expect(panelElement.classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(true);

        resizer.dispatchEvent({ type: "click", target: resizer });

        expect(panelElement.classList.contains("media-browser-panel--thumbnails-collapsed")).toBe(false);
        expect(thumbnailStrip.hidden).toBe(false);
        expect(collapseButton.textContent).toBe("▴");
        expect(collapseButton.attributes["aria-expanded"]).toBe("true");
    });

    it("updates thumbnail active state without rebuilding unchanged cards", () => {
        const panelElement = new FakePanel();
        const thumbnailList = new FakeElement("div");
        const createElement = vi.fn((tagName) => new FakeElement(tagName));

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
            setTimeout: (callback) => {
                callback();
                return 1;
            },
        };
        global.document = {
            createElement,
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-thumbnail-list") return thumbnailList;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        const firstItems = [
            {
                id: "image-0",
                kind: "image",
                title: "Image 0",
                meta: "MET",
                metadataLabel: "AI: Earth",
                thumbnailAssetUrl: "thumb-0.jpg",
                active: true,
            },
            {
                id: "image-1",
                kind: "image",
                title: "Image 1",
                meta: "MET",
                thumbnailAssetUrl: "thumb-1.jpg",
                active: false,
            },
        ];
        panel.render({ thumbnailItems: firstItems });
        const firstButtons = [...thumbnailList.children];
        expect(firstButtons[0].className).toContain("is-active");
        expect(firstButtons[0].attributes["aria-current"]).toBe("true");
        expect(firstButtons[0].attributes["aria-label"]).toBe("Image 0 - MET - AI: Earth");
        expect(firstButtons[0].attributes.title).toBeUndefined();
        expect(firstButtons[0].children[1].textContent).toBe("MET");
        expect(firstButtons[0].children[2].hidden).toBe(true);
        expect(firstButtons[0].children[3].hidden).toBe(true);

        firstButtons[0].dispatchEvent({ type: "focus" });
        const popover = panelElement.children.find((child) => child.id === "media-browser-thumbnail-popover");
        expect(popover?.hidden).toBe(false);
        expect(popover.children[0].textContent).toBe("Image 0");
        const popoverText = popover.children
            .flatMap((child) => [child.textContent, ...(child.children || []).map((grandchild) => grandchild.textContent)])
            .filter(Boolean);
        expect(popoverText).toContain("MET");
        expect(popoverText).toContain("Earth");

        createElement.mockClear();
        panel.render({
            thumbnailItems: firstItems.map((item, index) => ({
                ...item,
                active: index === 1,
            })),
        });

        expect(createElement).not.toHaveBeenCalled();
        expect(thumbnailList.children[0]).toBe(firstButtons[0]);
        expect(thumbnailList.children[1]).toBe(firstButtons[1]);
        expect(thumbnailList.children[0].className).not.toContain("is-active");
        expect(thumbnailList.children[0].attributes["aria-current"]).toBeUndefined();
        expect(thumbnailList.children[1].className).toContain("is-active");
        expect(thumbnailList.children[1].attributes["aria-current"]).toBe("true");
    });

    it("continues thumbnail paging while smooth scroll has not reported its new position", () => {
        const panelElement = new FakePanel();
        const thumbnailList = new FakeElement("div");
        thumbnailList.clientWidth = 240;
        thumbnailList.clientHeight = 80;
        thumbnailList.scrollWidth = 900;
        thumbnailList.scrollLeft = 0;
        thumbnailList.scrollTo = vi.fn();
        const previousButton = new FakeElement("button");
        const nextButton = new FakeElement("button");

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
            setTimeout: (callback) => {
                callback();
                return 1;
            },
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-thumbnail-list") return thumbnailList;
                if (id === "media-browser-thumbnail-prev") return previousButton;
                if (id === "media-browser-thumbnail-next") return nextButton;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        panel.render({
            thumbnailItems: Array.from({ length: 12 }, (_value, index) => ({
                id: `image-${index}`,
                kind: "image",
                title: `Image ${index}`,
                meta: "MET",
                thumbnailAssetUrl: `thumb-${index}.jpg`,
            })),
        });

        nextButton.dispatchEvent({ type: "click" });
        nextButton.dispatchEvent({ type: "click" });

        expect(thumbnailList.scrollTo).toHaveBeenNthCalledWith(1, expect.objectContaining({
            left: 208,
        }));
        expect(thumbnailList.scrollTo).toHaveBeenNthCalledWith(2, expect.objectContaining({
            left: 416,
        }));
    });
});
