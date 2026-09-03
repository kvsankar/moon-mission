# Repository Boundary Design

## Purpose

Explain the source-of-truth layering behind the
[App And Data Repository Boundary](../../specs/data/repository-boundary.md).

## Layers

1. **Maintained app source**: runtime code, JSON5 configuration/manifests, UI,
   and lightweight product content change with application behavior.
2. **Generated data source**: heavy or regenerable ephemeris/media products are
   versioned in `moon-mission-data` to avoid app-code churn and repository
   weight.
3. **Mirrored contracts**: manifests required by both workflows remain
   identical and are audited.
4. **Staged runtime tree**: deployment/test commands copy canonical data into an
   app-shaped target and verify checksums.
5. **Published assets**: R2 receives the staged asset roots while the app shell
   is deployed separately.

This separates ownership from runtime path shape: a file may appear under
`assets/<mission>/data/` at runtime while its maintained source lives in the
data repository.

## Tradeoff

The split adds transfer and staging steps, so boundary auditing is required.
The benefit is independent app evolution, explicit generated-data ownership,
and deployable paths that remain stable across local, CI, and production use.
