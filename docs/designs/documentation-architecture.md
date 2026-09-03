# Documentation Architecture

## Purpose

Explain the structural rationale behind the
[Documentation Classification And Lifecycle](../specs/repository-documentation-classification-and-lifecycle.md).

## Authority Model

Moon Mission contains required behavior, runtime architecture, delivery work,
scientific knowledge, operating procedures, review evidence, and history. These
materials have different authority and lifetimes even when they discuss the
same feature.

The category model gives each current decision one owner:

- specifications own required outcomes;
- designs own accepted structure and tradeoffs;
- plans own authorized or unresolved delivery work;
- operations own procedures;
- research informs decisions without approving them;
- evidence records observations and reviews; and
- archive preserves material that no longer governs current work.

Topic overlap is allowed. Authority overlap is not.

## Navigation Model

`docs/README.md` routes readers by purpose. Contributors should read the
smallest current specification first, then a design when structural context is
needed, and a plan only when delivery sequencing matters.

Research, evidence, and archive are excluded from ordinary authority searches.
They are read when a current document links to a specific record or when source
analysis, verification, or history is the task.

## Mixed Documents

Every physical document receives one primary category. This keeps placement
decisions simple when a record contains several kinds of material.

Splitting remains useful when one file actively mixes normative requirements,
architecture, and backlog. In that case, information moves to the appropriate
owners and the resulting documents link to one another. Splitting is not a
prerequisite for classification and must not become a reason to rewrite
point-in-time research or history.

## Status Model

Review status is external to the documents. The dedicated tracker distinguishes
relocation, review, refactor, and independent re-review without adding metadata
headers to every file or confusing document status with product priority.

## Exceptions

Repository instructions and colocated READMEs remain where their tools or
readers expect them. Generated runtime data belongs with product assets even
when one generated representation uses Markdown.

The frozen recovery roadmap remains an immutable historical snapshot. Earlier
migration work considered compatibility pointer files to preserve its old
links. That approach was rejected: the active tree stays clean, live references
are updated directly, and historical links may remain historical.

## Tradeoff

Removing compatibility pointers means some links in immutable evidence can
become stale. This is accepted in exchange for avoiding duplicate files and
ambiguous authority in the live tree. Git history and the classification audit
retain path traceability.
