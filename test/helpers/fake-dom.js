/**
 * Minimal DOM test double.
 *
 * The repository runs Vitest on the default `node` environment and does not
 * depend on jsdom. Several imperative-shell modules (`ui/ui-state.js`,
 * `ui/lunar-crater-control-panel.js`, `app/panel-*.js`, ...) only need a small
 * slice of the DOM: element lookup by id, simple CSS selectors, class lists,
 * datasets, attributes and event dispatch. This helper implements exactly that
 * slice so those modules can be exercised through their real code paths.
 *
 * Supported selectors: `#id`, `.class`, `tag`, `[attr]`, `[attr="value"]`,
 * `:checked`, compound selectors (`input[name="plane"][value="XY"]:checked`),
 * descendant combinators (`.panel input`) and comma-separated groups.
 */

let nextNodeId = 0;

function parseCompound(text) {
    const compound = {
        tag: null,
        id: null,
        classes: [],
        attrs: [],
        checked: false,
        popoverOpen: false,
    };
    const pattern = /(:[\w-]+)|([#.]?[\w-]+)|(\[[^\]]*\])/g;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        const token = match[0];
        if (token === ":checked") {
            compound.checked = true;
        } else if (token === ":popover-open") {
            compound.popoverOpen = true;
        } else if (token.startsWith(":")) {
            throw new Error(`fake-dom: unsupported pseudo-class ${token}`);
        } else if (token.startsWith("#")) {
            compound.id = token.slice(1);
        } else if (token.startsWith(".")) {
            compound.classes.push(token.slice(1));
        } else if (token.startsWith("[")) {
            const body = token.slice(1, -1);
            const eq = body.indexOf("=");
            if (eq === -1) {
                compound.attrs.push({ name: body.trim(), value: undefined });
            } else {
                const name = body.slice(0, eq).trim();
                const raw = body.slice(eq + 1).trim();
                compound.attrs.push({ name, value: raw.replace(/^["']|["']$/g, "") });
            }
        } else {
            compound.tag = token.toLowerCase();
        }
    }
    return compound;
}

/** Split on a delimiter, ignoring delimiters inside `[...]` or quotes. */
function splitTopLevel(text, delimiters) {
    const parts = [];
    let current = "";
    let depth = 0;
    let quote = null;
    for (const char of String(text)) {
        if (quote) {
            current += char;
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
        }
        if (char === "[") depth += 1;
        if (char === "]") depth -= 1;
        if (depth === 0 && delimiters.includes(char)) {
            parts.push(current);
            current = "";
            continue;
        }
        current += char;
    }
    parts.push(current);
    return parts.map((part) => part.trim()).filter(Boolean);
}

function parseSelector(selector) {
    return splitTopLevel(selector, ",")
        .map((group) => splitTopLevel(group, " \t\n").map(parseCompound));
}

function matchesCompound(node, compound) {
    if (compound.tag && node.tagName.toLowerCase() !== compound.tag) return false;
    if (compound.id && node.id !== compound.id) return false;
    for (const className of compound.classes) {
        if (!node.classList.contains(className)) return false;
    }
    for (const attr of compound.attrs) {
        const actual = node.getAttribute(attr.name);
        if (actual === null) return false;
        if (attr.value !== undefined && String(actual) !== attr.value) return false;
    }
    if (compound.checked && node.checked !== true) return false;
    if (compound.popoverOpen && node.popoverOpen !== true) return false;
    return true;
}

function matchesSequence(node, sequence) {
    if (!matchesCompound(node, sequence[sequence.length - 1])) return false;
    let ancestorIndex = sequence.length - 2;
    let current = node.parentNode;
    while (ancestorIndex >= 0) {
        if (!current) return false;
        if (matchesCompound(current, sequence[ancestorIndex])) {
            ancestorIndex -= 1;
        }
        current = current.parentNode;
    }
    return true;
}

class FakeClassList {
    constructor(node) {
        this.node = node;
        this.tokens = new Set();
    }

    add(...names) {
        names.filter(Boolean).forEach((name) => this.tokens.add(name));
    }

    remove(...names) {
        names.forEach((name) => this.tokens.delete(name));
    }

    contains(name) {
        return this.tokens.has(name);
    }

    toggle(name, force) {
        const shouldAdd = force === undefined ? !this.tokens.has(name) : !!force;
        if (shouldAdd) this.tokens.add(name);
        else this.tokens.delete(name);
        return shouldAdd;
    }

    get value() {
        return [...this.tokens].join(" ");
    }

    toString() {
        return this.value;
    }
}

export class FakeEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.bubbles = !!options.bubbles;
        this.cancelable = !!options.cancelable;
        this.detail = options.detail;
        this.defaultPrevented = false;
        this.propagationStopped = false;
        this.target = null;
        this.currentTarget = null;
    }

    preventDefault() {
        this.defaultPrevented = true;
    }

    stopPropagation() {
        this.propagationStopped = true;
    }
}

export class FakeCustomEvent extends FakeEvent {}

export class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = String(tagName || "div").toUpperCase();
        this.ownerDocument = ownerDocument || null;
        this.__nodeKey = `node-${nextNodeId += 1}`;
        this.children = [];
        this.parentNode = null;
        this.attributes = new Map();
        this.dataset = createDatasetProxy(this);
        this.style = createStyleProxy();
        this.classList = new FakeClassList(this);
        this.listeners = new Map();
        this.id = "";
        this.hidden = false;
        this.disabled = false;
        this.checked = false;
        this.value = "";
        this.textContent = "";
        this.scrollTop = 0;
        this.scrollLeft = 0;
        this.clientWidth = 0;
        this.clientHeight = 0;
        this.popoverOpen = false;
        this.nodeType = 1;
    }

    get className() {
        return this.classList.value;
    }

    set className(value) {
        this.classList.tokens = new Set(String(value || "").split(/\s+/).filter(Boolean));
    }

    get childNodes() {
        return this.children;
    }

    get parentElement() {
        return this.parentNode;
    }

    get firstChild() {
        return this.children[0] || null;
    }

    get lastChild() {
        return this.children[this.children.length - 1] || null;
    }

    get isConnected() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node === this.ownerDocument?.documentElement || node.__isDocumentRoot === true;
    }

    appendChild(child) {
        if (!child) return child;
        child.remove?.();
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    append(...nodes) {
        nodes.forEach((node) => this.appendChild(node));
    }

    prepend(...nodes) {
        nodes.slice().reverse().forEach((node) => this.insertBefore(node, this.children[0] || null));
    }

    insertBefore(child, reference) {
        if (!reference) return this.appendChild(child);
        const index = this.children.indexOf(reference);
        if (index === -1) return this.appendChild(child);
        child.remove?.();
        child.parentNode = this;
        this.children.splice(index, 0, child);
        return child;
    }

    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index === -1) return child;
        this.children.splice(index, 1);
        child.parentNode = null;
        return child;
    }

    remove() {
        this.parentNode?.removeChild(this);
    }

    replaceChildren(...nodes) {
        this.children.slice().forEach((child) => this.removeChild(child));
        nodes.forEach((node) => this.appendChild(node));
    }

    get innerHTML() {
        return this.__innerHTML || "";
    }

    set innerHTML(value) {
        this.__innerHTML = String(value ?? "");
        if (this.__innerHTML === "") {
            this.children.slice().forEach((child) => this.removeChild(child));
        }
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === "id") this.id = String(value);
        if (name === "class") this.className = String(value);
        if (name === "value") this.value = String(value);
    }

    getAttribute(name) {
        if (name === "id") return this.id || null;
        if (name === "class") return this.className || null;
        if (name === "name" && this.attributes.has("name")) return this.attributes.get("name");
        if (name === "value" && !this.attributes.has("value")) {
            return this.value === "" ? null : String(this.value);
        }
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    hasAttribute(name) {
        return this.getAttribute(name) !== null;
    }

    /**
     * Needed by test-runner element serializers, which recognise these nodes as
     * DOM elements once `Element` is installed as a global.
     */
    getAttributeNames() {
        const names = new Set(this.attributes.keys());
        if (this.id) names.add("id");
        if (this.classList.tokens.size > 0) names.add("class");
        return [...names];
    }

    removeAttribute(name) {
        this.attributes.delete(name);
        if (name === "id") this.id = "";
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const groups = parseSelector(selector);
        const found = [];
        walk(this, (node) => {
            if (node === this) return;
            if (groups.some((sequence) => matchesSequence(node, sequence))) {
                found.push(node);
            }
        });
        return found;
    }

    closest(selector) {
        const groups = parseSelector(selector);
        let node = this;
        while (node) {
            if (groups.some((sequence) => matchesCompound(node, sequence[sequence.length - 1]))) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    matches(selector) {
        return parseSelector(selector).some((sequence) => matchesSequence(this, sequence));
    }

    contains(node) {
        let current = node;
        while (current) {
            if (current === this) return true;
            current = current.parentNode;
        }
        return false;
    }

    addEventListener(type, handler) {
        if (typeof handler !== "function") return;
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(handler);
    }

    removeEventListener(type, handler) {
        this.listeners.get(type)?.delete(handler);
    }

    dispatchEvent(event) {
        let node = this;
        event.target = this;
        while (node) {
            event.currentTarget = node;
            const handlers = node.listeners?.get(event.type);
            if (handlers) {
                [...handlers].forEach((handler) => handler.call(node, event));
            }
            if (!event.bubbles || event.propagationStopped) break;
            node = node.parentNode;
        }
        return !event.defaultPrevented;
    }

    attachShadow() {
        if (!this.shadowRoot) {
            this.shadowRoot = new FakeElement("#shadow-root", this.ownerDocument);
            this.shadowRoot.host = this;
        }
        return this.shadowRoot;
    }

    getBoundingClientRect() {
        return this.__rect || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    }

    /** Test-only: fix the rectangle `getBoundingClientRect` reports. */
    setBoundingClientRect({ left = 0, top = 0, width = 0, height = 0 }) {
        this.__rect = {
            left, top, width, height,
            right: left + width,
            bottom: top + height,
            x: left,
            y: top,
        };
        return this;
    }

    focus() {
        if (this.ownerDocument) this.ownerDocument.activeElement = this;
    }

    blur() {
        if (this.ownerDocument?.activeElement === this) {
            this.ownerDocument.activeElement = this.ownerDocument.body;
        }
    }

    click() {
        this.dispatchEvent(new FakeEvent("click", { bubbles: true }));
    }

    showPopover() {
        if (this.popoverOpen) return;
        this.popoverOpen = true;
        const event = new FakeEvent("toggle");
        event.oldState = "closed";
        event.newState = "open";
        this.dispatchEvent(event);
    }

    hidePopover() {
        if (!this.popoverOpen) return;
        this.popoverOpen = false;
        const event = new FakeEvent("toggle");
        event.oldState = "open";
        event.newState = "closed";
        this.dispatchEvent(event);
    }
}

/**
 * Tag-specific subclasses so `instanceof HTMLInputElement`-style guards in the
 * imperative shell keep distinguishing element kinds.
 */
export class FakeHTMLInputElement extends FakeElement {}
export class FakeHTMLButtonElement extends FakeElement {}
export class FakeHTMLSelectElement extends FakeElement {}
export class FakeHTMLTextAreaElement extends FakeElement {}
export class FakeHTMLCanvasElement extends FakeElement {}
export class FakeHTMLImageElement extends FakeElement {}
export class FakeHTMLAnchorElement extends FakeElement {}

const ELEMENT_CONSTRUCTOR_GLOBALS = Object.freeze([
    "HTMLInputElement",
    "HTMLButtonElement",
    "HTMLSelectElement",
    "HTMLTextAreaElement",
    "HTMLCanvasElement",
    "HTMLImageElement",
    "HTMLAnchorElement",
]);

const ELEMENT_CLASS_BY_TAG = {
    INPUT: FakeHTMLInputElement,
    BUTTON: FakeHTMLButtonElement,
    SELECT: FakeHTMLSelectElement,
    TEXTAREA: FakeHTMLTextAreaElement,
    CANVAS: FakeHTMLCanvasElement,
    IMG: FakeHTMLImageElement,
    A: FakeHTMLAnchorElement,
};

function toCamelCase(name) {
    return String(name).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toDataAttributeName(key) {
    return `data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** `dataset` is a live view over the element's `data-*` attributes, as in the DOM. */
function createDatasetProxy(element) {
    return new Proxy({}, {
        get(_target, key) {
            if (typeof key !== "string") return undefined;
            const value = element.attributes.get(toDataAttributeName(key));
            return value === undefined ? undefined : value;
        },
        set(_target, key, value) {
            element.attributes.set(toDataAttributeName(key), String(value));
            return true;
        },
        has(_target, key) {
            return element.attributes.has(toDataAttributeName(key));
        },
        deleteProperty(_target, key) {
            element.attributes.delete(toDataAttributeName(key));
            return true;
        },
        ownKeys() {
            return [...element.attributes.keys()]
                .filter((name) => name.startsWith("data-"))
                .map((name) => toCamelCase(name.slice(5)));
        },
        getOwnPropertyDescriptor(_target, key) {
            if (!element.attributes.has(toDataAttributeName(key))) return undefined;
            return { configurable: true, enumerable: true, value: element.attributes.get(toDataAttributeName(key)) };
        },
    });
}

function createStyleProxy() {
    const properties = new Map();
    const style = {
        setProperty(name, value) {
            properties.set(name, value);
        },
        getPropertyValue(name) {
            return properties.get(name) ?? "";
        },
        removeProperty(name) {
            properties.delete(name);
        },
    };
    return style;
}

function walk(root, visit) {
    visit(root);
    root.children?.forEach((child) => walk(child, visit));
}

class FakeGradient {
    constructor(kind, args) {
        this.kind = kind;
        this.args = args;
        this.stops = [];
    }

    addColorStop(offset, color) {
        this.stops.push({ offset, color });
    }
}

/**
 * A recording 2D context. Renderers here paint textures procedurally, so the
 * calls are what matters, not the rasterized pixels.
 */
export class FakeCanvasContext2D {
    constructor(canvas) {
        this.canvas = canvas;
        this.calls = [];
        this.gradients = [];
        this.fillStyle = "#000";
        this.strokeStyle = "#000";
        this.lineWidth = 1;
        this.font = "10px sans-serif";
        this.textAlign = "start";
        this.textBaseline = "alphabetic";
        this.globalAlpha = 1;
        this.globalCompositeOperation = "source-over";
        this.imageDataWrites = [];
        for (const name of [
            "save", "restore", "beginPath", "closePath", "fill", "stroke", "clip",
            "moveTo", "lineTo", "arc", "arcTo", "ellipse", "rect", "quadraticCurveTo",
            "bezierCurveTo", "fillRect", "strokeRect", "clearRect", "fillText",
            "strokeText", "translate", "rotate", "scale", "setTransform",
            "resetTransform", "transform", "setLineDash", "drawImage",
        ]) {
            this[name] = (...args) => {
                this.calls.push([name, args]);
            };
        }
    }

    createRadialGradient(...args) {
        const gradient = new FakeGradient("radial", args);
        this.gradients.push(gradient);
        return gradient;
    }

    createLinearGradient(...args) {
        const gradient = new FakeGradient("linear", args);
        this.gradients.push(gradient);
        return gradient;
    }

    createPattern() {
        return null;
    }

    measureText(text) {
        // Roughly proportional to a 10px monospace glyph box.
        return { width: String(text ?? "").length * 6 };
    }

    createImageData(width, height) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    }

    getImageData(x, y, width, height) {
        return this.createImageData(width, height);
    }

    putImageData(imageData, x, y) {
        this.imageDataWrites.push({ imageData, x, y });
        this.calls.push(["putImageData", [imageData, x, y]]);
    }
}

export class FakeDocument {
    constructor() {
        this.__isDocumentRoot = true;
        this.listeners = new Map();
        this.documentElement = new FakeElement("html", this);
        this.documentElement.__isDocumentRoot = true;
        this.body = new FakeElement("body", this);
        this.head = new FakeElement("head", this);
        this.documentElement.appendChild(this.head);
        this.documentElement.appendChild(this.body);
        this.activeElement = this.body;
        this.hidden = false;
        this.visibilityState = "visible";
    }

    createElement(tagName) {
        const normalized = String(tagName || "div").toUpperCase();
        const ElementClass = ELEMENT_CLASS_BY_TAG[normalized] || FakeElement;
        const element = new ElementClass(tagName, this);
        if (element.tagName === "CANVAS") {
            element.width = 300;
            element.height = 150;
            element.getContext = (kind) => {
                if (kind !== "2d") return null;
                element.__context2d ||= new FakeCanvasContext2D(element);
                return element.__context2d;
            };
            element.toDataURL = () => "data:image/png;base64,";
        }
        return element;
    }

    /** Three.js creates its canvases and images through the namespaced API. */
    createElementNS(_namespace, tagName) {
        return this.createElement(tagName);
    }

    createDocumentFragment() {
        return new FakeElement("fragment", this);
    }

    createTextNode(text) {
        const node = new FakeElement("#text", this);
        node.textContent = String(text ?? "");
        return node;
    }

    getElementById(id) {
        if (!id) return null;
        let found = null;
        walk(this.documentElement, (node) => {
            if (!found && node.id === id) found = node;
        });
        return found;
    }

    querySelector(selector) {
        return this.documentElement.querySelector(selector);
    }

    querySelectorAll(selector) {
        return this.documentElement.querySelectorAll(selector);
    }

    addEventListener(type, handler) {
        if (typeof handler !== "function") return;
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(handler);
    }

    removeEventListener(type, handler) {
        this.listeners.get(type)?.delete(handler);
    }

    dispatchEvent(event) {
        event.target = event.target || this;
        event.currentTarget = this;
        const handlers = this.listeners.get(event.type);
        if (handlers) {
            [...handlers].forEach((handler) => handler.call(this, event));
        }
        return !event.defaultPrevented;
    }
}

/**
 * Build a document populated from a compact element description list.
 *
 * Each entry is `{ id, tag, parent, ...props }`; `props` are assigned directly
 * so `checked`, `value`, `hidden`, `name` and `className` all work.
 */
export function createFakeDocument(descriptors = []) {
    const documentRef = new FakeDocument();
    for (const descriptor of descriptors) {
        const { id, tag = "div", parent = null, attrs = null, ...props } = descriptor;
        const element = documentRef.createElement(tag);
        if (id) element.id = id;
        Object.assign(element, props);
        if (attrs) {
            Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
        }
        if (props.name !== undefined) element.setAttribute("name", props.name);
        const parentNode = parent ? documentRef.getElementById(parent) : documentRef.body;
        (parentNode || documentRef.body).appendChild(element);
    }
    return documentRef;
}

/**
 * Records observed elements so tests can fire a resize deliberately rather than
 * waiting on layout.
 */
export class FakeResizeObserver {
    static instances = [];

    constructor(callback) {
        this.callback = callback;
        this.observed = [];
        FakeResizeObserver.instances.push(this);
    }

    observe(target) {
        this.observed.push(target);
    }

    unobserve(target) {
        this.observed = this.observed.filter((entry) => entry !== target);
    }

    disconnect() {
        this.observed = [];
    }

    trigger() {
        this.callback(this.observed.map((target) => ({ target })));
    }
}

/** An in-memory `Storage` good enough for persistence round-trips. */
export function createMemoryStorage(initial = {}) {
    const entries = new Map(Object.entries(initial));
    return {
        get length() {
            return entries.size;
        },
        key: (index) => [...entries.keys()][index] ?? null,
        getItem: (key) => (entries.has(String(key)) ? entries.get(String(key)) : null),
        setItem: (key, value) => entries.set(String(key), String(value)),
        removeItem: (key) => entries.delete(String(key)),
        clear: () => entries.clear(),
    };
}

/**
 * Install a fake document/window pair as globals and return a teardown handle.
 */
export function installFakeDom(descriptors = [], windowOverrides = {}) {
    const documentRef = createFakeDocument(descriptors);
    const previous = {
        document: globalThis.document,
        window: globalThis.window,
        CustomEvent: globalThis.CustomEvent,
        Event: globalThis.Event,
        Element: globalThis.Element,
        HTMLElement: globalThis.HTMLElement,
        Node: globalThis.Node,
        elementConstructors: Object.fromEntries(
            ELEMENT_CONSTRUCTOR_GLOBALS.map((name) => [name, globalThis[name]]),
        ),
        getComputedStyle: globalThis.getComputedStyle,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        cancelAnimationFrame: globalThis.cancelAnimationFrame,
        ResizeObserver: globalThis.ResizeObserver,
        localStorage: globalThis.localStorage,
        hadDocument: "document" in globalThis,
        hadWindow: "window" in globalThis,
        hadLocalStorage: "localStorage" in globalThis,
    };
    const windowRef = {
        document: documentRef,
        innerWidth: 1280,
        innerHeight: 720,
        devicePixelRatio: 1,
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        requestAnimationFrame: (callback) => setTimeout(() => callback(0), 0),
        cancelAnimationFrame: (handle) => clearTimeout(handle),
        addEventListener() {},
        removeEventListener() {},
        getComputedStyle: () => ({ getPropertyValue: () => "" }),
        Element: FakeElement,
        HTMLElement: FakeElement,
        Node: FakeElement,
        HTMLInputElement: FakeHTMLInputElement,
        HTMLButtonElement: FakeHTMLButtonElement,
        HTMLSelectElement: FakeHTMLSelectElement,
        HTMLTextAreaElement: FakeHTMLTextAreaElement,
        HTMLCanvasElement: FakeHTMLCanvasElement,
        HTMLImageElement: FakeHTMLImageElement,
        HTMLAnchorElement: FakeHTMLAnchorElement,
        ...windowOverrides,
    };
    documentRef.defaultView = windowRef;
    globalThis.document = documentRef;
    globalThis.window = windowRef;
    globalThis.CustomEvent = FakeCustomEvent;
    globalThis.Event = FakeEvent;
    // `ui/dom-helpers.js` narrows values with `instanceof Element`, so the
    // constructor has to be reachable as a global for those guards to pass.
    globalThis.Element = FakeElement;
    globalThis.HTMLElement = FakeElement;
    globalThis.Node = FakeElement;
    for (const name of ELEMENT_CONSTRUCTOR_GLOBALS) {
        globalThis[name] = windowRef[name];
    }
    // Modules reach for these as bare globals as well as through `window`.
    globalThis.getComputedStyle = windowRef.getComputedStyle;
    globalThis.requestAnimationFrame = windowRef.requestAnimationFrame;
    globalThis.cancelAnimationFrame = windowRef.cancelAnimationFrame;
    if (windowRef.ResizeObserver) globalThis.ResizeObserver = windowRef.ResizeObserver;
    globalThis.localStorage = windowRef.localStorage || createMemoryStorage();
    windowRef.localStorage = globalThis.localStorage;
    return {
        document: documentRef,
        window: windowRef,
        restore() {
            if (previous.hadDocument) globalThis.document = previous.document;
            else delete globalThis.document;
            if (previous.hadWindow) globalThis.window = previous.window;
            else delete globalThis.window;
            globalThis.CustomEvent = previous.CustomEvent;
            globalThis.Event = previous.Event;
            globalThis.Element = previous.Element;
            globalThis.HTMLElement = previous.HTMLElement;
            globalThis.Node = previous.Node;
            for (const name of ELEMENT_CONSTRUCTOR_GLOBALS) {
                globalThis[name] = previous.elementConstructors[name];
            }
            globalThis.getComputedStyle = previous.getComputedStyle;
            globalThis.requestAnimationFrame = previous.requestAnimationFrame;
            globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
            globalThis.ResizeObserver = previous.ResizeObserver;
            if (previous.hadLocalStorage) globalThis.localStorage = previous.localStorage;
            else delete globalThis.localStorage;
        },
    };
}
