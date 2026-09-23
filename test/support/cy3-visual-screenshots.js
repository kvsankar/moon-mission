import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { ssim } from "ssim.js";
import { expect } from "vitest";
import { TIMEOUTS, TOLERANCE, UPDATE_SSIM_BASELINES, RETAINED_SSIM_BASELINES } from "./cy3-visual-config.js";
import { ensureHeaderPillStripCollapsed } from "./cy3-visual-controls.js";

async function displayTestId(page, testId) {
  console.log(`Displaying test ID: ${testId}`);
  await page.evaluate((text) => {
    const testIdElement = document.getElementById('test-id-display');
    if (testIdElement) {
      testIdElement.innerHTML = text;
    }
  }, testId);
}

async function hideTestIdForScreenshot(page) {
  // Store current test ID content and hide it temporarily for screenshot
  return await page.evaluate(() => {
    const testIdElement = document.getElementById('test-id-display');
    if (testIdElement) {
      const currentContent = testIdElement.innerHTML;
      testIdElement.innerHTML = '';
      return currentContent;
    }
    return null;
  });
}

async function restoreTestId(page, testIdContent) {
  // Restore the test ID content after screenshot
  await page.evaluate((content) => {
    const testIdElement = document.getElementById('test-id-display');
    if (testIdElement && content) {
      testIdElement.innerHTML = content;
    }
  }, testIdContent);
}


async function hideChromeForScreenshot(page) {
  return await page.evaluate(() => {
    const selectors = [
      '#control-panel',
      '#timeline-dock',
      '#orbit-status-stack',
      '#info-panel-wrapper',
      '#fps-counter',
      '#test-id-display',
      '#settings-panel',
    ];

    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return { selector, present: false };
      }

      const previousVisibility = element.style.visibility;
      const previousOpacity = element.style.opacity;
      const previousPointerEvents = element.style.pointerEvents;

      element.style.visibility = 'hidden';
      element.style.opacity = '0';
      element.style.pointerEvents = 'none';

      return {
        selector,
        present: true,
        previousVisibility,
        previousOpacity,
        previousPointerEvents,
      };
    });
  });
}

async function restoreChromeAfterScreenshot(page, chromeState) {
  await page.evaluate((state) => {
    (state || []).forEach((entry) => {
      if (!entry?.present) {
        return;
      }
      const element = document.querySelector(entry.selector);
      if (!element) {
        return;
      }
      element.style.visibility = entry.previousVisibility || '';
      element.style.opacity = entry.previousOpacity || '';
      element.style.pointerEvents = entry.previousPointerEvents || '';
    });
  }, chromeState);
}

async function getComparisonCropBounds(page) {
  return await page.evaluate(() => {
    const screenshotHeight = window.innerHeight || 0;
    const screenshotWidth = window.innerWidth || 0;
    const cropAnchors = [
      '#control-panel',
      '#timeline-dock',
      '#orbit-status-stack',
      '#info-panel-wrapper',
    ]
      .map((selector) => document.querySelector(selector))
      .filter(Boolean)
      .map((element) => element.getBoundingClientRect().top)
      .filter((top) => Number.isFinite(top) && top > 0);

    const cropBottom = cropAnchors.length
      ? Math.max(1, Math.min(...cropAnchors))
      : screenshotHeight;
    const headerBottom = document.querySelector('#header')?.getBoundingClientRect().bottom || 0;
    const cropTop = Math.max(0, Math.min(Math.ceil(headerBottom), Math.floor(cropBottom) - 1));

    return {
      x: 0,
      y: cropTop,
      width: screenshotWidth,
      height: Math.max(1, Math.min(screenshotHeight, Math.floor(cropBottom)) - cropTop),
    };
  });
}

function cropPngImage(png, bounds) {
  const x = Math.max(0, Math.min(png.width - 1, Math.floor(bounds.x || 0)));
  const y = Math.max(0, Math.min(png.height - 1, Math.floor(bounds.y || 0)));
  const width = Math.max(1, Math.min(png.width - x, Math.floor(bounds.width || png.width)));
  const height = Math.max(1, Math.min(png.height - y, Math.floor(bounds.height || png.height)));
  const cropped = new PNG({ width, height });

  for (let row = 0; row < height; row += 1) {
    const srcStart = ((y + row) * png.width + x) * 4;
    const srcEnd = srcStart + (width * 4);
    const destStart = row * width * 4;
    png.data.copy(cropped.data, destStart, srcStart, srcEnd);
  }

  return cropped;
}

// CI environments need longer timeouts due to software WebGL rendering
// Latest-run scores are diagnostic output only. Pass/fail is owned by each
// reviewed baseline's direct SSIM threshold, not comparison with an old score.
const SSIM_LATEST_FILE = join(process.cwd(), 'test', 'screenshots', 'ssim-latest.json');
let ssimScores = {};  // Collects current run's SSIM scores

/**
 * Write latest-run SSIM scores to an ignored file (for reporting/debugging).
 * @param {Record<string, number>} scores - The SSIM scores from the current test run
 */
function writeSsimLatest(scores) {
  try {
    const payload = {
      runAt: new Date().toISOString(),
      scores
    };
    writeFileSync(SSIM_LATEST_FILE, JSON.stringify(payload, null, 2));
    console.log(`SSIM latest scores written to ${SSIM_LATEST_FILE}`);
  } catch (error) {
    console.error(`Could not write SSIM latest scores: ${error.message}`);
  }
}

// Patterns to ignore in console error checking
const IGNORED_ERROR_PATTERNS = [
  /favicon\.ico/i,  // Missing favicon is expected
  /Failed to load resource: the server responded with a status of 404/i,
];

function isIgnoredError(message) {
  return IGNORED_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

// SSIM-based screenshot comparison function
// Uses Structural Similarity Index for robust comparison that handles anti-aliasing differences
async function compareScreenshots(page, currentName, baselineName, testName, threshold = TOLERANCE.APPROX_MATCH) {
  if (!RETAINED_SSIM_BASELINES.has(baselineName)) {
    console.log(`[SEMANTIC] ${testName}: screenshot retired by CY3 SSIM disposition`);
    return { isMatch: true, message: 'Covered by semantic replacement', skipped: true, ssimScore: null, pixelDifference: 0 };
  }
  expect(new URL(page.url()).pathname, 'SSIM scene comparisons are CY3-only').toMatch(/\/chandrayaan3\/(?:index\.html)?$/);
  expect(await page.locator('#experimental-dockview-host').count(), 'SSIM uses the configured legacy layout').toBe(0);
  const screenshotDir = join(process.cwd(), 'test', 'screenshots');
  const currentDir = join(screenshotDir, 'current');
  const baselineDir = join(screenshotDir, 'baseline');

  // Ensure directories exist
  [currentDir, baselineDir].forEach(dir => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  });

  const currentPath = join(currentDir, currentName);
  const baselinePath = join(baselineDir, baselineName);

  // SSIM policy: keep body locator halos disabled in both current and baseline captures.
  await page.evaluate(() => {
    const haloToggle = document.querySelector('#view-body-halos');
    if (haloToggle instanceof HTMLInputElement && haloToggle.checked) {
      haloToggle.checked = false;
      haloToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
  await ensureHeaderPillStripCollapsed(page);

  // Hide test ID for screenshot and store its content
  const testIdContent = await hideTestIdForScreenshot(page);
  const chromeState = await hideChromeForScreenshot(page);
  const cropBounds = await getComparisonCropBounds(page);

  // Take current screenshot
  await page.screenshot({ path: currentPath, fullPage: false });

  // Restore test ID after screenshot
  await restoreChromeAfterScreenshot(page, chromeState);
  await restoreTestId(page, testIdContent);

  // Baselines are only written by an explicit, reviewable update run.
  if (UPDATE_SSIM_BASELINES) {
    writeFileSync(baselinePath, readFileSync(currentPath));
    ssimScores[baselineName.replace(/\.png$/, '')] = 1;
    return { isMatch: true, message: 'Baseline updated explicitly', ssimScore: 1.0, pixelDifference: 0 };
  }
  if (!existsSync(baselinePath)) {
    throw new Error(`Missing SSIM baseline: ${baselinePath}. Use make baseline only after reviewing the intended captures.`);
  }

  // Compare screenshots using SSIM
  const currentFull = PNG.sync.read(readFileSync(currentPath));
  const baselineFull = PNG.sync.read(readFileSync(baselinePath));
  const current = cropPngImage(currentFull, cropBounds);
  const baseline = cropPngImage(baselineFull, cropBounds);

  const { width, height } = current;

  // Check for dimension mismatch
  if (baseline.width !== width || baseline.height !== height) {
    console.log(`SCREENSHOT DIMENSION MISMATCH: ${testName} - baseline ${baseline.width}x${baseline.height} vs current ${width}x${height}`);
    return {
      isMatch: false,
      message: `Dimension mismatch: baseline ${baseline.width}x${baseline.height} vs current ${width}x${height}`,
      ssimScore: 0,
      pixelDifference: width * height
    };
  }

  // Prepare image data for SSIM comparison
  const baselineData = { data: baseline.data, width, height };
  const currentData = { data: current.data, width, height };

  // Calculate SSIM score
  const ssimResult = ssim(baselineData, currentData);
  const ssimScore = ssimResult.mssim;

  // Determine if images match based on threshold
  const isMatch = ssimScore >= threshold;

  // Record SSIM score for history tracking (use baselineName without extension as key)
  const scoreKey = baselineName.replace(/\.png$/, '');
  ssimScores[scoreKey] = ssimScore;

  // Always log SSIM score for test report
  const status = isMatch ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${currentName}: SSIM=${ssimScore.toFixed(4)} (threshold=${threshold.toFixed(2)})`);

  return {
    isMatch,
    message: isMatch ? 'Screenshots match' : `SSIM ${ssimScore.toFixed(4)} below threshold ${threshold}`,
    ssimScore,
    pixelDifference: 0 // Kept for backwards compatibility, but not meaningful with SSIM
  };
}



// Simplified helper functions

function getSsimScores() { return ssimScores; }

export {
  displayTestId,
  writeSsimLatest,
  isIgnoredError,
  compareScreenshots,
  getSsimScores,
};
