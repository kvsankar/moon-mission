# Dockview Follow-Ups

Last reviewed: 2026-09-03

Dockview is now the normal desktop workspace, including the main scene,
workflow panels, auxiliary panels, persistence, reset recovery, floating
groups, and popouts. The phased migration and rollback history are preserved
in the [reviewed history](../../archive/plans/dockview-followups-history-2026-09-03.md).

## Remaining Outcomes

1. Reconcile the default Artemis II panel arrangement between runtime code and
   the Panel System specification; choose one authority and test it.
2. Decide whether layout reset clears legacy overlay geometry and shell state
   in addition to Dockview layout JSON.
3. Run focused browser, full UI, and production smoke verification for layout
   restore, reset, resize, tabbing, floating, popout, and transport clearance.
4. Retire `?legacyPanels=1` and `?dockPanels=0` only after the fallback removal
   is explicitly approved and the verification gate passes.

Behavioral authority:
[Panel System V1](../../specs/ui/panel-system-v1.md).

Related defect work:
[Panel Runtime Regressions](panel-runtime-regressions.md).
