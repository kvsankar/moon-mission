# Frame And Shoot Lighting Implementation Plan

Specification:
[Frame And Shoot Lighting And Exposure](../../specs/rendering/frame-and-shoot-lighting-and-exposure.md)

## Preserved Sequence

1. Current-state audit.
   - Inventory existing physical/photo/creative controls in Frame and Shoot.
   - Identify which controls need relabeling, grouping, or state separation.
   - Confirm the public UI wording before implementation.

2. Future exposure refinements.
   - Consider ISO/shutter/aperture labels as a photographer-friendly wrapper
     around EV/tone-mapping exposure.
   - Refine eclipse auto-exposure metering if a more detailed camera model is
     added.

3. Creative controls.
   - Group and label fill/gain controls as creative overrides.
   - Preserve independent tuning of Earth fill, Moon fill, Earthshine gain,
     Moonshine gain, stars, Sun optics, and corona presentation.
