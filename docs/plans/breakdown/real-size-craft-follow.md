# Real-Size Craft Follow Backlog

Last reviewed: 2026-09-03

This note preserves the useful product idea from the branch
`feature/center-lock-real-size-craft` without treating that branch as a
merge-ready implementation.

## Provenance

Branch commit:

- `ac7a2fd` `Add center lock and true-size craft lock behavior`

What that branch added:

- a center-lock UI for `Craft`, `Moon`, and `Earth`
- special handling for `lockOnSC`
- a "true-size craft" rendering path that stops distance-based auto-scaling for
  the locked craft
- configurable observer distance and craft size in meters

## Current Runtime Reality

The current runtime still has parts of the older lock plumbing:

- `lockOnSC`
- `lockOnMoon`
- `lockOnEarth`
- scene recentering paths in `scene-handler-class.js`
- zoom/lock behaviors in `zoom-actions.js`

However:

- the corresponding center-lock settings UI is no longer present in
  `mission.html`
- the branch implementation is tied to that older center-lock interaction model
- current camera/product direction is centered around the improved `Follow`
  semantics rather than reviving the old lock UI

## Preserved Product Intent

The useful idea to preserve is:

- when the user intentionally enters a close craft-inspection mode, the craft
  should be rendered at real-world size instead of being continuously resized to
  preserve apparent screen size

In other words:

- current behavior:
  - craft scale is inflated/deflated based on camera distance and FoV
  - this helps visibility at mission scale
- desired behavior in the special inspection mode:
  - the craft keeps a physically meaningful size in scene units
  - the observer moves appropriately relative to the craft
  - we do not fake apparent size by rescaling the craft every frame

## Interpretation For Current Camera Model

Do **not** treat this as "bring back center lock exactly as it was."

Instead, interpret it as a new current-state spec:

- apply true-size craft behavior to the appropriate `Follow Craft` /
  craft-inspection camera mode
- keep the improved follow semantics
- do not resurrect the old center-lock UI unless there is a separate product
  decision to do so

## Proposed Spec

### User-facing behavior

When the user enters the designated craft-inspection mode:

- the camera is positioned near the active craft at a configurable physical
  observer distance
- the craft is rendered at a configurable real-world size
- the craft is no longer distance-scaled to maintain apparent size
- leaving that mode restores the normal mission-scale craft visibility/scaling
  behavior

### Candidate configuration knobs

These came from the branch and are still reasonable starting points:

- `spacecraftModel.options.realWorldSizeMeters`
- `spacecraftModel.options.lockOnObserverDistanceMeters`

Possible modernized aliases if we want clearer semantics:

- `spacecraftModel.options.inspectRealWorldSizeMeters`
- `ui.cameraDefaults.followCraftObserverDistanceMeters`

Branch fallback values:

- real craft size fallback: `5 m`
- observer distance fallback: `5 m`

Those values should be revalidated before shipping.

### Scope boundaries

This behavior should affect only the intended inspection mode.

It should **not** automatically apply to:

- general `Follow Earth`
- general `Follow Moon`
- mission-scale semantic mounted views like `C→M` or `C→E`
- ordinary distant mission browsing where apparent-size boosting is still useful

## Implementation Guidance

### Keep

- the idea of converting a physical craft size in meters into scene units using
  `pixelsPerAU`
- the idea of a physical observer distance near the craft
- tests that verify the craft scale resolves from physical size rather than from
  camera distance

### Do not copy blindly

- the old center-lock UI controls from the branch
- the exact branch-specific coupling to `lockOnSC`
- clip-plane tweaks without retesting against the current renderer

### Preferred modern integration point

Reimplement against the current camera/follow system by:

1. defining a clear "craft inspection" / "true-size follow craft" mode
2. making craft scale policy mode-dependent
3. using real-world craft sizing only in that mode
4. leaving current mission-scale apparent-size behavior intact elsewhere

## Acceptance Criteria

- entering the chosen craft-inspection mode renders the active craft at a
  physically derived size, not distance-scaled apparent size
- observer distance is configurable and stable
- leaving the mode restores current mission-scale craft rendering behavior
- the feature works with the current follow/camera model, not the retired
  center-lock UI
- unit coverage proves the real-size path independently of the old lock UI

## Branch Hygiene Decision

Once this note exists on `master`, the branch
`feature/center-lock-real-size-craft` no longer needs to be kept around as the
only record of the idea.
