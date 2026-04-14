# Liability Exposure Gauge — Splunk Custom Visualization

Multi-ring concentric gauge showing the company's liability exposure across different betting outcomes. Each ring represents a liability category and fills proportionally to its threshold, transitioning from green (safe) through yellow (warning) to red (danger). Rings exceeding the warning threshold pulse with a glow effect. The center displays the total aggregate exposure with RAG status coloring. Designed for risk management NOC displays during World Cup betting operations.

## Install

1. Copy or symlink the `liability_gauge/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Liability Exposure Gauge" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| `category` | string | Liability category name (e.g., "Match Result", "Goal Scorers") |
| `exposure` | number | Current exposure amount for this category |
| `threshold` | number | Maximum acceptable exposure for this category |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| `status` | string | Override status: "ok", "warning", or "critical" |

## Notes

- Each row in the search results represents one liability category displayed as a concentric ring
- Percentage is calculated as `exposure / threshold * 100`
- Rings transition color based on percentage: safe (below warn%), warning (warn% to 100%), danger (above 100%)
- The center number shows the sum of all exposures, colored by the worst status across all categories
- Threshold tick marks appear at the warning percentage and at 100%

## Search

```spl
| makeresults count=6
| streamstats count as idx
| eval category=case(idx=1,"Match Result",idx=2,"Goal Scorers",idx=3,"Correct Score",idx=4,"Over/Under",idx=5,"Both Teams Score",idx=6,"Corners & Cards")
| eval threshold=case(idx=1,3000000,idx=2,2000000,idx=3,800000,idx=4,1500000,idx=5,1000000,idx=6,500000)
| eval exposure=round(random() % threshold * 1.1)
| table category exposure threshold
| appendpipe [| stats count | where count=0 | eval _status="Awaiting liability data", category="", exposure=0, threshold=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| Safe Color | Color for safe exposure levels | `#00cc66` |
| Warning Color | Color for warning exposure levels | `#ffaa00` |
| Danger Color | Color for danger exposure levels | `#ff3333` |
| Warning Threshold (%) | Percentage at which warning color begins | `70` |
| Show Values | Display exposure values on each ring | `true` |
| Show Labels | Display category labels on each ring | `true` |
| Ring Gap (px) | Pixel gap between concentric rings | `8` |
| Show Pulse | Pulsing glow on rings exceeding warning threshold | `true` |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh liability_gauge
```

The tarball is output to `dist/liability_gauge-1.0.0.tar.gz`.
