# Runtime Style And Accessibility Plan

Source review:
[Runtime Style Audit Review](../../evidence/reviews/style-audit-review-report.md)

Requirements:
[Runtime UX](../../specs/ui/runtime-ux.md) and
[Runtime Style And Interaction](../../specs/ui/runtime-style-and-interaction.md)

Preserved detailed May snapshot:
[Current Plan, 2026-05-19](../../archive/status/current-plan-2026-05-19.md)

## Review Boundary

The May audit found no critical release blocker, but its queue predates later UI
commits. Recheck every item against current implementation before promoting it
to active delivery. Accepted behavior belongs in the relevant UI specification;
unresolved observations remain review evidence.

## Queue To Reconcile

1. Create a control-role map.
2. Implement shared control primitives.
3. Convert primary Lunar Features modes to real tabs.
4. Clarify the desktop annotation/configuration header zone.
5. Rebuild Surface Points and Guides as compact checklists.
6. Define layer tokens and migrate local z-index ladders.
7. Raise Lunar Feature category labels to the typography floor or change the
   control pattern.
8. Normalize the Media filter drawer and facet semantics.
9. Unify static and generated Lunar Features panel structure.
10. Add loading, missing, empty, unavailable, and out-of-range states.
11. Run a copy and terminology consistency pass.
12. Complete the timeline behavior and semantics audit.
13. Run desktop/mobile screenshot, keyboard, screen-reader, touch, and missing
    data verification.

## Previously Reported As Closed Or Partial

The May snapshot reports progress on mobile header wrapping, disabled-control
clutter, mobile group labels, tap reliability, timeline time density, touch
targets, and Follow Moon north-up behavior. Verify those claims rather than
reopening or closing them from status prose alone.

## Preserved Implementation Order

1. Align control roles and semantics before further visual polish.
2. Separate binary scene toggles, configuration launchers, and persistent panel
   launchers.
3. Make Lunar Features, Surface Points, Guides, Media filters, and Frame &
   Shoot use shared primitives.
4. Establish layer tokens and remove local z-index ladders.
5. Make the timeline a first-class synchronized mission-time surface.
6. Add visible loading, missing-data, out-of-range, approximation, and
   provenance states.
7. Verify every major change in desktop, mobile, and Frame & Shoot contexts.

## Current Verified Gaps

The subsequent [Progressive Workspace UX](../implementation/progressive-workspace-ux.md)
adds space-dependent workspace visibility and compact composer disclosures,
including resolution of the short-panel hover-control overlap. See its
[verification evidence](../../evidence/reviews/progressive-workspace-ux-2026-09-15.md).

- Shared design tokens now live in `design-tokens.css`, consumed by both
  selectors, runtime controls and Dockview's nested theme shell. The September
  15 pass simplified chrome while retaining the existing panel/navigation
  structure. See [review evidence](../../evidence/reviews/visual-design-tokens-2026-09-15.md).
- Named layer tokens now cover the migrated header, timeline, mobile and
  auxiliary roots. Local component ladders and the compatibility
  `--ui-config-popover-z` alias remain; this is not a full stacking rewrite.
- The Frame and Shoot unavailable message now uses a fixed type token.
- Mobile playback and bottom navigation now meet the `44px` hit area. Secondary
  controls, such as unit selectors, view presets and collapse controls, still
  need the broader mobile accessibility workstream.
- Component state and keyboard semantics are not comprehensively tested.
- The previous Surface Points review showed that component anatomy, spacing,
  grouping, and state rules need implementation by component family.

Use [UI Review](../../operations/contributor/ui-review.md) for the review and
verification procedure.
