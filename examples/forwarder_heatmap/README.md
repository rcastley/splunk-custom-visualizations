# Forwarder Heatmap — Splunk Custom Visualization

Glass-themed heatmap grid showing Splunk forwarder health. Each cell represents one forwarder and displays its hostname, minutes since last check-in, and events per second. Cells fill with liquid based on staleness — fresh forwarders show green, stale show yellow, missing show red. Uses the same glass-skeuomorphic design language as the Indexing Pipeline Flow visualization.

## Install

1. Copy or symlink the `forwarder_heatmap/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Forwarder Heatmap" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
|--------|------|-------------|
| host | string | Forwarder hostname |
| mins_ago | float | Minutes since last data received |

## Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| eps | float | Events per second from the forwarder |

## Notes

- Cells auto-arrange into a responsive grid that fits the container
- Critical cells (above threshold) pulse with a glow effect
- Liquid fill level maps staleness: 0 mins = 15% fill, critical threshold = 95% fill
- Long hostnames are truncated with ellipsis to fit cells
- Click a cell to drilldown on the forwarder hostname

## Search

```spl
index=_internal sourcetype=splunkd group=tcpin_connections
| stats max(_time) as last_seen, avg(tcp_KBps) as avg_kbps, avg(tcp_eps) as eps by hostname
| eval mins_ago=round((now()-last_seen)/60,1)
| eval eps=round(eps,1)
| rename hostname as host
| table host mins_ago eps
| appendpipe [| stats count | where count=0 | eval _status="Awaiting forwarder data", host="", mins_ago=0, eps=0]
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| colorTheme | Visual theme (default/dark/neon) | default |
| showGlow | Enable glow on stale cells | true |
| warningThreshold | Minutes before yellow | 5 |
| criticalThreshold | Minutes before red | 15 |
| showEps | Show EPS in cells | true |
| animSpeed | Animation speed (slow/medium/fast) | medium |
| cellSize | Cell size (auto/small/medium/large) | auto |
| sortBy | Sort order (status/name/eps) | status |

## Time Range

`-5m` to `now` (historical). Do NOT use real-time (`rt-5m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh forwarder_heatmap
```

The tarball is output to `dist/forwarder_heatmap-1.0.0.tar.gz`.
