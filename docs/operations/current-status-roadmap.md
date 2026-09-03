# Moon Mission Current Status And Recovery Roadmap

Audit date: 2026-09-02 (IST)

Status: independently reviewed, authoritative recovery and planning rollup for
the September 2026 resumption. Older plans and handoffs remain preserved as
detailed evidence, but their status labels predate the current Git and workspace
audit.

## 1. Executive Status

The canonical GitHub repositories are `kvsankar/moon-mission` and
`kvsankar/moon-mission-data`. Both were fetched during this audit. The app
repository has no open pull requests or GitHub issues; the data repository has
no pull requests or open issues. Windows `master` and `origin/master` both point
to `2bc3839` (`Merge transcript search stack`, 2026-05-23). The data repository
is clean on `main` at `7fae136` (`Update Artemis II transcript repairs`,
2026-05-20), exactly aligned with `origin/main`.

The app repository is not currently on `master`. Its primary Windows checkout
is on `orbit-milestones-snapshot` at pushed commit `e5c2427`, with 23 modified,
unstaged tracked files. Twenty-two files are the unfinished milestone refinement;
the twenty-third is a separate July deployment-workflow edit. The milestone
branch is three commits behind and one commit ahead of `master`.

This roadmap is one additional untracked file. Current Git state after the
audit is therefore 23 modified tracked files plus this untracked document.

The highest preservation risks are:

1. The 23-file active-checkout patch is uncommitted.
2. The RA/Dec worktree has two modified and two untracked files.
3. Local branches `streams2` and `wip/moon-render-pipeline-controls` each hold
   one commit that is on no remote and is not patch-equivalent to `master`.
4. Four local stashes retain large April/May work snapshots.
5. The archived March Windows checkout contains 15 non-patch-equivalent commits
   not anchored by any ref outside that archive, nine untracked refactor files,
   and one unique stash. These must be triaged before the archive is ever
   removed.

No destructive cleanup, checkout, merge, reset, stash application, or branch
deletion was performed during this audit.

## 2. Audit Scope And Confidence

Verified directly on 2026-09-02:

- Windows canonical checkout, all registered app worktrees, the companion data
  repository, legacy junction names, and archived Moon Mission artifacts.
- WSL canonical checkout and its compatibility symlink.
- `ubuntuvm01` project tree.
- Fresh Git fetches for the Windows app repo, WSL app repo, and Windows data
  repo.
- GitHub canonical repository names, all current remote branch refs, PR history,
  and open issue state.
- Local branches, commit reachability, branch divergence, stashes, dirty files,
  and focused/full unit-test results in the active Windows checkout.

Known limits:

- The Mac and other Linux VMs are documented as having live workspaces but are
  not currently reachable. They may contain additional work.
- The RA/Dec worktree has no local dependency installation, so its new tests
  could not be executed without changing that worktree.
- Browser, Playwright, SSIM, production smoke, and performance traces were not
  run during this inventory.
- `master` was inspected as a ref but not checked out because the active
  milestone work must remain undisturbed. The full unit run therefore describes
  `orbit-milestones-snapshot` plus its current working patch, not a clean
  `master` checkout.

## 3. Workspace And Clone Inventory

### 3.1 Windows: canonical app repository

Canonical path: `C:\sankar\code\kvsankar\moon-mission`

- Physical repository; parent of four linked worktrees.
- Legacy junction: `C:\sankar\projects\moon-mission` points here and is not a
  second clone.
- Branch: `orbit-milestones-snapshot`.
- HEAD: `e5c242788868012d41e51f8c49a806ced0549bd5`.
- Upstream: `origin/orbit-milestones-snapshot`, exact alignment.
- Working state: 23 modified tracked files, no staged or untracked files before
  this roadmap document was added.
- Shared stash stack: four entries, listed in Section 7.

Registered worktrees:

| Path | Branch / HEAD | Working state | Recovery state |
| --- | --- | --- | --- |
| `moon-mission-worktrees/artemis2-streams` | `wip/artemis2-media-streams` / `8f1d95d` | Clean for tracked/ordinary untracked files | Branch head is already in `master`; no commit exists only locally. |
| `moon-mission-worktrees/moon-render` | `wip/moon-render-terminator-isolation` / `7694616` | Clean for tracked/ordinary untracked files | Local branch is 15 commits ahead of its stale tracking branch, but every commit is already reachable from `origin/master`. |
| `moon-mission-worktrees/radec-labeling` | `wip/radec-labeling-isolation` / `3720db0` | Dirty: 2 modified, 2 untracked | Uncommitted RA/Dec grid projection, density, edge-label, and collision-layout work. Not remotely backed as a patch. |
| `moon-mission-worktrees/wt-1` | `wip/transcript-search` / `acab75b` | Clean for tracked/ordinary untracked files | Feature commit is merged into `master`; branch and remote still retained. |

The legacy names `moon-mission-artemis2-streams`,
`moon-mission-moon-render`, `moon-mission-radec-labeling`, and
`moon-mission-wt-1` under `C:\sankar\projects` are junctions to those same
worktrees. Do not count or delete them as independent copies.

The ignored `.tmp/rel-good` and `.tmp/rel-good.off` directories are not Git
repositories. Running Git inside them climbs to the parent repository, so they
must not be counted as clones or worktrees.

Ignored material must be classified before removing any worktree. Known examples
include two Moon-render review Markdown files, Moon-render `tmp/` and
`.playwright-mcp/`, media-worktree `assets/artemis2/media/`, `dist/`, `tmp/`,
and logs, transcript-worktree `test/screenshots/current/`, and main-checkout
environment backups, `.tmp/`, `archive/`, and locally staged runtime data.
"Clean" above does not classify these ignored artifacts as disposable.

### 3.2 Windows: companion data repository

Canonical path: `C:\sankar\code\kvsankar\moon-mission-data`

- Separate repository, not an app worktree.
- Legacy junction: `C:\sankar\projects\moon-mission-data`.
- Branch: `main` at `7fae136`; exact with `origin/main` after fetch.
- Clean working tree, no stashes, no other local or remote branches.
- No open PRs or issues.

Generated ephemeris, style sidecars, staged thumbnails, transcripts, and other
runtime data continue to belong here, per
[Mission Data Current State](mission-data-current-state.md) and
[Repo Sync Playbook](repo-sync-playbook.md).

### 3.3 WSL

Canonical path: `/home/sankar/code/kvsankar/moon-mission`

- Separate clean clone on local `master` at `051e13a` (2026-03-23).
- Freshly fetched `origin/master` is `2bc3839`.
- Local `master` is 686 commits behind and zero ahead.
- No local-only commits, stashes, additional local branches, or worktrees in
  tracked/ordinary untracked Git state.
- It can be fast-forwarded when needed. Ignored `.venv/`, `node_modules/`, and
  `test/screenshots/current/` appear generated but remain unclassified.

`/home/sankar/sankar/projects/archived/moon-mission-20260323` is a symlink to
this canonical checkout, not an archived second clone. Both paths resolve to
the same working tree and `.git` directory.

No WSL `moon-mission-data` checkout was found in either the canonical or legacy
trees.

### 3.4 ubuntuvm01, Mac, and other VMs

- No `moon-mission*` checkout was found under
  `/home/sankar/sankar/projects` on `ubuntuvm01`; its `/home/sankar/code` tree
  does not exist.
- Mac and other Linux VM workspaces are not reachable or inventoried. Do not
  claim the reachable copies are the only copies fleet-wide.

### 3.5 Archived Windows artifacts

`C:\sankar\projects\archived\moon-mission-backup-20260328-210729` is a
separate dated Git checkout at `a272193` (`docs: capture orbit UX and refactor
roadmap`). It has the canonical GitHub origin with stale local remote-tracking
refs, a legacy `mom` upstream, one stash, and these nine untracked files:

- `docs/refactor-audit.md`
- `docs/target-architecture.md`
- `src/platform/js/app/mission-bootstrap-state.js`
- `src/platform/js/app/mission-view-sync-actions.js`
- `src/platform/js/core/state/mission-state-core-port.js`
- `src/platform/js/core/state/mission-state-data-port.js`
- `src/platform/js/core/state/mission-state-port-helpers.js`
- `src/platform/js/core/state/mission-state-runtime-port.js`
- `src/platform/js/core/state/mission-state-scene-port.js`

These exact blobs and paths do not exist in current `master` and are not
reachable from any current ref. Their architecture intent was substantially
reimplemented later: view synchronization in `6fda0cf`, state ports in
`b3bc1c6`, and state-cell grouping in `779659b`. Current counterparts include
`mission-state-port-builders.js`, `mission-state-cell-groups.js`, and
`scene-view-plan-application.js`. Treat the drafts as unique historical
evidence/sketches, not merge-ready code.

The archive and current `master` diverge at `92d72bc`. The archive side has 19
commits: four are patch-equivalent to later changes, while these 15 are not
patch-equivalent and are not anchored by a local or remote ref outside the
archive:

- `4c1c5e2` `Add multi-craft mission support`
- `827e2ab` `test: refresh multi-craft visual baselines`
- `eac73ff` `Rename Chandrayaan 3 craft ids`
- `715a98d` `Add selectable orbit trail rendering`
- `2fecb30` `Refine orbit trail styling and controls`
- `15aaf95` `Tone down lower sky brightness`
- `d44dc6f` `chore: remove CH3 style sidecars from app repo`
- `987311c` `Add Chandrayaan 2 multi-craft support`
- `ca4cac6` `Fix relative style status handling`
- `fc554e8` `Fix relative mode moon lighting fallback`
- `496a9f0` `Fix relative mode sun frame handling`
- `4f3b5bd` `Remove standalone Vikram missions`
- `27c5d09` `Merge GRAIL twin mission`
- `d90f4b6` `Cache HORIZONS fetches and simplify defaults`
- `b5ea64d` `test: refresh visual baselines`

Several ideas were later reimplemented differently, and the current Orbit UX
Roadmap preserves much of the product intent, but that does not make these
commits disposable. Classify them one by one before archive retirement. The
August `MOVES.json` entry also records only `docs/refactor-audit.md` as
untracked; the archive currently has nine March-dated untracked files. The
ledger is incomplete or files were restored later, and timestamps cannot prove
which.

The archive also retains local branch `control-panel-ux` at `d28ffdf` and a
cached `origin/control-panel-ux`. GitHub no longer has that remote head, but the
commit is already an ancestor of current `master`; it is an archive cleanup
candidate only after the archive recovery ledger closes.

`C:\sankar\projects\archived\moon-mission-hist-ba8f8e4` is a non-Git file
snapshot, not a live workspace. It remains a recovery artifact.

## 4. GitHub And Remote State

### 4.1 Pull requests and issues

- `moon-mission`: no open PRs and no open GitHub issues.
- Historical PRs #1, #2, and #3 are merged; there are no other PR records.
- `moon-mission-data`: no PR history and no open GitHub issues.
- Pushing does not deploy. Production deploy remains manual.

### 4.2 Current app remote branches

The following refs were confirmed after `git fetch --all --prune`:

| Remote branch | Tip | Relationship to `master` | Action |
| --- | --- | --- | --- |
| `origin/master` | `2bc3839` | Release head | Keep. |
| `origin/orbit-milestones-snapshot` | `e5c2427` | 3 behind / 1 unique | Active feature snapshot; keep until integrated. |
| `origin/wip/gemini-moon-rendering-audit-final` | `fcd05ff` | 135 behind / 1 unique | Preserve for selective review; do not merge diagnostic images/scripts wholesale. |
| `origin/artemis2-transcript-captions` | `b22aa16` | Ancestor of `master` | Remote cleanup candidate after confirmation. |
| `origin/refactor/functional-core-shell` | `7294e13` | Ancestor of `master` | Remote cleanup candidate after confirmation. |
| `origin/wip/artemis2-media-streams` | `8f1d95d` | Ancestor of `master` | Remote cleanup candidate after worktree retirement decision. |
| `origin/wip/moon-render-terminator-isolation` | `d0d2d7d` | Ancestor of `master`; stale behind local branch | Remote cleanup or retarget candidate after Moon-render history review. |
| `origin/wip/transcript-search` | `acab75b` | Merged into `master` | Remote cleanup candidate after worktree retirement decision. |

There are no additional remote heads hidden behind open PRs.

## 5. Complete Local Branch Inventory

Divergence is `master-only / branch-only` after the September fetch.

| Local branch | Divergence | Remote durability | Classification / next decision |
| --- | ---: | --- | --- |
| `master` | `0 / 0` | Exact with `origin/master` | Current release line; not checked out. |
| `orbit-milestones-snapshot` | `3 / 1` | Snapshot commit pushed; working patch uncommitted | Active. Reconcile with `master`, fix defects, verify, then merge. |
| `streams2` | `126 / 1` | Unique commit `149ddc1` is local only | Preserve. Adds only unfinished `-10s`/`+10s`/seek UI markup and CSS, with no corresponding behavior in that commit. Triage or document as superseded; do not merge blindly. |
| `wip/gemini-moon-rendering-audit-final` | `135 / 1` | Unique commit pushed | Preserve for selective comparison. Large renderer rewrite plus ad hoc diagnostic scripts/images. |
| `wip/moon-render-pipeline-controls` | `59 / 1` | Unique commit `d00edee` is local only | Preserve. Adds a Moon render pipeline control system not present patch-equivalently on `master`; decide whether any controls remain product-worthy. |
| `artemis2-transcript-captions` | `35 / 0` | Pushed | Fully merged ancestor; cleanup candidate. |
| `arch-review-compare-mode` | `227 / 0` | No branch remote, but head reachable from `master` | Local cleanup candidate. |
| `refactor/functional-core-shell` | `251 / 0` | Pushed | Fully merged ancestor; cleanup candidate. |
| `wip/artemis2-media-streams` | `122 / 0` | Matching remote exists; no upstream configured locally | Fully merged ancestor; keep only while worktree/history is useful. |
| `wip/moon-render-terminator-isolation` | `135 / 0` | All local commits are on `origin/master` | Fully merged ancestor despite misleading `ahead 15` versus stale feature remote. |
| `wip/radec-labeling-isolation` | `204 / 0` | Branch head is on `master`; working patch is not | Preserve dirty worktree; branch deletion is unsafe until patch is committed or otherwise captured. |
| `wip/transcript-search` | `6 / 0` | Matching remote | Merged into `master`; cleanup candidate. |

The four branch-only commits (`e5c2427`, `149ddc1`, `fcd05ff`, `d00edee`) all
produce `+` output from `git cherry master`; none is patch-equivalent to
`master`.

Retained Moon-render checkpoint tags:

- `moon-render-iter5-composer-parity` at `7f9503c`
- `moon-render-polish` at `946a3df`

The older `r1.0` through `r1.0.6` release tags also remain.

## 6. Active Working Trees

### 6.1 Orbit milestones

Committed snapshot scope:

- Mission events become event/burn-colored markers at event-time positions.
- Brief collision-managed labels, hover/focus details, and selection-to-seek.
- 2D and 3D renderer integration plus domain tests.

Current uncommitted follow-up:

- Reduces dot size and hover inflation.
- Adds an `Events` header pill and Settings checkbox.
- Adds `viewOrbitMilestones` state and propagates it through mission state,
  scene composition, and view application.
- Stores the flag per semantic view identity and keeps 2D marker DOM ownership
  on the scene instead of document-wide lookup.
- Adds/updates four focused test files.

Known defects and unresolved requirements:

1. The full unit suite exposes a missing expected state-cell key in
   `test/mission-state-access.test.js`; the implementation added
   `viewOrbitMilestones`, but the contract expectation was not updated.
2. `areMilestonesVisibleForScene()` still requires `viewOrbit` to be true.
   That conflicts with the spec statement that milestone visibility is
   independent from the generic orbit-track toggle. The implementation must be
   fixed; this requirement is not open for re-decision.
3. Current persistence is keyed by semantic view identity, not a true panel
   instance ID. It supports the requested main-view-only first release, but it
   is not yet a general panel-instance visibility model for future auxiliary
   panels.
4. Marker-size caps pass focused unit tests but have not received current
   browser/SSIM visual approval.
5. Direct renderer visibility behavior lacks dedicated action-level tests.
6. The branch predates `b7c6313` camera fixes and the transcript-search merge;
   the committed heads merge cleanly in a tree comparison, but the 23-file
   tracked patch (228 insertions, 21 deletions including the deployment line)
   still needs real integration testing.
7. The new header control is labeled `Events`, but the timeline already has an
   unrelated `Events` control for event-strip disclosure. Rename or otherwise
   clearly distinguish the milestone control and test that both states remain
   independent.

The spec checklist currently marks the separate, panel/view-scoped toggle as
complete. Treat that item as reopened until orbit-independent visibility and
the control-name collision are corrected; update the spec checkbox in the
feature patch.

Spec tasks still explicitly open:

- Verify `geo`, `lunar`, `relative`, compare, and at least one multi-craft
  mission.
- Add Playwright coverage for visible markers, hover/focus details, and
  selection-to-seek.
- Review intentional visuals and update screenshots/baselines only when
  approved.

Current verification:

- Focused milestone suites: 4 files, 28 tests passed on 2026-09-02.
- Full unit suite: 193 files passed, 1 failed; 1,372 tests passed, 1 failed,
  6 skipped. The single failure is the missing `viewOrbitMilestones` expected
  key described above.
- `git diff --check`: clean.

Uncommitted milestone files are listed in Appendix A.

### 6.2 RA/Dec labeling

Path: `moon-mission-worktrees/radec-labeling`

Current patch:

- Modifies `src/platform/js/app/auxiliary-camera-views.js` (`+742/-314`).
- Modifies `test/auxiliary-camera-views.test.js` (`+127`).
- Adds untracked `src/platform/js/core/domain/ra-dec-grid-layout.js`.
- Adds untracked `test/ra-dec-grid-layout.test.js`.

The work adds sky-frame-aware RA/Dec projection, FoV-responsive grid density,
viewport-edge label placement, reserved-region avoidance, and collision
handling. Its branch base is already in `master`, but later `master` work also
changed `auxiliary-camera-views.js`, including the transcript-synced lunar
feature stack. Expect nontrivial integration work.

Verification status: not run. The ordinary focused Vitest invocation failed
before test collection because that worktree lacks `node_modules`; an attempted
use of the canonical checkout's runner still failed package resolution from the
worktree config. No further shared-runner setup was attempted. This is an
environment failure, not a test assertion result.

### 6.3 Deployment workflow edit

`.github/workflows/deploy-hetzner.yml` has one uncommitted line, last modified
2026-07-08:

```yaml
environment: sankara-net-production
```

It is unrelated to milestones and absent from all commits. Remote evidence
strongly indicates that it is intentional: the GitHub environment was created
on 2026-07-08, the same day as the local file edit, and seven deploy secrets
were scoped to it within minutes. The environment currently has no protection
rules and no deployment branch policy. Commit this separately from milestones;
before shipping, decide whether the lack of protection/branch rules is intended.

## 7. Stash And Archive Recovery Ledger

Do not apply these stashes wholesale to current `master`; all overlap code that
has changed substantially.

| Stash | Base / label | Preserved contents | Triage |
| --- | --- | --- | --- |
| `stash@{0}` / `de6ee4d` | 2026-05-05, `park media timeline wip` | 22 tracked files (`+718/-30`) plus 48 untracked files when included; early media manifest, media browser, timeline coordination, tests, docs, and many screenshots. | Much of the media stack later landed. Compare unique behavior/assets selectively, then classify. |
| `stash@{1}` / `2ab98f3` | 2026-05-04, `wip/master-before-sun-lighting-merge` | 35 tracked files plus 20 untracked media files; about `+16,518/-136` with untracked content. | Likely broad pre-merge safety snapshot. Preserve until compared against later media and lighting commits. |
| `stash@{2}` / `8bc07ec` | 2026-05-04, `wip/proper-fix-ssim-before-merge` | `test/ui.test.js` (`+161/-20`) and three visual baselines. | Review for lost visual assertions; never restore baselines without intentional visual review. |
| `stash@{3}` / `bd875ac` | 2026-04-06, `temp-autostash-before-sync-master-2026-04-06` | Sun-rendering research, large auxiliary-camera and Sun-renderer changes, CSS and ignore/design edits (`+1,946/-303` including untracked). | Compare research and any unique renderer intent; high conflict risk. |

Archived Windows checkout stash:

- `wip: orbit ux and runtime tuning before refactor` from 2026-03-28, stash
  commit `194d1e8` based on `a272193`.
- Contains 18 tracked files (`+315/-211`); it does not contain the nine later
  untracked files.
- Demonstrably recovered later: the pure overlap core, overlap-factor
  composition, `0.24/0.14` trail defaults, active/visible craft build priority,
  circular reference planes, and the influence-shell replacement for Moon SOI.
- Still requires explicit decisions: `minimalChrome=true` and
  `window.setMinimalChromeEnabled` are absent from current `master`; the stash
  proposes the opposite CH3 craft-color assignment from current authored
  config; some null guards were only partly retained; and dynamic overlap code
  remains globally disabled by `1fd9e58` despite the stash's enabled/tuned
  behavior.
- Only one complete stash file blob is byte-identical to current `master`.
  Never describe or discard the stash as wholesale-equivalent.

## 8. Roadmap

### Priority 0: preserve and establish a clean release base

1. Durably preserve this roadmap document so the recovery ledger itself is not
   left only as an untracked file.
2. Snapshot the milestone refinement and the deployment workflow edit as
   separate commits/branches. Do not mix production environment policy into the
   feature commit.
3. Snapshot the RA/Dec worktree, including both untracked files, before any
   rebase or merge attempt.
4. Push or otherwise durably capture `streams2` and
   `wip/moon-render-pipeline-controls`; both contain unique local-only commits.
5. Before any Git garbage collection or archive cleanup, classify the dangling
   commit tips in Appendix C and create durable refs for every item retained.
   Capture the unclassified dangling blob/tree tips in a recovery bundle or
   equivalent object-database backup until their disposition is known.

### Priority 1: finish orbit milestones

1. Rebase or merge the feature onto current `master` while preserving the
   camera fixes and transcript-synced lunar feature stack.
2. Update the mission state access contract test.
3. Make milestones independent of orbit-track visibility, as the accepted spec
   requires, and reopen the premature checklist item until that is verified.
4. Keep the first release main-view-only. Introduce real panel-instance keys
   only if/when auxiliary panels gain milestone rendering.
5. Rename or disambiguate the milestone control from the timeline `Events`
   disclosure and test their state independence.
6. Add direct visibility/action tests and Playwright hover/focus/seek coverage.
7. Run the full mode matrix, multi-craft case, browser smoke, UI/SSIM suite, and
   intentional visual review.
8. Merge to `master`, then retire the feature branch only after clean post-merge
   verification.

Release-level checks alongside this work: if the Broadcast-darkness or covered
transport-control failures reproduce, treat them as release blockers rather
than deferring them behind branch archaeology.

### Priority 2: recover or close active branch work

1. RA/Dec labeling: install dependencies in its own worktree, run focused and
   full tests, reconcile `auxiliary-camera-views.js` with current `master`, and
   decide whether to ship the extracted pure layout module. Remove the old
   implementation currently left unreachable after the early return in
   `renderComposerRaDecGridOverlay()`, then verify both grid-line rendering and
   collision-managed label placement.
2. Moon rendering:
   - compare `d00edee` pipeline controls against the current Standard/Detailed
     asset-profile model;
   - mine `fcd05ff` only for validated renderer corrections;
   - retain approved checkpoint tags;
   - exclude ad hoc diagnostic binaries/scripts from a production merge unless
     deliberately promoted.
3. `streams2`: determine whether explicit media seek buttons/timeline remain a
   desired feature. The commit is UI-only and incomplete as-is.
4. Deployment environment: commit the strongly evidenced environment-scoping
   change independently, after deciding whether production approvals or branch
   restrictions should be configured.
5. Archive/stash archaeology: compare and classify all five stash records, the
   15 archive-only commits, and nine archived untracked files as `landed`,
   `superseded`, `salvage`, or `retain-for-reference`. Explicitly decide
   `minimalChrome`, CH3 color assignment, overlap activation, and residual null
   guards.
6. Fast-forward the clean WSL clone when it is next used. This is maintenance,
   not a release-base blocker.

### Priority 3: current product workstreams

#### Artemis II media and broadcast

Open or partially open work retained from
[Artemis II Media Workstream](artemis2-media-workstream.md):

1. Reproduce and fix the Flyby Broadcast panel going fully dark.
2. Upload/verify long-form HLS assets, content types, CORS, and cache behavior.
3. Build and persist piecewise stream-to-mission-time segment maps.
4. Preserve the schema-v4 operating invariant: use
   `displayStartSeconds`/`displayEndSeconds` for visible timing and raw
   `startSeconds`/`endSeconds` only as provenance.
5. Continue discovery UX: lunar-feature mention integration landed in
   `acab75b`; entity browse/search, speaker filters/colors, confidence styling,
   duplicate-run compaction, and broader event linkage remain to be reconciled.
6. Add complete source/license attribution.
7. Prepare blog, Reddit, Hank Green email, and launch communications.
8. Re-test the intermittent corrupt/truncated browser warning for
   `55196663265_ef59978360_o.jpg`.
9. Resolve remaining media-dot selection reliability and event/media overlap or
   hit-target issues.
10. Decide whether to add the deferred full horizontal media scroller,
    separate synchronized multi-stream panels, and per-item license/source URL
    enrichment.

Transcript preservation and verification backlog from
[Artemis II Transcript Complete Handoff](artemis2-transcripts-complete-handoff.md):

- P1: commit a rebuild/regeneration document in the data repo; decide whether
  the transcription workspace's `INTEGRATION.md` migrates there.
- P1: decide how `UNRESOLVED`/`UNKNOWN` speakers display.
- P1: spot-check 20 random word timestamps against video (target drift at or
  below 200 ms) and borderline-confidence speaker clusters.
- P2: add transcript property tests, search regressions, and a formal JSON
  Schema.
- P2: decide entity-browser UX, collapsed duplicate cues, low-confidence
  styling, mission-event markers above the player, and whether an actual
  concatenated MP4/HLS is needed.
- Retained known limits: no machine-readable mission UTC/MET sidecar,
  unresolved `SCIENCE_OFFICER` split, Trevor Graff not surfaced as a speaker,
  99.4 percent rather than 100 percent word alignment, and cosmetic repeated
  `_disambiguated` filename generation.

#### Performance and responsiveness

Open queue from [Performance Workstream](performance-workstream.md):

1. Record Chrome Performance traces for `/artemis2/` across closed panels,
   Mission Media, Broadcast, and high-speed playback.
2. Coalesce drawer/flyout/thumbnail/image layout reads into scheduled frame
   work.
3. Coalesce bursts of media/HLS readiness rerenders.
4. Add regressions for playback-only rendering, registry sync, bounded HLS
   seek/startLoad calls, and unchanged marker data.
5. Run desktop runtime smoke/performance checks with animation and media active.

#### Panel system

Open gaps from
[Panel System V1 Implementation Plan](../design/roadmap/panel-system-v1-implementation-plan.md):

1. Define immutable `viewSignature`.
2. Add `Create View` from the current main semantic view.
3. Support user-created view panels.
4. Separate panel identity from mutable presentation state and add rename.
5. Decide whether built-in panel definitions, not only defaults, move to mission
   config.
6. Expand panel-layout edge-case regression coverage.
7. Decide the remaining deferred panel scope: standalone manager, named
   layouts, mobile panel UX, floating groups, popout windows, and whether reset
   clears both legacy and Dockview state.

#### Timeline and geometry narrative

Unchecked work from
[Orbit-First Timeline Plan](../design/roadmap/orbit-first-timeline-plan.md):

1. Consolidate transport, timeline, Events, Media, zoom, and readouts into one
   visual console.
2. Add larger invisible hit targets for dense markers and playhead drag.
3. Add screenshots for compact, events-expanded, media-visible, and zoomed
   states.
4. Add and render phase/data bands.
5. Add a geometry-moment model.
6. Add an app-level timeline hover/focus card.
7. Add geometry-aware media selection/view behavior.
8. Add derived timeline-state unit tests.
9. Add Artemis II timeline lane UI/screenshot coverage.

The source checklist still shows zoom-responsive ruler subdivisions as
unchecked, but commit `89c1170` implemented minor ticks in
`timeline-time-labels.js` with unit coverage. Treat implementation as landed;
browser/visual verification remains part of the screenshot work. After that
correction, ten source lines remain operationally open; phase/data model and
rendering are grouped above.

#### Main-view Photo Mode

[Main View Photo Mode Plan](../design/roadmap/main-view-photo-mode-plan.md)
remains unscheduled:

1. Define shared photo state.
2. Promote Frame and Shoot render helpers.
3. Add a native Photo control panel.
4. Decide whether Photo enhances the current camera or creates a craft-anchored
   shooting camera.
5. Migrate overlays incrementally.
6. Converge or retire the floating Frame and Shoot panel only after equivalent
   behavior and coverage exist.

Open Photo decisions still include mission-specific versus global rollout,
persistence scope, survival of the phase-local flyby timeline, exposure-control
vocabulary, header-versus-panel control placement, and the minimum viable
feature required before Frame and Shoot stops auto-opening.

#### Orbit UX and mission data

Retained targets from
[Orbit UX Roadmap](../design/roadmap/orbit-ux-and-refactor-roadmap.md):

- Re-enable and retune live overlap refinement where appropriate.
- Keep trail brightness ownership as `base opacity * overlap factor`.
- Evaluate percentile density tuning and slightly brighter trail defaults.
- Preserve URL-driven minimal-chrome capture mode intent.
- Preserve relative-mode Sun frame metadata and Moon-lighting fallback intent.
- Re-test lower-sky brightness treatment.
- Finish any remaining combined-mission catalog/brief/source/timeline cleanup.
- Continue active multi-craft UX/runtime polish and trail-style tuning as
  explicit slices, not by reviving retired staging branches.

#### Style, accessibility, and control taxonomy

The 2026-05-19 audit queue remains open unless a newer commit is explicitly
shown to close an item:

1. Create a control-role map.
2. Implement shared control primitives.
3. Convert primary Lunar Features modes to real tabs.
4. Clarify the desktop annotation/configuration header zone.
5. Rebuild Surface Points and Guides as compact checklists.
6. Define layer tokens and migrate local z-index ladders.
7. Raise Lunar Feature category labels to the typography floor or change the
   control pattern.
8. Normalize the Media filter drawer component and facet semantics.
9. Unify static and generated Lunar Features panel structure.
10. Add explicit loading/missing/empty/unavailable/out-of-range states.
11. Run a copy and terminology consistency pass.
12. Complete the timeline behavior/semantics audit.
13. Run desktop/mobile screenshots, keyboard, screen-reader, touch, and missing
    data verification.

#### Timekeeping, architecture, and craft inspection

Open time decisions:

- Final home for stream segment maps.
- Whether transcript tracks carry video-relative time, mission UTC, or both.
- How uncertain/piecewise stream synchronization is exposed.
- Canonical UTC/TDB regression tests.

#### Decision ledger

| Decision | Status | Blocks |
| --- | --- | --- |
| Infer milestone priority or author `importance` / `milestoneLevel` | Open | Optional mission-config/schema expansion; not required for the first merge if inference remains accepted. |
| Preserve selected milestone across origin/dimension changes | Open | Cross-view selection persistence. |
| Default dense wide views to burns only, revealing routine events on zoom | Open | Final marker-density behavior and visual baselines. |
| Author, derive, or hybridize timeline phase bands | Open | Phase/data-band model. |
| Let the visual timeline span mission chronology while seek remains ephemeris-bounded | Open | Out-of-range events/media presentation. |
| Represent media that cannot seek to an orbit sample | Open | Timeline and media empty/out-of-range states. |
| Auto-apply geometry-aware view presets or require `Show geometry` | Open | Geometry-aware media selection. |
| Generalize Earthset/Earthrise geometry beyond Artemis II | Research needed | Reusable geometry-moment abstraction. |
| Launch Photo Mode only for Artemis II or wherever capabilities exist | Open | Shared photo-state scope and config gating. |
| Persist Photo state per mission/browser or reset on load | Open | Photo state port and storage contract. |
| Retain the phase-local Frame and Shoot flyby timeline in Photo Mode | Open | Frame and Shoot convergence plan. |
| Use EV-only controls or expose ISO/shutter/aperture vocabulary | Open | Photo control model and UI copy. |
| Split Photo controls between header and native panel | Open | Photo panel information architecture. |
| Define the minimum viable Photo Mode before Frame and Shoot stops auto-opening | Open | Phase 6 retirement gate. |
| Store stream segment maps in app manifest or data sidecars | Open | Broadcast sync authoring workflow. |
| Carry transcript time as video-relative, mission UTC, or both | Open | Transcript/stream schema evolution. |
| Expose uncertain or piecewise synchronization in the UI | Open | Broadcast status and trust UX. |
| Add production approvals/branch restrictions to `sankara-net-production` | Open | Deployment governance, not current code behavior. |

Targeted architecture follow-ups only:

- Narrow the settings service/effect boundary.
- Put legacy global zoom/pan/plane mirrors behind an explicit compatibility
  adapter.
- Decide whether the remaining scene UI composition wrapper stays or folds into
  frame UI actions.
- Continue shrinking broad compatibility surfaces only when product work
  naturally touches them; do not restart a broad refactor campaign.

The [Real-Size Craft Follow Backlog](../design/roadmap/real-size-craft-follow-backlog.md)
preserves one additional product idea: add physically sized craft rendering and
observer distance in a modern craft-inspection/follow mode without restoring
the retired center-lock UI.

## 9. Branch And Workspace Cleanup Sequence

Cleanup is intentionally last:

1. Complete Priority 0 preservation.
2. Integrate or explicitly park milestones and RA/Dec work.
3. Classify the two local-only WIP commits, four app stashes, archived stash,
   15 archive-only commits, and nine archived untracked files.
4. Remove clean worktrees only after confirming no ignored local artifacts are
   needed.
5. Delete local ancestor branches.
6. Delete merged remote branches after one final fetch and GitHub check.
7. Consider removing stale archived snapshots only after their recovery ledger
   is closed and backup coverage is verified.

Candidate ancestor branches are listed in Sections 4 and 5. Unique branches
and dirty worktrees are not cleanup candidates.

## 10. Verification Gates For The Next Release

Minimum gates after recovery and integration:

1. `npm run configs:lint`
2. `npm run test:unit`
3. Focused milestone and RA/Dec suites
4. `make data-audit` if manifests, mission config, or runtime data boundaries
   change
5. `make test` for Playwright/SSIM UI coverage
6. Real `/artemis2/` smoke in `geo`, `lunar`, `relative`, and compare modes
7. At least one multi-craft mission smoke
8. Desktop and mobile interaction/overlap review
9. Production asset and HLS checks when media/deploy work is included

Do not update visual baselines merely to make SSIM pass. Review and explain
every intentional visual change.

## 11. Source Preservation Index

This rollup does not delete or replace the detailed records below:

Current or operational authorities:

- [Artemis II Media Workstream](artemis2-media-workstream.md): current media,
  stream, transcript, attribution, and launch TODOs as of May.
- [Performance Workstream](performance-workstream.md): current performance
  queue as of May.
- [Mission Data Current State](mission-data-current-state.md): app/data boundary
  state.
- [Repo Sync Playbook](repo-sync-playbook.md): app/data sync procedure.
- [Artemis II Media Assets](artemis2-media-assets.md): asset provenance and
  update workflow.
- [Artemis II Video Sync Anchors](artemis2-video-sync-anchors.md): stream anchor
  ledger.
- [Artemis II Transcript Complete Handoff](artemis2-transcripts-complete-handoff.md):
  rebuild, remaining UX, verification, and known-limit ledger.
- [Target Architecture](../design/architecture/target-architecture.md): current
  architecture direction and remaining targeted cleanup.
- [Time Synchronization And Timekeeping](../design/architecture/time-synchronization-and-timekeeping.md):
  clock vocabulary and unresolved time decisions.

Current behavioral specifications:

- [Orbit Milestones Spec](../design/specs/orbit-milestones-spec.md)
- [Timeline And Media Playback Spec](../design/specs/timeline-media-playback-spec.md)
- [Panel System V1 Spec](../design/specs/panel-system-v1-spec.md)
- [Panel Progressive Disclosure Spec](../design/specs/panel-progressive-disclosure-spec.md)
- [Camera State Transition Spec](../design/specs/camera-state-transition-spec.md)
- [Frame And Shoot Lighting And Exposure Spec](../design/specs/frame-and-shoot-lighting-exposure-spec.md)
- [Lunar Feature Controls Spec](../design/specs/lunar-feature-controls-spec.md)

Active or deferred roadmaps:

- [Orbit UX Roadmap](../design/roadmap/orbit-ux-and-refactor-roadmap.md)
- [Orbit-First Timeline Plan](../design/roadmap/orbit-first-timeline-plan.md)
- [Artemis II Media Timeline Plan](../design/roadmap/artemis2-media-timeline-plan.md)
- [Panel System V1 Plan](../design/roadmap/panel-system-v1-implementation-plan.md)
- [Dockview Integration Plan](../design/roadmap/dockview-panel-layout-integration-plan.md)
- [Main View Photo Mode Plan](../design/roadmap/main-view-photo-mode-plan.md)
- [Real-Size Craft Follow Backlog](../design/roadmap/real-size-craft-follow-backlog.md)
- [Runtime Style Audit](../design/style-audit-review-report.md)

Historical/context evidence retained for provenance:

- [Previous Current Plan](current-plan.md): superseded as the top-level rollup by
  this document, but preserved intact.
- [Original 2026-05-16 TODO Capture](open-todos-2026-05-16.md): dated parking
  lot; statuses must be reconciled against later commits.
- [Streams Worktree Session Audit](streams-worktree-session-audit-2026-05-12.md):
  manual verification record around the media-stream merge.
- [Documentation Consolidation Dryscope](docs-consolidation-dryscope-2026-05-16.md):
  rationale for maintaining one top-level planning authority.

## Appendix A: Active Checkout Files Present Before This Document

Separate deployment edit:

- `.github/workflows/deploy-hetzner.yml`

Milestone refinement:

- `docs/design/specs/orbit-milestones-spec.md`
- `mission.html`
- `src/platform/css/mission-layout.css`
- `src/platform/js/app/animation-scene-class.js`
- `src/platform/js/app/dataflow-wiring-actions.js`
- `src/platform/js/app/mission-scene-action-bundle.js`
- `src/platform/js/app/mission-scene-composition.js`
- `src/platform/js/app/mission-scene-entry.js`
- `src/platform/js/app/mission-state-cell-groups.js`
- `src/platform/js/app/mission-wiring-deps.js`
- `src/platform/js/app/orbit-milestone-actions.js`
- `src/platform/js/app/scene-view-plan-application.js`
- `src/platform/js/core/domain/orbit-milestones.js`
- `src/platform/js/core/state/mission-state-port-builders.js`
- `src/platform/js/core/state/runtime-view-state.js`
- `src/platform/js/mission.js`
- `src/platform/js/ui/ui-state.js`
- `src/platform/js/ui/view-settings-pill-controller.js`
- `test/orbit-milestones.test.js`
- `test/runtime-view-state.test.js`
- `test/scene-view-plan-application.test.js`
- `test/view-settings-pill-controller.test.js`

## Appendix B: Audit Evidence Summary

- App fetch: successful, 2026-09-02.
- WSL app fetch: successful; exposed 686-commit lag.
- Data repo fetch: successful.
- GitHub PR query: no open app PRs; three historical merged PRs; no data PRs.
- GitHub issue query: no open issues in either repository.
- App `git diff --check`: passed.
- Milestone focused tests: 28/28 passed.
- Active-checkout full unit run: 1,372 passed, 1 failed, 6 skipped; failure is
  the missing milestone state-contract expectation.
- RA/Dec focused run: not collected because the worktree lacks dependency
  resolution.
- Deployment environment check: `sankara-net-production` exists, was created
  2026-07-08, contains seven environment-scoped deploy secrets, and has no
  protection rules or deployment branch policy.
- Archive review: 15 commits are not patch-equivalent to current `master` and
  are not anchored by a ref outside the archive; nine exact untracked blobs and
  stash `194d1e8` are also unique recovery evidence.

## Appendix C: Dangling Object Preservation Ledger

`git fsck --dangling --no-reflogs` on 2026-09-02 reported 26 dangling commit
tips, 169 dangling blob tips, and 27 dangling tree tips. Older stash reflog
entries `bd875ac`, `2ab98f3`, and `8bc07ec`, plus archived stash `194d1e8`,
account for four commit tips already covered in Section 7.

The other 22 commit tips are:

| Commit | Subject |
| --- | --- |
| `2905019` | `Improve startup with progressive texture loading` |
| `930da86` | `Refactor compare mode architecture` |
| `6a0e8f0` | `docs: add repo boundary audit tooling` |
| `e60e5ba` | `Add orbit comparison mode` |
| `bd1db80` | `feat: refine flyby planner UI and artemis2 flyby timeline events` |
| `3ca20ba` | `test: disable secondary body ring in test mode` |
| `31a3271` | `Update to support Vikram - unstable changes` |
| `b02300d` | `WIP on master: responsive page / HTML validation fixes` |
| `48a97c6` | `Merge origin/master into bugfix/parallel-bugfix` |
| `062cecb` | `WIP on moon-render terminator isolation` |
| `1d2c4cc` | `feat: refine flyby planner UI and artemis2 flyby timeline events` |
| `633022d` | `wip-mobile-shell-sync-before-master-merge` |
| `393c404` | `WIP: 3D model and post-LBN#2 orbit` |
| `c64dcea` | `sync-prep-2026-04-06-sun-direction-wip` |
| `8ed92c3` | `WIP on master: responsive page / HTML validation fixes` |
| `c45c1bd` | `Fix Sun lighting for implicit origin bodies` |
| `fedcfe4` | `test: update coverage for mounted zoom and halo view state` |
| `c962d13` | `chore: preserve orbit ux tuning draft` |
| `9e70b43` | `chore: preserve refactor audit draft` |
| `e676882` | `Adjust ARTEMIS overview tolerance` |
| `ac799a5` | `On master: autostash` |
| `ac7a2fd` | `Add center lock and true-size craft lock behavior` |

Some are clearly old stash/snapshot objects or have intent preserved in current
docs, but none should be discarded from subject text alone. Before `git gc`,
re-run the object audit, determine reachability and patch equivalence, create
durable refs or a recovery bundle for retained material, and explicitly record
discard decisions. The 169 blob and 27 tree tips were counted but not assigned
semantic meaning in this audit; they remain another reason not to prune yet.

## Appendix D: Independent Review Record

Three independent subagent passes reviewed the evidence and draft:

- Current-checkout forensic review: verified branch divergence, working patch,
  stashes, milestone defects, and test gaps.
- Archive preservation review: found the 15 archive-only commits, unique draft
  files/stash, and incomplete `MOVES.json` inventory.
- Roadmap completeness review: found the duplicate `Events` control name,
  settled orbit-independence requirement, stale timeline-tick checklist item,
  omitted transcript verification work, decision-ledger gaps, and source-index
  omissions.
- Final factual review: rechecked remote heads, divergence, test counts,
  deployment environment, ignored worktree artifacts, archived branch state,
  and dangling Git objects.

All high- and medium-severity findings were incorporated into this document.
No reviewer edited repository files.
