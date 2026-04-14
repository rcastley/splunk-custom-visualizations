# Index Storage — Splunk Custom Visualization

Glass-skeuomorphic tank grid showing Splunk index sizes with layered hot/warm/cold data temperature fills. Each cell represents one index — fill height is relative to the largest index, and liquid layers show where data sits in the lifecycle.

## Install

1. Copy or symlink the `index_storage/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Index Storage" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| title | string | Index name |
| sizeGB | float | Total index size in GB |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| hotGB | float | Hot bucket size in GB |
| warmGB | float | Warm bucket size in GB |
| coldGB | float | Cold bucket size in GB |

## Notes

- If `hotGB`, `warmGB`, `coldGB` are not available (older Splunk versions), the viz falls back to a single-color fill based on total `sizeGB`.
- Fill height is relative to the largest index in the result set.
- Cells with more than 50% of total storage across all indexes get a glow effect.

## Search

```spl
| rest /services/data/indexes
| where totalEventCount>0
| eval sizeGB=round(currentDBSizeMB/1024,2)
| stats sum(sizeGB) as sizeGB, sum(hotBucketCount) as hotBuckets,
    sum(warmBucketCount) as warmBuckets, sum(coldBucketCount) as coldBuckets by title
| eval totalBuckets=hotBuckets+warmBuckets+coldBuckets
| eval hotGB=if(totalBuckets>0, round(sizeGB*(hotBuckets/totalBuckets),2), 0)
| eval warmGB=if(totalBuckets>0, round(sizeGB*(warmBuckets/totalBuckets),2), 0)
| eval coldGB=if(totalBuckets>0, round(sizeGB*(coldBuckets/totalBuckets),2), 0)
| table title sizeGB hotGB warmGB coldGB
| sort -sizeGB
| appendpipe [| stats count | where count=0 | eval _status="Awaiting index data", title="", sizeGB=0, hotGB=0, warmGB=0, coldGB=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| colorTheme | Visual theme (default/dark/neon) | default |
| showGlow | Enable glow effects on large indexes | true |
| animSpeed | Animation speed (slow/medium/fast) | medium |
| cellSize | Cell sizing (auto/small/medium/large) | auto |
| sortBy | Sort order (size/name) | size |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh index_storage
```

The tarball is output to `dist/index_storage-1.0.0.tar.gz`.
