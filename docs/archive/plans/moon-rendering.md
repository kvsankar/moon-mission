# Moon Rendering — Implementation Plan

Synthesised from three Moon-rendering research reports:

- [Solar Disk Physics](../../research/moon-rendering/01-solar-disk-physics.md) - extended-disk Sun source physics
- [Lunar BRDF](../../research/moon-rendering/02-lunar-brdf.md) - lunar BRDF / photometric models
- [Techniques Survey](../../research/moon-rendering/03-techniques-survey.md) - survey of established Moon renderers

Branch: `wip/moon-render-soft-sun-disk` (forked off `wip/moon-render-terminator-isolation`).

## Status snapshot

**Reset performed**: After two visual A/Bs where the `wip` baseline still looked smoother than my modifications, the entire shader chain was reverted to `wip/moon-render-terminator-isolation` and only one surgical change was applied on top: smooth-normal-based Sun-disk visibility. All Tier 1 / Phase 1 / Tier 2 / Hapke-roughness-smoothing edits were thrown away. Net change vs wip: 3 files, +62/−5 lines (post-fix: +87/−5 lines after the M1 correction below).

### Critical-review fixes (post-reset)

Two parallel sub-agents reviewed the surgical change. Findings:

**M1 (shader review, real bug)**: `reflectedLight.directDiffuse *= moonSunVisibility` ran AFTER three.js's `<lights_fragment_begin>` accumulator had already summed contributions from BOTH directional lights — the sun on `directionalLights[0]` AND earthshine on `directionalLights[1]` (the moon mesh enables `MOON_REFLECTED_LIGHT_LAYER`). When visibility goes to 0 on the dark side, earthshine was getting clobbered too — exactly on crescent phases where earthshine peaks per the existing phase-modulated wiring.

**Fix**: reconstruct the sun's contribution explicitly using three.js's standard Lambert form, then apply visibility as a delta on just that piece:

```glsl
float moonNdotL = clamp( dot( moonNormal, moonLightDir ), 0.0, 1.0 );
// ... visibility computation ...
vec3 moonSunDirectContribution = moonNdotL * directionalLights[0].color
                               * RECIPROCAL_PI * material.diffuseColor;
reflectedLight.directDiffuse += moonSunDirectContribution * (moonSunVisibility - 1.0);
```

When `visibility == 1`: delta = 0, no change. When `visibility == 0`: delta = `−sunContribution`, cancelling the sun's contribution while leaving earthshine intact. Cache key bumped: `v20-soft-disk → v21-soft-disk-sun-only`.

**Physics gap (physics review, scope honesty)**: the implementation uses `f_geom(t)` as a multiplier, which produces `t · f_geom(t)` on the lit side and 0 on the dark side. The full disk-source irradiance is

> S(t) = t · f_geom(t) + (2/(3π)) · (1 − t²)^{3/2}

(see [Solar Disk Physics](../../research/moon-rendering/01-solar-disk-physics.md), section 2.6 and Appendix B). The symmetric `(2/(3π))(1-t²)^{3/2}` "disk-glow" term lifts the dark side just past the terminator and is purely additive on Lambert; it cannot be expressed as a multiplier on Lambert (which is 0 there). An earlier "rescale + add-back" attempt produced "cement band" artifacts from per-pixel uniform glow on the dark side, so this term is omitted.

The shader comment was rewritten to be honest about this scope limit, and a `NOTE on physics scope` paragraph cites the report sections explicitly.

**Test gap**: text-match assertions cannot catch typos in `MOON_SUN_SIN_ALPHA = 0.00466` or sign errors in the closed-form integral. Added `test/moon-sun-disk-visibility.test.js` (7 numeric tests) that ports the formula to JS and checks canonical points (h = ±1, ±0.5, 0), the symmetry identity `f(h) + f(-h) = 1`, monotonicity across the band, and that `MOON_SUN_SIN_ALPHA` matches `sin(0.267°)` to 4 sig figs.

**Out of scope (not addressed by this change, intentional)**:

- Disk-glow additive term S(t) − Lambert(t) on the dark side
- Cast-shadow penumbra integration (the existing horizon march is binary)
- Earthshine as an extended Earth-disk source (Earth subtends ~1.9° from the Moon — bigger than the Sun)
- The visible artifacts the user complained about (banding, white rims, flat lit hemisphere) — both reviewers confirmed these are LS-clamp / normal-map / tone-curve issues unrelated to the Sun's angular size, and would require separate work on a different branch.

Net change vs wip: 3 source files +87/−5, plus 1 new test file (~85 lines). 1023 unit tests pass (was 1016, +7 from the new file).

The lone retained change:

```glsl
// In <common> injection
const float MOON_SUN_SIN_ALPHA = 0.00466;
const float MOON_INV_PI        = 0.31830988618;
float moonSunDiskVisibleFraction(float rawNdotL) {
    float h = rawNdotL / MOON_SUN_SIN_ALPHA;
    if (h >=  1.0) return 1.0;
    if (h <= -1.0) return 0.0;
    float s = sqrt(max(1.0 - h * h, 0.0));
    return MOON_INV_PI * (1.5707963267948966 + asin(h) + h * s);
}

// At top of <lights_fragment_begin>
float moonSmoothRawNdotLForVis = dot( normalize( nonPerturbedNormal ), moonLightDir );
float moonSunVisibility = moonSunDiskVisibleFraction( moonSmoothRawNdotLForVis );
reflectedLight.directDiffuse *= moonSunVisibility;
```

This is the actual answer to the original question ("Are we considering that the Sun is about half a degree angular diameter when seen from the Moon?"). Visibility is gated by the SMOOTH (un-perturbed) normal so per-pixel normal-map noise can't lift the dark side.

Cache keys: `moon-photometric-v19 → v20-soft-disk` (and `moon-render-tuner-v1 → v2-soft-disk`).

Tests: 171 files / 1016 tests pass. Cache-key assertion bumped; new assertions check the helper function and the rescale line are present.

---

| Item | Status |
|---|---|
| **Reset to wip + smooth-disk only** | ✅ `done` (current branch state) |
| **Tier 1 — direct fixes** | `discarded` (reverted in reset) |
| Tier 1 A — bump LS blend, relax clamps | ✅ `done` |
| Tier 1 B — unify terrain-band gates | ✅ `done` |
| Tier 1 C — audit color-space pipeline | ✅ `done — clean, no changes` |
| **Phase 1 follow-up — amplitude tuning** | ✅ `done` |
| Phase 1 A — monotone cavity AO | ✅ `done` |
| Phase 1 B — reduce terrainShadowStrength | ✅ `done` |
| Phase 1 C — reduce lsClampMax | ✅ `done` |
| **Tier 2 — photometric upgrade** | `awaiting visual A/B` |
| Tier 2 D — lunar-Lambert L(g) | ✅ `done` |
| Tier 2 E — Hapke SHOE opposition | ✅ `done` |
| Tier 2 F — Earthshine secondary light | ✅ `done — already wired correctly` |
| Tier 1+2 verification — unit tests | ✅ `done — 1016/1016 pass` |
| Tier 1+2 verification — visual A/B | `awaiting user` |
| **Tier 3 — crater shadows** | `not-started` |
| Tier 3 G — slope-vs-Sun-elevation test | `not-started` |
| Tier 3 H — LOD displacement boost | `not-started` |

## Cross-cutting findings (research consensus)

1. `moonSunDiskVisibleFraction` is correct and ahead of the field. Stellarium / Celestia / NASA Eyes / Cesium / WorldWind don't bother with finite-disk Sun visibility; only SpaceEngine / Elite / MSFS do, in the same form we have. **Keep.**
2. Smooth-vs-perturbed normal split is the textbook decomposition (Heitz 2014, PBRT). Smooth normal for visibility, perturbed for Lambert. **Keep.**
3. "Lit hemisphere looks flat" is the Lambert problem. Real Moon disc is roughly uniform-brightness at full phase due to single-scattering from optically-thick low-albedo regolith. Current `lsBlend = 0.20` clamped `[0.74, 1.0]` neutralizes the LS contribution.
4. "Banding at terminator" is from three independent `smoothstep` thresholds (`0.025/0.32`, `0.018/0.10`, `0.24/0.42`) producing concentric arcs.
5. Opposition surge `pow(phaseAlignment, 18) × 0.0023` is ~200× too small per Hapke. Replace with SHOE form.
6. Earthshine not modeled.
7. Cast-shadow march constrained by intentionally compressed displacement (~7000× compression).

## Caveats

- All three research agents had `WebSearch`/`WebFetch` denied in their environment. Math derivations are first-principles verifiable; specific numerical constants (Hapke parameters from Sato 2014, Hillier 1999, Wada 2024) and source-code identifiers (Stellarium / Celestia function names, exact shader paths) should be cross-checked before being baked in as authoritative values.
- The "displacement is 7000× compressed" caveat means cast-shadow physics doesn't fire under physically-correct math; we keep the noise-threshold approach.

---

## Tier 1 — Direct fixes for visible artifacts

Targeted at the user's two complaints: (a) flat lit hemisphere, (b) banding parallel to the terminator. Lowest risk, fastest signal.

### Tier 1 A — bump LS blend, relax clamps

**Problem:** `lsBlend = 0.20` with clamp `[0.74, 1.0]` makes Lommel-Seeliger nearly invisible. The clamp blocks limb brightening (`scale > 1`) and most sub-solar darkening (`scale < 0.74`). Result: the moon looks like a Lambert sphere ("billiard ball / puffy") instead of the uniform-brightness disc real photographs show.

**Reference:** Celestia's `LunarLambert k = 0.5` (techniques survey §5.2, §13.1; BRDF report §17).

**Changes:**

| File | Setting | Old | New |
|---|---|---|---|
| `moon-renderer.js` `DEFAULT_MOON_RENDER_SETTINGS` | `lommelSeeligerBlend` | `0.20` | `0.50` |
| `moon-renderer.js` `DEFAULT_MOON_RENDER_SETTINGS` | `lsClampMin` | `0.74` | `0.50` |
| `moon-renderer.js` `DEFAULT_MOON_RENDER_SETTINGS` | `lsClampMax` | `1.0` | `2.0` |
| `moon-render-asset-profiles.js` `DEFAULT_FAST_MOON_RENDER_SETTINGS` | `lommelSeeligerBlend` | `0.20` | `0.50` |
| `moon-render-asset-profiles.js` `DEFAULT_FAST_MOON_RENDER_SETTINGS` | `lsClampMin` | `0.76` | `0.50` |
| `moon-render-asset-profiles.js` `DEFAULT_FAST_MOON_RENDER_SETTINGS` | `lsClampMax` | `1.0` | `2.0` |
| `moon-render-asset-profiles.js` `DEFAULT_QUALITY_MOON_RENDER_SETTINGS` | `lommelSeeligerBlend` | `0.20` | `0.50` |
| `moon-render-asset-profiles.js` `DEFAULT_QUALITY_MOON_RENDER_SETTINGS` | `lsClampMin` | `0.74` | `0.50` |
| `moon-render-asset-profiles.js` `DEFAULT_QUALITY_MOON_RENDER_SETTINGS` | `lsClampMax` | `1.0` | `2.0` |

Existing shader formula stays intact; only the parameter values change.

**Expected effect:**
- Sub-solar regions ~25% darker (`mix(1, 0.5, 0.5) = 0.75`).
- Mid-disk unchanged.
- Limb regions up to ~50% brighter (`mix(1, 2.0, 0.5) = 1.5`).

This is the canonical "Moon doesn't look like a Lambert sphere" fix.

### Tier 1 B — unify terrain-band gates

**Problem:** three independent `smoothstep` band gates produce concentric arcs at their misaligned upper edges:

```glsl
float moonTerrainReliefBand = 1.0 - smoothstep(0.025, 0.32, moonSmoothNdotL);
float moonCavityBand = smoothstep(0.018, 0.10, moonSmoothNdotL)
    * (1.0 - smoothstep(0.24, 0.42, moonSmoothNdotL));
float moonTerrainShadowBand = moonTerrainReliefBand * pow(1.0 - moonSmoothNdotL, 1.4);
```

**Reference:** techniques survey §13.2 — Parallax uses one shared band so all effects transition together.

**Changes:** define a single shared near-terminator weight and route all three terrain effects through it:

```glsl
// One shared near-terminator weight. Smoothly rises from 0 at the geometric
// terminator, peaks across the mid-near-terminator zone, and tapers to 0
// across the lit hemisphere. All terrain-band effects gate against this.
float moonTerminatorGate = smoothstep(0.0, 0.50, moonSmoothNdotL);
float moonNearTerminatorWeight = 4.0 * moonTerminatorGate * (1.0 - moonTerminatorGate);

// Replace the per-effect band variables with this shared weight (or a
// simple monotone falloff for the relief darkening, which doesn't need a peak).
float moonTerrainReliefBand = 1.0 - moonTerminatorGate;        // for relief darkening
// moonCavityBand → moonNearTerminatorWeight  (same for cavity AO)
// moonTerrainShadowBand → moonNearTerminatorWeight × pow(1.0 - moonSmoothNdotL, 1.4)
```

All effects now share `moonTerminatorGate` so they cross over together — no concentric arcs.

**Expected effect:** the visible "ring" or "band" inside the terminator goes away. Effect strengths may need re-tuning since each was tuned against its own band shape; do that empirically.

### Tier 1 C — audit color-space pipeline

**Reference:** techniques survey §13.1 (item 4).

**Checks:**
1. Color map (`scene.moonMap`) loaded with `colorSpace = THREE.SRGBColorSpace`.
2. Displacement map (`scene.moonDisplacementMap`) with `colorSpace = THREE.NoColorSpace` (or default `LinearSRGBColorSpace`).
3. Generated normal map with `colorSpace = THREE.NoColorSpace`.
4. Renderer's `outputColorSpace` is `THREE.SRGBColorSpace` (so the linear pipeline is sRGB-encoded only at the final step).
5. Tonemap — `THREE.ACESFilmicToneMapping` is fine; verify exposure isn't crushing midtones.

If anything is wrong here, the rest of the photometric tuning is doing fixed work against a moving baseline.

### Tier 1 verification

After A + B + C:
- Run `npx vitest run test/moon-renderer.test.js test/moon-render-asset-profiles.test.js test/moon-render-profile-actions.test.js`
- Reload `http://localhost:7275/mission.html?mission=chandrayaan3` and `?moonRenderProfile=quality`
- Compare against `wip/moon-render-terminator-isolation` baseline on port 7274
- Document outcome in this plan doc

---

## Tier 2 — Substantive photometric upgrade

Only after Tier 1 ships and we've identified what Tier 1 doesn't address.

### Tier 2 D — lunar-Lambert L(g) blend

Replace the clamped LS blend with McEwen 1996 lunar-Lambert formulation:

```
f = 2L(g)·μ₀/(μ₀+μ) + (1−L(g))·μ₀
L(g) = clamp(1 − 0.019·g − 0.000242·g² + 0.00000161·g³, 0, 1)
```

CPU computes `L(g)` once per frame from sun-moon-camera geometry, passes as uniform.

### Tier 2 E — Hapke SHOE opposition

Replace `pow(phaseAlignment, 18) * 0.0023` with:

```
B(g) = B₀ / (1 + tan(g/2)/h_S),  B₀ ≈ 1.5–2.0,  h_S ≈ 0.07
```

### Tier 2 F — Earthshine secondary light

Add second directional light from Earth's direction (already known to scene), Lambert fill weighted by Earth's albedo (~0.30) and angular size (~1.9°). Bluish tint.

---

## Tier 3 — Crater shadow improvements

### Tier 3 G — slope-vs-Sun-elevation horizon march

Replace noise-threshold `smoothstep(0.00015, 0.0014, horizonRise)` with physical slope test:

```glsl
float localSlope = (sampleHeight - baseHeight) / sampleDistanceInUv;
float sunSlopeRequired = moonLightTangent.z / moonLightTangentPlanarLength;
float shadow = smoothstep(sunSlopeRequired, sunSlopeRequired * 1.4, localSlope);
```

Naturally scales with displacement magnitude.

### Tier 3 H — LOD displacement boost

Increase `displacementScale` 5–20× when camera is < 5,000 km from moon center. Exaggeration invisible at long range; produces real shadow at low altitude.

---

## Progress log

### Tier 1 execution

**Tier 1A — bump LS blend, relax clamps** (commit-pending):
- `moon-renderer.js` `DEFAULT_MOON_RENDER_SETTINGS`: `lommelSeeligerBlend 0.20→0.50`, `lsClampMin 0.74→0.50`, `lsClampMax 1.0→2.0`.
- `moon-render-asset-profiles.js` `DEFAULT_FAST_MOON_RENDER_SETTINGS`: `lommelSeeligerBlend 0.20→0.50`, `lsClampMin 0.76→0.50`, `lsClampMax 1.0→2.0`.
- `moon-render-asset-profiles.js` `DEFAULT_QUALITY_MOON_RENDER_SETTINGS`: same triplet as fast.
- `test/moon-renderer.test.js`: updated `moonLsBlend` default assertion `0.20→0.50`.

**Tier 1B — unify terrain-band gates** (commit-pending):
- `moon-renderer.js` shader `<lights_fragment_begin>` injection: introduced shared `moonTerminatorGate = smoothstep(0.0, 0.50, moonSmoothNdotL)`, derived `moonNearTerminatorBand = 1.0 - moonTerminatorGate` (monotone) and `moonNearTerminatorPeak = 4.0 * gate * (1-gate)` (single-peaked at smoothNdotL ≈ 0.25).
- Removed the three per-effect smoothsteps (`moonTerrainReliefBand = 1.0 - smoothstep(0.025, 0.32, ...)`, `moonCavityBand = smoothstep(0.018, 0.10, ...) * (1-smoothstep(0.24, 0.42, ...))`, `moonTerrainShadowBand = ... * pow(1-smoothNdotL, 1.4)`).
- Local relief darkening now uses `moonNearTerminatorBand` (max at terminator, fades to 0 at smoothNdotL ≥ 0.50).
- Cavity AO now uses `moonNearTerminatorPeak` (max at smoothNdotL ≈ 0.25, fades at 0 and 0.50).
- Cast-shadow band now uses `moonNearTerminatorBand` (no separate pow falloff).
- Cache key bumped: `moon-photometric-soft-disk-v3 → v4`. Same in tuner: `moon-render-tuner-soft-disk-v3 → v4`.
- `test/moon-renderer.test.js`: replaced per-effect band assertions with assertions on the shared gate variables; added `not.toContain` guards against the old per-effect band names returning.
- `moon-render-tuner.js` mirrored the shader changes.

**Tier 1C — color-space audit** (no changes):
- `moonMap` → `SRGBColorSpace` ✓ (`texture-loader.js:111` via `setColorTextureSpace`)
- `moonDisplacementMap` → default linear ✓ (correct for height data)
- Generated normal map (`DataTexture` with `HalfFloatType`) → default `NoColorSpace` ✓ (correct for normal data)
- Renderer `outputColorSpace` → `SRGBColorSpace` ✓ (`scene-handler-init.js:37`)
- Tonemap → `ACESFilmicToneMapping`, `toneMappingExposure = 1.14` ✓
- No fixes required.

**Verification**:
- `npm run test:unit`: 171 files / 1016 tests pass / 31 skipped — all green.
- Dev server (port 7275) confirmed serving updated shader source.
- Visual A/B against parent worktree on port 7274 awaiting user inspection.

### Critical correction — restore Hapke macroscopic-roughness smoothing

User feedback after Phase 1 + Tier 2: "I don't see any difference at all" and shared two images — current branch vs master. Master looks substantially smoother across the terminator zone.

**Diagnosis**: deleting `moonFinalShadowCrush` (the very first cleanup, item from the strip-list before Tier 1A) was a mistake. Among all the deleted "patches", that one was structurally different — it wasn't a tone curve, it was an outgoing-light smoothing pass `mix(0.18, 1.0, smoothstep(0.045, 0.22, smoothNdotL))` that ramped brightness gradually across the near-terminator zone. Without it, every band-effect's amplitude becomes visible as a step-shaped edge — which is the band the user keeps seeing.

There IS a defensible physical motivation: real lunar regolith has Hapke macroscopic roughness θ-bar ≈ 23° that smooths the brightness profile near the terminator. The crush is a coarse approximation of that effect (Hapke 2012 Ch. 10, Schmidt 2020 analytic).

**Restored** (commit-pending):

```glsl
// Macroscopic-roughness brightness ramp near the terminator.
float moonRoughnessSmoothing = mix( 0.18, 1.0, smoothstep( 0.045, 0.22, moonSmoothNdotL ) );
outgoingLight *= moonFinalTerrainTone * moonRoughnessSmoothing;
```

- Cache key: `v6 → v7`. Same in tuner.
- Test cache-key assertion bumped.

This restores master's smooth terminator gradient while keeping all of Tier 1+2 (LS blend up, unified gates, monotone cavity AO, reduced strengths, McEwen L(g), Hapke SHOE) on top.

### Phase 1 amplitude tuning execution

User feedback after first Tier 1: "Visual inspection. Band is NOT gone. White crater rims still exist." Diagnosis:
- Tier 1B aligned the band-effect *transitions*, but didn't change their *amplitudes*. With `terrainShadowStrength = 2.2`, near-terminator effects darkened up to ~80% of nominal — visible as a band even with a single shared gate.
- Tier 1A's `lsClampMax = 2.0` boosted LS limb-amplification by up to 50% on low-NdotL pixels, making perturbed-normal crater rim catches read as "white".
- Cavity AO had a parabolic peak (`4·g·(1-g)`) creating a darker zone at smoothNdotL ≈ 0.25 — physically unmotivated; cavity AO should fire *across the lit hemisphere*, not peak at one latitude.

**Phase 1A — monotone cavity AO** (commit-pending):
- Replaced `moonNearTerminatorPeak = 4 * gate * (1-gate)` with `moonCavityActive = smoothstep(0.0, 0.10, smoothNdotL)` — ramps up across [0, 0.10] then stays at full across the lit hemisphere.
- Cavity AO no longer creates a darker zone centered at one latitude.
- Local relief darkening still uses `moonNearTerminatorBand` (max at terminator, fades to 0 at smoothNdotL ≥ 0.50) — appropriate since micro-relief darkening *is* a grazing-light phenomenon.
- Cast shadow still uses `moonNearTerminatorBand`.
- Cache key bumped: `v4 → v5`. Same in tuner.
- Test updated to assert new gate variable and forbid the parabolic peak from returning.

**Phase 1B — reduce terrainShadowStrength**:
- `DEFAULT_MOON_RENDER_SETTINGS`: `2.2 → 1.0`
- `DEFAULT_FAST`: `1.8 → 0.8`
- `DEFAULT_QUALITY`: `2.2 → 1.0`
- Test updated to assert `1.0`.
- Effect: near-terminator darkening reduced from ~80% to ~30%.

**Phase 1C — reduce lsClampMax**:
- All three default settings: `lsClampMax 2.0 → 1.4`.
- LS limb amplification at low NdotL capped at 1.4× scale → `mix(1, 1.4, 0.50) = 1.2×` boost (vs 1.5× before).

### Tier 2 execution

**Tier 2D — lunar-Lambert L(g)** (commit-pending):
- Added phase angle computation in shader: `cosPhase = dot(L, V)`; `phaseDeg = degrees(acos(cosPhase))`.
- Added McEwen 1996 polynomial: `L(g) = clamp(1 - 0.019g - 0.000242g² + 0.00000161g³, 0, 1)` — `L(0°)=1`, `L(30°)=0.26`, `L(>~50°)=0`.
- The user's `uMoonLsBlend` is now multiplied by `L(g)` to produce `moonEffectiveLsBlend`.
- At full phase: full LS strength (limb-brightening visible, cancels Lambert's puffy look).
- At quarter phase: ramps to pure Lambert (real Moon is Lambertian at this phase).
- This addresses the "brown limb tint" you noticed (LS limb-amp at quarter phase will fade out).

**Tier 2E — Hapke SHOE opposition surge**:
- Replaced `pow(phaseAlignment, 18) × 0.0023` with the canonical Hapke 1986 form: `B(g) = B_0 / (1 + tan(g/2) / h_S)`.
- `tan(g/2)` derived from `cosPhase` without `acos`: `sqrt((1-cosPhase) / (1+cosPhase))`.
- New uniform: `uMoonOppositionWidth` (h_S, default `0.07`).
- Existing uniform `uMoonOppositionStrength` repurposed as B_0 (default bumped from `0.0023 → 1.0`).
- At full phase (g=0): brightening factor = `1 + 1.0 / 1.0 = 2.0×` (~100% brightening — strong but physically grounded).
- At quarter phase (g=90°): `tan(45°) = 1`, factor = `1 + 1/(1 + 14.3) = 1.065×` (negligible).
- Wider, narrower-shaped surge than the previous pow approximation.
- Wired through JS-side: `oppositionWidth` added to `DEFAULT_MOON_RENDER_SETTINGS`, `DEFAULT_FAST`, `DEFAULT_QUALITY`, `mergeRenderSettings`, `applyMoonRenderSettingsToMaterial`, `applyMoonPhotometricShader` (uniform + fallback), `customProgramCacheKey`, `refreshMoonShaderUniforms`.
- Tuner: state, controls (slider added with range `[0.005, 0.30]`), shader injection, uniform updater all mirrored.
- Tests updated: oppositionStrength `0.0023 → 1.0`; new oppositionWidth assertion `0.07`.

**Tier 2F — Earthshine secondary light**:
- Verified existing wiring; no changes needed.
- `LightManager.earthshineLight`: `THREE.DirectionalLight(0x9fb2d8, 0.02)` on layer `MOON_REFLECTED_LIGHT_LAYER` (4).
- Moon container has the layer enabled recursively (`primary-secondary-bodies-actions.js:76`).
- Camera enables the layer (`scene-render-layers.js:10`).
- Phase-dependent intensity scaling already wired in `animation-3d-controller.js:280-287` with `EARTHSHINE_PHASE_EXPONENT = 1.8`.

**Cache key**: `moon-photometric-soft-disk-v5 → v6`. Tuner: `v6`.

### Verification (Phase 1 + Tier 2)

- `npm run test:unit`: 171 files / 1016 tests pass / 31 skipped — all green.
- Dev server (port 7275) confirmed serving v6 shader with `moonPhasedLsCoef`, `moonHalfTanPhase`, `moonCavityActive`.

### Open questions / next steps

If Tier 1 visual A/B reveals:
- **Lit hemisphere now too brightly limb-brightened** → reduce `lsClampMax` from 2.0 toward 1.5 or reduce blend from 0.50 toward 0.40.
- **Sub-solar regions feel too dim** → raise `lsClampMin` from 0.50 toward 0.65 or raise opposition strength.
- **Banding still visible** → adjust `moonTerminatorGate`'s upper bound `0.50` toward `0.65` (wider transition zone) or apply the band-share to additional effects.
- **Terminator zone effects (cavity AO, relief) too weak/strong** → tune `terrainShadowStrength` (currently 2.2 quality / 1.8 fast) or revisit individual strengths now that the band shape is shared.
- **Crater shadows on lit side missing** → escalate to Tier 3G (slope-vs-Sun-elevation horizon march).
- **All looks acceptable** → consider Tier 2 substantive upgrades (lunar-Lambert, Hapke SHOE, Earthshine) only if there's a concrete unmet need.
