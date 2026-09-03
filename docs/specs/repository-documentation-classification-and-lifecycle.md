# Repository Documentation Classification And Lifecycle

## Purpose

Define the required categories, locations, authority boundaries, and review
states for Moon Mission documentation.

The rationale is documented in
[Documentation Architecture](../designs/documentation-architecture.md). The
working procedure is [Documentation Maintenance](../operations/contributor/documentation-maintenance.md).
Per-document status lives only in the
[Documentation Classification Tracker](../plans/implementation/documentation-classification-tracker.md).

## Governing Rules

1. Every document has one primary category and one canonical path.
2. A mixed document is assigned to its most relevant category. Split it only
   when doing so creates materially clearer ownership.
3. Required behavior, architecture decisions, delivery work, research,
   procedures, and evidence must not compete as duplicate authorities.
4. Relocation preserves all information. Refactoring moves information rather
   than compressing or silently dropping it.
5. Do not retain compatibility pointers. Update live inbound links directly.
6. Do not add status frontmatter to every document. Track review state in the
   classification tracker.
7. The frozen recovery roadmap is historical evidence and is never edited as
   part of documentation maintenance.

## Categories

### Specifications

Target: `docs/specs/`

Specifications define what must be true. They own accepted behavior,
semantics, interfaces, data contracts, compatibility, failure behavior,
validation requirements, UI interaction contracts, and scientific-model
constraints.

Tests and implementation are judged against specifications. When code and a
specification differ, review determines whether the code is defective, the
requirement is obsolete, or a product decision remains unresolved. Code does
not automatically override intent.

### Designs

Target: `docs/designs/`

Designs explain why and how the system is structured. They own architecture,
component responsibilities, dependency direction, data and execution flows,
important tradeoffs, and accepted structural decisions.

A design links to the specification that owns required behavior and does not
restate the same contract as a second authority.

### Plans

Targets:

```text
docs/plans/roadmap.md
docs/plans/breakdown/<scope>.md
docs/plans/implementation/<scope>.md
```

Plans own sequencing, priority, unresolved decisions, delivery slices, and
completion boundaries. A plan links to accepted specifications and designs
instead of defining their behavior or architecture.

The repository roadmap is reserved for product and engineering priority. The
documentation classification and content-review queue lives only in its
dedicated tracker.

### Research

Target: `docs/research/`

Research preserves source surveys, scientific investigations, experiments,
alternatives, measurements, and syntheses. It informs current decisions but
does not approve behavior or schedule work.

Point-in-time research does not require review/refactor/re-review merely because
it is relocated. Those steps become necessary only when research is promoted
into current specification, design, plan, or operational authority.

### Operations

Target: `docs/operations/`

Operational documents define current procedures for contributor workflow,
testing, CI, data refresh, repository synchronization, asset generation, media
packaging, deployment, and production operation. Group them by operation where
useful:

```text
docs/operations/contributor/
docs/operations/ci/
docs/operations/data/
docs/operations/media/
docs/operations/release/
docs/operations/deployment/
```

### Evidence

Target: `docs/evidence/`

Evidence records point-in-time audits, reviews, handoffs, baselines,
measurements, and findings. Evidence may support a decision but cannot silently
become product intent or backlog.

Use the most specific applicable folder:

```text
docs/evidence/audits/
docs/evidence/reviews/
docs/evidence/handoffs/
docs/evidence/baselines/
docs/evidence/measurements/
```

### Archive

Target: `docs/archive/`

Archive completed, abandoned, invalidated, or superseded material only after
its current significance has been reviewed. Age alone is not a reason to
archive research or unresolved evidence.

Archived material is historical context and never controls current behavior,
architecture, or delivery.

### Public Documentation

Target when needed: `docs/site/`

Public documentation teaches users how to understand and use Moon Mission. The
root `README.md` remains the public entrypoint until a separate site source is
adopted.

## Conventional And Colocated Documents

These remain at conventional or load-bearing locations:

- root `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `README.md`;
- local-only root `PATHS.md` when present as a machine migration record;
- `docs/README.md` as the documentation router;
- mission/data-local `README*.md` files; and
- tool-local READMEs such as `scripts/moon-tune/README.md`.

They route to canonical documents and do not become competing authorities.

## Corpora And Generated Product Data

Reference corpora belong under `docs/research/corpora/`. Generated data consumed
by the product belongs under `assets/` and is outside the engineering-document
taxonomy.

Generated Markdown inside a product-data collection remains generated data; its
file extension does not make it an engineering document.

## Frozen Recovery Baseline

`docs/operations/current-status-roadmap.md` is an immutable recovery snapshot,
not the mutable planning authority.

- Do not edit, split, move, or update it during documentation maintenance.
- New decisions and progress belong in current specifications, designs, plans,
  operations, evidence, or the documentation tracker.
- Its links may retain historical paths. Do not create compatibility pointers
  solely to keep those links live.

## Review States

The classification tracker records these steps independently:

- **Relocation**: the document is in its canonical category.
- **Review**: intent has been checked against current code, tests, and accepted
  decisions where applicable.
- **Refactor**: mixed content has been moved to the correct owner without
  information loss, or marked `not needed`.
- **Re-review**: an independent reviewer has checked the resulting content,
  ownership, links, and preservation.

Allowed values are `done`, `pending`, and `not needed`.

## Required Outcome

The repository documentation is conformant when:

- every document has one primary category and canonical path;
- live links target canonical documents directly;
- no compatibility pointers remain;
- current decisions have one owner;
- non-authoritative research, evidence, and archive are not presented as
  current intent;
- generated product data is outside the documentation taxonomy;
- the tracker accurately reports pending review/refactor/re-review work; and
- the frozen recovery baseline remains unchanged.
