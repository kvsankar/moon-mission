# Artemis reference camera and display calibration

Date: 2026-09-11. This supersedes the initial qualitative eight-photo audit.

Subsequent correction: the broad checks below missed a localized shader failure
above Manzinus. See [Missing illumination above Manzinus](manzinus-horizon-fix.md)
for the root cause, corrected horizon/shadow path, and targeted GPU/photo tests.

## Result and scope

All eight observer-harness references have estimated camera registration. Match
photo framing applies the camera pose/FOV, while the default continues to show
the whole Moon with independent pan/zoom. Match photo brightness corrects the
three demonstrably underexposed comparisons. The other five exposures, the
existing Earthset pose, shared renderer shader, physical lighting parameters,
DEM, normal generation, and mission defaults remain unchanged in this fix.

## Camera fitting

Reference timestamps and observer/Sun vectors come from the existing manifest
and lunar Chebyshev ephemeris. SIFT crater correspondences were filtered with
RANSAC; camera rotation and focal length were then fitted with robust residuals.
The solution was constrained to front-facing rays and within 15% of the source
focal-length estimate. A second render at the fitted camera exposed additional
matches for refinement. Camera pointing was converted to a body-fixed surface
target using the existing lunar orientation at each timestamp. No nonrigid image
warp is used by the application.

Errors below are median feature reprojection errors in a 1497 x 998 comparison
frame. They are fit residuals, not independent estimates of spacecraft pointing
accuracy. The poses were subsequently checked by re-rendering the terrain.
The older stable pose for art002e009278 was retained because its whole-region
error was marginally lower than the second candidate. Earthset's earlier
registration was retained to preserve its established acceptance region.

| Reference | Camera-fit inliers | Median residual, px | Display exposure |
|---|---:|---:|---:|
| art002e009277 | 2868 | 1.138 | 0.40 |
| art002e009278 | 931 | 1.410 | 0.40 |
| art002e009279 | 3385 | 0.805 | 0.40 |
| art002e010208 | 3311 | 0.435 | 1.00 |
| art002e009281 | 1423 | 0.931 | 1.05 |
| art002e009283 | 614 | 1.296 | 0.60 |
| art002e009287 | 1235 | 0.486 | 0.40 |
| art002e009289 | Existing calibration retained | Existing acceptance test | 0.40 |

## Before/after regression

The browser regression compares each photo at the same calibrated pose, first
with the earlier fixed exposure 0.40 and then with matched brightness. The
following values are mean absolute luminance error on the 0–255 scale, measured
in a 1700 x 1000 browser window (approximately 697 x 465 image viewports).
Source pixels above luminance 5 are included, excluding captions and frame
edges; Earthset uses its lower terrain region to exclude Earth. The test also
checks the photo's dark terrain (luminance between 5 and 85) independently.

| Reference | Fixed-exposure error | Matched error | Dark-terrain error before / after |
|---|---:|---:|---:|
| art002e009277 | 10.91 | 10.91 | 16.93 / 16.93 |
| art002e009278 | 12.91 | 12.91 | 13.65 / 13.65 |
| art002e009279 | 10.93 | 10.93 | 11.43 / 11.43 |
| art002e010208 | 55.54 | 12.66 | 29.32 / 21.35 |
| art002e009281 | 56.36 | 18.77 | 30.51 / 24.02 |
| art002e009283 | 31.90 | 22.62 | 27.31 / 22.47 |
| art002e009287 | 14.40 | 14.40 | 13.26 / 13.26 |
| art002e009289 | 12.71 | 12.71 | 13.50 / 13.50 |

The retained Earthset regression additionally checks dark-region mean luminance,
near-black coverage, the Ohm neighborhood, and terrain beyond the reference crop.

Run `npm run test:browser:moon-observer` with the local server on port 7275.
The all-reference test logs its before/after numbers, applies per-photo maximum
errors, and rejects an increase in either whole-region or dark-terrain error.
It is a calibration regression on these eight photos, not a held-out proof that
the renderer reproduces other photographs.

## Rejected changes and limits

Blindly applying shutter/aperture exposure ratios worsened the first three
photographs and the tightest close-up. Therefore EXIF exposure is not treated as
a complete model of the processed JPEGs. Removing the earlier empirical
terminator fade did not consistently improve the dark-region measurements;
the shared shader is byte-for-byte unchanged by this calibration fix.

The same source images were used for fitting and acceptance. Fine crater walls,
shadow edges, and surface contrast still differ, especially in the 400 mm
close-up. Finite DEM/normal resolution, JPEG tone processing, and camera/lens
model error remain. The test masks are useful regression regions, not a claim
of photorealistic identity or a validation of every dark-side pixel. No extra
terrain detail was fabricated to resemble the photographs.
