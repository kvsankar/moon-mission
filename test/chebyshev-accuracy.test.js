/**
 * Acceptance Tests for Chebyshev Polynomial Ephemeris Compression
 *
 * These tests validate that Chebyshev-compressed ephemeris data accurately
 * represents the original NPZ orbit data within specified tolerances.
 *
 * Test Philosophy: These tests are written FIRST (TDD) before the compression
 * implementation exists. They define the acceptance criteria that the
 * compression algorithm must meet.
 *
 * Format Specification: docs/specs/data/chebyshev-ephemeris-format.md
 */

import { existsSync, readFileSync } from 'fs';
import { basename, isAbsolute, join } from 'path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  resolveManifestGeneratedArtifact,
  resolveManifestRuntimeArtifact
} from '../src/platform/js/core/domain/ephemeris-manifest.js';
import {
  evaluateChebyshev,
  getPositionFromChebyshev
} from '../src/platform/js/core/domain/ephemeris-core.js';

// ============================================================================
// Constants
// ============================================================================

const TEST_MISSION = process.env.CHEB_TEST_MISSION || 'chandrayaan3';
const DATA_DIR = join(process.cwd(), 'assets', TEST_MISSION, 'data');
const MANIFEST_PATH = join(DATA_DIR, 'ephemeris-manifest.json');

// Test configuration
const TEST_INTERVAL_SECONDS = 30;  // Sample every 30 seconds
const JD_PER_SECOND = 1 / 86400;   // Julian date increment per second

// Accuracy thresholds (in kilometers)
const TOLERANCE = {
  ORBITAL: 5,     // 5 km for geo and lunar phases (tight for perigee accuracy)
  LANDING: 2      // 2 km for landing phase (highest precision)
};

function toAbsoluteProjectPath(pathValue) {
  if (typeof pathValue !== 'string' || pathValue.trim().length === 0) return null;
  const normalized = pathValue.replace(/\\/g, '/').trim();
  if (/^(https?:)?\/\//.test(normalized)) return null;
  if (isAbsolute(normalized)) return normalized;
  return join(process.cwd(), normalized);
}

function toAbsoluteMissionDataPath(pathValue) {
  if (typeof pathValue !== 'string' || pathValue.trim().length === 0) return null;
  const normalized = pathValue.replace(/\\/g, '/').trim().replace(/^\.?\//, '');
  return join(DATA_DIR, normalized);
}

function loadDataFilesFromManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;

  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    const phases = manifest?.phases;
    if (!phases || typeof phases !== 'object') return null;

    const files = Object.entries(phases)
      .map(([phaseName, phaseDef]) => {
        const npzGenerated = resolveManifestGeneratedArtifact(manifest, phaseName, 'npz');
        const npzRuntime = resolveManifestRuntimeArtifact(manifest, phaseName, 'npz');
        const chebGenerated = resolveManifestGeneratedArtifact(manifest, phaseName, 'chebyshev');
        const chebRuntime = resolveManifestRuntimeArtifact(manifest, phaseName, 'chebyshev');

        const npzPath = toAbsoluteProjectPath(npzGenerated) || toAbsoluteMissionDataPath(npzRuntime);
        const chebPath = toAbsoluteProjectPath(chebGenerated) || toAbsoluteMissionDataPath(chebRuntime);
        if (!npzPath || !chebPath) return null;

        const fallbackTolerance = phaseName.startsWith('landing')
          ? TOLERANCE.LANDING
          : TOLERANCE.ORBITAL;
        const toleranceFromManifest = Number(phaseDef?.tolerance_km);
        const tolerance = Number.isFinite(toleranceFromManifest)
          ? toleranceFromManifest
          : fallbackTolerance;

        const expectedSource = basename((npzRuntime || npzGenerated || npzPath).replace(/\\/g, '/'));

        return {
          name: phaseName,
          npzPath,
          chebPath,
          npzLabel: basename(npzPath),
          chebLabel: basename(chebPath),
          expectedSource,
          tolerance
        };
      })
      .filter(Boolean);

    return files.length > 0 ? files : null;
  } catch (error) {
    console.warn(`Could not parse ephemeris manifest at ${MANIFEST_PATH}: ${error.message}`);
    return null;
  }
}

// Data files to test (manifest-driven with fallback to legacy CY3 conventions)
const DATA_FILES = loadDataFilesFromManifest() || [
  {
    name: 'geo',
    npzPath: join(DATA_DIR, 'geo-CY3.npz'),
    chebPath: join(DATA_DIR, 'geo-CY3-cheb.json'),
    npzLabel: 'geo-CY3.npz',
    chebLabel: 'geo-CY3-cheb.json',
    expectedSource: 'geo-CY3.npz',
    tolerance: TOLERANCE.ORBITAL
  },
  {
    name: 'lunar',
    npzPath: join(DATA_DIR, 'lunar-CY3.npz'),
    chebPath: join(DATA_DIR, 'lunar-CY3-cheb.json'),
    npzLabel: 'lunar-CY3.npz',
    chebLabel: 'lunar-CY3-cheb.json',
    expectedSource: 'lunar-CY3.npz',
    tolerance: TOLERANCE.ORBITAL
  },
  {
    name: 'landing-geo',
    npzPath: join(DATA_DIR, 'landing-CY3-geo.npz'),
    chebPath: join(DATA_DIR, 'landing-CY3-geo-cheb.json'),
    npzLabel: 'landing-CY3-geo.npz',
    chebLabel: 'landing-CY3-geo-cheb.json',
    expectedSource: 'landing-CY3-geo.npz',
    tolerance: TOLERANCE.LANDING
  },
  {
    name: 'landing-lunar',
    npzPath: join(DATA_DIR, 'landing-CY3-lunar.npz'),
    chebPath: join(DATA_DIR, 'landing-CY3-lunar-cheb.json'),
    npzLabel: 'landing-CY3-lunar.npz',
    chebLabel: 'landing-CY3-lunar-cheb.json',
    expectedSource: 'landing-CY3-lunar.npz',
    tolerance: TOLERANCE.LANDING
  }
];

const AVAILABLE_DATA_FILES = DATA_FILES.filter((dataFile) =>
  existsSync(dataFile.npzPath)
);
const HAS_NPZ_DATA = AVAILABLE_DATA_FILES.length > 0;
const RELATIVE_CHEB_PATH = join(DATA_DIR, 'relative-CH3L-cheb.json');
const RELATIVE_GENERATOR_PATH = join(process.cwd(), 'scripts', 'generate-relative-orbits.py');

describe('Chebyshev metadata variants', () => {
  it('accepts the current ordinary inertial metadata contract', () => {
    const ordinaryPath = DATA_FILES.find((entry) => existsSync(entry.chebPath))?.chebPath;
    expect(ordinaryPath).toBeTruthy();
    const data = JSON.parse(readFileSync(ordinaryPath, 'utf-8'));

    expect(data.metadata.coordinate_frame).toBe('J2000');
    expect(data.metadata.units.time).toMatch(/^julian_date(_tdb)?$/);
    expect(data.metadata.units.position).toBe('km');
  });

  it('accepts the derived Earth-Moon relative metadata contract', () => {
    if (existsSync(RELATIVE_CHEB_PATH)) {
      const data = JSON.parse(readFileSync(RELATIVE_CHEB_PATH, 'utf-8'));

      expect(data.metadata.coordinate_frame).toBe('relative-earth-moon');
      expect(data.metadata.units.time).toMatch(/^julian_date(_tdb)?$/);
      expect(data.metadata.mode).toBe('relative');
      expect(data.metadata.units.position).toBe('km');
      return;
    }

    const generatorSource = readFileSync(RELATIVE_GENERATOR_PATH, 'utf-8');
    expect(generatorSource).toContain('"coordinate_frame": "relative-earth-moon"');
    expect(generatorSource).toContain('"units": {"time": "julian_date", "position": "km"}');
    expect(generatorSource).toContain('"mode": "relative"');
  });
});

// ============================================================================
// NPZ File Parsing (adapted from npyreader.js for Node.js)
// ============================================================================

/**
 * Preprocess NPY header text from Python format to JSON format
 */
function preprocessNpyHeader(headerText) {
  let jsonText = headerText.replace(/'/g, '"');
  jsonText = jsonText.replace(/\bNone\b/g, 'null');
  jsonText = jsonText.replace(/\bTrue\b/g, 'true');
  jsonText = jsonText.replace(/\bFalse\b/g, 'false');
  jsonText = jsonText.replace(/\(([^()]+)\)/g, function(match, contents) {
    const items = contents.split(',').map(item => item.trim());
    return `[${items.join(', ')}]`;
  });
  jsonText = jsonText.replace(/,(\s*[\}\]])/g, '$1');
  return jsonText;
}

/**
 * Parse a single NPY buffer into typed array data
 */
function parseNpy(buffer) {
  const view = new DataView(buffer);

  // Verify magic string
  const magic = String.fromCharCode(...new Uint8Array(buffer.slice(0, 6)));
  if (magic !== '\x93NUMPY') {
    throw new Error('Invalid NPY file: magic string mismatch');
  }

  // Version check
  const majorVersion = view.getUint8(6);
  if (majorVersion !== 1 && majorVersion !== 2) {
    throw new Error(`Unsupported NPY version: ${majorVersion}`);
  }

  // Parse header
  const headerLen = view.getUint16(8, true);
  const headerText = String.fromCharCode(...new Uint8Array(buffer.slice(10, 10 + headerLen)));
  const header = JSON.parse(preprocessNpyHeader(headerText));

  const dtype = header.descr;
  const shape = header.shape;
  const totalElements = shape.reduce((a, b) => a * b, 1);
  const dataOffset = 10 + headerLen;
  const dataBuffer = buffer.slice(dataOffset);

  // Parse data based on dtype
  let data;
  if (dtype === '<f8') {
    data = Array.from(new Float64Array(dataBuffer));
  } else if (dtype === '<i4') {
    data = Array.from(new Int32Array(dataBuffer));
  } else if (dtype === '<i8') {
    data = Array.from(new BigInt64Array(dataBuffer)).map(Number);
  } else {
    throw new Error(`Unsupported dtype: ${dtype}`);
  }

  return { dtype, shape, data };
}

/**
 * Parse a structured numpy array with named fields
 */
function parseStructuredNpy(buffer) {
  const view = new DataView(buffer);

  // Verify magic string
  const magic = String.fromCharCode(...new Uint8Array(buffer.slice(0, 6)));
  if (magic !== '\x93NUMPY') {
    throw new Error('Invalid NPY file: magic string mismatch');
  }

  // Version check
  const majorVersion = view.getUint8(6);
  if (majorVersion !== 1 && majorVersion !== 2) {
    throw new Error(`Unsupported NPY version: ${majorVersion}`);
  }

  // Parse header
  const headerLen = view.getUint16(8, true);
  const headerText = String.fromCharCode(...new Uint8Array(buffer.slice(10, 10 + headerLen)));
  const header = JSON.parse(preprocessNpyHeader(headerText));

  const shape = header.shape;
  const totalElements = shape.reduce((a, b) => a * b, 1);
  const dataOffset = 10 + headerLen;

  // Parse structured dtype - extract field names and types
  // Format: [('jdct', '<f8'), ('x', '<f8'), ...]
  const descr = header.descr;
  const fields = [];
  for (const [name, dtype] of descr) {
    fields.push({ name, dtype });
  }

  // Calculate record size (all fields are float64 = 8 bytes)
  const recordSize = fields.length * 8;

  // Parse data into structured records
  const result = {};
  for (const field of fields) {
    result[field.name] = new Array(totalElements);
  }

  const dataView = new DataView(buffer.slice(dataOffset));
  for (let i = 0; i < totalElements; i++) {
    for (let f = 0; f < fields.length; f++) {
      const offset = i * recordSize + f * 8;
      result[fields[f].name][i] = dataView.getFloat64(offset, true);
    }
  }

  return result;
}

/**
 * Load and parse an NPZ file
 * @param {string} filePath - Path to the NPZ file
 * @returns {Promise<Object>} Object with arrays: jd, x, y, z
 *
 * The NPZ files contain structured arrays:
 * - SC_vectors: spacecraft position/velocity with fields (jdct, x, y, z, vx, vy, vz)
 */
async function loadNpzFile(filePath) {
  const buffer = readFileSync(filePath);
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(buffer);

  // Find and parse SC_vectors.npy (structured array)
  const scVectorsFile = zipContent.files['SC_vectors.npy'];
  if (!scVectorsFile) {
    throw new Error('SC_vectors.npy not found in NPZ file');
  }

  const npyBuffer = await scVectorsFile.async('arraybuffer');
  const scVectors = parseStructuredNpy(npyBuffer);

  const jd = scVectors.jdct;
  const x = scVectors.x;
  const y = scVectors.y;
  const z = scVectors.z;
  const n = jd.length;

  // Compute velocity from central differences of position (km/s)
  // This is more accurate than using NPZ velocity fields which may have coordinate issues
  const vx = new Array(n);
  const vy = new Array(n);
  const vz = new Array(n);

  // Interior points: central difference
  for (let i = 1; i < n - 1; i++) {
    const dt = (jd[i + 1] - jd[i - 1]) * 86400;  // seconds
    vx[i] = (x[i + 1] - x[i - 1]) / dt;
    vy[i] = (y[i + 1] - y[i - 1]) / dt;
    vz[i] = (z[i + 1] - z[i - 1]) / dt;
  }

  // Edge points: forward/backward difference
  if (n > 1) {
    const dt0 = (jd[1] - jd[0]) * 86400;
    vx[0] = (x[1] - x[0]) / dt0;
    vy[0] = (y[1] - y[0]) / dt0;
    vz[0] = (z[1] - z[0]) / dt0;

    const dtn = (jd[n - 1] - jd[n - 2]) * 86400;
    vx[n - 1] = (x[n - 1] - x[n - 2]) / dtn;
    vy[n - 1] = (y[n - 1] - y[n - 2]) / dtn;
    vz[n - 1] = (z[n - 1] - z[n - 2]) / dtn;
  }

  return { jd, x, y, z, vx, vy, vz };
}

// ============================================================================
// Chebyshev Polynomial Evaluation (shared core/domain implementation)
// ============================================================================

// ============================================================================
// NPZ Interpolation
// ============================================================================

/**
 * Hermite cubic interpolation between two points.
 *
 * @param {number} t - Normalized parameter in [0, 1]
 * @param {number} p0 - Position at start
 * @param {number} v0 - Velocity at start (km/s)
 * @param {number} p1 - Position at end
 * @param {number} v1 - Velocity at end (km/s)
 * @param {number} dt - Time interval in seconds
 * @returns {number} Interpolated position
 */
function hermiteInterpolate(t, p0, v0, p1, v1, dt) {
  const t2 = t * t;
  const t3 = t2 * t;

  // Hermite basis functions
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  // P(t) = h00*P0 + h10*dt*V0 + h01*P1 + h11*dt*V1
  return h00 * p0 + h10 * dt * v0 + h01 * p1 + h11 * dt * v1;
}

/**
 * Interpolate position from NPZ data at a specific Julian date.
 * Uses Hermite cubic interpolation for accurate ground truth.
 *
 * @param {Object} npzData - Loaded NPZ data with jd, x, y, z, vx, vy, vz arrays
 * @param {number} jd - Julian date to interpolate at
 * @returns {Object|null} Position {x, y, z} in km, or null if out of range
 */
function interpolateNpzPosition(npzData, jd) {
  const { jd: times, x, y, z, vx, vy, vz } = npzData;

  // Check bounds
  if (jd < times[0] || jd > times[times.length - 1]) {
    return null;
  }

  // Binary search to find the bracketing indices
  let low = 0;
  let high = times.length - 1;

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (times[mid] <= jd) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // If exact match, return directly
  if (times[low] === jd) {
    return { x: x[low], y: y[low], z: z[low] };
  }
  if (times[high] === jd) {
    return { x: x[high], y: y[high], z: z[high] };
  }

  // Hermite cubic interpolation
  const t0 = times[low];
  const t1 = times[high];
  const dt = (t1 - t0) * 86400;  // Time interval in seconds
  const t = (jd - t0) / (t1 - t0);  // Normalized parameter [0, 1]

  return {
    x: hermiteInterpolate(t, x[low], vx[low], x[high], vx[high], dt),
    y: hermiteInterpolate(t, y[low], vy[low], y[high], vy[high], dt),
    z: hermiteInterpolate(t, z[low], vz[low], z[high], vz[high], dt)
  };
}

// ============================================================================
// Error Calculation Utilities
// ============================================================================

/**
 * Calculate Euclidean distance between two 3D points
 * @param {Object} p1 - First point {x, y, z}
 * @param {Object} p2 - Second point {x, y, z}
 * @returns {number} Distance in same units as input
 */
function distance3D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Generate detailed error report comparing Chebyshev and NPZ data
 * @param {Object} npzData - NPZ data
 * @param {Object} chebData - Chebyshev data
 * @param {number} intervalSeconds - Sampling interval
 * @returns {Object} Report with statistics and sample errors
 */
function generateErrorReport(npzData, chebData, intervalSeconds) {
  const { jd: times } = npzData;
  const startJd = Math.max(times[0], chebData.time_range.start);
  const endJd = Math.min(times[times.length - 1], chebData.time_range.end);

  const intervalJd = intervalSeconds * JD_PER_SECOND;
  const errors = [];
  let maxError = 0;
  let maxErrorTime = null;
  let totalError = 0;
  let sampleCount = 0;

  for (let jd = startJd; jd <= endJd; jd += intervalJd) {
    const npzPos = interpolateNpzPosition(npzData, jd);
    const chebPos = getPositionFromChebyshev(chebData, jd);

    if (npzPos && chebPos) {
      const error = distance3D(npzPos, chebPos);
      errors.push({ jd, error, npzPos, chebPos });
      totalError += error;
      sampleCount++;

      if (error > maxError) {
        maxError = error;
        maxErrorTime = jd;
      }
    }
  }

  // Find worst 10 samples for detailed report
  errors.sort((a, b) => b.error - a.error);
  const worstSamples = errors.slice(0, 10);

  return {
    startJd,
    endJd,
    sampleCount,
    intervalSeconds,
    maxError,
    maxErrorTime,
    meanError: sampleCount > 0 ? totalError / sampleCount : 0,
    worstSamples
  };
}

/**
 * Format a Julian date as a human-readable string
 * @param {number} jd - Julian date
 * @returns {string} ISO-ish date string
 */
function formatJulianDate(jd) {
  // Convert JD to Unix timestamp (JD 2440587.5 = Unix epoch)
  const unixMs = (jd - 2440587.5) * 86400 * 1000;
  return new Date(unixMs).toISOString();
}

// ============================================================================
// Tests
// ============================================================================

describe('Chebyshev Ephemeris Accuracy', () => {

  describe('Chebyshev evaluation function', () => {
    it('should return 0 for empty coefficients', () => {
      expect(evaluateChebyshev([], 0)).toBe(0);
    });

    it('should return the constant for single coefficient', () => {
      expect(evaluateChebyshev([42], 0)).toBe(42);
      expect(evaluateChebyshev([42], 0.5)).toBe(42);
      expect(evaluateChebyshev([42], -1)).toBe(42);
    });

    it('should evaluate T_0(x) = 1', () => {
      // Coeffs [1] means 1 * T_0(x) = 1
      expect(evaluateChebyshev([1], 0)).toBeCloseTo(1, 10);
      expect(evaluateChebyshev([1], 0.5)).toBeCloseTo(1, 10);
    });

    it('should evaluate T_1(x) = x', () => {
      // Coeffs [0, 1] means 0 * T_0(x) + 1 * T_1(x) = x
      expect(evaluateChebyshev([0, 1], 0)).toBeCloseTo(0, 10);
      expect(evaluateChebyshev([0, 1], 0.5)).toBeCloseTo(0.5, 10);
      expect(evaluateChebyshev([0, 1], -0.5)).toBeCloseTo(-0.5, 10);
      expect(evaluateChebyshev([0, 1], 1)).toBeCloseTo(1, 10);
    });

    it('should evaluate T_2(x) = 2x^2 - 1', () => {
      // Coeffs [0, 0, 1] means T_2(x) = 2x^2 - 1
      expect(evaluateChebyshev([0, 0, 1], 0)).toBeCloseTo(-1, 10);
      expect(evaluateChebyshev([0, 0, 1], 1)).toBeCloseTo(1, 10);
      expect(evaluateChebyshev([0, 0, 1], -1)).toBeCloseTo(1, 10);
      expect(evaluateChebyshev([0, 0, 1], 0.5)).toBeCloseTo(-0.5, 10);
    });

    it('should evaluate linear combination correctly', () => {
      // 3 + 2*x (coeffs [3, 2])
      expect(evaluateChebyshev([3, 2], 0)).toBeCloseTo(3, 10);
      expect(evaluateChebyshev([3, 2], 1)).toBeCloseTo(5, 10);
      expect(evaluateChebyshev([3, 2], -1)).toBeCloseTo(1, 10);
    });
  });

  describe('NPZ interpolation', () => {
    // Mock data with constant velocity (linear motion)
    // Velocity = 10 km/day for x, 100 km/day for y, 1000 km/day for z
    // Converted to km/s: divide by 86400
    const mockNpzData = {
      jd: [100, 101, 102, 103],
      x: [0, 10, 20, 30],
      y: [0, 100, 200, 300],
      z: [0, 1000, 2000, 3000],
      vx: [10/86400, 10/86400, 10/86400, 10/86400],
      vy: [100/86400, 100/86400, 100/86400, 100/86400],
      vz: [1000/86400, 1000/86400, 1000/86400, 1000/86400]
    };

    it('should return exact values at data points', () => {
      const pos = interpolateNpzPosition(mockNpzData, 100);
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
      expect(pos.z).toBe(0);

      const pos2 = interpolateNpzPosition(mockNpzData, 102);
      expect(pos2.x).toBe(20);
      expect(pos2.y).toBe(200);
      expect(pos2.z).toBe(2000);
    });

    it('should interpolate between data points using Hermite', () => {
      // For constant velocity (linear motion), Hermite should give same result as linear
      const pos = interpolateNpzPosition(mockNpzData, 100.5);
      expect(pos.x).toBeCloseTo(5, 5);
      expect(pos.y).toBeCloseTo(50, 5);
      expect(pos.z).toBeCloseTo(500, 5);
    });

    it('should return null for times outside range', () => {
      expect(interpolateNpzPosition(mockNpzData, 99)).toBeNull();
      expect(interpolateNpzPosition(mockNpzData, 104)).toBeNull();
    });
  });

  describe('distance3D calculation', () => {
    it('should return 0 for identical points', () => {
      const p = { x: 1, y: 2, z: 3 };
      expect(distance3D(p, p)).toBe(0);
    });

    it('should calculate correct distance', () => {
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 3, y: 4, z: 0 };
      expect(distance3D(p1, p2)).toBe(5);
    });

    it('should calculate 3D distance correctly', () => {
      const p1 = { x: 1, y: 2, z: 3 };
      const p2 = { x: 4, y: 6, z: 3 };
      expect(distance3D(p1, p2)).toBe(5);  // sqrt(9 + 16 + 0) = 5
    });
  });

  // Main acceptance tests for each data file
  for (const dataFile of DATA_FILES) {
    const describeDataFile = existsSync(dataFile.npzPath) ? describe : describe.skip;
    describeDataFile(`${dataFile.name} phase data`, () => {
      const npzPath = dataFile.npzPath;
      const chebPath = dataFile.chebPath;

      it(`should have NPZ source file available: ${dataFile.npzLabel}`, () => {
        expect(existsSync(npzPath)).toBe(true);
      });

      it(`should have Chebyshev JSON file: ${dataFile.chebLabel}`, () => {
        // This test is expected to FAIL until the compression is implemented
        expect(existsSync(chebPath)).toBe(true);
      });

      it(`should have valid Chebyshev format structure`, async () => {
        // Skip if file doesn't exist (TDD - test written before implementation)
        if (!existsSync(chebPath)) {
          console.log(`Skipping format validation: ${dataFile.chebLabel} does not exist yet`);
          expect(existsSync(chebPath)).toBe(true);  // Will fail, as expected
          return;
        }

        const chebData = JSON.parse(readFileSync(chebPath, 'utf-8'));

        // Validate format field
        expect(chebData.format).toBe('chebyshev-ephemeris');
        expect(chebData.version).toBe('1.0');

        // Validate metadata
        expect(chebData.metadata).toBeDefined();
        expect(chebData.metadata.source).toBe(dataFile.expectedSource);
        expect(chebData.metadata.coordinate_frame).toBe('J2000');
        expect(chebData.metadata.units.time).toMatch(/^julian_date(_tdb)?$/);
        expect(chebData.metadata.units.position).toBe('km');

        // Validate time range
        expect(chebData.time_range).toBeDefined();
        expect(typeof chebData.time_range.start).toBe('number');
        expect(typeof chebData.time_range.end).toBe('number');
        expect(chebData.time_range.end).toBeGreaterThan(chebData.time_range.start);

        // Validate segments
        expect(Array.isArray(chebData.segments)).toBe(true);
        expect(chebData.segments.length).toBeGreaterThan(0);

        // Validate segment structure
        for (const segment of chebData.segments) {
          expect(typeof segment.t_start).toBe('number');
          expect(typeof segment.t_end).toBe('number');
          expect(segment.t_end).toBeGreaterThan(segment.t_start);
          expect(Array.isArray(segment.cx)).toBe(true);
          expect(Array.isArray(segment.cy)).toBe(true);
          expect(Array.isArray(segment.cz)).toBe(true);
          expect(segment.cx.length).toBeGreaterThan(0);
          expect(segment.cy.length).toBe(segment.cx.length);
          expect(segment.cz.length).toBe(segment.cx.length);
        }
      });

      it(`should have contiguous segment coverage`, async () => {
        if (!existsSync(chebPath)) {
          console.log(`Skipping contiguity test: ${dataFile.chebLabel} does not exist yet`);
          expect(existsSync(chebPath)).toBe(true);
          return;
        }

        const chebData = JSON.parse(readFileSync(chebPath, 'utf-8'));
        const segments = chebData.segments;

        // First segment should start at time_range.start
        expect(segments[0].t_start).toBeCloseTo(chebData.time_range.start, 10);

        // Last segment should end at time_range.end
        expect(segments[segments.length - 1].t_end).toBeCloseTo(chebData.time_range.end, 10);

        // Check segments are contiguous (each segment starts where previous ends)
        for (let i = 1; i < segments.length; i++) {
          expect(segments[i].t_start).toBeCloseTo(segments[i - 1].t_end, 10);
        }
      });

      it(`should match NPZ positions within ${dataFile.tolerance} km at 30-second intervals`, async () => {
        if (!existsSync(chebPath)) {
          console.log(`Skipping accuracy test: ${dataFile.chebLabel} does not exist yet`);
          expect(existsSync(chebPath)).toBe(true);
          return;
        }

        // Load both data sources
        const npzData = await loadNpzFile(npzPath);
        const chebData = JSON.parse(readFileSync(chebPath, 'utf-8'));

        // Generate error report
        const report = generateErrorReport(npzData, chebData, TEST_INTERVAL_SECONDS);

        // Log summary for debugging
        console.log(`\n${dataFile.name} phase accuracy report:`);
        console.log(`  Samples tested: ${report.sampleCount}`);
        console.log(`  Time range: ${formatJulianDate(report.startJd)} to ${formatJulianDate(report.endJd)}`);
        console.log(`  Maximum error: ${report.maxError.toFixed(3)} km`);
        console.log(`  Mean error: ${report.meanError.toFixed(3)} km`);
        console.log(`  Tolerance: ${dataFile.tolerance} km`);

        if (report.maxError > dataFile.tolerance) {
          console.log(`\n  Worst samples:`);
          for (const sample of report.worstSamples.slice(0, 5)) {
            console.log(`    JD ${sample.jd.toFixed(6)} (${formatJulianDate(sample.jd)}): ${sample.error.toFixed(3)} km`);
          }
        }

        // Assert maximum error is within tolerance
        expect(report.maxError).toBeLessThanOrEqual(dataFile.tolerance);
      }, 60000);  // 60 second timeout for this test

      it(`should cover the same time range as the NPZ data`, async () => {
        if (!existsSync(chebPath)) {
          console.log(`Skipping range test: ${dataFile.chebLabel} does not exist yet`);
          expect(existsSync(chebPath)).toBe(true);
          return;
        }

        const npzData = await loadNpzFile(npzPath);
        const chebData = JSON.parse(readFileSync(chebPath, 'utf-8'));

        const npzStart = npzData.jd[0];
        const npzEnd = npzData.jd[npzData.jd.length - 1];

        // Chebyshev data should cover at least the NPZ range
        // (small tolerance for floating point)
        expect(chebData.time_range.start).toBeLessThanOrEqual(npzStart + 1e-6);
        expect(chebData.time_range.end).toBeGreaterThanOrEqual(npzEnd - 1e-6);
      });
    });
  }

  describe('Error reporting utility', () => {
    it('should generate comprehensive error reports', async () => {
      // This test validates the error reporting works correctly
      // using a simple mock dataset with constant velocity
      // Velocity = 1000 km/day, converted to km/s
      const mockNpzData = {
        jd: [2460000, 2460001, 2460002],
        x: [1000, 2000, 3000],
        y: [4000, 5000, 6000],
        z: [7000, 8000, 9000],
        vx: [1000/86400, 1000/86400, 1000/86400],
        vy: [1000/86400, 1000/86400, 1000/86400],
        vz: [1000/86400, 1000/86400, 1000/86400]
      };

      const mockChebData = {
        time_range: { start: 2460000, end: 2460002 },
        segments: [{
          t_start: 2460000,
          t_end: 2460002,
          // Perfectly fitting linear Chebyshev (mean + slope*T1)
          // x: 2000 + 1000*T1 gives 1000 at t=-1, 2000 at t=0, 3000 at t=1
          cx: [2000, 1000],
          cy: [5000, 1000],
          cz: [8000, 1000]
        }]
      };

      const report = generateErrorReport(mockNpzData, mockChebData, 86400);  // 1 day intervals

      expect(report.sampleCount).toBeGreaterThan(0);
      expect(report.maxError).toBeDefined();
      expect(report.meanError).toBeDefined();
      expect(Array.isArray(report.worstSamples)).toBe(true);
    });
  });
});

const describeIntegration = HAS_NPZ_DATA ? describe : describe.skip;

describeIntegration('Integration: Full accuracy validation', () => {
  // This test runs a complete validation across all phases
  // and provides a consolidated report

  it('should validate all phases meet their accuracy requirements', async () => {
    const results = [];
    let allPassed = true;

    for (const dataFile of AVAILABLE_DATA_FILES) {
      const npzPath = dataFile.npzPath;
      const chebPath = dataFile.chebPath;

      if (!existsSync(npzPath)) {
        results.push({
          phase: dataFile.name,
          status: 'SKIP',
          reason: 'NPZ file not found'
        });
        continue;
      }

      if (!existsSync(chebPath)) {
        results.push({
          phase: dataFile.name,
          status: 'FAIL',
          reason: 'Chebyshev file not found (not yet implemented)'
        });
        allPassed = false;
        continue;
      }

      try {
        const npzData = await loadNpzFile(npzPath);
        const chebData = JSON.parse(readFileSync(chebPath, 'utf-8'));
        const report = generateErrorReport(npzData, chebData, TEST_INTERVAL_SECONDS);

        const passed = report.maxError <= dataFile.tolerance;
        results.push({
          phase: dataFile.name,
          status: passed ? 'PASS' : 'FAIL',
          maxError: report.maxError,
          tolerance: dataFile.tolerance,
          sampleCount: report.sampleCount,
          meanError: report.meanError
        });

        if (!passed) allPassed = false;
      } catch (error) {
        results.push({
          phase: dataFile.name,
          status: 'ERROR',
          reason: error.message
        });
        allPassed = false;
      }
    }

    // Print consolidated report
    console.log('\n========================================');
    console.log('Chebyshev Accuracy Validation Report');
    console.log('========================================\n');

    for (const result of results) {
      console.log(`${result.phase.toUpperCase()} PHASE: ${result.status}`);
      if (result.maxError !== undefined) {
        console.log(`  Max Error: ${result.maxError.toFixed(3)} km (tolerance: ${result.tolerance} km)`);
        console.log(`  Mean Error: ${result.meanError.toFixed(3)} km`);
        console.log(`  Samples: ${result.sampleCount}`);
      }
      if (result.reason) {
        console.log(`  Reason: ${result.reason}`);
      }
      console.log('');
    }

    console.log('========================================\n');

    expect(allPassed).toBe(true);
  }, 120000);  // 2 minute timeout for full validation
});
