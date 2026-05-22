import { afterEach, describe, expect, it, vi } from "vitest";

import {
    createMediaBrowserPanelActions,
    resolveRangeValueAtClientX,
    resolveThumbnailDisclosureLevel,
    resolveThumbnailPopoverPosition,
} from "../src/platform/js/app/media-browser-panel.js";

class FakeRangeInput {
    constructor() {
        this.listeners = new Map();
        this.attributes = {};
        this.hidden = false;
        this.disabled = false;
        this.min = "0";
        this.max = "0";
        this.step = "0.25";
        this.value = "0";
        this.rect = { left: 100, width: 400, height: 20 };
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }

    dispatchEvent(event) {
        if (!event.target) event.target = this;
        if (typeof event.preventDefault !== "function") {
            event.preventDefault = () => {
                event.defaultPrevented = true;
            };
        }
        for (const handler of this.listeners.get(event.type) || []) {
            handler.call(this, event);
        }
    }

    getBoundingClientRect() {
        return this.rect;
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    setPointerCapture(pointerId) {
        this.capturedPointerId = pointerId;
    }

    releasePointerCapture(pointerId) {
        if (this.capturedPointerId === pointerId) {
            delete this.capturedPointerId;
        }
    }
}

class FakePanel {
    constructor() {
        this.listeners = new Map();
        const styleValues = new Map();
        this.style = {
            getPropertyValue: (name) => styleValues.get(name) || "",
            setProperty: (name, value) => {
                styleValues.set(name, value);
            },
        };
        this.dataset = {};
        this.children = [];
        this.offsetWidth = 672;
        this.offsetHeight = 480;
        this._classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => this._classes.add(name)),
            remove: (...names) => names.forEach((name) => this._classes.delete(name)),
            contains: (name) => this._classes.has(name),
            toggle: (name, enabled) => {
                if (enabled) this._classes.add(name);
                else this._classes.delete(name);
            },
        };
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }

    querySelector(selector) {
        if (selector === ".media-browser-panel__thumbnail-strip") {
            return this.children.find((child) => String(child.className || "").includes("media-browser-panel__thumbnail-strip")) || null;
        }
        return null;
    }

    getBoundingClientRect() {
        return {
            left: 8,
            top: 80,
            width: this.offsetWidth,
            height: this.offsetHeight,
        };
    }
}

class FakeElement {
    constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.listeners = new Map();
        this.children = [];
        this.attributes = {};
        this.dataset = {};
        this.style = {
            values: new Map(),
            getPropertyValue(name) {
                return this.values.get(name) || "";
            },
            setProperty(name, value) {
                this.values.set(name, value);
            },
        };
        this.hidden = false;
        this.disabled = false;
        this.textContent = "";
        this.className = "";
        this._classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => this._classes.add(name)),
            remove: (...names) => names.forEach((name) => this._classes.delete(name)),
            contains: (name) => this._classes.has(name) || String(this.className || "").split(/\s+/).includes(name),
            toggle: (name, enabled) => {
                if (enabled) this._classes.add(name);
                else this._classes.delete(name);
            },
        };
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    dispatchEvent(event) {
        if (!event.target) event.target = this;
        if (typeof event.preventDefault !== "function") {
            event.preventDefault = () => {
                event.defaultPrevented = true;
            };
        }
        if (typeof event.stopPropagation !== "function") {
            event.stopPropagation = () => {};
        }
        for (const handler of this.listeners.get(event.type) || []) {
            handler.call(this, event);
        }
    }

    appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
    }

    replaceChildren(...children) {
        this.children = [];
        children.forEach((child) => this.appendChild(child));
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    removeAttribute(name) {
        delete this.attributes[name];
        if (name === "src") this.src = "";
        if (name === "poster") this.poster = "";
    }

    getAttribute(name) {
        if (name === "src") return this.src || "";
        if (name === "poster") return this.poster || "";
        return this.attributes[name] || "";
    }

    querySelector(selector) {
        if (selector === ".media-browser-panel__thumbnail-strip") {
            return this.children.find((child) => String(child.className || "").includes("media-browser-panel__thumbnail-strip")) || null;
        }
        if (selector === ".media-browser-panel__thumbnail-card.is-active") {
            return this.children.find((child) => String(child.className || "").includes("media-browser-panel__thumbnail-card")
                && String(child.className || "").includes("is-active")) || null;
        }
        return null;
    }

    contains(target) {
        if (target === this) return true;
        return this.children.some((child) => typeof child.contains === "function"
            ? child.contains(target)
            : child === target);
    }

    closest() {
        return null;
    }

    getBoundingClientRect() {
        return {
            left: 0,
            right: Number(this.clientWidth) || 0,
            top: 0,
            bottom: 100,
            width: Number(this.clientWidth) || 0,
            height: Number(this.clientHeight) || 0,
        };
    }
}

describe("media browser panel timeline", () => {
    afterEach(() => {
        delete global.document;
        delete global.CustomEvent;
        delete global.ResizeObserver;
        delete global.window;
    });

    it("resolves clicked range positions to stepped media seconds", () => {
        const slider = new FakeRangeInput();
        slider.min = "0";
        slider.max = "100";
        slider.step = "0.25";

        expect(resolveRangeValueAtClientX(slider, 100)).toBe(0);
        expect(resolveRangeValueAtClientX(slider, 388)).toBe(72);
        expect(resolveRangeValueAtClientX(slider, 600)).toBe(100);
    });

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

    it("emits media seek intents on direct pointer clicks", () => {
        const slider = new FakeRangeInput();
        const panelElement = new FakePanel();
        const intents = [];

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
        };
        global.document = {
            getElementById(id) {
                if (id === "media-browser-media-timeline") return slider;
                if (id === "media-browser-panel") return panelElement;
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
            playbackModel: {
                showControls: true,
                seekEnabled: true,
                elapsedSeconds: 0,
                durationSeconds: 100,
            },
        });

        slider.dispatchEvent({
            type: "pointerdown",
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
        });
        slider.dispatchEvent({
            type: "pointerup",
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
        });

        expect(intents).toEqual([
            { type: "mediaSeekTime", value: 50, finalize: false },
            { type: "mediaSeekTime", value: 50, finalize: true },
        ]);
        expect(slider.value).toBe("50");
        expect(slider.capturedPointerId).toBeUndefined();
    });

    it("suppresses duplicate native seek events after pointer seeking", () => {
        const slider = new FakeRangeInput();
        const panelElement = new FakePanel();
        const intents = [];

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
        };
        global.document = {
            getElementById(id) {
                if (id === "media-browser-media-timeline") return slider;
                if (id === "media-browser-panel") return panelElement;
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
            playbackModel: {
                showControls: true,
                seekEnabled: true,
                elapsedSeconds: 0,
                durationSeconds: 100,
            },
        });

        slider.dispatchEvent({
            type: "pointerdown",
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
        });
        slider.dispatchEvent({ type: "input" });
        slider.dispatchEvent({
            type: "pointerup",
            pointerId: 7,
            pointerType: "mouse",
            button: 0,
            clientX: 300,
        });
        slider.dispatchEvent({ type: "change" });

        expect(intents).toEqual([
            { type: "mediaSeekTime", value: 50, finalize: false },
            { type: "mediaSeekTime", value: 50, finalize: true },
        ]);
    });

    it("updates playback controls without rerunning structural preview work", () => {
        const panelElement = new FakePanel();
        const stage = new FakeElement("div");
        const image = new FakeElement("img");
        const status = new FakeElement("span");
        const elapsed = new FakeElement("span");
        const slider = new FakeRangeInput();
        stage.getBoundingClientRect = vi.fn(() => ({
            left: 0,
            right: 640,
            top: 0,
            bottom: 360,
            width: 640,
            height: 360,
        }));
        const nodes = new Map([
            ["media-browser-panel", panelElement],
            ["media-browser-stage", stage],
            ["media-browser-image", image],
            ["media-browser-media-status", status],
            ["media-browser-media-elapsed", elapsed],
            ["media-browser-media-timeline", slider],
        ]);

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
            requestAnimationFrame: (callback) => callback(),
        };
        global.document = {
            getElementById(id) {
                return nodes.get(id) || null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        const viewModel = {
            panelTitle: "Mission Media",
            activeItem: {
                id: "image-0",
                kind: "image",
                title: "Image 0",
                assetUrl: "image-0.jpg",
                timeLabel: "Apr 2, 2026",
            },
            playbackModel: {
                showControls: true,
                seekEnabled: true,
                elapsedSeconds: 0,
                durationSeconds: 10,
                statusLabel: "Ready",
            },
            thumbnailItems: [],
        };

        panel.render(viewModel);
        expect(image.src).toBe("image-0.jpg");
        expect(status.textContent).toBe("Ready");
        expect(stage.getBoundingClientRect).toHaveBeenCalled();

        stage.getBoundingClientRect.mockClear();
        panel.render({
            ...viewModel,
            playbackModel: {
                ...viewModel.playbackModel,
                elapsedSeconds: 3,
                statusLabel: "Playing",
            },
        });

        expect(stage.getBoundingClientRect).not.toHaveBeenCalled();
        expect(image.src).toBe("image-0.jpg");
        expect(status.textContent).toBe("Playing");
        expect(elapsed.textContent).toBe("00:03 / 00:10");
        expect(slider.value).toBe("3");
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

    it("does not reload a native video source that is already attached for playback", () => {
        const panelElement = new FakePanel();
        const video = new FakeElement("video");
        video.src = "https://media.example/clip.mp4";
        video.load = vi.fn();
        video.pause = vi.fn();

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-video") return video;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        panel.render({
            activeItem: {
                id: "clip.mp4",
                kind: "videoClip",
                title: "Crew clip",
                videoAssetUrl: "https://media.example/clip.mp4",
                sourceType: "mp4",
            },
        });

        expect(video.load).not.toHaveBeenCalled();
        expect(video.src).toBe("https://media.example/clip.mp4");
        expect(video.dataset).toEqual(expect.objectContaining({
            mediaItemId: "clip.mp4",
            mediaSourceUrl: "https://media.example/clip.mp4",
            sourceType: "mp4",
        }));
        expect(video.hidden).toBe(false);
    });

    it("keeps media filters collapsed until the filter button opens the drawer", () => {
        const panelElement = new FakePanel();
        panelElement.offsetHeight = 520;
        const filterToggle = new FakeElement("button");
        const filterDrawer = new FakeElement("div");
        filterDrawer.hidden = true;
        filterDrawer.clientHeight = 120;
        const filterBar = new FakeElement("div");
        const search = new FakeElement("input");
        const summary = new FakeElement("div");

        global.window = {
            innerWidth: 1280,
            innerHeight: 800,
        };
        global.document = {
            createElement: (tagName) => new FakeElement(tagName),
            createElementNS: (_namespace, tagName) => new FakeElement(tagName),
            getElementById(id) {
                if (id === "media-browser-panel") return panelElement;
                if (id === "media-browser-filter-toggle") return filterToggle;
                if (id === "media-browser-filter-drawer") return filterDrawer;
                if (id === "media-browser-filter-bar") return filterBar;
                if (id === "media-browser-search") return search;
                if (id === "media-browser-filter-summary") return summary;
                return null;
            },
            addEventListener() {},
            dispatchEvent() {},
        };

        const panel = createMediaBrowserPanelActions();
        panel.render({
            filterModel: {
                totalCount: 4,
                matchCount: 2,
                matchKindCounts: { image: 2, audioClip: 0, videoClip: 0 },
                kindPillOptions: [
                    { id: "all", label: "All", count: 4, active: false },
                    { id: "image", label: "Images", count: 2, active: true },
                ],
                subjectOptions: [
                    { id: "all", label: "All", count: 2, active: true },
                ],
                cameraButtonOptions: [
                    { id: "all", label: "All", count: 2, active: true },
                ],
            },
        });

        expect(filterDrawer.hidden).toBe(true);
        expect(filterToggle.textContent).toBe("Filters 1");
        expect(filterToggle.attributes["aria-expanded"]).toBe("false");
        expect(summary.textContent).toContain("2 of 4 media files");
        expect(filterToggle.listeners.get("click")?.length).toBe(1);

        panelElement.classList.remove("media-browser-panel--hidden");
        filterToggle.dispatchEvent({ type: "click" });

        expect(filterDrawer.hidden).toBe(false);
        expect(filterToggle.attributes["aria-expanded"]).toBe("true");
        expect(filterDrawer.style.getPropertyValue("maxHeight")).toBe("");
        expect(filterDrawer.style.maxHeight).toBeTruthy();
    });
});
