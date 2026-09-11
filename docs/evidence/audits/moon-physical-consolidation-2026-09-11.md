# Physical Moon consolidation — 11 September 2026

Validated on app branch `codex/moon-loading-audit`, with matching
runtime assets on data branch `codex/moon-physical-assets`. Neither is deployed.
The accepted tag `moon-terminator-working-2026-09-11` remains unchanged.

## Result

- One Physical shader and normal algorithm serves all 3D Moon views. Current's
  branch, artistic normal builder, model selector and legacy DEM conversion are removed.
- Schema 7 migrates old settings; tier changes synchronize URL/state/storage.
- Low/Medium have precise, reduced terrain and prepared normals. High retains
  its source assets and photographic response. The preview remains terrain-free.
- Fixed Sun-corona textures are prepared ahead of time; their decoded pixels
  match the original generation math exactly.
- Early tier changes no longer strand Earth/sky texture loading. Repeated
  unchanged header/view layout writes and indefinite input waits are removed.
- Both bundled and source-based static distributions have working terrain
  workers; the latter receives a self-contained bundle before `src` is revisioned.

## Measured performance

Fresh Chrome contexts, RTX 4070 Laptop GPU (ANGLE/D3D11), local staged assets.
Startup used the default Artemis II layout at 1600 × 1000. These are individual
runs, not device-wide latency or frame-rate guarantees.

| Physical tier | First preview | Completed terrain | Moon-only median GPU draw | Sample p95 GPU draw |
| --- | --- | --- | --- | --- |
| Low | 3.73 s | 6.37 s | 0.118 ms | 0.126 ms |
| Medium | 3.44 s | 6.80 s | 0.686 ms | 0.958 ms |
| High | 3.64 s | 18.20 s | 1.359 ms | 1.736 ms |

Moon-only measurements render 1024 × 1024, with 10 warm-up draws and 60 GPU-timed
draws. They verify actual illuminated pixels and the Physical model. GPU timer
queries measure execution; JavaScript command-submission time is not substituted.

Full four-view application playback measured roughly 16–20 frames/s in these
runs. That includes orbit, UI, other-body rendering and multiple contexts; it is
not the Moon-only draw cost. Broader frame-time optimization remains separate work.

[Recorded timings, draw metrics and terrain provenance](moon-physical-measurements-2026-09-11.json).
Earlier loading measurements used **Current and CDN textures**, not Physical with
local textures; their values are retained with corrected provenance in the older audit.

## Validation

- Full unit suite: **1,456 passed, 31 skipped, 205 files**.
- Loading/device matrix: **24 checks passed**, eight each in Chromium, Firefox
  and WebKit: first previews, actual Low/Medium terrain, GPU limits, touch layout,
  tuning during loading and recovery from an early tier change.
- Observer: **12 regressions passed**, covering all eight photographs, camera
  controls, failed loads, URL migration and the GPU terrain-horizon check.
- High's Manzinus result remains **28.488%** missing reference-lit ridge pixels,
  render mean **41.445/255**, adjacent-dark mean **0.358/255**, matching acceptance.
  Existing photographic thresholds and image baselines were not loosened.
- Fast packages preserve half-metre units and datum; sampled normal-direction
  error is below one degree. Corrupt payloads/units are rejected.
- Sun-corona assets match every pixel of the original raster generator.
- Production build passed in `tmp-dist-physical-final`; a locked media segment
  in the previous output was avoided. Existing bundle/script warnings remain.
- Built Low/Medium/High pages loaded successfully. The standalone raw worker
  decoded both packed and High PNG terrain without page import maps. Native
  gzip and the JavaScript fallback returned identical sampled heights.
- All six profile assets and terrain provenance match byte-for-byte across
  app/data. The data branch also mirrors the existing 4K/16K color and High
  height files unchanged. Both asset collectors discover the six profile
  paths and exclude the obsolete height override; the data audit retains
  terrain provenance. Config sync and time-scale lint pass.

A broader auxiliary-layout suite had five passes and three failures: right-stack
top alignment and two legacy corner-grip checks. All three reproduce identically
on unchanged master `80a17af`; they are not regressions introduced here. They
remain separate UI follow-up work. Observer navigation now waits on explicit
view readiness rather than the page-wide load event for remote images.

Touch tests are emulation on Windows, not measurements from physical Android or
iPhone hardware. Real-device cold-network, thermal/memory and multi-view checks
remain release QA. 3D continues to require WebGL2.

## Reproduction and release

Matching data commit: [`b9bd882`](https://github.com/kvsankar/moon-mission-data/commit/b9bd8827ee2e909653bc7225f2b70e35a1ee63e3).
Stage that commit (or a descendant) for this app version.

Stage runtime assets and start Vite on port 7275. Use a quiet machine for timing.

```sh
npm run test:unit
npm run test:browser:moon-observer
npx cross-env MOON_TEST_BROWSER=chromium vitest run test/moon-render-loading-interaction.test.js
npx cross-env MOON_TEST_BROWSER=firefox vitest run test/moon-render-loading-interaction.test.js
npx cross-env MOON_TEST_BROWSER=webkit vitest run test/moon-render-loading-interaction.test.js
npx vite build --outDir tmp-dist-physical-final
node scripts/bench-moon-render.mjs http://127.0.0.1:7275 .tmp/moon-draws.json --hardware
```

Preserve the accepted tag and High ridge/darkness thresholds. Publish the matching
app/data assets together: the new 2K color and two terrain packages must be
available at the production asset base before deploying their consuming code.
The deployment workflow bundles the raw worker automatically; no live deployment
was performed during this work.

[Architecture](../../designs/rendering/moon-rendering.md) ·
[Asset preparation and device rules](../../operations/data/moon-render-assets.md).
