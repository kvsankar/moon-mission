# Moon startup preview

`moon-preview.jpg` is a 1024 x 512, 71,503-byte startup UI asset derived from the
staged `images/moon/lroc_color_2025_4k_fast.jpg` NASA CGI Moon Kit color map.
It supplies an immediate textured Moon while the requested Low/Medium/High
runtime assets load. It does not replace the final tier's color or terrain data.

Regenerate with `python scripts/generate-moon-preview.py` (Pillow required).
The checked-in preview uses JPEG quality 78, Lanczos resizing, optimized
progressive encoding. No lighting, sharpening, or generated terrain is added.

Source provenance is documented in `docs/operations/data/moon-render-assets.md`.
The preview stays under `src` so both the revisioned static deployment and Vite
include it with the application. It is loaded relative to the module URL and
therefore does not wait for the large-asset CDN.

## Fixed Sun corona assets

`sun-corona-base.png` and `sun-corona-flow.png` replace synchronous startup
rasterization. Regenerate with `node scripts/generate-sun-corona.mjs`; it calls
the original `buildSolarCoronaPixels` math and tests compare every decoded pixel.
The app loads these small local assets asynchronously and requests a redraw.

`generate-moon-preview.py` also produces Low's 2K runtime color image (quality 85)
under `images/moon/`, following the app/data texture mirror contract.
