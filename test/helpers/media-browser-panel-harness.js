export class FakeRangeInput {
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

export class FakePanel {
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

export class FakeElement {
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

export function clearMediaBrowserPanelGlobals() {
    delete global.document;
    delete global.CustomEvent;
    delete global.ResizeObserver;
    delete global.window;
}
