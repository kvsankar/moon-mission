import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { ssim } from 'ssim.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it as defineTest } from 'vitest';
import { fovDegreesToZoomSliderValue } from '../src/platform/js/app/fov-slider-scale.js';
import { getEffectiveTestBaseUrl } from './local-test-config.js';
import { CY3_SSIM_DISPOSITION } from './support/cy3-ssim-disposition.js';

async function displayStartupMessage(page, testId) {
  console.log(`Displaying startup message for: ${testId}`);
  
  // Show immediate startup message
  await page.evaluate((testId) => {
    const testIdElement = document.getElementById('test-id-display');
    if (testIdElement) {
      testIdElement.innerHTML = `${testId} - Starting up...`;
      testIdElement.style.display = 'block';
      testIdElement.style.visibility = 'visible';
    } else {
      console.log('test-id-display element not found');
    }
  }, testId);
  
  // Small delay to ensure it's rendered
  await page.waitForTimeout(100);
}

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

async function hideTestId(page) {
  await page.evaluate(() => {
    const testIdElement = document.getElementById('test-id-display');
    if (testIdElement) {
      testIdElement.innerHTML = '';
    }
  });
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
const isCI = process.env.CI === 'true';
const CI_MULTIPLIER = isCI ? 3 : 1;

// Timeout constants as per requirements
const TIMEOUTS = {
  // Scene and Rendering Timeouts
  STARTUP_TIMEOUT: 60000 * CI_MULTIPLIER,
  SCENE_READY_TIMEOUT: 15000 * CI_MULTIPLIER,
  STABLE_RENDER_TIMEOUT: 3000 * CI_MULTIPLIER,
  ORBIT_RENDER_TIMEOUT: 120000 * CI_MULTIPLIER, // 2 minutes for slow WSL/software rendering

  // UI Interaction Timeouts
  SETTINGS_PANEL_TIMEOUT: 8000 * CI_MULTIPLIER,
  UI_RESPONSE_TIMEOUT: 3000 * CI_MULTIPLIER,
  ANIMATION_RESPONSE_TIMEOUT: 2000 * CI_MULTIPLIER,

  // Screenshot and Comparison Timeouts
  SCREENSHOT_TIMEOUT: 5000 * CI_MULTIPLIER,
  VISUAL_STABILIZATION_TIMEOUT: 2500 * CI_MULTIPLIER,
  PANEL_CLOSE_TIMEOUT: 1000 * CI_MULTIPLIER,

  // Test Infrastructure Timeouts
  TEST_CASE_TIMEOUT: 35000 * CI_MULTIPLIER,
  EXTENDED_TEST_TIMEOUT: 70000 * CI_MULTIPLIER,
  CLEANUP_TIMEOUT: 90000 * CI_MULTIPLIER,

  // Short Delays
  QUICK_DELAY: 200,
  STANDARD_DELAY: 500,
  EXTENDED_DELAY: 1000
};

// SSIM threshold constants for screenshot comparison
// Higher values = more strict matching (1.0 = identical)
const SSIM_THRESHOLD = {
  IDENTICAL: 0.99,      // For exact visual matches
  VERY_SIMILAR: 0.98,   // For minor anti-aliasing differences
  SIMILAR: 0.98,        // For standard 3D scene comparisons (DEFAULT)
  DIFFERENT: 0.97       // For 2D scenes with acceptable variations
};

// Legacy alias for backwards compatibility during migration
const TOLERANCE = {
  EXACT: SSIM_THRESHOLD.IDENTICAL,
  APPROX_MATCH: SSIM_THRESHOLD.SIMILAR,
  BROAD_MATCH: SSIM_THRESHOLD.DIFFERENT
};

// Test configuration using environment variables (no hardcoded URLs/ports)
const TEST_CONFIG = {
  baseUrl: getEffectiveTestBaseUrl(process.cwd()),
  headless: process.env.HEADLESS !== 'false',  // Default to headless, use HEADLESS=false to see browser
  slowMo: parseInt(process.env.SLOWMO || '0'),
  get testUrl() {
    return `${this.baseUrl}/chandrayaan3/?testMode=true&testProfile=ssim`;
  }
};

const LOCAL_ASTRONOMY_BROWSER_FILE = join(
  process.cwd(),
  'node_modules',
  'astronomy-engine',
  'astronomy.browser.js',
);
const SSIM_PROFILE_FILE = join(process.cwd(), 'assets', 'chandrayaan3', 'data', 'config.ssim.json');

function loadSsimProfileConfig() {
  try {
    const parsed = JSON.parse(readFileSync(SSIM_PROFILE_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn(`Could not load SSIM profile config from ${SSIM_PROFILE_FILE}: ${error.message}`);
  }
  return {};
}

const SSIM_PROFILE_CONFIG = loadSsimProfileConfig();
const SSIM_PROFILE_VIEW_DEFAULTS = SSIM_PROFILE_CONFIG?.ui?.viewDefaults || {};
const SSIM_PROFILE_ORIGIN_DEFAULTS = SSIM_PROFILE_CONFIG?.ui?.testDefaultsByOrigin || {};
const UPDATE_SSIM_BASELINES = process.env.UPDATE_SSIM_BASELINES === 'true';
const SSIM_VIEWPORT = { width: 1280, height: 720 };
const RETAINED_SSIM_BASELINES = new Set(
  CY3_SSIM_DISPOSITION
    .filter(group => group.disposition === 'retain')
    .flatMap(group => group.baselines)
);
const RETAINED_SSIM_TESTS = new Set([
  'Page Load in Earth Mode',
  '2D/3D Mode Switching',
  'Page Load in Moon Mode',
  'Page Load in Relative Mode',
  'Earth 3D Full Run Test',
  'Moon 3D Full Run Test',
  'Earth 2D Full Run Test',
  'Moon 2D Full Run Test',
]);

function it(name, handler, timeout) {
  const register = RETAINED_SSIM_TESTS.has(name) ? defineTest : defineTest.skip;
  return register(name, handler, timeout);
}

let browser, page;
let consoleErrors = [];
let pageErrors = [];

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

function ensureCurrentScreenshotDir() {
  const currentDir = join(process.cwd(), 'test', 'screenshots', 'current');
  if (!existsSync(currentDir)) {
    mkdirSync(currentDir, { recursive: true });
  }
  return currentDir;
}


// Simplified helper functions
async function openSettingsPanel(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById('settings-panel') && !!(window.MissionDialog || window.CY3Dialog);
  }, { timeout: 15000 });

  const opened = await page.evaluate(() => {
    const panel = document.getElementById('settings-panel');
    const dialogApi = window.MissionDialog || window.CY3Dialog;
    if (!panel || !dialogApi?.init || !dialogApi?.open) {
      return false;
    }

    panel.classList.remove('settings-panel--advanced');
    panel.querySelectorAll('.settings-panel__filtered-hidden').forEach((item) => {
      item.classList.remove('settings-panel__filtered-hidden');
      item.setAttribute('aria-hidden', 'false');
    });

    const title = panel.querySelector('.settings-panel__title');
    if (title) {
      title.textContent = 'Settings';
    }

    const viewTitle = panel.querySelector('.settings-section--view .settings-section__title');
    if (viewTitle) {
      if (!viewTitle.dataset.fullTitle) {
        viewTitle.dataset.fullTitle = viewTitle.textContent || 'View';
      }
      viewTitle.textContent = viewTitle.dataset.fullTitle;
    }

    dialogApi.init(panel, {
      dialogClass: 'dialog settings-dialog',
      modal: false,
      position: {
        my: 'left top',
        at: 'left bottom',
        of: '#header',
        collision: 'fit flip',
      },
      title: 'Settings',
      closeOnEscape: false,
    });
    dialogApi.open(panel);

    const wrapper = dialogApi.widgetElement(panel);
    if (wrapper) {
      wrapper.style.backgroundImage = 'none';
      wrapper.style.border = '0';
      wrapper.style.maxWidth = window.innerWidth <= 600 ? '92vw' : '80%';
      wrapper.style.zIndex = '18';
      const titleBar = wrapper.querySelector('.ui-dialog-titlebar');
      if (titleBar) {
        titleBar.style.display = 'none';
      }
    }

    return true;
  });

  if (!opened) {
    throw new Error('Failed to open settings panel via dialog API');
  }

  await page.waitForFunction(() => {
    const panel = document.getElementById('settings-panel');
    const dialogWrapper = panel?.closest('.settings-dialog, .ui-dialog');
    const wrapperVisible = dialogWrapper ? getComputedStyle(dialogWrapper).display !== 'none' : false;
    return wrapperVisible && !panel?.classList.contains('settings-panel--advanced');
  }, { timeout: 3000 });

  // Ensure panel body is expanded; controls are not interactable when collapsed.
  const collapseButton = page.locator('#settings-panel-collapse');
  if (await collapseButton.count()) {
    const isExpanded = await collapseButton.getAttribute('aria-expanded');
    if (isExpanded === 'false') {
      await collapseButton.click();
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
    }
  }
}

async function closeSettingsPanel(page) {
  await page.waitForFunction(() => {
    return !!document.getElementById('settings-panel') && !!(window.MissionDialog || window.CY3Dialog);
  }, { timeout: 15000 });

  const closed = await page.evaluate(() => {
    const panel = document.getElementById('settings-panel');
    const dialogApi = window.MissionDialog || window.CY3Dialog;
    if (!panel || !dialogApi?.close) {
      return false;
    }
    dialogApi.close(panel);
    return true;
  });

  if (!closed) {
    throw new Error('Failed to close settings panel via dialog API');
  }

  await page.waitForFunction(() => {
    const panel = document.getElementById('settings-panel');
    const dialogWrapper = panel?.closest('.settings-dialog, .ui-dialog');
    return !dialogWrapper || getComputedStyle(dialogWrapper).display === 'none';
  }, { timeout: 3000 });
}

async function ensureSettingsPanelClosed(page) {
  const isOpen = await page.evaluate(() => {
    const panel = document.getElementById('settings-panel');
    const dialogWrapper = panel?.closest('.settings-dialog, .ui-dialog');
    const wrapperVisible = dialogWrapper ? getComputedStyle(dialogWrapper).display !== 'none' : false;
    return wrapperVisible;
  });

  if (isOpen) {
    await closeSettingsPanel(page);
  }
}


async function waitForCameraPair(page, positionMode, lookMode) {
  await page.waitForFunction(({ nextPositionMode, nextLookMode }) => {
    const position = document.getElementById('camera-position');
    const look = document.getElementById('camera-look');
    return position?.value === nextPositionMode && look?.value === nextLookMode;
  }, { nextPositionMode: positionMode, nextLookMode: lookMode }, { timeout: TIMEOUTS.UI_RESPONSE_TIMEOUT });
}


async function setCameraPair(page, pairValue = 'manual__manual') {
  const [positionMode, lookMode] = pairValue.split('__');
  const positionPillSelector = `input[name="camera-position-pill"][value="${positionMode}"]`;
  const lookPillSelector = `input[name="camera-look-pill"][value="${lookMode}"]`;
  const positionPill = page.locator(positionPillSelector);
  const lookPill = page.locator(lookPillSelector);

  if (
    await positionPill.count() &&
    await lookPill.count() &&
    await positionPill.first().isVisible() &&
    await lookPill.first().isVisible()
  ) {
    await positionPill.first().check();
    await positionPill.first().dispatchEvent('change');
    await lookPill.first().check();
    await lookPill.first().dispatchEvent('change');
    return;
  }

  const pairSelector = `input[name="camera-pair"][value="${pairValue}"]`;
  const pair = page.locator(pairSelector);

  if (await pair.count()) {
    await pair.first().check();
    await pair.first().dispatchEvent('change');
    return;
  }

  // Backward-compatible fallback for legacy UI that only exposed hidden selects.
  await page.evaluate(({ positionMode, lookMode }) => {
    const positionSelect = document.querySelector('#camera-position');
    const lookSelect = document.querySelector('#camera-look');
    if (!positionSelect || !lookSelect) return;
    positionSelect.value = positionMode;
    lookSelect.value = lookMode;
    positionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    lookSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }, { positionMode, lookMode });
}

async function clickSpeedControl(page, direction = 'faster', times = 1) {
  const idSelector = direction === 'slower' ? '#slower' : '#faster';
  const signText = direction === 'slower' ? '−' : '+';
  for (let i = 0; i < times; i += 1) {
    const byId = page.locator(idSelector);
    if (await byId.count() > 0 && await byId.first().isVisible() && await byId.first().isEnabled()) {
      await byId.first().click();
      continue;
    }
    const byText = page.locator('button', { hasText: signText });
    if (await byText.count() > 0) {
      const candidate = byText.first();
      if (await candidate.isVisible() && await candidate.isEnabled()) {
        await candidate.click();
      }
    }
  }
}

async function normalizeSpeedToRealtime(page) {
  const realtime = page.locator('#realtime');
  if (await realtime.count() > 0 && await realtime.first().isVisible()) {
    await realtime.first().click();
    await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
  }
}

async function accelerateSpeedToMax(page, maxClicks = 16) {
  for (let i = 0; i < maxClicks; i += 1) {
    const faster = page.locator('#faster');
    if (await faster.count() === 0 || !await faster.first().isVisible() || !await faster.first().isEnabled()) {
      break;
    }
    await clickSpeedControl(page, 'faster', 1);
    await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
  }
}

async function resetCameraToManual(page) {
  await openSettingsPanel(page);
  await setCameraPair(page, 'manual__manual');

  // Emulate the legacy "camera default" reset distance/orientation in 3D mode.
  await page.evaluate(() => {
    const cfg = document.getElementById('origin-relative')?.checked
      ? 'relative'
      : document.getElementById('origin-moon')?.checked
        ? 'lunar'
        : 'geo';
    const scene = window.animationScenes?.[cfg];
    if (!scene?.initialized3D) return;
    scene.setCameraParameters(true);
    const controls = scene.cameraController?.controls;
    if (controls?.target) {
      controls.target.set(0, 0, 0);
      controls.noRotate = false;
      controls.noPan = false;
      controls.update();
    }
  });
}

async function forceClassicOrbitStyle(page) {
  await page.evaluate(() => {
    const classic = document.getElementById('orbit-style-classic');
    if (!(classic instanceof HTMLInputElement)) return;
    if (classic.checked) return;
    classic.checked = true;
    classic.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
}

async function waitForOrbitGeometryReady(page, { dimensionIs2D }) {
  if (dimensionIs2D) {
    return;
  }

  await page.waitForFunction(() => {
    const isLunarMode = !!document.querySelector('#origin-moon')?.checked;
    const activeConfig = isLunarMode ? 'lunar' : 'geo';
    const scene = window.animationScenes?.[activeConfig];
    if (!scene?.initialized3D) {
      return false;
    }

    const primaryCraftId = scene.primaryCraftId || 'SC';
    const primaryCurveCount = Array.isArray(scene.curvesById?.[primaryCraftId])
      ? scene.curvesById[primaryCraftId].length
      : 0;

    const primaryOrbitLines = scene.orbitLinesByBodyId?.[primaryCraftId];
    const primaryOrbitLineCount = Array.isArray(primaryOrbitLines)
      ? primaryOrbitLines.length
      : 0;

    return primaryCurveCount > 1 && primaryOrbitLineCount > 0;
  }, null, { timeout: TIMEOUTS.ORBIT_RENDER_TIMEOUT });
}

async function waitForRelativePageLoadOrbitStabilized(page) {
  await page.waitForFunction(() => {
    const isRelativeMode = !!document.querySelector('#origin-relative')?.checked;
    if (!isRelativeMode) {
      return false;
    }

    const classic = document.getElementById('orbit-style-classic');
    if (!(classic instanceof HTMLInputElement) || !classic.checked) {
      return false;
    }

    const scene = window.animationScenes?.geo;
    if (!scene?.initialized3D) {
      return false;
    }

    const primaryCraftId = scene.primaryCraftId || 'SC';
    const orbitLines = scene.orbitLinesByBodyId?.[primaryCraftId];
    if (!Array.isArray(orbitLines) || orbitLines.length === 0) {
      return false;
    }

    return orbitLines.some((orbitLine) => {
      const opacity = orbitLine?.material?.opacity;
      return orbitLine?.visible === true && Number.isFinite(opacity) && opacity >= 0.95;
    });
  }, null, { timeout: TIMEOUTS.ORBIT_RENDER_TIMEOUT });

  await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
}

async function waitForCurrentSceneOrbitVisibility(page, {
  orbitVisible = true,
  landingOrbitVisible = null,
} = {}) {
  await page.waitForFunction(({ orbitVisible: expectedOrbitVisible, landingOrbitVisible: expectedLandingOrbitVisible }) => {
    const isLunarMode = !!document.querySelector('#origin-moon')?.checked;
    const scene = window.animationScenes?.[isLunarMode ? 'lunar' : 'geo'];
    if (!scene?.initialized3D) {
      return false;
    }

    const primaryCraftId = scene.primaryCraftId || 'SC';
    const orbitLines = Array.isArray(scene.orbitLinesByBodyId?.[primaryCraftId])
      ? scene.orbitLinesByBodyId[primaryCraftId]
      : [];
    const generatedOrbitLine = scene.generatedOrbitLinesByBodyId?.[primaryCraftId] || null;

    if (orbitLines.length === 0 && !generatedOrbitLine) {
      return false;
    }

    const hasVisiblePrimaryOrbit = orbitLines.some((orbitLine) => {
      const opacity = orbitLine?.material?.opacity;
      return orbitLine?.visible === true && (!Number.isFinite(opacity) || opacity > 0.01);
    }) || (
      generatedOrbitLine?.visible === true &&
      (!Number.isFinite(generatedOrbitLine?.material?.opacity) || generatedOrbitLine.material.opacity > 0.01)
    );

    if (hasVisiblePrimaryOrbit !== expectedOrbitVisible) {
      return false;
    }

    if (typeof expectedLandingOrbitVisible === 'boolean' && scene.landingOrbitLine) {
      if (scene.landingOrbitLine.visible !== expectedLandingOrbitVisible) {
        return false;
      }
    }

    return true;
  }, { orbitVisible, landingOrbitVisible }, { timeout: TIMEOUTS.ORBIT_RENDER_TIMEOUT });

  await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
}

// Wait for scene to be ready
async function waitForScene(page) {
  try {
    // The desktop transport button is hidden in the mobile shell, but its backing
    // control still exists and remains a reliable app-init marker.
    await page.waitForSelector('#animate', {
      timeout: TIMEOUTS.SCENE_READY_TIMEOUT,
      state: 'attached',
    });
    const renderCanvasSelector = '#canvas-wrapper canvas';

    // Check if we're in 2D mode - canvas might not be immediately visible
    const dimensionIs2D = await page.isChecked('#dimension-2D');
    if (!dimensionIs2D) {
      // For 3D mode, wait for the real renderer canvas, not mobile overlay canvases.
      await page.waitForSelector(renderCanvasSelector, {
        timeout: TIMEOUTS.SCENE_READY_TIMEOUT,
        state: 'visible',
      });
    } else {
      // For 2D mode, just wait for canvas to exist (might be hidden during transitions)
      await page.waitForSelector(renderCanvasSelector, {
        timeout: TIMEOUTS.SCENE_READY_TIMEOUT,
        state: 'attached',
      });
    }

    // For 2D mode, use a simplified and faster check
    if (dimensionIs2D) {
      // In 2D mode, just wait a short time for DOM to stabilize
      await page.waitForTimeout(2000);
      console.log('2D mode: using simplified scene readiness check');
    } else {
      // For 3D mode, use the full scene state checking
      await page.waitForFunction(() => {
        // Determine which mode we're in by checking which origin is selected
        const isLunarMode = document.querySelector('#origin-moon')?.checked;
        const doneState = window.AnimationScene?.SCENE_STATE_ADD_CURVE_DONE;
        
        if (isLunarMode) {
          // In Moon mode, wait for lunar scene to be ready
          const lunarState = window.animationScenes?.lunar?.state;
          return lunarState === doneState;
        } else {
          // In Earth mode, wait for geo scene to be ready
          const geoState = window.animationScenes?.geo?.state;
          return geoState === doneState;
        }
      }, null, { timeout: TIMEOUTS.ORBIT_RENDER_TIMEOUT });
    }
    
    // Additional check: wait for animation frames to stabilize
    // This ensures the orbit drawing animation has completed
    await page.evaluate(() => {
      return new Promise((resolve) => {
        let frameCount = 0;
        const targetFrames = 3; // Wait for at least 3 frames to ensure stability
        
        function checkFrame() {
          frameCount++;
          if (frameCount >= targetFrames) {
            resolve();
          } else {
            requestAnimationFrame(checkFrame);
          }
        }
        
        // Start checking after next frame
        requestAnimationFrame(checkFrame);
      });
    });

    await forceClassicOrbitStyle(page);
    await waitForOrbitGeometryReady(page, { dimensionIs2D });
  } catch (error) {
    console.log('Wait for scene ready failed:', error.message);
    // Re-throw the error so tests fail properly instead of continuing with bad state
    throw error;
  }
}

// Store initial camera/zoom state for restoration
async function storeInitialState(page) {
  return await page.evaluate(() => {
    try {
      const camera = window.cy3?.camera;
      const cameraControls = window.cy3?.cameraControls;
      return {
        cameraPosition: camera?.position ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null,
        cameraUp: camera?.up ? { x: camera.up.x, y: camera.up.y, z: camera.up.z } : null,
        cameraTarget: cameraControls?.target ? { x: cameraControls.target.x, y: cameraControls.target.y, z: cameraControls.target.z } : null,
        timelineDate: document.querySelector('#date')?.textContent || null
      };
    } catch (e) {
      console.error('Error storing initial state:', e);
      return { cameraPosition: null, cameraUp: null, cameraTarget: null, timelineDate: null };
    }
  });
}

async function restoreStoredState(page, storedState) {
  await page.evaluate((state) => {
    try {
      const camera = window.cy3?.camera;
      const cameraControls = window.cy3?.cameraControls;

      if (camera && state.cameraPosition) {
        camera.position.set(state.cameraPosition.x, state.cameraPosition.y, state.cameraPosition.z);
      }
      if (camera && state.cameraUp) {
        camera.up.set(state.cameraUp.x, state.cameraUp.y, state.cameraUp.z);
      }
      if (cameraControls && state.cameraTarget) {
        cameraControls.target.set(state.cameraTarget.x, state.cameraTarget.y, state.cameraTarget.z);
      }

      if (camera) {
        camera.updateProjectionMatrix();
      }
      if (cameraControls) {
        cameraControls.update();
      }
    } catch (e) {
      console.error('Error restoring stored state:', e);
    }
  }, storedState);
}

// New zoom functions that directly manipulate camera position
async function zoomIn(page, steps = 1, mode = null) {
  const result = await page.evaluate(({ numSteps, testMode }) => {
    // Determine which mode we're in - either by parameter or by checking UI
    let isLunarMode;
    if (testMode) {
      isLunarMode = testMode === 'MOON';
    } else {
      isLunarMode = document.querySelector('#origin-moon')?.checked;
    }
    
    const scene = isLunarMode ? window.animationScenes?.lunar : window.animationScenes?.geo;
    const camera = scene?.camera;
    const controls = scene?.cameraControls;
    
    if (!camera || !controls) {
      console.log('ZoomIn failed: camera or controls not found for mode:', isLunarMode ? 'lunar' : 'geo');
      return false;
    }

    const target = controls.target;
    
    for (let i = 0; i < numSteps; i++) {
      const currentDistance = camera.position.distanceTo(target);
      const newDistance = currentDistance * 0.9; // Zoom in by 10%
      camera.position.lerpVectors(target, camera.position, newDistance / currentDistance);
      controls.update();
    }
    
    return true;
  }, { numSteps: steps, testMode: mode });
  
  if (!result) {
    console.log('Warning: zoomIn function could not find camera/controls');
  }
  
  await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
}

async function zoomOut(page, steps = 1, mode = null) {
  const result = await page.evaluate(({ numSteps, testMode }) => {
    // Determine which mode we're in - either by parameter or by checking UI
    let isLunarMode;
    if (testMode) {
      isLunarMode = testMode === 'MOON';
    } else {
      isLunarMode = document.querySelector('#origin-moon')?.checked;
    }
    
    const scene = isLunarMode ? window.animationScenes?.lunar : window.animationScenes?.geo;
    const camera = scene?.camera;
    const controls = scene?.cameraControls;
    
    if (!camera || !controls) {
      console.log('ZoomOut failed: camera or controls not found for mode:', isLunarMode ? 'lunar' : 'geo');
      return false;
    }

    const target = controls.target;
    
    for (let i = 0; i < numSteps; i++) {
      const currentDistance = camera.position.distanceTo(target);
      const newDistance = currentDistance * 1.1; // Zoom out by 10%
      camera.position.lerpVectors(target, camera.position, newDistance / currentDistance);
      controls.update();
    }
    
    return true;
  }, { numSteps: steps, testMode: mode });
  
  if (!result) {
    console.log('Warning: zoomOut function could not find camera/controls');
  }
  
  await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
}

// Test mode configurations
const TEST_MODES = {
  EARTH: { 
    zoomInSteps: 3,          // General view control tests
    polesZoom: 10,           // Poles visibility - increased zoom in
    polarAxesZoom: 1,        // Polar axes visibility
    soiZoomOut: 15           // SOI wide view
  },
  MOON: { 
    zoomInSteps: 5,          // General view control tests  
    polesZoom: 8,            // Poles visibility
    polarAxesZoom: 8,        // Polar axes visibility
    soiZoomOut: 30,          // SOI very wide view - increased zoom out
    descentOrbitZoom: 6,     // Descent orbit visibility
    locationsZoom: 8         // Locations visibility
  }
};

// Shared cleanup function for all view control tests
async function cleanupViewControlTest(page, mode = TEST_MODES.EARTH, restoreZoomSteps = null) {
  await openSettingsPanel(page);
  // Ensure all view controls are disabled
  if (await page.isChecked('#view-moonsoi')) {
    await page.click('#view-moonsoi');
  }
  if (await page.isChecked('#view-eclipticplane')) {
    await page.click('#view-eclipticplane');
  }
  if (await page.isChecked('#view-equatorialplane')) {
    await page.click('#view-equatorialplane');
  }
  // Restore orbit visibility family
  await ensureOrbitFamilyState(page, true);
  await closeSettingsPanel(page);
  const modeType = mode === TEST_MODES.MOON ? 'MOON' : 'EARTH';
  // If restoreZoomSteps is specified, use that to restore zoom, otherwise use default zoomInSteps
  const zoomSteps = restoreZoomSteps !== null ? restoreZoomSteps : mode.zoomInSteps;
  await zoomIn(page, zoomSteps, modeType);
}

async function resolveTimelineTarget(page, target = '#burn1') {
  if (typeof target !== 'string' || target.length === 0) {
    return '#burn1';
  }

  if (target.startsWith('#')) {
    return target;
  }

  const selector = await page.evaluate((eventKey) => {
    const button = document.querySelector(`#burnbuttons button[data-event-key="${eventKey}"]`);
    return button?.id ? `#${button.id}` : null;
  }, target);

  return selector || '#burn1';
}

// Timeline management for consistent test states
async function setTimeline(page, target = '#burn1') {
  try {
    await ensureSettingsPanelClosed(page);
    const burnButton = await resolveTimelineTarget(page, target);
    await page.evaluate((selector) => {
      const button = document.querySelector(selector);
      if (button instanceof HTMLElement) {
        button.click();
      }
    }, burnButton);
    await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
  } catch (e) {
    console.warn(`Could not set timeline to ${target}:`, e.message);
  }
}

// Suite and test timeline management
const SUITE_TIMELINE = 'missionStart'; // Default: Launch timeline for all suites
const TEST_TIMELINES = {
  // Test-specific timeline overrides (only for tests that need non-default timelines)
  'Joy Ride Control': 'ebn2',             // Stable early Earth orbit geometry
  'Landing Animation': 'vikramLanding',   // Real landing event
  'CY3 Descent Orbit Display': 'missionStart'
};

// Helper to start test with appropriate timeline
async function startTest(page, testId, testName = '') {
  // Set timeline (suite default or test-specific override)
  const timeline = TEST_TIMELINES[testName] || SUITE_TIMELINE;
  await setTimeline(page, timeline);
  await displayTestId(page, testId);
}


// Helper to ensure correct origin mode
async function ensureOriginMode(page, mode) {
  await openSettingsPanel(page);
  const targetSelector = mode === 'earth'
    ? '#origin-earth'
    : mode === 'moon'
      ? '#origin-moon'
      : '#origin-relative';
  const isCorrectMode = await page.isChecked(targetSelector);
  if (!isCorrectMode) {
    const targetIsRelative = mode === 'relative';
    const currentIsRelative = new URL(page.url()).searchParams.get('mode') === 'relative';
    if (targetIsRelative !== currentIsRelative) {
      const waitForNavigation = page.waitForURL((urlString) => {
        const url = new URL(urlString);
        return targetIsRelative
          ? url.searchParams.get('mode') === 'relative'
          : url.searchParams.get('mode') !== 'relative';
      }, {
        timeout: TIMEOUTS.SCENE_READY_TIMEOUT,
        waitUntil: 'commit',
      });
      await page.click(targetSelector);
      await waitForNavigation;
      await page.waitForLoadState('domcontentloaded');
    } else {
      await page.click(targetSelector);
    }
    await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
  }
  await closeSettingsPanel(page);
}

async function ensureFovOneDegree(page, enabled = true) {
  await setFovDegrees(page, enabled ? 1 : 50);
}

async function setFovDegrees(page, degrees = 50) {
  const sliderValue = Math.round(
    fovDegreesToZoomSliderValue(degrees, {
      minDegrees: 0.1,
      maxDegrees: 179,
      fallbackDegrees: degrees,
    })
  );
  await page.evaluate((nextSliderValue) => {
    const autoButton = document.getElementById('desktop-main-fov-auto');
    const slider = document.getElementById('desktop-main-fov-slider');
    if (!(slider instanceof HTMLInputElement)) return;
    const autoPressed = autoButton?.getAttribute('aria-pressed') === 'true';
    if (autoPressed && autoButton instanceof HTMLElement) {
      autoButton.click();
    }
    slider.value = String(nextSliderValue);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, sliderValue);
  await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
}

async function ensureMoonRenderProfile(page, profile = 'fast') {
  const normalizedProfile = String(profile || '').trim().toLowerCase() === 'quality' ? 'quality' : 'fast';
  await page.evaluate((nextProfile) => {
    const buttonId = nextProfile === 'quality'
      ? 'moon-profile-pill-quality'
      : 'moon-profile-pill-fast';
    const button = document.getElementById(buttonId);
    if (button instanceof HTMLElement) {
      button.click();
    }
  }, normalizedProfile);

  await page.waitForFunction((nextProfile) => {
    const activeProfile = String(window.MOON_RENDER_ASSET_PROFILE || '').trim().toLowerCase();
    const button = document.getElementById(
      nextProfile === 'quality'
        ? 'moon-profile-pill-quality'
        : 'moon-profile-pill-fast',
    );
    const pressed = button?.getAttribute('aria-pressed') === 'true';
    return pressed && (
      activeProfile === nextProfile ||
      (nextProfile === 'fast' && !activeProfile)
    );
  }, normalizedProfile, { timeout: TIMEOUTS.SCENE_READY_TIMEOUT });

  await waitForScene(page);
  await page.waitForFunction((nextProfile) => {
    const currentOrigin = document.querySelector('#origin-relative:checked')
      ? 'relative'
      : document.querySelector('#origin-moon:checked')
        ? 'lunar'
        : 'geo';
    const sceneProfile = window.animationScenes?.[currentOrigin]?.moonRenderProfile || null;
    return !sceneProfile || sceneProfile === nextProfile;
  }, normalizedProfile, { timeout: TIMEOUTS.CLEANUP_TIMEOUT });
  await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
}

async function ensureAnimationPaused(page) {
  const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
  if (isPlaying > 0) {
    await page.click('#animate');
    await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
  }
}

async function ensureCheckboxState(page, selector, enabled = true) {
  const toggle = page.locator(selector);
  const isChecked = await toggle.isChecked();
  if (isChecked === enabled) {
    return;
  }
  await page.evaluate(({ selector: targetSelector, checked }) => {
    const input = document.querySelector(targetSelector);
    if (!input) return;
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('click', { bubbles: true }));
  }, { selector, checked: enabled });
  await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
}

async function enforceSsimProfileViewDefaults(page) {
  const viewDefaults = SSIM_PROFILE_VIEW_DEFAULTS || {};
  const booleanToggleBindings = [
    ['viewOrbit', '#view-orbit'],
    ['viewOrbitDescent', '#view-orbit-descent'],
    ['viewLunarCraters', '#view-lunar-craters'],
    ['viewSky', '#view-sky'],
    ['viewMoonSOI', '#view-moonsoi'],
    ['viewBodyHalos', '#view-body-halos'],
    ['viewAuxiliaryPanels', '#view-aux-camera-panels'],
  ];

  let changed = false;
  await openSettingsPanel(page);

  for (const [key, selector] of booleanToggleBindings) {
    const value = viewDefaults[key];
    if (typeof value !== 'boolean') {
      continue;
    }
    const toggle = page.locator(selector);
    if (await toggle.count() === 0) {
      continue;
    }
    const isChecked = await toggle.isChecked();
    if (isChecked !== value) {
      changed = true;
      await ensureCheckboxState(page, selector, value);
    }
  }

  if (viewDefaults.orbitStyle === 'classic' || viewDefaults.orbitStyle === 'trail') {
    const targetSelector = viewDefaults.orbitStyle === 'classic'
      ? '#orbit-style-classic'
      : '#orbit-style-trail';
    const targetToggle = page.locator(targetSelector);
    if (await targetToggle.count() > 0) {
      const isChecked = await targetToggle.isChecked();
      if (!isChecked) {
        changed = true;
        await ensureCheckboxState(page, targetSelector, true);
      }
    }
  }

  await closeSettingsPanel(page);

  if (changed) {
    await waitForScene(page);
    await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
  }
}

async function ensureOrbitFamilyState(page, enabled = true) {
  await ensureCheckboxState(page, '#view-orbit', enabled);
  await ensureCheckboxState(page, '#view-orbit-descent', enabled);
  const moonOsculatingToggle = page.locator('#view-moon-osculating-orbit');
  if (await moonOsculatingToggle.count() > 0) {
    await ensureCheckboxState(page, '#view-moon-osculating-orbit', enabled);
  }
}

async function pinSsimDefaultViewToggles(page) {
  let changed = false;
  const origin = await page.evaluate(() => {
    if (document.querySelector('#origin-relative:checked')) {
      return 'relative';
    }
    if (document.querySelector('#origin-moon:checked')) {
      return 'moon';
    }
    return 'earth';
  });

  const originDefaults = SSIM_PROFILE_ORIGIN_DEFAULTS?.[origin] || {};
  const fallback = origin !== 'relative';
  const desiredStates = [
    ['#view-xyz-axes', typeof originDefaults.viewXYZAxes === 'boolean' ? originDefaults.viewXYZAxes : fallback],
    ['#view-poles', typeof originDefaults.viewPoles === 'boolean' ? originDefaults.viewPoles : fallback],
    ['#view-polar-axes', typeof originDefaults.viewPolarAxes === 'boolean' ? originDefaults.viewPolarAxes : fallback],
  ];

  for (const [selector, enabled] of desiredStates) {
    const toggle = page.locator(selector);
    if (await toggle.count() === 0) {
      continue;
    }
    const isChecked = await toggle.isChecked();
    if (isChecked !== enabled) {
      changed = true;
    }
    await ensureCheckboxState(page, selector, enabled);
  }

  if (changed) {
    await waitForScene(page);
    await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
  }
}

async function enforceSsimUiChromeDefaults(page) {
  await page.evaluate(() => {
    const locatorsPill = document.getElementById('locators-pill');
    if (locatorsPill) {
      locatorsPill.style.display = 'none';
      locatorsPill.setAttribute('aria-hidden', 'true');
    }
  });
}

async function ensureHeaderPillStripCollapsed(page) {
  const toggle = page.locator('#header-pill-strip-toggle');
  const strip = page.locator('#header-pill-strip');
  if (await toggle.count() === 0 || await strip.count() === 0) {
    return;
  }

  const isCollapsed = await strip.evaluate((node) => node.classList.contains('header-pill-strip--collapsed'));
  if (!isCollapsed && await toggle.first().isVisible() && await toggle.first().isEnabled()) {
    await toggle.first().click();
    await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
  }

  await page.evaluate(() => {
    const strip = document.getElementById('header-pill-strip');
    const toggle = document.getElementById('header-pill-strip-toggle');
    if (!strip || !toggle) {
      return;
    }

    strip.classList.add('header-pill-strip--collapsed');
    toggle.textContent = '›';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Expand mission controls');
    toggle.setAttribute('title', 'Expand mission controls');
  });
  await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
}

async function prepareRelativeLandingFovView(page, cameraPair) {
  await setTimeline(page, 'vikramLanding');
  await ensureOriginMode(page, 'relative');
  await waitForScene(page);
  await ensureAnimationPaused(page);

  await openSettingsPanel(page);
  if (!await page.isChecked('#dimension-3D')) {
    await page.click('#dimension-3D');
    await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
  }
  await ensureCheckboxState(page, '#view-orbit', false);
  await ensureCheckboxState(page, '#view-orbit-descent', false);
  await ensureCheckboxState(page, '#view-sky', false);
  await ensureCheckboxState(page, '#view-body-halos', false);
  const moonSoiToggle = page.locator('#view-moonsoi');
  if (await moonSoiToggle.count() > 0) {
    await ensureCheckboxState(page, '#view-moonsoi', false);
  }
  await setCameraPair(page, 'manual__manual');
  await closeSettingsPanel(page);

  // Reset relative camera to deterministic defaults before mounting pair view.
  await page.evaluate(() => {
    const scene = window.animationScenes?.relative || window.animationScenes?.geo;
    if (!scene?.initialized3D) return;
    scene.setCameraParameters(true);
    const controls = scene.cameraController?.controls;
    if (controls?.target) {
      controls.target.set(0, 0, 0);
      controls.noRotate = false;
      controls.noPan = false;
      controls.update();
    }
  });
  await waitForScene(page);

  await openSettingsPanel(page);
  await setCameraPair(page, cameraPair);
  await ensureFovOneDegree(page, true);
  await closeSettingsPanel(page);
  await waitForScene(page);
  await waitForCurrentSceneOrbitVisibility(page, {
    orbitVisible: false,
    landingOrbitVisible: false,
  });
  await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
}

async function prepareRelativePageLoadView(page) {
  await ensureOriginMode(page, 'relative');
  await ensureAnimationPaused(page);
  await openSettingsPanel(page);
  if (!await page.isChecked('#dimension-3D')) {
    await page.click('#dimension-3D');
    await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
  }
  await ensureCheckboxState(page, '#view-sky', false);
  await ensureCheckboxState(page, '#view-body-halos', false);
  await setCameraPair(page, 'manual__manual');
  const moonSoiToggle = page.locator('#view-moonsoi');
  if (await moonSoiToggle.count() > 0) {
    await ensureCheckboxState(page, '#view-moonsoi', false);
  }
  await closeSettingsPanel(page);
  await waitForScene(page);
  await page.evaluate(() => {
    const scene = window.animationScenes?.relative || window.animationScenes?.geo;
    if (!scene?.initialized3D) return;
    scene.setCameraParameters(true);
    const controls = scene.cameraController?.controls;
    if (controls?.target) {
      controls.target.set(0, 0, 0);
      controls.noRotate = false;
      controls.noPan = false;
      controls.update();
    }
  });
  await waitForScene(page);
  await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
}

async function prepareMoonReliefRegressionView(page, {
  origin = 'earth',
  profile = 'fast',
} = {}) {
  await ensureAnimationPaused(page);
  await setTimeline(page, 'cy3DataEnd');
  await ensureOriginMode(page, origin);
  await waitForScene(page);

  await openSettingsPanel(page);
  if (!await page.isChecked('#dimension-3D')) {
    await page.click('#dimension-3D');
    await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
  }
  await ensureCheckboxState(page, '#view-orbit', false);
  await ensureCheckboxState(page, '#view-orbit-descent', false);
  await ensureCheckboxState(page, '#view-sky', false);
  await ensureCheckboxState(page, '#view-body-halos', false);
  await ensureCheckboxState(page, '#view-xyz-axes', false);
  await ensureCheckboxState(page, '#view-poles', false);
  await ensureCheckboxState(page, '#view-polar-axes', false);
  const moonSoiToggle = page.locator('#view-moonsoi');
  if (await moonSoiToggle.count() > 0) {
    await ensureCheckboxState(page, '#view-moonsoi', false);
  }
  await setCameraPair(page, 'spacecraft__moon');
  await closeSettingsPanel(page);

  await waitForScene(page);
  await setFovDegrees(page, 6);
  await ensureMoonRenderProfile(page, profile);
  await waitForScene(page);
  await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
}

describe('Chandrayaan-3 UI Tests - Simplified', () => {
  beforeAll(async () => {
    // Build launch args based on headless mode
    // Headed mode (headless: false) needs different GPU flags than headless mode
    const baseArgs = [
      '--no-sandbox',
      '--max-old-space-size=4096',
      '--expose-gc',
      '--disable-dev-shm-usage', // Use /tmp instead of /dev/shm (helps in WSL/Docker)
      '--enable-webgl',
      '--ignore-gpu-blocklist', // Allow WebGL even on blocklisted GPUs
    ];

    const headlessArgs = [
      '--disable-gpu-sandbox',
      '--use-angle=gl', // Use ANGLE with OpenGL backend for headless WebGL
      '--enable-unsafe-swiftshader' // Enable SwiftShader for software WebGL fallback
    ];

    const headedArgs = [
      '--enable-gpu-rasterization', // Enable GPU rasterization for headed mode
      '--enable-zero-copy', // Enable zero-copy for better GPU performance
    ];

    const launchArgs = TEST_CONFIG.headless
      ? [...baseArgs, ...headlessArgs]
      : [...baseArgs, ...headedArgs];

    browser = await chromium.launch({
      headless: TEST_CONFIG.headless,
      slowMo: TEST_CONFIG.slowMo,
      args: launchArgs
    });
    page = await browser.newPage({ viewport: SSIM_VIEWPORT, deviceScaleFactor: 1 });
    if (existsSync(LOCAL_ASTRONOMY_BROWSER_FILE)) {
      const astronomyBrowserSource = readFileSync(LOCAL_ASTRONOMY_BROWSER_FILE, 'utf8');
      await page.route('https://unpkg.com/astronomy-engine/astronomy.browser.js', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript; charset=utf-8',
          body: astronomyBrowserSource,
        });
      });
    }

    // Capture console logs from the page and collect errors for assertion
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      console.log(`PAGE LOG: [${type}] ${text}`);

      // Collect errors and warnings for later assertion
      if (type === 'error' && !isIgnoredError(text)) {
        consoleErrors.push({ type, text });
      }
    });
    page.on('pageerror', error => {
      const message = error.message;
      console.log(`PAGE ERROR: ${message}`);

      // Collect page errors (JavaScript exceptions) for assertion
      if (!isIgnoredError(message)) {
        pageErrors.push(message);
      }
    });

    // Load the page and wait for it to be ready
    // Long-lived runtime requests and Vite optimizer reloads make network-idle
    // an invalid readiness signal for this animation app. The owned loading
    // overlay and scene state below are the authoritative readiness contract.
    await page.goto(TEST_CONFIG.testUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.STARTUP_TIMEOUT,
    });
    
    // Wait for basic page elements to be available
    await page.waitForSelector('#test-id-display', { timeout: TIMEOUTS.SCENE_READY_TIMEOUT });

    // Wait for the animation scene to be fully initialized
    await waitForScene(page);
    await page.waitForFunction(() => document.documentElement.dataset.panelLayout === 'legacy');
    expect(await page.locator('#experimental-dockview-host').count(), 'CY3 SSIM profile must disable Dockview').toBe(0);
  }, TIMEOUTS.CLEANUP_TIMEOUT);

  afterAll(async () => {
    // Persist latest SSIM scores for reporting/debugging (ignored by git).
    if (Object.keys(ssimScores).length > 0) {
      writeSsimLatest(ssimScores);
    }
    await browser?.close();
  }, TIMEOUTS.CLEANUP_TIMEOUT);

  beforeEach(async () => {
    // Clear error arrays before each test
    consoleErrors = [];
    pageErrors = [];

    await enforceSsimProfileViewDefaults(page);
    await pinSsimDefaultViewToggles(page);
    await enforceSsimUiChromeDefaults(page);
    await ensureHeaderPillStripCollapsed(page);
    const eventsToggle = page.locator('#control-panel-toggle');
    if (await eventsToggle.getAttribute('aria-expanded') !== 'true') {
      await eventsToggle.click();
    }
    await page.locator('#animate').waitFor({ state: 'visible' });
  });

  afterEach(() => {
    // Assert no unexpected console errors occurred during the test
    if (consoleErrors.length > 0) {
      const errorMessages = consoleErrors.map(e => `[${e.type}] ${e.text}`).join('\n');
      throw new Error(`Unexpected console errors during test:\n${errorMessages}`);
    }

    // Assert no unexpected page errors (JS exceptions) occurred
    if (pageErrors.length > 0) {
      const errorMessages = pageErrors.join('\n');
      throw new Error(`Unexpected page errors during test:\n${errorMessages}`);
    }
  });

  describe('Test Suite 1: Initial Application Load', () => {
    it('Initial Page Load and Rendering', async () => {
      const testId = 'earth-3d-initial-load';
      await displayTestId(page, testId);
      
      // Show startup message immediately
      await displayStartupMessage(page, testId);

      // Wait for scene to be fully ready and then update to actual test ID
      await waitForScene(page);
      await displayTestId(page, testId);
      
      // Take screenshot and compare
      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH
      );

      expect(comparison.isMatch).toBe(true);
      
      // Verify default modes
      expect(await page.isChecked('#origin-earth')).toBe(true);
      expect(await page.isChecked('#dimension-3D')).toBe(true);
      
      // Verify core UI elements
      const elements = [
        '#animate', '#advanced-controls-pill', '#info-button',
        '#slower', '#faster', '#realtime', '#forward', '#backward'
      ];
      
      for (const selector of elements) {
        expect(await page.locator(selector).count()).toBe(1);
      }

    }, TIMEOUTS.TEST_CASE_TIMEOUT);
  });

  describe('Test Suite 2: Earth Mode Tests', () => {
    it('Page Load in Earth Mode', async () => {
      const testId = 'earth-3d-page-load';
      await displayTestId(page, testId);

      // Verify page title
      const title = await page.title();
      expect(title).toContain('Chandrayaan 3');
      
      // Take screenshot and compare
      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH
      );

      expect(comparison.isMatch).toBe(true);

    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('3D Mode Verification', async () => {
      const testId = 'earth-3d-mode-verification';
      await displayTestId(page, testId);

      const mode3D = await page.locator('#dimension-3D:checked').count();
      expect(mode3D).toBe(1);

    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('User Interface Elements Check', async () => {
      const testId = 'earth-3d-ui-elements-check';
      await displayTestId(page, testId);
      // Main UI elements
      const mainElements = ['#animate', '#advanced-controls-pill', '#info-button', '#burn1', '#distance-SC-EARTH'];
      for (const selector of mainElements) {
        expect(await page.locator(selector).count()).toBe(1);
      }
      
      // Animation controls
      const animationElements = ['#faster', '#slower', '#forward', '#backward', '#fastforward', '#fastbackward'];
      for (const selector of animationElements) {
        expect(await page.locator(selector).count()).toBe(1);
      }
      
      // Open settings and verify all controls
      await openSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      
      // Settings elements
      const settingsElements = [
        '#origin-earth', '#origin-moon',
        '#checkbox-lock-default', '#checkbox-lock-xy', '#checkbox-lock-yz', '#checkbox-lock-zx',
        '#checkbox-lock-xy-minus', '#checkbox-lock-yz-minus', '#checkbox-lock-zx-minus',
        '#landing', '#joyride', '#view-orbit', '#view-orbit-descent', '#view-craters',
        '#view-xyz-axes', '#view-poles', '#view-polar-axes', '#view-sky',
        '#view-moonsoi', '#view-eclipticplane', '#view-equatorialplane', '#view-fps',
        '#dimension-2D', '#dimension-3D'
      ];
      
      for (const selector of settingsElements) {
        expect(await page.locator(selector).count()).toBe(1);
      }

      // Camera controls are exposed as compact position/look segmented pills.
      expect(await page.locator('input[name="camera-position-pill"][value="manual"]').count()).toBe(1);
      expect(await page.locator('input[name="camera-position-pill"][value="spacecraft"]').count()).toBe(1);
      expect(await page.locator('input[name="camera-look-pill"][value="manual"]').count()).toBe(1);
      expect(await page.locator('input[name="camera-look-pill"][value="earth"]').count()).toBe(1);
      
      await closeSettingsPanel(page);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Timeline Navigation Buttons', async () => {
      const testId = 'earth-3d-timeline-navigation';
      await displayTestId(page, testId);
      const timelineButtons = [
        '#burn1', '#burn2', '#burn3', '#burn4', '#burn5', '#burn6', '#burn7',
        '#burn8', '#burn9', '#burn10', '#burn11', '#burn12', '#burn13', '#burn14'
      ];
      
      const telemetryFields = [
        '#date', '#distance-SC-EARTH', '#distance-SC-MOON',
        '#altitude-SC-EARTH', '#velocity-SC-EARTH',
        '#altitude-SC-MOON', '#velocity-SC-MOON'
      ];
      
      // Test each timeline button
      for (const button of timelineButtons) {
        // Capture state before click
        const stateBefore = {};
        for (const field of telemetryFields) {
          try {
            stateBefore[field] = await page.locator(field).textContent();
          } catch (e) {
            stateBefore[field] = 'N/A';
          }
        }
        
        // Click button and verify it exists
        expect(await page.locator(button).count()).toBe(1);
        await page.click(button);
        await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
        
        // Verify telemetry updates (at least one field should change)
        let changed = false;
        for (const field of telemetryFields) {
          try {
            const stateAfter = await page.locator(field).textContent();
            if (stateAfter !== stateBefore[field]) {
              changed = true;
              break;
            }
          } catch (e) {
            // Field may not be visible, continue
          }
        }
        
        // For Launch button, verify specific content
        if (button === '#burn1') {
          const dateContent = await page.locator('#date').textContent();
          expect(dateContent).toContain('Jul');
        }
      }
      
      // Return to Launch
      await page.click('#burn1');
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Animation Play Control', async () => {
      const testId = 'earth-3d-animation-play-control';
      await displayTestId(page, testId);
      // Ensure we start in paused state
      const pauseButton = await page.locator('.controls-cluster--transport.is-playing #animate').count();
      if (pauseButton > 0) {
        await page.click('#animate');
        await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
      }
      
      // Verify Play button exists
      expect(await page.locator('.controls-cluster--transport:not(.is-playing) #animate').count()).toBe(1);
      
      // Capture initial telemetry
      const initialTime = await page.evaluate(() => {
        const timeEl = document.getElementById('date');
        return timeEl ? timeEl.textContent : '';
      });
      
      // Start animation
      await page.click('#animate');
      
      // Verify button changed to Pause
      expect(await page.locator('.controls-cluster--transport.is-playing #animate').count()).toBe(1);
      
      // Wait for animation to run by checking for telemetry changes
      await page.waitForFunction((initialTime) => {
        const timeEl = document.getElementById('date');
        return timeEl && timeEl.textContent !== initialTime;
      }, initialTime, { timeout: 10000 });
      
      const afterTime = await page.evaluate(() => {
        const timeEl = document.getElementById('date');
        return timeEl ? timeEl.textContent : '';
      });
      
      // Verify animation is running (telemetry changed)
      expect(afterTime).not.toBe(initialTime);
      
      // Stop animation (required: end with animation stopped)
      await page.click('#animate');
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
      expect(await page.locator('.controls-cluster--transport:not(.is-playing) #animate').count()).toBe(1);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('Animation Pause Control', async () => {
      const testId = 'earth-3d-animation-pause-control';
      await displayTestId(page, testId);
      // Ensure animation is running first
      const playButton = await page.locator('.controls-cluster--transport:not(.is-playing) #animate');
      if (await playButton.count() > 0) {
        await playButton.click();
      }
      
      // Verify Pause button exists
      await page.waitForSelector('.controls-cluster--transport.is-playing #animate');
      
      // Pause animation
      await page.click('#animate');
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
      
      // Verify button changed to Play
      await page.waitForSelector('.controls-cluster--transport:not(.is-playing) #animate');

      // Capture telemetry after pause
      const beforeTime = await page.evaluate(() => {
        const timeEl = document.getElementById('date');
        return timeEl ? timeEl.textContent : '';
      });
      
      // Wait and verify animation has stopped by checking telemetry doesn't change
      await page.waitForTimeout(TIMEOUTS.STABLE_RENDER_TIMEOUT);
      
      const afterTime = await page.evaluate(() => {
        const timeEl = document.getElementById('date');
        return timeEl ? timeEl.textContent : '';
      });
      
      // Verify animation paused (telemetry unchanged)
      expect(afterTime).toBe(beforeTime);
      
      // Already in stopped state as required
      expect(await page.locator('.controls-cluster--transport:not(.is-playing) #animate').count()).toBe(1);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Speed Controls', async () => {
      const testId = 'earth-3d-speed-controls';
      await displayTestId(page, testId);
      // Verify speed control buttons exist
      const speedButtons = ['#faster', '#slower', '#realtime'];
      for (const button of speedButtons) {
        expect(await page.locator(button).count()).toBe(1);
      }
      
      // Start animation
      await page.click('#animate');
      await page.waitForSelector('.controls-cluster--transport.is-playing #animate');
      
      const timelineSamples = [];
      
      // Initial sample
      let currentTime = await page.locator('#date').textContent();
      timelineSamples.push({ time: 0, timeline: currentTime, action: 'start' });
      
      // Test faster button (3 clicks)
      for (let i = 1; i <= 3; i++) {
        await clickSpeedControl(page, 'faster', 1);
        await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
        currentTime = await page.locator('#date').textContent();
        timelineSamples.push({ time: i, timeline: currentTime, action: 'faster' });
      }
      
      // Test slower button (3 clicks)
      for (let i = 4; i <= 6; i++) {
        await clickSpeedControl(page, 'slower', 1);
        await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
        currentTime = await page.locator('#date').textContent();
        timelineSamples.push({ time: i, timeline: currentTime, action: 'slower' });
      }
      
      // Verify speed controls are working (multiple different timeline values)
      const uniqueTimelines = new Set(timelineSamples.map(s => s.timeline));
      expect(uniqueTimelines.size).toBeGreaterThan(2);
      
      // Stop animation
      await page.click('#animate');
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Directional Controls Check', async () => {
      const testId = 'earth-3d-directional-controls-check';
      await displayTestId(page, testId);
      const directionalButtons = ['#forward', '#backward', '#fastforward', '#fastbackward'];
      for (const button of directionalButtons) {
        expect(await page.locator(button).count()).toBe(1);
      }
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Direction Control with Timeline', async () => {
      const testId = 'earth-3d-directional-controls-timeline';
      await displayTestId(page, testId);
      // Set baseline at Launch
      await page.click('#burn1');
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
      const baselineDate = await page.locator('#date').textContent();
      
      const timelineValues = [baselineDate];
      
      // Test Forward (5 clicks)
      for (let i = 0; i < 5; i++) {
        await page.click('#forward');
        await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
        const dateValue = await page.locator('#date').textContent();
        timelineValues.push(dateValue);
      }
      
      // Test Fast Forward (5 clicks)
      for (let i = 0; i < 5; i++) {
        await page.click('#fastforward');
        await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
        const dateValue = await page.locator('#date').textContent();
        timelineValues.push(dateValue);
      }
      
      // Test Backward (5 clicks)
      for (let i = 0; i < 5; i++) {
        await page.click('#backward');
        await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
        const dateValue = await page.locator('#date').textContent();
        timelineValues.push(dateValue);
      }
      
      // Test Fast Backward (5 clicks)
      for (let i = 0; i < 5; i++) {
        await page.click('#fastbackward');
        await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
        const dateValue = await page.locator('#date').textContent();
        timelineValues.push(dateValue);
      }
      
      // Verify directional controls work (21 total samples, should have variety)
      const uniqueValues = new Set(timelineValues);
      expect(uniqueValues.size).toBeGreaterThan(1);
      expect(timelineValues.length).toBe(21);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Plane Selection Views', async () => {
      const testId = 'earth-3d-plane-selection';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);

      // Store and clear orbit family displays for unobstructed view
      const orbitChecked = await page.isChecked('#view-orbit');
      const descentOrbitChecked = await page.isChecked('#view-orbit-descent');
      const moonOsculatingToggle = page.locator('#view-moon-osculating-orbit');
      const moonOsculatingChecked = await moonOsculatingToggle.count() > 0
        ? await page.isChecked('#view-moon-osculating-orbit')
        : null;
      await ensureOrbitFamilyState(page, false);
      
      const planes = [
        { name: 'default', selector: '#checkbox-lock-default' },
        { name: 'xy', selector: '#checkbox-lock-xy' },
        { name: 'yz', selector: '#checkbox-lock-yz' },
        { name: 'zx', selector: '#checkbox-lock-zx' },
        { name: 'xy-minus', selector: '#checkbox-lock-xy-minus' },
        { name: 'yz-minus', selector: '#checkbox-lock-yz-minus' },
        { name: 'zx-minus', selector: '#checkbox-lock-zx-minus' },
        { name: 'default-final', selector: '#checkbox-lock-default' }
      ];
      
      for (const plane of planes) {
        await page.click(plane.selector);
        await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
        expect(await page.locator(`${plane.selector}:checked`).count()).toBe(1);
        await closeSettingsPanel(page);
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        
        const screenshotName = `${testId}-${plane.name}.png`;
        const comparison = await compareScreenshots(
          page,
          screenshotName,
          screenshotName,
          `${testId} - ${plane.name}`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);
        
        await openSettingsPanel(page);
      }

      // Restore orbit displays
      if (orbitChecked && !(await page.isChecked('#view-orbit'))) {
        await page.click('#view-orbit');
      }
      if (descentOrbitChecked && !(await page.isChecked('#view-orbit-descent'))) {
        await page.click('#view-orbit-descent');
      }
      if (moonOsculatingChecked !== null) {
        await ensureCheckboxState(page, '#view-moon-osculating-orbit', moonOsculatingChecked);
      }

      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('2D/3D Mode Switching', async () => {
      const testId = 'earth-2d-3d-mode-switching';
      await displayTestId(page, testId);
      await setTimeline(page, SUITE_TIMELINE);
      await openSettingsPanel(page);
      if (!(await page.isChecked('#dimension-3D'))) {
        await page.click('#dimension-3D');
      }
      await ensureOrbitFamilyState(page, true);
      await resetCameraToManual(page);
      await page.click('#checkbox-lock-default');
      await page.click('#checkbox-lock-xy');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      expect(await page.locator('#dimension-3D:checked').count()).toBe(1);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await waitForScene(page);
      
      // 3D Mode Screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-3d-initial.png`,
        `${testId}-3d-initial.png`,
        `${testId} 3D Mode`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Switch to 2D
      await openSettingsPanel(page);
      await page.click('#dimension-2D');
      expect(await page.locator('#dimension-2D:checked').count()).toBe(1);
      await closeSettingsPanel(page);
      await page.click('#burn1');
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
      await waitForScene(page);
      
      
      // 2D Mode Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-2d.png`,
        `${testId}-2d.png`,
        `${testId} 2D Mode`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Switch back to 3D
      await openSettingsPanel(page);
      await page.click('#dimension-3D');
      await resetCameraToManual(page);
      await page.click('#checkbox-lock-default');
      await page.click('#checkbox-lock-xy');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      expect(await page.locator('#dimension-3D:checked').count()).toBe(1);
      expect(await page.locator('canvas').count()).toBeGreaterThan(0);
      await closeSettingsPanel(page);
      await waitForScene(page);
      
      // 3D Restored Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-3d-restored.png`,
        `${testId}-3d-restored.png`,
        `${testId} 3D Mode Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('Poles View Toggle', async () => {
      const testId = 'earth-3d-poles-toggle';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      if (!(await page.isChecked('#checkbox-lock-xy'))) {
        await page.click('#checkbox-lock-xy');
      }
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await page.click('#dimension-3D');
      
      // Clear orbit displays and axes for unobstructed pole view
      if (await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      // Also uncheck axes for better pole visibility
      if (await page.isChecked('#view-xyz-axes')) {
        await page.click('#view-xyz-axes');
      }
      if (await page.isChecked('#view-polar-axes')) {
        await ensureCheckboxState(page, '#view-polar-axes', !(await page.isChecked('#view-polar-axes')));
      }
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      await page.click('#burn1');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      await ensureAnimationPaused(page);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      
      // Store initial state and zoom in for optimal pole visibility
      const initialState = await storeInitialState(page);
      await zoomIn(page, TEST_MODES.EARTH.polesZoom, 'EARTH');
      
      // Enabled Screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-enabled.png`,
        `${testId}-enabled.png`,
        `${testId} Enabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Disable poles
      await openSettingsPanel(page);
      expect(await page.isChecked('#view-poles')).toBe(true);
      await ensureCheckboxState(page, '#view-poles', !(await page.isChecked('#view-poles')));
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Disabled Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-disabled.png`,
        `${testId}-disabled.png`,
        `${testId} Disabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Re-enable poles
      await openSettingsPanel(page);
      await ensureCheckboxState(page, '#view-poles', !(await page.isChecked('#view-poles')));
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Restored Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-restored.png`,
        `${testId}-restored.png`,
        `${testId} Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Restore zoom level and state
      await zoomOut(page, TEST_MODES.EARTH.polesZoom, 'EARTH');
      await restoreStoredState(page, initialState);
      
      // Restore orbit displays and axes if they were initially checked
      await openSettingsPanel(page);
      if (!await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (!await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      if (!await page.isChecked('#view-xyz-axes')) {
        await page.click('#view-xyz-axes');
      }
      if (!await page.isChecked('#view-polar-axes')) {
        await ensureCheckboxState(page, '#view-polar-axes', !(await page.isChecked('#view-polar-axes')));
      }
      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('Polar Axes View Toggle', async () => {
      const testId = 'earth-3d-polar-axes-toggle';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      if (!(await page.isChecked('#checkbox-lock-xy'))) {
        await page.click('#checkbox-lock-xy');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      await page.click('#dimension-3D');
      await ensureAnimationPaused(page);
      
      // Uncheck orbits for better polar axes visibility
      if (await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      await setTimeline(page, '#burn1');
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await resetCameraToManual(page);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
      await ensureAnimationPaused(page);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      
      // Store initial state and zoom for deterministic framing.
      const initialState = await storeInitialState(page);
      await zoomIn(page, TEST_MODES.EARTH.polarAxesZoom, 'EARTH');
      
      // Enabled Screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-enabled.png`,
        `${testId}-enabled.png`,
        `${testId} Enabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Disable polar axes
      await openSettingsPanel(page);
      expect(await page.isChecked('#view-polar-axes')).toBe(true);
      await ensureCheckboxState(page, '#view-polar-axes', false);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Disabled Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-disabled.png`,
        `${testId}-disabled.png`,
        `${testId} Disabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Re-enable polar axes
      await openSettingsPanel(page);
      await ensureCheckboxState(page, '#view-polar-axes', true);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Restored Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-restored.png`,
        `${testId}-restored.png`,
        `${testId} Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);

      // Restore zoom level and state
      await zoomOut(page, TEST_MODES.EARTH.polarAxesZoom, 'EARTH');
      await restoreStoredState(page, initialState);
      
      // Restore orbits if they were initially checked
      await openSettingsPanel(page);
      if (!await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (!await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('XYZ Axes View Toggle', async () => {
      const testId = 'earth-3d-xyz-axes-toggle';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      if (!(await page.isChecked('#checkbox-lock-default'))) {
        await page.click('#checkbox-lock-default');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      await page.click('#dimension-3D');
      
      // Uncheck orbit family for better XYZ axes visibility
      await ensureOrbitFamilyState(page, false);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Enabled Screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-enabled.png`,
        `${testId}-enabled.png`,
        `${testId} Enabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Disable XYZ axes
      await openSettingsPanel(page);
      expect(await page.isChecked('#view-xyz-axes')).toBe(true);
      await page.click('#view-xyz-axes');
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Disabled Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-disabled.png`,
        `${testId}-disabled.png`,
        `${testId} Disabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Re-enable XYZ axes
      await openSettingsPanel(page);
      await page.click('#view-xyz-axes');
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Restored Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-restored.png`,
        `${testId}-restored.png`,
        `${testId} Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Restore orbit family for downstream test consistency
      await openSettingsPanel(page);
      await ensureOrbitFamilyState(page, true);
      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    describe('Additional View Controls', () => {
      const setupTest = async () => {
        await openSettingsPanel(page);
        await ensureOrbitFamilyState(page, false);
        await closeSettingsPanel(page);
        await zoomOut(page, TEST_MODES.EARTH.soiZoomOut, 'EARTH');
      };


      it("Moon's SOI View", async () => {
        const testId = 'earth-3d-moon-soi-view';
        await displayTestId(page, testId);
        await setupTest();

        try {
          await openSettingsPanel(page);
          await page.click('#view-moonsoi');
          await closeSettingsPanel(page);
          await waitForScene(page);

          const comparisonEnabled = await compareScreenshots(
            page,
            `${testId}-enabled.png`,
            `${testId}-enabled.png`,
            `${testId} Enabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonEnabled.isMatch).toBe(true);

          await openSettingsPanel(page);
          await page.click('#view-moonsoi');
          await closeSettingsPanel(page);
          await waitForScene(page);

          const comparisonDisabled = await compareScreenshots(
            page,
            `${testId}-disabled.png`,
            `${testId}-disabled.png`,
            `${testId} Disabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonDisabled.isMatch).toBe(true);
        } finally {
          // Ensure Moon SOI is disabled even if test fails
          await openSettingsPanel(page);
          if (await page.isChecked('#view-moonsoi')) {
            await page.click('#view-moonsoi');
          }
          await closeSettingsPanel(page);
          await cleanupViewControlTest(page, TEST_MODES.EARTH, TEST_MODES.EARTH.soiZoomOut);
        }
      }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

      it('Ecliptic Plane View', async () => {
        const testId = 'earth-3d-ecliptic-plane-view';
        await displayTestId(page, testId);
        await setupTest();

        try {
          await openSettingsPanel(page);
          await page.click('#view-eclipticplane');
          await closeSettingsPanel(page);
          await waitForScene(page);

          const comparisonEnabled = await compareScreenshots(
            page,
            `${testId}-enabled.png`,
            `${testId}-enabled.png`,
            `${testId} Enabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonEnabled.isMatch).toBe(true);

          await openSettingsPanel(page);
          await page.click('#view-eclipticplane');
          await closeSettingsPanel(page);
          await waitForScene(page);

          const comparisonDisabled = await compareScreenshots(
            page,
            `${testId}-disabled.png`,
            `${testId}-disabled.png`,
            `${testId} Disabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonDisabled.isMatch).toBe(true);
        } finally {
          // Ensure Ecliptic Plane is disabled even if test fails
          await openSettingsPanel(page);
          if (await page.isChecked('#view-eclipticplane')) {
            await page.click('#view-eclipticplane');
          }
          await closeSettingsPanel(page);
          await cleanupViewControlTest(page, TEST_MODES.EARTH);
        }
      }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

      it('Equatorial Plane View', async () => {
        const testId = 'earth-3d-equatorial-plane-view';
        await displayTestId(page, testId);
        await setupTest();

        try {
          await openSettingsPanel(page);
          await page.click('#view-equatorialplane');
          await closeSettingsPanel(page);
          await waitForScene(page);

          const comparisonEnabled = await compareScreenshots(
            page,
            `${testId}-enabled.png`,
            `${testId}-enabled.png`,
            `${testId} Enabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonEnabled.isMatch).toBe(true);

          await openSettingsPanel(page);
          await page.click('#view-equatorialplane');
          await closeSettingsPanel(page);
          await waitForScene(page);

          const comparisonDisabled = await compareScreenshots(
            page,
            `${testId}-disabled.png`,
            `${testId}-disabled.png`,
            `${testId} Disabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonDisabled.isMatch).toBe(true);
        } finally {
          // Ensure Equatorial Plane is disabled even if test fails
          await openSettingsPanel(page);
          if (await page.isChecked('#view-equatorialplane')) {
            await page.click('#view-equatorialplane');
          }
          await closeSettingsPanel(page);
          await cleanupViewControlTest(page, TEST_MODES.EARTH);
        }
      }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);
    });

    it('Joy Ride Control', async () => {
      const testId = 'earth-3d-joy-ride';
      await startTest(page, testId, 'Joy Ride Control'); // Uses #burn3
      try {
        await openSettingsPanel(page);
        await resetCameraToManual(page);
        if (!(await page.isChecked('#dimension-3D'))) {
          await page.click('#dimension-3D');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (!(await page.isChecked('#checkbox-lock-default'))) {
          await page.click('#checkbox-lock-default');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (await page.isChecked('#landing')) {
          await page.click('#landing');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        await ensureCheckboxState(page, '#view-body-halos', false);
        await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
        await page.click('#joyride');
        await closeSettingsPanel(page);
        await waitForScene(page);
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);

        const comparison = await compareScreenshots(
          page,
          `${testId}-enabled.png`,
          `${testId}-enabled.png`,
          `${testId} Enabled`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      } finally {
        await openSettingsPanel(page);
        if (await page.isChecked('#joyride')) {
          await page.click('#joyride');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        await resetCameraToManual(page);
        if (!(await page.isChecked('#checkbox-lock-default'))) {
          await page.click('#checkbox-lock-default');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        await closeSettingsPanel(page);
      }
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('CY3 Orbit Display', async () => {
      const testId = 'earth-3d-cy3-orbit-display';
      await displayTestId(page, testId);
      try {
        await openSettingsPanel(page);
        await resetCameraToManual(page);
        if (!(await page.isChecked('#dimension-3D'))) {
          await page.click('#dimension-3D');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (!(await page.isChecked('#checkbox-lock-default'))) {
          await page.click('#checkbox-lock-default');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }

        // Ensure orbit is checked
        if (!(await page.isChecked('#view-orbit'))) {
          await page.click('#view-orbit');
        }
        await closeSettingsPanel(page);
        await setTimeline(page, '#burn1');

        // Screenshot 1: Orbit Checked
        let comparison = await compareScreenshots(
          page,
          `${testId}-checked.png`,
          `${testId}-checked.png`,
          `${testId} Checked`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);

        // Uncheck orbit
        await openSettingsPanel(page);
        await page.click('#view-orbit');
        await closeSettingsPanel(page);

        // Screenshot 2: Orbit Unchecked
        comparison = await compareScreenshots(
          page,
          `${testId}-unchecked.png`,
          `${testId}-unchecked.png`,
          `${testId} Unchecked`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);

        // Re-check orbit
        await openSettingsPanel(page);
        await page.click('#view-orbit');
        await closeSettingsPanel(page);

        // Screenshot 3: Orbit Restored
        comparison = await compareScreenshots(
          page,
          `${testId}-restored.png`,
          `${testId}-checked.png`, // Compare against the original baseline
          `${testId} Restored`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      } finally {
        await openSettingsPanel(page);
        if (!(await page.isChecked('#view-orbit'))) {
          await page.click('#view-orbit');
        }
        await closeSettingsPanel(page);
      }
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Final Stability Check', async () => {
      const testId = 'earth-3d-final-stability-check';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      await resetCameraToManual(page);
      if (!(await page.isChecked('#dimension-3D'))) {
        await page.click('#dimension-3D');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      if (!(await page.isChecked('#checkbox-lock-default'))) {
        await page.click('#checkbox-lock-default');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      await closeSettingsPanel(page);
      await setTimeline(page, '#burn1');
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      
      // Initial stability
      let comparison = await compareScreenshots(
        page,
        `${testId}-initial.png`,
        `${testId}-initial.png`,
        `${testId} Initial`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Verify functional elements
      expect(await page.locator('#origin-earth:checked').count()).toBe(1);
      expect(await page.locator('#distance-SC-EARTH').count()).toBe(1);
      expect(await page.locator('#burn1').count()).toBe(1);
      expect(await page.locator('#dimension-3D:checked').count()).toBe(1);
      
      // Responsiveness test
      await page.click('#burn1');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      await page.click('#burn2');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      await page.click('#burn1');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Final stability
      comparison = await compareScreenshots(
        page,
        `${testId}-final.png`,
        `${testId}-final.png`,
        `${testId} Final`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);
  });

  describe('Test Suite 3: Moon Mode Tests', () => {
    beforeAll(async () => {
      // Reset timeline to mission start BEFORE switching modes
      // This prevents state carryover from Speed Controls test
      await setTimeline(page, '#burn1');

      // Switch to Moon mode
      await openSettingsPanel(page);
      if (!await page.isChecked('#origin-moon')) {
        await page.click('#origin-moon');
      }
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);

      // Ensure landing is disabled initially (it might be auto-enabled)
      if (await page.isChecked('#landing')) {
        await page.click('#landing');
      }

      // Set default camera and plane to ensure a clean state
      await resetCameraToManual(page);
      await page.click('#checkbox-lock-default');


      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      // Wait for the lunar scene to be ready
      await waitForScene(page);
      // Additional wait for Moon orbit curves to fully render
      await page.waitForTimeout(TIMEOUTS.STABLE_RENDER_TIMEOUT);
      await resetCameraToManual(page);
      await waitForScene(page);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);

      // Reset timeline again after mode switch to ensure consistent start state
      await setTimeline(page, '#burn1');
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    beforeEach(async () => {
      await ensureAnimationPaused(page);
      await ensureFovOneDegree(page, false);
    });

    it('Page Load in Moon Mode', async () => {
      const testId = 'moon-3d-page-load';
      await displayTestId(page, testId);
      const title = await page.title();
      expect(title).toContain('Chandrayaan 3');
      
      await waitForScene(page);
      // Additional wait for lunar orbit animation to fully render
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('3D Mode Verification', async () => {
      const testId = 'moon-3d-mode-verification';
      await displayTestId(page, testId);
      const mode3D = await page.locator('#dimension-3D:checked').count();
      expect(mode3D).toBe(1);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Plane Selection Views', async () => {
      const testId = 'moon-3d-plane-selection';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);

      // Store and clear orbit displays for unobstructed view
      const orbitChecked = await page.isChecked('#view-orbit');
      const descentOrbitChecked = await page.isChecked('#view-orbit-descent');
      if (orbitChecked) {
        await page.click('#view-orbit');
      }
      if (descentOrbitChecked) {
        await page.click('#view-orbit-descent');
      }
      
      const planes = [
        { name: 'default', selector: '#checkbox-lock-default' },
        { name: 'xy', selector: '#checkbox-lock-xy' },
        { name: 'yz', selector: '#checkbox-lock-yz' },
        { name: 'zx', selector: '#checkbox-lock-zx' },
        { name: 'xy-minus', selector: '#checkbox-lock-xy-minus' },
        { name: 'yz-minus', selector: '#checkbox-lock-yz-minus' },
        { name: 'zx-minus', selector: '#checkbox-lock-zx-minus' },
        { name: 'default-final', selector: '#checkbox-lock-default' }
      ];
      
      for (const plane of planes) {
        await page.click(plane.selector);
        await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
        expect(await page.locator(`${plane.selector}:checked`).count()).toBe(1);
        await closeSettingsPanel(page);
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        
        const screenshotName = `${testId}-${plane.name}.png`;
        const comparison = await compareScreenshots(
          page,
          screenshotName,
          screenshotName,
          `${testId} - ${plane.name}`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);
        
        await openSettingsPanel(page);
      }

      // Restore orbit displays
      if (orbitChecked && !(await page.isChecked('#view-orbit'))) {
        await page.click('#view-orbit');
      }
      if (descentOrbitChecked && !(await page.isChecked('#view-orbit-descent'))) {
        await page.click('#view-orbit-descent');
      }

      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('2D/3D Mode Switching', async () => {
      const testId = 'moon-2d-3d-mode-switching';
      await displayTestId(page, testId);
      await setTimeline(page, SUITE_TIMELINE);
      await openSettingsPanel(page);
      if (!(await page.isChecked('#dimension-3D'))) {
        await page.click('#dimension-3D');
      }
      await resetCameraToManual(page);
      await page.click('#checkbox-lock-default');
      await page.click('#checkbox-lock-xy');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      expect(await page.locator('#dimension-3D:checked').count()).toBe(1);
      
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await waitForScene(page);
      
      // 3D Mode Screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-3d-initial.png`,
        `${testId}-3d-initial.png`,
        `${testId} 3D Mode`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Switch to 2D
      await openSettingsPanel(page);
      await page.click('#dimension-2D');
      expect(await page.locator('#dimension-2D:checked').count()).toBe(1);
      await closeSettingsPanel(page);
      await page.click('#burn1');
      await page.waitForTimeout(TIMEOUTS.QUICK_DELAY);
      await waitForScene(page);
      
      
      // 2D Mode Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-2d.png`,
        `${testId}-2d.png`,
        `${testId} 2D Mode`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Switch back to 3D
      await openSettingsPanel(page);
      await page.click('#dimension-3D');
      await resetCameraToManual(page);
      await page.click('#checkbox-lock-default');
      await page.click('#checkbox-lock-xy');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      expect(await page.locator('#dimension-3D:checked').count()).toBe(1);
      expect(await page.locator('canvas').count()).toBeGreaterThan(0);
      await closeSettingsPanel(page);
      await waitForScene(page);
      
      // 3D Restored Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-3d-restored.png`,
        `${testId}-3d-restored.png`,
        `${testId} 3D Mode Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('Poles View Toggle', async () => {
      const testId = 'moon-3d-poles-toggle';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      await page.click('#checkbox-lock-xy');
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await page.click('#dimension-3D');
      
      // CRITICAL: Ensure landing is disabled to show Moon properly
      if (await page.isChecked('#landing')) {
        await page.click('#landing');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      
      // Clear orbit displays and axes for unobstructed pole view
      if (await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      // Also uncheck axes for better pole visibility
      if (await page.isChecked('#view-xyz-axes')) {
        await page.click('#view-xyz-axes');
      }
      if (await page.isChecked('#view-polar-axes')) {
        await ensureCheckboxState(page, '#view-polar-axes', !(await page.isChecked('#view-polar-axes')));
      }
      await closeSettingsPanel(page);
      await waitForScene(page);
      
      // Match the historical baseline's late-mission lunar framing.
      await setTimeline(page, 'cy3DataEnd');
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Store initial state and zoom in for optimal pole visibility
      const initialState = await storeInitialState(page);
      await zoomIn(page, TEST_MODES.MOON.polesZoom, 'MOON');
      
      // Enabled Screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-enabled.png`,
        `${testId}-enabled.png`,
        `${testId} Enabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Disable poles
      await openSettingsPanel(page);
      expect(await page.isChecked('#view-poles')).toBe(true);
      await ensureCheckboxState(page, '#view-poles', !(await page.isChecked('#view-poles')));
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Disabled Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-disabled.png`,
        `${testId}-disabled.png`,
        `${testId} Disabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Re-enable poles
      await openSettingsPanel(page);
      await ensureCheckboxState(page, '#view-poles', !(await page.isChecked('#view-poles')));
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Restored Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-restored.png`,
        `${testId}-restored.png`,
        `${testId} Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Restore zoom level and state
      await zoomOut(page, TEST_MODES.MOON.polesZoom, 'MOON');
      await restoreStoredState(page, initialState);
      
      // Restore orbit displays and axes if they were initially checked
      await openSettingsPanel(page);
      if (!await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (!await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      if (!await page.isChecked('#view-xyz-axes')) {
        await page.click('#view-xyz-axes');
      }
      if (!await page.isChecked('#view-polar-axes')) {
        await ensureCheckboxState(page, '#view-polar-axes', !(await page.isChecked('#view-polar-axes')));
      }
      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('Polar Axes View Toggle', async () => {
      const testId = 'moon-3d-polar-axes-toggle';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      await resetCameraToManual(page);
      if (!(await page.isChecked('#checkbox-lock-yz-minus'))) {
        await page.click('#checkbox-lock-yz-minus');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      await page.click('#dimension-3D');
      
      // Uncheck orbits for better polar axes visibility
      if (await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      await closeSettingsPanel(page);
      await waitForScene(page);
      await setTimeline(page, 'cy3DataEnd');
      
      // Store initial state and zoom in for clear meridian line visibility
      const initialState = await storeInitialState(page);
      await zoomIn(page, TEST_MODES.MOON.polarAxesZoom, 'MOON');
      
      // Enabled Screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-enabled.png`,
        `${testId}-enabled.png`,
        `${testId} Enabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Disable polar axes
      await openSettingsPanel(page);
      expect(await page.isChecked('#view-polar-axes')).toBe(true);
      await ensureCheckboxState(page, '#view-polar-axes', !(await page.isChecked('#view-polar-axes')));
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Disabled Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-disabled.png`,
        `${testId}-disabled.png`,
        `${testId} Disabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Re-enable polar axes
      await openSettingsPanel(page);
      await ensureCheckboxState(page, '#view-polar-axes', !(await page.isChecked('#view-polar-axes')));
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Restored Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-restored.png`,
        `${testId}-restored.png`,
        `${testId} Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);

      // Restore zoom level and state
      await zoomOut(page, TEST_MODES.MOON.polarAxesZoom, 'MOON');
      await restoreStoredState(page, initialState);
      
      // Restore orbits if they were initially checked
      await openSettingsPanel(page);
      if (!await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (!await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('XYZ Axes View Toggle', async () => {
      const testId = 'moon-3d-xyz-axes-toggle';
      await displayTestId(page, testId);
      await openSettingsPanel(page);
      if (!(await page.isChecked('#checkbox-lock-default'))) {
        await page.click('#checkbox-lock-default');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      await page.click('#dimension-3D');
      
      // Uncheck orbits for better XYZ axes visibility
      if (await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      await closeSettingsPanel(page);
      await waitForScene(page);
      await setTimeline(page, 'cy3DataEnd');
      
      const initialState = await storeInitialState(page);

      // Enabled Screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-enabled.png`,
        `${testId}-enabled.png`,
        `${testId} Enabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Disable XYZ axes
      await openSettingsPanel(page);
      expect(await page.isChecked('#view-xyz-axes')).toBe(true);
      await page.click('#view-xyz-axes');
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Disabled Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-disabled.png`,
        `${testId}-disabled.png`,
        `${testId} Disabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Re-enable XYZ axes
      await openSettingsPanel(page);
      await page.click('#view-xyz-axes');
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Restored Screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-restored.png`,
        `${testId}-restored.png`,
        `${testId} Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);

      await restoreStoredState(page, initialState);
      
      // Restore orbits if they were initially checked
      await openSettingsPanel(page);
      if (!await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (!await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    describe('Additional View Controls', () => {
      const setupTest = async () => {
        await setTimeline(page, 'cy3DataEnd');
        await openSettingsPanel(page);
        if (await page.isChecked('#view-orbit')) {
          await page.click('#view-orbit');
        }
        if (await page.isChecked('#view-orbit-descent')) {
          await page.click('#view-orbit-descent');
        }
        await closeSettingsPanel(page);
        await zoomOut(page, TEST_MODES.MOON.soiZoomOut, 'MOON');
      };


      it("Moon's SOI View", async () => {
        const testId = 'moon-3d-moon-soi-view';
        await displayTestId(page, testId);
        await setupTest();

        try {
          await openSettingsPanel(page);
          const moonSoiVisible = await page.locator('#view-moonsoi').isVisible();
          if (!moonSoiVisible) {
            // Product behavior: Moon SOI toggle is hidden in lunar mode.
            expect(await page.locator('#view-moonsoi').count()).toBe(1);
            await closeSettingsPanel(page);
            return;
          }
          await page.click('#view-moonsoi');
          await closeSettingsPanel(page);

          const comparisonEnabled = await compareScreenshots(
            page,
            `${testId}-enabled.png`,
            `${testId}-enabled.png`,
            `${testId} Enabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonEnabled.isMatch).toBe(true);

          await openSettingsPanel(page);
          await page.click('#view-moonsoi');
          await closeSettingsPanel(page);

          const comparisonDisabled = await compareScreenshots(
            page,
            `${testId}-disabled.png`,
            `${testId}-disabled.png`,
            `${testId} Disabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonDisabled.isMatch).toBe(true);
        } finally {
          // Ensure Moon SOI is disabled even if test fails
          await openSettingsPanel(page);
          if (await page.isChecked('#view-moonsoi')) {
            await page.click('#view-moonsoi');
          }
          await closeSettingsPanel(page);
          await cleanupViewControlTest(page, TEST_MODES.MOON, TEST_MODES.MOON.soiZoomOut);
        }
      }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

      it('Ecliptic Plane View', async () => {
        const testId = 'moon-3d-ecliptic-plane-view';
        await displayTestId(page, testId);
        await setupTest();

        try {
          await openSettingsPanel(page);
          await page.click('#view-eclipticplane');
          await closeSettingsPanel(page);

          const comparisonEnabled = await compareScreenshots(
            page,
            `${testId}-enabled.png`,
            `${testId}-enabled.png`,
            `${testId} Enabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonEnabled.isMatch).toBe(true);

          await openSettingsPanel(page);
          await page.click('#view-eclipticplane');
          await closeSettingsPanel(page);

          const comparisonDisabled = await compareScreenshots(
            page,
            `${testId}-disabled.png`,
            `${testId}-disabled.png`,
            `${testId} Disabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonDisabled.isMatch).toBe(true);
        } finally {
          // Ensure Ecliptic Plane is disabled even if test fails
          await openSettingsPanel(page);
          if (await page.isChecked('#view-eclipticplane')) {
            await page.click('#view-eclipticplane');
          }
          await closeSettingsPanel(page);
          await cleanupViewControlTest(page, TEST_MODES.MOON);
        }
      }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

      it('Equatorial Plane View', async () => {
        const testId = 'moon-3d-equatorial-plane-view';
        await displayTestId(page, testId);
        await setupTest();

        try {
          await openSettingsPanel(page);
          await page.click('#view-equatorialplane');
          await closeSettingsPanel(page);

          const comparisonEnabled = await compareScreenshots(
            page,
            `${testId}-enabled.png`,
            `${testId}-enabled.png`,
            `${testId} Enabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonEnabled.isMatch).toBe(true);

          await openSettingsPanel(page);
          await page.click('#view-equatorialplane');
          await closeSettingsPanel(page);

          const comparisonDisabled = await compareScreenshots(
            page,
            `${testId}-disabled.png`,
            `${testId}-disabled.png`,
            `${testId} Disabled`,
            TOLERANCE.APPROX_MATCH
          );
          expect(comparisonDisabled.isMatch).toBe(true);
        } finally {
          // Ensure Equatorial Plane is disabled even if test fails
          await openSettingsPanel(page);
          if (await page.isChecked('#view-equatorialplane')) {
            await page.click('#view-equatorialplane');
          }
          await closeSettingsPanel(page);
          await cleanupViewControlTest(page, TEST_MODES.MOON);
        }
      }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);
    });

    it('CY3 Orbit Display', async () => {
      const testId = 'moon-3d-cy3-orbit-display';
      await displayTestId(page, testId);
      try {
        await openSettingsPanel(page);
        await resetCameraToManual(page);
        if (!(await page.isChecked('#dimension-3D'))) {
          await page.click('#dimension-3D');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (!(await page.isChecked('#checkbox-lock-default'))) {
          await page.click('#checkbox-lock-default');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (await page.isChecked('#landing')) {
          await page.click('#landing');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (await page.isChecked('#joyride')) {
          await page.click('#joyride');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }

        if (!(await page.isChecked('#view-orbit'))) {
          await page.click('#view-orbit');
        }
        await closeSettingsPanel(page);
        await setTimeline(page, 'cy3DataEnd');
        await waitForScene(page);

        let comparison = await compareScreenshots(
          page,
          `${testId}-checked.png`,
          `${testId}-checked.png`,
          `${testId} Checked`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);

        await openSettingsPanel(page);
        await page.click('#view-orbit');
        await closeSettingsPanel(page);
        await waitForScene(page);

        comparison = await compareScreenshots(
          page,
          `${testId}-unchecked.png`,
          `${testId}-unchecked.png`,
          `${testId} Unchecked`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);

        await openSettingsPanel(page);
        await page.click('#view-orbit');
        await closeSettingsPanel(page);
      } finally {
        await cleanupViewControlTest(page, TEST_MODES.MOON);
      }
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('CY3 Descent Orbit Display', async () => {
      const testId = 'moon-3d-cy3-descent-orbit-display';
      await displayTestId(page, testId);

      // Reset camera to default position and plane to ensure a clean state
      await openSettingsPanel(page);
      await resetCameraToManual(page);
      await page.click('#checkbox-lock-default');
      await closeSettingsPanel(page);
      await openSettingsPanel(page);
      
      // Set XY- plane as required
      const xyMinusPlane = await page.locator('input[name="plane"][value="XY-"]:checked').count();
      if (xyMinusPlane === 0) {
        await page.click('input[name="plane"][value="XY-"]');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      
      if (await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      await closeSettingsPanel(page);
      
      // Use Launch timeline as required
      await page.click('#burn1');  // Launch timeline
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Zoom in on Moon for better view
      await zoomIn(page, TEST_MODES.MOON.descentOrbitZoom, 'MOON');
      
      await openSettingsPanel(page);
      if (!(await page.isChecked('#view-orbit-descent'))) {
        await page.click('#view-orbit-descent');
      }
      await closeSettingsPanel(page);
      await waitForScene(page);
      
      let comparison = await compareScreenshots(
        page,
        `${testId}-checked.png`,
        `${testId}-checked.png`,
        `${testId} Checked`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      await openSettingsPanel(page);
      await page.click('#view-orbit-descent');
      await closeSettingsPanel(page);
      await waitForScene(page);
      
      comparison = await compareScreenshots(
        page,
        `${testId}-unchecked.png`,
        `${testId}-unchecked.png`,
        `${testId} Unchecked`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      await openSettingsPanel(page);
      await page.click('#view-orbit-descent');
      await closeSettingsPanel(page);
      await waitForScene(page);

      // Screenshot 3: Orbit Restored
      comparison = await compareScreenshots(
        page,
        `${testId}-restored.png`,
        `${testId}-checked.png`, // Compare against the original baseline
        `${testId} Restored`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Zoom back out
      await zoomOut(page, TEST_MODES.MOON.descentOrbitZoom, 'MOON');
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Landing Animation', async () => {
      const testId = 'moon-3d-landing-animation';
      await startTest(page, testId, 'Landing Animation'); // Uses #burn12
      try {
        await openSettingsPanel(page);
        await resetCameraToManual(page);
        if (!(await page.isChecked('#dimension-3D'))) {
          await page.click('#dimension-3D');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (!(await page.isChecked('#checkbox-lock-default'))) {
          await page.click('#checkbox-lock-default');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (await page.isChecked('#joyride')) {
          await page.click('#joyride');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        if (await page.isChecked('#landing')) {
          await page.click('#landing');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
        await page.click('#landing');
        await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
        await closeSettingsPanel(page);
        await waitForScene(page);
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);

        const comparison = await compareScreenshots(
          page,
          `${testId}-enabled.png`,
          `${testId}-enabled.png`,
          `${testId} Enabled`,
          TOLERANCE.APPROX_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      } finally {
        await openSettingsPanel(page);
        if (await page.isChecked('#landing')) {
          await page.click('#landing');
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        }
        await closeSettingsPanel(page);
      }
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Locations View', async () => {
      const testId = 'moon-3d-locations-view-toggle';
      await displayTestId(page, testId);
      await openSettingsPanel(page);

      // Ensure landing is disabled to avoid conflicts
      if (await page.isChecked('#landing')) {
        await page.click('#landing');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }

      if (!(await page.isChecked('#checkbox-lock-xy-minus'))) {
        await page.click('#checkbox-lock-xy-minus');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      
      // Uncheck orbits for better visibility
      if (await page.isChecked('#view-orbit')) {
        await page.click('#view-orbit');
      }
      if (await page.isChecked('#view-orbit-descent')) {
        await page.click('#view-orbit-descent');
      }
      
      // Ensure locations are enabled
      if (!(await page.isChecked('#view-craters'))) {
        await page.click('#view-craters');
      }
      
      // Disable sky background for consistent testing
      if (await page.isChecked('#view-sky')) {
        await page.click('#view-sky');
      }
      
      await closeSettingsPanel(page);
      await waitForScene(page);
      await page.click('#burn1'); // Go to Launch time
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      // Wait for button state to fully settle
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      
      const initialState = await storeInitialState(page);
      await zoomIn(page, TEST_MODES.MOON.locationsZoom, 'MOON');
      
      // Enabled screenshot
      let comparison = await compareScreenshots(
        page,
        `${testId}-enabled.png`,
        `${testId}-enabled.png`,
        `${testId} Enabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Disable locations
      await openSettingsPanel(page);
      await page.click('#view-craters');
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Disabled screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-disabled.png`,
        `${testId}-disabled.png`,
        `${testId} Disabled`,
        TOLERANCE.APPROX_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      // Re-enable locations
      await openSettingsPanel(page);
      await page.click('#view-craters');
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.EXTENDED_DELAY);
      
      // Restored screenshot
      comparison = await compareScreenshots(
        page,
        `${testId}-restored.png`,
        `${testId}-enabled.png`, // Compare to original enabled state
        `${testId} Restored`,
        TOLERANCE.BROAD_MATCH
      );
      expect(comparison.isMatch).toBe(true);
      
      await zoomOut(page, TEST_MODES.MOON.locationsZoom, 'MOON');
      await restoreStoredState(page, initialState);
      
      // Cleanup
      await openSettingsPanel(page);
      if (!(await page.isChecked('#view-orbit'))) {
        await page.click('#view-orbit');
      }
      if (!(await page.isChecked('#view-orbit-descent'))) {
        await page.click('#view-orbit-descent');
      }
      await closeSettingsPanel(page);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);
  });

  // ====================================================================
  // 2D MODE TEST SUITES (DUPLICATED FROM 3D SUITES ABOVE)
  // ====================================================================

  describe('Test Suite 4: Earth Mode 2D Tests', () => {
    beforeAll(async () => {
      // Switch to 2D mode for entire test suite
      await openSettingsPanel(page);
      await page.click('#dimension-2D');
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.STABLE_RENDER_TIMEOUT);
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    afterAll(async () => {
      // Return to 3D mode after test suite completes
      await openSettingsPanel(page);
      await page.click('#dimension-3D');
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.STABLE_RENDER_TIMEOUT);
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    it('Page Load in Earth 2D Mode', async () => {
      const testId = 'earth-2d-page-load';
      await startTest(page, testId); // Uses default suite timeline (#burn1)
      await displayStartupMessage(page, testId);
      
      // Ensure we're in Earth mode for consistent baseline comparison
      await ensureOriginMode(page, 'earth');
      

      // Verify page title
      const title = await page.title();
      expect(title).toMatch(/Chandrayaan 3/);
      
      // Verify we're in 2D mode
      expect(await page.isChecked('#dimension-2D')).toBe(true);
      
      // Take screenshot in 2D mode
      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        'earth-2d-plane-selection-default.png',
        `${testId} 2D Mode`,
        TOLERANCE.BROAD_MATCH
      );
      expect(comparison.isMatch).toBe(true);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('2D Mode Verification', async () => {
      const testId = 'earth-2d-mode-verification';
      await displayTestId(page, testId);
      
      // Verify 2D mode is active (should already be set by beforeAll)
      expect(await page.isChecked('#dimension-2D')).toBe(true);
      expect(await page.isChecked('#dimension-3D')).toBe(false);
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Timeline Navigation in 2D Mode', async () => {
      const testId = 'earth-2d-timeline-navigation';
      await displayTestId(page, testId);

      // Test a subset of timeline buttons in 2D mode (already in 2D mode)
      // Only test the first few burn buttons as later ones might not change timeline
      const timelineButtons = [
        '#burn1', '#burn2', '#burn3', '#burn4', '#burn5'
      ];

      let previousTime = await page.evaluate(() => document.getElementById('date')?.textContent);
      
      for (const buttonId of timelineButtons) {
        await page.click(buttonId);
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
        
        const currentTime = await page.evaluate(() => document.getElementById('date')?.textContent);
        // Store the time if it changed (some buttons might go to same time)
        if (currentTime !== previousTime) {
          previousTime = currentTime;
        }
      }
      
      // Verify that at least we navigated somewhere
      const finalTime = await page.evaluate(() => document.getElementById('date')?.textContent);
      const startTime = 'Fri Jul 14 2023 14:53:00';
      expect(finalTime).not.toContain(startTime);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('Animation Controls in 2D Mode', async () => {
      const testId = 'earth-2d-animation-controls';
      await displayTestId(page, testId);

      // Test play/pause in 2D mode (already in 2D mode)
      const initialTime = await page.evaluate(() => document.getElementById('date')?.textContent);
      
      // Play animation
      await page.click('#animate');
      await page.waitForTimeout(1000);
      
      const playingTime = await page.evaluate(() => document.getElementById('date')?.textContent);
      
      // Pause animation
      await page.click('#animate');
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      
      const pausedTime = await page.evaluate(() => document.getElementById('date')?.textContent);
      
      // Verify animation worked
      expect(playingTime).not.toBe(initialTime);
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    it('Plane Selection in 2D Mode', async () => {
      const testId = 'earth-2d-plane-selection';
      await startTest(page, testId); // Uses default suite timeline (#burn1)
      
      // Ensure we're in Earth mode for consistent baseline comparison
      await ensureOriginMode(page, 'earth');
      

      const planes = [
        { id: 'default', name: 'default', selector: '#checkbox-lock-default' },
        { id: 'xy', name: 'xy', selector: '#checkbox-lock-xy' },
        { id: 'yz', name: 'yz', selector: '#checkbox-lock-yz' },
        { id: 'zx', name: 'zx', selector: '#checkbox-lock-zx' },
        { id: 'xy-minus', name: 'xy-minus', selector: '#checkbox-lock-xy-minus' },
        { id: 'yz-minus', name: 'yz-minus', selector: '#checkbox-lock-yz-minus' },
        { id: 'zx-minus', name: 'zx-minus', selector: '#checkbox-lock-zx-minus' },
        { id: 'default-final', name: 'default-final', selector: '#checkbox-lock-default' }
      ];

      for (const plane of planes) {
        await openSettingsPanel(page);
        await page.click(plane.selector);
        await closeSettingsPanel(page);
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);

        const screenshotName = `${testId}-${plane.name.toLowerCase()}.png`;
        const comparison = await compareScreenshots(
          page,
          screenshotName,
          screenshotName,
          `${testId} ${plane.name} plane in 2D mode`,
          TOLERANCE.BROAD_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      }
    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    // Note: CY3 Orbit Display test removed - orbit display controls don't exist in 2D mode
  });

  describe('Test Suite 5: Moon Mode 2D Tests', () => {
    beforeAll(async () => {
      // Switch to Moon mode and 2D mode for entire test suite
      await openSettingsPanel(page);
      if (!await page.isChecked('#origin-moon')) {
        await page.click('#origin-moon');
      }
      await page.click('#dimension-2D');
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.STABLE_RENDER_TIMEOUT);
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    afterAll(async () => {
      // Return to Earth mode and 3D mode after test suite completes
      await openSettingsPanel(page);
      if (!await page.isChecked('#origin-earth')) {
        await page.click('#origin-earth');
      }
      await page.click('#dimension-3D');
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.STABLE_RENDER_TIMEOUT);
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    it('Page Load in Moon 2D Mode', async () => {
      const testId = 'moon-2d-page-load';
      await startTest(page, testId); // Uses default suite timeline (#burn1)

      // Ensure we're in Moon mode for consistent baseline comparison
      await ensureOriginMode(page, 'moon');
      await openSettingsPanel(page);
      await page.click('#checkbox-lock-default');
      await closeSettingsPanel(page);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);

      // Take screenshot in 2D mode
      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        'moon-2d-plane-selection-default.png',
        `${testId} Moon 2D Mode`,
        TOLERANCE.BROAD_MATCH
      );
      expect(comparison.isMatch).toBe(true);

    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('2D Mode Verification in Moon Mode', async () => {
      const testId = 'moon-2d-mode-verification';
      
      await displayTestId(page, testId);
      
      
      // Verify 2D mode is active
      const is2DModeChecked = await page.locator('#dimension-2D:checked').count();
      expect(is2DModeChecked).toBe(1);
      
    }, TIMEOUTS.TEST_CASE_TIMEOUT);

    it('Plane Selection in Moon 2D Mode', async () => {
      const testId = 'moon-2d-plane-selection';
      await startTest(page, testId); // Uses default suite timeline (#burn1)
      

      const planes = [
        { id: 'xy', name: 'XY', selector: '#checkbox-lock-xy' },
        { id: 'yz', name: 'YZ', selector: '#checkbox-lock-yz' },
        { id: 'default', name: 'DEFAULT', selector: '#checkbox-lock-default' }
      ];

      for (const plane of planes) {
        await openSettingsPanel(page);
        await page.click(plane.selector);
        await closeSettingsPanel(page);
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);

        const screenshotName = `${testId}-${plane.name.toLowerCase()}.png`;
        const comparison = await compareScreenshots(
          page,
          screenshotName,
          screenshotName,
          `${testId} ${plane.name} plane in Moon 2D mode`,
          TOLERANCE.BROAD_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      }

    }, TIMEOUTS.EXTENDED_TEST_TIMEOUT);

    // Note: CY3 Orbit Display test removed - orbit display controls don't exist in 2D mode

    // Note: Landing Animation test removed - landing animation controls don't exist in 2D mode
  });

  describe('Test Suite 6: Relative Mode Tests', () => {
    afterEach(async () => {
      await openSettingsPanel(page);
      await setCameraPair(page, 'manual__manual');
      await ensureFovOneDegree(page, false);
      await ensureCheckboxState(page, '#view-orbit', true);
      await ensureCheckboxState(page, '#view-orbit-descent', true);
      await closeSettingsPanel(page);
      await ensureOriginMode(page, 'earth');
      await setTimeline(page, '#burn1');
    });

    it('Page Load in Relative Mode', async () => {
      const testId = 'relative-3d-page-load';
      await startTest(page, testId);
      await prepareRelativePageLoadView(page);
      await waitForRelativePageLoadOrbitStabilized(page);

      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH
      );

      expect(comparison.isMatch).toBe(true);
      expect(await page.isChecked('#origin-relative')).toBe(true);
      expect(await page.isChecked('#dimension-3D')).toBe(true);
    });

    it('Earth to Moon FoV 1 at Vikram Landing', async () => {
      const testId = 'relative-3d-earth-to-moon-fov1-landing';
      await startTest(page, testId, 'Landing Animation');
      await prepareRelativeLandingFovView(page, 'earth__moon');

      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH
      );

      expect(comparison.isMatch).toBe(true);
    });

    it('Moon to Earth FoV 1 at Vikram Landing', async () => {
      const testId = 'relative-3d-moon-to-earth-fov1-landing';
      await startTest(page, testId, 'Landing Animation');
      await prepareRelativeLandingFovView(page, 'moon__earth');

      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH
      );

      expect(comparison.isMatch).toBe(true);
    });
  });

  describe('Test Suite 6b: Moon Relief Regression Guards', () => {
    afterEach(async () => {
      await ensureAnimationPaused(page);
      await ensureMoonRenderProfile(page, 'fast');
      await openSettingsPanel(page);
      await setCameraPair(page, 'manual__manual');
      await ensureFovOneDegree(page, false);
      await ensureCheckboxState(page, '#view-orbit', true);
      await ensureCheckboxState(page, '#view-orbit-descent', true);
      await ensureCheckboxState(page, '#view-sky', true);
      await ensureCheckboxState(page, '#view-xyz-axes', false);
      await ensureCheckboxState(page, '#view-poles', false);
      await ensureCheckboxState(page, '#view-polar-axes', false);
      await closeSettingsPanel(page);
      await ensureOriginMode(page, 'earth');
      await setTimeline(page, '#burn1');
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    it('Earth Origin Moon Relief uses Standard profile consistently', async () => {
      const testId = 'earth-3d-moon-relief-standard';
      await startTest(page, testId);
      await prepareMoonReliefRegressionView(page, { origin: 'earth', profile: 'fast' });

      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH,
      );

      expect(comparison.isMatch).toBe(true);
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    it('Earth Origin Moon Relief uses Detailed profile consistently', async () => {
      const testId = 'earth-3d-moon-relief-detailed';
      await startTest(page, testId);
      await prepareMoonReliefRegressionView(page, { origin: 'earth', profile: 'quality' });

      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH,
      );

      expect(comparison.isMatch).toBe(true);
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    it('Moon Origin Moon Relief uses Detailed profile consistently', async () => {
      const testId = 'moon-3d-moon-relief-detailed';
      await startTest(page, testId);
      await prepareMoonReliefRegressionView(page, { origin: 'moon', profile: 'quality' });

      const comparison = await compareScreenshots(
        page,
        `${testId}.png`,
        `${testId}.png`,
        testId,
        TOLERANCE.APPROX_MATCH,
      );

      expect(comparison.isMatch).toBe(true);
    }, TIMEOUTS.CLEANUP_TIMEOUT);
  });

  // Helper functions for Test Suite 7
  async function waitForAnimationCompletion(page, timeoutMs = 180000) {
    await page.waitForFunction(() => {
      const slider = document.getElementById('timeline-slider');
      const current = Number(slider?.dataset.currentTimeMs);
      const end = Number(slider?.dataset.rangeMaxMs);
      const playing = document.querySelector('.controls-cluster--transport')?.classList.contains('is-playing');
      return playing === false && Number.isFinite(current) && Number.isFinite(end) && end > 0 && current >= end - 1000;
    }, null, { timeout: timeoutMs, polling: 200 });
  }

  async function selectPlaneForFullRun(page, planeName) {
    console.log(`Selecting plane: ${planeName}`);
    await openSettingsPanel(page);
    
    const planeSelectors = {
      'earth-3d': '#checkbox-lock-default',
      'moon-3d': '#checkbox-lock-yz-minus', 
      'earth-2d': '#checkbox-lock-xy',
      'moon-2d': '#checkbox-lock-xy'
    };
    
    const selector = planeSelectors[planeName];
    if (selector) {
      await page.click(selector);
      await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
    }
    
    await closeSettingsPanel(page);
  }

  async function getCameraDistance(page) {
    return await page.evaluate(() => {
      try {
        const isLunarMode = document.querySelector('#origin-moon')?.checked;
        const scene = isLunarMode ? window.animationScenes?.lunar : window.animationScenes?.geo;
        const camera = scene?.camera;
        const controls = scene?.cameraControls;
        
        if (!camera || !controls) {
          return null;
        }
        
        return camera.position.distanceTo(controls.target);
      } catch (e) {
        console.error('Error getting camera distance:', e);
        return null;
      }
    });
  }

  async function zoomToDistance(page, targetDistance) {
    console.log(`Zooming to distance: ${targetDistance}`);
    return await page.evaluate((distance) => {
      try {
        const isLunarMode = document.querySelector('#origin-moon')?.checked;
        const scene = isLunarMode ? window.animationScenes?.lunar : window.animationScenes?.geo;
        const camera = scene?.camera;
        const controls = scene?.cameraControls;
        
        if (!camera || !controls) {
          console.log('Camera or controls not found');
          return false;
        }
        
        const target = controls.target;
        const currentDistance = camera.position.distanceTo(target);
        const ratio = distance / currentDistance;
        
        camera.position.lerpVectors(target, camera.position, ratio);
        controls.update();
        
        return true;
      } catch (e) {
        console.error('Error setting zoom distance:', e);
        return false;
      }
    }, targetDistance);
  }

  describe('Test Suite 7: Full Run Tests', () => {
    beforeAll(async () => {
      // Ensure we start with Earth mode and 3D
      await openSettingsPanel(page);
      if (!await page.isChecked('#origin-earth')) {
        await page.click('#origin-earth');
      }
      if (!await page.isChecked('#dimension-3D')) {
        await page.click('#dimension-3D');
      }
      await closeSettingsPanel(page);
      await waitForScene(page);
    }, TIMEOUTS.CLEANUP_TIMEOUT);

    it('Earth 3D Full Run Test', async () => {
      const testId = 'earth-3d-full-run';
      await startTest(page, testId); // Uses default suite timeline (#burn1)
      try {
        // Configure for Earth 3D mode
        await openSettingsPanel(page);
        if (!await page.isChecked('#origin-earth')) {
          await page.click('#origin-earth');
        }
        await page.click('#dimension-3D');
        await closeSettingsPanel(page);
        await selectPlaneForFullRun(page, 'earth-3d');
        await waitForScene(page);
        
        // Set optimal zoom level
        await zoomToDistance(page, 500);
        
        // Start animation and ramp to max speed for deterministic full-run completion
        await page.click('#animate');
        await normalizeSpeedToRealtime(page);
        await accelerateSpeedToMax(page);
        console.log('Starting Earth 3D full run animation...');
        
        // Wait for animation to complete naturally or timeout
        try {
          await waitForAnimationCompletion(page, 180000);
          console.log('Earth 3D animation completed successfully');
        } catch (error) {
          console.log('Earth 3D animation timed out, forcing stop');
          
          // Force stop animation
          const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
          if (isPlaying > 0) {
            await page.click('#animate');
          }
          
          throw new Error('Animation did not complete within timeout period');
        }

        // Ensure animation is stopped
        const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
        if (isPlaying > 0) {
          await page.click('#animate');
        }
        
        // Reset speed back to realtime for downstream tests
        await normalizeSpeedToRealtime(page);
        
        // Take final screenshot
        const comparison = await compareScreenshots(
          page,
          `${testId}-completed.png`,
          `${testId}-completed.png`,
          `${testId} Completed`,
          TOLERANCE.BROAD_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      } finally {
        // Reset timeline to Launch for next test
        await closeSettingsPanel(page);
        await page.click('#burn1');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      
    }, TIMEOUTS.CLEANUP_TIMEOUT * 2);

    it('Moon 3D Full Run Test', async () => {
      const testId = 'moon-3d-full-run';
      await startTest(page, testId); // Initialize test properly
      try {
        // Configure for Moon 3D mode
        await openSettingsPanel(page);
        if (!await page.isChecked('#origin-moon')) {
          await page.click('#origin-moon');
        }
        await page.click('#dimension-3D');
        
        // Ensure stellar sky is disabled for consistent baseline comparison
        const stellarSkyCheckbox = await page.$('#view-sky');
        if (stellarSkyCheckbox && await stellarSkyCheckbox.isChecked()) {
          await stellarSkyCheckbox.click();
          await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY); // Wait for stellar sky to be processed
        }
        
        await closeSettingsPanel(page);
        await waitForScene(page);
        
        await selectPlaneForFullRun(page, 'moon-3d');
        await waitForScene(page);
        
        // Set optimal zoom level
        await zoomToDistance(page, 500);
        
        // Start animation and ramp to max speed for deterministic full-run completion
        await page.click('#animate');
        await normalizeSpeedToRealtime(page);
        await accelerateSpeedToMax(page);
        console.log('Starting Moon 3D full run animation...');
        
        // Wait for animation to complete naturally or timeout
        try {
          await waitForAnimationCompletion(page, 180000);
          console.log('Moon 3D animation completed successfully');
        } catch (error) {
          console.log('Moon 3D animation timed out, forcing stop');
          
          // Force stop animation
          const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
          if (isPlaying > 0) {
            await page.click('#animate');
          }
          
          throw new Error('Animation did not complete within timeout period');
        }
        
        // Ensure animation is stopped
        const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
        if (isPlaying > 0) {
          await page.click('#animate');
        }
        
        // Reset speed back to realtime for downstream tests
        await normalizeSpeedToRealtime(page);

        // Take final screenshot
        const comparison = await compareScreenshots(
          page,
          `${testId}-completed.png`,
          `${testId}-completed.png`,
          `${testId} Completed`,
          TOLERANCE.BROAD_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      } finally {
        // Reset timeline to Launch for next test
        await closeSettingsPanel(page);
        await page.evaluate(() => {
          document.getElementById('burn1')?.click();
        });
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      
    }, TIMEOUTS.CLEANUP_TIMEOUT * 2);

    it('Earth 2D Full Run Test', async () => {
      const testId = 'earth-2d-full-run';
      await startTest(page, testId); // Initialize test properly
      try {
        // Configure for Earth 2D mode
        await openSettingsPanel(page);
        if (!await page.isChecked('#origin-earth')) {
          await page.click('#origin-earth');
        }
        await page.click('#dimension-2D');
        await closeSettingsPanel(page);
        await waitForScene(page);
        
        await selectPlaneForFullRun(page, 'earth-2d');
        await waitForScene(page);
        
        
        // Start animation and ramp to max speed for deterministic full-run completion
        await page.click('#animate');
        await normalizeSpeedToRealtime(page);
        await accelerateSpeedToMax(page);
        console.log('Starting Earth 2D full run animation...');
        
        // Wait for animation to complete naturally or timeout
        try {
          await waitForAnimationCompletion(page, 180000);
          console.log('Earth 2D animation completed successfully');
        } catch (error) {
          console.log('Earth 2D animation timed out, forcing stop');
          
          // Force stop animation
          const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
          if (isPlaying > 0) {
            await page.click('#animate');
          }
          
          throw new Error('Animation did not complete within timeout period');
        }
        
        // Ensure animation is stopped
        const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
        if (isPlaying > 0) {
          await page.click('#animate');
        }
        
        // Reset speed back to realtime for downstream tests
        await normalizeSpeedToRealtime(page);
        
        // Take final screenshot
        const comparison = await compareScreenshots(
          page,
          `${testId}-completed.png`,
          `${testId}-completed.png`,
          `${testId} Completed`,
          TOLERANCE.BROAD_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      } finally {
        // Reset timeline to Launch for next test
        await page.click('#burn1');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }
      
    }, TIMEOUTS.CLEANUP_TIMEOUT * 2);

    it('Moon 2D Full Run Test', async () => {
      const testId = 'moon-2d-full-run';
      await startTest(page, testId); // Initialize test properly
      try {
        // Configure for Moon 2D mode
        await openSettingsPanel(page);
        if (!await page.isChecked('#origin-moon')) {
          await page.click('#origin-moon');
        }
        await page.click('#dimension-2D');
        await closeSettingsPanel(page);
        await waitForScene(page);
        
        await selectPlaneForFullRun(page, 'moon-2d');
        await waitForScene(page);
        
        
        // Start animation and ramp to max speed for deterministic full-run completion
        await page.click('#animate');
        await normalizeSpeedToRealtime(page);
        await accelerateSpeedToMax(page);
        console.log('Starting Moon 2D full run animation...');
        
        // Wait for animation to complete naturally or timeout
        try {
          await waitForAnimationCompletion(page, 180000);
          console.log('Moon 2D animation completed successfully');
        } catch (error) {
          console.log('Moon 2D animation timed out, forcing stop');
          
          // Force stop animation
          const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
          if (isPlaying > 0) {
            await page.click('#animate');
          }
          
          throw new Error('Animation did not complete within timeout period');
        }
        
        // Ensure animation is stopped
        const isPlaying = await page.locator('.controls-cluster--transport.is-playing #animate').count();
        if (isPlaying > 0) {
          await page.click('#animate');
        }
        
        // Reset speed back to realtime for downstream tests
        await normalizeSpeedToRealtime(page);
        
        // Take final screenshot
        const comparison = await compareScreenshots(
          page,
          `${testId}-completed.png`,
          `${testId}-completed.png`,
          `${testId} Completed`,
          TOLERANCE.BROAD_MATCH
        );
        expect(comparison.isMatch).toBe(true);
      } finally {
        // Reset timeline to Launch for next test
        await page.click('#burn1');
        await page.waitForTimeout(TIMEOUTS.STANDARD_DELAY);
      }

    }, TIMEOUTS.CLEANUP_TIMEOUT * 2);
  });


});

