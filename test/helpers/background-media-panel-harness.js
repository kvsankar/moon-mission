import { vi } from "vitest";

export function installBackgroundPanelDom({ currentTime = 0, paused = true } = {}) {
    const nodes = new Map();
    const makeClassList = () => ({
        toggle: vi.fn(),
        contains: vi.fn(() => false),
        add: vi.fn(),
        remove: vi.fn(),
    });
    const makeNode = (id) => {
        const children = [];
        const listeners = new Map();
        const node = {
            id,
            tagName: String(id || "").toUpperCase(),
            hidden: false,
            textContent: "",
            title: "",
            dataset: {},
            style: {},
            children,
            classList: makeClassList(),
            setAttribute: vi.fn((name, value) => {
                node[name] = String(value);
                if (name.startsWith("data-")) {
                    const dataName = name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
                    node.dataset[dataName] = String(value);
                }
            }),
            removeAttribute: vi.fn((name) => {
                delete node[name];
            }),
            addEventListener: vi.fn((type, handler) => {
                const handlers = listeners.get(type) || [];
                handlers.push(handler);
                listeners.set(type, handlers);
            }),
            dispatchEvent: vi.fn((event) => {
                const handlers = listeners.get(event?.type) || [];
                handlers.forEach((handler) => handler(event));
                return true;
            }),
            focus: vi.fn(),
            scrollIntoView: vi.fn(),
            replaceChildren: vi.fn((...nextChildren) => {
                children.splice(0, children.length);
                nextChildren.forEach((child) => {
                    children.push(child);
                    child.parentNode = node;
                });
            }),
            appendChild: vi.fn((child) => {
                children.push(child);
                child.parentNode = node;
                return child;
            }),
            removeChild: vi.fn((child) => {
                const index = children.indexOf(child);
                if (index >= 0) children.splice(index, 1);
                child.parentNode = null;
                return child;
            }),
            remove: vi.fn(() => {
                node.parentNode?.removeChild?.(node);
            }),
            getAttribute: vi.fn((name) => node[name] ?? null),
            querySelector: vi.fn(() => null),
            querySelectorAll: vi.fn((selector) => {
                if (selector !== 'track[data-background-media-caption-track="true"]') return [];
                return children.filter((child) => child.dataset?.backgroundMediaCaptionTrack === "true");
            }),
            getBoundingClientRect: vi.fn(() => ({ bottom: 80 })),
        };
        return node;
    };
    const video = makeNode("background-media-video");
    let videoCurrentTime = currentTime;
    Object.defineProperty(video, "currentTime", {
        get: () => videoCurrentTime,
        set: (value) => {
            videoCurrentTime = Number(value);
        },
    });
    video.paused = paused;
    video.play = vi.fn(() => {
        video.paused = false;
        return Promise.resolve();
    });
    video.pause = vi.fn(() => {
        video.paused = true;
    });
    video.load = vi.fn();
    video.canPlayType = vi.fn(() => "");
    video.getAttribute = vi.fn((name) => (name === "src" ? video.src || "" : ""));
    video.removeAttribute = vi.fn((name) => {
        delete video[name];
    });
    nodes.set("background-media-video", video);
    [
        "background-media-panel",
        "background-media-panel-wrapper",
        "background-video-status",
        "background-video-status-text",
        "background-media-empty",
        "background-media-live",
        "background-media-time-overlay",
        "background-media-caption-text",
        "background-media-caption-attribution",
        "background-media-transcript",
        "background-media-transcript-status",
        "background-media-transcript-note",
        "background-media-transcript-list",
        "background-media-title",
        "background-media-status",
        "background-media-controls",
        "background-media-enable",
        "background-media-timeline",
        "background-media-mute",
        "background-media-captions",
        "background-media-panel-expand",
        "background-media-panel-close",
    ].forEach((id) => {
        if (!nodes.has(id)) nodes.set(id, makeNode(id));
    });

    globalThis.document = {
        getElementById: vi.fn((id) => nodes.get(id) || null),
        querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ bottom: 80 }) })),
        addEventListener: vi.fn(),
        createElement: vi.fn((tagName) => makeNode(tagName)),
    };
    globalThis.window = {
        innerWidth: 1400,
        innerHeight: 900,
        missionConfig: { dataPath: "assets/artemis2/data/" },
        addEventListener: vi.fn(),
        setTimeout: vi.fn(() => 1),
        clearTimeout: vi.fn(),
    };
    globalThis.fetch = vi.fn();
    const storage = new Map();
    globalThis.localStorage = {
        getItem: vi.fn((key) => storage.get(key) || null),
        setItem: vi.fn((key, value) => storage.set(key, value)),
    };
    return { nodes, video };
}

export function openEnabledBackgroundPanel(actions, nodes) {
    actions.setMissionContext({
        available: true,
        configData: {
            ui: {
                panels: {
                    defaults: {
                        "workflow:background-media": {
                            enabled: true,
                            defaultState: "open",
                        },
                    },
                },
            },
        },
    });
    const [, enablePlayback] = nodes.get("background-media-enable").addEventListener.mock.calls.find(([type]) => type === "click");
    enablePlayback();
}

export function resetBackgroundMediaPanelGlobals() {
    vi.restoreAllMocks();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.fetch;
    delete globalThis.__moonMissionDockviewSpike;
}
