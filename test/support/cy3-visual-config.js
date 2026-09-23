import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getEffectiveTestBaseUrl } from "../local-test-config.js";
import { CY3_SSIM_DISPOSITION } from "./cy3-ssim-disposition.js";

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
export {
  TIMEOUTS,
  TOLERANCE,
  TEST_CONFIG,
  LOCAL_ASTRONOMY_BROWSER_FILE,
  SSIM_PROFILE_VIEW_DEFAULTS,
  SSIM_PROFILE_ORIGIN_DEFAULTS,
  UPDATE_SSIM_BASELINES,
  SSIM_VIEWPORT,
  RETAINED_SSIM_BASELINES,
};
