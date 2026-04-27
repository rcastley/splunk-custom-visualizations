#!/usr/bin/env python3
"""
Regenerate app icons from preview.png for mismatched/blank apps.
Takes a centered square crop of the 116x76 preview and scales to 36x36 / 72x72.
"""
import os
from PIL import Image

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "examples")

# Apps whose icons don't match their preview (blank, wrong viz type, etc.)
TARGETS = [
    "license_gauge",
    "splunk_status_board",
    "worldcup_bets",
    "search_activity",
    "indexing_pipeline_flow",
    "f1_track_info",
    "bet_radar",
]

SIZES = [
    ("appIcon.png",      36),
    ("appIcon_2x.png",   72),
    ("appIconAlt.png",   36),
    ("appIconAlt_2x.png", 72),
]


def make_icons_from_preview(app_name):
    app_path = os.path.join(BASE, app_name)
    preview_path = os.path.join(
        app_path, "appserver", "static", "visualizations", app_name, "preview.png"
    )
    static_path = os.path.join(app_path, "static")

    if not os.path.exists(preview_path):
        print(f"  SKIP {app_name}: no preview.png found")
        return

    img = Image.open(preview_path).convert("RGBA")
    w, h = img.size

    # Centered square crop from the preview
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    square = img.crop((left, top, left + side, top + side))

    for fname, size in SIZES:
        out_path = os.path.join(static_path, fname)
        resized = square.resize((size, size), Image.LANCZOS).convert("RGB")
        resized.save(out_path, "PNG", optimize=True)
        print(f"  {fname} ({size}x{size}, {os.path.getsize(out_path)} bytes)")


for app in TARGETS:
    print(f"\n{app}")
    make_icons_from_preview(app)

print("\nDone.")
