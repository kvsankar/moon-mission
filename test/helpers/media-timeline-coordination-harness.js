import { vi } from "vitest";

export async function flushPromises(count = 1) {
    for (let index = 0; index < count; index += 1) {
        await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
}

export function createDocumentStub() {
    return {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        getElementById: vi.fn(() => null),
    };
}

export function createMissionConfig({ mediaEnabled } = {}) {
    return {
        mission_name: "Test Mission",
        ui: {
            panels: {
                defaults: {
                    "workflow:media-browser": {
                        enabled: mediaEnabled,
                        defaultState: "closed",
                    },
                },
            },
        },
    };
}

export function createAudioMock() {
    const instances = [];
    class FakeAudio {
        constructor(src) {
            this.src = src;
            this.currentTime = 0;
            this.volume = 1;
            this.ended = false;
            this.listeners = new Map();
            this.play = vi.fn(() => Promise.resolve());
            this.pause = vi.fn();
            instances.push(this);
        }

        addEventListener(type, handler) {
            const handlers = this.listeners.get(type) || [];
            handlers.push(handler);
            this.listeners.set(type, handlers);
        }

        emit(type) {
            for (const handler of this.listeners.get(type) || []) {
                handler();
            }
        }
    }
    return {
        AudioMock: vi.fn(function (src) { return new FakeAudio(src); }),
        instances,
    };
}

let originalDocument;
let originalEvent;
let originalHtmlInputElement;
let originalWindow;
let originalAudio;
let originalHls;

export function setupMediaTimelineTest(mocks) {
    originalDocument = globalThis.document;
    originalEvent = globalThis.Event;
    originalHtmlInputElement = globalThis.HTMLInputElement;
    originalWindow = globalThis.window;
    originalAudio = globalThis.Audio;
    originalHls = globalThis.Hls;
    globalThis.document = createDocumentStub();
    mocks.getMissionMediaDataPath.mockReset();
    mocks.getMissionMediaDataPath.mockReturnValue("assets/artemis2/data/");
    mocks.loadMissionMediaManifest.mockReset();
    mocks.panelRender.mockReset();
    mocks.panelSetMissionContext.mockReset();
    mocks.panelSetPanelState.mockReset();
    mocks.panelIntentHandler = null;
}

export function restoreMediaTimelineTest() {
    vi.useRealTimers();
    globalThis.document = originalDocument;
    globalThis.Event = originalEvent;
    globalThis.HTMLInputElement = originalHtmlInputElement;
    globalThis.window = originalWindow;
    globalThis.Audio = originalAudio;
    globalThis.Hls = originalHls;
}
