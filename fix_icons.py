#!/usr/bin/env python3
"""Regenerate zero-byte app icons for bet_flow_map, odds_ticker, wc_bracket."""
import os, math
from PIL import Image, ImageDraw

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "examples")

BG_PRIMARY = (26, 26, 46, 255)
BG_ALT = (42, 42, 62, 255)
GREEN = (0, 200, 120, 255)
ORANGE = (255, 135, 0, 255)
DIM = (80, 80, 120, 255)
WHITE = (255, 255, 255, 255)


def draw_bet_flow_map(draw, s):
    # Curved flow lines between dots
    pts = [(s*0.2, s*0.35), (s*0.5, s*0.25), (s*0.8, s*0.5)]
    for i in range(len(pts)-1):
        draw.line([pts[i], pts[i+1]], fill=GREEN, width=max(1, s//24))
    for p in pts:
        r = max(2, s // 10)
        draw.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=ORANGE)
    # Second flow
    pts2 = [(s*0.25, s*0.7), (s*0.55, s*0.55), (s*0.8, s*0.5)]
    for i in range(len(pts2)-1):
        draw.line([pts2[i], pts2[i+1]], fill=GREEN, width=max(1, s//24))
    r = max(2, s // 10)
    draw.ellipse([pts2[0][0]-r, pts2[0][1]-r, pts2[0][0]+r, pts2[0][1]+r], fill=ORANGE)


def draw_odds_ticker(draw, s):
    # Horizontal ticker cards
    cw = max(4, s // 4)
    gap = max(1, s // 18)
    y0 = s * 0.25
    ch = s * 0.5
    colors = [GREEN, ORANGE, (0, 200, 255, 255)]
    for i in range(3):
        x = gap + i * (cw + gap)
        draw.rounded_rectangle([x, y0, x + cw, y0 + ch], radius=max(1, s//12), fill=(40, 40, 60, 255))
        draw.rectangle([x, y0, x + max(1, s//18), y0 + ch], fill=colors[i])


def draw_wc_bracket(draw, s):
    # Tournament bracket lines
    gap = max(1, s // 18)
    bw = max(3, s // 5)
    # Left column - 4 slots
    for i in range(4):
        y = s*0.1 + i * s*0.22
        draw.rounded_rectangle([s*0.05, y, s*0.05 + bw, y + s*0.14], radius=max(1, s//18), fill=(40, 40, 60, 255))
    # Connectors to right column - 2 slots
    draw.line([(s*0.05 + bw, s*0.17), (s*0.45, s*0.17), (s*0.45, s*0.39), (s*0.05 + bw, s*0.39)], fill=DIM, width=1)
    draw.line([(s*0.45, s*0.28), (s*0.5, s*0.28)], fill=DIM, width=1)
    draw.line([(s*0.05 + bw, s*0.61), (s*0.45, s*0.61), (s*0.45, s*0.83), (s*0.05 + bw, s*0.83)], fill=DIM, width=1)
    draw.line([(s*0.45, s*0.72), (s*0.5, s*0.72)], fill=DIM, width=1)
    for i in range(2):
        y = s*0.21 + i * s*0.44
        draw.rounded_rectangle([s*0.5, y, s*0.5 + bw, y + s*0.14], radius=max(1, s//18), fill=(40, 40, 60, 255))
    # Final
    draw.line([(s*0.5 + bw, s*0.28), (s*0.75, s*0.28), (s*0.75, s*0.72), (s*0.5 + bw, s*0.72)], fill=DIM, width=1)
    draw.line([(s*0.75, s*0.5), (s*0.8, s*0.5)], fill=DIM, width=1)
    draw.rounded_rectangle([s*0.8, s*0.43, s*0.95, s*0.57], radius=max(1, s//18), fill=ORANGE)


VIZS = {
    "bet_flow_map": draw_bet_flow_map,
    "odds_ticker": draw_odds_ticker,
    "wc_bracket": draw_wc_bracket,
}

SIZES = [
    ("appIcon.png", 36, False),
    ("appIcon_2x.png", 72, False),
    ("appIconAlt.png", 36, True),
    ("appIconAlt_2x.png", 72, True),
]

count = 0
for viz_name, draw_fn in VIZS.items():
    static_dir = os.path.join(BASE, viz_name, "static")
    for fname, size, is_alt in SIZES:
        bg = BG_ALT if is_alt else BG_PRIMARY
        img = Image.new("RGBA", (size, size), bg)
        draw = ImageDraw.Draw(img)
        draw_fn(draw, size)
        out = os.path.join(static_dir, fname)
        img.save(out)
        count += 1
        fsize = os.path.getsize(out)
        print(f"  {out} ({fsize} bytes)")

print(f"\nRegenerated {count} icons for {len(VIZS)} vizs")
