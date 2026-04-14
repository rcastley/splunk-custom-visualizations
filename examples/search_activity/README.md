# Search Activity — Splunk Custom Visualization

Horizontal stacked glass tank showing search slot utilization. Liquid fills from left to right, segmented by search type (scheduled, ad-hoc, other). Empty space represents remaining capacity.

## Install

1. Copy or symlink the `search_activity/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Search Activity" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| type | string | Search type: "scheduled", "ad-hoc", "other" |
| count | integer | Number of active searches of this type |

## Notes

- The visualization expects multiple rows, one per search type.
- Total active searches are computed as the sum of all `count` values.
- The `maxConcurrent` setting defines the total capacity (denominator).
- If no data is returned, the SPL appendpipe fallback renders "Awaiting search data".

## Search

```spl
| rest /services/server/status/resource-usage/splunk-processes
| search search_props.sid=*
| eval type=case(search_props.mode=="historical","scheduled", search_props.mode=="historical_fast","scheduled", search_props.provenance=="UI:Search","ad-hoc", 1=1,"other")
| stats count by type
| appendpipe [| stats count | where count=0 | eval _status="Awaiting search data", type="", count=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| colorTheme | Visual theme (default/dark/neon) | default |
| showGlow | Enable glow effects when utilization is high | true |
| animSpeed | Animation speed (slow/medium/fast) | medium |
| maxConcurrent | Maximum concurrent search slots | 50 |
| warningThreshold | Yellow threshold (% of max) | 60 |
| criticalThreshold | Red threshold (% of max) | 80 |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh search_activity
```

The tarball is output to `dist/search_activity-1.0.0.tar.gz`.
