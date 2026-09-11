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
- Artemis II validation references must come from the local media manifest and lunar Chebyshev ephemeris, display source time/place/camera metadata, seed camera FOV and registered surface targeting, and support split, overlay, and render-only comparison through shareable URL state.
- `art002e009289` must resolve to `2026-04-06T22:41:58Z`, an Orion-Moon distance within 1 km of 8382.2 km, a registered source vertical FOV of `6.146` degrees, roll `+91.14` degrees, and the registered surface target `17.3461 N, 125.3453 W`. These camera values are calibrated from the 220 mm metadata against the reference crater field.
- Its default comparison FOV is `8` degrees so the render includes additional dark-side context. The reference image must be inset by the corresponding tangent-space angular scale, preserving registration within the source-image footprint.
- Overlay must use coincident 3:2 reference/render frames and adjustable reference opacity. References without calibrated pointing must be labeled unregistered and limited to split or render-only comparison.
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
- Compare Current and Physical DEM at `art002e009277`, `art002e009281`, `art002e010208`, and the Earthset sequence `art002e009288`/`art002e009289`.
- At Earthset, evaluate visible crater detail inside the lit-side terminator band, not only whole-disc luminance.
- Capture Low, Medium, and High runtime metadata: downloaded assets, texture dimensions, geometry vertices, normal-map dimensions, and representative memory measurements.
- Require unit tests, production build, visual screenshots, and independent review before merge.
