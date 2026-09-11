# Moon rendering code and validation — 11 September 2026

**Historical scope:** the loading audit before Current retirement and prepared
terrain. Findings below describe that intermediate state. See the
[current architecture](../../designs/rendering/moon-rendering.md) and
[consolidation validation](moon-physical-consolidation-2026-09-11.md).

The [architecture document](../../designs/rendering/moon-rendering.md) owns the
consolidation direction. This audit records the implementation, budgets and
validation evidence.

## Shared renderer and callers

All 3D Moon views now use `MoonRenderer`. Physical DEM uses the approved displaced-horizon/signed-altitude fix; Current retains compatibility behavior. Lighting model and quality remain separate choices: Current and Low do not reproduce High's photographed ridges. Current remains
the runtime default: sharing this class does not yet mean one lighting approach.

| View | Finding / change |
| --- | --- |
| Earth-centered, Moon-centered, relative, compare | Already shared; added early preview. |
| Follow, Craft → Moon/Earth | Same scene, mesh and material; added display-resolution limits. |
| Frame & Shoot / Flyby composer | Already shared. Exposure, fill lighting, eclipse settings and temporary shadow lift intentionally vary by shot. |
| Frame & Shoot / observer PNG exports | Existing scene/canvas; export sizing stays independent of interactive resolution limits. |
| Observer test page | Already corrected; added preview and GPU checks; retained camera/photo/illumination tests. |
| Tuner page | Replaced duplicate shader and texture/normal builder with shared renderer/loader; added Physical DEM selection and model-specific controls. |
| 2D animation / landing orbit previews | SVG/d3 schematics; no terrain shader. |
| Moon sites/features, SOI/Hill spheres, selection halos | Overlays/guides; no separate illuminated Moon. |
| Ground-track globe | Earth only. |

Under `src/platform/js/`, `app/moon-actions.js` creates `rendering/moon-renderer.js`; `app/auxiliary-camera-views.js` owns auxiliary rendering and `renderComposerLayers`. Standalone pages: `moon-observer-test.html`, `moon-render-tuner.html`.

## Resource profiles and device policy

 DEM means terrain elevation map; geometry numbers are sphere segment counts.

| Tier / stored key | Color | DEM / normals | Physical geometry | Horizon samples |
| --- | --- | --- | --- | --- |
| Low (lean) / `low` | 4K | None | 128 × 64 | 0 |
| Medium (mid) / `fast` | 4K | Standard image DEM; normals ≤2048 wide | 384 × 192 | 0 |
| High / `quality` | 16K | NASA 16-bit DEM + physical normals, 5760 × 2880 | 1024 × 512 | 20 |

The Moon Render panel has all three; legacy **Standard = Medium**, **Detailed = High**. Medium supports displaced-surface visibility, but still selects `legacy-artistic`
normals because `physicalNormalHeightScale` is zero. High uses spherical Physical
normals and detailed horizon tracing. Medium is therefore not yet a fully unified
fast Physical variant.

Device policy (`core/domain/render-device-policy.js`):

- **Default:** Medium. Low for reported memory ≤2 GB, logical cores ≤2, Save-Data, slow-2G/2G/3G, or touch/coarse pointer with unknown memory or ≤4 GB. No mission automatically selects High, including Artemis II.
- **Preference order:** URL → global setting → saved choice → device default. Uses optional capability reports, not browser/vendor names.
- **GPU limit:** smallest WebGL `MAX_TEXTURE_SIZE` across views. Below 5760: High → Medium; below 2048: Medium/High → Low. Unsupported controls are disabled, even for explicit choices. Three can resize images, but not High's typed DEM/normal buffers similarly.
- **Interactive pixel-ratio cap:** desktop 2; touch 1.5; constrained devices 1.

**High memory estimate:** 702 MiB/context for full-size color, float height and half-float normals, excluding geometry, shadows, render targets and legacy maps. Shared scene objects still require separate GPU allocations per context. Removing unused color mip levels saves 171 MiB/context with linear sampling. These are allocation estimates, not measured process memory or assurance that multiple High views fit on a phone. Texture-size checks cannot guarantee available memory.

## Asset loading and shader work

- **Preview first:** bundled NASA color, 1024 × 512, 71,503 bytes; Low geometry, no DEM. Appears when the mesh is ready, independently of the large-asset CDN.
- **Background detail:** removed the 5-second startup delay, 15-second idle callback and indefinite input wait. Heavy scene updates wait ≤2 seconds for idle; previews bypass this wait.
- **Concurrent fetches:** Moon color/DEM load alongside Earth; application stays ordered. Failed/cancelled prefetches release unused resources; stale previews cannot overwrite detail.
- **Shared fallback:** observer/tuner retain the requested tier during loading and the installed preview if detail fails.
- **Less rebuilding:** sliders update uniforms without shader recompilation; normals rebuild only when inputs change.
- **URL fix:** reference validation now normalizes comparison URLs independently of texture completion, resolving a race exposed by early previews.

Preview: `src/platform/assets/moon-preview.jpg`. Generator: `scripts/generate-moon-preview.py` (Pillow). Provenance/packaging: `src/platform/assets/README.md`. Vite bundles the module-relative asset; static deployment copies/revisions `src`, preserving URLs under mission subpaths. No runtime-asset relocation or CDN change.

| Desktop run (Current lighting) | First textured Moon | Final-tier color | DEM + normals |
| --- | --- | --- | --- |
| Unchanged master, High | 15.67 s (16K) | 15.67 s | 30.91 s |
| Updated, explicit High | 5.08 s (1K preview) | 8.94 s | 22.75 s |
| Updated, default Medium | 4.92 s (1K preview) | 8.01 s | 10.71 s |

**Lighting qualification:** all three timing runs used Current, confirmed by
`uMoonPhysicalModelBlend = 0` in the captured main and auxiliary shaders. These
measure asset-delivery improvements, not the speed of the proposed Physical
profiles or their steady animation frame rate.

[Measurement record](moon-loading-timing-2026-09-11.json): fresh Chrome contexts, 1600 × 1000, RTX 4070 Laptop GPU (ANGLE/D3D11), Moon textures from the public asset CDN, hot reload off, no concurrent heavy browser runs. Single paired observations, not percentiles or universal guarantees; earlier runs under different machine load were substantially slower. Medium has less detail; preview readiness is not High readiness.

## Validation coverage

| Validation | Result |
| --- | --- |
| Unit suite | **1,446 passed, 31 skipped, 204 files**; includes 36 renderer/reference/image-view checks. |
| Production Vite build | Passed; existing bundle-size warnings remain. |
| Loading | **15 passed:** five each in Chromium, Firefox, WebKit on Windows. Large downloads held open indefinitely test main preview, observer High preview, interactive tuner, repeated-input touch defaults and GPU fallback before unsupported downloads. Touch: 390 × 844, DPR 3. |
| Observer | **12 passed:** all-eight-photo photometry, raised-terrain GPU visibility, Manzinus ridges/adjacent darkness, Earthset/Ohm, cameras, URLs and failures. |

Tests establish that stalled large downloads and ongoing input cannot block a ready scene's preview. Startup still includes JavaScript download/execution, mission data, scene creation, shader compilation and scheduling; High requires full data and GPU upload.

Touch testing was emulated: real Android/iPhone performance and all GPU/OS combinations remain unverified. 3D still requires WebGL2. Accepted photo thresholds/baselines were not loosened. Future changes must preserve the tag and Manzinus ridge/darkness checks; whole-disc averages or regenerated evidence cannot substitute for them.

## Remaining performance work

- Move/precompute synchronous Sun corona generation, which delays scene creation; require separate Sun visual acceptance.
- Test mid-range Android/iOS: cold networks, touch navigation, thermal/memory behavior and multiple views. Desktop/mobile remain equal targets.
- Consider tiled/compressed High assets and fewer duplicate GPU allocations for close-ups on constrained devices.

## Reproduce

Stage assets per the contributor guide; run Vite on 7275 and unmodified master on another port. Use the measurement conditions above. Record the first Moon `onAfterRender` with texture width >1, then color/DEM/normal transitions.

```sh
npm run test:unit
npm run build
npx vitest run test/moon-render-loading-interaction.test.js
npx cross-env MOON_TEST_BROWSER=firefox vitest run test/moon-render-loading-interaction.test.js
npx cross-env MOON_TEST_BROWSER=webkit vitest run test/moon-render-loading-interaction.test.js
npx vitest run test/moon-observer-artemis2-interaction.test.js test/moon-renderer.test.js test/moon-observer-artemis2.test.js test/moon-observer-image-view.test.js
```
