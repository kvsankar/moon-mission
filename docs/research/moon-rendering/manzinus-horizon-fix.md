# Missing illumination above Manzinus

**Resolved in the accepted working checkpoint `moon-terminator-working-2026-09-11`.**
See the [working-version record](terminator-working-version.md) for the preserved
version, evidence, and validation instructions.

## Root cause

The Physical DEM fragment shader placed its raised-terrain horizon test inside
`#if defined(USE_DISPLACEMENTMAP)`. In the installed Three.js renderer,
`WebGLProgram.js` supplies that define to the vertex shader only. The fragment
block therefore never executed. The renderer fell back to the smooth-sphere
visibility cutoff, despite having correctly loaded the displacement texture.
The earlier unit test checked for the source text but did not execute its GPU
path. Broad photographic error measurements also hid this localized failure.

A second condition prevented physical DEM shadow rays from running when solar
altitude was negative. That was inconsistent with elevated terrain being able
to see below the radial horizon. Simply enabling the first block produced false
night-side highlights because intervening hills were then ignored.

## Correction

- Supply a Physical-only `MOON_PHYSICAL_DISPLACEMENT` fragment define and an
  explicit transformed height-UV varying from the vertex stage.
- Execute the displaced-position horizon test in the fragment stage.
- Trace signed solar altitude, including below the radial horizon, so nearby
  terrain still shadows elevated points correctly.
- Preserve the existing exposure, Sun direction, DEM, normal strength, finite
  solar-disk visibility function, and Current rendering path.

Changing exposure, removing all shadows, and softening an image cannot correct
this shader-path failure. Those changes are not part of this fix. The existing
narrow fade was retained: once the horizon path and signed shadow rays operate,
removing it offered no meaningful improvement in the target crop and admitted
more stray light into the dark region.

## Verification

The supplied photo crop was located in the original using 1031 matched features.
A new photographic test scores only its uppermost ridge band, excluding brighter
terrain lower down. It checks the fraction of lit photo pixels rendered nearly
black, their mean brightness and error, and adjacent pixels that should stay dark.
This is now an acceptance condition in addition to the wider photo tests.

A small synthetic GPU test exercises the actual compiled fragment program. With
an unraised sphere, a point just beyond its terminator has zero Sun visibility.
With a surface elevation of 0.005 lunar radii, that point must have full Sun
visibility; before the fix it incorrectly stayed zero. After the correction it
returns 255/255, while the deep night-side sample remains 0/255. Current retains
its earlier smooth-sphere behavior. The test does not rely on merely finding a
particular string in the shader source.

The existing Earthset/Ohm acceptance, all-eight-reference photometric regression,
view controls, and manual exposure checks pass. The production build passes with
its existing unrelated warnings. The complete focused set contains 46 tests.

## Remaining limits

The hard smooth-sphere cutoff is corrected. Individual rim pixels still differ
because of DEM resolution, approximate camera registration, shading normals,
and photographic processing. The targeted test requires a substantial recovery
of the missing ridge illumination without allowing a blanket night-side glow;
it is not a claim of pixel-for-pixel photographic identity.

For background on the distinct geometric-normal versus shading-normal problem,
see the [MoonRay shadow-terminator documentation](https://docs.openmoonray.org/user-reference/how-to-guides/shadow-terminators/).
The concrete defect here was verified directly in the installed Three.js source
and by the GPU test, rather than inferred from that general rendering literature.
