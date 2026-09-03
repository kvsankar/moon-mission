#!/usr/bin/env python3
"""
Fetch mission blurbs from JPL HORIZONS for lunar spacecraft.

This script:
1. Fetches the OBJ_DATA blurb from HORIZONS for each spacecraft
2. Saves the raw text to a file
3. Saves a markdown-formatted version
4. Extracts structured metadata to JSON for downstream use

Usage:
    python scripts/fetch-mission-blurbs.py [--output-dir DIR] [--missions ID1,ID2,...]

Examples:
    # Fetch all known lunar missions
    python scripts/fetch-mission-blurbs.py

    # Fetch specific missions by ID
    python scripts/fetch-mission-blurbs.py --missions -85,-158,-1023

    # Custom output directory
    python scripts/fetch-mission-blurbs.py --output-dir ./my-blurbs
"""

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any

import requests
from horizons_text_cache import (
    get_default_cache_dir,
    read_cached_text,
    write_cached_text,
)


# Known lunar missions with HORIZONS data
# Format: (name, horizons_id, mission_type, agency, year)
KNOWN_LUNAR_MISSIONS = [
    # NASA - Apollo Program
    ("Apollo 8 S-IVB", -399080, "Third Stage", "NASA", 1968),
    ("Apollo 9 S-IVB", -399090, "Third Stage", "NASA", 1969),
    ("Apollo 10 S-IVB", -399100, "Third Stage", "NASA", 1969),
    ("Apollo 10 LM Snoopy", -399101, "Lunar Module", "NASA", 1969),
    ("Apollo 11 S-IVB", -399110, "Third Stage", "NASA", 1969),
    ("Apollo 12 S-IVB", -399120, "Third Stage", "NASA", 1969),

    # NASA - Robotic Missions
    ("Clementine", -40, "Orbiter", "NASA/DoD", 1994),
    ("WIND", -8, "Observatory", "NASA", 1994),
    ("Lunar Prospector", -25, "Orbiter", "NASA", 1998),
    ("HGS-1", -125126, "Flyby", "Hughes", 1997),
    ("ISEE-3 ICE", -111, "Flyby", "NASA", 1978),
    ("Nozomi", -178, "Flyby", "ISAS", 1998),
    ("WMAP", -165, "L2 Observatory", "NASA", 2001),
    ("STEREO-A", -234, "Solar Observatory", "NASA", 2006),
    ("STEREO-B", -235, "Solar Observatory", "NASA", 2006),
    ("ARTEMIS-P1", -192, "Lunar Orbiter", "NASA", 2007),
    ("ARTEMIS-P2", -193, "Lunar Orbiter", "NASA", 2007),
    ("LRO", -85, "Orbiter", "NASA", 2009),
    ("LCROSS Shepherd", -18, "Impactor", "NASA", 2009),
    ("LCROSS Centaur", -18900, "Impactor", "NASA", 2009),
    ("GRAIL-A Ebb", -177, "Orbiter", "NASA", 2011),
    ("GRAIL-B Flow", -181, "Orbiter", "NASA", 2011),
    ("GRAIL-SS Stage", -176, "Second Stage", "NASA", 2011),
    ("LADEE", -12, "Orbiter", "NASA", 2013),
    ("CAPSTONE", -1176, "NRHO Pathfinder", "NASA", 2022),
    ("Artemis 1 Orion", -1023, "Crewed Capsule", "NASA", 2022),
    ("Artemis 2 Orion", -1024, "Crewed Capsule", "NASA", 2026),
    # ("Lunar IceCube", -57, "CubeSat", "NASA", 2022),  # NOT IN HORIZONS - NAIF/SPICE only
    ("Lunar Flashlight", -164, "CubeSat", "NASA", 2022),
    ("Lunar Trailblazer", -242, "Orbiter", "NASA", 2024),
    ("TESS", -95, "Flyby", "NASA", 2018),
    ("JUICE", -28, "Flyby", "ESA", 2023),

    # ISRO - India
    ("Chandrayaan-1", -86, "Orbiter", "ISRO", 2008),
    ("Chandrayaan-2 Orbiter", -152, "Orbiter", "ISRO", 2019),
    ("Chandrayaan-2 Lander Vikram", -153, "Lander", "ISRO", 2019),
    ("Chandrayaan-3 Lander Vikram", -158, "Lander", "ISRO", 2023),
    ("Chandrayaan-3 Propulsion Module", -169, "Propulsion Module", "ISRO", 2023),

    # JAXA - Japan
    # ("KAGUYA SELENE", -131, "Orbiter", "JAXA", 2007),  # NOT IN HORIZONS - NAIF/SPICE only
    # ("KAGUYA Relay Sat Okina", -500, "Sub-satellite", "JAXA", 2007),  # NOT IN HORIZONS
    # ("KAGUYA VLBI Sat Ouna", -502, "Sub-satellite", "JAXA", 2007),  # NOT IN HORIZONS
    ("SLIM", -240, "Lander", "JAXA", 2024),

    # ESA - Europe
    # ("SMART-1", -238, "Orbiter", "ESA", 2003),  # NOT IN HORIZONS - NAIF/SPICE only

    # KARI - South Korea
    ("KPLO Danuri", -155, "Orbiter", "KARI", 2022),
]

PROJECT_ROOT = Path(__file__).resolve().parent.parent
HORIZONS_TEXT_CACHE_DIR = get_default_cache_dir(PROJECT_ROOT)


@dataclass
class MissionMetadata:
    """Structured metadata extracted from a HORIZONS blurb."""
    horizons_id: int
    name: str
    revision_date: Optional[str] = None
    target_body: Optional[str] = None
    launch_date: Optional[str] = None
    launch_site: Optional[str] = None
    mass_kg: Optional[float] = None
    dimensions: Optional[str] = None
    agency: Optional[str] = None
    mission_type: Optional[str] = None
    cospar_id: Optional[str] = None
    trajectory_start: Optional[str] = None
    trajectory_end: Optional[str] = None
    landing_date: Optional[str] = None
    landing_site: Optional[str] = None
    landing_coordinates: Optional[str] = None
    mission_duration: Optional[str] = None
    status: Optional[str] = None
    url: Optional[str] = None
    payloads: List[str] = field(default_factory=list)
    raw_sections: Dict[str, str] = field(default_factory=dict)


def fetch_blurb(spacecraft_id: int, name: str = None) -> Optional[str]:
    """
    Fetch the OBJ_DATA blurb from HORIZONS for a spacecraft.

    Args:
        spacecraft_id: JPL HORIZONS spacecraft ID (negative number)
        name: Human-readable name for logging

    Returns:
        Raw text content from HORIZONS, or None on error
    """
    base_url = "https://ssd.jpl.nasa.gov/api/horizons.api"

    params = {
        'format': 'text',
        'COMMAND': str(spacecraft_id),
        'OBJ_DATA': 'YES',
        'MAKE_EPHEM': 'NO',
    }

    display_name = name or str(spacecraft_id)
    print(f"  Fetching: {display_name} (ID: {spacecraft_id})...", end=" ", flush=True)

    cached_text = read_cached_text(
        base_url=base_url,
        params=params,
        cache_dir=HORIZONS_TEXT_CACHE_DIR,
    )
    if cached_text is not None:
        print(f"CACHED ({len(cached_text)} chars)")
        return cached_text

    try:
        response = requests.get(base_url, params=params, timeout=30)
        response.raise_for_status()
        # Check for "no such record" error
        if "No such record" in response.text or "Cannot find" in response.text:
            print(f"NOT FOUND (ID {spacecraft_id} not in HORIZONS)")
            return None

        write_cached_text(
            base_url=base_url,
            params=params,
            text=response.text,
            cache_dir=HORIZONS_TEXT_CACHE_DIR,
            extra_metadata={
                "spacecraft_id": spacecraft_id,
                "name": display_name,
                "kind": "obj_data_blurb",
            },
        )
        print(f"OK ({len(response.text)} chars)")
        return response.text

    except requests.Timeout:
        print("TIMEOUT")
        return None
    except requests.RequestException as e:
        print(f"ERROR: {e}")
        return None


def parse_header_line(text: str) -> Dict[str, str]:
    """Parse the header line to extract revision date, name, and ID."""
    result = {}

    # Pattern: "Revised: DATE    NAME / (TARGET)    ID"
    # Example: "Revised: Jan 13, 2026          LRO Spacecraft / (Moon)                     -85"
    header_pattern = r'Revised:\s*([A-Za-z]+\s+\d+,?\s+\d{4})\s+(.+?)\s+(-?\d+)\s*$'
    match = re.search(header_pattern, text, re.MULTILINE)
    if match:
        result['revision_date'] = match.group(1).strip()
        result['full_name'] = match.group(2).strip()
        result['horizons_id'] = match.group(3).strip()

        # Extract target body from name like "LRO Spacecraft / (Moon)"
        target_match = re.search(r'/\s*\(([^)]+)\)', result['full_name'])
        if target_match:
            result['target_body'] = target_match.group(1)

    return result


def parse_url(text: str) -> Optional[str]:
    """Extract URL from blurb."""
    # Look for http/https URLs
    url_pattern = r'(https?://[^\s\n]+)'
    urls = re.findall(url_pattern, text)
    # Return first non-image URL
    for url in urls:
        if not any(ext in url.lower() for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp']):
            return url
    return urls[0] if urls else None


def parse_launch_info(text: str) -> Dict[str, str]:
    """Extract launch date and site."""
    result = {}

    # Various launch date patterns
    patterns = [
        r'[Ll]aunched?\s*:?\s*([A-Za-z]+\s+\d+,?\s+\d{4})',
        r'[Ll]aunched?\s*:?\s*(\d{4}-[A-Za-z]+-\d+)',
        r'[Ll]aunch [Dd]ate\s*:?\s*(.+?)(?:\s*@|\s*from|\s*$)',
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            result['launch_date'] = match.group(1).strip()
            break

    # Launch site
    site_pattern = r'from\s+([^,\n]+(?:Space Center|Launch Site|Launch Complex|Cape Canaveral|Kennedy|Vandenberg|Baikonur|Sriharikota|Tanegashima|Wenchang|Mahia)[^,\n]*)'
    match = re.search(site_pattern, text, re.IGNORECASE)
    if match:
        result['launch_site'] = match.group(1).strip()

    return result


def parse_spacecraft_details(text: str) -> Dict[str, Any]:
    """Extract spacecraft physical characteristics."""
    result = {}

    # Mass patterns
    mass_patterns = [
        r'[Ll]aunch\s+[Mm]ass\s*:?\s*(\d+[\d,\.]*)\s*kg',
        r'[Tt]otal\s+[Mm]ass\s*[~:]?\s*(\d+[\d,\.]*)\s*kg',
        r'[Ss]pacecraft\s+[Mm]ass\s*[~:]?\s*(\d+[\d,\.]*)\s*kg',
        r'[Mm]ass\s*:?\s*(\d+[\d,\.]*)\s*kg',
    ]

    for pattern in mass_patterns:
        match = re.search(pattern, text)
        if match:
            mass_str = match.group(1).replace(',', '')
            try:
                result['mass_kg'] = float(mass_str)
            except ValueError:
                pass
            break

    # Dimensions
    dim_pattern = r'[Dd]imensions?\s*(?:\([^)]*\))?\s*:?\s*([^\n]+)'
    match = re.search(dim_pattern, text)
    if match:
        result['dimensions'] = match.group(1).strip()

    return result


def parse_trajectory_info(text: str) -> Dict[str, str]:
    """Extract trajectory time span information."""
    result = {}

    # Look for trajectory table entries
    # Pattern: "Name   Start (TDB)   Stop (TDB)"
    traj_pattern = r'(\d{4}-[A-Za-z]+-\d+\s+\d+:\d+)\s+(\d{4}-[A-Za-z]+-\d+\s+\d+:\d+)'
    matches = re.findall(traj_pattern, text)

    if matches:
        # First entry is typically the start
        result['trajectory_start'] = matches[0][0]
        # Last entry's end time
        result['trajectory_end'] = matches[-1][1]

    return result


def parse_landing_info(text: str) -> Dict[str, str]:
    """Extract landing information for landers."""
    result = {}

    # Landing date
    landing_patterns = [
        r'[Ll]unar soft-landing\s*:?\s*([^\n@]+)(?:\s*@\s*([^\n]+))?',
        r'[Ll]anded?\s*(?:on)?\s*:?\s*([A-Za-z]+\s+\d+,?\s+\d{4})',
        r'[Ss]plashdown\s*(?:on)?\s*:?\s*([A-Za-z]+\s+\d+,?\s+\d{4})',
    ]

    for pattern in landing_patterns:
        match = re.search(pattern, text)
        if match:
            result['landing_date'] = match.group(1).strip()
            break

    # Landing coordinates
    coord_pattern = r'(-?\d+\.?\d*)\s*deg\.?\s*\(?\s*([NS])\s*\)?,?\s*(-?\d+\.?\d*)\s*deg\.?\s*\(?\s*([EW])\s*\)?'
    match = re.search(coord_pattern, text)
    if match:
        lat = float(match.group(1))
        lat_dir = match.group(2)
        lon = float(match.group(3))
        lon_dir = match.group(4)
        if lat_dir == 'S':
            lat = -lat
        if lon_dir == 'W':
            lon = -lon
        result['landing_coordinates'] = f"{lat}, {lon}"

    # Landing site name
    site_pattern = r'site\s+named\s+([^\n,\.]+)'
    match = re.search(site_pattern, text, re.IGNORECASE)
    if match:
        result['landing_site'] = match.group(1).strip()

    return result


def parse_sections(text: str) -> Dict[str, str]:
    """Extract named sections from the blurb."""
    sections = {}

    # Common section headers
    section_headers = [
        'BACKGROUND', 'PURPOSE', 'MISSION GOALS', 'MAJOR EVENTS',
        'SPACECRAFT DETAILS', 'SPACECRAFT PHYSICAL CHARACTERISTICS',
        'PAYLOAD', 'SCIENCE PAYLOADS', 'SPACECRAFT TRAJECTORY',
        'UPDATE', 'TRAJECTORY'
    ]

    for header in section_headers:
        # Look for "HEADER:" or "HEADER\n"
        pattern = rf'{header}\s*:?\s*\n((?:(?!^[A-Z][A-Z\s]+:?\s*$).)*)'
        match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
        if match:
            content = match.group(1).strip()
            # Clean up: remove multiple spaces, normalize newlines
            content = re.sub(r' +', ' ', content)
            content = re.sub(r'\n{3,}', '\n\n', content)
            sections[header] = content

    return sections


def parse_blurb(raw_text: str, mission_info: tuple) -> MissionMetadata:
    """
    Parse a HORIZONS blurb into structured metadata.

    Args:
        raw_text: Raw text from HORIZONS
        mission_info: Tuple of (name, horizons_id, mission_type, agency, year)

    Returns:
        MissionMetadata object with extracted information
    """
    name, horizons_id, mission_type, agency, year = mission_info

    metadata = MissionMetadata(
        horizons_id=horizons_id,
        name=name,
        agency=agency,
        mission_type=mission_type,
    )

    # Parse header
    header = parse_header_line(raw_text)
    if header:
        metadata.revision_date = header.get('revision_date')
        metadata.target_body = header.get('target_body')

    # Parse URL
    metadata.url = parse_url(raw_text)

    # Parse launch info
    launch = parse_launch_info(raw_text)
    metadata.launch_date = launch.get('launch_date')
    metadata.launch_site = launch.get('launch_site')

    # Parse spacecraft details
    details = parse_spacecraft_details(raw_text)
    metadata.mass_kg = details.get('mass_kg')
    metadata.dimensions = details.get('dimensions')

    # Parse trajectory info
    trajectory = parse_trajectory_info(raw_text)
    metadata.trajectory_start = trajectory.get('trajectory_start')
    metadata.trajectory_end = trajectory.get('trajectory_end')

    # Parse landing info (for landers)
    landing = parse_landing_info(raw_text)
    metadata.landing_date = landing.get('landing_date')
    metadata.landing_site = landing.get('landing_site')
    metadata.landing_coordinates = landing.get('landing_coordinates')

    # Parse sections
    metadata.raw_sections = parse_sections(raw_text)

    return metadata


def format_as_markdown(raw_text: str, metadata: MissionMetadata) -> str:
    """
    Convert a HORIZONS blurb to markdown format.

    Args:
        raw_text: Raw text from HORIZONS
        metadata: Parsed metadata

    Returns:
        Markdown-formatted string
    """
    lines = []

    # Title
    lines.append(f"# {metadata.name}")
    lines.append("")

    # Quick reference table
    lines.append("## Quick Reference")
    lines.append("")
    lines.append("| Field | Value |")
    lines.append("|-------|-------|")
    lines.append(f"| **HORIZONS ID** | {metadata.horizons_id} |")
    if metadata.agency:
        lines.append(f"| **Agency** | {metadata.agency} |")
    if metadata.mission_type:
        lines.append(f"| **Type** | {metadata.mission_type} |")
    if metadata.launch_date:
        lines.append(f"| **Launch Date** | {metadata.launch_date} |")
    if metadata.launch_site:
        lines.append(f"| **Launch Site** | {metadata.launch_site} |")
    if metadata.mass_kg:
        lines.append(f"| **Mass** | {metadata.mass_kg} kg |")
    if metadata.target_body:
        lines.append(f"| **Target** | {metadata.target_body} |")
    if metadata.landing_date:
        lines.append(f"| **Landing Date** | {metadata.landing_date} |")
    if metadata.landing_site:
        lines.append(f"| **Landing Site** | {metadata.landing_site} |")
    if metadata.landing_coordinates:
        lines.append(f"| **Landing Coordinates** | {metadata.landing_coordinates} |")
    if metadata.trajectory_start:
        lines.append(f"| **Trajectory Start** | {metadata.trajectory_start} |")
    if metadata.trajectory_end:
        lines.append(f"| **Trajectory End** | {metadata.trajectory_end} |")
    if metadata.url:
        lines.append(f"| **URL** | {metadata.url} |")
    if metadata.revision_date:
        lines.append(f"| **Last Updated** | {metadata.revision_date} |")
    lines.append("")

    # Raw blurb content (formatted)
    lines.append("## JPL HORIZONS Data")
    lines.append("")
    lines.append("```")
    lines.append(raw_text.strip())
    lines.append("```")
    lines.append("")

    # Footer
    lines.append("---")
    lines.append(f"*Fetched from JPL HORIZONS on {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}*")

    return "\n".join(lines)


def save_blurb(
    raw_text: str,
    metadata: MissionMetadata,
    output_dir: Path
) -> Dict[str, Path]:
    """
    Save blurb in multiple formats.

    Args:
        raw_text: Raw text from HORIZONS
        metadata: Parsed metadata
        output_dir: Directory to save files

    Returns:
        Dict of format -> filepath
    """
    # Create safe filename from name
    safe_name = re.sub(r'[^\w\-]', '-', metadata.name.lower())
    safe_name = re.sub(r'-+', '-', safe_name).strip('-')

    paths = {}

    # Save raw text
    txt_path = output_dir / "raw" / f"{safe_name}.txt"
    txt_path.parent.mkdir(parents=True, exist_ok=True)
    txt_path.write_text(raw_text, encoding='utf-8')
    paths['raw'] = txt_path

    # Save markdown
    md_content = format_as_markdown(raw_text, metadata)
    md_path = output_dir / "markdown" / f"{safe_name}.md"
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(md_content, encoding='utf-8')
    paths['markdown'] = md_path

    # Save metadata JSON
    json_path = output_dir / "metadata" / f"{safe_name}.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    # Convert dataclass to dict, handling non-serializable types
    meta_dict = asdict(metadata)
    json_path.write_text(json.dumps(meta_dict, indent=2, default=str), encoding='utf-8')
    paths['metadata'] = json_path

    return paths


def rebuild_index(output_dir: Path) -> tuple[Path, int]:
    """Rebuild the combined index from every generated metadata file."""
    metadata_dir = output_dir / "metadata"
    all_metadata = []
    for metadata_path in sorted(metadata_dir.glob("*.json")):
        all_metadata.append(json.loads(metadata_path.read_text(encoding="utf-8")))

    index_path = output_dir / "mission-index.json"
    index_data = {
        'generated_at': datetime.now().isoformat(),
        'mission_count': len(all_metadata),
        'missions': all_metadata,
    }
    index_path.write_text(json.dumps(index_data, indent=2, default=str), encoding='utf-8')
    return index_path, len(all_metadata)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch mission blurbs from JPL HORIZONS",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        '--output-dir', '-o',
        type=Path,
        default=Path('assets/horizons-blurbs'),
        help='Output directory for blurb files (default: assets/horizons-blurbs)'
    )
    parser.add_argument(
        '--missions', '-m',
        type=str,
        help='Comma-separated list of HORIZONS IDs to fetch (default: all known)'
    )
    parser.add_argument(
        '--delay',
        type=float,
        default=0.5,
        help='Delay between API requests in seconds (default: 0.5)'
    )
    parser.add_argument(
        '--quiet', '-q',
        action='store_true',
        help='Suppress progress output'
    )
    parser.add_argument(
        '--rebuild-index-only',
        action='store_true',
        help='Rebuild mission-index.json from existing metadata without fetching HORIZONS'
    )

    args = parser.parse_args()

    # Determine which missions to fetch
    if args.missions:
        # Filter to specified IDs
        requested_ids = set(int(x.strip()) for x in args.missions.split(','))
        missions = [m for m in KNOWN_LUNAR_MISSIONS if m[1] in requested_ids]
        if not missions:
            print(f"Error: No known missions match IDs: {args.missions}")
            sys.exit(1)
    else:
        missions = KNOWN_LUNAR_MISSIONS

    # Create output directory
    args.output_dir.mkdir(parents=True, exist_ok=True)

    if args.rebuild_index_only:
        index_path, mission_count = rebuild_index(args.output_dir)
        print(f"Rebuilt {index_path} from {mission_count} metadata files.")
        return

    print(f"Fetching blurbs for {len(missions)} missions...")
    print(f"Output directory: {args.output_dir}")
    print()

    # Fetch and process each mission
    success_count = 0
    error_count = 0

    for i, mission_info in enumerate(missions):
        name, horizons_id, mission_type, agency, year = mission_info

        # Fetch blurb
        raw_text = fetch_blurb(horizons_id, name)

        if raw_text:
            # Parse metadata
            metadata = parse_blurb(raw_text, mission_info)

            # Save files
            paths = save_blurb(raw_text, metadata, args.output_dir)

            success_count += 1

            if not args.quiet:
                print(f"    Saved: {paths['raw'].name}")
        else:
            error_count += 1

        # Rate limiting
        if i < len(missions) - 1:
            time.sleep(args.delay)

    # Rebuild from all metadata files so a filtered fetch does not truncate the index.
    index_path, indexed_count = rebuild_index(args.output_dir)

    # Summary
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Missions processed: {len(missions)}")
    print(f"  Successful:         {success_count}")
    print(f"  Errors:             {error_count}")
    print(f"  Indexed missions:   {indexed_count}")
    print(f"  Output directory:   {args.output_dir}")
    print(f"  Index file:         {index_path}")
    print()

    if error_count > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
