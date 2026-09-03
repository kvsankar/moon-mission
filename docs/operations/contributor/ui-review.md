# UI Review

UI contract:
[Runtime Style And Interaction](../../specs/ui/runtime-style-and-interaction.md)

## Implementation Guidance

- Add shared primitives before copying local CSS into a second feature area.
- Prefer component classes named by role, not by the first feature that used
  them.
- Keep generated and static DOM aligned; reusable builders must output the same
  roles, state attributes, and class hooks.
- When a component is reused in main view and Frame & Shoot, test both contexts
  before calling the style pass complete.
- Comment style values only when they are compatibility bridges or named
  exceptions.
- Avoid version-only CSS churn unless an import must change for runtime cache
  behavior.

## Four-Pass Review

1. **Product hierarchy**: verify that visible priority matches the mission task.
2. **Component role**: map every control to the taxonomy and verify visual, DOM,
   and keyboard semantics.
3. **State and data**: check active, empty, loading, disabled, missing-data, and
   duplicate-data behavior.
4. **Responsive and layering**: check desktop, mobile, panel, popover, and Frame
   & Shoot contexts for clipping, overlap, focus, and touch behavior.

Findings cite both the user-facing consequence and the code anchor. Do not
report a value mismatch without explaining the ambiguity or regression it
causes.

## Audit Checklist

- Product hierarchy places mission time/scene above secondary configuration.
- Each toolbar or panel group has a clear intent and scope.
- Every control has a role from the shared taxonomy.
- DOM semantics match the role.
- Similar roles share shape, color, spacing, and state behavior.
- Checkbox groups read as checklist rows, not button grids.
- One-of selectors read as segmented/radio groups, not checklists.
- Configuration and persistent-panel launchers remain distinguishable.
- Open, enabled, selected, and applied states remain distinct.
- Semantic colors are limited to data, annotation, or status meaning.
- Rest, hover, focus, active/selected, disabled, and applicable loading states
  exist.
- Temporary UI renders above persistent panels and restores focus.
- Global temporary UI uses global layer tokens; panel-local UI stays within its
  panel layer.
- Labels, values, and controls align to stable columns.
- Text fits desktop and mobile widths.
- Generated and static versions have equivalent semantics.
- Data-backed controls expose missing and empty states.
- Shared tokens are used or the exception is documented.
- Mobile touch targets provide a `44px` hit area.

## Verification

Use focused unit tests for deterministic state/semantics and browser review for
layout, hit targets, focus, layering, responsive behavior, and visual hierarchy.
Intentional visual changes require baseline review rather than automatic
acceptance.
