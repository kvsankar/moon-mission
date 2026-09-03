# Moon Rendering Research and Execution Plan

Last updated: 2026-04-16 (IST)

## Why this document exists

This captures the full context of the moon-rendering investigations, what has already been tested, what is currently in-flight, and a concrete plan for next steps so work can be resumed later without losing technical continuity.

This is a Moon surface-rendering research note. Use
[Frame and Shoot Lighting and Exposure Spec](../../specs/rendering/frame-and-shoot-lighting-and-exposure.md)
for Frame and Shoot exposure and reflected-light behavior.

## Objective

Primary objective: improve Moon realism so crater relief near the terminator is driven by physically plausible light/shadow behavior, not mainly by contrast tricks.

Secondary objectives:
- Keep orbit/camera behavior stable.
- Preserve test reliability and avoid unreviewed regressions.
- Keep deployment discipline (local verification before deploy).

## Current status summary

- Terminator quality has improved meaningfully versus baseline.
- It is still not at target quality.
- We likely moved from a mostly shading-illusion regime toward a mixed regime (real geometry + shading), but data quality and runtime geometry limits remain.

Use `npm run test:unit` as the current verification gate for renderer work; avoid relying on historical hardcoded test counts in this note because the suite keeps evolving.

## Key technical findings

### 1) Original shadow pipeline gap

Earlier in the investigation, Moon mesh had shadow flags, but the full shadow pipeline was incomplete:
- Renderer shadow map path was not enabled initially.
- Primary directional light was not configured to cast shadows.
- No Moon-centered shadow frustum targeting.

Impact:
- Terminator relief depended mostly on normal/bump response and tone/contrast tuning.

### 2) Shadow pipeline improvements introduced

Work performed in this branch includes:
- Enabling renderer shadow mapping for main and auxiliary renderers.
- Enabling primary light cast shadows and shadow map setup.
- Adding light target handling and dynamic targeting around the illuminated body.
- Tightening shadow frustum and tuning shadow bias/normalBias.

Expected effect:
- Better terrain-driven relief at the boundary between lit and unlit regions.

### 3) Material path improvements

Moon shader/material path has been iterated with:
- Generated normal map from height/displacement texture.
- Higher sphere tessellation.
- Reduced dependence on artificial photometric boost terms.
- Reduced double-counting by avoiding simultaneous heavy bump + normal contributions from the same source.

Expected effect:
- Cleaner relief and less over-processed appearance.

### 4) Hard limit now appears data-driven

Even with better shadow/light setup, quality may still plateau because:
- Runtime Moon displacement source is relatively limited compared to available high-res LRO/LOLA products.
- Runtime sphere tessellation is finite (performance constraints).

Conclusion:
- Next major quality jump likely requires improved source assets and a controlled asset pipeline.

## External research and data candidates

### NASA SVS references

- Moon 3D Models for Web, AR, and Animation (ID 14959):
  - https://svs.gsfc.nasa.gov/14959/
- CGI Moon Kit (ID 4720):
  - https://svs.gsfc.nasa.gov/4720/

The `14959` page is mainly packaged 3D model artifacts.
The `4720` page is the critical source for raw color/displacement maps.

### Candidate raw files and published sizes (SVS)

Color:
- `lroc_color_16bit_srgb_4k.tif` = 59.0 MB
- `lroc_color_16bit_srgb_8k.tif` = 232.0 MB

Displacement:
- `ldem_16_uint.tif` = 31.7 MB
- `ldem_16.tif` = 63.3 MB
- `ldem_64_uint.tif` = 506.3 MB
- `ldem_64.tif` = 1012.6 MB

## Local asset footprint snapshot (current)

Current local Moon textures:
- `images/moon/Solarsystemscope_texture_8k_moon.jpg` = 15,030,356 bytes (~14.33 MB)
- `images/moon/ldem_16_gsfc.png` = 5,023,158 bytes (~4.79 MB)

Combined local footprint: ~19.12 MB

Note:
- Most `images/*` paths are gitignored, but the currently shipped Moon runtime profile assets under `images/moon/` are tracked exceptions in this repo.
- Any asset-source strategy must account for repository boundaries and reproducibility.

## Primary code areas for Moon rendering work

The main renderer touchpoints remain:
- `src/platform/js/rendering/moon-renderer.js`
- `src/platform/js/rendering/light-manager.js`
- `src/platform/js/controllers/animation-3d-controller.js`
- `src/platform/js/app/scene-handler-init.js`
- `src/platform/js/app/auxiliary-camera-views.js`
- `src/platform/js/app/light-actions.js`
- `src/platform/js/core/constants.js`

## Proposed plan (phased, low-risk)

### Phase 1: Stabilize current renderer improvements

1. Keep current shadow/material tuning as the working baseline.
2. Validate across representative views:
   - near-side full illumination
   - terminator close-up
   - high phase contrast
   - Earth->Moon and craft-mounted camera views
3. Confirm no regressions in:
   - orbit visibility
   - camera placement
   - auxiliary panel rendering

Exit criteria:
- Subjectively improved relief accepted for current texture set.
- No major visual regressions in core workflows.

### Phase 2: Controlled asset-upgrade experiment

1. Download one mid-weight candidate set from SVS (recommended first trial):
   - color: 4k 16-bit sRGB TIFF
   - displacement: 16_uint TIFF
2. Convert to runtime-friendly web assets via reproducible script.
3. Generate a high-quality normal map from upgraded DEM.
4. A/B compare against current assets with identical lighting and camera.

Exit criteria:
- Clear quality gain at terminator and crater rims.
- Runtime performance acceptable.
- Asset size and loading trade-offs acceptable.

### Phase 3: Optional higher-fidelity pass

If Phase 2 gain is insufficient:
- Evaluate higher-res DEM input (`ldem_64_uint`) for offline normal/displacement baking.
- Keep runtime assets bounded by target size/performance budgets.

## Suggested asset budgeting guardrails

To avoid runaway payload growth:
- Runtime Moon color texture target: <= 20 MB compressed (preferably lower).
- Runtime Moon displacement/normal combined target: <= 20 MB compressed.
- First meaningful upgrade should ideally stay within an additional ~15–30 MB envelope unless explicitly approved.

## Risks and mitigations

Risk: sharper shadows introduce acne/peter-panning artifacts.
- Mitigation: controlled bias/normalBias tuning and Moon-centered frustum.

Risk: larger assets increase load time and memory.
- Mitigation: offline conversion pipeline with explicit size budgets.

Risk: regressions in SSIM/test snapshots due lighting shifts.
- Mitigation: gated baseline refresh only after geometry/behavior is validated stable.

Risk: repository boundary confusion for generated assets.
- Mitigation: document source-of-truth and sync process before check-in.

## Open decisions to make later

1. Accept current shader/light quality as interim, or continue tuning before asset upgrade?
2. Phase 2 input set: start with 4k color + 16_uint DEM (recommended) or jump higher?
3. Runtime size budget tolerance for Moon assets.
4. Baseline update timing (only after rendering behavior is declared stable).

## Practical next actions (when resumed)

1. Checkpoint current rendering changes (commit on working branch after review).
2. Add/verify conversion pipeline script for SVS TIFF inputs to runtime textures.
3. Run first controlled asset A/B with fixed camera and lighting.
4. Decide final merge path based on quality vs size/performance.
