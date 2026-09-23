import { fovDegreesToZoomSliderValue } from "../../src/platform/js/app/fov-slider-scale.js";
import { TIMEOUTS, SSIM_PROFILE_VIEW_DEFAULTS, SSIM_PROFILE_ORIGIN_DEFAULTS } from "./cy3-visual-config.js";
import { displayTestId } from "./cy3-visual-screenshots.js";
import { openSettingsPanel, closeSettingsPanel, ensureSettingsPanelClosed, setCameraPair, waitForScene } from "./cy3-visual-controls.js";

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
export {
  setTimeline,
  SUITE_TIMELINE,
  startTest,
  ensureOriginMode,
  ensureFovOneDegree,
  ensureAnimationPaused,
  ensureCheckboxState,
  enforceSsimProfileViewDefaults,
  ensureOrbitFamilyState,
  pinSsimDefaultViewToggles,
  enforceSsimUiChromeDefaults,
  prepareRelativePageLoadView,
};
