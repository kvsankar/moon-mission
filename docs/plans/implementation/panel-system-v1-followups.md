# Panel System V1 Follow-Ups

Last reviewed: 2026-09-03

The shared registry, launcher, lifecycle, built-in panel defaults, persistence,
and Dockview workspace have shipped. The full foundation and migration notes
are preserved in the
[reviewed history](../../archive/plans/panel-system-v1-followups-history-2026-09-03.md).

## Remaining Outcomes

1. Define an immutable `viewSignature` for built-in and future user-created
   view panels.
2. Add a `Create View` flow seeded from the current main semantic view.
3. Separate immutable panel identity from mutable presentation and layout
   state.
4. Persist user-created view panels and restore them safely per mission.
5. Add rename behavior without changing panel identity, and expose identity in
   the shared panel information surface.
6. Decide whether built-in panel definitions, rather than only their default
   state, should move into mission configuration.
7. Add regression coverage for identity, creation, rename, persistence,
   restore, and representative layout edge cases.

## Deferred Until Explicitly Promoted

- standalone manager panel
- named layouts per mission
- mobile panel creation and management

Behavioral authority:
[Panel System V1](../../specs/ui/panel-system-v1.md).

Current defect work remains separate:
[Panel Runtime Regressions](panel-runtime-regressions.md).
