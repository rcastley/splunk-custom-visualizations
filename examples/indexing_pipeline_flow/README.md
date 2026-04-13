# Indexing Pipeline Flow — Splunk Custom Visualization

Animated visualization of Splunk's internal indexing pipeline queues. Renders four pipeline stages (parsing, merging, typing, indexing) as glass tubes with liquid fill levels, animated flow particles between stages, and color-coded threshold indicators. Instantly see when queues are backing up.

## Install

1. Copy or symlink the `indexing_pipeline_flow/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Indexing Pipeline Flow" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
|--------|------|-------------|
| name | string | Queue name (e.g., parsingqueue, mergingqueue, typingqueue, indexqueue) |
| fill_pct | float | Fill percentage (0–100) |

## Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| avg_size | float | Average current queue size in KB |
| capacity | float | Maximum queue capacity in KB |

## Notes

- The visualization expects exactly four queues in the pipeline order: parsingqueue → mergingqueue → typingqueue → indexqueue
- Queues not present in the data render as empty tubes (0% fill)
- Fill percentages are clamped to 0–100
- The `avg_size` and `capacity` columns are displayed as supplementary info below each tube label

## Search

```spl
index=_internal group=queue
    name IN (parsingqueue, mergingqueue, typingqueue, indexqueue)
| stats avg(current_size_kb) as avg_size, avg(max_size_kb) as capacity by name
| eval fill_pct=if(capacity>0, round((avg_size/capacity)*100, 1), 0)
| table name fill_pct avg_size capacity
| appendpipe [| stats count | where count=0
    | eval _status="Awaiting pipeline data", name="parsingqueue", fill_pct=0, avg_size=0, capacity=0]
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| animSpeed | Animation speed for flow particles (slow/medium/fast) | medium |
| colorTheme | Visual theme (default/dark/neon) | default |
| showLabels | Display queue names below each tube | true |
| showValues | Display fill percentage on each tube | true |
| warningThreshold | Fill % at which the tube turns yellow | 70 |
| criticalThreshold | Fill % at which the tube turns red | 85 |
| showGlow | Glowing highlight on high-fill tubes | true |

## Time Range

`-5m` to `now` (historical). Do NOT use real-time (`rt-5m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh indexing_pipeline_flow
```

The tarball is output to `dist/indexing_pipeline_flow-1.0.0.tar.gz`.
