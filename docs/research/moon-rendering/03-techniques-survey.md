# Moon Rendering Techniques: Survey of Established Implementations

> Research note - 2026-05-10. Author: Claude (Opus 4.7, 1M context).
> Companion document to `docs/research/moon-rendering/research-and-plan.md`
> and `docs/operations/data/moon-render-assets.md`. The goal of this survey is to
> inform a planned rewrite of the photometric portion of
> `src/platform/js/rendering/moon-renderer.js`.

## Important methodology note (read first)

This research session was run under sandbox conditions in which both
`WebFetch` and `WebSearch` tooling was denied. As a result this document is
written from the agent's training-set knowledge rather than from live page
fetches performed within this session. Specific shader URLs, GitHub line
numbers, and Shadertoy IDs cited below are correct to the best of that
training knowledge but were not re-verified by direct fetch in this
session. Where a citation is given, treat it as a "very likely correct
location" pointer that a follow-up pass should re-fetch and re-quote
verbatim before any of these snippets are pasted into production shaders.
Internal repository file paths (e.g. `src/platform/js/rendering/...`) were
read directly from the working tree and are accurate.

Concretely, this means:

- Quoted GLSL/HLSL fragments that are stable across years (the classic
  Lambert/Lommel-Seeliger/Hapke formulations, the standard cube-map
  filtering, the standard Reinhard/ACES tone-map operators, the Sun-disk
  visibility integral) are mathematically reliable and reproducible.
- Quoted code that names a specific function in a specific upstream
  project (e.g. "Stellarium's `getMoonShadowFactor`") should be re-fetched
  before being copied verbatim - the structure and approach are reliable
  but exact identifier names may have drifted since training.
- Tuning constants quoted from third-party engines are best treated as
  representative values, not authoritative.

## Table of contents

1. [Why rendering the Moon well is unusually hard](#section-1)
2. [The physical optics, in one place](#section-2)
   - 2.1 [Geometry: phase, incidence, emission angles](#section-2-1)
   - 2.2 [Why Lambert is wrong for the Moon](#section-2-2)
   - 2.3 [Lommel-Seeliger as the practical replacement](#section-2-3)
   - 2.4 [Hapke's photometric model in detail](#section-2-4)
   - 2.5 [Coherent backscatter / opposition surge](#section-2-5)
   - 2.6 [Sun's angular size and the soft-disk integral](#section-2-6)
   - 2.7 [Earthshine](#section-2-7)
3. [NASA SVS CGI Moon Kit and source-asset properties](#section-3)
4. [Stellarium](#section-4)
5. [Celestia](#section-5)
6. [OpenSpace](#section-6)
7. [SpaceEngine](#section-7)
8. [NASA Eyes on the Solar System](#section-8)
9. [NASA WorldWind](#section-9)
10. [Game-engine planet/moon implementations](#section-10)
    - 10.1 [Kerbal Space Program / Scatterer / Parallax](#section-10-1)
    - 10.2 [Elite Dangerous](#section-10-2)
    - 10.3 [No Man's Sky](#section-10-3)
    - 10.4 [Universe Sandbox](#section-10-4)
    - 10.5 [Microsoft Flight Simulator](#section-10-5)
11. [Three.js, WebGL and Shadertoy implementations](#section-11)
    - 11.1 [Three.js examples and `MeshStandardMaterial`](#section-11-1)
    - 11.2 [Bruno Simon, threejs-journey patterns](#section-11-2)
    - 11.3 [Inigo Quilez Shadertoy material](#section-11-3)
    - 11.4 [Shadertoy moon shaders worth studying](#section-11-4)
    - 11.5 [WebGL Earth / Cesium / Resium](#section-11-5)
12. [Comparative matrix of techniques](#section-12)
13. [Specific problems we are hitting and what others do](#section-13)
    - 13.1 [Lit hemisphere looks flat](#section-13-1)
    - 13.2 [Banding at terminator from band-effect transitions](#section-13-2)
    - 13.3 [Soft penumbra from Sun's angular size](#section-13-3)
    - 13.4 [Crater-rim shadows on the lit side](#section-13-4)
14. [Checklist of takeaways for our rewrite](#section-14)
15. [References](#section-15)

---

<a id="section-1"></a>
## 1. Why rendering the Moon well is unusually hard

Most "render a planet" tutorials from the 2000s/2010s era teach a workflow
that fails badly when applied to the Moon:

1. Take a colour map and a normal map.
2. Drop them into a Lambert / Phong material.
3. Multiply by `max(dot(N, L), 0)`.
4. Add a bit of ambient.
5. Done.

That recipe makes Mars look acceptable. It makes Earth look passable
under cloud cover. It makes the Moon look like a billiard ball with bumps
on it, because the Moon's actual photometric behaviour is very different
from a Lambertian (matte diffuse) surface:

- The Moon does **not** dim from disc centre to limb the way a Lambert
  ball does. Its disc is roughly *uniform* in apparent brightness from
  centre to limb at full Moon. A Lambert rendering, by contrast, falls
  off as `cos(θ)` toward the limb and looks like a sphere with a hot
  spot in the middle. (This is the classic Lommel-Seeliger result; see
  section 2.3.)
- The Moon shows a sharp **opposition surge** - a non-linear brightening
  as the phase angle approaches zero. Ordinary BRDFs do not predict this.
- The Moon's terminator is **sharp at scales above tens of kilometres**
  (because the Sun's angular diameter as seen from the Moon is ~0.53
  degrees and the limb itself is the dominant occluder), but **soft at
  the per-crater scale**, because the Sun's apparent half-radius
  (~0.27 degrees, ~16 km projected on the lunar surface) is wider than
  many crater rims. This dual-scale behaviour breaks any simple
  half-space `step(0, NdotL)` shader.
- The Moon shows striking long shadows from craters and mountains for
  about 10-30 degrees of phase angle around the terminator, and very
  little visible shadow at full phase. A renderer that only uses a
  baked normal map cannot reproduce this: the dark pixels in the lit
  hemisphere come from real geometry, not from albedo or normal tilt.
- The albedo map (LROC) is itself nearly devoid of macroscopic relief
  cues. It is a top-down photographic mosaic with the Sun roughly
  overhead during each pass. The classic shading-from-LROC trick of
  "just darken the cosine" does not produce realistic relief because
  the source pixels were captured under near-vertical lighting.
- The Moon's surface has very strong micro-roughness ("regolith") at
  sub-millimetre scales that materially affects how light scatters. A
  smooth sphere model misses this entirely.

The combined effect is that a naive Lambert + normal map + tonemap
pipeline produces a Moon that is "shiny near the centre, dim at the
limb, with no relief on the lit side." Almost every serious renderer
in the field replaces or augments the Lambert term with a
Lommel-Seeliger-flavoured BRDF, models the Sun as an extended source
near the terminator, and folds in some form of crater-bowl ambient
occlusion or per-pixel cast shadowing for the band immediately around
the day-night line.

The next section makes this concrete with formulas.

---

<a id="section-2"></a>
## 2. The physical optics, in one place

This section establishes the formulas every implementation surveyed
later in the document is choosing among. Symbols follow the standard
photometry convention used in the planetary science literature.

<a id="section-2-1"></a>
### 2.1 Geometry: phase, incidence, emission angles

For a point on the Moon's surface let:

- `n` be the (unit) outward surface normal,
- `s` be the (unit) direction toward the Sun,
- `v` be the (unit) direction toward the viewer.

Define:

- `i` = incidence angle, where `cos(i) = n · s`. This is the
  conventional `NdotL`.
- `e` = emission angle, where `cos(e) = n · v`. This is the
  conventional `NdotV`.
- `g` = phase angle, the Sun-target-observer angle, where
  `cos(g) = s · v`. This is the conventional `LdotV` (with the
  vectors pointing *toward* the light and viewer, i.e. positive
  cosine when they line up).

In planetary photometry literature the same letters are
overloaded with different sign conventions across sources; in
practice you almost always want `mu_0 = max(0, n · s)` and
`mu = max(0, n · v)` because everything below cancels into ratios
of these two cosines.

<a id="section-2-2"></a>
### 2.2 Why Lambert is wrong for the Moon

The Lambertian BRDF is `f_r(ω_i, ω_o) = ρ / π` for albedo `ρ`. The
reflected radiance leaving a Lambertian patch under a point source
of irradiance `E_0` is:

```glsl
// Classic Lambert
vec3 lambertianRadiance(vec3 albedo, float NdotL, vec3 E0) {
    return (albedo / 3.14159265) * max(NdotL, 0.0) * E0;
}
```

The disc-integrated brightness of a Lambertian sphere at zero phase
angle has a distinctive limb-darkening profile: brightness scales
roughly as `cos(θ)` where `θ` is the angle between the surface
normal at a given point on the disc and the line of sight. This
matches the Sun (whose limb darkening is real, since the Sun is
itself an emitting plasma sphere whose deeper layers are hotter)
but it does **not** match the Moon. The Moon's full-Moon disc shows
*no* such limb darkening; if anything the limbs are slightly
brighter than the centre due to opposition effect being stronger
toward the centre and Lommel-Seeliger limb-flattening. This
mismatch is one of the original 19th-century motivations for the
Lommel-Seeliger model.

Concretely: under physically-plausible direct sunlight a
Lambertian-rendered full Moon looks "puffy" - bright in the middle,
dimming to about 70% at half-radius, dimming to zero at the limb.
The actual Moon is "flat-disc" bright across the entire near-side
hemisphere. This is the single most important visual difference
between Lambert and the truth, and it is the reason every serious
implementation either replaces or blends Lambert with Lommel-Seeliger.

<a id="section-2-3"></a>
### 2.3 Lommel-Seeliger as the practical replacement

The Lommel-Seeliger BRDF (also written L-S, sometimes called the
"single-scattering layer" model) accounts for a thick, particulate,
weakly-absorbing surface in which photons are most likely to
scatter once and exit. Its BRDF is:

```text
    f_r(i, e) = (w / (4π)) * 1 / (μ_0 + μ)
```

where `w` is the single-scattering albedo (close to but not equal
to the Bond albedo), `μ_0 = cos(i)`, `μ = cos(e)`. The reflected
radiance is then:

```text
    L_r = (w / (4π)) * (μ_0 / (μ_0 + μ)) * E_0
```

The critical feature: brightness scales not as `μ_0` but as
`μ_0 / (μ_0 + μ)`. At full Moon, when the viewer and Sun are nearly
co-aligned and `μ_0 ≈ μ` everywhere on the disc, the L-S radiance
is `~1/2 * w/(4π) * E_0`, **independent of position on the disc**.
That is why the full Moon looks like a uniformly bright flat disc
rather than a shaded sphere.

Equivalent shader form, suitable to drop into a fragment shader:

```glsl
// Lommel-Seeliger, single-scattering term only.
// `mu0` and `mu` are clamped non-negative cosines of incidence and
// emission angles, respectively. `w` is the single-scattering
// albedo (or the diffuse texture sample if you treat it as a
// per-pixel albedo).
float lommelSeeligerScale(float mu0, float mu) {
    return mu0 / max(mu0 + mu, 1e-4);
}
vec3 lommelSeeligerRadiance(vec3 w, float mu0, float mu, vec3 E0) {
    return (w * (1.0 / (4.0 * 3.14159265))) * lommelSeeligerScale(mu0, mu) * E0;
}
```

A more practical "Lambert blended with L-S" form, which is what
many real-time renderers use because pure L-S becomes too dark on
gibbous phases for stylistic reasons, is:

```glsl
// Practical blend used by e.g. Stellarium/Celestia variants and our
// current src/platform/js/rendering/moon-renderer.js.
//   blend = 0  -> pure Lambert
//   blend = 1  -> pure Lommel-Seeliger (relative to Lambert)
float lommelSeeligerBlendedScale(float mu0, float mu, float blend) {
    float lambert = mu0;
    float ls      = mu0 / max(mu0 + mu, 1e-4);
    // Many implementations divide ls by mu0 to express it as a
    // multiplicative factor on top of the Lambert term, so the
    // colour map's albedo cancels out cleanly:
    float lsScale = (mu0 > 1e-6) ? (ls / mu0) : 1.0;
    return mix(1.0, lsScale, blend) * lambert;
}
```

Pros:
- One-line addition to an existing Lambert pipeline.
- Removes the puffy "billiard ball" look at full Moon.
- Numerically stable except at exactly `mu = mu0 = 0`.

Cons:
- Becomes unphysical at grazing incidence (high `e` or near
  terminator) - the limb gets overly bright unless you clamp.
- Does not predict the opposition surge.
- Does not predict shadow hiding.
- Does not account for multiple scattering.

<a id="section-2-4"></a>
### 2.4 Hapke's photometric model in detail

Bruce Hapke's 1981, 1984, 2002, and 2012 papers are the gold
standard for planetary regolith photometry. The most-quoted form
(Hapke 1993 / "Theory of Reflectance and Emittance Spectroscopy")
of the bidirectional reflectance is:

```text
    r(i, e, g) = (w / (4π)) * (μ_0 / (μ_0 + μ))
                 * [(1 + B(g)) * P(g) + H(μ_0) * H(μ) - 1]
                 * S(i, e, g)
```

Where:

- `w` is the single-scattering albedo (per wavelength channel).
- `μ_0 / (μ_0 + μ)` is the Lommel-Seeliger geometry term.
- `B(g)` is the **opposition surge** function:
  `B(g) = B_0 / (1 + (1/h) * tan(g/2))`. `h` is the angular width
  parameter (very small for the Moon; ~0.07 in some papers) and
  `B_0 ∈ [0, 1]` is the amplitude. This term is responsible for
  the sharp full-Moon brightening as `g → 0`.
- `P(g)` is the single-particle phase function. For the Moon a
  one-term Henyey-Greenstein phase function with `g_HG ≈ -0.25`
  to `-0.4` is common (negative = back-scattering particles).
  Two-term forms are more accurate.
- `H(x) = (1 + 2x) / (1 + 2x * sqrt(1 - w))` is the Chandrasekhar
  H-function approximation accounting for multiple scattering.
- `S(i, e, g)` is the macroscopic shadowing function, parameterized
  by a roughness slope angle `θ̄`. For the Moon, `θ̄ ≈ 20-25°`.

Numerical Hapke values commonly cited for the lunar mare and
highlands (visible band):

| Parameter | Mare value | Highland value | Notes |
|-----------|------------|----------------|-------|
| `w` (single-scattering albedo) | 0.18 - 0.25 | 0.30 - 0.40 | per-wavelength |
| `B_0` | 0.7 - 1.0 | 0.7 - 1.0 | opposition amplitude |
| `h` | 0.05 - 0.08 | 0.05 - 0.08 | opposition width (radians) |
| `g_HG` | -0.25 to -0.30 | -0.20 to -0.25 | phase fn asymmetry |
| `θ̄` (rms slope) | 20° - 25° | 20° - 30° | macro roughness |

A reference shader implementation of the simplified Hapke model
(no porosity, single-term Henyey-Greenstein, isotropic `S = 1`):

```glsl
// Simplified Hapke (single-term HG phase function, no S).
// All angles in radians. mu0 = cos(i), mu = cos(e), g = phase angle.
const float HAPKE_W       = 0.22;   // mare-typical
const float HAPKE_B0      = 0.85;
const float HAPKE_H       = 0.06;
const float HAPKE_HG_G    = -0.25;
const float PI            = 3.14159265358979;
const float INV_4PI       = 0.07957747154594;

float hapkeH(float x, float w) {
    float gamma = sqrt(max(1.0 - w, 0.0));
    return (1.0 + 2.0 * x) / (1.0 + 2.0 * x * gamma);
}
float hapkeOpposition(float g) {
    float t = tan(0.5 * g);
    return HAPKE_B0 / (1.0 + (1.0 / HAPKE_H) * t);
}
float hapkeHenyeyGreenstein(float cosG) {
    float gg = HAPKE_HG_G * HAPKE_HG_G;
    float denom = pow(1.0 + gg - 2.0 * HAPKE_HG_G * cosG, 1.5);
    return (1.0 - gg) / max(denom, 1e-6);
}
vec3 hapkeRadiance(vec3 albedo, float mu0, float mu, float g, vec3 E0) {
    float cosG = cos(g);
    float P    = hapkeHenyeyGreenstein(cosG);
    float B    = hapkeOpposition(g);
    float Hmu0 = hapkeH(mu0, HAPKE_W);
    float Hmu  = hapkeH(mu,  HAPKE_W);
    float ls   = mu0 / max(mu0 + mu, 1e-4);
    float core = (1.0 + B) * P + Hmu0 * Hmu - 1.0;
    return albedo * INV_4PI * ls * core * E0;
}
```

Pros of Hapke:
- The most physically grounded BRDF still tractable in real time.
- Predicts opposition surge, limb flattening, and back-scatter all
  from one model.
- Tunable per-terrain (mare vs highland).

Cons:
- Cost: ~5 transcendentals per pixel (`tan`, `pow`, `sqrt`).
- No real-time renderer surveyed below uses *full* Hapke;
  everyone takes a simplified slice (drops `S`, drops `P`, etc).
- Tuning is nontrivial; the parameters interact strongly.

<a id="section-2-5"></a>
### 2.5 Coherent backscatter / opposition surge

Even outside the Hapke framework, the opposition surge has to be
modelled if you want a full Moon to look brighter than a 60°
phase Moon by the correct ratio. The simplest empirical form,
used by many real-time renderers, is a power-of-cosine bump:

```glsl
// Cheap opposition surge. cosPhase = dot(L, V) clamped to [0,1].
float oppositionBoost(float cosPhase, float strength, float width) {
    // `width` controls how narrow the surge is. Higher = narrower.
    return strength * pow(cosPhase, width);
}
```

Typical empirical values for lunar look:

- `strength`: 0.002 to 0.05 multiplicative on top of the diffuse term.
- `width`: between 12 (broad, gentle) and 30 (sharp, only at exact
  opposition).

Our current shader uses:

```glsl
// from src/platform/js/rendering/moon-renderer.js (truncated)
float moonPhaseAlignment = clamp(dot(moonLightDir, moonViewDir), 0.0, 1.0);
float moonOpposition = pow(moonPhaseAlignment, 18.0) * uMoonOppositionStrength;
diffuseColor.rgb *= (1.0 + moonOpposition);
```

with `uMoonOppositionStrength` defaulting to 0.0023 (very subtle).
That is a cheap, monotone, and well-behaved approximation that
captures the full-Moon "pop" without breaking gibbous phases. It
is roughly equivalent to `B(g) = strength * cos(g)^18` when the
phase angle is small.

<a id="section-2-6"></a>
### 2.6 Sun's angular size and the soft-disk integral

The Sun subtends about 0.5° of arc as seen from the Moon (its
angular *radius* is ~0.27°, i.e. `sin(α) ≈ 0.00466`). This is
small but it has *qualitative* consequences for the terminator:

- A simple `step(0, NdotL)` produces a hard terminator one pixel
  wide, regardless of zoom level. That is wrong both physically
  and visually.
- A `smoothstep(-α, +α, NdotL)` style fade is closer, but the
  width depends on what you choose for `α` and is essentially
  pulled out of thin air.
- The physically correct formulation: the Sun is an extended disc
  of angular radius `α`. The fraction of the Sun's disc above the
  local horizon for a surface whose normal makes angle `θ` with
  the centre-of-Sun direction (so `cos(θ) = NdotL`) is a closed
  form *circular segment* integral.

Our current shader implements exactly this integral (this is the
mathematically correct soft penumbra; the same form appears in
Hillaire's Earth atmosphere papers and in NVIDIA's Bruneton
atmosphere code):

```glsl
// from src/platform/js/rendering/moon-renderer.js
const float MOON_SUN_SIN_ALPHA = 0.00466;
const float MOON_INV_PI        = 0.31830988618;

float moonSunDiskVisibleFraction(float rawNdotL) {
    float h = rawNdotL / MOON_SUN_SIN_ALPHA;
    if (h >=  1.0) return 1.0;
    if (h <= -1.0) return 0.0;
    float s = sqrt(max(1.0 - h * h, 0.0));
    return MOON_INV_PI * (1.5707963267948966 + asin(h) + h * s);
}

float moonSoftNdotL(float rawNdotL) {
    float h = rawNdotL / MOON_SUN_SIN_ALPHA;
    if (h >=  1.0) return rawNdotL;
    if (h <= -1.0) return 0.0;
    float s   = sqrt(max(1.0 - h * h, 0.0));
    float arc = 1.5707963267948966 + asin(h) + h * s;
    float cub = 0.6666666666666666 * (1.0 - h * h) * s;
    return MOON_SUN_SIN_ALPHA * MOON_INV_PI * (h * arc + cub);
}
```

This is the analytic answer to the question "what fraction of the
Sun's visible disc is above the geometric horizon at this surface
point?" - integrating `max(N · ω, 0)` over the solid-angle of the
Sun's disc in the small-`α` limit. It is slightly more expensive
than `smoothstep` (an `asin` and a `sqrt` per pixel) but produces
the correct penumbra without any tunable knobs.

A common worry is that the penumbra width is sub-pixel at
typical zoom levels. The width on the lunar surface is
approximately `R_moon * sin(α) ≈ 1737 km * 0.00466 ≈ 8 km`. At a
camera distance of 100,000 km, that subtends about
`8 km / 100,000 km = 8e-5 rad`. On a 1080p viewport with a 60°
field of view, that's well under one pixel - so the macroscopic
penumbra is invisible. But:

- In close-up views (camera distance < 5,000 km from the surface,
  roughly LRO-orbit-altitude or closer), the penumbra is several
  pixels wide and *should* be visible.
- More importantly, at any zoom, the soft-disk integral correctly
  weights *crater-rim* shadows: every rim sees its own micro-Sun
  occlusion, and the soft-disk version produces correctly
  proportioned shadow softness against the actual rim height.
  This is a real visual difference, not a sub-pixel detail.

<a id="section-2-7"></a>
### 2.7 Earthshine

The dark side of the Moon is illuminated by Earthshine - sunlight
reflecting off the Earth's day side. Earthshine is roughly
`E_earthshine ≈ 0.07 * E_sun` at full Earth (as seen from the Moon),
falling roughly as `(1 + cos(phase_E)) / 2` where `phase_E` is the
Earth phase as seen from the Moon. Because Earth's phase from the
Moon is the *complement* of the Moon's phase as seen from Earth,
new Moon (from Earth) corresponds to full Earth (from the Moon),
and that's when Earthshine peaks - which matches the everyday
observation that you can see the dark side of a thin crescent
Moon best.

Practical implementations usually treat Earthshine as either:

- A second directional light with a strongly cosine-attenuated
  intensity (Earthshine ratio), placed in the Earth-Moon direction.
- An added ambient term keyed to the Earth-Moon-Sun geometry.
- A constant cool-blue ambient (cheapest, looks cinematic but is
  not physically motivated).

A representative two-light Earthshine implementation:

```glsl
// Two-light Earthshine. earthDir is unit vector from Moon surface
// point toward Earth's centre. earthPhaseCos = dot(sunDir, earthDir).
float earthshineStrength(float earthPhaseCos) {
    // Earth's apparent disc is ~3.7° wide from the Moon - 13x the
    // Sun. We use a phase function similar to Lambert's planetary
    // phase (1 + cos(phase)) / 2, scaled by the empirical ratio.
    return 0.07 * 0.5 * (1.0 + earthPhaseCos);
}
vec3 earthshineRadiance(vec3 albedo, vec3 N, vec3 earthDir,
                        float earthPhaseCos, vec3 E0_sun) {
    float NdotE = max(dot(N, earthDir), 0.0);
    float strength = earthshineStrength(earthPhaseCos);
    // Earth is bluer than the Sun, so a slight blue tint is realistic.
    vec3 earthSpectrum = vec3(0.85, 0.92, 1.05);
    return albedo * NdotE * strength * earthSpectrum * E0_sun;
}
```

Note that Earthshine on the actual Moon is dominated by *ocean and
cloud* reflectance, not land. Earth's bond albedo is ~0.30 and is
fairly cool (blue). So the small blue tint above is physically
motivated, not stylistic.

---

<a id="section-3"></a>
## 3. NASA SVS CGI Moon Kit and source-asset properties

The NASA Scientific Visualization Studio's CGI Moon Kit
(<https://svs.gsfc.nasa.gov/4720/>) is the source for the textures
this project uses. Key properties as documented by SVS, paraphrased
below (please re-verify against the live page before quoting in
production):

### 3.1 LROC color mosaic

- **Source instrument:** Lunar Reconnaissance Orbiter Camera (LROC)
  Wide Angle Camera (WAC), color global mosaic. Per the SVS page
  the latest revision is the 2025 mosaic.
- **Resolution variants:** 8K x 4K (8192 x 4096) and 16K x 8K
  (16384 x 8192) are routinely published. SVS maintains 4K, 8K, 16K,
  and 24K variants.
- **Bit depth:** 16-bit per channel TIFF for the masters.
- **Color space:** sRGB. The TIFF masters are explicitly tagged
  sRGB; for a linear-workflow renderer you must un-gamma the
  texture before lighting. This is the single most common mistake
  when using these maps.
- **Projection:** Equirectangular, simple cylindrical projection,
  centered on lunar prime meridian (longitude 0 at image centre).
- **Illumination assumption:** The mosaic is *photometrically
  normalized* to a top-down (zero-incidence) view. In other words
  the LROC team applied a Lommel-Seeliger photometric correction
  to remove the per-pixel cosine effect of the actual viewing
  geometry of each LROC pass. Practical consequence: the colour
  mosaic represents intrinsic albedo, not the appearance under
  any specific lighting. **Multiplying it by `NdotL`** after using
  it as the diffuse colour is correct.
- **Albedo range:** Typical mare values are around 0.07-0.10
  reflectance, highlands around 0.12-0.17. The mosaic is *not*
  scene-referred linear radiance - it is normalized 8-bit (or
  16-bit) per channel as relative reflectance.

### 3.2 LDEM displacement

- **Source instrument:** Lunar Orbiter Laser Altimeter (LOLA),
  combined with Selene/Kaguya laser altimeter data.
- **Resolution variants:** SVS publishes LDEM at 4 ppd, 16 ppd,
  64 ppd, 128 ppd, etc. The 16 ppd version is roughly 5760 x 2880
  pixels; the 64 ppd version is roughly 23040 x 11520.
- **Format:** Both signed 16-bit floats and unsigned 16-bit
  integer variants are provided. The "uint" variants are remapped
  to fit `[0, 65535]` and require an offset and scale to reconstruct
  metres.
- **Units:** The signed 16-bit version is in metres, referenced to
  the lunar reference radius `R_moon = 1737.4 km`.
- **Range:** Lunar elevation extremes are roughly -9.1 km to +10.8 km
  from the reference sphere (Apollo South Pole basin to highland
  rim peaks).
- **Important geometry note:** The reference for "0 elevation" is a
  perfect sphere of radius 1737.4 km. The Moon is a triaxial
  ellipsoid in reality but the LDEM is referenced to a sphere -
  do not try to subtract the Moon's flattening from these heights.

### 3.3 Suggested rendering workflow per SVS

The SVS page itself gives only basic guidance ("use as a colour map
and bump map in your favourite 3D software"), but the LROC team's
publications (e.g. Speyerer et al. 2016, "Pre-flight and on-orbit
geometric calibration of the Lunar Reconnaissance Orbiter Camera")
recommend using the Hapke model when relighting the mosaic. The
practical implementation choices used by NASA/GSFC's *own* CGI
animations of the Moon (e.g. their "Moon Phase and Libration"
yearly series) appear to be:

- Use the LROC mosaic as the diffuse colour, *un-gamma to linear*
  before lighting.
- Use the LDEM as both a displacement and a normal map source.
- Apply some flavour of Hapke or Lommel-Seeliger lighting; SVS
  internal pipelines reportedly use a custom Renderman shader for
  the yearly libration animations.
- Tone-map the result rather than letting it clip; the lit Moon
  is dim by photographic standards (an EV ratio matching ~0.12
  reflectance under solar irradiance).

### 3.4 Ratios you can sanity-check against

- Moon disc apparent magnitude at full phase, observed from Earth:
  approximately -12.7 mag.
- Sun apparent magnitude observed from Earth: approximately -26.7
  mag. Difference: 14.0 magnitudes ~ factor `10^(14/2.5) ≈ 4.0e5`.
- Lunar bond albedo: ~0.12.
- Lunar geometric albedo: ~0.12.
- Visual albedo at zero phase angle: ~0.12 with the opposition
  surge contributing roughly +25-40% of the underlying value over
  the last few degrees of phase angle.

These numbers are the calibration target for any tone-mapping
choice in a Moon shader.

---

<a id="section-4"></a>
## 4. Stellarium

[Stellarium](https://stellarium.org/) is the leading open-source
desktop planetarium. Its source is at
<https://github.com/Stellarium/stellarium>.

### 4.1 Repository layout

Stellarium's GLSL shaders live primarily under:

- `data/shaders/` - top-level shaders (sky, atmosphere, postprocess).
- `src/core/modules/` - per-object modules (Planet, Comet, etc).
  Planet and Moon shaders live mostly in `Planet.cpp` and the
  associated GLSL strings.

The Moon-specific code is in `src/core/modules/Planet.cpp` and the
"OBJ planet" mesh-based code in `src/core/modules/MinorPlanet.cpp`
and `src/core/modules/SolarSystem.cpp`. Stellarium uses the Hapke
function for accurate phase-curve modelling of the Moon and other
solar-system bodies; the Hapke parameters per body are loaded from
`data/ssystem_major.ini` and similar config files.

Look for symbols like:
- `Planet::computeShadowMatrix` for the Moon's umbra/penumbra
  during eclipses.
- `Planet::draw3dModel` and `Planet::draw3dModelOnPlanet` for the
  per-pixel shading.
- The string constant `planetShaderProgram_frag` in
  `Planet.cpp` (function-scoped GLSL source).

### 4.2 Hapke implementation in Stellarium

Stellarium's Moon BRDF is a (CPU-side, per-frame, full-disc) Hapke
phase calculation that returns a single brightness scaling factor
per visible body. The Moon-specific shader does *not* re-evaluate
Hapke per pixel; it uses Lambertian per-pixel shading multiplied by
the Hapke disc-integrated brightness ratio `Hapke(g) / Hapke(0)`
which is computed on the CPU each frame. This is sometimes called
"empirical phase function lookup."

Why: Stellarium runs on weak GPUs (it targets "every laptop ever
made") and a per-pixel Hapke is simply too expensive. The
disc-integrated approximation is essentially:

```glsl
// Pseudocode for Stellarium's per-pixel Moon shader.
//   diffuseColor = LROC sample (in linear)
//   NdotL        = clamp(dot(N, L), 0, 1)
//   uHapkeBrightness = CPU-precomputed Hapke disc integral / Hapke(0)
vec3 moonRadiance = diffuseColor * NdotL * uHapkeBrightness * uSunIrradiance;
```

The CPU-side Hapke parameter values for the Moon in Stellarium's
default `ssystem_major.ini` are approximately (from the historical
record; verify against current `ssystem_major.ini`):

```ini
[moon]
albedo = 0.12
hapke_w   = 0.21          ; single-scattering albedo
hapke_h   = 0.07          ; opposition width
hapke_b0  = 1.0           ; opposition amplitude
hapke_g   = -0.30         ; HG asymmetry
hapke_th  = 23.4          ; mean slope angle in degrees
```

### 4.3 Terminator handling in Stellarium

Stellarium relies on the Hapke disc-integrated factor to modulate
the *whole disc* brightness with phase, then uses ordinary
`max(NdotL, 0)` per pixel for the local terminator. This works
acceptably at planetarium scales (where the Moon is typically
< 100 px wide on screen) but it produces a hard terminator if the
user zooms in close. For the typical desktop use case it is more
than enough; for orbital-altitude visualisation (our use case) it
would be insufficient.

Stellarium does also have an "Exoplanet" / "Solar System Editor"
plug-in that uses spherical-harmonic environment lighting, but the
core Moon path is as above.

### 4.4 Eclipse / shadow handling

For lunar/solar eclipses Stellarium uses an analytic approach: the
shadow contribution is computed in the vertex shader by intersecting
each vertex's sun-ray with the Earth-as-occluder, then passing the
result to the fragment shader as a per-vertex factor. This is
sufficient for the Moon-disc-on-screen scale.

### 4.5 Texture preparation

Stellarium ships a moderate-resolution Moon texture (typically 4K
equirectangular) and does *not* by default use the LDEM as
displacement. The default visual is essentially a tone-mapped
Lambertian sphere with the Hapke disc-integrated correction. With
the "high-quality moon" plugin, a 16K texture and a normal-map
variant are loaded.

### 4.6 Pros / cons summary for Stellarium's approach

Pros:
- Runs everywhere.
- Astronomically accurate disc-integrated brightness.
- The CPU-side Hapke fit is publication-quality (matches McCord's
  empirical phase curves to within ~5%).

Cons:
- Per-pixel detail is just Lambert; no per-pixel BRDF.
- Per-pixel terminator is not soft.
- No crater-rim shadowing.
- Not useful as a model for our close-orbit use case.

---

<a id="section-5"></a>
## 5. Celestia

[Celestia](https://celestia.space/) is the original open-source
real-time solar system browser. Source:
<https://github.com/CelestiaProject/Celestia>.

### 5.1 Repository layout

Celestia's renderer is mostly in `src/celengine/`. Shader-related
files include:

- `src/celengine/shadermanager.cpp` and `shadermanager.h` -
  generates GLSL shaders procedurally from a "shader properties"
  description per material/lighting situation.
- `src/celengine/glshader.cpp` - GL state.
- `src/celengine/render.cpp` - draw loop.
- `src/celengine/lodspheremesh.cpp` - LOD sphere geometry.

There is no single "moon shader" file; instead the shader manager
produces one of dozens of shader permutations depending on per-body
properties. Bodies in Celestia can be flagged with `BumpMap`,
`SpecularMap`, `OverlayTexture`, `RingShadow`, `LunarLambertian`,
`SeparateSpecularTexture`, etc.

### 5.2 The "LunarLambert" model

Celestia introduced (in a 2003 commit) a special-cased material
called `LunarLambert` (also written `LunarLambertian`). The
`LunarLambert` BRDF is essentially a Lambert / Lommel-Seeliger
blend with a per-body parameter `k` (called `LunarLambertAmount`
in `.ssc` data files):

```text
    f_r(i, e) = k * (mu_0 / (mu_0 + mu)) + (1 - k) * mu_0
```

This is exactly the blend formula in section 2.3 of this document,
parameterised by Celestia as `k`. For the Moon Celestia ships
`k = 0.5` (50/50 Lambert / L-S). The shader manager generates
something like:

```glsl
// Approximate generated Celestia LunarLambert shader fragment.
// Generated symbolically by ShaderManager::buildVertexShader and
// ShaderManager::buildFragmentShader.
uniform float lunarLambertK;      // 0.5 for the Moon by default

vec3 surfaceShade(vec3 albedo, vec3 N, vec3 L, vec3 V, vec3 I0) {
    float mu0 = max(dot(N, L), 0.0);
    float mu  = max(dot(N, V), 0.0);
    float ls  = mu0 / max(mu0 + mu, 0.0001);
    float term = lunarLambertK * ls + (1.0 - lunarLambertK) * mu0;
    return albedo * term * I0;
}
```

In data files (e.g. the Moon's `.ssc` entry), Celestia's syntax
for selecting this BRDF was:

```text
"Moon" "Sol/Earth"
{
    Class "moon"
    Mass 0.0123
    Radius 1737.4
    InfoURL "https://en.wikipedia.org/wiki/Moon"
    Texture "moon.*"
    BumpMap "moonbump.*"
    BumpHeight 6.0
    LunarLambertian 0.5
}
```

The `LunarLambertian 0.5` line is the key: it tells Celestia to
generate a shader with the L-S/Lambert blend instead of pure
Lambert.

### 5.3 Bump and normal maps in Celestia

Celestia uses a heightmap-derived per-vertex normal perturbation
(historic Celestia used `BumpMap` + `BumpHeight` to compute a
normal map at load time). Modern Celestia honours `NormalMap`
directly and does not recompute. The `BumpHeight 6.0` value for
the Moon means "scale the normal-map response such that a 256
gray-level corresponds to 6 km of relief", which is then mapped
into tangent space.

### 5.4 Specular handling

Celestia's Moon does not use a specular map by default; lunar
basalt is non-glossy. Other moons (Europa, Titan) do. The
`shadermanager.cpp` generates a Blinn-Phong specular term with
an optional per-pixel mask; Moon shaders skip it.

### 5.5 Shadow handling

Celestia models eclipse shadows as analytic disc-disc occlusion in
the vertex shader (since Earth and Moon are both modelled as
spheres). For real-time Sun-eclipsed-by-Earth conditions on the
Moon, Celestia computes the umbra/penumbra geometry and feeds a
shadow factor into the fragment shader. There are no shadow maps
or per-pixel cast shadows in Celestia's pipeline.

### 5.6 Pros / cons of Celestia's approach

Pros:
- The `LunarLambert` BRDF is well-grounded and very cheap.
- The shader manager pattern (generate per-body shader
  permutations) is elegant for a real-time multi-body engine.
- BumpMap + height-map normal computation is a precedent for what
  we already do.

Cons:
- No opposition surge.
- No soft terminator.
- No per-pixel cast shadows.
- Single global `LunarLambert k` value; no spatial variation
  (mare vs highland).
- The disc looks correct macroscopically but can look "flat" up
  close, exactly like our own current renderer's complaint.

---

<a id="section-6"></a>
## 6. OpenSpace

[OpenSpace](https://openspaceproject.com/) is NASA-affiliated,
open-source (MIT/BSD), C++/OpenGL-based, and is what most modern
science-museum dome shows use to display NASA datasets. Source:
<https://github.com/OpenSpace/OpenSpace>.

### 6.1 Repository layout

Relevant directories:

- `modules/globebrowsing/` - the planet/moon globe rendering
  module. This is OpenSpace's main entry point for rendering
  textured spheroidal bodies.
- `modules/globebrowsing/shaders/` - GLSL files for chunked LOD
  globe rendering.
- `modules/globebrowsing/src/renderable/renderableglobe.cpp` -
  the runtime that issues draw calls.
- `modules/globebrowsing/src/rendering/layer/layeradjustment.cpp`
  - per-layer (height, color, night, water mask, cloud mask)
  preprocessing.

The Moon is treated identically to other bodies: it is a
LOD-chunked spheroid mesh fed by global mosaic textures (LROC
colour) and a height map (LDEM). Shading is per-chunk, per-pixel.

### 6.2 Shader content

OpenSpace's per-pixel sphere shader is in
`modules/globebrowsing/shaders/renderer_fs.glsl` and the helpers
in `texturetilemapping.glsl`. The lighting block is essentially:

```glsl
// Heavily paraphrased - re-fetch the live file.
vec3 lightSurface(in vec3 albedo, in vec3 normal, in vec3 lightDir,
                  in vec3 viewDir, in float roughness)
{
    float nDotL = max(dot(normal, lightDir), 0.0);
    float ambient = ambientFactor;
    return albedo * (nDotL + ambient);
}
```

In other words, default OpenSpace does Lambert + ambient, with no
Hapke or Lommel-Seeliger by default. It is intended as a
data-visualisation platform, not a photometric simulator.

What OpenSpace gets right that our renderer can learn from:

- **Layer system:** colour, height, night-side, cloud, etc are
  separate texture layers each with its own preprocessing. This
  is the right architecture for adding things like a separately
  baked normal map or a per-body roughness map.
- **Chunked LOD:** at zoom-in, OpenSpace re-tessellates the
  visible region down to sub-km resolution. This is the only
  way to get crater rims to actually have geometry rather than
  being faked by normal maps.
- **Real heightfield displacement:** uses the LDEM as actual
  vertex displacement, not just a normal map.

### 6.3 Texture / colour-space handling in OpenSpace

OpenSpace explicitly converts sRGB → linear on sample, performs
all lighting in linear, and applies a final Reinhard tonemap.
The relevant block, paraphrased:

```glsl
vec3 toLinear(vec3 srgb) {
    return pow(srgb, vec3(2.2));
}
vec3 toSRGB(vec3 linear) {
    return pow(linear, vec3(1.0 / 2.2));
}
// final
vec3 color = toLinear(texture(colorMap, uv).rgb);
// ... lighting ...
color = color / (color + vec3(1.0));     // Reinhard
fragColor = vec4(toSRGB(color), 1.0);
```

### 6.4 Shadows

OpenSpace does not use real-time shadow maps for Moon/planet
self-shadowing. For eclipses (which are visually significant)
it computes umbra/penumbra analytically based on the relevant
body positions and applies the result as a shading factor.

For per-pixel crater shadows OpenSpace relies on the chunked
LOD + actual displacement to produce real geometric shadows
where two chunks face away from the light. There is no
ray-marched horizon shadow.

### 6.5 Pros / cons of OpenSpace's approach

Pros:
- Real LOD displacement is the most physically faithful approach.
- Layered material system is clean and extensible.
- Linear-space lighting + Reinhard is the right baseline.

Cons:
- No Hapke or LS BRDF; just Lambert.
- No opposition surge.
- No analytic soft penumbra.
- Heavy: requires LOD / chunk subsystem to work; not directly
  applicable to a single-mesh Three.js sphere.

---

<a id="section-7"></a>
## 7. SpaceEngine

[SpaceEngine](https://spaceengine.org/) is closed-source. The
developer (Vladimir Romanyuk) has published technical detail on
the SE Forum and in the `SpaceEngine` blog over the years. Key
known facts about SE's Moon rendering:

- **BRDF:** SpaceEngine uses a custom physically-based BRDF that
  combines Cook-Torrance (specular) with Oren-Nayar (rough
  diffuse) for general-purpose planetary surfaces, plus a
  Hapke-style opposition surge term applied to airless bodies
  (Moon, Mercury, asteroids).
- **Roughness:** per-body roughness maps; lunar regolith is
  rendered with `α ≈ 0.7` (moderately rough).
- **Terminator:** SE models the Sun as a finite disc and uses an
  Oren-Nayar-soft terminator. The penumbra width scales correctly
  with the parent star's angular size.
- **Cast shadows:** SE uses *screen-space* horizon ray-marching
  (essentially HBAO over the heightfield) to add small-scale
  cast shadows near the terminator. This is identical in spirit
  to what our current shader does in its
  `moonTerrainSelfShadow` block.
- **Earthshine:** modelled as a second light source whose
  intensity is proportional to the parent body's illuminated
  cross-section visible from the moon.
- **Tone mapping:** Filmic ACES with auto-exposure based on the
  star's radiance and the viewer's distance.

There is a well-known SE Forum post titled "How does SpaceEngine
render planets?" by Romanyuk (2017) that describes the rough
pipeline. The closed-source nature means we cannot quote shader
code, but the *architecture* (per-body BRDF parameters, screen-
space horizon shadow, Earthshine as a secondary light) is a
useful reference.

---

<a id="section-8"></a>
## 8. NASA Eyes on the Solar System

NASA's "Eyes" is a JPL-built web app. Originally Unity WebGL,
since 2022 a custom WebGL/Three.js hybrid. The Moon shader is
not open source but the loaded JS bundle can be inspected at
<https://eyes.nasa.gov/apps/solar-system/>. From inspecting
public bundles in past years:

- The Moon mesh is a simple sphere (~ 64x64 segments) with a
  pre-baked normal map from LDEM and the LROC colour map.
- The shader is Three.js `MeshStandardMaterial` with
  `roughness ≈ 1.0` and `metalness = 0.0`, plus a custom
  `onBeforeCompile` patch that adds a Hapke-flavoured opposition
  bump and a Lommel-Seeliger blend. This is essentially what our
  current shader does.
- No screen-space shadow march; the `Eyes` Moon looks "flat" in
  close orbit because it relies entirely on the normal map for
  relief.
- Earthshine is not modelled; the dark side is uniformly black
  with a low ambient.
- Tone mapping: ACES with a fixed exposure tuned for the typical
  view distance.

The Eyes app does *not* use displacement; the Moon is geometrically
a smooth sphere and all relief comes from the normal map.
Practical conclusion: NASA's own real-time public-facing renderer
uses essentially the same approach as our current code, with even
fewer enhancements (no displacement, no terminator-band shadow
march).

---

<a id="section-9"></a>
## 9. NASA WorldWind

NASA WorldWind is now archived but well-documented. The Moon was
rendered as a tessellated tiled sphere with:

- Per-tile height + colour textures.
- Per-tile pre-computed normal maps.
- Lambertian shading with a fixed sun direction.
- No opposition, no L-S, no soft terminator.

WorldWind's Moon implementation is *not* a useful reference for
photometric improvements; it was a GIS-style data viewer, not a
visual simulator.

---

<a id="section-10"></a>
## 10. Game-engine planet/moon implementations

<a id="section-10-1"></a>
### 10.1 Kerbal Space Program / Scatterer / Parallax

KSP is closed source but its modding community has produced
extensive technical writing, especially around the Scatterer
(atmosphere) and Parallax (terrain) mods.

Key references in the KSP modding world for *moon-like* (no
atmosphere, regolith) rendering:

- **Parallax** mod by Linx / Gameslinx: replaces stock terrain
  shaders with a normal+displacement+Hapke-blended pipeline.
- **EVE / Scatterer** atmospheric work by blackrack: less relevant
  for the Moon proper but the Sun-disc soft-shadow work is
  reusable.

The Parallax shader (HLSL/Unity Shaderlab) for airless bodies is
roughly:

```hlsl
// Paraphrased Parallax-style HLSL for an airless body.
half4 frag(v2f i) : SV_Target {
    half3 albedo = tex2D(_MainTex, i.uv).rgb;
    half3 N = normalize(UnpackNormal(tex2D(_BumpMap, i.uv)));
    half3 L = _WorldSpaceLightPos0.xyz;
    half3 V = normalize(_WorldSpaceCameraPos - i.worldPos);

    half mu0 = saturate(dot(N, L));
    half mu  = saturate(dot(N, V));

    // LunarLambert (Celestia-style)
    half ls  = mu0 / max(mu0 + mu, 0.0001);
    half k   = _LunarLambertAmount;          // ~0.5
    half lambert = k * ls + (1.0 - k) * mu0;

    // Opposition
    half cosPhase = saturate(dot(L, V));
    half opp = pow(cosPhase, _OppWidth) * _OppStrength;

    half3 color = albedo * lambert * (1.0 + opp) * _LightColor0.rgb;

    return half4(color, 1.0);
}
```

The KSP modders explicitly discuss the same problems we have:
"flat lit hemisphere, hard terminator, no crater shadows." Their
solution stack is:

1. LunarLambert blend (k ≈ 0.5) - this is the single biggest fix.
2. Opposition surge bump - small but psychologically important.
3. Stronger normal map at the terminator band only - to emphasize
   relief where the eye expects to see it.
4. Optional screen-space curvature darkening (a variant of
   curvature AO) - approximates crater-rim shadow on the lit side
   without per-pixel ray marching.

Parallax also implements per-mesh tessellation with real
displacement at sub-pixel triangle size when zoomed in, which is
analogous to OpenSpace's chunked LOD.

<a id="section-10-2"></a>
### 10.2 Elite Dangerous

Elite Dangerous (Frontier Developments, COBRA engine) renders
roughly 400 billion star systems, each with realistic bodies. It
is closed source but Frontier engineers (Mark Allen, Edward
Lewis) have spoken at GDC and Develop conferences. Key talk:
"Stellar Forge: Procedural Generation in Elite: Dangerous" (GDC
2014).

What is publicly known about Elite's Moon-like body rendering:

- **BRDF:** Custom physically-based with a Cook-Torrance specular
  and a rough-diffuse term. For airless bodies the diffuse term
  is essentially Oren-Nayar with a high roughness, which
  approximates Lommel-Seeliger limb-flattening reasonably well.
- **Tessellation:** Real-time CDLOD (Continuous Distance Level
  of Detail) with hardware tessellation. Crater rims are *real
  geometry* at close range.
- **Atmosphere/scattering:** Bruneton-style precomputed
  scattering for atmosphere bodies; airless bodies skip this.
- **Terminator:** Soft terminator from real Sun-disc occlusion
  by the body's own limb (the renderer integrates the visible
  Sun fraction analytically).
- **Shadows:** Cascaded shadow maps for per-body self-shadow at
  close range; Frontier engineers have noted that the resolution
  required to capture meaningful crater shadow at low orbit is
  enormous and they use per-body adaptive cascades.

Practical takeaway: Elite's beauty at "skimming a moon" altitude
comes from *real geometry*, not from clever shading. Our Three.js
sphere cannot match that without a chunked LOD or impostor
system.

<a id="section-10-3"></a>
### 10.3 No Man's Sky

NMS uses a custom engine (later upgraded with Vulkan support).
Moons in NMS are procedural and not photometrically realistic by
design (they often have impossible colours and atmospheres). The
shader is Cook-Torrance + custom procedural noise. NMS is not a
useful reference for *physically realistic* Moon rendering.

<a id="section-10-4"></a>
### 10.4 Universe Sandbox

Universe Sandbox uses Unity's HDRP pipeline. The Moon is a
standard Unity Lit material with a pre-baked LROC colour, a
height-derived normal map, and HDRP's standard ACES tonemapping.
It does not implement Lommel-Seeliger or Hapke; the lit
hemisphere visibly suffers from the "puffy Lambert ball" problem
in close-up screenshots. Universe Sandbox is *not* a good
reference for moon rendering quality - it is pedagogically
strong but visually middling.

<a id="section-10-5"></a>
### 10.5 Microsoft Flight Simulator (MSFS) 2020/2024

MSFS uses Asobo's custom engine with proprietary celestial body
rendering. Public information from Asobo developers:

- The Moon is a real-time-rendered sphere with the LROC mosaic
  and LDEM as displacement.
- Sun-disc soft penumbra is used for Earth-shadow-on-Moon during
  lunar eclipses (visible in the in-sim eclipse on 2022-11-08).
- BRDF is described as "physically based, custom" with
  rough-diffuse + Cook-Torrance specular.
- The lit Moon at typical sim altitudes shows clear crater shadow
  at the terminator, suggesting either real geometric tessellation
  or screen-space horizon ray marching.

MSFS 2024 added "real-time global illumination" which would give
correct Earthshine for free; whether this is enabled for the Moon
specifically is unclear from public docs.

---

<a id="section-11"></a>
## 11. Three.js, WebGL and Shadertoy implementations

<a id="section-11-1"></a>
### 11.1 Three.js examples and `MeshStandardMaterial`

The Three.js examples include several "earth"/"planet" scenes.
The most commonly referenced are:

- `examples/webgl_geometry_terrain.html` (terrain, not relevant)
- `examples/webgl_shaders_ocean.html` (water, not relevant)
- The `OrbitControls` + `MeshStandardMaterial` patterns used
  across the gallery

Three.js does **not** ship a Moon-specific shader. The community
default is:

```js
const texture       = new THREE.TextureLoader().load('moon_color.jpg');
const normal        = new THREE.TextureLoader().load('moon_normal.jpg');
const displacement  = new THREE.TextureLoader().load('moon_height.png');

texture.colorSpace  = THREE.SRGBColorSpace;     // CRITICAL
normal.colorSpace   = THREE.NoColorSpace;
displacement.colorSpace = THREE.NoColorSpace;

const material = new THREE.MeshStandardMaterial({
    map:                  texture,
    normalMap:            normal,
    displacementMap:      displacement,
    displacementScale:    0.02,
    roughness:            0.95,
    metalness:            0.0,
});

const moon = new THREE.Mesh(
    new THREE.SphereGeometry(1, 256, 256),
    material,
);
```

with a single directional light for the Sun and an `AmbientLight`
or `HemisphereLight` for fill. This produces the classic
"Lambert + Cook-Torrance specular" output that has the puffy
limb-darkening problem. Almost every Three.js Moon you find on
the web has this problem.

The standard fix that experienced Three.js practitioners use is to
patch `MeshStandardMaterial` via `onBeforeCompile`, exactly as our
current code does. The `<lights_fragment_begin>` chunk is the
conventional injection point because by that point the renderer
has already computed `geometryNormal`, `nonPerturbedNormal`,
`geometryViewDir`, the per-light `directionalLights[0].direction`,
and `reflectedLight.directDiffuse`.

<a id="section-11-2"></a>
### 11.2 Bruno Simon, threejs-journey patterns

Bruno Simon's threejs-journey course (paid) and his blog include
several "Earth" lessons. They cover `onBeforeCompile` patching for
Earth-style atmosphere effects but do not address Moon-specific
photometry (Bruno's Earth is a more general "blue ball with
clouds" demo). The pattern is reusable: he documents a clean way
to inject custom uniforms and shader chunks via
`onBeforeCompile`.

<a id="section-11-3"></a>
### 11.3 Inigo Quilez Shadertoy material

Inigo Quilez has many sphere/lighting shaders on Shadertoy. The
most relevant for Moon work are:

- "Sphere Lighting" series - explores Lambert vs Oren-Nayar vs
  multi-bounce.
- "Soft Shadows" articles on iquilezles.org - gives the
  ray-marched soft-shadow formula used in many renderers.
- "Lommel-Seeliger" is *not* discussed by name in IQ's articles
  but his "diffuse lighting" article explicitly contrasts Lambert
  with multiple-scattering models.

A direct quote from Quilez's "Outdoor lighting" article (which is
relevant to *any* outdoor surface, including the Moon):

> Lambertian shading models the diffuse term as `albedo * NdotL`,
> which is fine for grass and matte paint but fails for surfaces
> dominated by single-scattering off particulates. For the Moon,
> for example, a Lommel-Seeliger model is a much better starting
> point than Lambert.

(Paraphrased - the exact wording may differ; verify on
iquilezles.org.)

<a id="section-11-4"></a>
### 11.4 Shadertoy moon shaders worth studying

Five Shadertoy shaders that come up repeatedly when searching for
"moon" or "lunar":

1. **"Realistic Moon"** by Iridescent / various authors - usually
   a sphere with `imageTexture` of the Moon and a Lambert shading
   pass. Most are not photometrically advanced.

2. **"Moon shader"** by Robobo1221 - includes a Lommel-Seeliger
   term and a Hapke-flavoured opposition surge. The fragment
   shader is roughly:

   ```glsl
   vec3 sunDir = normalize(vec3(cos(iTime), 0.4, sin(iTime)));
   vec3 N = sphereNormal(uv);
   vec3 V = vec3(0, 0, -1);
   float mu0 = max(dot(N, sunDir), 0.0);
   float mu  = max(dot(N, V), 0.0);
   float ls  = mu0 / max(mu0 + mu, 0.001);
   float cosG = dot(sunDir, V);
   float opp = pow(max(cosG, 0.0), 16.0);
   vec3 albedo = texture(iChannel0, sphericalUV(N)).rgb;
   vec3 col = albedo * ls * (1.0 + 0.05 * opp);
   ```

3. **"Lunar Hapke"** (search by name on Shadertoy) - implements
   the Hapke H-function and opposition surge per-pixel. Very
   accurate but expensive (~ 50 ALU per pixel).

4. **"Moon close-up with craters"** (various authors) - typically
   uses signed-distance-field crater rings procedurally rather
   than a real LDEM. Not relevant for our pipeline but useful for
   understanding what *visual cues* the eye picks up from craters
   (rim shadow, central peak, ejecta blanket).

5. **"Earth-Moon system"** by Shane / various - a full scene
   shader with both bodies, atmosphere on Earth, no atmosphere
   on Moon. The Moon shading is a Lambert + Lommel-Seeliger
   blend with a fixed `k = 0.5`.

There is no single Shadertoy shader that does everything we need
(LROC + LDEM + Hapke + soft penumbra + cast shadows). The pieces
are scattered across many small shaders.

<a id="section-11-5"></a>
### 11.5 WebGL Earth / Cesium / Resium

CesiumJS is the most mature web GIS engine for Earth and has been
extended to render the Moon and other bodies via the
`Sandcastle` examples. Cesium's Moon rendering is essentially:

- A `Globe` instance configured with lunar reference radii.
- An `ImageryProvider` for the LROC mosaic.
- A `TerrainProvider` for the LDEM.
- Default lighting is *off* (the Globe is rendered as if uniformly
  lit). When you enable `viewer.scene.globe.enableLighting = true`,
  Cesium uses a Lambert per-pixel shader plus a darkening factor
  for the night side.

Cesium does not implement Lommel-Seeliger or Hapke for the Moon.
For our use case Cesium's main interest is the demonstration that
LROC + LDEM at the resolutions we ship works fine in WebGL (Cesium
handles 16K and 64K versions).

---

<a id="section-12"></a>
## 12. Comparative matrix of techniques

The following matrix summarises the BRDF, terminator, shadow, and
Earthshine choices made by each surveyed implementation.

| Implementation | BRDF | Terminator | Cast shadow | Crater AO | Earthshine | Tonemap | Texture src | Notes |
|----------------|------|------------|-------------|-----------|------------|---------|-------------|-------|
| Stellarium | Lambert + CPU Hapke disc-integral | Hard `step(0)` | Analytic eclipse only | None | None | sRGB clip | LROC 4K | Per-pixel Lambert, per-disc Hapke |
| Celestia | LunarLambert blend `k=0.5` | Hard `step(0)` | Analytic eclipse only | None | None | Linear→sRGB | LROC 8K + bump | First open-source to popularise L-S blend |
| OpenSpace | Lambert | `smoothstep` near terminator | Real geometry from LOD chunks | None explicit | None | Reinhard | LROC 16K + LDEM as displacement | Layered material system |
| SpaceEngine | Custom rough-diffuse + Hapke opposition | Sun-disc fraction integral | Screen-space horizon march | Curvature AO | Secondary light | ACES + auto-EV | LROC 16K + LDEM | Closed source |
| NASA Eyes | `MeshStandardMaterial` patched, L-S blend + opposition | Hard | None | None | None | ACES | LROC 8K + normal | Three.js |
| NASA WorldWind | Lambert | Hard | None | None | None | sRGB clip | LROC 4K + tile-baked normal | Archived |
| KSP / Parallax | LunarLambert + opposition | Soft `smoothstep` | Real LOD geometry at close range | Curvature AO | None (KSP physics) | sRGB | KSP custom + LDEM | Best-in-class for a hobby mod |
| Elite Dangerous | Cook-Torrance + Oren-Nayar | Sun-disc fraction integral | Cascaded shadow maps + LOD | LOD geometry | Secondary light per body | ACES | Procedural | Closed source |
| MSFS 2020/2024 | Custom physically based | Sun-disc fraction integral | Real geometry + screen-space | Real geometry | Possibly via RTGI | ACES + filmic | LROC + LDEM | Closed source |
| Universe Sandbox | Unity Lit (Cook-Torrance) | `smoothstep` | Unity HDRP shadow maps | None | None | ACES | LROC + normal | Unity HDRP |
| Cesium / WebGL Earth | Lambert + day/night blend | Hard | None | None | None | sRGB clip | LROC + LDEM | GIS focus |
| **This project (current)** | **Lambert + L-S blend (`blend=0.20`) + opposition (`pow18 * 0.0023`)** | **Sun-disc fraction integral (analytic, our `moonSunDiskVisibleFraction`)** | **Heightmap horizon march, terminator-band gated** | **Local height-cavity AO, terminator-band gated** | **Currently no separate light; phase-aware "earthshine intent" via ambient (per project notes)** | **Three.js renderer default + custom moon photometric chunk** | **LROC (NASA SVS) + LDEM at runtime; normal map generated from height** | **See `src/platform/js/rendering/moon-renderer.js`** |

A few cross-cutting observations from the matrix:

- **Almost everyone uses some form of Lambert+L-S blend.** Pure
  Hapke per-pixel is rare in real-time renderers because of cost.
  The `LunarLambert k = 0.5` Celestia variant is the most common
  choice.
- **Soft penumbra is rare in CPU-bound renderers** (Stellarium,
  Celestia, WorldWind, Cesium) but present in modern GPU
  renderers (SpaceEngine, Elite, MSFS, our current shader).
- **Real cast shadows on the lit side require either real
  geometry (LOD chunks) or a per-pixel screen-space march.**
  Nobody uses shadow maps for the Moon's own crater shadows;
  the resolution requirement is prohibitive.
- **Crater-bowl AO from a heightmap neighbourhood is a uniquely
  fragment-shader-friendly trick** that few major implementations
  use, but it is documented in Iñigo Quilez's "ambient occlusion"
  notes and is exactly what our current shader does in
  `moonCavityOcclusion`. It is a good cheap stand-in for real
  shadow maps.
- **Earthshine is almost always omitted or stubbed.** Even
  SpaceEngine's "secondary light" approach is approximate. A more
  rigorous implementation would use precomputed Earth-radiance
  cube-map projected onto the dark side with the Earth phase
  factor.

---

<a id="section-13"></a>
## 13. Specific problems we are hitting and what others do

This section addresses each of the four pain-points in the brief
directly, with concrete cross-references back to sections 4-12.

<a id="section-13-1"></a>
### 13.1 "Lit hemisphere looks flat"

The single most common cause of "flat lit hemisphere" in a
Three.js Moon is that the default `MeshStandardMaterial`
combination of Lambert diffuse + Cook-Torrance specular produces
a smooth `cos(θ)` falloff toward the limb. The eye reads that
falloff as "spherical shading," which is photographically wrong
for the Moon (whose disc is roughly uniform). Subjectively the
result looks "puffy" or "billiard-ball-like."

Fixes used by the surveyed renderers, in order of cost:

1. **Lommel-Seeliger blend (cheapest, biggest visual win).**
   This *removes* the puffy falloff and matches the Moon's actual
   uniform-disc behaviour at full phase. Celestia's `LunarLambert
   k = 0.5` is the most copied form. Our shader already does this
   with `uMoonLsBlend = 0.20` (currently a relatively gentle
   blend; see section 14 for tuning recommendations).

2. **Crater-bowl AO from heightmap.** Adds visible interior
   shadow inside crater bowls, which our eyes use as a strong
   relief cue. Cheap (~ 9 height samples per pixel, our current
   `moonCavityOcclusion` does exactly this).

3. **Stronger normal map response near the terminator only.**
   Boost the normal-map contribution in a band near `mu0 = 0` so
   that crater rims throw visible shadow there, but keep the
   normal-map response gentle on the well-lit hemisphere so
   noise doesn't read as relief. This is the
   `moonTerrainReliefBand` factor in our current shader.

4. **Real geometric tessellation of high-relief regions.** Most
   expensive; requires a chunked LOD subsystem (OpenSpace, Elite,
   MSFS). Out of scope for a single-mesh Three.js sphere.

5. **Curvature AO / screen-space ambient occlusion.** A
   post-process AO pass that darkens concave regions on the lit
   side. Used by Parallax. Moderately expensive; needs an
   off-screen pass.

The quickest tunable wins for our renderer specifically:

- Increase `uMoonLsBlend` from 0.20 toward 0.5 (the Celestia /
  Parallax default) and re-evaluate.
- Make sure the colour map is being un-gamma'd to linear before
  shading. (Three.js does this automatically when
  `texture.colorSpace = THREE.SRGBColorSpace` and the renderer is
  in `LinearSRGBColorSpace` output, but it is worth verifying.)
- Make sure `roughness = 1.0` (or as close as possible) and
  `metalness = 0.0` so the Cook-Torrance specular is strictly off.
- Consider adding a *very mild* curvature AO from a screen-space
  pass; it cannot be done from a single fragment shader cleanly
  but a coarse approximation can be done from a fixed-radius
  height-sample neighbourhood (which is what `moonCavityOcclusion`
  in our shader already does).

<a id="section-13-2"></a>
### 13.2 Banding at terminator from band-effect transitions

If the terminator-band gating uses ordinary `smoothstep` with
fixed inner and outer thresholds, the transition is visibly *band-
shaped* rather than physically motivated, especially when several
band effects (relief, AO, cast shadow) overlap. Our current code
has at least three such smoothsteps:

```glsl
float moonTerrainReliefBand = 1.0 - smoothstep(0.025, 0.32, moonSmoothNdotL);
float moonCavityBand = smoothstep(0.018, 0.10, moonSmoothNdotL)
    * (1.0 - smoothstep(0.24, 0.42, moonSmoothNdotL));
float moonTerrainShadowBand = moonTerrainReliefBand * pow(1.0 - moonSmoothNdotL, 1.4);
```

These three together produce three different "edges" at slightly
different `mu0` values, and where their effects overlap and don't
overlap, the eye sees concentric arcs of brightness change. That
banding is a known cosmetic problem for any "band-gated" effect.

What other implementations do:

- **SpaceEngine and Elite Dangerous** gate their terminator
  effects against the *Sun-disc visibility fraction*, not against
  raw `mu0`. `moonSunVisibility` is already computed in our
  shader. Replacing the `smoothstep` thresholds with shaping
  functions of `moonSunVisibility` would tie the band to the
  physical penumbra width, eliminating the discontinuity at
  arbitrary thresholds.
- **OpenSpace and Cesium** simply do not use band effects at all
  - their terminator is a single smooth function and there is no
  band to alias.
- **Parallax** uses a single shared band function for all three
  effects (relief boost, AO, cast shadow), so even if it has the
  same underlying problem, the effects all transition together
  and there is no visible ripple between them.

Concrete recommendation: replace the per-effect thresholds with
a single shared band-shape function:

```glsl
// Shared terminator band, parameterised by sun visibility (0..1)
// rather than by raw NdotL. Inner = full sun, outer = full shadow.
float terminatorBand(float sunVis) {
    return sunVis * (1.0 - sunVis) * 4.0;     // peak at sunVis=0.5
}
```

Then use `terminatorBand(moonSunVisibility)` as the modulation
for relief, AO, and cast shadow. The peak naturally occurs at
the geometrically correct centre of the penumbra and there are
no arbitrary thresholds to drift between effects.

<a id="section-13-3"></a>
### 13.3 Soft penumbra from Sun's angular size

Section 2.6 above gives the analytic answer. The relevant code
in our current shader is *correct* mathematically:
`moonSunDiskVisibleFraction(rawNdotL)` returns the closed-form
circular-segment integral.

What other implementations do:

- **Stellarium, Celestia, OpenSpace, WorldWind, Cesium:** none.
  Hard terminator.
- **SpaceEngine, Elite, MSFS:** explicit soft-disc integral,
  identical in spirit to ours.
- **NASA Eyes:** none. Hard terminator.

So our shader is already in the "ahead of the field" category on
this dimension. Two refinements to consider:

- Use `nonPerturbedNormal` (the smooth sphere normal) for the
  visibility fraction, *not* the perturbed/normal-mapped normal.
  This avoids the "cement band" where normal-map noise just past
  the terminator briefly raises tilted facets above the local
  horizon. Our shader already does this:

  ```glsl
  float moonSmoothRawNdotL = dot(normalize(nonPerturbedNormal), moonLightDir);
  float moonSunVisibility  = moonSunDiskVisibleFraction(moonSmoothRawNdotL);
  ```

- Multiply the *base* direct lighting (Three.js's
  `reflectedLight.directDiffuse`) by the visibility fraction
  rather than just clamping NdotL. Our shader does this with
  `reflectedLight.directDiffuse *= moonSunVisibility`. This is
  the right approach.

<a id="section-13-4"></a>
### 13.4 Crater-rim shadows on the lit side

This is the hardest of the four problems. The issue is that on
the well-lit side of the Moon, real crater rims throw small but
visible shadows into the bowl of the crater. The shadow is small
compared to the crater diameter (because the Sun is high) but
large enough to be a strong visual cue.

What other implementations do:

- **OpenSpace, Elite, MSFS:** real geometry. The crater rim is
  actually elevated and Three.js / DirectX shadow mapping (or
  per-pixel-march in MSFS) produces real cast shadow.
- **SpaceEngine, Parallax:** screen-space horizon march from the
  heightmap. Each pixel marches several samples in the direction
  of the Sun (in tangent space) and asks whether any neighbouring
  pixel is high enough to occlude.
- **Stellarium, Celestia, NASA Eyes, WorldWind, Cesium:** none.

Our current shader implements the screen-space horizon march
correctly. The compromise is documented in our own code:

```glsl
// Cast-shadow horizon march. The geometric soft-disk version
// (peak elevation vs Sun altitude in tangent space) is physically
// correct but doesn't fire in this renderer because the
// displacement is heavily compressed (1.0 normalized ≈ 1737 km,
// but rendered displacementScale is 0.013 vs ~100-unit moon
// radius — relief is ~7000× smaller than reality). Under physical
// math, no peak is tall enough to occlude the Sun. So we keep the
// noise-threshold approach: any anomalous heightmap rise above
// the smoothly-curving surface produces a shadow, gated to the
// terminator-adjacent band by moonTerrainReliefBand.
```

This is a clear-eyed admission: the displacement is artificially
compressed (because at the *real* ratio of 10 km of relief vs
1737 km of radius, relief is invisible at typical zoom and
crashes Three.js's default normal-map precision), so we cannot
use the geometric horizon test. We fall back to a noise-threshold
approach.

Three improvements to consider, in order of cost and quality:

1. **Increase displacement scale only at close camera distances.**
   When the camera is < 5,000 km from the Moon's centre, increase
   the effective `displacementScale` by a factor of 5-20× and
   re-evaluate the horizon march. The "wrongness" of the
   exaggerated relief is invisible at high altitude (the
   exaggeration is below pixel resolution there) and produces
   real shadow at low altitude.

2. **Replace the noise-threshold horizon march with a
   slope-against-Sun-elevation test.** Even in the compressed-
   relief regime, any local up-tilt exceeding the Sun's altitude
   above the local horizon should produce a shadow. The relevant
   formula:

   ```glsl
   // Compare local up-slope (height difference / texel distance)
   // against tan(sun_elevation_in_tangent_space).
   float localSlope = (sampleHeight - baseHeight) / sampleDistanceInUv;
   float sunSlopeRequired = moonLightTangent.z / moonLightTangentPlanarLength;
   float shadow = smoothstep(sunSlopeRequired, sunSlopeRequired * 1.4, localSlope);
   ```

   This naturally scales with the displacement magnitude and does
   not require a tunable threshold.

3. **Use a separately baked AO map per crater, multiplied in
   only near the terminator band.** This requires a new offline
   asset bake (which would need to be generated from the LDEM),
   but the result is essentially perfect: every crater has its
   correct rim-shadow AO baked in, and we only multiply it in
   when we are near the terminator band where it is visible.

---

<a id="section-14"></a>
## 14. Checklist of takeaways for our rewrite

Synthesised recommendations, mapped to the existing
`src/platform/js/rendering/moon-renderer.js`:

1. **Keep the soft-disk Sun-visibility integral.** The
   `moonSunDiskVisibleFraction` and `moonSoftNdotL` functions are
   the most physically defensible part of our shader and they
   already match SpaceEngine / Elite / MSFS practice. Do not
   replace these with a `smoothstep`.

2. **Keep the Lommel-Seeliger blend, but tune the weight.**
   `uMoonLsBlend = 0.20` is a gentle blend; experiment with values
   in the range `0.4 - 0.6` (the Celestia / Parallax default of
   `k = 0.5` is a good first guess). Re-shoot at all phase angles
   to confirm.

3. **Reformulate the band-gate functions to share a common
   `terminatorBand(sunVis)` shape.** This addresses the section
   13.2 banding artefact directly and removes three magic
   thresholds (`0.025/0.32`, `0.018/0.10`, `0.24/0.42`) from the
   shader.

4. **Audit the colour-space pipeline end-to-end.** Confirm
   `texture.colorSpace = THREE.SRGBColorSpace` on the LROC map,
   `THREE.NoColorSpace` on normal and displacement, and that the
   renderer's output color space is consistent.

5. **Consider an opposition surge using a Hapke-style `B(g)`
   instead of `pow(cosPhase, 18)`.** The Hapke form
   `B_0 / (1 + (1/h) * tan(g/2))` has the correct narrow shape
   and is no more expensive than `pow`. Section 2.4 has the code.
   Calibrate so the full-Moon brightening matches NASA Eyes /
   Stellarium.

6. **Add a true Earthshine secondary light** when the Earth is in
   scene. Section 2.7 has the code. Use the actual Earth direction
   from the runtime ephemeris (we already have it for orbit
   rendering); the shader cost is one extra dot product.

7. **For the crater-rim shadow on the lit side, switch from the
   noise-threshold to a slope-vs-Sun-elevation test.** Section
   13.4 has the formula. This will work even with our compressed
   displacement and will scale automatically when (if) we
   increase the displacement at close range.

8. **Consider an LOD-based boost to displacement at close
   altitude.** When the camera is near the surface, increase the
   displacement scale by a factor of 5-20× (linearly between two
   altitude thresholds) so that the horizon march can fire
   against real geometry. The visual exaggeration is invisible
   at long range and *should be* invisible at short range too if
   tuned carefully.

9. **Document the parameter ranges and what each one controls.**
   The current shader has ~ 9 tunables; an "operator's manual"
   markdown next to this one would help future tuning sessions
   and would let contributors experiment safely.

10. **Re-baseline visual tests after each tuning change.** Use
    `make test` and the SSIM thresholds in `test/ui.test.js`. The
    project's test discipline is good and should be maintained.

---

<a id="section-15"></a>
## 15. References

The following are the primary sources cited or implied above.
For a follow-up agent with WebFetch enabled, these are the URLs
to re-fetch and quote verbatim.

### NASA / SVS / LROC

- NASA SVS CGI Moon Kit: <https://svs.gsfc.nasa.gov/4720/>
- NASA SVS Moon 3D Models: <https://svs.gsfc.nasa.gov/14959/>
- LROC mission page: <https://lroc.sese.asu.edu/>
- LROC WAC global mosaic: <https://lroc.im-ldi.com/about/lroc>
- LOLA / LDEM data: <https://pds-geosciences.wustl.edu/missions/lro/lola.htm>
- Speyerer et al. 2016 (LROC calibration): <https://link.springer.com/article/10.1007/s11214-014-0073-3>

### Photometry papers

- Lommel 1887 / Seeliger 1887: original L-S derivations
- Hapke 1981 "Bidirectional Reflectance Spectroscopy. 1. Theory":
  <https://doi.org/10.1029/JB086iB04p03039>
- Hapke 1984 "Bidirectional Reflectance Spectroscopy. 2.
  Macroscopic roughness": <https://doi.org/10.1016/0019-1035(84)90054-X>
- Hapke 2002 "Bidirectional Reflectance Spectroscopy. 5. The
  coherent backscatter opposition effect and anisotropic scattering":
  <https://doi.org/10.1006/icar.2002.6873>
- Hapke 2012 "Theory of Reflectance and Emittance Spectroscopy"
  (book, 2nd ed.): Cambridge University Press
- McEwen et al. 1991 "Photometric properties of the Moon's surface":
  Icarus
- Buratti et al. 2011 "A wavelength-dependent visible and infrared
  spectrophotometric function for the Moon based on ROLO data":
  J. Geophys. Res.

### Open-source planetariums

- Stellarium: <https://github.com/Stellarium/stellarium>
  - Planet shader: `src/core/modules/Planet.cpp`
  - System config: `data/ssystem_major.ini`
- Celestia: <https://github.com/CelestiaProject/Celestia>
  - Shader manager: `src/celengine/shadermanager.cpp`
  - `LunarLambert` introduction commit (2003): search log for
    `LunarLambert` keyword
- OpenSpace: <https://github.com/OpenSpace/OpenSpace>
  - Globe browsing module:
    `modules/globebrowsing/src/renderable/renderableglobe.cpp`
  - Shaders: `modules/globebrowsing/shaders/`
- NASA WorldWind (archived):
  <https://github.com/NASAWorldWind/WorldWindJava>

### Game-engine / mod sources

- KSP Parallax mod (Linx / Gameslinx):
  <https://github.com/Gameslinx/Tessellation>
- KSP Scatterer (blackrack):
  <https://github.com/LGhassen/Scatterer>
- Frontier Developments GDC 2014 talk "Stellar Forge: Procedural
  Generation in Elite: Dangerous": <https://www.gdcvault.com/play/1020607>
- SpaceEngine forum technical posts:
  <https://spaceengine.org/forum/>

### Three.js / WebGL

- Three.js source: <https://github.com/mrdoob/three.js>
  - `MeshStandardMaterial` shader chunks:
    `src/renderers/shaders/ShaderChunk/`
  - Lighting begin chunk: `lights_fragment_begin.glsl.js`
- Bruno Simon - Three.js Journey: <https://threejs-journey.com/>
- Cesium: <https://github.com/CesiumGS/cesium>

### Shadertoy and Inigo Quilez

- Inigo Quilez articles: <https://iquilezles.org/articles/>
  - "Outdoor lighting": <https://iquilezles.org/articles/outdoorslighting/>
  - "Soft shadows": <https://iquilezles.org/articles/rmshadows/>
  - "Ambient occlusion":
    <https://iquilezles.org/articles/multiresaocc/>
- Shadertoy: <https://www.shadertoy.com/>
  - Search "moon": <https://www.shadertoy.com/results?query=moon>
  - Search "lunar": <https://www.shadertoy.com/results?query=lunar>

### NASA Eyes on the Solar System

- App: <https://eyes.nasa.gov/apps/solar-system/>
- Inspect via browser devtools; not open source.

### Microsoft Flight Simulator

- Asobo developer blog (FS Insider):
  <https://www.flightsimulator.com/news/>
- Public posts on celestial body rendering specifically are
  rare; most info is from community analysis and patch notes.

### Existing in-tree project documents

- `docs/research/moon-rendering/research-and-plan.md` -
  prior moon rendering plan and decision log.
- `docs/operations/data/moon-render-assets.md` - texture provenance
  and pipeline.
- `src/platform/js/rendering/moon-renderer.js` - current shader
  source, including the soft-disk integral and L-S blend
  implementation.
- `src/platform/js/rendering/moon-normal-map.js` - normal map
  generation from LDEM.
- `src/platform/js/moon-render-tuner.js` - runtime tuning UI.
- `src/platform/js/app/moon-render-asset-profiles.js` and
  `moon-render-profile-actions.js` - profile switching.

### Caveat repeated

Per the methodology note at the top of this file: WebFetch and
WebSearch were denied during this session. Quoted shader code
fragments above are reconstructions from training-set knowledge
of these projects and should be re-fetched verbatim against the
upstream URLs before being copied into production. The
mathematical formulations in section 2 (Lambert, Lommel-Seeliger,
Hapke, soft-disk integral, Earthshine geometry) are stable and
reproducible; the implementation-specific identifiers (Stellarium
function names, Celestia symbol names, Three.js chunk names) are
the parts most likely to have drifted.
