import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";

const TEST_TIMEOUT_MS = process.env.CI === "true" ? 120000 : 90000;

let browser;

describe("Mission Media foreground playback interactions", () => {
    beforeAll(async () => {
        browser = await chromium.launch({
            headless: process.env.HEADLESS !== "false",
            args: [
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
                "--disable-gpu-sandbox",
                "--enable-unsafe-swiftshader",
            ],
        });
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("autoplays a selected foreground video thumbnail while broadcast playback is active", async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
        const baseUrl = getEffectiveTestBaseUrl(process.cwd());

        try {
            await page.addInitScript(() => {
                localStorage.clear();
                window.__missionMediaPlayCalls = [];
                window.__missionMediaPauseCalls = [];
                const transport = new WeakMap();
                Object.defineProperty(HTMLMediaElement.prototype, "paused", {
                    configurable: true, get() { return transport.get(this)?.paused !== false; },
                });
                Object.defineProperty(HTMLMediaElement.prototype, "ended", {
                    configurable: true, get() { return transport.get(this)?.ended === true; },
                });
                window.__missionMediaFinish = media => {
                    transport.set(media, { paused: true, ended: true });
                    media.dispatchEvent(new Event("ended"));
                };
                HTMLMediaElement.prototype.play = function play() {
                    transport.set(this, { paused: false, ended: false });
                    window.__missionMediaPlayCalls.push({
                        id: this.id,
                        src: this.currentSrc || this.src || this.dataset?.mediaSourceUrl || "",
                        currentTime: this.currentTime,
                        muted: this.muted,
                    });
                    this.dispatchEvent(new Event("playing"));
                    return Promise.resolve();
                };
                HTMLMediaElement.prototype.pause = function pause() {
                    transport.set(this, { ...transport.get(this), paused: true });
                    window.__missionMediaPauseCalls.push({
                        id: this.id,
                        src: this.currentSrc || this.src || this.dataset?.mediaSourceUrl || "",
                        currentTime: this.currentTime,
                        muted: this.muted,
                    });
                    this.dispatchEvent(new Event("pause"));
                };
            });

            await page.route(/\.(jpg|jpeg|png|webp)(\?|$)/i, async (route) => {
                await route.fulfill({ status: 204, body: "" });
            });

            await page.route("**/assets/artemis2/data/media-manifest.json", async (route) => {
                await route.fulfill({
                    contentType: "application/json",
                    body: JSON.stringify({
                        mediaBase: "https://media.example/",
                        timelineTimezoneOffset: "+00:00",
                        photos: [
                            {
                                time: "2026-04-06 17:13:14",
                                file: "foreground-flyby.mp4",
                                title: "Foreground Flyby Clip",
                                enabled: true,
                                video: true,
                                durationSeconds: 180,
                            },
                        ],
                        mediaStreams: [
                            {
                                id: "flyby-broadcast",
                                title: "Flyby Broadcast",
                                enabled: true,
                                streamKind: "video",
                                sourceType: "hls",
                                sourceUrl: "broadcast.m3u8",
                                startTime: "2026-04-06T16:58:14Z",
                                endTime: "2026-04-07T03:08:14Z",
                                durationSeconds: 36600,
                                syncMode: "missionClock",
                                playbackRoles: ["background"],
                                backgroundPlayback: {
                                    enabled: true,
                                    muted: false,
                                    priority: 100,
                                },
                            },
                        ],
                    }),
                });
            });

            await page.goto(`${baseUrl}/artemis2/?testMode=true`, {
                waitUntil: "domcontentloaded",
                timeout: 60000,
            });
            await page.waitForFunction(
                () => document.getElementById("mission-loading-overlay")?.dataset?.blocking === "false",
                { timeout: 45000 },
            );

            await page.evaluate(() => {
                if (document.getElementById("background-media-panel")?.classList.contains("background-media-panel--hidden")) {
                    document.getElementById("panel-pill-background")?.click();
                }
            });
            await page.waitForSelector("#background-media-empty .background-media-panel__jump-button", {
                timeout: 30000,
            });
            await page.evaluate(() => {
                document.querySelector("#background-media-empty .background-media-panel__jump-button")?.click();
            });
            await page.waitForFunction(
                () => document.getElementById("animate")?.textContent?.trim() === "⏸",
                { timeout: 10000 },
            );

            await page.evaluate(() => {
                if (document.getElementById("media-browser-panel")?.classList.contains("media-browser-panel--hidden")) {
                    document.getElementById("panel-pill-media")?.click();
                }
            });
            await page.evaluate(() => {
                [...document.querySelectorAll(".media-browser-panel__filter-button")]
                    .find((button) => button.textContent.trim() === "Video")
                    ?.click();
            });
            await page.waitForFunction(
                // Background-role streams are not foreground carousel candidates.
                () => document.getElementById("media-browser-filter-summary")?.textContent?.includes("(1 video)"),
                { timeout: 30000 },
            );
            const foregroundCard = page.locator('#media-browser-thumbnail-list [data-thumbnail-item-id="foreground-flyby.mp4"]');
            await foregroundCard.waitFor({ state: "visible", timeout: 30000 });

            await foregroundCard.click();
            await page.waitForFunction(
                () => window.__missionMediaPlayCalls?.some((call) => call.id === "media-browser-video"),
                { timeout: 10000 },
            );

            const state = await page.evaluate(() => {
                const foregroundVideo = document.getElementById("media-browser-video");
                const backgroundVideo = document.getElementById("background-media-video");
                return {
                    foregroundTitle: document.getElementById("media-browser-item-title")?.textContent || "",
                    foregroundStatus: document.getElementById("media-browser-media-status")?.textContent || "",
                    foregroundPlayButton: document.getElementById("media-browser-media-play")?.textContent?.trim() || "",
                    foregroundHidden: foregroundVideo?.hidden,
                    foregroundMuted: foregroundVideo?.muted,
                    backgroundMuted: backgroundVideo?.muted,
                    backgroundStatus: document.getElementById("background-media-status")?.textContent || "",
                    playCalls: window.__missionMediaPlayCalls || [],
                    pauseCalls: window.__missionMediaPauseCalls || [],
                };
            });

            expect(state.foregroundTitle).toBe("Foreground Flyby Clip");
            expect(state.foregroundStatus).toContain("Video playing");
            expect(state.foregroundPlayButton).toBe("⏸");
            expect(state.foregroundHidden).toBe(false);
            expect(state.foregroundMuted).toBe(false);
            expect(state.backgroundMuted).toBe(false);
            expect(state.backgroundStatus).toBe("Paused for Foreground Media");
            expect(state.playCalls.some((call) => call.id === "media-browser-video")).toBe(true);

            await page.evaluate(() => {
                const foregroundVideo = document.getElementById("media-browser-video");
                if (foregroundVideo) {
                    foregroundVideo.currentTime = 180;
                    window.__missionMediaFinish(foregroundVideo);
                }
            });
            await page.waitForFunction(
                () => document.getElementById("media-browser-media-play")?.textContent?.trim() === "▶",
                { timeout: 10000 },
            );

            const releaseState = await page.evaluate(() => {
                const backgroundVideo = document.getElementById("background-media-video");
                return {
                    animationButton: document.getElementById("animate")?.textContent?.trim() || "",
                    foregroundStatus: document.getElementById("media-browser-media-status")?.textContent || "",
                    backgroundMuted: backgroundVideo?.muted,
                    backgroundStatus: document.getElementById("background-media-status")?.textContent || "",
                };
            });

            expect(releaseState.animationButton).toBe("⏸");
            expect(releaseState.foregroundStatus).not.toContain("playing");
            expect(releaseState.backgroundMuted).toBe(false);
            expect(releaseState.backgroundStatus).not.toContain("Muted for Foreground Media");
            expect(releaseState.backgroundStatus).not.toContain("Paused for Foreground Media");
        } finally {
            await page.close();
        }
    }, TEST_TIMEOUT_MS);
});
