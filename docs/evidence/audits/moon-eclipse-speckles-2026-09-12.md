# Moon eclipse speckles — 12 September 2026

## Cause and fix

The speckles on the dark Moon were solar specular highlights. The shared shader
applied the terrain horizon and shadow checks to diffuse sunlight but left
Three.js's stock GGX highlights unmasked. Strong terrain normals could therefore
produce highlights inside the night-side disk as the viewing geometry changed.

An isolated High render reproduced the pattern with one Sun light and no sky,
stars or corona. Diffuse-only output was black; specular-only output contained
all the bright pixels. This rules out background light leaking through the mesh
for the reproduced artifact.

`src/platform/js/rendering/moon-renderer.js` now isolates the Sun's specular
contribution and applies the existing horizon, grazing and terrain-shadow factors.
Other lights remain separate. The displaced horizon, terrain normal generation,
diffuse equations, tuning values and assets are unchanged. All 3D Moon views
receive this correction through the shared renderer.

## Evidence

Baseline: app commit `e7c20ac`. An isolated 768 × 768 High render measured the
interior within 97% of the base radius (302,644 pixels), excluding the extreme
limb where raised terrain may see sunlight.

| Interior measure | Before | After |
| --- | --- | --- |
| Pixels brighter than 16/255 | 1,824 | 0 |
| Maximum RGB channel | 117/255 | 0 |
| Mean maximum RGB channel | 0.682/255 | 0 |

The permanent GPU regression uses actual Low/Medium/High assets and checks their
installed terrain dimensions. It varies Sun alignment and lunar rotation with
orthographic and perspective cameras. It also compares blocked-Sun-plus-fill
against fill alone, preventing a fix that merely blacks out the whole Moon.

The full Chromium observer suite passes all 15 tests, including the eight
registered photographs and Manzinus. Unit validation: 1,456 passed, 31 skipped.
The eclipse cases also pass in Firefox and WebKit on Windows; these are browser
engine checks, not physical phone measurements.

Photo output is not pixel-identical because previously unblocked highlights are
removed. Manzinus ridge mean changes from 41.445 to 40.445/255; missing reference-lit
pixels change from 28.488% to 31.202%; adjacent-dark mean improves from 0.358 to
0.205/255. All original thresholds and photographic baselines are retained.
The accepted `moon-terminator-working-2026-09-11` tag remains unchanged.

```sh
npm run test:unit
npx vitest run test/moon-observer-artemis2-interaction.test.js
npx cross-env MOON_TEST_BROWSER=firefox vitest run test/moon-observer-artemis2-interaction.test.js -t "keeps the eclipsed Moon dark"
npx cross-env MOON_TEST_BROWSER=webkit vitest run test/moon-observer-artemis2-interaction.test.js -t "keeps the eclipsed Moon dark"
```
