# License Gauge — Splunk Custom Visualization

Glass-skeuomorphic arc gauge showing daily Splunk license consumption as a percentage of quota. Features animated particles, threshold indicators, and progressive glow effects matching the indexing pipeline flow visual style.

## Install

1. Copy or symlink the `license_gauge/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "License Gauge" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| used_gb | float | GB consumed today (configurable field name) |
| quota_gb | float | Total license quota in GB (configurable field name) |

## Notes

- The viz calculates percentage internally: `(used_gb / quota_gb) * 100`
- Field names are configurable via `usedField` and `quotaField` settings
- Display unit is configurable (defaults to GB)
- If quota is zero, the gauge displays 0%

## Search

```spl
| rest /services/licenser/pools
| eval used_gb=round(used_bytes/1024/1024/1024,2)
| eval quota_gb=round(effective_quota/1024/1024/1024,2)
| stats sum(used_gb) as used_gb, max(quota_gb) as quota_gb
| appendpipe [| stats count | where count=0 | eval _status="Awaiting license data", used_gb=0, quota_gb=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| colorTheme | Visual theme: default, dark, neon | default |
| showGlow | Enable glow effects on high usage | true |
| warningThreshold | Warning percentage threshold | 80 |
| criticalThreshold | Critical percentage threshold | 90 |
| animSpeed | Particle animation speed | medium |
| showLabel | Show "LICENSE USAGE" title | true |
| usedField | Field name for used value | used_gb |
| quotaField | Field name for quota value | quota_gb |
| unit | Display unit label | GB |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh license_gauge
```

The tarball is output to `dist/license_gauge-1.0.0.tar.gz`.
