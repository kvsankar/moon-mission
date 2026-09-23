import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEffectiveTestBaseUrl } from './local-test-config.js';

const isCI = process.env.CI === 'true';
const CI_MULTIPLIER = isCI ? 3 : 1;

const TIMEOUTS = {
  PAGE_LOAD: 30000 * CI_MULTIPLIER,
  LANDING_READY: 30000 * CI_MULTIPLIER,
  MISSION_READY: 60000 * CI_MULTIPLIER,
  TEST_CASE: 90000 * CI_MULTIPLIER,
};

const TEST_CONFIG = {
  baseUrl: getEffectiveTestBaseUrl(process.cwd()),
  headless: process.env.HEADLESS !== 'false',
  slowMo: parseInt(process.env.SLOWMO || '0', 10),
};

const IGNORED_ERROR_PATTERNS = [
  /favicon\.ico/i,
  /Failed to load resource.*favicon/i,
];

function isIgnoredError(message) {
  return IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

let browser;

describe('Landing Compare Smoke Tests', () => {
  beforeAll(async () => {
    const baseArgs = [
      '--no-sandbox',
      '--max-old-space-size=4096',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ];

    const headlessArgs = [
      '--disable-gpu-sandbox',
      '--use-angle=gl',
      '--enable-unsafe-swiftshader',
    ];

    const headedArgs = [
      '--enable-gpu-rasterization',
      '--enable-zero-copy',
    ];

    browser = await chromium.launch({
      headless: TEST_CONFIG.headless,
      slowMo: TEST_CONFIG.slowMo,
      args: TEST_CONFIG.headless
        ? [...baseArgs, ...headlessArgs]
        : [...baseArgs, ...headedArgs],
    });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('launches landing compare into relative mode with the selected mission pair', async () => {
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];

    try {
      page.on('console', (msg) => {
        const text = msg.text();
        const type = msg.type();
        const locationUrl = msg.location()?.url || '';
        const isOptionalVersionCheck404 =
          type === 'error' &&
          /\/deployment\/version\.json(?:\?|$)/i.test(locationUrl);
        const isOptionalOrbitStyleMetadata404 =
          type === 'error' &&
          /\/(?:[^/]+-)?style\.json$/i.test(locationUrl);
        if (type === 'error' && !isIgnoredError(text) && !isOptionalVersionCheck404 && !isOptionalOrbitStyleMetadata404) {
          consoleErrors.push({ type, text });
        }
      });

      page.on('pageerror', (error) => {
        const message = error.message;
        if (!isIgnoredError(message)) {
          pageErrors.push(message);
        }
      });

      await page.goto(`${TEST_CONFIG.baseUrl}/index.html?testMode=true`, {
        timeout: TIMEOUTS.PAGE_LOAD,
      });

      await page.waitForSelector('[data-landing-compare-toggle="chandrayaan3"]', {
        timeout: TIMEOUTS.LANDING_READY,
      });

      const initialLandingSnapshot = await page.evaluate(() => {
        const tray = document.getElementById('landing-compare-tray');
        return {
          trayHidden: !!tray?.hidden,
          trayDisplay: tray ? window.getComputedStyle(tray).display : '',
        };
      });

      expect(initialLandingSnapshot.trayHidden).toBe(true);
      expect(initialLandingSnapshot.trayDisplay).toBe('none');

      await page.click('[data-landing-compare-toggle="chandrayaan3"]');

      await page.waitForFunction(() => {
        const tray = document.getElementById('landing-compare-tray');
        return tray?.hidden === false;
      }, { timeout: TIMEOUTS.LANDING_READY });

      await page.click('[data-landing-compare-toggle="artemis1"]');

      await page.waitForFunction(() => {
        return document.querySelectorAll('#landing-compare-selection .landing-compare-chip').length === 2;
      }, { timeout: TIMEOUTS.LANDING_READY });

      const landingSnapshot = await page.evaluate(() => {
        return {
          compareOpenDisabled: !!document.getElementById('landing-compare-open')?.disabled,
          selectionTitles: Array.from(document.querySelectorAll('#landing-compare-selection .landing-compare-chip__title'))
            .map((node) => node.textContent?.trim() || ''),
          summary: document.getElementById('landing-compare-summary')?.textContent || '',
        };
      });

      expect(landingSnapshot.compareOpenDisabled).toBe(false);
      expect(landingSnapshot.selectionTitles).toEqual(['Chandrayaan 3', 'Artemis 1']);
      expect(landingSnapshot.summary).toMatch(/relative mode/i);

      await page.click('#landing-compare-open');

      await page.waitForURL((url) => {
        return (
          url.pathname.endsWith('/chandrayaan3/') &&
          url.searchParams.get('mode') === 'compare' &&
          url.searchParams.get('compareMission') === 'artemis1' &&
          url.searchParams.get('origin') === 'relative' &&
          url.searchParams.get('testMode') === 'true'
        );
      }, { timeout: TIMEOUTS.MISSION_READY });

      await page.waitForFunction(() =>
        document.getElementById('mission-loading-overlay')?.dataset.blocking === 'false' &&
        document.getElementById('compare-mode-toggle')?.checked === true,
      null, { timeout: TIMEOUTS.MISSION_READY });

      const missionSnapshot = await page.evaluate(() => {
        return {
          compareMissionValue: document.getElementById('compare-mission-select')?.value || '',
          compareToggleChecked: !!document.getElementById('compare-mode-toggle')?.checked,
          originRelativeChecked: !!document.getElementById('origin-relative')?.checked,
        };
      });

      expect(missionSnapshot.originRelativeChecked).toBe(true);
      expect(missionSnapshot.compareToggleChecked).toBe(true);
      expect(missionSnapshot.compareMissionValue).toBe('artemis1');

      expect(consoleErrors, JSON.stringify(consoleErrors)).toHaveLength(0);
      expect(pageErrors, JSON.stringify(pageErrors)).toHaveLength(0);
    } finally {
      await page.close();
    }
  }, TIMEOUTS.TEST_CASE);

  it('keeps table, timeline, mission brief and orbit preview available', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    try {
      await page.goto(`${TEST_CONFIG.baseUrl}/index.html?testMode=true`, {
        waitUntil: 'domcontentloaded', timeout: TIMEOUTS.PAGE_LOAD,
      });
      await page.waitForSelector('[data-landing-compare-toggle="chandrayaan3"]', {
        timeout: TIMEOUTS.LANDING_READY,
      });

      await page.locator('.landing-view-button[data-view="table"]').click();
      expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
      await page.locator('.landing-view-button[data-view="timeline"]').click();
      expect(await page.locator('.landing-timeline-chip').count()).toBeGreaterThan(0);
      await page.locator('.landing-view-button[data-view="default"]').click();

      const card = page.locator('.landing-card').filter({
        has: page.locator('[data-landing-compare-toggle="chandrayaan3"]'),
      });
      await card.getByRole('button', { name: 'Brief' }).click();
      await page.waitForFunction(() => {
        const picker = document.getElementById('landing-brief-orbit-mode-picker');
        return picker?.children.length > 0 && !!document.querySelector('#landing-brief-orbit-anim svg');
      }, null, { timeout: TIMEOUTS.LANDING_READY });
      expect(await page.locator('#landing-brief-panel').getAttribute('aria-hidden')).toBe('false');
      expect(await page.locator('#landing-brief-panel').textContent()).toMatch(/HORIZONS Data/);
      expect(pageErrors, JSON.stringify(pageErrors)).toHaveLength(0);
    } finally {
      await page.close();
    }
  }, TIMEOUTS.TEST_CASE);
});
