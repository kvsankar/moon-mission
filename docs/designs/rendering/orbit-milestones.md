# Orbit Milestones Design

## Purpose

Describe the implementation structure behind the behavior in
[Orbit Milestones](../../specs/orbit-milestones-spec.md).

## Current Data Flow

`computeEventsUpdate` produces normalized `eventInfos`. The milestone domain
layer converts reachable events into view models, and the app layer renders
those models in 2D or 3D. Selection dispatches
`mission-orbit-milestone-select`; mission playback coordination commits the
time change and pauses playback.

The current domain entry point is:

```js
resolveMilestonePositionFromSamples({
    eventInfo,
    scene,
    globalConfig,
    dimension,
})
```

It returns a resolved position with `bodyId`, `timeMs`, sample index, ratio, and
`sampled` or `generated-extension` source, or a failure such as
`invalid-time`, `pre-ephemeris`, `out-of-range`, `missing-body`, or
`missing-data`.

## Position Architecture

3D reads `scene.curvesById` and `scene.curveTimesById`. 2D reads
`scene.orbitSvgPointsByBodyId` and `scene.orbitTimesByBodyId`. These samples are
useful because they are already transformed into the displayed frame, not
because milestones conceptually depend on orbit curves.

Interpolation locates adjacent times and linearly interpolates the transformed
point. Exact times clone the exact sample. Out-of-range values fail rather than
clamp.

A future shared `positionAtTimeInCurrentFrame` evaluator may replace the sample
maps, but orbit construction and milestones must then use the same transform
path.

## View Models And Density

`buildMilestoneViewModels` resolves body, position, category, clickability,
generated provenance, and inferred priority. Current rendering caps candidates
at 24 and returns them in chronological order after priority filtering.

Major-event priority is inferred from event text. Label planning projects
markers to screen space, estimates text boxes, reserves viewport bands, and
greedily accepts non-colliding labels by priority and time. Zoom controls label
count and bounded font size.

Selected/current state is not yet connected to the model builder or renderers;
that gap is tracked in the follow-up plan.

## 2D Rendering

The 2D renderer creates SVG marker groups inside the orbit transform, with a
larger transparent hit circle, visible colored dot, optional text label, and
DOM mouse/focus/keyboard handlers.

The current renderer uses the document-wide id `orbit-milestones`; this must be
replaced with scene-owned selection before multiple panel renderers can opt in
safely.

## 3D Rendering

The 3D renderer creates a Three.js group containing small mesh markers and
bitmap `CanvasTexture` label sprites. Raycasting provides hover and selection
for pointer users. Label candidates are projected through the active camera.

Current marker size is bounded in world units from trajectory extent. Current
labels receive an additional world-space Y offset after screen-space planning,
so planned and rendered bounds can diverge. Keyboard/touch parity and a label
presentation whose projected position matches collision planning remain target
work.

## Popout And Selection Wiring

One DOM popout displays title, UTC time, burn summary, detail text, and
generated provenance. It is clamped to the viewport.

2D DOM markers dispatch selection directly. In 3D, scene pointer handling
selects the currently hovered raycast target. The dispatched event is handled
by mission playback coordination, which sets animation time, pauses, and emits
the standard committed timeline seek.

## Visibility State

The main UI exposes an Event Milestones toggle separate from the orbit toggle.
Its stored flag is currently scoped by view identity: origin, camera pair,
plane, and dimension. It is not yet scoped by panel identity.

The renderer currently requires both orbit visibility and milestone visibility,
and 3D objects use the default scene layer visible to auxiliary cameras. The
required independent preference and panel opt-in architecture are tracked in
[Orbit Milestones Follow-Ups](../../plans/implementation/orbit-milestones.md).

## Compare And Multi-Craft

Body ownership resolves from `eventInfo.body`, scene primary craft, global
primary craft, spacecraft mnemonic, then `SC`. Hidden craft objects suppress
their markers.

Compare-aware event collections exist in timeline code but are not currently
passed to milestone rendering. Compare support therefore requires explicit
event-source integration rather than projecting primary events onto the second
craft.
