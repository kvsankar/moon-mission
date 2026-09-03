#!/usr/bin/env python3
"""
Build script for orbit visualization project
Creates a dist folder with only files needed for deployment
"""

import os
import shutil
import json
import stat
import gzip
import subprocess
from datetime import datetime, timezone
import argparse
from pathlib import Path

def print_info(message):
    print(f"[INFO] {message}")

def print_error(message):
    print(f"[ERROR] {message}")

def print_success(message):
    print(f"[SUCCESS] {message}")

def remove_readonly(func, path, _):
    """Error handler for Windows permission issues"""
    os.chmod(path, stat.S_IWRITE)
    func(path)

def safe_rmtree(path):
    """Safely remove directory tree, handling Windows permission issues"""
    if Path(path).exists():
        try:
            shutil.rmtree(path, onerror=remove_readonly)
        except PermissionError as e:
            print_error(f"Permission denied when removing {path}. Process may be using this directory.")
            print_info("Please close any file explorer windows or web servers using the dist directory and try again.")
            raise e

def ensure_dir(path):
    """Create directory if it doesn't exist"""
    Path(path).mkdir(parents=True, exist_ok=True)

def copy_file(src, dst):
    """Copy a single file"""
    src_path = Path(src)
    dst_path = Path(dst)
    ensure_dir(dst_path.parent)
    shutil.copy2(src, dst)
    print_info(f"Copied: {src_path} -> {dst_path}")

def copy_tree(src_dir, dst_dir, ignore=None):
    """Copy a directory tree into dist, optionally ignoring some entries."""
    src_path = Path(src_dir)
    dst_path = Path(dst_dir)
    if not src_path.exists():
        print_error(f"Directory not found: {src_dir}")
        return 0

    ensure_dir(dst_path.parent)
    shutil.copytree(src_dir, dst_dir, dirs_exist_ok=True, ignore=ignore)

    # Best-effort count for reporting
    return sum(len(files) for _, _, files in os.walk(dst_path))

def gzip_bytes(payload, compresslevel=9):
    """Create deterministic gzip bytes (mtime=0)."""
    return gzip.compress(payload, compresslevel=compresslevel, mtime=0)

def generate_chebyshev_gzip_companions(dist_path):
    """
    Generate *.json.gz companions for all *-cheb.json files in dist assets.
    Returns tuple: (files_written, raw_total_bytes, gzip_total_bytes)
    """
    cheb_files = sorted(dist_path.glob("assets/**/*-cheb.json"))
    written = 0
    raw_total = 0
    gzip_total = 0

    for cheb_file in cheb_files:
        raw_bytes = cheb_file.read_bytes()
        gz_bytes = gzip_bytes(raw_bytes)
        gz_path = cheb_file.with_suffix(f"{cheb_file.suffix}.gz")

        existing = gz_path.read_bytes() if gz_path.exists() else None
        if existing != gz_bytes:
            gz_path.write_bytes(gz_bytes)
            written += 1

        raw_total += len(raw_bytes)
        gzip_total += len(gz_bytes)

    return written, raw_total, gzip_total

def get_project_root(project_root=None):
    if project_root:
        return Path(project_root).resolve()
    return Path(__file__).resolve().parent.parent

def resolve_project_path(project_root, path_value):
    path = Path(path_value)
    if path.is_absolute():
        return path
    return project_root / path

def discover_missions(project_root):
    """Auto-discover available missions from assets directory"""
    assets_dir = project_root / "assets"
    missions = []
    
    if assets_dir.exists():
        for item in os.listdir(assets_dir):
            mission_path = assets_dir / item
            config_path = mission_path / "data" / "config.json"
            
            # Check if it's a valid mission (has config.json)
            if (mission_path.is_dir() and 
                config_path.exists() and
                item != "platform"):
                missions.append(item)
    
    return sorted(missions)

def load_mission_config(project_root, mission):
    """Load mission configuration"""
    config_path = project_root / "assets" / mission / "data" / "config.json"
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print_error(f"Error reading config for {mission}: {e}")
        return {}

def resolve_build_date(build_date=None, now_fn=None):
    if build_date:
        normalized = build_date.strip()
        if not normalized:
            raise ValueError("--build-date cannot be empty")
        if normalized.endswith("Z"):
            normalized = f"{normalized[:-1]}+00:00"
        try:
            return datetime.fromisoformat(normalized).isoformat()
        except ValueError as error:
            raise ValueError(f"Invalid --build-date '{build_date}'. Expected ISO-8601 format.") from error

    source_date_epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if source_date_epoch:
        try:
            epoch = int(source_date_epoch)
        except ValueError as error:
            raise ValueError("SOURCE_DATE_EPOCH must be an integer Unix timestamp.") from error
        return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()

    clock = now_fn or (lambda: datetime.now(timezone.utc))
    value = clock()
    if not isinstance(value, datetime):
        raise ValueError("now_fn must return a datetime instance")
    return value.isoformat()

def normalize_missions(missions):
    if missions is None:
        return None
    if isinstance(missions, str):
        return [missions]
    return list(missions)

def build(
    dist_dir="dist",
    clean=True,
    missions=None,
    project_root=None,
    build_date=None,
    now_fn=None,
    compress_chebyshev=True,
):
    """Build the distribution folder."""
    project_root_path = get_project_root(project_root)
    dist_path = resolve_project_path(project_root_path, dist_dir)

    # Auto-discover missions if none specified
    missions_list = normalize_missions(missions)
    if missions_list is None:
        missions_list = discover_missions(project_root_path)
        print_info(f"Auto-discovered missions: {', '.join(missions_list)}")
    
    if not missions_list:
        print_error("No missions found or specified!")
        return
    
    print_info(f"Building missions: {', '.join(missions_list)}")
    
    # Create dist directory if it doesn't exist
    ensure_dir(dist_path)
    
    # Clean dist directory contents if requested
    if clean and dist_path.exists():
        print_info(f"Cleaning {dist_path} directory contents...")
        for item in os.listdir(dist_path):
            item_path = dist_path / item
            if item_path.is_dir():
                safe_rmtree(item_path)
            else:
                item_path.unlink()
    
    print_info(f"Building distribution in {dist_path}...")
    
    copied_files = 0
    missing_files = 0

    # Entry points for the multi-mission app
    for html_file in [
        "index.html",
        "mission.html",
        "orbit-data.html",
        "assets-status.html",
        "moon-render-tuner.html",
        "sky-render-demo.html",
    ]:
        source_file = project_root_path / html_file
        if source_file.exists():
            copy_file(source_file, dist_path / html_file)
            copied_files += 1
        else:
            print_error(f"File not found: {html_file}")
            missing_files += 1

    # SEO mission landing pages
    generator_script = project_root_path / "scripts" / "generate-mission-pages.mjs"
    if generator_script.exists():
        subprocess.run(
            [
                "node",
                str(generator_script),
                "--app-root",
                str(project_root_path),
                "--output-root",
                str(dist_path),
            ],
            check=True,
        )
        copied_files += len(missions_list)

    htaccess_source = project_root_path / ".htaccess"
    if htaccess_source.exists():
        copy_file(htaccess_source, dist_path / ".htaccess")
        copied_files += 1

    # Optional favicon
    favicon_path = project_root_path / "favicon.ico"
    if favicon_path.exists():
        copy_file(favicon_path, dist_path / "favicon.ico")
        copied_files += 1

    # Shared runtime assets
    platform_source = project_root_path / "src" / "platform"
    if not platform_source.exists():
        # Backward-compatible fallback for older checkouts.
        platform_source = project_root_path / "assets" / "platform"
    copied_files += copy_tree(platform_source, dist_path / "src" / "platform")
    copied_files += copy_tree(project_root_path / "third-party", dist_path / "third-party")
    copied_files += copy_tree(project_root_path / "images", dist_path / "images")
    copied_files += copy_tree(
        project_root_path / "assets" / "horizons-blurbs",
        dist_path / "assets" / "horizons-blurbs",
    )

    # Mission assets (exclude raw archives by default)
    ignore_archives = shutil.ignore_patterns("archive")
    for mission in missions_list:
        print_info(f"Copying mission assets: {mission}")
        copied_files += copy_tree(
            project_root_path / "assets" / mission,
            dist_path / "assets" / mission,
            ignore=ignore_archives,
        )

    if compress_chebyshev:
        written, raw_total, gzip_total = generate_chebyshev_gzip_companions(dist_path)
        savings_pct = (1 - (gzip_total / raw_total)) * 100 if raw_total else 0
        print_info(
            f"Generated {written} Chebyshev gzip companions "
            f"({raw_total} -> {gzip_total} bytes, {savings_pct:.1f}% smaller)",
        )
    
    # Create build info file
    build_info = {
        "build_date": resolve_build_date(build_date=build_date, now_fn=now_fn),
        "build_type": "production",
        "version": "1.0.0",
        "missions": missions_list,
        "files_copied": copied_files,
        "files_missing": missing_files
    }
    
    with open(dist_path / "build-info.json", "w", encoding="utf-8") as f:
        json.dump(build_info, f, indent=2)
    
    # Count total files
    total_files = sum(len(files) for _, _, files in os.walk(dist_path))
    
    print_success(f"Build complete! {total_files} files total, {copied_files} copied, {missing_files} missing")
    
    if missing_files > 0:
        print_error(f"Warning: {missing_files} required files were missing!")
    
    # List directory structure
    print_info("\nDirectory structure:")
    for root, dirs, files in os.walk(dist_path):
        dirs.sort()
        files = sorted(files)
        root_path = Path(root)
        level = root_path.relative_to(dist_path).parts
        level_count = len(level)
        indent = " " * 2 * level_count
        folder_name = dist_path.name if root_path == dist_path else root_path.name
        print(f"{indent}{folder_name}/")
        subindent = " " * 2 * (level_count + 1)
        for file in files[:10]:  # Show first 10 files, sorted
            print(f"{subindent}{file}")
        if len(files) > 10:
            print(f"{subindent}... and {len(files) - 10} more files")

def main():
    parser = argparse.ArgumentParser(description="Build multi-mission project for deployment")
    parser.add_argument("--dist", default="dist", help="Distribution directory (default: dist)")
    parser.add_argument("--no-clean", action="store_true", help="Don't clean dist directory before building")
    parser.add_argument("--mission", "--missions", nargs="+", 
                        help="Specific mission(s) to build (default: all discovered missions)")
    parser.add_argument("--project-root", help="Project root path (default: auto-detect from script location)")
    parser.add_argument(
        "--no-compress-chebyshev",
        action="store_true",
        help="Skip generating *.json.gz companions for *-cheb.json files in dist",
    )
    parser.add_argument(
        "--build-date",
        help="ISO timestamp for deterministic build-info.json (default: SOURCE_DATE_EPOCH or current UTC time)",
    )
    
    args = parser.parse_args()
    
    missions = args.mission if hasattr(args, "mission") and args.mission else None
    try:
        build(
            dist_dir=args.dist,
            clean=not args.no_clean,
            missions=missions,
            project_root=args.project_root,
            build_date=args.build_date,
            compress_chebyshev=not args.no_compress_chebyshev,
        )
    except ValueError as error:
        parser.error(str(error))

if __name__ == "__main__":
    main()
