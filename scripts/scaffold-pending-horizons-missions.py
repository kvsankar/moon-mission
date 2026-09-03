#!/usr/bin/env python3
"""Scaffold pending HORIZONS missions with config."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = PROJECT_ROOT / "assets" / "horizons-blurbs" / "mission-index.json"
ASSETS_DIR = PROJECT_ROOT / "assets"


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    raw = raw.replace("UTC", "").replace("TDB", "").replace("GMT", "").replace("/", " ").strip()
    raw = re.sub(r"\s+", " ", raw)
    fmts = [
        "%Y-%b-%d %H:%M:%S",
        "%Y-%b-%d %H:%M",
        "%Y-%b-%d",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%B %d, %Y",
    ]
    for fmt in fmts:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def dt_parts(dt: datetime) -> dict[str, str]:
    return {
        "year": f"{dt.year:04d}",
        "month": f"{dt.month:02d}",
        "day": f"{dt.day:02d}",
        "hour": f"{dt.hour:02d}",
        "minute": f"{dt.minute:02d}",
    }


def duration_days(start: datetime, end: datetime) -> float:
    return max(1.0, (end - start).total_seconds() / 86400.0)


def choose_step_seconds(days: float) -> int:
    _ = days
    return 60

MISSIONS: list[dict] = [
    {
        "slug": "apollo-8-s-ivb",
        "folder": "apollo8-sivb",
        "mnemonic": "A8S",
        "start": "1968-Dec-21 16:05",
        "end": "1968-Dec-31 00:05",
        "launch": "1968-Dec-21 12:51",
        "events": [
            {"key": "tli", "time": "1968-Dec-21 16:05", "label": "TLI Arc Start", "info": "Start of reconstructed departure arc"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/apollo-8-s-ivb.txt: 'trajectory spans ... from 1968-Dec-21 16:05 to December 31 @ 00:05 GMT/UTC'",
            "assets/horizons-blurbs/raw/apollo-8-s-ivb.txt: 'Launched: December 21, 1968 @ 12:51 GMT/UTC'",
        ],
    },
    {
        "slug": "apollo-9-s-ivb",
        "folder": "apollo9-sivb",
        "mnemonic": "A9S",
        "start": "1969-Mar-03 23:38",
        "end": "1969-Mar-11 00:05",
        "launch": "1969-Mar-03 16:00",
        "events": [
            {"key": "arcStart", "time": "1969-Mar-03 23:38", "label": "Departure Arc Start", "info": "Start of reconstructed departure arc"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/apollo-9-s-ivb.txt: 'trajectory spans ... from 1969-Mar-03 23:38 to March 11 @ 00:05 GMT/UTC'",
            "assets/horizons-blurbs/raw/apollo-9-s-ivb.txt: 'Launched: March 3, 1969 @ 16:00 GMT/UTC'",
        ],
    },
    {
        "slug": "apollo-10-s-ivb",
        "folder": "apollo10-sivb",
        "mnemonic": "A10S",
        "start": "1969-May-18 19:44",
        "end": "1969-May-29 00:06",
        "launch": "1969-May-18 16:49",
        "events": [
            {"key": "arcStart", "time": "1969-May-18 19:44", "label": "Departure Arc Start", "info": "Start of reconstructed departure arc"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/apollo-10-s-ivb.txt: 'trajectory spans ... from 1969-May-18 19:44 to May 29 @ 00:06 GMT/UTC'",
            "assets/horizons-blurbs/raw/apollo-10-s-ivb.txt: 'Launched: May 18, 1969 @ 16:49 GMT/UTC'",
        ],
    },
    {
        "slug": "apollo-12-s-ivb",
        "folder": "apollo12-sivb",
        "mnemonic": "A12S",
        "start": "1969-Nov-14 19:33",
        "end": "1969-Dec-06 00:06",
        "launch": "1969-Nov-14 16:22",
        "events": [
            {"key": "arcStart", "time": "1969-Nov-14 19:33", "label": "Departure Arc Start", "info": "Start of reconstructed departure arc"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/apollo-12-s-ivb.txt: 'trajectory spans ... from 1969-Nov-14 19:33 to December 06 @ 00:06 GMT/UTC'",
            "assets/horizons-blurbs/raw/apollo-12-s-ivb.txt: 'Launched: November 14, 1969 @ 16:22 GMT/UTC'",
        ],
    },
    {
        "slug": "clementine",
        "folder": "clementine",
        "mnemonic": "CLM",
        "start": "1994-Feb-19 12:59",
        "end": "1994-May-03 12:59",
        "launch": "1994-Jan-25 16:34",
        "events": [
            {"key": "lunarOrbit", "time": "1994-Feb-19 12:59", "label": "Lunar Orbit Mapping", "info": "Start of mapped LOI/mapping trajectory"},
            {"key": "lunarDeparture", "time": "1994-May-03 12:59", "label": "Lunar Departure", "info": "Departure from lunar mapping orbit"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/clementine.txt: 'clem_nrl 1994-Feb-19 12:59 1994-May-03 12:59'",
            "assets/horizons-blurbs/raw/clementine.txt: 'was launched 1994-Jan-25 @ 16:34 UTC'",
        ],
    },
    {
        "slug": "lunar-prospector",
        "folder": "lunar-prospector",
        "mnemonic": "LPRO",
        "start": "1998-Jan-07 03:00:00",
        "end": "1998-Jan-20 00:05:00",
        "launch": "1998-Jan-07 03:00:00",
        "events": [
            {"key": "loi", "time": "1998-Jan-11 12:18:03", "label": "LOI Arc Boundary", "info": "Transfer to LOI segment boundary"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/lunar-prospector.txt: 'lpm-transfer.bsp (1998-Jan-07 03:00:00 -> 1998-Jan-11 12:18:03)'",
            "assets/horizons-blurbs/raw/lunar-prospector.txt: 'lpm-loi.bsp (1998-Jan-11 12:18:03 -> 1998-Jan-20 00:05:00)'",
        ],
    },
    {
        "slug": "lro",
        "folder": "lro",
        "mnemonic": "LRO",
        "start": "2009-Jun-18 22:16",
        "end": "2027-Jul-18 23:59",
        "launch": "2009-Jun-18 09:32",
        "events": [
            {"key": "reconStart", "time": "2009-Jun-18 22:16", "label": "Reconstruction Start", "info": "Start of reconstructed trajectory"},
            {"key": "predictStart", "time": "2025-Sep-15 00:01", "label": "Predict Updates", "info": "Start of periodic tag-up prediction segment"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/lro.txt: 'Reconstructed trajectory 2009-Jun-18 22:16 2025-Sep-15 00:01'",
            "assets/horizons-blurbs/raw/lro.txt: '558day_20260107_01 2026-Jan-07 00:01 2027-Jul-18 23:59'",
            "assets/horizons-blurbs/raw/lro.txt: 'launched 2009-Jun-18 9:32 UTC'",
        ],
    },
    {
        "slug": "lcross-shepherd",
        "folder": "lcross-shepherd",
        "mnemonic": "LCSH",
        "start": "2009-Jun-18 00:00",
        "end": "2009-Oct-09 11:35",
        "launch": "2009-Jun-18 21:32:01",
        "events": [
            {"key": "impact", "time": "2009-Oct-09 11:35:36", "label": "Impact", "info": "Shepherd stage impact"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/lcross-shepherd.txt: trajectory table begins at 2009-Jun-18 and ends 2009-Oct-09",
            "assets/horizons-blurbs/raw/lcross-shepherd.txt: '* Shepherd impact : 2009-Oct-09 11:35:36.116 UTC'",
        ],
    },
    {
        "slug": "lcross-centaur",
        "folder": "lcross-centaur",
        "mnemonic": "LCCN",
        "start": "2009-Oct-09 01:50",
        "end": "2009-Oct-09 11:32",
        "launch": "2009-Jun-18 21:32:01",
        "events": [
            {"key": "impact", "time": "2009-Oct-09 11:31:19", "label": "Centaur Impact", "info": "Centaur impact on lunar surface"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/lcross-centaur.txt: '18_lx091009c_centaur_impact 2009-Oct-09 01:50 2009-Oct-09 11:32'",
            "assets/horizons-blurbs/raw/lcross-centaur.txt: '* Centaur impact : 2009-Oct-09 11:31:19.506 UTC'",
        ],
    },
    {
        "slug": "grail-ss-stage",
        "folder": "grail-ss-stage",
        "mnemonic": "GRSS",
        "start": "2011-Sep-12 15:08",
        "end": "2061-Aug-30 00:00",
        "launch": "2011-Sep-12 15:08",
        "events": [
            {"key": "depletionBurn", "time": "2011-Sep-12 15:08:23", "label": "Depletion Burn", "info": "Nominal depletion burn"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/grail-ss-stage.txt: 'GRSS_0910_99_50yr-stratcom 2011 SEP 12 2061 AUG 30'",
            "assets/horizons-blurbs/raw/grail-ss-stage.txt: '* Nominal time of depletion burn: 2011-Sep-12 15:08:23 UTC'",
        ],
    },
    {
        "slug": "ladee",
        "folder": "ladee",
        "mnemonic": "LAD",
        "start": "2013-Sep-07 00:00",
        "end": "2014-Apr-18 00:00",
        "launch": "2013-Sep-07 03:27",
        "events": [
            {"key": "plannedImpact", "time": "2014-Apr-18 00:00", "label": "Planned Impact", "info": "End of listed trajectory interval"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/ladee.txt: trajectory rows span 2013-Sep-07 to 2014-Apr-18",
            "assets/horizons-blurbs/raw/ladee.txt: 'Launch : 2013-Sep-07 03:27 UTC'",
        ],
    },
    {
        "slug": "capstone",
        "folder": "capstone",
        "mnemonic": "CAPS",
        "start": "2022-Jun-28 10:07",
        "end": "2026-Feb-03 15:29",
        "launch": "2022-Jun-28 09:55:52",
        "events": [
            {"key": "separation", "time": "2022-Jul-04 17:15", "label": "Separation", "info": "Photon-CAPSTONE trajectory segment boundary"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/capstone.txt: 'photon_capstone_full_mission 2022-Jun-28 10:07 2022-Jul-04 17:15'",
            "assets/horizons-blurbs/mission-index.json: trajectory_end=2026-Feb-03 15:29",
            "assets/horizons-blurbs/raw/capstone.txt: launch section with 2022-Jun-28 09:55:52 UTC",
        ],
    },
    {
        "slug": "lunar-flashlight",
        "folder": "lunar-flashlight",
        "mnemonic": "LFL",
        "start": "2022-Dec-11 08:34",
        "end": "2038-Jan-01 00:00",
        "launch": "2022-Dec-11 07:38",
        "events": [
            {"key": "deployment", "time": "2022-Dec-11 08:31", "label": "Deployment", "info": "Lunar Flashlight deployment"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/lunar-flashlight.txt: 'trj_lfl_221211-230627_380101_final_v1 2022-Dec-11 08:34 2038-Jan-01'",
            "assets/horizons-blurbs/raw/lunar-flashlight.txt: launch/deployment times in background section",
        ],
    },
    {
        "slug": "lunar-trailblazer",
        "folder": "lunar-trailblazer",
        "mnemonic": "LTB",
        "start": "2025-Feb-27 00:00",
        "end": "2051-Jan-01 00:00",
        "launch": "2025-Feb-27 00:16:32",
        "events": [
            {"key": "missionEnded", "time": "2025-Jul-31 00:00", "label": "Mission End", "info": "Mission formally ended after loss of contact"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/lunar-trailblazer.txt: 'ltb_trj_od007v1 2025-Feb-27 2051-Jan-01'",
            "assets/horizons-blurbs/raw/lunar-trailblazer.txt: mission launch date line 2025-Feb-27 00:16:32 UTC",
            "assets/horizons-blurbs/raw/lunar-trailblazer.txt: NOTE with mission end on 2025-Jul-31",
        ],
    },
    {
        "slug": "slim",
        "folder": "slim",
        "mnemonic": "SLIM",
        "start": "2023-Sep-07 00:32",
        "end": "2024-Jan-31 00:00",
        "launch": "2023-Sep-06 23:42",
        "events": [
            {"key": "softLanding", "time": "2024-Jan-19 15:19:57", "label": "Soft Landing", "info": "SLIM landed on the Moon"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/slim.txt: first listed trajectory segment begins 2023-Sep-07 00:32",
            "assets/horizons-blurbs/raw/slim.txt: final listed segment ends 2024-Jan-31",
            "assets/horizons-blurbs/raw/slim.txt: launch and landing times in background",
        ],
    },
    {
        "slug": "kplo-danuri",
        "folder": "kplo-danuri",
        "mnemonic": "KPLO",
        "start": "2022-Aug-04 23:19",
        "end": "2026-Jul-02 23:33",
        "launch": "2022-Aug-04 23:08",
        "events": [
            {"key": "moonArrival", "time": "2022-Dec-16 00:00", "label": "Moon Arrival", "info": "Arrival at Moon after BLT"},
        ],
        "sources": [
            "assets/horizons-blurbs/raw/kplo-danuri.txt: 'Concatenated trajectory solutions (828) 2022-Aug-04 23:19 2026-Jul-02 23:33'",
            "assets/horizons-blurbs/raw/kplo-danuri.txt: launch timeline with 2022-Aug-04 23:08 UTC",
        ],
    },
]


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def build_events(defn: dict, start_iso: str, mnemonic: str) -> tuple[dict, list[str]]:
    events: dict = {}
    order: list[str] = []

    events["missionStart"] = {
        "startTime": start_iso,
        "durationSeconds": 0,
        "label": "🚀 Launch",
        "burnFlag": False,
        "infoText": "Mission timeline start",
        "body": "SC",
    }
    order.append("missionStart")

    for item in defn.get("events", []):
        dt = parse_dt(item.get("time"))
        if not dt:
            continue
        key = item["key"]
        events[key] = {
            "startTime": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "durationSeconds": 0,
            "label": item.get("label", key),
            "burnFlag": bool(re.search(r"burn|loi|tli", item.get("label", ""), re.IGNORECASE)),
            "infoText": item.get("info", item.get("label", key)),
            "body": "SC",
        }
        order.append(key)

    data_end_key = f"{mnemonic.lower()}DataEnd"
    events["now"] = {
        "kind": "now",
        "timeSource": {"type": "now"},
        "startTime": "dynamic",
        "durationSeconds": 0,
        "label": "⏰ Now",
        "burnFlag": False,
        "infoText": "Now",
        "body": "",
    }
    order.append("now")

    events[data_end_key] = {
        "kind": "data_end",
        "timeSource": {"type": "data_end", "spacecraftMnemonic": mnemonic},
        "startTime": "dynamic",
        "durationSeconds": 0,
        "label": f"🏁{mnemonic} Data End",
        "burnFlag": False,
        "infoText": f"{mnemonic} Data End",
        "body": "",
    }
    order.append(data_end_key)

    return events, order


def main() -> None:
    data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    mission_index = {slugify(item["name"]): item for item in data.get("missions", []) if isinstance(item, dict) and item.get("name")}

    generated: list[str] = []
    for defn in MISSIONS:
        slug = defn["slug"]
        folder = defn["folder"]
        mnemonic = defn["mnemonic"]
        mission_meta = mission_index.get(slug)
        if mission_meta is None:
            raise RuntimeError(f"Mission slug not found in mission-index: {slug}")

        mission_name = mission_meta.get("name", slug)
        mission_url = mission_meta.get("url") or ""
        spacecraft_id = mission_meta.get("horizons_id")
        if not isinstance(spacecraft_id, int):
            raise RuntimeError(f"Invalid horizons_id for {slug}")

        start_dt = parse_dt(defn.get("start")) or parse_dt(mission_meta.get("trajectory_start"))
        end_dt = parse_dt(defn.get("end")) or parse_dt(mission_meta.get("trajectory_end"))
        launch_dt = parse_dt(defn.get("launch")) or parse_dt(mission_meta.get("launch_date")) or start_dt

        if start_dt is None or end_dt is None:
            raise RuntimeError(f"Missing start/end datetime for {slug}")
        if launch_dt is None:
            launch_dt = start_dt

        step_seconds = choose_step_seconds(duration_days(start_dt, end_dt))

        start_parts = dt_parts(start_dt)
        end_parts = dt_parts(end_dt)

        start_iso = launch_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        events, event_order = build_events(defn, start_iso, mnemonic)

        config = {
            "spacecraft_mnemonic": mnemonic,
            "spacecraft_id": spacecraft_id,
            "mission_name": mission_name,
            "mission_name_short": mnemonic,
            "mission_url": mission_url,
            "mission_description": f"{mission_name} Orbit Animation by Sankar Viswanathan",
            "mission_keywords": ", ".join(sorted(set((slug.replace("-", " ") + " moon mission orbit animation").split()))),
            "mission_github": "https://github.com/kvsankar/moon-mission",
            "ephemeris_source": "chebyshev",
            "ephemeris_sources": {
                "SC": "chebyshev",
                "MOON": "chebyshev",
                "EARTH": "chebyshev",
                "SUN": "chebyshev",
            },
            "ui": {
                "pageTitle": f"{mission_name} - Orbit Animation",
                "headerTitle": mission_name,
                "lockOnLabel": mission_name,
                "orbitLabel": f"{mnemonic} Orbit",
                "descentOrbitLabel": f"{mnemonic} Orbit",
            },
            "is_lunar": True,
            "origins": ["geo", "lunar"],
            "geo": {
                "start_year": start_parts["year"],
                "start_month": start_parts["month"],
                "start_day": start_parts["day"],
                "start_hour": start_parts["hour"],
                "start_minute": start_parts["minute"],
                "stop_year": end_parts["year"],
                "stop_month": end_parts["month"],
                "stop_day": end_parts["day"],
                "stop_hour": end_parts["hour"],
                "stop_minute": end_parts["minute"],
                "step_size_in_seconds": step_seconds,
                "planets": ["MOON", "SC"],
                "center": "earth_center",
                "orbits_file": f"geo-{mnemonic}",
            },
            "lunar": {
                "start_year": start_parts["year"],
                "start_month": start_parts["month"],
                "start_day": start_parts["day"],
                "start_hour": start_parts["hour"],
                "start_minute": start_parts["minute"],
                "stop_year": end_parts["year"],
                "stop_month": end_parts["month"],
                "stop_day": end_parts["day"],
                "stop_hour": end_parts["hour"],
                "stop_minute": end_parts["minute"],
                "step_size_in_seconds": step_seconds,
                "planets": ["SC", "EARTH"],
                "center": "moon_center",
                "orbits_file": f"lunar-{mnemonic}",
            },
            "landing": {
                "enabled": False,
                "comment": "No dedicated high-resolution landing slice configured for this mission.",
                "start_year": start_parts["year"],
                "start_month": start_parts["month"],
                "start_day": start_parts["day"],
                "start_hour": start_parts["hour"],
                "start_minute": start_parts["minute"],
                "stop_year": start_parts["year"],
                "stop_month": start_parts["month"],
                "stop_day": start_parts["day"],
                "stop_hour": start_parts["hour"],
                "stop_minute": start_parts["minute"],
                "step_size_in_seconds": 1,
                "planets": ["SC"],
                "center": "moon_center",
                "orbits_file": f"landing-{mnemonic}",
            },
            "spacecraftModel": {
                "enabled": False,
                "comment": f"3D model not configured for {mnemonic}."
            },
            "events": events,
            "eventConfigs": {
                "geo": event_order,
                "lunar": event_order,
            },
        }

        config_dir = ASSETS_DIR / folder / "data"
        config_dir.mkdir(parents=True, exist_ok=True)
        (config_dir / "config.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

        generated.append(folder)

    print("Generated mission scaffolds:")
    for folder in generated:
        print(f"- {folder}")


if __name__ == "__main__":
    main()
