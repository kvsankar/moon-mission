# Moon Lighting Models and Resource Tiers

## Objective

Provide a user-selectable Moon renderer that separates lighting behavior from resource cost. The existing renderer must remain available while a physically constrained DEM renderer can be evaluated against timestamped lunar photography.

## User Controls

- Renderer: `Current` or `Physical DEM`.
- Resource tier: `Low`, `Medium`, or `High`.
- Physical tuning: BRDF blend, normal scale, relief scale, DEM-shadow strength, exposure, and lunar tone response.
- Selecting `Current` disables the Physical controls without discarding their saved values.
- Selecting `Physical DEM` disables the Current preset/stage controls without discarding their saved values.
- Model, tier, and tuning choices persist locally and apply to every view of the shared Moon.

## Lighting Models

### Current

Preserve the corrected production stack and its diagnostic stage controls.

### Physical DEM

- Use the smooth sphere for Current and Low global solar visibility. In Physical Medium/High, allow raised terrain across the smooth terminator only when the ray from its displaced surface position clears the base lunar sphere.
- Use the DEM-derived normal for local direct illumination.
- Use the DEM height field for horizon/cast shadows when the selected tier supplies a DEM.
- Retain a restrained Lommel-Seeliger/Lambert blend and Earthshine.
- Exclude Current-model terminator contrast, terminator tone, cavity relief, indirect occlusion, opposition boost, and shadow crushing.
- Keep normal scale, physical relief scale, geometry-shadow strength, BRDF blend, exposure, and lunar tone response independently tunable.
- Always enable the color, DEM-normal, displacement, terrain-shadow, and Earthshine stages when their selected resource tier supplies the required data; never inherit a Smooth or Geometric diagnostic preset.

## Resource Tiers

| Tier | Color | DEM | Geometry | Normal generation | Physical horizon samples |
| --- | --- | --- | --- | --- | --- |
| Low | 4K | None | 128 x 64 | None | 0 |
| Medium | 4K | Standard | 384 x 192 | Up to 2048 wide | 0 |
| High | 16K | Detailed | 1024 x 512 | 5760 wide, worker-prepared | 20 |

Low must not request the DEM, bind the neutral placeholder as displacement, or schedule generated-normal work. Switching down must release replaced DEM-derived textures and geometry. Switching up may load and build assets lazily.

## Compatibility

- Existing `fast` and `quality` profile identifiers remain valid and correspond to Medium and High.
- Legacy stored pipeline states default to the Current model.
- Legacy asset and terrain-shadow overrides retain their prior meaning.
- Current remains the default renderer until Physical DEM passes photographic validation.

## Validation

- Use `moon-observer-test.html` for renderer validation. It must render only the Moon and accept a UTC timestamp, geocentric, topocentric, or fixture-backed Artemis II spacecraft observer, camera roll, lighting model, and resource tier without loading the mission application.
- Artemis II validation references must come from the local media manifest and lunar Chebyshev ephemeris, display source time/place/camera metadata, offer explicit camera FOV and registered surface targeting, and support split, overlay, and render-only comparison through shareable URL state.
- The harness must expose a thumbnail carousel of the curated terminator originals `art002e009277`, `art002e009278`, `art002e009279`, `art002e010208`, `art002e009281`, `art002e009283`, `art002e009287`, and `art002e009289`, in mission-time order. Carousel thumbnails use the staged local thumbnail convention; the comparison pane uses each original `mediaBase/web` image.
- Previous/next, keyboard, dropdown, and thumbnail selection must stay synchronized. Selecting a photograph switches the harness to that image's timestamp and Orion ephemeris; unregistered camera views remain Split-only.
- `art002e009289` must resolve to `2026-04-06T22:41:58Z`, an Orion-Moon distance within 1 km of 8382.2 km, a registered source vertical FOV of `6.146` degrees, roll `+91.14` degrees, and the registered surface target `17.3461 N, 125.3453 W`. These camera values are calibrated from the 220 mm metadata against the reference crater field.
- Its explicit calibrated comparison FOV is `8` degrees so the render includes additional dark-side context. Applying calibrated framing insets the reference by the corresponding tangent-space angular scale, preserving registration within the source-image footprint. The normal initial view fits the complete Moon.
- Overlay must use coincident reference/render viewports (3:2 when space permits) and adjustable reference opacity. References without calibrated pointing must be labeled unregistered and limited to split or render-only comparison.
- The registered `art002e009289` high-tier Physical render must keep aligned dark-region mean luminance within 5 levels and near-black coverage within 2.5 percentage points of the NASA web reference. The comparison region is the lower 62% of the coincident frame where reference luminance is between 2 and 85.
- The registered Ohm neighborhood must independently keep near-black coverage within 4 percentage points after mapping its source-image coordinates through the comparison-FOV inset.
- The widened comparison must expose substantial rendered terrain and near-black pixels below the inset source-image footprint; it must not satisfy the wider FOV with empty sky alone.
- Artemis fixture loading must not delay geocentric or site rendering. Superseded resource-tier requests must be aborted and must not replace current status or textures.
- Keep an offline geometry regression against NASA Dial-A-Moon at `2026-04-06T22:00:00Z`, and compare full-disc appearance at that gibbous phase plus the `2026-04-10T05:00:00Z` and `2026-04-24T03:00:00Z` quarter phases.
- Calibrate the default Physical display response against the Artemis II Earthset crew sequence without encoding a specific camera exposure into the geometry or DEM lighting stages; Frame & Shoot exposure compensation remains the per-shot control.
- Preserve crater-shadow separation near the terminator by calibrating local DEM-normal gain and cast-shadow strength separately from exposure; cast-shadow sensitivity must fall away rapidly outside the low-Sun band.
- Physical must evaluate the lunar-Lambert reflectance directly as `(1-L)*mu0 + 2*L*mu0/(mu0+mu)`; Current retains its established bounded photometric response.
- Detailed Physical must decode the NASA uint DEM in half-meter units relative to the 1737.4 km reference sphere, derive normals using spherical surface metrics, and combine displaced light-space depth with a unit-aware, curvature-correct horizon ray instead of the legacy UV blocker-threshold march.
- Detailed Physical may apply a profile-owned normal-strength compensation for finite DEM sampling, independently of the physical displacement and horizon height scale.
- Detailed Physical may selectively amplify coherent DEM slopes above the profile threshold to compensate for crater-wall smoothing at finite DEM resolution. Gentle terrain below the threshold must remain unchanged; Low and Medium profiles keep this compensation disabled.
- The Artemis-calibrated defaults are Physical exposure `0.40`, shadow-weighted tone gamma `1.06`, and, for the High profile only, normal-resolution compensation `2.08` plus selective slope boost `1.5` over raw slope magnitudes `0.16` to `0.34`.
- Confirm the geometric mask against finite-distance projected illumination.
- Compare Current and Physical DEM across the curated carousel, with registered pixel-level acceptance at `art002e009289` and qualitative terminator review for the unregistered originals.
- At Earthset, evaluate visible crater detail inside the lit-side terminator band, not only whole-disc luminance.
- Capture Low, Medium, and High runtime metadata: downloaded assets, texture dimensions, geometry vertices, normal-map dimensions, and representative memory measurements.
- Require unit tests, production build, visual screenshots, and independent review before merge.

### Comparison rotation and grazing illumination

The observer harness exposes 90-degree rotation buttons, a precise degree input,
and a zero reset below the rendered frame. These use the same camera roll
as the View slider, persist in copied URLs, and leave the reference image and
camera target/FOV fixed. PNG exports contain the rendered scene without controls.

Physical DEM shading tapers the perturbed-normal response over approximately the
last five degrees of position-based horizon clearance. This is an empirical
terrain shading approximation: it prevents Sun-facing DEM facets from remaining
bright right up to the solar visibility cutoff. It does not blur the image or
widen the solar disk. The weight vanishes for unperturbed normals; raised terrain
keeps its existing horizon clearance. Current shading is unchanged. The wider
art002e009287 photograph now has a crater-feature camera fit; exact comparison
uses Match photo framing, independently of the whole-Moon default.

### Independent comparison views

Artemis references now open with the entire lunar relief envelope fitted into the
render viewport, at the ephemeris observer position and time. Legacy photo FOV and
surface-target parameters no longer crop the default render. Camera framing is
explicit (`framing=camera`), available through Match photo framing for Earthset
or the manual camera controls. That mode preserves the existing photographic
regression without making its crop the default interaction.

Both panes have independent zoom, pan arrows, drag panning, cursor-anchored wheel
zoom, keyboard arrows/+/-/Home, and Fit controls. Controls sit below the images.
Render navigation updates the projection and redraws WebGL at viewport resolution;
photo navigation transforms the original image. The photo transform does not
follow render zoom, pan, or FOV. URLs persist both transforms and the photo base
scale. Fit Moon recenters and restores whole-Moon framing without changing the
photo or roll; Fit photo restores the complete source image independently. A new
reference resets both views. PNG export uses the current render projection.

All eight curated cameras now have crater-feature registration and a calibrated
photometric regression. Earthset retains its earlier camera values and separate
Ohm/dark-terrain thresholds. Match photo brightness applies only the three
reference exposure corrections that improve the measured error; changing the
Exposure slider selects manual mode, and explicit manual settings survive a
reference change or URL reload. Leaving Artemis in matched mode restores the
shared default exposure. The full-Moon default and independent zoom/pan remain.

See [Artemis reference calibration](../../research/moon-rendering/artemis-reference-calibration.md)
for fitting evidence, before/after error, rejected alternatives, and remaining
DEM-resolution limits. These are photograph-specific display corrections, not
changes to the physical Sun, geometry, or shared mission-renderer defaults.

### Physical fragment horizon regression

The Physical displacement horizon path must use its own fragment-stage define;
Three.js's `USE_DISPLACEMENTMAP` is vertex-only. Height UVs must be explicitly
passed to the fragment shader. Raised terrain may see the Sun at negative radial
altitude, so the physical DEM shadow march must use signed solar altitude too.

Require the GPU raised-surface visibility test and the upper-ridge Manzinus photo
regression in addition to whole-image photometry. The latter must reject missing
lit ridges and false illumination of adjacent dark terrain. See
[Manzinus horizon fix](../../research/moon-rendering/manzinus-horizon-fix.md).
