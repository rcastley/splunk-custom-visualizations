# World Cup Bets Pulse — Splunk Custom Visualization

Football pitch-themed radial pulse gauge for displaying real-time betting volume during World Cup matches. Features a stylized pitch background, 360-degree segmented ring gauge with animated pulse glow, converging particle effects on volume spikes, match name overlay, peak indicator, and trend arrows. Designed for NOC-style wall displays at betting companies.

## Install

1. Copy or symlink the `worldcup_bets/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "World Cup Bets Pulse" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| `bets_per_minute` | number | Current bets per minute count (field name configurable) |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| `match_name` | string | Match being displayed (e.g., "ENGLAND vs FRANCE") |
| `peak_bpm` | number | Peak bets per minute observed |
| `prev_bpm` | number | Previous minute's BPM for trend calculation |

## Notes

- The `bets_per_minute` field name is configurable via the "BPM Field" formatter setting
- Trend arrow shows: green up (>3% increase), red down (>3% decrease), yellow stable
- Particle effects activate when volume exceeds 30% of max BPM
- Three pitch themes: Classic Green, Dark (default for NOC), Neon

## Search

```spl
| makeresults
| eval bets_per_minute=round(random() % 10000), match_name="ENGLAND vs FRANCE", peak_bpm=12450, prev_bpm=round(random() % 10000)
| appendpipe [| stats count | where count=0 | eval _status="Awaiting betting data", bets_per_minute=0, match_name="", peak_bpm=0, prev_bpm=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| BPM Field | Column name for bets per minute value | `bets_per_minute` |
| Max BPM | Maximum value for the gauge scale | `10000` |
| Animation Speed | Speed of pulse and particle animations (slow/medium/fast) | `medium` |
| Show Peak | Display peak BPM indicator | `true` |
| Pitch Style | Background theme (classic/dark/neon) | `dark` |
| Low Volume Color | Color for low betting volume | `#0088ff` |
| Mid Volume Color | Color for mid betting volume | `#ffcc00` |
| High Volume Color | Color for high betting volume | `#ff3333` |
| Show Pitch | Toggle football pitch background | `true` |
| Show Particles | Toggle particle convergence effects | `true` |
| Show Volume Bar | Toggle volume bar at bottom | `true` |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh worldcup_bets
```

The tarball is output to `dist/worldcup_bets-1.0.0.tar.gz`.
