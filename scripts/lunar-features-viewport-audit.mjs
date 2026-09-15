import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const BASE_URL = process.env.LUNAR_FEATURES_AUDIT_URL || "http://127.0.0.1:7274/artemis2/?testMode=true";
const OUTPUT_ROOT = path.resolve(
    process.cwd(),
    "test-artifacts",
    "lunar-features-viewport-audit",
    new Date().toISOString().replace(/[:.]/g, "-"),
);

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 90) || "step";
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCountText(raw) {
    const match = String(raw || "").match(/([0-9][0-9,]*)/);
    if (!match) return null;
    return Number(match[1].replace(/,/g, ""));
}

function computeDiffStats(beforePath, afterPath, diffPath) {
    const before = PNG.sync.read(fs.readFileSync(beforePath));
    const after = PNG.sync.read(fs.readFileSync(afterPath));
    if (before.width !== after.width || before.height !== after.height) {
        throw new Error("Before/after screenshot dimensions differ.");
    }
    const diff = new PNG({ width: before.width, height: before.height });
    const diffPixels = pixelmatch(
        before.data,
        after.data,
        diff.data,
        before.width,
        before.height,
        { threshold: 0.1 },
    );
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    const total = before.width * before.height;
    return {
        diffPixels,
        totalPixels: total,
        diffRatio: total > 0 ? diffPixels / total : 0,
    };
}

async function openPanel(page) {
    await page.click("#toggle-pill-lunar-craters");
    await page.waitForSelector("#lunar-crater-controls-panel:not([hidden])", { timeout: 15000 });
}

async function closePanel(page) {
    const panelVisible = await page.locator("#lunar-crater-controls-panel").isVisible().catch(() => false);
    if (!panelVisible) return;
    await page.click("#lunar-crater-close");
    await page.waitForFunction(() => {
        const panel = document.getElementById("lunar-crater-controls-panel");
        return !!panel && panel.hidden === true;
    }, { timeout: 15000 });
}

async function setBaseFilterState(page) {
    await openPanel(page);
    await page.click('[data-preset-id="all"]');
    await page.click("#lunar-crater-visible-toggle");
    await page.locator("#lunar-crater-min-diameter").fill("0");
    await page.locator("#lunar-crater-min-diameter").dispatchEvent("change");
    await page.locator("#lunar-crater-max-diameter").fill("600");
    await page.locator("#lunar-crater-max-diameter").dispatchEvent("change");
    await sleep(500);
    await closePanel(page);
    await sleep(600);
}

async function setMoonFraming(page) {
    await page.click("#follow-pill-moon");
    await sleep(800);

    // Zoom in strongly so Moon fills the viewport.
    const viewport = page.viewportSize() || { width: 1600, height: 1000 };
    const centerX = Math.round(viewport.width * 0.52);
    const centerY = Math.round(viewport.height * 0.53);
    for (let i = 0; i < 22; i += 1) {
        await page.mouse.move(centerX, centerY);
        await page.mouse.wheel(0, -1300);
        await sleep(40);
    }

    // Drag a little to keep a mostly lit face with a bit of night side.
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 140, centerY + 40, { steps: 16 });
    await page.mouse.up();
    await sleep(900);
}

async function captureViewport(page, filePath) {
    await page.screenshot({ path: filePath, fullPage: false });
}

async function main() {
    ensureDir(OUTPUT_ROOT);
    const browser = await chromium.launch({
        headless: true,
        args: [
            "--disable-dev-shm-usage",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
        ],
    });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();

    const results = [];
    let stepIndex = 0;

    const runStep = async ({
        name,
        action,
        expectCountChange = false,
        minDiffRatio = 0.0005,
    }) => {
        stepIndex += 1;
        const id = `${String(stepIndex).padStart(3, "0")}-${slugify(name)}`;
        const beforePath = path.join(OUTPUT_ROOT, `${id}-before.png`);
        const afterPath = path.join(OUTPUT_ROOT, `${id}-after.png`);
        const diffPath = path.join(OUTPUT_ROOT, `${id}-diff.png`);
        const panelBeforePath = path.join(OUTPUT_ROOT, `${id}-panel-before.png`);
        const panelAfterPath = path.join(OUTPUT_ROOT, `${id}-panel-after.png`);

        await setBaseFilterState(page);
        await openPanel(page);
        await page.locator("#lunar-crater-controls-panel").screenshot({ path: panelBeforePath });
        const countBeforeText = await page.locator("#lunar-crater-count-value").innerText().catch(() => "");
        const countBefore = parseCountText(countBeforeText);
        await closePanel(page);
        await sleep(450);

        await captureViewport(page, beforePath);

        await openPanel(page);
        await action();
        await sleep(650);
        const countAfterText = await page.locator("#lunar-crater-count-value").innerText().catch(() => "");
        const countAfter = parseCountText(countAfterText);
        await page.locator("#lunar-crater-controls-panel").screenshot({ path: panelAfterPath });
        await closePanel(page);
        await sleep(450);

        await captureViewport(page, afterPath);
        const diffStats = computeDiffStats(beforePath, afterPath, diffPath);

        const countChanged = Number.isFinite(countBefore) && Number.isFinite(countAfter) && countBefore !== countAfter;
        const visualChanged = diffStats.diffRatio >= minDiffRatio;
        const pass = (expectCountChange ? countChanged : true) && visualChanged;

        results.push({
            step: stepIndex,
            name,
            before: beforePath,
            after: afterPath,
            diff: diffPath,
            panelBefore: panelBeforePath,
            panelAfter: panelAfterPath,
            countBefore,
            countAfter,
            countChanged,
            diffPixels: diffStats.diffPixels,
            totalPixels: diffStats.totalPixels,
            diffRatio: diffStats.diffRatio,
            minDiffRatio,
            status: pass ? "passed" : "failed",
            failureReason: pass
                ? ""
                : `visualChanged=${visualChanged}, countChanged=${countChanged}, expectCountChange=${expectCountChange}`,
        });
    };

    try {
        await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 120000 });
        await page.waitForSelector("#toggle-pill-lunar-craters", { timeout: 60000 });
        await sleep(1800);
        await setMoonFraming(page);

        await runStep({
            name: "Display Off",
            action: async () => { await page.click("#lunar-crater-off-toggle"); },
            expectCountChange: false,
            minDiffRatio: 0.0012,
        });
        await runStep({
            name: "Display Show Always",
            action: async () => { await page.click("#lunar-crater-visible-toggle"); },
            expectCountChange: false,
            minDiffRatio: 0.0012,
        });
        await runStep({
            name: "Display Show On Hover",
            action: async () => { await page.click("#lunar-crater-hover-toggle"); },
            expectCountChange: false,
            minDiffRatio: 0.0012,
        });

        for (const presetId of ["none", "default", "all"]) {
            await runStep({
                name: `Preset ${presetId}`,
                action: async () => { await page.click(`[data-preset-id="${presetId}"]`); },
                expectCountChange: true,
                minDiffRatio: 0.0007,
            });
        }

        await runStep({
            name: "Global Min Step Down",
            action: async () => {
                for (let i = 0; i < 8; i += 1) await page.click("#lunar-crater-min-diameter-step-down");
            },
            expectCountChange: true,
            minDiffRatio: 0.0004,
        });
        await runStep({
            name: "Global Min Step Up",
            action: async () => {
                for (let i = 0; i < 8; i += 1) await page.click("#lunar-crater-min-diameter-step-up");
            },
            expectCountChange: true,
            minDiffRatio: 0.0004,
        });
        await runStep({
            name: "Global Max Step Down",
            action: async () => {
                for (let i = 0; i < 8; i += 1) await page.click("#lunar-crater-max-diameter-step-down");
            },
            expectCountChange: true,
            minDiffRatio: 0.0004,
        });
        await runStep({
            name: "Global Max Step Up",
            action: async () => {
                for (let i = 0; i < 8; i += 1) await page.click("#lunar-crater-max-diameter-step-up");
            },
            expectCountChange: true,
            minDiffRatio: 0.0004,
        });
        await runStep({
            name: "Global Min Slider",
            action: async () => {
                await page.locator("#lunar-crater-min-diameter").fill("220");
                await page.locator("#lunar-crater-min-diameter").dispatchEvent("change");
            },
            expectCountChange: true,
            minDiffRatio: 0.0004,
        });
        await runStep({
            name: "Global Max Slider",
            action: async () => {
                await page.locator("#lunar-crater-max-diameter").fill("280");
                await page.locator("#lunar-crater-max-diameter").dispatchEvent("change");
            },
            expectCountChange: true,
            minDiffRatio: 0.0004,
        });

        const featureTypes = await page.$$eval(
            ".lunar-crater-controls-panel__type-row",
            (rows) => rows.map((row) => row.getAttribute("data-feature-type")).filter(Boolean),
        );

        for (const featureType of featureTypes) {
            const rowSelector = `.lunar-crater-controls-panel__type-row[data-feature-type="${featureType}"]`;
            const toggleSelector = `${rowSelector} .lunar-crater-controls-panel__type-toggle`;

            await runStep({
                name: `Type Toggle ${featureType}`,
                action: async () => {
                    await page.locator(rowSelector).scrollIntoViewIfNeeded();
                    await page.click(toggleSelector);
                },
                expectCountChange: true,
                minDiffRatio: 0.00035,
            });

            await runStep({
                name: `Type Min ${featureType}`,
                action: async () => {
                    await page.locator(rowSelector).scrollIntoViewIfNeeded();
                    const minInput = page.locator(`${rowSelector} .lunar-crater-controls-panel__type-number`).first();
                    await minInput.fill("180");
                    await minInput.dispatchEvent("change");
                },
                expectCountChange: true,
                minDiffRatio: 0.0003,
            });

            await runStep({
                name: `Type Max ${featureType}`,
                action: async () => {
                    await page.locator(rowSelector).scrollIntoViewIfNeeded();
                    const maxInput = page.locator(`${rowSelector} .lunar-crater-controls-panel__type-number`).nth(1);
                    await maxInput.fill("260");
                    await maxInput.dispatchEvent("change");
                },
                expectCountChange: true,
                minDiffRatio: 0.0003,
            });
        }

        await runStep({
            name: "Group Mare Only Show Always",
            action: async () => {
                await page.click('[data-preset-id="all"]');
                const rows = page.locator(".lunar-crater-controls-panel__type-row");
                const rowCount = await rows.count();
                for (let i = 0; i < rowCount; i += 1) {
                    const row = rows.nth(i);
                    const type = await row.getAttribute("data-feature-type");
                    const toggle = row.locator(".lunar-crater-controls-panel__type-toggle");
                    const checked = await toggle.isChecked();
                    const shouldBeOn = type === "Mare, maria";
                    if (shouldBeOn !== checked) {
                        await toggle.click();
                    }
                }
                await page.click("#lunar-crater-visible-toggle");
            },
            expectCountChange: true,
            minDiffRatio: 0.001,
        });

        await setBaseFilterState(page);
        await openPanel(page);
        const closeBefore = path.join(OUTPUT_ROOT, "999-close-before.png");
        const closeAfter = path.join(OUTPUT_ROOT, "999-close-after.png");
        await captureViewport(page, closeBefore);
        await closePanel(page);
        await sleep(300);
        await captureViewport(page, closeAfter);
        results.push({
            step: results.length + 1,
            name: "Panel Close Control",
            before: closeBefore,
            after: closeAfter,
            diff: "",
            panelBefore: "",
            panelAfter: "",
            countBefore: null,
            countAfter: null,
            countChanged: false,
            diffPixels: null,
            totalPixels: null,
            diffRatio: null,
            minDiffRatio: null,
            status: "passed",
            failureReason: "",
        });

        const failed = results.filter((entry) => entry.status !== "passed");
        const report = {
            baseUrl: BASE_URL,
            outputRoot: OUTPUT_ROOT,
            total: results.length,
            passed: results.length - failed.length,
            failed: failed.length,
            failures: failed.map(({ step, name, failureReason }) => ({ step, name, failureReason })),
            tests: results,
        };
        const reportPath = path.join(OUTPUT_ROOT, "report.json");
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

        console.log(`Viewport audit complete: ${reportPath}`);
        if (failed.length) {
            console.log(`Failures: ${failed.length}`);
            process.exitCode = 2;
        } else {
            console.log("All tests passed.");
        }
    } finally {
        await context.close();
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
