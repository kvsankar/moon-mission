import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createBackgroundMediaPanelActions,
} from "../src/platform/js/app/background-media-panel.js";
import {
    installBackgroundPanelDom,
    openEnabledBackgroundPanel,
    resetBackgroundMediaPanelGlobals,
} from "./helpers/background-media-panel-harness.js";

describe("background media captions and transcript", () => {
    afterEach(resetBackgroundMediaPanelGlobals);

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
});
