# Documentation Maintenance

Classification authority:
[Repository Documentation Classification And Lifecycle](../../specs/repository-documentation-classification-and-lifecycle.md)

Status tracker:
[Documentation Classification Tracker](../../plans/implementation/documentation-classification-tracker.md)

## Classify

1. Read the whole document.
2. Identify its primary purpose: required behavior, architecture, delivery,
   research, operation, evidence, archive, public guidance, or colocated
   instruction.
3. Assign one primary category even when the document is mixed.
4. Record its current and target disposition in the tracker before changing
   content.

Do not split a document merely because it contains several content types. Split
only when separate owners materially reduce ambiguity.

## Relocate

1. Confirm the destination does not already exist.
2. Record a content hash or perform an equivalent byte comparison.
3. Move the document without changing its body.
4. Confirm the destination matches the pre-move content.
5. Update live inbound and relative links directly.
6. Do not create a compatibility pointer at the old path.
7. Leave dated evidence, archive records, and the frozen recovery baseline
   unchanged unless their own review explicitly authorizes an edit.

For governed collections, move the whole source/generated unit only after its
producer and consumers are identified.

## Review Intent

For specifications, designs, plans, and current operations:

1. Compare the document with current code, tests, configuration, and accepted
   product decisions.
2. Record each mismatch as one of:
   - code defect;
   - obsolete document statement; or
   - unresolved decision.
3. Do not assume implementation automatically overrides documented intent.
4. Preserve point-in-time research and evidence unless they are being promoted
   into current authority.

Research and archive normally use `not needed` for the content review cycle.
Evidence follows its own closure/disposition lifecycle rather than being
rewritten to look current.

## Refactor Mixed Content

- Keep required behavior in a specification.
- Move architecture, rationale, dependencies, and execution flow to a design.
- Move TODOs, sequencing, decisions, and acceptance gates to a plan.
- Move procedures to operations.
- Preserve investigations and source analysis as research.
- Preserve audits, handoffs, and measurements as evidence.
- Archive only material whose current role has been explicitly resolved.

Move full information. Do not replace detailed content with a compressed
summary unless the original remains in evidence or archive and is linked.

## Independent Re-review

After refactoring, a reviewer who did not make the edits checks:

- intent against code/tests;
- category and ownership boundaries;
- preservation of all source information;
- unresolved mismatches in the correct plan or evidence record;
- local links and canonical paths;
- absence of compatibility pointers; and
- unchanged frozen recovery baseline.

Apply concrete findings, rerun checks, and request a focused final re-review.

## Update The Tracker

For each document, update:

- primary category and canonical path;
- relocation: `done`, `pending`, or `not needed`;
- review: `done`, `pending`, or `not needed`;
- refactor: `done`, `pending`, or `not needed`;
- re-review: `done`, `pending`, or `not needed`; and
- a concise evidence/basis note.

Do not put this queue in the repository roadmap or add status frontmatter to
the documents.

## Evidence And Archive

When an evidence finding becomes accepted work, link it from the owning plan.
The plan owns remediation and verification; evidence continues to own the
observation and review history.

Archive evidence only after every finding is closed, rejected, or explicitly
deferred. Archive completed or superseded plans only after their remaining work
has another current owner.

## Minimum Checks

- Confirm every target exists and every removed source is absent.
- Check active local Markdown links.
- Run `git diff --check`.
- Run focused tests when documentation paths are consumed by code or build
  tooling.
- Confirm no unrelated dirty-worktree changes were reverted or staged.
- Confirm `docs/operations/current-status-roadmap.md` is unchanged.
