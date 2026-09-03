# Orbit Milestones Follow-Ups

## Purpose

Track gaps between [Orbit Milestones](../../specs/orbit-milestones-spec.md) and
the current implementation. Architecture is described in
[Orbit Milestones Design](../../designs/rendering/orbit-milestones.md).

## Shipped And Pending Matrix

| Area | Shipped | Pending |
| --- | --- | --- |
| Position resolution | Exact/interpolated 2D and 3D transformed samples; pre-ephemeris/out-of-range handling | Direct current-frame evaluator and unsupported-frame distinction if introduced |
| View models | Burn/event categories, generated provenance, inferred priority, 24-marker cap | Selected/current retention and unavailable-event detail model |
| Marker sizing | Small bounded 2D and extent-based 3D dots | Screen-consistent 3D size across zoom |
| Labels | Zoom-based limits, bounded font size, screen-space collision planning | Selected/current label retention and exact agreement between 3D planned/rendered positions |
| Details | 2D hover/focus and 3D pointer-hover popout | 3D keyboard access, touch details path, unavailable reason presentation |
| Selection | 2D click/keyboard and 3D hovered-pointer selection dispatch normal mission-time seek | Persist selected/current marker state across rerender |
| Toggle | Separate Event Milestones UI and view-identity flag | Remove visual dependency on orbit visibility while preserving independent preferences |
| Panel scope | Scene-owned visibility hooks exist | Add panel identity and opt-in; prevent default-layer leakage to auxiliary cameras |
| Compare/multi-craft | Body resolution and hidden-craft suppression | Feed compare event collections and verify explicit ownership |
| DOM ownership | Scene stores group references | Replace document-wide 2D `#orbit-milestones` selection with scene-local ownership |
| Tests | Domain interpolation, density, collision, marker-size, view-state, and pill tests | Renderer, popout, selection, compare, multi-craft, accessibility, touch, and browser tests |

## Corrected Implementation Checklist

- [x] Resolve exact and interpolated positions from active-frame samples.
- [x] Reject pre-ephemeris and out-of-range positions without clamping.
- [x] Build burn/event view models with generated provenance and priority.
- [x] Render basic 2D and 3D markers.
- [x] Provide the shared compact pointer/focus popout where supported.
- [x] Dispatch selection through the normal mission-time commit path.
- [x] Apply initial zoom/density and collision rules.
- [x] Provide a separate main-view Event Milestones control.
- [x] Store milestone preference by current view identity.
- [ ] Decouple rendered milestone visibility from orbit-line visibility.
- [ ] Add selected/current state to candidate retention, marker styling, and
  label planning.
- [ ] Add panel identity, explicit auxiliary opt-in, and a dedicated render
  layer or equivalent isolation.
- [ ] Replace document-wide 2D milestone selection with scene-local ownership.
- [ ] Add a 3D keyboard-accessible marker/list bridge and touch detail path.
- [ ] Align 3D label collision coordinates with rendered label coordinates.
- [ ] Make 3D marker sizing screen-consistent across zoom.
- [ ] Feed explicitly owned compare events into milestone rendering.
- [ ] Represent unavailable reasons in a non-scene event details surface.
- [ ] Verify geocentric, lunar, relative, compare, and multi-craft behavior.

## Test Queue

Unit and integration coverage still required:

- missing-body resolution;
- selected/current candidate retention;
- orbit/milestone toggle independence;
- panel identity and auxiliary opt-in;
- popout content and disabled reason;
- mission-clock selection wiring;
- compare event ownership;
- multi-craft hidden-body behavior; and
- 3D keyboard/touch bridge behavior.

Browser coverage still required:

- burn and non-burn markers on `/artemis2/`;
- hover and focus details;
- click-to-seek and selected-state persistence;
- pre-ephemeris omission without false endpoint placement;
- label density at far, mission-wide, and close zoom;
- panel isolation; and
- mobile touch details and seek behavior.

Update screenshot baselines only after intentional visual review.

## Open Decisions

- Add explicit `importance` or `milestoneLevel` metadata, or retain inferred
  priority.
- Preserve selected marker state across origin and dimension changes when the
  event remains reachable.
- Default wide-zoom marker density to burns only, or retain priority-based
  mixed markers.
- Use DOM/CSS2D labels or another approach that gives collision planning and
  rendered labels one coordinate system.

## Closure

Close only after every retained requirement is implemented and tested, or an
explicit product decision changes the specification. Completion requires an
independent review of behavior, panel isolation, accessibility, and visual
density.
