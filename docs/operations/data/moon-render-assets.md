# Moon render assets

All tiers use the shared Physical renderer. Paths below are under `images/moon/`.

| Tier | Color | Terrain |
| --- | --- | --- |
| Low | `lroc_color_2025_2k_low.jpg` | `terrain-low-v1.moon.gz` |
| Medium | `lroc_color_2025_4k_fast.jpg` | `terrain-medium-v1.moon.gz` |
| High | `lroc_color_2025_16k_quality.jpg` | `ldem_16_uint_quality.png` |

Low/Medium packages contain area-averaged NASA uint16 heights and prepared RGB8
normals, using the same spherical normal algorithm as High. Heights retain
half-metre samples with the +10 km encoding offset and 1737.4 km reference radius.
There is no per-image height normalization. High retains its accepted PNG and
half-float normal precision. Old `ldem_16_gsfc.png` profile overrides migrate to
the corresponding physical asset; no legacy image-height decoder remains.

## Preparation and ownership

```sh
python scripts/generate-moon-preview.py
node scripts/generate-moon-terrain.mjs
node scripts/generate-sun-corona.mjs
```

The color generator creates the 1K app preview (JPEG quality 78) and Low's 2K
color (quality 85) from the existing NASA 4K color, using Pillow Lanczos resizing.
Terrain preparation reuses `buildPhysicalMoonNormalData`; dimensions, source hash,
format and output hashes are recorded in `images/moon/terrain-v1-provenance.json`.
The original source chain is in the [provenance baseline](../../evidence/baselines/moon-render-assets-2026-04.md).

Moon runtime textures/packages follow the existing app/data mirror contract:
app `images/moon/` and `moon-mission-data/images/moon/` must be byte-identical.
Verify hashes before staging or release. The preview and fixed Sun-corona PNGs
are app UI assets under `src/platform/assets/`, included by module-relative URLs.
The Sun generator preserves the original raster math; pixel equality is tested.

## Delivery

Vite development serves staged local assets. Production retains the configured
runtime asset base/CDN. Upload the new terrain and 2K color assets before releasing
the consuming app; the runtime manifest now requires all six profile assets.

Vite bundles module workers. The source-based static deployment and Python build
also run `scripts/build-moon-worker.mjs`, producing a self-contained worker at the
same relative path before `src` is revisioned. Worker dependencies cannot rely on
the page's import map. Gzip uses the native API when available and a bundled
JavaScript fallback otherwise. Decode failures retain the existing Moon/preview.

## Device policy

URL, global setting and saved tier precede the automatic default. A successful
user selection updates all three. Default is Medium; Low applies for memory
≤2 GB, ≤2 logical cores, Save-Data, slow-2G/2G/3G, or touch/coarse pointer with
unknown memory or ≤4 GB. High is never automatic.

Use the smallest observed GPU texture limit: below 5760, High becomes Medium;
below 2048, Medium/High becomes Low. Unsupported controls are disabled. Interactive
pixel ratio is capped at 2 desktop, 1.5 touch, or 1 constrained. GPU dimensions
do not guarantee available memory. See [architecture and budgets](../../designs/rendering/moon-rendering.md).

Validate native height units, normal orientation/precision, cancellation, all
three profiles and the unchanged High photographic thresholds before replacing
assets. Record source, conversion settings, versions and hashes with each change.
