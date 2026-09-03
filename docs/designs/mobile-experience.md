# Mobile Experience Design

## Purpose

Explain the structure used to deliver the requirements in
[Mobile Experience V1](../specs/mobile-experience-v1-spec.md).

## Design Direction

The mobile experience uses bottom navigation with focused overlay cards. This
is more discoverable than a gesture-only carousel and has lower cognitive load
than exposing every desktop control simultaneously.

The scene remains visible behind the active card. Cards are task surfaces, not
independent pages or independent renderers.

## Current Structure

The target shell contains four card identities:

| Identity | Availability | Responsibility |
| --- | --- | --- |
| `mission` | Always | Mission status, telemetry, event state, and transport |
| `orbit` | Always | Dimension, origin, axes/plane, and secondary orbit controls |
| `views` | Always | Shared-camera presets, FoV, and relevant Moon visibility |
| `compose` | Feature-gated | Earthrise/composition camera controls and short timeline |

The current implementation defines Mission, Views, and feature-gated Compose;
only Mission and Views are exposed because Compose is disabled. Orbit controls
remain in the repositioned shared header strip. This is recorded as incomplete
implementation of the target four-card architecture, not a replacement design.
Unknown or unavailable tabs currently normalize to Mission.

## Shared Scene Strategy

Views presets mutate the semantic state of the main mission camera. The mobile
shell does not instantiate the three separate sub-view renderers proposed in
the original design. This reaches the same thermal and performance goal by
avoiding auxiliary renderer creation at mobile widths.

The current shared header pill strip remains the temporary route to origin,
dimension, plane, and other essential orbit controls. The target Orbit card
will reuse that state and behavior rather than duplicate it.

## Layout Coordination

Mobile layout synchronization derives safe scene placement from:

- active-card bounds;
- header and pill-strip bounds;
- timeline and bottom-navigation bounds; and
- viewport height.

The canvas may be translated for visual centering. Transition state suppresses
unwanted motion while switching cards. These are presentation changes only;
mission time and semantic camera identity remain shared runtime state.

## State Isolation

Entering mobile captures the prior desktop camera/view state before applying
mobile presentation choices. Leaving mobile restores that snapshot. Views and
Compose apply simplified visual modes only while their card is active.

This keeps mobile and desktop as two presentations of one mission state rather
than separate applications.

## Control Density

Each card exposes the controls needed for its task. In the current incomplete
implementation, secondary orbit controls remain in the header strip. The
target Orbit card moves secondary controls behind its `More` surface. Desktop
panels remain suppressed at mobile widths. The design favors predictable
controls over gesture-only discovery.

## Target Completion

The original and still-current four-tab intent includes a dedicated Orbit card
and `More` drawer while keeping the orbit scene continuously visible. Their
implementation is tracked in
[Mobile Experience Follow-Ups](../plans/implementation/mobile-experience-followups.md).
