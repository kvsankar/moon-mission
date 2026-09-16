import { afterEach, describe, expect, it, vi } from "vitest";

import {
    createBackgroundMediaPanelActions,
    resolveActiveBackgroundItem,
    resolveBackgroundPlaybackButtonState,
    resolveBackgroundCandidates,
    resolveBackgroundPlaybackMode,
    resolveNearestInactiveBackgroundItem,
    shouldUseBackgroundTransportPlayback,
} from "../src/platform/js/app/background-media-panel.js";

describe("background media panel helpers", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete globalThis.document;
        delete globalThis.window;
        delete globalThis.localStorage;
        delete globalThis.fetch;
    });

    function installBackgroundPanelDom({ currentTime = 0, paused = true } = {}) {
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

    function openEnabledBackgroundPanel(actions, nodes) {
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

    it("selects the highest-priority background video active at mission time", () => {
        const timeMs = Date.parse("2026-04-06T18:00:00Z");
        const items = [
            {
                id: "image",
                kind: "image",
                playbackRoles: ["background"],
                assetUrl: "image.jpg",
                startTimeMs: timeMs - 1000,
                endTimeMs: timeMs + 1000,
            },
            {
                id: "low-priority",
                kind: "videoClip",
                playbackRoles: ["background"],
                assetUrl: "low.mp4",
                startTimeMs: timeMs - 1000,
                endTimeMs: timeMs + 1000,
                backgroundPlayback: {
                    enabled: true,
                    priority: 1,
                },
            },
            {
                id: "high-priority",
                kind: "videoClip",
                playbackRoles: ["background"],
                assetUrl: "high.mp4",
                startTimeMs: timeMs - 1000,
                endTimeMs: timeMs + 1000,
                backgroundPlayback: {
                    enabled: true,
                    priority: 10,
                },
            },
        ];

        expect(resolveBackgroundCandidates(items).map((item) => item.id)).toEqual([
            "high-priority",
            "low-priority",
        ]);
        expect(resolveActiveBackgroundItem(items, timeMs)?.id).toBe("high-priority");
    });

    it("reuses resolved background candidates for the same items reference", () => {
        const timeMs = Date.parse("2026-04-06T18:00:00Z");
        const items = [{
            id: "broadcast",
            kind: "videoClip",
            playbackRoles: ["background"],
            assetUrl: "broadcast.mp4",
            startTimeMs: timeMs - 1000,
            endTimeMs: timeMs + 1000,
            backgroundPlayback: {
                enabled: true,
            },
        }];

        const firstCandidates = resolveBackgroundCandidates(items);
        expect(resolveBackgroundCandidates(items)).toBe(firstCandidates);
    });

    it("ignores background videos outside their authored time range", () => {
        const timeMs = Date.parse("2026-04-06T18:00:00Z");
        const items = [
            {
                id: "future",
                kind: "videoClip",
                playbackRoles: ["background"],
                assetUrl: "future.mp4",
                startTimeMs: timeMs + 1000,
                endTimeMs: timeMs + 5000,
            },
        ];

        expect(resolveActiveBackgroundItem(items, timeMs)).toBeNull();
    });

    it("finds the next or most recently ended video for out-of-range status", () => {
        const timeMs = Date.parse("2026-04-06T18:00:00Z");
        const items = [
            {
                id: "past",
                kind: "videoClip",
                playbackRoles: ["background"],
                assetUrl: "past.mp4",
                startTimeMs: timeMs - 10000,
                endTimeMs: timeMs - 5000,
            },
            {
                id: "future",
                kind: "videoClip",
                playbackRoles: ["background"],
                assetUrl: "future.mp4",
                startTimeMs: timeMs + 1000,
                endTimeMs: timeMs + 5000,
            },
        ];

        expect(resolveNearestInactiveBackgroundItem(items, timeMs)).toEqual(expect.objectContaining({
            item: expect.objectContaining({ id: "future" }),
            relation: "before",
            deltaMs: 1000,
        }));
        expect(resolveNearestInactiveBackgroundItem(items, timeMs + 10000)).toEqual(expect.objectContaining({
            item: expect.objectContaining({ id: "future" }),
            relation: "after",
            deltaMs: 5000,
        }));
    });

    it("runs only with animation and mutes while foreground audio is active", () => {
        expect(resolveBackgroundPlaybackMode({
            panelState: "open",
            playbackEnabled: true,
            animationRunning: true,
            foregroundMediaActive: true,
            foregroundMediaKind: "audioClip",
        })).toBe("muted-for-foreground");

        expect(resolveBackgroundPlaybackMode({
            panelState: "open",
            playbackEnabled: true,
            animationRunning: true,
            foregroundMediaActive: true,
            foregroundMediaKind: "",
        })).toBe("muted-for-foreground");

        expect(resolveBackgroundPlaybackMode({
            panelState: "open",
            playbackEnabled: true,
            animationRunning: false,
            foregroundMediaActive: false,
        })).toBe("ready");

        expect(resolveBackgroundPlaybackMode({
            panelState: "open",
            playbackEnabled: true,
            animationRunning: true,
            foregroundMediaActive: false,
        })).toBe("playing");
    });

    it("pauses broadcast playback while a foreground video is active", () => {
        expect(resolveBackgroundPlaybackMode({
            panelState: "open",
            playbackEnabled: true,
            animationRunning: true,
            foregroundMediaActive: true,
            foregroundMediaKind: "videoClip",
        })).toBe("paused-for-foreground-video");
    });

    it("uses frame preview instead of transport playback above the background rate limit", () => {
        expect(shouldUseBackgroundTransportPlayback({
            animationRealtime: false,
            animationSpeedMultiplier: 4,
        })).toBe(true);
        expect(shouldUseBackgroundTransportPlayback({
            animationRealtime: false,
            animationSpeedMultiplier: 60,
        })).toBe(false);
    });

    it("labels the broadcast transport by enabled and animation state", () => {
        expect(resolveBackgroundPlaybackButtonState({
            playbackEnabled: false,
            animationRunning: false,
        })).toEqual(expect.objectContaining({
            label: "▶",
            pressed: false,
        }));

        expect(resolveBackgroundPlaybackButtonState({
            playbackEnabled: true,
            animationRunning: false,
        })).toEqual(expect.objectContaining({
            label: "▶",
            pressed: true,
        }));

        expect(resolveBackgroundPlaybackButtonState({
            playbackEnabled: true,
            animationRunning: true,
        })).toEqual(expect.objectContaining({
            label: "⏸",
            pressed: true,
        }));
    });

    it("does not hard-seek on every transport render while local playback is close to mission time", () => {
        const nodes = new Map();
        const makeClassList = () => ({
            toggle: vi.fn(),
            contains: vi.fn(() => false),
        });
        const makeNode = (id) => ({
            id,
            hidden: false,
            textContent: "",
            title: "",
            dataset: {},
            style: {},
            classList: makeClassList(),
            setAttribute: vi.fn(),
            addEventListener: vi.fn(),
            focus: vi.fn(),
            replaceChildren: vi.fn(),
            appendChild: vi.fn(),
            querySelector: vi.fn(() => null),
            getBoundingClientRect: vi.fn(() => ({ bottom: 80 })),
        });
        const video = makeNode("background-media-video");
        let currentTime = 10;
        let currentTimeWrites = 0;
        Object.defineProperty(video, "currentTime", {
            get: () => currentTime,
            set: (value) => {
                currentTimeWrites += 1;
                currentTime = Number(value);
            },
        });
        video.paused = false;
        video.play = vi.fn(() => Promise.resolve());
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
        const storage = new Map();
        globalThis.localStorage = {
            getItem: vi.fn((key) => storage.get(key) || null),
            setItem: vi.fn((key, value) => storage.set(key, value)),
        };

        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
        });
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
        actions.render({
            items: [{
                id: "broadcast",
                kind: "videoClip",
                enabled: true,
                assetUrl: "broadcast.mp4",
                playbackRoles: ["background"],
                startTimeMs,
                endTimeMs: startTimeMs + 600000,
                backgroundPlayback: {
                    enabled: true,
                },
            }],
            timeMs: startTimeMs + 10000,
            animationRunning: true,
        });

        currentTimeWrites = 0;
        currentTime = 10.4;
        actions.render({
            items: [{
                id: "broadcast",
                kind: "videoClip",
                enabled: true,
                assetUrl: "broadcast.mp4",
                playbackRoles: ["background"],
                startTimeMs,
                endTimeMs: startTimeMs + 600000,
                backgroundPlayback: {
                    enabled: true,
                },
            }],
            timeMs: startTimeMs + 11000,
            animationRunning: true,
        });

        expect(currentTimeWrites).toBe(0);
        expect(video.load).toHaveBeenCalledTimes(1);
    });

    it("corrects broadcast drift even when the target is close to the previous seek", () => {
        const { nodes, video } = installBackgroundPanelDom({ currentTime: 0, paused: false });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);
        const item = {
            id: "broadcast",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast.mp4",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
            },
        };

        actions.render({
            items: [item],
            timeMs: startTimeMs + 10000,
            animationRunning: true,
        });
        expect(video.currentTime).toBe(10);

        video.currentTime = 45;
        actions.render({
            items: [item],
            timeMs: startTimeMs + 10000,
            animationRunning: true,
        });

        expect(video.currentTime).toBe(10);
    });

    it("keeps an in-range broadcast source attached while animation is paused", () => {
        const { nodes, video } = installBackgroundPanelDom({ currentTime: 0, paused: false });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => false,
            getAnimationRealtime: () => true,
            getMissionStartTime: () => startTimeMs,
        });
        openEnabledBackgroundPanel(actions, nodes);

        actions.render({
            items: [{
                id: "broadcast",
                kind: "videoClip",
                enabled: true,
                assetUrl: "broadcast.mp4",
                playbackRoles: ["background"],
                startTimeMs,
                endTimeMs: startTimeMs + 600000,
                backgroundPlayback: {
                    enabled: true,
                    muted: false,
                },
            }],
            timeMs: startTimeMs + 12000,
            animationRunning: false,
        });

        expect(video.pause).toHaveBeenCalled();
        expect(video.load).toHaveBeenCalledTimes(1);
        expect(video.src).toBe("broadcast.mp4");
        expect(video.currentTime).toBe(12);
        expect(nodes.get("background-media-status").textContent).toContain("Paused");
        expect(nodes.get("background-media-controls").hidden).toBe(false);
        expect(nodes.get("background-media-time-overlay").hidden).toBe(false);
        expect(nodes.get("background-media-time-overlay").textContent).toBe("0:12\nMET +0d 00h 00m");
        expect(nodes.get("background-media-timeline").value).toBe("12");
    });

    it("renders caption attribution without enabling native browser subtitle tracks", () => {
        const { nodes, video } = installBackgroundPanelDom();
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => false,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);

        actions.render({
            items: [{
                id: "broadcast",
                kind: "videoClip",
                enabled: true,
                assetUrl: "broadcast.mp4",
                playbackRoles: ["background"],
                startTimeMs,
                endTimeMs: startTimeMs + 600000,
                backgroundPlayback: {
                    enabled: true,
                },
                captionTracks: [
                    {
                        kind: "subtitles",
                        label: "English transcript",
                        srclang: "en",
                        sourceUrl: "broadcast-attribution.en.vtt",
                        default: true,
                        attribution: "Auto-generated transcript.",
                    },
                ],
            }],
            timeMs: startTimeMs + 10000,
            animationRunning: false,
        });

        expect(video.querySelectorAll('track[data-background-media-caption-track="true"]')).toHaveLength(0);
        expect(video.crossOrigin).toBe("anonymous");
        expect(nodes.get("background-media-caption-attribution").hidden).toBe(true);
        expect(nodes.get("background-media-transcript-note").textContent).toBe("Auto-generated transcript.");
        expect(nodes.get("background-media-transcript-note").hidden).toBe(false);

        actions.render({
            items: [],
            timeMs: startTimeMs + 10000,
            animationRunning: false,
        });

        expect(video.querySelectorAll('track[data-background-media-caption-track="true"]')).toHaveLength(0);
        expect(nodes.get("background-media-transcript-note").hidden).toBe(true);
    });

    it("renders active broadcast captions from the VTT track as a visible fallback", async () => {
        const { nodes } = installBackgroundPanelDom();
        globalThis.fetch = vi.fn(() => Promise.resolve({
            ok: true,
            text: () => Promise.resolve([
                "WEBVTT",
                "",
                "1",
                "00:00:08.000 --> 00:00:12.000",
                "Victor Glover: We can see Earth.",
                "",
            ].join("\n")),
        }));
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => false,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);
        const item = {
            id: "broadcast-caption-fallback",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast-caption-fallback.mp4",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
            },
            captionTracks: [
                {
                    sourceUrl: "broadcast-caption-fallback.en.vtt",
                    default: true,
                },
            ],
        };

        actions.render({
            items: [item],
            timeMs: startTimeMs + 10000,
            animationRunning: false,
        });
        for (let index = 0; index < 5; index += 1) {
            await Promise.resolve();
        }

        expect(nodes.get("background-media-caption-text").textContent).toBe("Victor Glover: We can see Earth.");
        expect(nodes.get("background-media-caption-text").hidden).toBe(false);

        actions.render({
            items: [item],
            timeMs: startTimeMs + 13000,
            animationRunning: false,
        });

        expect(nodes.get("background-media-caption-text").hidden).toBe(true);
    });

    it("renders active broadcast captions from the transcript JSON before using VTT fallback", async () => {
        const { nodes } = installBackgroundPanelDom();
        globalThis.fetch = vi.fn((url) => {
            if (String(url).endsWith(".json")) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        schemaVersion: 3,
                        segments: [
                            {
                                id: 1,
                                startSeconds: 8,
                                endSeconds: 12,
                                displaySpeaker: "Jeremy Hansen",
                                text: "The moon is right there.",
                                status: "ok",
                            },
                        ],
                    }),
                });
            }
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve([
                    "WEBVTT",
                    "",
                    "1",
                    "00:00:08.000 --> 00:00:12.000",
                    "Fallback caption.",
                    "",
                ].join("\n")),
            });
        });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => false,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);
        const item = {
            id: "broadcast-transcript-json",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast-transcript-json.mp4",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
            },
            transcriptDoc: {
                sourceUrl: "broadcast-transcript-json.json",
            },
            captionTracks: [
                {
                    sourceUrl: "broadcast-transcript-json.en.vtt",
                    default: true,
                },
            ],
        };

        actions.render({
            items: [item],
            timeMs: startTimeMs + 10000,
            animationRunning: false,
        });
        for (let index = 0; index < 5; index += 1) {
            await Promise.resolve();
        }

        expect(nodes.get("background-media-caption-text").textContent).toBe(
            "Jeremy Hansen: The moon is right there.",
        );
        expect(nodes.get("background-media-caption-text").hidden).toBe(false);
    });

    it("renders a synced broadcast transcript list and scrolls the active line", async () => {
        const { nodes } = installBackgroundPanelDom();
        const onJumpToTime = vi.fn();
        globalThis.fetch = vi.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                schemaVersion: 4,
                segments: [
                    {
                        id: 10,
                        startSeconds: 8,
                        endSeconds: 30,
                        displayStartSeconds: 10,
                        displayEndSeconds: 12,
                        displaySpeaker: "Reid Wiseman",
                        text: "We are looking at Earth.",
                        status: "ok",
                    },
                    {
                        id: 11,
                        startSeconds: 20,
                        endSeconds: 40,
                        displayStartSeconds: 22,
                        displayEndSeconds: 25,
                        displaySpeaker: "Victor Glover",
                        text: "The Moon is right below us.",
                        status: "ok",
                    },
                ],
            }),
        }));
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => false,
            getAnimationRealtime: () => true,
            onJumpToTime,
        });
        openEnabledBackgroundPanel(actions, nodes);
        const item = {
            id: "broadcast-transcript-panel",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast-transcript-panel.mp4",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
            },
            transcriptDoc: {
                sourceUrl: "broadcast-transcript-panel.json",
            },
        };

        actions.render({
            items: [item],
            timeMs: startTimeMs + 11000,
            animationRunning: false,
        });
        for (let index = 0; index < 5; index += 1) {
            await Promise.resolve();
        }

        const transcriptPanel = nodes.get("background-media-transcript");
        const transcriptList = nodes.get("background-media-transcript-list");
        expect(transcriptPanel.hidden).toBe(false);
        expect(nodes.get("background-media-transcript-status").textContent).toBe("2 lines");
        expect(transcriptList.children).toHaveLength(2);
        expect(transcriptList.children[0].dataset.active).toBe("true");
        expect(transcriptList.children[0].scrollIntoView).toHaveBeenCalledWith({
            block: "center",
            behavior: "auto",
        });

        actions.render({
            items: [item],
            timeMs: startTimeMs + 23000,
            animationRunning: false,
        });

        expect(transcriptList.children[0].dataset.active).toBe("false");
        expect(transcriptList.children[1].dataset.active).toBe("true");
        expect(transcriptList.children[1].scrollIntoView).toHaveBeenCalledWith({
            block: "center",
            behavior: "auto",
        });

        transcriptList.children[1].dispatchEvent({ type: "click" });
        expect(onJumpToTime).toHaveBeenCalledWith(startTimeMs + 22000, item);
    });

    it("keeps the broadcast transcript visible out of range without highlighting a line", async () => {
        const { nodes } = installBackgroundPanelDom();
        globalThis.fetch = vi.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                schemaVersion: 4,
                segments: [
                    {
                        id: "intro",
                        startSeconds: 8,
                        endSeconds: 30,
                        displaySpeaker: "Reid Wiseman",
                        text: "We are looking at Earth.",
                        status: "ok",
                    },
                    {
                        id: "moon",
                        startSeconds: 30,
                        endSeconds: 50,
                        displaySpeaker: "Victor Glover",
                        text: "The Moon is right below us.",
                        status: "ok",
                    },
                ],
            }),
        }));
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => false,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);

        actions.render({
            items: [{
                id: "broadcast-out-of-range-transcript",
                kind: "videoClip",
                enabled: true,
                assetUrl: "broadcast-out-of-range-transcript.mp4",
                playbackRoles: ["background"],
                startTimeMs,
                endTimeMs: startTimeMs + 600000,
                backgroundPlayback: {
                    enabled: true,
                },
                transcriptDoc: {
                    sourceUrl: "broadcast-out-of-range-transcript.json",
                },
            }],
            timeMs: startTimeMs - 60000,
            animationRunning: false,
        });
        for (let index = 0; index < 5; index += 1) {
            await Promise.resolve();
        }

        const transcriptPanel = nodes.get("background-media-transcript");
        const transcriptList = nodes.get("background-media-transcript-list");
        expect(transcriptPanel.hidden).toBe(false);
        expect(nodes.get("background-media-transcript-status").textContent).toBe("2 lines");
        expect(transcriptList.children).toHaveLength(2);
        expect(transcriptList.children[0].dataset.active).not.toBe("true");
        expect(transcriptList.children[1].dataset.active).not.toBe("true");
    });

    it("toggles broadcast captions from the header button", async () => {
        const { nodes } = installBackgroundPanelDom();
        globalThis.fetch = vi.fn(() => Promise.resolve({
            ok: true,
            text: () => Promise.resolve([
                "WEBVTT",
                "",
                "1",
                "00:00:08.000 --> 00:00:12.000",
                "Christina Koch: Eclipse has started.",
                "",
            ].join("\n")),
        }));
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => false,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);
        const item = {
            id: "broadcast-caption-toggle",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast-caption-toggle.mp4",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
            },
            captionTracks: [
                {
                    sourceUrl: "broadcast-caption-toggle.en.vtt",
                    default: true,
                    attribution: "Auto-generated transcript.",
                },
            ],
        };
        const renderModel = {
            items: [item],
            timeMs: startTimeMs + 10000,
            animationRunning: false,
        };

        actions.render(renderModel);
        for (let index = 0; index < 5; index += 1) {
            await Promise.resolve();
        }
        expect(nodes.get("background-media-caption-text").hidden).toBe(false);
        expect(nodes.get("background-media-transcript-note").hidden).toBe(false);

        const [, toggleCaptions] = nodes.get("background-media-captions").addEventListener.mock.calls
            .find(([type]) => type === "click");
        toggleCaptions();

        expect(nodes.get("background-media-caption-text").hidden).toBe(true);
        expect(nodes.get("background-media-transcript-note").hidden).toBe(true);
        expect(nodes.get("background-media-captions").dataset.captionStatus).toBe("hidden");
        expect(nodes.get("background-media-captions")["aria-pressed"]).toBe("false");

        toggleCaptions();
        expect(nodes.get("background-media-caption-text").hidden).toBe(false);
        expect(nodes.get("background-media-transcript-note").hidden).toBe(false);
        expect(nodes.get("background-media-captions").dataset.captionStatus).toBe("shown");
    });

    it("hides the broadcast control strip when the broadcast is only available out of range", () => {
        const { nodes } = installBackgroundPanelDom();
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);

        actions.render({
            items: [{
                id: "broadcast",
                title: "Artemis II Lunar Flyby Official Broadcast",
                kind: "videoClip",
                enabled: true,
                assetUrl: "broadcast.mp4",
                playbackRoles: ["background"],
                startTimeMs,
                endTimeMs: startTimeMs + 600000,
                backgroundPlayback: {
                    enabled: true,
                },
            }],
            timeMs: startTimeMs - 60000,
            animationRunning: true,
        });

        expect(nodes.get("background-media-controls").hidden).toBe(true);
        expect(nodes.get("background-media-time-overlay").hidden).toBe(true);
        expect(nodes.get("background-media-empty").hidden).toBe(false);
        expect(nodes.get("background-media-status").textContent).toContain("Available in");
    });

    it("seeks the broadcast element with stream time offsets applied", () => {
        const { nodes, video } = installBackgroundPanelDom({ currentTime: 0, paused: false });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => false,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);

        actions.render({
            items: [{
                id: "broadcast",
                kind: "videoClip",
                enabled: true,
                assetUrl: "broadcast.mp4",
                playbackRoles: ["background"],
                startTimeMs,
                endTimeMs: startTimeMs + 600000,
                durationSeconds: 600,
                timeOffsetSeconds: 4.25,
                backgroundPlayback: {
                    enabled: true,
                    muted: false,
                },
            }],
            timeMs: startTimeMs + 12000,
            animationRunning: false,
        });

        expect(video.currentTime).toBe(16.25);
        expect(nodes.get("background-media-status").textContent).toContain("0:16");
    });

    it("pauses for foreground video and resumes at the current mission offset", async () => {
        const { nodes, video } = installBackgroundPanelDom({ currentTime: 0, paused: false });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const item = {
            id: "broadcast",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast.mp4",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
                muted: false,
            },
        };
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
        });
        openEnabledBackgroundPanel(actions, nodes);

        actions.render({
            items: [item],
            timeMs: startTimeMs + 10000,
            animationRunning: true,
            foregroundMediaState: {
                active: true,
                kind: "videoClip",
                previewing: true,
            },
        });
        await Promise.resolve();

        expect(video.pause).toHaveBeenCalled();
        expect(nodes.get("background-media-status").textContent).toBe("Paused for Foreground Media");

        video.currentTime = 8.5;

        actions.render({
            items: [item],
            timeMs: startTimeMs + 11000,
            animationRunning: true,
            foregroundMediaState: {
                active: false,
                kind: "",
            },
        });
        await Promise.resolve();

        expect(video.muted).toBe(false);
        expect(video.currentTime).toBe(11);
        expect(nodes.get("background-media-status").textContent).toContain("Playing");
        expect(nodes.get("background-video-status-text").textContent).toBe("Foreground video ended; broadcast resumed");
    });

    it("does not turn the initial muted default into a stored user preference when enabling playback", async () => {
        const { nodes, video } = installBackgroundPanelDom({ currentTime: 0, paused: false });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const configData = {
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
        };
        const item = {
            id: "broadcast",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast.mp4",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
                muted: false,
            },
        };
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => true,
        });
        actions.setMissionContext({ available: true, configData });
        const [, enablePlayback] = nodes.get("background-media-enable").addEventListener.mock.calls.find(([type]) => type === "click");
        enablePlayback();
        actions.setMissionContext({ available: true, configData });

        actions.render({
            items: [item],
            timeMs: startTimeMs + 10000,
            animationRunning: true,
            foregroundMediaState: {
                active: true,
                kind: "audioClip",
                previewing: true,
            },
        });
        expect(video.muted).toBe(true);

        actions.render({
            items: [item],
            timeMs: startTimeMs + 11000,
            animationRunning: true,
            foregroundMediaState: {
                active: false,
                kind: "",
            },
        });
        await Promise.resolve();

        expect(video.muted).toBe(false);
    });

    it("frame-previews in-range broadcast video at high animation speeds", () => {
        const { nodes, video } = installBackgroundPanelDom({ currentTime: 0, paused: false });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => false,
            getAnimationSpeedMultiplier: () => 60,
        });
        openEnabledBackgroundPanel(actions, nodes);

        actions.render({
            items: [{
                id: "broadcast",
                kind: "videoClip",
                enabled: true,
                assetUrl: "broadcast.mp4",
                playbackRoles: ["background"],
                startTimeMs,
                endTimeMs: startTimeMs + 600000,
                backgroundPlayback: {
                    enabled: true,
                },
            }],
            timeMs: startTimeMs + 45000,
            animationRunning: true,
        });

        expect(video.play).not.toHaveBeenCalled();
        expect(video.pause).toHaveBeenCalled();
        expect(video.currentTime).toBe(45);
        expect(nodes.get("background-media-status").textContent).toContain("Frame preview");
    });

    it("does not rewrite unchanged broadcast button attributes on repeated renders", () => {
        const { nodes } = installBackgroundPanelDom({ currentTime: 45, paused: true });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => false,
            getAnimationSpeedMultiplier: () => 60,
        });
        openEnabledBackgroundPanel(actions, nodes);

        const item = {
            id: "broadcast",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast.mp4",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
            },
        };
        const renderModel = {
            items: [item],
            timeMs: startTimeMs + 45000,
            animationRunning: true,
        };
        actions.render(renderModel);

        const enableButton = nodes.get("background-media-enable");
        const muteButton = nodes.get("background-media-mute");
        const expandButton = nodes.get("background-media-panel-expand");
        enableButton.setAttribute.mockClear();
        muteButton.setAttribute.mockClear();
        expandButton.setAttribute.mockClear();

        actions.render(renderModel);

        expect(enableButton.setAttribute).not.toHaveBeenCalled();
        expect(muteButton.setAttribute).not.toHaveBeenCalled();
        expect(expandButton.setAttribute).not.toHaveBeenCalled();
    });

    it("keeps HLS loading while frame-previewing at high animation speeds", async () => {
        const { nodes, video } = installBackgroundPanelDom({ currentTime: 0, paused: false });
        const startTimeMs = Date.parse("2026-04-06T16:58:14Z");
        const hlsHandlers = new Map();
        const hlsInstance = {
            attachMedia: vi.fn(),
            loadSource: vi.fn(),
            startLoad: vi.fn(),
            stopLoad: vi.fn(),
            destroy: vi.fn(),
            on: vi.fn((eventName, handler) => hlsHandlers.set(eventName, handler)),
        };
        const HlsMock = vi.fn(function () { return hlsInstance; });
        HlsMock.isSupported = vi.fn(() => true);
        HlsMock.Events = {
            MEDIA_ATTACHED: "MEDIA_ATTACHED",
            MANIFEST_PARSED: "MANIFEST_PARSED",
            LEVEL_LOADED: "LEVEL_LOADED",
            ERROR: "ERROR",
        };
        HlsMock.ErrorTypes = {
            NETWORK_ERROR: "networkError",
            MEDIA_ERROR: "mediaError",
        };
        const actions = createBackgroundMediaPanelActions({
            getAnimationRunning: () => true,
            getAnimationRealtime: () => false,
            getAnimationSpeedMultiplier: () => 60,
            loadHlsLibraryFn: () => Promise.resolve(HlsMock),
        });
        openEnabledBackgroundPanel(actions, nodes);

        const item = {
            id: "broadcast",
            kind: "videoClip",
            enabled: true,
            assetUrl: "broadcast.m3u8",
            sourceType: "hls",
            playbackRoles: ["background"],
            startTimeMs,
            endTimeMs: startTimeMs + 600000,
            backgroundPlayback: {
                enabled: true,
            },
        };
        actions.render({
            items: [item],
            timeMs: startTimeMs + 45000,
            animationRunning: true,
        });
        await Promise.resolve();

        expect(hlsInstance.attachMedia).toHaveBeenCalledWith(video);
        hlsHandlers.get("MEDIA_ATTACHED")?.();
        expect(hlsInstance.loadSource).toHaveBeenCalledWith("broadcast.m3u8");

        hlsHandlers.get("MANIFEST_PARSED")?.();

        expect(video.play).not.toHaveBeenCalled();
        expect(video.pause).toHaveBeenCalled();
        expect(video.currentTime).toBe(45);
        expect(hlsInstance.stopLoad).not.toHaveBeenCalled();
        expect(hlsInstance.startLoad).toHaveBeenCalledWith(45);
        expect(nodes.get("background-media-status").textContent).toContain("Frame preview");

        hlsInstance.startLoad.mockClear();
        actions.render({
            items: [item],
            timeMs: startTimeMs + 46000,
            animationRunning: true,
        });
        expect(hlsInstance.startLoad).not.toHaveBeenCalled();

        actions.render({
            items: [item],
            timeMs: startTimeMs + 49000,
            animationRunning: true,
        });
        expect(hlsInstance.startLoad).toHaveBeenCalledWith(49);

        hlsInstance.stopLoad.mockClear();
        actions.render({
            items: [item],
            timeMs: startTimeMs + 46000,
            animationRunning: false,
        });

        expect(video.dataset.mediaSourceUrl).toBe("broadcast.m3u8");
        expect(hlsInstance.stopLoad).toHaveBeenCalledTimes(1);
        expect(nodes.get("background-media-status").textContent).toContain("Paused");

        hlsInstance.startLoad.mockClear();
        actions.render({
            items: [item],
            timeMs: startTimeMs + 46000,
            animationRunning: true,
        });
        expect(hlsInstance.startLoad).toHaveBeenCalledWith(46);
    });

    it("binds broadcast dragging even when the first setup runs before panel DOM exists", () => {
        const nodes = new Map();
        const documentListeners = new Map();
        const storage = new Map();
        const makeClassList = (node) => ({
            toggle: vi.fn(),
            contains: vi.fn((name) => String(node.className || "").split(/\s+/).includes(name)),
            add: vi.fn((name) => {
                const classes = new Set(String(node.className || "").split(/\s+/).filter(Boolean));
                classes.add(name);
                node.className = Array.from(classes).join(" ");
            }),
            remove: vi.fn((name) => {
                const classes = String(node.className || "").split(/\s+/).filter(Boolean)
                    .filter((item) => item !== name);
                node.className = classes.join(" ");
            }),
        });
        const makeNode = (id) => {
            const listeners = new Map();
            const node = {
                id,
                className: "",
                children: [],
                hidden: false,
                textContent: "",
                title: "",
                dataset: {},
                style: {},
                offsetLeft: 8,
                offsetTop: 80,
                offsetWidth: 546,
                offsetHeight: 300,
                classList: null,
                setAttribute: vi.fn(),
                focus: vi.fn(),
                replaceChildren: vi.fn(),
                appendChild: vi.fn((child) => {
                    node.children.push(child);
                    child.parentElement = node;
                    return child;
                }),
                querySelector: vi.fn((selector) => {
                    if (!String(selector || "").startsWith(".")) return null;
                    const wanted = String(selector).slice(1);
                    return node.children.find((child) => (
                        String(child.className || "").split(/\s+/).includes(wanted)
                    )) || null;
                }),
                setPointerCapture: vi.fn(),
                hasPointerCapture: vi.fn(() => true),
                releasePointerCapture: vi.fn(),
                closest: vi.fn((selector) => (
                    String(selector || "").startsWith(".") &&
                    String(node.className || "").split(/\s+/).includes(String(selector).slice(1))
                        ? node
                        : null
                )),
                addEventListener(type, handler) {
                    const handlers = listeners.get(type) || [];
                    handlers.push(handler);
                    listeners.set(type, handlers);
                },
                dispatchEvent(event) {
                    if (!event.target) event.target = node;
                    if (typeof event.preventDefault !== "function") {
                        event.preventDefault = vi.fn();
                    }
                    for (const handler of listeners.get(event.type) || []) {
                        handler.call(node, event);
                    }
                },
                getBoundingClientRect() {
                    const left = Number.parseFloat(node.style.left) || node.offsetLeft;
                    const top = Number.parseFloat(node.style.top) || node.offsetTop;
                    const width = Number.parseFloat(node.style.width) || node.offsetWidth;
                    const height = Number.parseFloat(node.style.height) || node.offsetHeight;
                    return {
                        left,
                        top,
                        right: left + width,
                        bottom: top + height,
                        width,
                        height,
                    };
                },
            };
            node.classList = makeClassList(node);
            return node;
        };

        globalThis.localStorage = {
            getItem: vi.fn((key) => storage.get(key) || null),
            setItem: vi.fn((key, value) => storage.set(key, value)),
        };
        globalThis.window = {
            innerWidth: 1400,
            innerHeight: 900,
            missionConfig: { dataPath: "assets/artemis2/data/" },
            addEventListener: vi.fn(),
            setTimeout: vi.fn(() => 1),
            clearTimeout: vi.fn(),
        };
        globalThis.document = {
            getElementById: vi.fn((id) => nodes.get(id) || null),
            querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ bottom: 80 }) })),
            createElement: vi.fn((tagName) => makeNode(tagName)),
            addEventListener(type, handler) {
                const handlers = documentListeners.get(type) || [];
                handlers.push(handler);
                documentListeners.set(type, handlers);
            },
        };

        const actions = createBackgroundMediaPanelActions();
        const missionContext = {
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
        };
        actions.setMissionContext(missionContext);

        const panel = makeNode("background-media-panel");
        const header = makeNode("background-media-panel-header");
        panel.querySelector = vi.fn((selector) => (
            selector === ".background-media-panel__header" ? header : null
        ));
        nodes.set("background-media-panel", panel);
        nodes.set("background-media-panel-wrapper", makeNode("background-media-panel-wrapper"));
        [
            "background-media-panel-close",
            "background-media-panel-expand",
            "background-media-enable",
            "background-media-timeline",
            "background-media-mute",
            "background-media-captions",
            "background-media-video",
        ].forEach((id) => nodes.set(id, makeNode(id)));

        actions.setMissionContext(missionContext);

        header.dispatchEvent({
            type: "pointerdown",
            pointerId: 4,
            button: 0,
            clientX: 40,
            clientY: 50,
            target: header,
        });
        for (const handler of documentListeners.get("pointermove") || []) {
            handler({
                type: "pointermove",
                pointerId: 4,
                clientX: 100,
                clientY: 90,
                preventDefault: vi.fn(),
            });
        }
        actions.setMissionContext(missionContext);

        expect(panel.style.left).toBe("92px");
        expect(panel.style.top).toBe("48px");

        for (const handler of documentListeners.get("pointerup") || []) {
            handler({
                type: "pointerup",
                pointerId: 4,
                preventDefault: vi.fn(),
            });
        }

        expect(panel.style.left).toBe("92px");
        expect(panel.style.top).toBe("48px");
        const savedLayout = JSON.parse(storage.get("moon-mission:panel-layout:v1:artemis2"));
        expect(savedLayout.panels["workflow:background-media"].rect).toEqual(expect.objectContaining({
            left: 92,
            top: 48,
        }));
    });

    it("adds broadcast panel delete control and resizes from every corner", () => {
        const nodes = new Map();
        const storage = new Map();
        const makeClassList = (node) => ({
            toggle: vi.fn(),
            contains: vi.fn((name) => String(node.className || "").split(/\s+/).includes(name)),
        });
        const makeNode = (id) => {
            const listeners = new Map();
            const node = {
                id,
                className: "",
                children: [],
                hidden: false,
                textContent: "",
                title: "",
                dataset: {},
                style: {},
                offsetLeft: 100,
                offsetTop: 120,
                offsetWidth: 546,
                offsetHeight: 340,
                classList: null,
                setAttribute: vi.fn(),
                focus: vi.fn(),
                replaceChildren: vi.fn(),
                appendChild(child) {
                    node.children.push(child);
                    child.parentElement = node;
                    return child;
                },
                querySelector(selector) {
                    if (!String(selector || "").startsWith(".")) return null;
                    const wanted = String(selector).slice(1);
                    return node.children.find((child) => (
                        String(child.className || "").split(/\s+/).includes(wanted)
                    )) || null;
                },
                setPointerCapture: vi.fn(),
                hasPointerCapture: vi.fn(() => true),
                releasePointerCapture: vi.fn(),
                closest(selector) {
                    if (!String(selector || "").startsWith(".")) return null;
                    const wanted = String(selector).slice(1);
                    return String(node.className || "").split(/\s+/).includes(wanted) ? node : null;
                },
                addEventListener(type, handler) {
                    const handlers = listeners.get(type) || [];
                    handlers.push(handler);
                    listeners.set(type, handlers);
                },
                dispatchEvent(event) {
                    if (!event.target) event.target = node;
                    event.preventDefault ||= vi.fn();
                    event.stopPropagation ||= vi.fn();
                    for (const handler of listeners.get(event.type) || []) {
                        handler.call(node, event);
                    }
                },
                getBoundingClientRect() {
                    const left = Number.parseFloat(node.style.left) || node.offsetLeft;
                    const top = Number.parseFloat(node.style.top) || node.offsetTop;
                    const width = Number.parseFloat(node.style.width) || node.offsetWidth;
                    const height = Number.parseFloat(node.style.height) || node.offsetHeight;
                    return {
                        left,
                        top,
                        right: left + width,
                        bottom: top + height,
                        width,
                        height,
                    };
                },
            };
            node.classList = makeClassList(node);
            return node;
        };

        globalThis.localStorage = {
            getItem: vi.fn((key) => storage.get(key) || null),
            setItem: vi.fn((key, value) => storage.set(key, value)),
        };
        globalThis.window = {
            innerWidth: 1400,
            innerHeight: 900,
            missionConfig: { dataPath: "assets/artemis2/data/" },
            addEventListener: vi.fn(),
            setTimeout: vi.fn(() => 1),
            clearTimeout: vi.fn(),
        };
        globalThis.document = {
            getElementById: vi.fn((id) => nodes.get(id) || null),
            querySelector: vi.fn(() => ({ getBoundingClientRect: () => ({ bottom: 80 }) })),
            createElement: vi.fn((tagName) => makeNode(tagName)),
            addEventListener: vi.fn(),
        };

        const panel = makeNode("background-media-panel");
        panel.style.left = "100px";
        panel.style.top = "120px";
        panel.style.width = "546px";
        panel.style.height = "340px";
        const header = makeNode("background-media-panel-header");
        header.className = "background-media-panel__header";
        const headerControls = makeNode("background-media-panel-header-controls");
        headerControls.className = "background-media-panel__header-controls";
        panel.appendChild(header);
        panel.appendChild(headerControls);
        nodes.set("background-media-panel", panel);
        nodes.set("background-media-panel-wrapper", makeNode("background-media-panel-wrapper"));
        [
            "background-media-panel-close",
            "background-media-panel-expand",
            "background-media-enable",
            "background-media-timeline",
            "background-media-mute",
            "background-media-captions",
            "background-media-video",
            "background-media-empty",
            "background-media-live",
            "background-media-time-overlay",
            "background-media-title",
            "background-media-status",
            "background-media-controls",
        ].forEach((id) => nodes.set(id, makeNode(id)));

        const actions = createBackgroundMediaPanelActions();
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

        const deleteButton = headerControls.children.find((child) => child.id === "background-media-panel-delete");
        expect(deleteButton?.dataset.icon).toBe("delete");
        expect(panel.children.filter((child) => (
            String(child.className || "").includes("background-media-panel__resize-grip")
        ))).toHaveLength(4);

        for (const [corner, eventPatch, expected] of [
            ["nw", { clientX: 80, clientY: 100 }, { left: "80px", top: "100px", width: "566px", height: "360px" }],
            ["ne", { clientX: 680, clientY: 90 }, { left: "100px", top: "90px", width: "580px", height: "370px" }],
            ["sw", { clientX: 70, clientY: 480 }, { left: "70px", top: "120px", width: "576px", height: "360px" }],
            ["se", { clientX: 690, clientY: 500 }, { left: "100px", top: "120px", width: "590px", height: "380px" }],
        ]) {
            panel.style.left = "100px";
            panel.style.top = "120px";
            panel.style.width = "546px";
            panel.style.height = "340px";
            const grip = panel.querySelector(`.background-media-panel__resize-grip--${corner}`);
            panel.dispatchEvent({
                type: "pointerdown",
                pointerId: 9,
                button: 0,
                clientX: corner.includes("e") ? 646 : 100,
                clientY: corner.includes("s") ? 460 : 120,
                target: grip,
            });
            panel.dispatchEvent({
                type: "pointermove",
                pointerId: 9,
                ...eventPatch,
            });
            expect(panel.style.left).toBe(expected.left);
            expect(panel.style.top).toBe(expected.top);
            expect(panel.style.width).toBe(expected.width);
            expect(panel.style.height).toBe(expected.height);
            panel.dispatchEvent({
                type: "pointerup",
                pointerId: 9,
            });
        }
    });
});
