import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";
import { launchAuxiliaryPanelBrowser } from "./helpers/auxiliary-panel-browser.js";

const TEST_TIMEOUT_MS = process.env.CI === "true" ? 120000 : 90000;

let browser;

describe("Mission Media panel geometry interactions", () => {
    beforeAll(async () => {
        browser = await launchAuxiliaryPanelBrowser();
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("defaults Mission Media and Frame and Shoot with matching frames and an open scene gap", async () => {
        const page = await browser.newPage({ viewport: { width: 1920, height: 800 } });
        const baseUrl = getEffectiveTestBaseUrl(process.cwd());

        try {
            await page.addInitScript(() => localStorage.clear());
            await page.goto(`${baseUrl}/artemis2/`, {
                waitUntil: "domcontentloaded",
                timeout: 60000,
            });

            await page.waitForFunction(
                () => document.getElementById("mission-loading-overlay")?.dataset?.blocking === "false",
                { timeout: 30000 },
            );

            await page.evaluate(() => {
                const composer = document.querySelector(".aux-camera-view--composer");
                if (!composer || composer.hidden) {
                    document.getElementById("flyby-pill")?.click();
                }
            });
            await page.waitForFunction(
                () => {
                    const panel = document.querySelector(".aux-camera-view--composer");
                    return panel && !panel.hidden;
                },
                { timeout: 10000 },
            );
            const composerBeforeMedia = await page.evaluate(() => {
                const composer = document.querySelector(".aux-camera-view--composer");
                const rect = composer.getBoundingClientRect();
                return {
                    width: rect.width,
                    height: rect.height,
                };
            });

            await page.waitForFunction(
                () => document.getElementById("media-browser-panel-wrapper")?.hidden === false,
                { timeout: 10000 },
            );
            await page.evaluate(() => {
                const panel = document.getElementById("media-browser-panel");
                if (!panel || panel.classList.contains("media-browser-panel--hidden")) {
                    document.getElementById("panel-pill-media")?.click();
                }
            });
            const isDockviewEnabled = await page.evaluate(
                () => document.body.classList.contains("dockview-panels-enabled"),
            );
            if (!isDockviewEnabled) {
                await page.waitForFunction(
                    () => {
                        const media = document.getElementById("media-browser-panel");
                        const composer = document.querySelector(".aux-camera-view--composer");
                        if (!media || !composer || media.classList.contains("media-browser-panel--hidden") || composer.hidden) {
                            return false;
                        }
                        const mediaRect = media.getBoundingClientRect();
                        const composerRect = composer.getBoundingClientRect();
                        return Math.abs(mediaRect.top - composerRect.top) <= 2 &&
                            Math.abs(mediaRect.bottom - composerRect.bottom) <= 2;
                    },
                    { timeout: 10000 },
                );
            }

            const layout = await page.evaluate(() => {
                const media = document.getElementById("media-browser-panel");
                const composer = document.querySelector(".aux-camera-view--composer");
                const controlPanel = document.getElementById("control-panel");
                const dockviewHost = document.getElementById("experimental-dockview-host");
                const auxPanels = Array.from(document.querySelectorAll(".aux-camera-view:not(.aux-camera-view--composer)"))
                    .filter((panel) => !panel.hidden)
                    .map((panel) => {
                        const rect = panel.getBoundingClientRect();
                        return {
                            left: rect.left,
                            top: rect.top,
                            width: rect.width,
                            height: rect.height,
                        };
                    })
                    .sort((a, b) => a.top - b.top);
                const mediaRect = media.getBoundingClientRect();
                const composerRect = composer.getBoundingClientRect();
                const controlRect = controlPanel?.getBoundingClientRect?.();
                const dockviewHostRect = dockviewHost?.getBoundingClientRect?.();
                return {
                    dockviewEnabled: document.body.classList.contains("dockview-panels-enabled"),
                    dockviewHost: dockviewHostRect
                        ? {
                            bottom: dockviewHostRect.bottom,
                        }
                        : null,
                    media: {
                        left: mediaRect.left,
                        top: mediaRect.top,
                        bottom: mediaRect.bottom,
                        width: mediaRect.width,
                        height: mediaRect.height,
                    },
                    composer: {
                        left: composerRect.left,
                        top: composerRect.top,
                        bottom: composerRect.bottom,
                        width: composerRect.width,
                        height: composerRect.height,
                    },
                    controlPanel: {
                        top: controlRect?.top || 0,
                    },
                    auxPanels,
                };
            });

            if (layout.dockviewEnabled) {
                expect(layout.dockviewHost?.bottom || 0).toBeLessThanOrEqual(layout.controlPanel.top - 10);
                expect(layout.media.bottom).toBeLessThanOrEqual(layout.controlPanel.top - 10);
                expect(layout.composer.bottom).toBeLessThanOrEqual(layout.controlPanel.top - 10);
                for (const panel of layout.auxPanels) {
                    expect(panel.top + panel.height).toBeLessThanOrEqual(layout.controlPanel.top - 10);
                }
                return;
            }
            expect(Math.abs(layout.media.top - layout.composer.top)).toBeLessThanOrEqual(2);
            expect(Math.abs(layout.media.bottom - layout.composer.bottom)).toBeLessThanOrEqual(2);
            expect(Math.abs(layout.media.width - layout.composer.width)).toBeLessThanOrEqual(2);
            expect(Math.abs(layout.composer.width - composerBeforeMedia.width)).toBeLessThanOrEqual(2);
            expect(Math.abs(layout.composer.height - composerBeforeMedia.height)).toBeLessThanOrEqual(2);
            expect(Math.abs(layout.media.height - (800 * 0.6))).toBeLessThanOrEqual(2);
            expect(Math.abs(layout.composer.height - (800 * 0.6))).toBeLessThanOrEqual(2);
            expect(layout.media.bottom).toBeLessThanOrEqual(layout.controlPanel.top - 10);
            expect(layout.composer.bottom).toBeLessThanOrEqual(layout.controlPanel.top - 10);
            expect(layout.media.left).toBeLessThan(layout.composer.left);
            expect(layout.auxPanels).toHaveLength(3);
            expect(Math.max(...layout.auxPanels.map((panel) => Math.abs(panel.left - layout.auxPanels[0].left))))
                .toBeLessThanOrEqual(2);
            const mediaComposerGap = layout.composer.left - (layout.media.left + layout.media.width);
            expect(mediaComposerGap).toBeGreaterThanOrEqual(80);
            expect(layout.auxPanels[0].left).toBeGreaterThan(layout.composer.left + layout.composer.width);
            expect(Math.abs((layout.auxPanels[0].left + layout.auxPanels[0].width) - 1912)).toBeLessThanOrEqual(2);

            await page.evaluate(() => {
                const panel = document.getElementById("media-browser-panel");
                panel.style.left = "80px";
            });

            const beforeResize = await page.evaluate(() => {
                const panel = document.getElementById("media-browser-panel");
                const rect = panel.getBoundingClientRect();
                return {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                    x: rect.left + 10,
                    y: rect.top + 10,
                    topClass: String(document.elementFromPoint(rect.left + 10, rect.top + 10)?.className || ""),
                };
            });

            expect(beforeResize.topClass).toContain("media-browser-panel__resize-grip");

            await page.mouse.move(beforeResize.x, beforeResize.y);
            await page.mouse.down();
            await page.mouse.move(beforeResize.x - 70, beforeResize.y - 50, { steps: 5 });
            await page.mouse.up();
            await page.waitForTimeout(200);

            const afterResize = await page.evaluate(() => {
                const panel = document.getElementById("media-browser-panel");
                const rect = panel.getBoundingClientRect();
                return {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                };
            });

            expect(afterResize.left).toBeLessThan(beforeResize.left - 40);
            expect(afterResize.top).toBeLessThan(beforeResize.top - 25);
            expect(afterResize.width).toBeGreaterThan(beforeResize.width + 40);
            expect(afterResize.height).toBeGreaterThan(beforeResize.height + 25);
        } finally {
            await page.close();
        }
    }, TEST_TIMEOUT_MS);

    it("keeps the selected media view stable when resizing the thumbnail tray", async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const baseUrl = getEffectiveTestBaseUrl(process.cwd());

        try {
            await page.addInitScript(() => localStorage.clear());
            await page.goto(`${baseUrl}/artemis2/?legacyPanels=1`, {
                waitUntil: "domcontentloaded",
                timeout: 60000,
            });

            await page.waitForFunction(
                () => document.getElementById("mission-loading-overlay")?.dataset?.blocking === "false",
                { timeout: 30000 },
            );

            await page.evaluate(() => {
                const panel = document.getElementById("media-browser-panel");
                if (!panel || panel.classList.contains("media-browser-panel--hidden")) {
                    document.getElementById("panel-pill-media")?.click();
                }
            });
            await page.waitForFunction(
                () => {
                    const panel = document.getElementById("media-browser-panel");
                    const image = document.getElementById("media-browser-image");
                    return panel
                        && !panel.classList.contains("media-browser-panel--hidden")
                        && image
                        && !image.hidden
                        && image.getAttribute("src");
                },
                { timeout: 10000 },
            );

            await page.evaluate(() => document.getElementById("media-browser-panel-expand")?.click());
            await page.waitForFunction(
                () => document.getElementById("media-browser-panel")?.classList?.contains("is-maximized"),
                { timeout: 5000 },
            );
            await page.evaluate(() => {
                const wrapper = document.getElementById("media-browser-panel-wrapper");
                if (wrapper) wrapper.style.zIndex = "9000";
            });

            await page.click("#media-browser-image-zoom-in");
            await page.click("#media-browser-image-zoom-in");

            const stagePoint = await page.evaluate(() => {
                const rect = document.getElementById("media-browser-stage").getBoundingClientRect();
                return {
                    x: rect.left + (rect.width / 2),
                    y: rect.top + (rect.height / 2),
                };
            });

            await page.mouse.move(stagePoint.x, stagePoint.y);
            await page.mouse.down();
            await page.mouse.move(stagePoint.x, stagePoint.y + 300, { steps: 8 });
            await page.mouse.up();

            const resizerPoint = await page.evaluate(() => {
                const rect = document.getElementById("media-browser-thumbnail-resizer").getBoundingClientRect();
                return {
                    x: rect.left + (rect.width / 2),
                    y: rect.top + (rect.height / 2),
                };
            });

            await page.mouse.move(resizerPoint.x, resizerPoint.y);
            await page.mouse.down();
            await page.mouse.move(resizerPoint.x, resizerPoint.y - 140, { steps: 8 });
            await page.mouse.up();
            await page.waitForTimeout(200);

            const afterResize = await page.evaluate(() => {
                const panel = document.getElementById("media-browser-panel");
                const stage = document.getElementById("media-browser-stage");
                const image = document.getElementById("media-browser-image");
                const thumbnailList = document.getElementById("media-browser-thumbnail-list");
                const activeThumbnail = thumbnailList?.querySelector(".media-browser-panel__thumbnail-card.is-active");
                const stageRect = stage.getBoundingClientRect();
                const listRect = thumbnailList.getBoundingClientRect();
                const activeRect = activeThumbnail.getBoundingClientRect();
                const transformText = image.style.transform || "";
                const transformMatch = transformText.match(/translate3d\(([-0-9.]+)px,\s*([-0-9.]+)px,\s*0px\)\s*scale\(([-0-9.]+)\)/);
                const panY = Number(transformMatch?.[2]);
                const zoom = Number(transformMatch?.[3]);
                return {
                    activeThumbnailInsideList: activeRect.left >= listRect.left - 1
                        && activeRect.right <= listRect.right + 1,
                    maxPanY: (stageRect.height * (zoom - 1)) / 2,
                    panY,
                    stageHeight: stageRect.height,
                    thumbnailStripHeight: Number.parseFloat(
                        getComputedStyle(panel).getPropertyValue("--media-browser-thumbnail-strip-height"),
                    ),
                    zoom,
                };
            });

            expect(afterResize.thumbnailStripHeight).toBeGreaterThan(148);
            expect(afterResize.stageHeight).toBeGreaterThanOrEqual(150);
            expect(afterResize.zoom).toBeGreaterThan(1);
            expect(Math.abs(afterResize.panY)).toBeLessThanOrEqual(afterResize.maxPanY + 1);
            expect(afterResize.activeThumbnailInsideList).toBe(true);
        } finally {
            await page.close();
        }
    }, TEST_TIMEOUT_MS);

    it("derives Mission Media thumbnail disclosure levels from real strip geometry", async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const baseUrl = getEffectiveTestBaseUrl(process.cwd());

        const readThumbnailState = async () => page.evaluate(() => {
            const panel = document.getElementById("media-browser-panel");
            const strip = panel?.querySelector(".media-browser-panel__thumbnail-strip");
            const list = document.getElementById("media-browser-thumbnail-list");
            const active = list?.querySelector(".media-browser-panel__thumbnail-card.is-active");
            const title = active?.querySelector(".media-browser-panel__thumbnail-title");
            const meta = active?.querySelector(".media-browser-panel__thumbnail-meta");
            const stripRect = strip?.getBoundingClientRect?.();
            const activeRect = active?.getBoundingClientRect?.();
            return {
                level: strip?.dataset?.thumbnailDisclosureLevel || "",
                placement: panel?.dataset?.thumbnailStripPlacement || "",
                stripWidth: stripRect?.width || 0,
                stripHeight: stripRect?.height || 0,
                titleDisplay: title ? getComputedStyle(title).display : "",
                titleText: title?.textContent || "",
                metaDisplay: meta ? getComputedStyle(meta).display : "",
                activeVisible: !!activeRect && activeRect.width > 20 && activeRect.height > 20,
                activeAriaLabel: active?.getAttribute("aria-label") || "",
                activeTitle: active?.getAttribute("title") || "",
            };
        });

        try {
            await page.addInitScript(() => localStorage.clear());
            await page.goto(`${baseUrl}/artemis2/?legacyPanels=1`, {
                waitUntil: "domcontentloaded",
                timeout: 60000,
            });

            await page.waitForFunction(
                () => document.getElementById("mission-loading-overlay")?.dataset?.blocking === "false",
                { timeout: 30000 },
            );

            await page.evaluate(() => {
                const panel = document.getElementById("media-browser-panel");
                if (!panel || panel.classList.contains("media-browser-panel--hidden")) {
                    document.getElementById("panel-pill-media")?.click();
                }
            });
            await page.waitForFunction(
                () => {
                    const panel = document.getElementById("media-browser-panel");
                    const strip = panel?.querySelector(".media-browser-panel__thumbnail-strip");
                    const active = document.querySelector("#media-browser-thumbnail-list .media-browser-panel__thumbnail-card.is-active");
                    return panel
                        && !panel.classList.contains("media-browser-panel--hidden")
                        && strip?.dataset?.thumbnailDisclosureLevel
                        && active;
                },
                { timeout: 10000 },
            );

            let state = await readThumbnailState();
            expect(state.level).toBe("media-only");
            expect(state.placement).toBe("bottom");
            expect(state.titleDisplay).toBe("none");
            expect(state.metaDisplay).toBe("none");
            expect(state.activeVisible).toBe(true);
            expect(state.activeTitle).toBe("");
            expect(state.activeAriaLabel.length).toBeGreaterThan(0);

            await page.evaluate(() => document.getElementById("media-browser-panel-expand")?.click());
            await page.waitForFunction(
                () => document.getElementById("media-browser-panel")?.classList?.contains("is-maximized"),
                { timeout: 5000 },
            );

            await page.focus("#media-browser-thumbnail-resizer");
            await page.keyboard.press("End");
            await page.waitForFunction(
                () => document.querySelector(".media-browser-panel__thumbnail-strip")?.dataset?.thumbnailDisclosureLevel === "full",
                { timeout: 5000 },
            );

            state = await readThumbnailState();
            expect(state.level).toBe("full");
            expect(state.stripHeight).toBeGreaterThanOrEqual(150);
            expect(state.titleDisplay).not.toBe("none");
            expect(state.titleText).toMatch(/^MET /);
            expect(state.metaDisplay).toBe("none");
            expect(state.activeVisible).toBe(true);

            await page.keyboard.press("Home");
            await page.waitForFunction(
                () => document.querySelector(".media-browser-panel__thumbnail-strip")?.dataset?.thumbnailDisclosureLevel === "media-only",
                { timeout: 5000 },
            );

            await page.focus("#media-browser-thumbnail-placement-grab");
            await page.keyboard.press("ArrowLeft");
            await page.waitForFunction(
                () => {
                    const panel = document.getElementById("media-browser-panel");
                    const strip = panel?.querySelector(".media-browser-panel__thumbnail-strip");
                    return panel?.dataset?.thumbnailStripPlacement === "left"
                        && strip?.classList?.contains("is-vertical")
                        && strip?.dataset?.thumbnailDisclosureLevel === "minimal";
                },
                { timeout: 5000 },
            );

            state = await readThumbnailState();
            expect(state.placement).toBe("left");
            expect(state.level).toBe("minimal");
            expect(state.titleDisplay).toBe("none");
            expect(state.activeVisible).toBe(true);

            await page.focus("#media-browser-thumbnail-resizer");
            await page.keyboard.press("End");
            await page.waitForFunction(
                () => document.querySelector(".media-browser-panel__thumbnail-strip")?.dataset?.thumbnailDisclosureLevel === "full",
                { timeout: 5000 },
            );

            state = await readThumbnailState();
            expect(state.placement).toBe("left");
            expect(state.level).toBe("full");
            expect(state.stripWidth).toBeGreaterThanOrEqual(210);
            expect(state.titleDisplay).not.toBe("none");
            expect(state.titleText).toMatch(/^MET /);
            expect(state.metaDisplay).toBe("none");
            expect(state.activeVisible).toBe(true);
        } finally {
            await page.close();
        }
    }, TEST_TIMEOUT_MS);
});
