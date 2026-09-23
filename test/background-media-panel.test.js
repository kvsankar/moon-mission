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
import {
    installBackgroundPanelDom,
    openEnabledBackgroundPanel,
    resetBackgroundMediaPanelGlobals,
} from "./helpers/background-media-panel-harness.js";

describe("background media playback policy and synchronization", () => {
    afterEach(resetBackgroundMediaPanelGlobals);

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
});
