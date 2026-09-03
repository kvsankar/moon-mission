# Moon Render Assets

Provenance baseline:
[Moon Render Asset Provenance](../../evidence/baselines/moon-render-assets-2026-04.md)

Scientific/rendering research:
[Moon Rendering](../../research/moon-rendering/research-and-plan.md)

## Runtime Profiles

| Profile | Color | Height |
| --- | --- | --- |
| `fast` / Standard | `images/moon/lroc_color_2025_4k_fast.jpg` | `images/moon/ldem_16_gsfc.png` |
| `quality` / Detailed | `images/moon/lroc_color_2025_16k_quality.jpg` | `images/moon/ldem_16_uint_quality.png` |

Artemis II defaults to `quality`; missions without an override normally use
`fast`. Runtime resolves the profile from URL parameters, configured defaults,
local storage, and UI state. Failure to load Detailed assets falls back to
Standard.

## Ownership

The four runtime images are tracked under app `images/moon/`. Deployment also
stages the data repo's shared `images/` tree, so matching Moon files form a
mirrored runtime boundary. Verify hashes before staging/release; a differing
data-repo copy must not silently redefine the tracked app asset. TIFF masters
and conversion scratch are not runtime assets.

The April 2026 local source directory is historical and not reproducible by
path; use the provenance baseline for its source and derivation record.

## Replacement Procedure

1. Record source URL, product name, retrieval date, license, and checksum.
2. Preserve conversion command, tool version, dimensions, bit depth, color
   handling, and output settings.
3. Write the derived file to the matching `images/moon/` path or update
   `src/platform/js/app/moon-render-asset-profiles.js` deliberately.
4. Record output checksums with `Get-FileHash <path> -Algorithm SHA256`.
5. Run focused Moon asset/profile tests and start Vite.
6. Verify Standard and Detailed on a real mission route, including URL/UI
   switching and automatic fallback.
7. Run visual comparison before accepting changed color or relief output.
8. Update provenance evidence with the new source and derivation record.

Do not replace a height map without documented provenance and a lossless
conversion path; the current baseline lacks complete height-map provenance.
