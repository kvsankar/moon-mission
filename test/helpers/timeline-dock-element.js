export class FakeElement {
    constructor(tagName = "div", rect = { width: 720, height: 40 }) {
        this.tagName = tagName;
        this.children = [];
        this.className = "";
        this.style = {};
        this.dataset = {};
        this.attributes = {};
        this.textContent = "";
        this.title = "";
        this.value = "0";
        this.min = "0";
        this.max = "0";
        this.step = "1";
        this._innerHTML = "";
        this.hidden = false;
        this.disabled = false;
        this.parentElement = null;
        this.rect = rect;
        this.listeners = new Map();
        this.classList = {
            add: (...names) => {
                const set = new Set(this.className.split(/\s+/).filter(Boolean));
                for (const name of names) set.add(name);
                this.className = Array.from(set).join(" ");
            },
            remove: (...names) => {
                const set = new Set(this.className.split(/\s+/).filter(Boolean));
                for (const name of names) set.delete(name);
                this.className = Array.from(set).join(" ");
            },
            toggle: (name, enabled) => {
                if (enabled) {
                    this.classList.add(name);
                    return;
                }
                this.classList.remove(name);
            },
            contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name),
        };
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
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
        const handlers = this.listeners.get(event.type) || [];
        handlers.forEach((handler) => handler.call(this, event));
    }

    setPointerCapture(pointerId) {
        this.capturedPointerId = pointerId;
    }

    releasePointerCapture(pointerId) {
        if (this.capturedPointerId === pointerId) {
            delete this.capturedPointerId;
        }
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    getAttribute(name) {
        return this.attributes[name] || "";
    }

    removeAttribute(name) {
        delete this.attributes[name];
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(value) {
        this._innerHTML = value;
        this.children = [];
    }

    getBoundingClientRect() {
        return this.rect;
    }
}
