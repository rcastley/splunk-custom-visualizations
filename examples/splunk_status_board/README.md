# Splunk Status Board — Splunk Custom Visualization

Glass-themed component health status board that displays a grid of animated tiles representing Splunk infrastructure components. Each tile shows a glass tube with liquid fill based on health score, status icons, and error/warning count badges. Uses the same glass-skeuomorphic design language as the Indexing Pipeline Flow visualization.

## Install

1. Copy or symlink the `splunk_status_board/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Splunk Status Board" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| component | string | Component name (e.g., "Indexer", "Search Head") |
| status | string | Component status: "ok", "warning", or "critical" |
| errors | integer | Error count for the component |
| warns | integer | Warning count for the component |
| health_score | float | Health score 0-100 (higher = worse), maps to liquid fill level |

## Notes

- Health score drives the liquid fill height inside each tile — 0 means empty (healthy), 100 means full (critical).
- Liquid color transitions from green to yellow to red based on configurable thresholds.
- Critical tiles pulse with a glow effect when "Show Glow" is enabled.
- Click any tile to trigger a drilldown event with the component name.

## Search

```spl
| rest /services/server/health/splunkd/details
| rename title as component
| eval status=case(health="green","ok", health="yellow","warning", health="red","critical", 1=1,"ok")
| eval health_score=case(status="critical",90, status="warning",60, 1=1,10)
| eval errors=if(status="critical", random()%50+1, 0)
| eval warns=if(status="warning", random()%20+1, if(status="critical", random()%30+1, 0))
| table component status errors warns health_score
| appendpipe [| stats count | where count=0 | eval _status="Awaiting component data", component="", status="ok", errors=0, warns=0, health_score=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| colorTheme | Visual theme: default, dark, or neon | default |
| showGlow | Enable glow effect on critical tiles | true |
| warningThreshold | Health score threshold for yellow color (0-100) | 50 |
| criticalThreshold | Health score threshold for red color (0-100) | 80 |
| showCounts | Show error and warning count badges | true |
| animSpeed | Animation speed: slow, medium, or fast | medium |
| columns | Number of columns in the tile grid | 3 |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh splunk_status_board
```

The tarball is output to `dist/splunk_status_board-1.0.0.tar.gz`.
