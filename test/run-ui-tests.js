#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getEffectiveTestBaseUrl, getEffectiveTestPort } from './local-test-config.js';
import { normalizeToolingPath } from './tooling-path-utils.js';

const MODE = process.argv[2] || 'test';
const WORKSPACE_ROOT = normalizeToolingPath(process.cwd());
if (WORKSPACE_ROOT !== process.cwd()) {
  process.chdir(WORKSPACE_ROOT);
}
const DEFAULT_DATA_ROOT = path.resolve(WORKSPACE_ROOT, '..', 'moon-mission-data');
const TEST_PORT = getEffectiveTestPort(WORKSPACE_ROOT);
const TEST_URL = getEffectiveTestBaseUrl(WORKSPACE_ROOT);

const REQUIRED_RUNTIME_TEXTURES = [
  'images/earth/2_no_clouds_8k.jpg',
  'images/earth/earthspec1k.jpg',
  'images/moon/Solarsystemscope_texture_8k_moon.jpg',
  'images/moon/ldem_16_gsfc.png',
  'images/sky/starmap_2020_4k_stars.jpg',
  'images/sky/constellation_figures_2020_4k.jpg',
];

function runNode(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function findMissingRuntimeTextures(rootDir) {
  return REQUIRED_RUNTIME_TEXTURES.filter((relPath) => {
    const abs = path.resolve(rootDir, relPath);
    return !fs.existsSync(abs);
  });
}

async function ensureRuntimeAssets() {
  const missing = findMissingRuntimeTextures(WORKSPACE_ROOT);
  if (missing.length === 0) {
    return;
  }

  const dataRoot = path.resolve(
    WORKSPACE_ROOT,
    process.env.MISSION_DATA_ROOT || DEFAULT_DATA_ROOT,
  );

  if (!fs.existsSync(dataRoot)) {
    console.error('Missing runtime textures and mission data repo was not found.');
    console.error(`Expected data repo at: ${dataRoot}`);
    console.error('Set MISSION_DATA_ROOT or run:');
    console.error(
      'python scripts/stage-ephemeris-data.py --app-root . --data-root <path-to-moon-mission-data> --target-root .',
    );
    process.exit(1);
  }

  console.log(`Missing ${missing.length} runtime texture(s); staging runtime assets from ${dataRoot}`);
  const stageCode = await runCommand(
    'python',
    [
      'scripts/stage-ephemeris-data.py',
      '--app-root',
      '.',
      '--data-root',
      dataRoot,
      '--target-root',
      '.',
    ],
  );

  if (stageCode !== 0) {
    process.exit(stageCode);
  }

  const missingAfterStage = findMissingRuntimeTextures(WORKSPACE_ROOT);
  if (missingAfterStage.length > 0) {
    console.error('Runtime staging completed but required textures are still missing:');
    missingAfterStage.forEach((relPath) => console.error(`  - ${relPath}`));
    process.exit(1);
  }
}

function getVitestArgs(mode) {
  const args = ['node_modules/vitest/vitest.mjs', 'test/ui.test.js', '--run'];
  if (mode === 'test-fast') {
    args.push('--bail=1');
  }
  return args;
}

function buildVitestEnv(mode) {
  const env = {
    ...process.env,
    HEADLESS: mode === 'test-headed' ? 'false' : 'true',
    VITE_TEST_BASE_URL: TEST_URL,
    UPDATE_SSIM_BASELINES: mode === 'baseline' ? 'true' : 'false',
  };

  return env;
}

async function main() {
  if (!['test', 'test-fast', 'test-headed', 'baseline'].includes(MODE)) {
    console.error(`Unknown mode: ${MODE}`);
    console.error('Usage: node test/run-ui-tests.js [test|test-fast|test-headed|baseline]');
    process.exit(1);
  }

  await ensureRuntimeAssets();

  const serverEnv = {
    ...process.env,
    TEST_SERVER_REUSE: 'false',
    TEST_SERVER_PORT: String(TEST_PORT),
    VITE_TEST_BASE_URL: TEST_URL,
  };

  const cleanupCode = await runNode(['test/server-manager.js', 'cleanup-port'], serverEnv);
  if (cleanupCode !== 0) {
    process.exit(cleanupCode);
  }

  const startCode = await runNode(['test/server-manager.js', 'start'], serverEnv);
  if (startCode !== 0) {
    process.exit(startCode);
  }

  let testCode = 1;
  try {
    testCode = await runNode(getVitestArgs(MODE), buildVitestEnv(MODE));
  } finally {
    await runNode(['test/server-manager.js', 'stop'], serverEnv);
  }

  process.exit(testCode);
}

main().catch((error) => {
  console.error(`run-ui-tests failed: ${error?.message || error}`);
  process.exit(1);
});
