# Moon Lighting Models and Resource Tiers

## Objective

Provide a user-selectable Moon renderer that separates lighting behavior from resource cost. The existing renderer must remain available while a physically constrained DEM renderer can be evaluated against timestamped lunar photography.

## User Controls

- Renderer: `Current` or `Physical DEM`.
- Resource tier: `Low`, `Medium`, or `High`.
- Physical tuning: BRDF blend, normal scale, relief scale, DEM-shadow strength, and exposure.
- Selecting `Current` disables the Physical controls without discarding their saved values.
- Selecting `Physical DEM` disables the Current preset/stage controls without discarding their saved values.
- Model, tier, and tuning choices persist locally and apply to every view of the shared Moon.

## Lighting Models

### Current

Preserve the corrected production stack and its diagnostic stage controls.

### Physical DEM

- Use the unperturbed sphere normal for the global solar-visibility boundary.
- Use the DEM-derived normal for local direct illumination.
- Use the DEM height field for horizon/cast shadows when the selected tier supplies a DEM.
- Retain a restrained Lommel-Seeliger/Lambert blend and Earthshine.
- Exclude Current-model terminator contrast, terminator tone, cavity relief, indirect occlusion, opposition boost, and shadow crushing.
- Keep normal scale, physical relief scale, DEM-shadow strength, BRDF blend, and exposure independently tunable.
- Always enable the color, DEM-normal, displacement, terrain-shadow, and Earthshine stages when their selected resource tier supplies the required data; never inherit a Smooth or Geometric diagnostic preset.

## Resource Tiers

| Tier | Color | DEM | Geometry | Normal generation | Horizon samples |
| --- | --- | --- | --- | --- | --- |
| Low | 4K | None | 128 x 64 | None | 0 |
| Medium | 4K | Standard | 384 x 192 | Up to 2048 wide | 6 |
| High | 16K | Detailed | 512 x 512 | Up to 5760 wide | 12 |

Low must not request the DEM, bind the neutral placeholder as displacement, or schedule generated-normal work. Switching down must release replaced DEM-derived textures and geometry. Switching up may load and build assets lazily.

## Compatibility

- Existing `fast` and `quality` profile identifiers remain valid and correspond to Medium and High.
- Legacy stored pipeline states default to the Current model.
- Legacy asset and terrain-shadow overrides retain their prior meaning.
- Current remains the default renderer until Physical DEM passes photographic validation.

## Validation

- Use `moon-observer-test.html` for renderer validation. It must render only the Moon and accept a UTC timestamp, geocentric or topocentric observer, camera roll, lighting model, and resource tier without loading mission or orbit state.
- Confirm the geometric mask against finite-distance projected illumination.
- Compare Current and Physical DEM at `art002e009277`, `art002e009281`, `art002e010208`, and the Earthset sequence `art002e009288`/`art002e009289`.
- At Earthset, evaluate visible crater detail inside the lit-side terminator band, not only whole-disc luminance.
- Capture Low, Medium, and High runtime metadata: downloaded assets, texture dimensions, geometry vertices, normal-map dimensions, and representative memory measurements.
- Require unit tests, production build, visual screenshots, and independent review before merge.
