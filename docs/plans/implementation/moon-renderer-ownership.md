# Moon Renderer Ownership

Status: ownership split complete (2026-09-23)

## Problem and boundary

`rendering/moon-renderer.js` is 1,878 physical lines and combines Physical
material/shader configuration, selenographic coordinate and grid geometry,
axis/pole orientation, texture lifetime, and the renderer's public stateful
facade. Move material/shader policy to a material owner and pure latitude/
longitude geometry and label creation to an overlay builder. Keep texture
ownership, axis/pole orientation, grid visibility/lifetime and the public
`MoonRenderer` API in the facade; do not
replace it with prototype mixins or a parallel shared-state bag.

## Size commitment

| Original | Before | Maximum largest piece (70%) | Expected largest piece |
| --- | ---: | ---: | ---: |
| `moon-renderer.js` | 1,878 | 1,314 | Under 1,000 |

## Verification

- Run `test/moon-renderer.test.js`, lat/lon overlay and pipeline tests,
  including shader uniform, grid, hover, disposal and resource-budget cases.
- Run the full unit suite, structure check, static build and a real
  Artemis II/Chandrayaan III Moon scene browser smoke check.

## Result

| Resulting file | Physical lines |
| --- | ---: |
| `moon-renderer.js` | 966 |
| `moon-lat-lon-overlay.js` | 455 |
| `moon-material.js` | 513 |

The largest piece is 966 lines, 48.6% smaller than the original and below
the committed 1,314-line maximum and 1,000-line cap. Material settings and
the Physical shader are separate from selenographic geometry, grid creation
and text sprites. The renderer keeps owned textures, body orientation,
visibility/lifetime, and its public API. All 77 focused Moon/pipeline/lat-lon
tests pass.
The shader source-contract tests now read `moon-material.js`, their actual
owner. The full unit gate (3,829 passing, six skipped), static build,
structure check, and eight real-route Moon loading cases pass.
