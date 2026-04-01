# Bet Type Radar Chart — Splunk Custom Visualization

Spider/radar chart showing the distribution of bet types for a World Cup match. Optionally overlays current match data vs tournament average for comparison.

## Install

1. Copy or symlink the `bet_radar/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Bet Type Radar Chart" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
|--------|------|-------------|
| bet_type | string | Name of the bet type (e.g., "Match Result", "Corners") |
| volume | number | Current betting volume for this bet type |

## Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| avg_volume | number | Tournament average volume for comparison overlay |

## Notes

- Each row represents one bet type — the radar chart draws one axis per row.
- The polygon vertices show the volume distribution across bet types.
- When `showAverage` is enabled and `avg_volume` data is present, a second dashed polygon overlays the tournament average.
- Auto-scale mode (`maxValue = 0`) sets 100% radius to the maximum value across all data points.

## Search

```spl
index=betting sourcetype=worldcup_bets
| stats count as volume by bet_type
| eventstats avg(volume) as avg_volume
| table bet_type volume avg_volume
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| fillColor | Primary polygon fill color | #0088ff |
| avgColor | Tournament average polygon color | #ff8800 |
| showAverage | Show average overlay polygon | true |
| showValues | Show numeric value labels at vertices | true |
| showGrid | Show concentric grid rings and spokes | true |
| maxValue | Max axis value (0 = auto-scale from data) | 0 |
| fillOpacity | Polygon fill opacity (0.0 to 1.0) | 0.25 |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh bet_radar
```

The tarball is output to `dist/bet_radar-1.0.0.tar.gz`.
