#!/usr/bin/env python3
"""Regenerate the small app-bundled Moon preview from the staged NASA color map."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "images/moon/lroc_color_2025_4k_fast.jpg"
targets = [
    (root / "src/platform/assets/moon-preview.jpg", (1024, 512), 78),
    (root / "images/moon/lroc_color_2025_2k_low.jpg", (2048, 1024), 85),
]
with Image.open(source) as image:
    for target, dimensions, quality in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        image.convert("RGB").resize(dimensions, Image.Resampling.LANCZOS).save(
            target, quality=quality, optimize=True, progressive=True,
        )
        print(f"{target}: {target.stat().st_size} bytes")
