#!/usr/bin/env python3
"""
Generate a runtime asset manifest aligned with the active app mission catalog.

This mirrors the deployment/runtime needs of moon-mission while sourcing file
content from moon-mission-data (or another staged data root). Unlike older
helpers, it only includes missions that are active in assets/mission-catalog.json
and resolves relative-mode artifacts from config.relative.orbits_file when set.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
from pathlib import Path


def _read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _find_platform_file(app_root: Path, rel_path: str) -> Path:
    candidates = [
        app_root / "src" / "platform" / rel_path,
        app_root / "assets" / "platform" / rel_path,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Unable to locate platform file {rel_path} in src/ or assets/")


def load_active_mission_folders(app_root: Path) -> set[str]:
    catalog_path = app_root / "assets" / "mission-catalog.json"
    catalog = _read_json(catalog_path)
    missions = catalog.get("missions", [])
    if not isinstance(missions, list):
        raise ValueError(f"Mission catalog has invalid missions list: {catalog_path}")

    folders: set[str] = set()
    for mission in missions:
        if not isinstance(mission, dict):
            continue
        folder = mission.get("folder")
        if isinstance(folder, str) and folder.strip():
            folders.add(folder.strip())
    return folders


def collect_required(app_root: Path) -> tuple[set[str], dict[str, str]]:
    required: set[str] = set()
    reasons: dict[str, str] = {}
    active_missions = load_active_mission_folders(app_root)

    for manifest_path in sorted(app_root.glob("assets/*/data/ephemeris-manifest.json")):
        mission = manifest_path.parent.parent.name
        if mission not in active_missions:
            continue

        rel_manifest = (Path("assets") / mission / "data" / "ephemeris-manifest.json").as_posix()
        required.add(rel_manifest)
        reasons[rel_manifest] = "ephemeris-manifest"

        manifest = _read_json(manifest_path)
        phases = manifest.get("phases", {})
        has_landing_variants = isinstance(phases, dict) and (
            "landing-geo" in phases or "landing-lunar" in phases
        )
        if not isinstance(phases, dict):
            continue

        for phase, phase_cfg in phases.items():
            if not isinstance(phase_cfg, dict):
                continue
            if phase == "landing" and has_landing_variants:
                continue

            artifacts = phase_cfg.get("artifacts", {})
            if not isinstance(artifacts, dict):
                continue

            for key in ("npz", "chebyshev", "meta", "sun_chebyshev"):
                artifact_cfg = artifacts.get(key, {})
                if not isinstance(artifact_cfg, dict):
                    continue
                runtime_name = artifact_cfg.get("runtime")
                if not isinstance(runtime_name, str) or not runtime_name:
                    continue

                rel_path = (Path("assets") / mission / "data" / runtime_name).as_posix()
                required.add(rel_path)
                reasons[rel_path] = f"manifest:{mission}:{phase}:{key}"

                if runtime_name.endswith("-cheb.json"):
                    gz_path = (Path("assets") / mission / "data" / f"{runtime_name}.gz").as_posix()
                    required.add(gz_path)
                    reasons[gz_path] = f"manifest:{mission}:{phase}:{key}:gzip"

    for config_path in sorted(app_root.glob("assets/*/data/config.json")):
        mission = config_path.parent.parent.name
        if mission not in active_missions:
            continue

        config = _read_json(config_path)
        relative_cfg = config.get("relative")
        relative_orbits_file = None
        if isinstance(relative_cfg, dict):
            relative_orbits_file = relative_cfg.get("orbits_file") or relative_cfg.get("orbitsFile")

        relative_runtime = None
        if isinstance(relative_orbits_file, str) and relative_orbits_file.strip():
            relative_runtime = f"{relative_orbits_file.strip()}-cheb.json"
        else:
            mnemonic = config.get("spacecraft_mnemonic")
            if isinstance(mnemonic, str) and mnemonic:
                relative_runtime = f"relative-{mnemonic}-cheb.json"

        if relative_runtime:
            rel_cheb_path = (Path("assets") / mission / "data" / relative_runtime).as_posix()
            rel_cheb_gz_path = (
                Path("assets") / mission / "data" / f"{relative_runtime}.gz"
            ).as_posix()
            rel_npz_path = None
            if relative_runtime.endswith("-cheb.json"):
                rel_npz_path = (
                    Path("assets")
                    / mission
                    / "data"
                    / f"{relative_runtime[: -len('-cheb.json')]}.npz"
                ).as_posix()
            required.add(rel_cheb_path)
            required.add(rel_cheb_gz_path)
            reasons[rel_cheb_path] = f"relative-mode:{mission}"
            reasons[rel_cheb_gz_path] = f"relative-mode:{mission}:gzip"
            if rel_npz_path:
                required.add(rel_npz_path)
                reasons[rel_npz_path] = f"relative-mode:{mission}:npz"

        for origin_key in ("geo", "lunar", "relative"):
            phase_cfg = config.get(origin_key)
            if not isinstance(phase_cfg, dict):
                continue
            style_runtime = phase_cfg.get("orbit_style_file") or phase_cfg.get("orbitStyleFile")
            if not isinstance(style_runtime, str) or not style_runtime.strip():
                continue
            style_path = (Path("assets") / mission / "data" / style_runtime.strip()).as_posix()
            required.add(style_path)
            reasons[style_path] = f"orbit-style:{mission}:{origin_key}"

        mission_image = config.get("mission_image")
        if isinstance(mission_image, str) and mission_image:
            normalized = mission_image.replace("\\", "/")
            required.add(normalized)
            reasons[normalized] = f"config:mission_image:{mission}"

    texture_loader = _find_platform_file(app_root, "js/app/texture-loader.js")
    texture_text = texture_loader.read_text(encoding="utf-8")
    for match in re.finditer(r'"(images/[^"]+)"', texture_text):
        path = match.group(1)
        required.add(path)
        reasons[path] = "platform:texture-loader"

    # Profile assets are declared separately from the general texture loader.
    # Limit discovery to static declarations, excluding legacy-path migrations.
    profile_paths = app_root / "src/platform/js/app/moon-render-asset-profiles.js"
    if profile_paths.exists():
        profile_text = profile_paths.read_text(encoding="utf-8").split("\nfunction ", 1)[0]
        for match in re.finditer(r'"(images/[^"\n]+)"', profile_text):
            path = match.group(1)
            required.add(path)
            reasons[path] = "platform:moon-render-profile"

    mission_html = (app_root / "mission.html").read_text(encoding="utf-8")
    for match in re.finditer(r'"(third-party/[^"]+)"', mission_html):
        path = match.group(1)
        required.add(path)
        reasons[path] = "mission-html:script-tag"

    platform_root_candidates = [
        app_root / "src" / "platform" / "js",
        app_root / "assets" / "platform" / "js",
    ]
    for platform_root in platform_root_candidates:
        if not platform_root.exists():
            continue
        for js_path in platform_root.glob("**/*.js"):
            text = js_path.read_text(encoding="utf-8")
            for match in re.finditer(r"""['"](?:\.\./)+((?:third-party|images)/[^'"]+)['"]""", text):
                path = match.group(1)
                required.add(path)
                reasons[path] = f"platform-import:{js_path.relative_to(app_root).as_posix()}"

    return required, reasons


def classify_path(path: str) -> str:
    if path.startswith("assets/") and "/data/" in path:
        return "orbit-artifact"
    if path.startswith("assets/") and "/images/" in path:
        return "mission-image"
    if path.startswith("images/"):
        return "shared-image"
    if path.startswith("third-party/"):
        return "third-party"
    return "other"


def git(cwd: Path, *args: str) -> str:
    try:
        return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()
    except Exception:
        return ""


def build_entry(path: str, full_path: Path, reason: str) -> dict:
    category = classify_path(path)
    exists = full_path.exists()
    entry = {
        "path": path,
        "category": category,
        "reason": reason,
        "exists": exists,
    }
    if exists and full_path.is_file():
        entry["size_bytes"] = full_path.stat().st_size
        entry["sha256"] = _sha256(full_path)
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate runtime asset manifest for deployment")
    parser.add_argument("--app-root", default=".", help="moon-mission app repository root")
    parser.add_argument("--data-root", default="./mission-data", help="moon-mission-data repository root")
    parser.add_argument(
        "--output",
        default="provenance/runtime-asset-manifest.json",
        help="Output manifest path, relative to data-root unless absolute",
    )
    args = parser.parse_args()

    app_root = Path(args.app_root).resolve()
    data_root = Path(args.data_root).resolve()
    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = (data_root / output_path).resolve()

    required, reasons = collect_required(app_root)
    required_sorted = sorted(required)

    entries = []
    missing = []
    for rel_path in required_sorted:
        full_path = data_root / rel_path
        if not full_path.exists():
            missing.append(rel_path)
        entries.append(build_entry(rel_path, full_path, reasons.get(rel_path, "")))

    payload = {
        "schema": "moon-mission-runtime-asset-manifest",
        "version": 1,
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "app_repo": {
            "git_commit": git(app_root, "rev-parse", "HEAD"),
            "git_branch": git(app_root, "branch", "--show-current"),
        },
        "data_repo": {
            "git_commit": git(data_root, "rev-parse", "HEAD"),
            "git_branch": git(data_root, "branch", "--show-current"),
        },
        "required_asset_count": len(required_sorted),
        "missing_asset_count": len(missing),
        "required_assets": entries,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")

    print(f"Wrote runtime asset manifest: {output_path.as_posix()}")
    print(f"Required assets: {len(required_sorted)}")
    print(f"Missing assets in data root: {len(missing)}")
    if missing:
        for rel_path in missing:
            print(f"  - {rel_path}")
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
