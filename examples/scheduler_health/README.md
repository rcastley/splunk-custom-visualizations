# Scheduler Health — Splunk Custom Visualization

Three horizontal glass tubes displaying scheduler vital signs: success rate, skip rate, and average runtime. Each tube fills like a thermometer with animated liquid, wave effects, and bubble particles. Color coding indicates health status at a glance.

## Install

1. Copy or symlink the `scheduler_health/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Scheduler Health" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| skip_pct | float | Percentage of searches skipped |
| success_pct | float | Percentage of searches successful |
| avg_runtime | float | Average search runtime in seconds |
| total | integer | Total number of scheduled searches |
| skipped | integer | Number of skipped searches |

## Notes

- Success rate tube: green when high (healthy), red when low (unhealthy)
- Skip rate tube: inverted coloring — green when low, red when high (more skips = worse)
- Runtime tube: fills based on runtime vs configurable threshold — green when fast, red when slow
- Transparent background — inherits dashboard panel background

## Search

```spl
index=_internal sourcetype=scheduler status=*
| stats count as total, count(eval(status="skipped")) as skipped, count(eval(status="success")) as success, avg(run_time) as avg_runtime
| eval skip_pct=if(total>0, round((skipped/total)*100,1), 0)
| eval success_pct=if(total>0, round((success/total)*100,1), 0)
| eval avg_runtime=round(avg_runtime,2)
| table skip_pct success_pct avg_runtime total skipped
| appendpipe [| stats count | where count=0 | eval _status="Awaiting scheduler data", skip_pct=0, success_pct=0, avg_runtime=0, total=0, skipped=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| colorTheme | Visual theme (default/dark/neon) | default |
| showGlow | Enable glow effects on problematic tubes | true |
| animSpeed | Animation speed (slow/medium/fast) | medium |
| runtimeThreshold | Seconds that maps to 100% runtime fill | 30 |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh scheduler_health
```

The tarball is output to `dist/scheduler_health-1.0.0.tar.gz`.
