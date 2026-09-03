# Moon Render Asset Provenance Baseline - 2026-04

This preserves the dated source and derivation record. Current maintenance is
documented in [Moon Render Assets](../../operations/data/moon-render-assets.md).

This note documents the runtime Moon surface texture assets currently used by the app and the provenance of the NASA-derived color maps.

## Current Runtime Profiles

### Standard runtime profile

- Color map: `images/moon/lroc_color_2025_4k_fast.jpg`
- Height map: `images/moon/ldem_16_gsfc.png`
- Internal profile key: `fast`

### Detailed runtime profile

- Color map: `images/moon/lroc_color_2025_16k_quality.jpg`
- Height map: `images/moon/ldem_16_uint_quality.png`
- Internal profile key: `quality`

## Provenance

NASA source page:
- `https://svs.gsfc.nasa.gov/4720/`
- Title: `CGI Moon Kit`
- Producer: NASA Scientific Visualization Studio

NASA source masters downloaded locally during April 2026 tuning work:
- `data-generated/moon-source/lroc_color_16bit_srgb_4k.tif`
- `data-generated/moon-source/lroc_color_16bit_srgb_16k.tif`

The runtime JPEGs were derived from those NASA TIFF masters for app use:
- `lroc_color_2025_4k_fast.jpg` from `lroc_color_16bit_srgb_4k.tif`
- `lroc_color_2025_16k_quality.jpg` from `lroc_color_16bit_srgb_16k.tif`

The conversion was performed locally to create browser-friendly runtime assets instead of shipping the very large TIFF masters directly.

## Rationale

- The previous `fast` / `Standard` color map was `images/moon/Solarsystemscope_texture_8k_moon.jpg`, which was not NASA-traceable.
- The current setup keeps both color profiles NASA-traceable while preserving a real runtime ladder:
  - lower-bandwidth NASA `4k` color for the standard profile
  - higher-fidelity NASA `16k` color for the detailed profile
- Height maps remain PNG because the lunar relief pipeline depends on lossless grayscale detail.
- Color maps remain JPEG because they are photographic imagery and compress much more efficiently.

## Important Repo Boundary

- The NASA TIFF source masters live under `data-generated/moon-source/` as local working files and are not meant for deployment/runtime.
- The app consumes the derived runtime images under `images/moon/`.
