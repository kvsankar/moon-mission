# Orion Model Follow-Ups

Design:
[Orion Procedural Model](../../designs/rendering/orion-procedural-model-generation.md)

## Preserved Next Iteration Ideas

1. Add optional RCS thruster clusters and antenna details.
2. Add subtle panel normal-map style variation procedurally or through
   lightweight textures.
3. Support further mission-specific plugin options such as array length,
   metallic levels, and color themes.
4. Introduce an optional high-detail GLTF override when available locally.

## Test Gaps

- [ ] Test plugin alias lookup and unknown-plugin fallback.
- [ ] Test option defaults and color/scale overrides.
- [ ] Test generated group/geometry composition at a stable semantic level.
- [ ] Test one-degree-of-freedom solar tracking and disabled tracking.
- [ ] Test the fixed attitude offset contract.
- [ ] Test mission-level versus craft-level configuration precedence.
- [ ] Test maintained `config.json5` compilation into runtime `config.json` for
  Orion plugin settings.

## Closure

Promote an idea only when it has an accepted visual/product outcome. Close this
plan after retained ideas are implemented or explicitly rejected and direct
plugin/configuration tests cover the current model.
