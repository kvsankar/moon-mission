import { TIMEOUTS } from "./cy3-visual-config.js";

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


// New zoom functions that directly manipulate camera position


// Test mode configurations
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
export {
  openSettingsPanel,
  closeSettingsPanel,
  ensureSettingsPanelClosed,
  setCameraPair,
  normalizeSpeedToRealtime,
  accelerateSpeedToMax,
  resetCameraToManual,
  waitForRelativePageLoadOrbitStabilized,
  waitForScene,
  ensureHeaderPillStripCollapsed,
};
