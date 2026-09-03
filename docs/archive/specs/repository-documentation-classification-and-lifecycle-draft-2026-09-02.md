# Archived Documentation Classification Draft

This is the complete substantive record of the uncommitted policy draft that
preceded the current classification specification. It is retained because the
active document was refactored before the draft had Git history. The pointer,
frontmatter, migration, and roadmap rules below are historical and do not
govern current documentation.

Original metadata proposal:

```yaml
doc_class: spec
status: current
scope: repository.documentation
canonical_for:
  - repository-documentation-classification-and-lifecycle
```

Original status stated that each migration unit required disposition review,
independent review after refactoring, and corrective verification; it also said
the policy never authorized changes to the frozen recovery roadmap. The draft
adapted the related Skyfabric repository strategy and expected
`docs/README.md` to become the router after inventory and move-plan approval.

## Purpose And Governing Principle

Moon Mission contains product requirements, runtime architecture, mission and
ephemeris research, implementation plans, operating procedures, audits,
handoffs, source corpora, and historical proposals. These records have
different authority and useful lifetimes.

The governing principle was:

> Give each current engineering decision one clear owner, route contributors
> to the smallest applicable current document, and preserve transitional or
> completed records outside routine reading.

The draft sought to prevent contributors and agents from:

1. treating research, reviews, or status prose as approved behavior;
2. following a superseded plan because it still looked current;
3. maintaining the same decision in several documents;
4. reading large historical or evidence trees for ordinary work;
5. confusing generated/source corpora with engineering intent; or
6. losing traceability while cleaning the active documentation surface.

## Original Frozen Roadmap Exception

The draft treated `docs/operations/current-status-roadmap.md` as a deliberate
immutable exception:

- it remained at its current path;
- it could not be moved, split, rewritten, reclassified, or updated;
- its reviewed starting hash was
  `f6079ee27e7db5dd036471ea490e04cb22d4f077`;
- it was a point-in-time September 2026 recovery baseline rather than future
  plan authority;
- moved documents linked from it were expected to leave compatibility
  pointers; and
- future decisions belonged in new canonical documents, never the frozen file.

The pointer requirement was later rejected. The immutable-snapshot rule
remains active.

## Original Terms

- **Intent**: approved required behavior, accepted structure, or authorized
  delivery work.
- **Current authority**: the one document against which a current decision is
  judged.
- **Knowledge**: retained investigation, explanation, experiment, or source
  analysis that informs decisions without approving them.
- **Evidence**: a point-in-time audit, review, handoff, baseline, measurement,
  or check requiring confirmation or disposition.
- **Operation**: a current procedure for maintaining, validating, staging,
  publishing, or operating the repository and its delivery surfaces.
- **Corpus**: a governed collection of raw sources, normalized metadata,
  generated explanations, indexes, or supporting assets.
- **Archive**: completed, abandoned, invalidated, or superseded material kept
  for traceability and excluded from routine reading.
- **Compatibility pointer**: a minimal non-authoritative file at an old path
  whose sole purpose was routing old links.

## Original Category Definitions

### Specifications

Target: `docs/specs/`.

Specifications defined what must be true: accepted behavior, semantics,
interfaces, data contracts, validation, compatibility, failure behavior, UI
interaction contracts, and scientific-model constraints. Tests and
implementation were judged against specifications rather than research,
plans, reviews, handoffs, or status prose.

### Designs

Target: `docs/designs/`.

Designs explained why and how the system was structured: architecture,
component and package responsibilities, dependency direction, data and
execution flows, tradeoffs, and accepted architectural decisions. Designs
linked to specifications instead of restating their contracts.

### Plans

Targets:

```text
docs/plans/roadmap.md
docs/plans/breakdown/<scope>.md
docs/plans/implementation/<scope>.md
```

The roadmap owned the repository-wide queue. Breakdown plans divided broad
outcomes into useful child outcomes. Implementation plans described code-ready
outcomes as reviewable delivery units. Plans owned sequencing, priority, and
completion boundaries and linked to specifications/designs.

### Research

Target: `docs/research/`.

Research was durable knowledge: source surveys, scientific investigations,
experiments, alternatives, measurements, and living syntheses. It informed
intent without approving behavior or scheduling work. Age alone was not a
reason to archive research.

### Operations

Target: `docs/operations/`, with optional contributor, CI, data, media,
release, and deployment subfolders.

Operations covered contributor workflow, testing, data refresh, app/data sync,
asset generation, media packaging, deployment, and production runbooks.

### Public Documentation

Target if introduced: `docs/site/`. The root `README.md` remained the public
entrypoint. Public docs taught users but did not own engineering contracts.

### Repository Instructions And Colocated Guides

The draft retained root `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `README.md`;
mission/data-local READMEs; and tool-local READMEs such as
`scripts/moon-tune/README.md`. A later correction added local-only root
`PATHS.md` as a machine-migration exception.

### Governed Corpora

The original default target was `docs/research/corpora/` unless a corpus was
load-bearing. The HORIZONS collection was treated as one unit containing raw,
metadata, rendered Markdown, and index layers, movable only after producer,
consumer, link, and generated/source boundaries were verified.

The later accepted decision classified HORIZONS blurbs as generated product
data under `assets/horizons-blurbs/`.

### Evidence

Target: `docs/evidence/`, grouped into audits, reviews, handoffs, baselines,
and measurements.

Evidence recorded reviews, repository/data audits, context-switch handoffs,
provisional sync anchors, visual baselines, and measurements awaiting
acceptance. It could support but not silently change current intent.

Original evidence lifecycle:

```text
evidence created
  -> findings or disposition recorded
  -> affected checks rerun
  -> correction independently reviewed when judgment is required
  -> every finding closed or explicitly rejected/deferred
  -> final reviewed revision recorded
  -> docs/archive/<evidence-class>/
```

Addressing a comment was not closure. Evidence remained active while a finding
was open, merely claimed fixed, or waiting for disposition.

### Evidence Promotion

The original promotion flow was:

```text
evidence finding
  -> triage and disposition
  -> concise repository-roadmap item
  -> current scoped breakdown/implementation plan
  -> implementation or correction
  -> required checks
  -> independent review and fixes
  -> evidence updated with final revision/disposition
  -> roadmap item closed
  -> evidence archived when every finding is closed
```

The associated rules said evidence owned observations and test output; the
roadmap owned priority; the scoped plan owned remediation; behavior or
architecture changes updated their canonical owners; deferred/rejected
findings required explicit disposition; fixes required checks and independent
review; and evidence was archived only after all findings closed.

### Archive

Target: `docs/archive/`, grouped into audits, reviews, handoffs, specs,
designs, plans, status, and miscellaneous material.

The archive held resolved evidence, completed or abandoned plans, superseded
specifications/designs, replaced status narratives, and consolidated
duplicates. Archived material remained historical evidence but did not control
active work.

## Rejected Compatibility-Pointer Rules

The draft allowed pointers when continuity required them, especially for the
frozen roadmap. It required a pointer to:

1. state that it was non-authoritative;
2. link directly to the new canonical path;
3. contain no copied requirements, decisions, status, or TODOs;
4. be listed in the migration inventory; and
5. remain until protected inbound links could be retired without modifying the
   frozen roadmap.

The proposed metadata was:

```yaml
doc_class: compatibility
status: pointer
scope: <the routed scope>
```

The draft rejected symlinks in favor of Markdown pointer files for consistent
Windows, WSL, GitHub, and static-renderer behavior. The current policy rejects
all compatibility pointers.

## Original Target Tree

```text
docs/
  README.md
  specs/
  designs/
  plans/
    roadmap.md
    breakdown/
    implementation/
  research/
    corpora/
  operations/
    contributor/
    ci/
    data/
    media/
    release/
    deployment/
  evidence/
    audits/
    reviews/
    handoffs/
    baselines/
    measurements/
  archive/
    audits/
    reviews/
    handoffs/
    specs/
    designs/
    plans/
    status/
    miscellaneous/
  site/
```

The old mixed `docs/design/`, `docs/archived/`, `docs/investigations/`,
`docs/guides/`, and planning files under `docs/operations/` were not intended
to remain parallel current taxonomies.

## Original Reading Rules

1. Start with repository instructions and `docs/README.md`.
2. Read the smallest relevant specification for required behavior.
3. Read a design only for structure, ownership, tradeoffs, or rationale.
4. Read the roadmap or selected plan only for sequencing and delivery scope.
5. Read research only for scientific knowledge, sources, alternatives, or
   decision context.
6. Read operations only for the named operation.
7. Do not search evidence or archive by default.
8. Read evidence/archive only when linked, requested, or needed for
   traceability.
9. Do not infer current intent from a dated document.
10. Give every current behavior, architecture, and delivery decision one owner.
11. Treat the frozen roadmap as a recovery snapshot, not mutable planning.

## Rejected Metadata And Checks Proposal

The draft proposed compact frontmatter for living internal documents:

```yaml
doc_class: spec
status: current
scope: orbit.milestones
canonical_for:
  - orbit-milestone-behavior
```

It proposed evidence metadata for target revision/disposition, archive metadata
for prior class/reason/date, and corpus manifests for source/generated output
rules.

Proposed checks covered allowed classes/paths, required metadata, single
ownership, closed evidence, archive authority, links, pointer purity,
evidence/archive exclusion from default searches, and frozen-roadmap hash.

The current policy tracks status in one external tracker and does not require
per-document frontmatter.

## Original Migration Boundary

The draft required explicit proposed class, authority status, destination, and
compatibility disposition before migration. During migration it required:

1. no frozen-roadmap edits;
2. item-level review before moves/deletes;
3. no archival by age alone;
4. no merging solely by topic;
5. separation of mixed-purpose documents before authority assignment;
6. preservation of source/generated corpus boundaries;
7. inbound-link analysis and compatibility pointers;
8. index and ordinary-link updates in the same move;
9. Markdown-link and generated-doc checks; and
10. exact disposition for every source path.

Current practice changed item 5 to primary classification before optional
splitting and item 7 to direct live-link updates without pointers.

## Original Non-Goals

The draft did not authorize modification of the frozen roadmap, inventory
dispositions, Sarathi or `.sdlc` activation, normative research/evidence, a
public documentation site, movement of generated mission data into the app
repository, or replacement of Git/tests/CI/runtime artifacts as implementation
reality.
