import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TIMEOUTS, TOLERANCE, TEST_CONFIG, LOCAL_ASTRONOMY_BROWSER_FILE, SSIM_VIEWPORT } from "./support/cy3-visual-config.js";
import { displayTestId, writeSsimLatest, getSsimScores, isIgnoredError, compareScreenshots } from "./support/cy3-visual-screenshots.js";
import { openSettingsPanel, closeSettingsPanel, setCameraPair, normalizeSpeedToRealtime, accelerateSpeedToMax, resetCameraToManual, waitForRelativePageLoadOrbitStabilized, waitForScene, ensureHeaderPillStripCollapsed } from "./support/cy3-visual-controls.js";
import { setTimeline, SUITE_TIMELINE, startTest, ensureOriginMode, ensureFovOneDegree, ensureAnimationPaused, ensureCheckboxState, enforceSsimProfileViewDefaults, ensureOrbitFamilyState, pinSsimDefaultViewToggles, enforceSsimUiChromeDefaults, prepareRelativePageLoadView } from "./support/cy3-visual-profile.js";

let browser, page;
let consoleErrors = [];
let pageErrors = [];

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
    if (Object.keys(getSsimScores()).length > 0) {
      writeSsimLatest(getSsimScores());
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








  });

  // ====================================================================
  // 2D MODE TEST SUITES (DUPLICATED FROM 3D SUITES ABOVE)
  // ====================================================================



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
