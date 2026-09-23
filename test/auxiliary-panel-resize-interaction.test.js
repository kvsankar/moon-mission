import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEffectiveTestBaseUrl } from "./local-test-config.js";
import { launchAuxiliaryPanelBrowser } from "./helpers/auxiliary-panel-browser.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const TEST_TIMEOUT_MS = process.env.CI === "true" ? 120000 : 90000;

let browser;

describe("Auxiliary panel resize interactions", () => {
    beforeAll(async () => {
        browser = await launchAuxiliaryPanelBrowser();
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps Frame and Shoot disclosure geometry within its owning popout window and redocks cleanly", async () => {
        const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const page = await context.newPage();
        try {
            await page.addInitScript(() => localStorage.clear());
            await page.goto(`${getEffectiveTestBaseUrl(process.cwd())}/artemis2/`, { waitUntil: "domcontentloaded" });
            await page.waitForFunction(() => document.getElementById("mission-loading-overlay")?.dataset.blocking === "false");
            const composerGroup = page.locator(".dv-groupview").filter({ has: page.locator(".aux-camera-view--composer") });
            const popupPromise = page.waitForEvent("popup");
            await composerGroup.getByRole("button", { name: "Open panel group in a new window", exact: true }).click();
            const popup = await popupPromise;
            await popup.waitForLoadState("domcontentloaded");
            await popup.setViewportSize({ width: 480, height: 700 });
            const viewButton = popup.getByRole("button", { name: "View options", exact: true });
            await viewButton.waitFor({ state: "visible", timeout: 30000 });
            await viewButton.click();
            const disclosureId = await viewButton.getAttribute("aria-controls");
            await popup.waitForFunction(id => document.getElementById(id)?.matches(":popover-open"), disclosureId);
            const popupGeometry = await popup.locator(`#${disclosureId}`).evaluate(element => {
                const rect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                    viewportWidth: innerWidth, viewportHeight: innerHeight };
            });
            expect(popupGeometry.left).toBeGreaterThanOrEqual(8);
            expect(popupGeometry.right).toBeLessThanOrEqual(popupGeometry.viewportWidth - 8);
            expect(popupGeometry.top).toBeGreaterThanOrEqual(8);
            expect(popupGeometry.bottom).toBeLessThanOrEqual(popupGeometry.viewportHeight - 8);
            await page.setViewportSize({ width: 1366, height: 768 });
            await popup.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view--composer");
                const destination = window.opener.document.getElementById("aux-camera-views");
                destination.appendChild(panel);
                panel.dispatchEvent(new CustomEvent("moon-mission:dockview-panel-unmounted", { bubbles: true }));
            });
            const openerComposer = page.locator(".aux-camera-view--composer");
            await openerComposer.waitFor({ state: "visible", timeout: 30000 });
            const openerGeometry = await openerComposer.evaluate(async panel => {
                const content = panel.querySelector(".aux-camera-view__composer-sky-controls");
                content.setAttribute("popover", "auto");
                content.showPopover();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                const rect = content.getBoundingClientRect();
                return { ownerIsCurrent: panel.ownerDocument.defaultView === window,
                    left: rect.left, right: rect.right, viewportWidth: innerWidth };
            });
            expect(openerGeometry.ownerIsCurrent).toBe(true);
            expect(openerGeometry.left).toBeGreaterThanOrEqual(8);
            expect(openerGeometry.right).toBeLessThanOrEqual(openerGeometry.viewportWidth - 8);
            await popup.close();
        } finally { await context.close(); }
    }, TEST_TIMEOUT_MS * 2);

    it("keeps docked panels below the header and resizes Frame and Shoot with the workspace divider", async () => {
        for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
            const page = await browser.newPage({ viewport });
            try {
                await page.addInitScript(() => localStorage.clear());
                await page.goto(`${getEffectiveTestBaseUrl(process.cwd())}/artemis2/`, { waitUntil: "domcontentloaded" });
                await page.waitForFunction(() => document.getElementById("mission-loading-overlay")?.dataset.blocking === "false");
                await page.waitForSelector(".dockview-panels-enabled .aux-camera-view--composer");
                await page.waitForFunction(() => window.__moonMissionDockviewSpike?.api
                    .getPanel("aux:earth-rise-composer")?.group.id === "right-frame-shoot");
                const geometry = await page.evaluate(() => {
                    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
                    const composer = document.querySelector(".aux-camera-view--composer");
                    const group = composer.closest(".dv-groupview");
                    const groupRect = group.getBoundingClientRect();
                    const divider = [...document.querySelectorAll(".dv-sash:not(.disabled)")]
                        .map(e => ({ element: e, rect: e.getBoundingClientRect() }))
                        .find(({ rect: r }) => r.height > 100 && r.width < 20 && Math.abs(r.x + r.width / 2 - groupRect.left) < 12
                            && r.top <= groupRect.top + groupRect.height / 2 && r.bottom >= groupRect.top + groupRect.height / 2);
                    const rootStyle = getComputedStyle(document.documentElement);
                    return {
                        header: rect(".header"), host: rect("#experimental-dockview-host"),
                        transport: rect("#control-panel"), group: groupRect.toJSON(),
                        gripDisplay: getComputedStyle(composer.querySelector(".aux-camera-view__resize-grip")).display,
                        divider: divider ? { x: divider.rect.x + divider.rect.width / 2, y: groupRect.top + groupRect.height / 2 } : null,
                        tabSurface: getComputedStyle(group.querySelector(".dv-tabs-and-actions-container")).backgroundColor,
                        token: rootStyle.getPropertyValue("--ui-surface-1").trim(),
                    };
                });
                expect(geometry.host.top).toBeGreaterThanOrEqual(geometry.header.bottom);
                expect(geometry.host.bottom).toBeLessThanOrEqual(geometry.transport.top);
                expect(geometry.group.top).toBeGreaterThanOrEqual(geometry.host.top);
                expect(geometry.group.top - geometry.host.top).toBeLessThanOrEqual(12);
                expect(geometry.gripDisplay).toBe("none");
                // Catch a vendor theme overriding the shared tokens on a child shell.
                const expectedSurface = geometry.token.match(/\w\w/g).map(part => parseInt(part, 16));
                expect(geometry.tabSurface).toBe(`rgb(${expectedSurface.join(", ")})`);
                expect(geometry.divider).not.toBeNull();
                const screenshotDir = join(process.cwd(), "test/screenshots/current/design-review");
                mkdirSync(screenshotDir, { recursive: true });
                await page.screenshot({ path: join(screenshotDir, `artemis2-${viewport.width}.png`) });
                // The composer may start at its 280px minimum after bootstrap.
                // Grow it in that case; otherwise shrink it to leave room for
                // the main view at laptop widths.
                const dragDelta = geometry.group.width <= 300 ? -60 : 60;
                await page.mouse.move(geometry.divider.x, geometry.divider.y);
                await page.mouse.down();
                await page.mouse.move(geometry.divider.x + dragDelta, geometry.divider.y, { steps: 8 });
                await page.mouse.up();
                const resized = await page.locator(".aux-camera-view--composer").evaluate(e => e.closest(".dv-groupview").getBoundingClientRect().toJSON());
                expect((geometry.group.width - resized.width) * Math.sign(dragDelta), `divider drag at ${viewport.width}px: ${JSON.stringify({ before: geometry.group, after: resized })}`).toBeGreaterThan(20);

                const group = page.locator(".dv-groupview").filter({ has: page.locator(".aux-camera-view--composer") });
                await group.getByRole("button", { name: "Maximize panel group", exact: true }).click();
                await page.waitForFunction(width => document.querySelector(".aux-camera-view--composer").getBoundingClientRect().width > width * 1.5, geometry.group.width);
                await group.getByRole("button", { name: "Maximize panel group", exact: true }).click();
                await page.waitForFunction(width => document.querySelector(".aux-camera-view--composer").getBoundingClientRect().width < width * 1.5, geometry.group.width);
            } finally {
                await page.close();
            }
        }
    }, TEST_TIMEOUT_MS * 2);

    it("top-aligns the legacy right auxiliary stack without covering header controls", async () => {
        const baseUrl = getEffectiveTestBaseUrl(process.cwd());
        const viewports = [
            { width: 1920, height: 1080, wideDesktop: true },
            { width: 1366, height: 768, wideDesktop: false },
        ];

        for (const viewport of viewports) {
            const page = await browser.newPage({
                viewport: {
                    width: viewport.width,
                    height: viewport.height,
                },
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

                const layout = await page.evaluate(() => {
                    const rectFor = (element) => {
                        const rect = element?.getBoundingClientRect?.();
                        return rect
                            ? {
                                left: rect.left,
                                right: rect.right,
                                top: rect.top,
                                bottom: rect.bottom,
                                width: rect.width,
                                height: rect.height,
                            }
                            : null;
                    };
                    const panels = Array.from(document.querySelectorAll(
                        ".aux-camera-view:not(.aux-camera-view--composer)",
                    ))
                        .filter((panel) => !panel.hidden)
                        .map((panel) => ({
                            id: panel.dataset.panelId || "",
                            ...rectFor(panel),
                        }))
                        .sort((left, right) => left.top - right.top);
                    const firstPanel = panels[0];
                    const overlappingHeaderBottom = firstPanel
                        ? Array.from(document.querySelectorAll(
                            "#header-pill-strip button:not([hidden]), #header-pill-strip .header-pill-group:not([hidden])",
                        ))
                            .map(rectFor)
                            .filter((rect) => (
                                rect &&
                                rect.width > 0 &&
                                rect.height > 0 &&
                                rect.left < firstPanel.right &&
                                rect.right > firstPanel.left
                            ))
                            .reduce((bottom, rect) => Math.max(bottom, rect.bottom), 0)
                        : 0;

                    return {
                        panels,
                        composer: rectFor(document.querySelector(".aux-camera-view--composer")),
                        controlPanel: rectFor(document.getElementById("control-panel")),
                        header: rectFor(document.querySelector(".header")),
                        toggle: rectFor(document.getElementById("blurb-toggle")),
                        overlappingHeaderBottom,
                    };
                });

                expect(layout.panels).toHaveLength(3);
                for (let leftIndex = 0; leftIndex < layout.panels.length; leftIndex += 1) {
                    for (let rightIndex = leftIndex + 1; rightIndex < layout.panels.length; rightIndex += 1) {
                        const left = layout.panels[leftIndex];
                        const right = layout.panels[rightIndex];
                        const overlaps = left.left < right.right &&
                            left.right > right.left &&
                            left.top < right.bottom &&
                            left.bottom > right.top;
                        expect(overlaps).toBe(false);
                    }
                }
                for (const panel of layout.panels) {
                    const overlapsComposer = panel.left < layout.composer.right &&
                        panel.right > layout.composer.left &&
                        panel.top < layout.composer.bottom &&
                        panel.bottom > layout.composer.top;
                    expect(overlapsComposer).toBe(false);
                }
                expect(layout.composer.bottom).toBeLessThanOrEqual(layout.controlPanel.top - 6);
                expect(layout.composer.top).toBeGreaterThanOrEqual(layout.header.bottom + 6);
                expect(layout.composer.top - layout.header.bottom).toBeLessThanOrEqual(10);

                if (viewport.wideDesktop) {
                    expect(layout.panels[0].top).toBeLessThan(layout.panels[1].top);
                    expect(layout.panels[1].bottom).toBeLessThanOrEqual(layout.panels[2].top);
                    expect(layout.overlappingHeaderBottom).toBe(0);
                    expect(layout.panels[0].top).toBeGreaterThan(layout.toggle.bottom);
                    expect(layout.panels[0].top - layout.toggle.bottom).toBeLessThanOrEqual(10);
                } else {
                    for (const panel of layout.panels) {
                        expect(panel.top).toBeGreaterThanOrEqual(layout.header.bottom + 6);
                        expect(panel.bottom).toBeLessThanOrEqual(layout.controlPanel.top - 6);
                    }
                }
            } finally {
                await page.close();
            }
        }
    }, TEST_TIMEOUT_MS);

    it("keeps the desktop transport controls clickable at 1920x1080 when Mission Media is closed", async () => {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
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

            await page.waitForFunction(
                () => document.getElementById("media-browser-panel-wrapper")?.hidden === false,
                { timeout: 10000 },
            );
            await page.evaluate(() => {
                const panel = document.getElementById("media-browser-panel");
                if (panel && !panel.classList.contains("media-browser-panel--hidden")) {
                    document.getElementById("panel-pill-media")?.click();
                }
            });
            await page.waitForFunction(
                () => document.getElementById("media-browser-panel")?.classList.contains("media-browser-panel--hidden"),
                { timeout: 10000 },
            );

            const hitTarget = await page.evaluate(() => {
                const playButton = document.getElementById("animate");
                const playRect = playButton?.getBoundingClientRect?.();
                const timelineRect = document.getElementById("timeline-dock")?.getBoundingClientRect?.();
                const controlRect = document.getElementById("control-panel")?.getBoundingClientRect?.();
                if (!playRect || !timelineRect || !controlRect) return null;
                const topElement = document.elementFromPoint(
                    playRect.left + (playRect.width / 2),
                    playRect.top + (playRect.height / 2),
                );
                return {
                    topElementId: topElement?.id || "",
                    playBottom: playRect.bottom,
                    controlBottom: controlRect.bottom,
                    timelineTop: timelineRect.top,
                };
            });

            expect(hitTarget).not.toBeNull();
            expect(hitTarget.topElementId).toBe("animate");
            expect(hitTarget.playBottom).toBeLessThanOrEqual(hitTarget.timelineTop - 2);
            expect(hitTarget.controlBottom).toBeLessThanOrEqual(hitTarget.timelineTop - 2);
        } finally {
            await page.close();
        }
    }, TEST_TIMEOUT_MS);

    it("resizes the legacy Frame and Shoot panel while texture requests are pending", async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const baseUrl = getEffectiveTestBaseUrl(process.cwd());
        let releaseTextures;
        let pendingTextures = 0;
        const texturesReady = new Promise((resolve) => { releaseTextures = resolve; });

        try {
            await page.addInitScript(() => localStorage.clear());
            await page.route(/\.(jpg|jpeg|png|webp)(\?|$)/i, async (route) => {
                const url = route.request().url();
                if (url.includes("/images/") || url.includes("/assets/")) {
                    pendingTextures += 1;
                    await texturesReady;
                    pendingTextures -= 1;
                }
                await route.continue();
            });

            await page.goto(`${baseUrl}/artemis2/?legacyPanels=1`, {
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

            await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view--composer");
                panel.style.left = "96px";
                panel.style.top = "96px";
                panel.style.right = "auto";
                panel.style.bottom = "auto";
                panel.style.width = "600px";
                panel.style.height = "360px";
            });
            await page.waitForTimeout(100);

            const before = await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view--composer");
                const scene = window.animationScenes?.geo || window.animationScenes?.lunar || null;
                const rect = panel.getBoundingClientRect();
                return {
                    width: rect.width,
                    height: rect.height,
                    x: rect.right - 10,
                    y: rect.bottom - 10,
                    textureState: scene?.textureLoadState || "",
                    topClass: String(document.elementFromPoint(rect.right - 10, rect.bottom - 10)?.className || ""),
                };
            });

            expect(before.topClass).toContain("aux-camera-view__resize-grip");
            expect(pendingTextures).toBeGreaterThan(0);
            expect(["deferred", "loading"]).toContain(before.textureState);

            await page.mouse.move(before.x, before.y);
            await page.mouse.down();
            await page.mouse.move(before.x + 120, before.y + 80, { steps: 5 });
            await page.mouse.up();
            await page.waitForTimeout(200);

            const after = await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view--composer");
                const rect = panel.getBoundingClientRect();
                return {
                    width: rect.width,
                    height: rect.height,
                };
            });

            expect(after.width).toBeGreaterThan(before.width + 80);
            expect(after.height).toBeGreaterThan(before.height + 40);

            const beforeTopLeft = await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view--composer");
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

            expect(beforeTopLeft.topClass).toContain("aux-camera-view__resize-grip");

            await page.mouse.move(beforeTopLeft.x, beforeTopLeft.y);
            await page.mouse.down();
            await page.mouse.move(beforeTopLeft.x - 90, beforeTopLeft.y - 60, { steps: 5 });
            await page.mouse.up();
            await page.waitForTimeout(200);

            const afterTopLeft = await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view--composer");
                const rect = panel.getBoundingClientRect();
                return {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                };
            });

            expect(afterTopLeft.left).toBeLessThan(beforeTopLeft.left - 50);
            expect(afterTopLeft.top).toBeLessThan(beforeTopLeft.top - 30);
            expect(afterTopLeft.width).toBeGreaterThan(beforeTopLeft.width + 50);
            expect(afterTopLeft.height).toBeGreaterThan(beforeTopLeft.height + 30);
        } finally {
            releaseTextures();
            await page.close();
        }
    }, TEST_TIMEOUT_MS);

    it("lets a maximized legacy Frame and Shoot panel be resized from a corner", async () => {
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

            await page.evaluate(() => {
                document.querySelector(".aux-camera-view--composer .aux-camera-view__expand-button")?.click();
            });
            await page.waitForFunction(
                () => document.querySelector(".aux-camera-view--composer")?.classList.contains("is-maximized"),
                { timeout: 5000 },
            );

            const before = await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view--composer");
                const rect = panel.getBoundingClientRect();
                return {
                    width: rect.width,
                    height: rect.height,
                    x: rect.right - 10,
                    y: rect.bottom - 10,
                    maximized: panel.classList.contains("is-maximized"),
                    topClass: String(document.elementFromPoint(rect.right - 10, rect.bottom - 10)?.className || ""),
                };
            });

            expect(before.maximized).toBe(true);
            expect(before.topClass).toContain("aux-camera-view__resize-grip");

            await page.mouse.move(before.x, before.y);
            await page.mouse.down();
            await page.mouse.move(before.x - 140, before.y - 90, { steps: 6 });
            await page.mouse.up();
            await page.waitForTimeout(200);

            const after = await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view--composer");
                const rect = panel.getBoundingClientRect();
                const expandButton = panel.querySelector(".aux-camera-view__expand-button");
                return {
                    width: rect.width,
                    height: rect.height,
                    maximized: panel.classList.contains("is-maximized"),
                    expandPressed: expandButton?.getAttribute("aria-pressed"),
                };
            });

            expect(after.maximized).toBe(false);
            expect(after.expandPressed).toBe("false");
            expect(after.width).toBeLessThan(before.width - 80);
            expect(after.height).toBeLessThan(before.height - 50);
        } finally {
            await page.close();
        }
    }, TEST_TIMEOUT_MS);

    it("zooms regular auxiliary panels with the mouse wheel", async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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

            await page.locator(".workspace-tools__summary").click();
            await page.locator('[data-workspace-panel="aux:earth"]').click();
            await page.waitForFunction(() => window.__moonMissionDockviewSpike.api.getPanel("aux:earth")?.api.isVisible);

            await page.waitForFunction(
                () => {
                    const panel = document.querySelector(".aux-camera-view[data-target='earth']:not(.aux-camera-view--composer)");
                    return panel && !panel.hidden;
                },
                { timeout: 10000 },
            );

            const before = await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view[data-target='earth']:not(.aux-camera-view--composer)");
                const viewport = panel.querySelector(".aux-camera-view__viewport");
                const rect = viewport.getBoundingClientRect();
                const valueText = panel.querySelector(".aux-camera-view__fov-value")?.textContent?.trim() || "";
                return {
                    fov: Number.parseFloat(valueText),
                    x: rect.left + rect.width * 0.5,
                    y: rect.top + rect.height * 0.5,
                    autoPressed: panel.querySelector(".aux-camera-view__auto-toggle")?.getAttribute("aria-pressed"),
                };
            });

            expect(before.autoPressed).toBe("true");

            await page.mouse.move(before.x, before.y);
            await page.mouse.wheel(0, -1000);
            await page.waitForTimeout(150);

            const after = await page.evaluate(() => {
                const panel = document.querySelector(".aux-camera-view[data-target='earth']:not(.aux-camera-view--composer)");
                const valueText = panel.querySelector(".aux-camera-view__fov-value")?.textContent?.trim() || "";
                return {
                    fov: Number.parseFloat(valueText),
                    autoPressed: panel.querySelector(".aux-camera-view__auto-toggle")?.getAttribute("aria-pressed"),
                    sliderDisabled: panel.querySelector(".aux-camera-view__fov-slider")?.disabled,
                };
            });

            expect(after.autoPressed).toBe("false");
            expect(after.sliderDisabled).toBe(false);
            expect(after.fov).toBeLessThan(before.fov);
        } finally {
            await page.close();
        }
    }, TEST_TIMEOUT_MS);
});
