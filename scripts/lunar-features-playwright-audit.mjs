import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const BASE_URL = process.env.LUNAR_FEATURES_AUDIT_URL || "http://127.0.0.1:7274/artemis2/?testMode=true";
const OUTPUT_ROOT = path.resolve(
    process.cwd(),
    "test-artifacts",
    "lunar-features-audit",
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
        .slice(0, 80) || "step";
}

async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function capturePanelShot(page, filePath) {
    const panel = page.locator("#lunar-crater-controls-panel");
    const isVisible = await panel.isVisible().catch(() => false);
    if (isVisible) {
        await panel.scrollIntoViewIfNeeded();
        await panel.screenshot({ path: filePath });
        return;
    }
    await page.screenshot({ path: filePath, fullPage: false });
}

async function run() {
    ensureDir(OUTPUT_ROOT);
    const log = [];
    const tests = [];
    let stepCounter = 0;

    const browser = await chromium.launch({
        headless: true,
        args: [
            "--disable-dev-shm-usage",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-gpu",
        ],
    });

    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();

    try {
        await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 120000 });
        await page.waitForSelector("#toggle-pill-lunar-craters", { timeout: 60000 });
        await page.waitForTimeout(1500);

        await page.click("#toggle-pill-lunar-craters");
        await page.waitForSelector("#lunar-crater-controls-panel:not([hidden])", { timeout: 10000 });

        async function recordTest(name, actionFn, verifyFn) {
            stepCounter += 1;
            const prefix = `${String(stepCounter).padStart(3, "0")}-${slugify(name)}`;
            const beforePath = path.join(OUTPUT_ROOT, `${prefix}-before.png`);
            const afterPath = path.join(OUTPUT_ROOT, `${prefix}-after.png`);
            await capturePanelShot(page, beforePath);
            await actionFn();
            await wait(300);
            if (verifyFn) {
                await verifyFn();
            }
            await capturePanelShot(page, afterPath);
            tests.push({
                step: stepCounter,
                name,
                before: beforePath,
                after: afterPath,
                status: "passed",
            });
        }

        await recordTest(
            "Display Show Always",
            async () => {
                await page.click("#lunar-crater-visible-toggle");
            },
            async () => {
                const pressed = await page.getAttribute("#lunar-crater-visible-toggle", "aria-pressed");
                if (pressed !== "true") throw new Error("Show Always did not activate.");
            },
        );

        await recordTest(
            "Display Show On Hover",
            async () => {
                await page.click("#lunar-crater-hover-toggle");
            },
            async () => {
                const pressed = await page.getAttribute("#lunar-crater-hover-toggle", "aria-pressed");
                if (pressed !== "true") throw new Error("Show On Hover did not activate.");
            },
        );

        await recordTest(
            "Display Off",
            async () => {
                await page.click("#lunar-crater-off-toggle");
            },
            async () => {
                const pressed = await page.getAttribute("#lunar-crater-off-toggle", "aria-pressed");
                if (pressed !== "true") throw new Error("Off did not activate.");
            },
        );

        for (const presetId of ["none", "default", "all"]) {
            await recordTest(
                `Preset ${presetId}`,
                async () => {
                    await page.click(`[data-preset-id="${presetId}"]`);
                },
                async () => {
                    const pressed = await page.getAttribute(`[data-preset-id="${presetId}"]`, "aria-pressed");
                    if (pressed !== "true") throw new Error(`Preset ${presetId} did not activate.`);
                },
            );
        }

        await recordTest(
            "Global Min Diameter Step Down",
            async () => {
                await page.click("#lunar-crater-min-diameter-step-down");
                await wait(220);
            },
            async () => {},
        );
        await recordTest(
            "Global Min Diameter Step Up",
            async () => {
                await page.click("#lunar-crater-min-diameter-step-up");
                await wait(220);
            },
            async () => {},
        );
        await recordTest(
            "Global Max Diameter Step Down",
            async () => {
                await page.click("#lunar-crater-max-diameter-step-down");
                await wait(220);
            },
            async () => {},
        );
        await recordTest(
            "Global Max Diameter Step Up",
            async () => {
                await page.click("#lunar-crater-max-diameter-step-up");
                await wait(220);
            },
            async () => {},
        );
        await recordTest(
            "Global Min Diameter Slider Drag",
            async () => {
                await page.locator("#lunar-crater-min-diameter").fill("100");
                await page.locator("#lunar-crater-min-diameter").dispatchEvent("change");
                await wait(220);
            },
            async () => {},
        );
        await recordTest(
            "Global Max Diameter Slider Drag",
            async () => {
                await page.locator("#lunar-crater-max-diameter").fill("500");
                await page.locator("#lunar-crater-max-diameter").dispatchEvent("change");
                await wait(220);
            },
            async () => {},
        );

        const featureTypes = await page.$$eval(
            ".lunar-crater-controls-panel__type-row",
            (rows) => rows.map((row) => row.getAttribute("data-feature-type")).filter(Boolean),
        );

        for (const featureType of featureTypes) {
            const rowSelector = `.lunar-crater-controls-panel__type-row[data-feature-type="${featureType}"]`;
            const toggleSelector = `${rowSelector} .lunar-crater-controls-panel__type-toggle`;

            await recordTest(
                `Type Toggle ${featureType} Off`,
                async () => {
                    await page.locator(rowSelector).scrollIntoViewIfNeeded();
                    const checked = await page.isChecked(toggleSelector);
                    if (checked) {
                        await page.click(toggleSelector);
                    }
                },
                async () => {
                    const checked = await page.isChecked(toggleSelector);
                    if (checked) throw new Error(`Type ${featureType} did not turn off.`);
                },
            );

            await recordTest(
                `Type Toggle ${featureType} On`,
                async () => {
                    await page.locator(rowSelector).scrollIntoViewIfNeeded();
                    const checked = await page.isChecked(toggleSelector);
                    if (!checked) {
                        await page.click(toggleSelector);
                    }
                },
                async () => {
                    const checked = await page.isChecked(toggleSelector);
                    if (!checked) throw new Error(`Type ${featureType} did not turn on.`);
                },
            );

            await recordTest(
                `Type Min ${featureType}`,
                async () => {
                    await page.locator(rowSelector).scrollIntoViewIfNeeded();
                    const minInput = page.locator(`${rowSelector} .lunar-crater-controls-panel__type-number`).first();
                    await minInput.fill("50");
                    await minInput.dispatchEvent("change");
                    await wait(220);
                },
                async () => {},
            );

            await recordTest(
                `Type Max ${featureType}`,
                async () => {
                    await page.locator(rowSelector).scrollIntoViewIfNeeded();
                    const maxInput = page.locator(`${rowSelector} .lunar-crater-controls-panel__type-number`).nth(1);
                    await maxInput.fill("600");
                    await maxInput.dispatchEvent("change");
                    await wait(220);
                },
                async () => {},
            );
        }

        await recordTest(
            "Group Scenario Mare Only + Show Always",
            async () => {
                await page.click('[data-preset-id="none"]');
                const allRows = page.locator(".lunar-crater-controls-panel__type-row");
                const count = await allRows.count();
                for (let i = 0; i < count; i += 1) {
                    const row = allRows.nth(i);
                    const type = await row.getAttribute("data-feature-type");
                    const toggle = row.locator(".lunar-crater-controls-panel__type-toggle");
                    const shouldEnable = type === "Mare, maria";
                    const isChecked = await toggle.isChecked();
                    if (shouldEnable && !isChecked) {
                        await toggle.click();
                    } else if (!shouldEnable && isChecked) {
                        await toggle.click();
                    }
                }
                await page.click("#lunar-crater-visible-toggle");
                await wait(450);
            },
            async () => {
                const showAlways = await page.getAttribute("#lunar-crater-visible-toggle", "aria-pressed");
                if (showAlways !== "true") throw new Error("Group scenario failed to set Show Always.");
                const mareRowChecked = await page.isChecked(
                    '.lunar-crater-controls-panel__type-row[data-feature-type="Mare, maria"] .lunar-crater-controls-panel__type-toggle',
                );
                if (!mareRowChecked) throw new Error("Mare type not enabled in group scenario.");
            },
        );

        await recordTest(
            "Close Panel",
            async () => {
                await page.click("#lunar-crater-close");
            },
            async () => {
                const hidden = await page.locator("#lunar-crater-controls-panel").evaluate((el) => el.hidden === true);
                if (!hidden) throw new Error("Panel did not close.");
            },
        );

        await recordTest(
            "Reopen Panel From Pill",
            async () => {
                await page.click("#toggle-pill-lunar-craters");
            },
            async () => {
                const hidden = await page.locator("#lunar-crater-controls-panel").evaluate((el) => el.hidden === true);
                if (hidden) throw new Error("Panel did not reopen.");
            },
        );

        const reportPath = path.join(OUTPUT_ROOT, "report.json");
        fs.writeFileSync(
            reportPath,
            JSON.stringify(
                {
                    baseUrl: BASE_URL,
                    outputRoot: OUTPUT_ROOT,
                    tests,
                },
                null,
                2,
            ),
            "utf8",
        );
        log.push(`Audit complete. Report: ${reportPath}`);
        log.push(`Screenshots: ${OUTPUT_ROOT}`);
        console.log(log.join("\n"));
    } finally {
        await context.close();
        await browser.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
