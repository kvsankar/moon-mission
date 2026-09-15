---
doc_class: plan
status: current
scope: ui.progressive-workspace
---

# Progressive Workspace UX

User priority: preserve the scene and playback as space shrinks; collapse
secondary tools. Apply this to desktop windows and individual panels, including
height constraints, as well as mobile.

Requirement owner:
[Panel Progressive Disclosure](../../specs/ui/panel-progressive-disclosure.md).

## Delivery

Implementation and focused verification are complete. See
[review evidence](../../evidence/reviews/progressive-workspace-ux-2026-09-15.md).
Independent technical review remains part of roadmap closure. The user accepted
the current UI for now on 2026-09-15; the
[detailed human UX review](../breakdown/human-ux-review-plan.md) is deferred until
the other roadmap items are finished.

1. Introduce deterministic space levels and priority rules.
2. Adapt the Dockview workspace without closing mission panels or persisting
   automatic collapse over the expanded layout.
3. Expose collapsed tools through a keyboard/touch-accessible Tools surface.
4. Resolve short Frame and Shoot hover-control overlap through panel-local
   disclosure, preserving existing controls and state.
5. Verify wide → compact → minimal → focused → wide transitions, height-only
   reductions, explicit tool selection, focus, layout persistence and mission
   state preservation.
6. Review screenshots at representative sizes; update only intentional chrome
   baselines, and document remaining issues accurately.

The existing visual-token changes remain part of the working tree. The older
full-scene SSIM baseline reconciliation and independent review remain separate
closure checks; do not overwrite scene baselines to hide a failure.
