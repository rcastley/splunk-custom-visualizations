# Resource Gauge — Splunk Custom Visualization

Three concentric arc gauges displaying CPU, Memory, and Disk I/O utilization in a single panel. Each arc fills with liquid-style color based on usage percentage, with animated particles, progressive glow effects, and configurable thresholds. Uses a glass-skeuomorphic design language.

## Install

1. Copy or symlink the `resource_gauge/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Resource Gauge" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| cpu_pct | float | CPU utilization percentage (0-100) |
| mem_pct | float | Memory utilization percentage (0-100) |
| disk_pct | float | Disk I/O utilization percentage (0-100) |

## Notes

- All percentage values are clamped to 0-100 range
- Field names are configurable via formatter settings (cpuField, memField, diskField)
- Color transitions: green (normal) -> yellow (warning) -> red (critical)
- The `appendpipe` fallback in the SPL produces a status message when no data is available

## Search

```spl
index=_introspection sourcetype=splunk_resource_usage component=hostwide
| stats latest(data.cpu_user_pct) as cpu_user, latest(data.cpu_system_pct) as cpu_sys,
    latest(data.mem_used) as mem_used, latest(data.mem) as mem_total,
    latest(data.swap_used) as swap_used, latest(data.swap) as swap_total by host
| eval cpu_pct=round(cpu_user+cpu_sys, 1)
| eval mem_pct=if(mem_total>0, round((mem_used/mem_total)*100, 1), 0)
| eval disk_pct=if(swap_total>0, round((swap_used/swap_total)*100, 1), 0)
| head 1
| table cpu_pct mem_pct disk_pct
| appendpipe [| stats count | where count=0 | eval _status="Awaiting resource data", cpu_pct=0, mem_pct=0, disk_pct=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| colorTheme | Visual theme (default/dark/neon) | default |
| showGlow | Enable glow effects on high-usage arcs | true |
| warningThreshold | Percentage at which arc turns yellow | 70 |
| criticalThreshold | Percentage at which arc turns red | 85 |
| animSpeed | Particle animation speed (slow/medium/fast) | medium |
| showLabels | Show metric labels in center area | true |
| cpuField | Field name for CPU utilization | cpu_pct |
| memField | Field name for Memory utilization | mem_pct |
| diskField | Field name for Disk I/O utilization | disk_pct |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh resource_gauge
```

The tarball is output to `dist/resource_gauge-1.0.0.tar.gz`.
