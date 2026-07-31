# Index Health

A native Dashboard Studio visualization for Splunk 10.4+ that ranks indexes by health and summarizes capacity, freshness, and event rate. Critical and warning indexes are shown first.

## Search data

The primary data source expects one row per index. It supports native Studio columnar results and row-oriented compatible fixtures.

| Field | Required | Default | Meaning |
| --- | --- | --- | --- |
| Index | Yes | `index` | Index name |
| Current size | Yes | `current_size_mb` | Current index storage in MB |
| Maximum size | Yes | `max_size_mb` | Capacity in MB; must be above zero |
| Latest event age | Yes | `latest_event_age_seconds` | Seconds since the latest indexed event |
| Event rate | No | `event_rate` | Events per minute |

Example search:

```spl
| rest /services/data/indexes count=0
| rename title AS index currentDBSizeMB AS current_size_mb maxTotalDataSizeMB AS max_size_mb
| eval latest_event_age_seconds=coalesce(now()-lastTime, 0), event_rate=0
| table index current_size_mb max_size_mb event_rate latest_event_age_seconds
```

Replace `event_rate` and `latest_event_age_seconds` with values from your monitoring searches when freshness and throughput are required. Field names are configurable in the editor.

An index is critical when capacity reaches the critical threshold or the latest event is at least twice the stale interval. It is warning when capacity reaches the warning threshold or the latest event reaches the stale interval.

## Develop and test

```bash
npm install
npm run typecheck
npm run build:prod
npm run package
```

From the repository root, serve the files over HTTP and open `studio-test-harness.html`. The harness entry loads the production bundle and supplies the fixture in `visualizations/index_health/harness.json`.
