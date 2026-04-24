#!/usr/bin/env python3
"""
Fix all app icons:
  1. For corrupt/zero-byte icons: regenerate from scratch as RGB.
  2. For RGBA icons already on disk: convert to RGB (flatten onto white).
  3. For RGB icons: re-save with optimize=True.
"""
import os
from PIL import Image, ImageDraw

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "examples")

# ── colour palette ─────────────────────────────────────────────────────────────
BG_PRIMARY  = (26, 26, 46)      # dark navy
BG_ALT      = (42, 42, 62)      # slightly lighter navy
GREEN       = (0, 200, 120)
ORANGE      = (255, 135, 0)
BLUE        = (0, 136, 255)
RED         = (255, 51, 51)
YELLOW      = (255, 204, 0)
DIM         = (80, 80, 120)
WHITE       = (255, 255, 255)


# ── draw helpers ───────────────────────────────────────────────────────────────

def draw_radar(draw, s):
    """Bet Radar — radar/spider chart."""
    cx, cy = s * 0.5, s * 0.5
    r = s * 0.38
    n = 6
    import math
    pts = []
    for i in range(n):
        a = math.radians(i * 360 / n - 90)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    # outer polygon
    draw.polygon(pts, outline=DIM, fill=None)
    # filled area (scaled)
    scales = [0.85, 0.55, 0.7, 0.9, 0.45, 0.65]
    inner = [(cx + r * s2 * math.cos(math.radians(i * 360 / n - 90)),
              cy + r * s2 * math.sin(math.radians(i * 360 / n - 90)))
             for i, s2 in enumerate(scales)]
    draw.polygon(inner, fill=BLUE)
    draw.polygon(inner, outline=BLUE)
    # avg ring
    avg_r = r * 0.65
    draw.ellipse([cx - avg_r, cy - avg_r, cx + avg_r, cy + avg_r], outline=ORANGE, width=max(1, s//18))


def draw_goal_timeline(draw, s):
    """Goal Event Timeline — area chart with event markers."""
    # simple area chart
    ys = [0.8, 0.7, 0.55, 0.4, 0.35, 0.5, 0.45, 0.3]
    xs = [s * (0.05 + i * 0.9 / (len(ys)-1)) for i in range(len(ys))]
    poly = list(zip(xs, [s * y for y in ys]))
    poly.append((xs[-1], s * 0.9))
    poly.append((xs[0], s * 0.9))
    draw.polygon(poly, fill=BLUE)
    # event dots
    events = [(3, GREEN), (6, RED), (7, YELLOW)]
    for idx, col in events:
        x = xs[idx]
        y = s * ys[idx]
        r = max(2, s // 9)
        draw.ellipse([x-r, y-r, x+r, y+r], fill=col)


def draw_liability_gauge(draw, s):
    """Liability Exposure Gauge — concentric arc rings."""
    import math
    cx, cy = s * 0.5, s * 0.6
    rings = [
        (s * 0.40, 0.80, RED),
        (s * 0.31, 0.60, ORANGE),
        (s * 0.22, 0.25, GREEN),
    ]
    for radius, fill_ratio, col in rings:
        bbox = [cx - radius, cy - radius, cx + radius, cy + radius]
        draw.arc(bbox, 180, 360, fill=DIM, width=max(2, s//14))
        end_angle = 180 + fill_ratio * 180
        draw.arc(bbox, 180, end_angle, fill=col, width=max(2, s//14))


def draw_market_donut(draw, s):
    """Market Depth Donut — donut chart segments."""
    import math
    cx, cy = s * 0.5, s * 0.5
    outer = s * 0.44
    inner = s * 0.26
    slices = [
        (0,   110, BLUE),
        (112, 210, GREEN),
        (212, 290, ORANGE),
        (292, 358, RED),
    ]
    for start, end, col in slices:
        draw.pieslice([cx-outer, cy-outer, cx+outer, cy+outer], start, end, fill=col)
    draw.ellipse([cx-inner, cy-inner, cx+inner, cy+inner], fill=BG_PRIMARY)


def draw_match_heatmap(draw, s):
    """Match Heatmap Grid — grid of coloured cells."""
    cols, rows = 6, 4
    pad = max(1, s // 14)
    cw = (s - pad * (cols + 1)) / cols
    ch = (s - pad * (rows + 1)) / rows
    import random
    random.seed(42)
    palette = [(10, 22, 40), (26, 107, 170), (255, 51, 51)]

    def lerp_color(t):
        if t < 0.5:
            a, b, f = palette[0], palette[1], t * 2
        else:
            a, b, f = palette[1], palette[2], (t - 0.5) * 2
        return tuple(int(a[i] + (b[i] - a[i]) * f) for i in range(3))

    for r in range(rows):
        for c in range(cols):
            x = pad + c * (cw + pad)
            y = pad + r * (ch + pad)
            t = random.random()
            col = lerp_color(t)
            draw.rounded_rectangle([x, y, x + cw, y + ch], radius=max(1, s//18), fill=col)


def draw_worldcup_bets(draw, s):
    """World Cup Bets Pulse — football pitch with pulse bars."""
    # pitch outline
    draw.rounded_rectangle([s*0.1, s*0.15, s*0.9, s*0.85], radius=max(1, s//12),
                            outline=(0, 80, 0), width=max(1, s//18))
    # centre circle
    r = s * 0.14
    cx, cy = s * 0.5, s * 0.5
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=(0, 80, 0), width=max(1, s//24))
    # pulse bar
    bar_w = s * 0.5
    bar_h = max(2, s // 8)
    bx = cx - bar_w / 2
    by = s * 0.62
    draw.rounded_rectangle([bx, by, bx + bar_w, by + bar_h], radius=max(1, s//18), fill=DIM)
    draw.rounded_rectangle([bx, by, bx + bar_w * 0.65, by + bar_h], radius=max(1, s//18), fill=YELLOW)


# ── viz → draw function map ────────────────────────────────────────────────────

REGENERATE = {
    "bet_radar":      draw_radar,
    "goal_timeline":  draw_goal_timeline,
    "liability_gauge": draw_liability_gauge,
    "market_donut":   draw_market_donut,
    "match_heatmap":  draw_match_heatmap,
    "worldcup_bets":  draw_worldcup_bets,
}

SIZES = [
    ("appIcon.png",      36, False),
    ("appIcon_2x.png",   72, False),
    ("appIconAlt.png",   36, True),
    ("appIconAlt_2x.png", 72, True),
]


def make_icon(draw_fn, size, is_alt):
    bg = BG_ALT if is_alt else BG_PRIMARY
    img = Image.new("RGB", (size, size), bg)
    draw = ImageDraw.Draw(img)
    draw_fn(draw, size)
    return img


# ── 1. Regenerate corrupt icons ────────────────────────────────────────────────
print("=== Regenerating corrupt icons ===")
regen_count = 0
for viz_name, draw_fn in REGENERATE.items():
    static_dir = os.path.join(BASE, viz_name, "static")
    for fname, size, is_alt in SIZES:
        path = os.path.join(static_dir, fname)
        img = make_icon(draw_fn, size, is_alt)
        img.save(path, "PNG", optimize=True)
        regen_count += 1
        print(f"  {viz_name}/{fname} ({os.path.getsize(path)} bytes)")

# ── 2. Convert RGBA→RGB for all remaining icons ────────────────────────────────
print(f"\n=== Converting remaining RGBA icons to RGB ===")
fixed = []
already_rgb = []
errors = []

for viz in sorted(os.listdir(BASE)):
    if viz in REGENERATE:
        continue  # already handled above
    static_dir = os.path.join(BASE, viz, "static")
    if not os.path.isdir(static_dir):
        continue
    for fname in sorted(os.listdir(static_dir)):
        if not (fname.startswith("appIcon") and fname.endswith(".png")):
            continue
        path = os.path.join(static_dir, fname)
        try:
            img = Image.open(path)
            if img.mode == "RGBA":
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img, mask=img.split()[3])
                bg.save(path, "PNG", optimize=True)
                fixed.append(f"{viz}/{fname}")
            elif img.mode == "RGB":
                img.save(path, "PNG", optimize=True)
                already_rgb.append(f"{viz}/{fname}")
            else:
                errors.append(f"{viz}/{fname} (mode: {img.mode})")
        except Exception as e:
            errors.append(f"{viz}/{fname}: {e}")

print(f"  RGBA→RGB converted: {len(fixed)}")
for f in fixed:
    print(f"    {f}")
print(f"  Already RGB (re-optimized): {len(already_rgb)}")
if errors:
    print(f"  Errors: {len(errors)}")
    for e in errors:
        print(f"    {e}")

print(f"\nDone. Regenerated {regen_count} icons from scratch, converted {len(fixed)} RGBA→RGB.")
