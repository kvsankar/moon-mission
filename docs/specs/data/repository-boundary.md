# App And Data Repository Boundary

## Ownership

`moon-mission` owns runtime code, authored mission configuration, optional
authored media manifests, UI assets, and lightweight generated product content
such as HORIZONS blurb metadata.

`moon-mission-data` owns generated orbit/ephemeris products, NPZ files,
Chebyshev files and gzip companions, generated metadata, orbit-style sidecars,
generated thumbnails, long-form stream payloads, and generated transcript
artifacts. Generation receipts such as mission-local
`README-spice-export.md` files stay beside those canonical generated products
in the data repository.

Shared runtime images may be mirrored when deployment stages the data repo's
`images/` tree. The tracked Moon profile images in the app repo and any
data-repo staging copies must remain byte-identical or receive an explicit
reviewed ownership change.

`config.json5` and optional `media-manifest.json5` are maintained sources in the
app repo. Their compiled JSON files remain app-owned runtime artifacts.
`ephemeris-manifest.json` is mirrored and must remain byte-identical when
present in both repositories.

## Mission Data Requirements

- Standard geocentric and lunar orbit sampling remains at `60` seconds.
- Dedicated short landing slices may use `1` second sampling.
- HORIZONS output limits are handled by splitting windows, not by coarsening
  standard sampling beyond `60` seconds.
- Phase/span time scales are explicit; HORIZONS/SPICE ephemeris phases use the
  documented TDB convention and mission events use UTC.
- Mission-significant events remain in config even when they fall outside the
  sampled ephemeris window.
- Config sourcing notes distinguish mission event time from first/last usable
  ephemeris times.
- Active mission data provides the phase/artifact coverage required by its
  ephemeris manifest and runtime modes.

## No-Loss Transfer

- Never delete an app-repo generated artifact until its data-repo destination
  is verified or its intentional retirement is recorded.
- Review unknown files individually.
- After transferring generated output to `moon-mission-data`, run the boundary
  audit before staging it back into an app or deployment tree.
- Staging means copying canonical data-repo assets into a runtime target; it
  does not mean transferring newly generated ownership into the data repo.
- Generated media payloads must not be committed to the app repo merely because
  the runtime uses their paths.
- A staging copy must not silently replace a different tracked app image;
  compare hashes for mirrored shared images before release.

Operational procedure:
[Repo Sync Playbook](../../operations/data/repo-sync-playbook.md).

Structural rationale:
[Repository Boundary Design](../../designs/data/repository-boundary.md).
