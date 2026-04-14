# Index Universe — Splunk Custom Visualization

Orbital bubble chart that provides a visual inventory of all Splunk indexes. Each bubble represents an index — size is proportional to disk usage, color reflects event count intensity (log scale), and orbital distance from center represents retention age. Hover for details, click to drill down.

## Install

1. Copy or symlink the `index_universe/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Index Universe" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| title | string | Index name |
| totalEventCount | integer | Total number of events in the index |
| currentDBSizeMB | float | Current disk usage in MB |
| retention_days | integer | Retention period in days |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| maxTotalDataSizeMB | float | Maximum allocated capacity in MB (shown in tooltip) |

## Notes

- Bubble **size** uses a square-root scale so area is proportional to disk usage
- Bubble **color** uses a log scale for event counts (which typically vary by orders of magnitude)
- Indexes are grouped into orbital tiers: 30d, 90d, 180d, 1y, 3y, 10y+
- Only populated tiers are rendered — empty tiers are skipped
- Collision detection prevents overlapping bubbles
- Indexes with `disabled=1` or `totalEventCount=0` are excluded in the example search

## Search

```spl
| rest /services/data/indexes
| where disabled=0 AND totalEventCount>0
| table title totalEventCount currentDBSizeMB maxTotalDataSizeMB frozenTimePeriodInSecs
| eval retention_days=round(frozenTimePeriodInSecs/86400,0)
| appendpipe [| stats count | where count=0
    | eval _status="Awaiting index data", title="none", totalEventCount=0,
           currentDBSizeMB=0, maxTotalDataSizeMB=0, retention_days=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| showLabels | Display index names on/near each bubble | true |
| colorScheme | Color gradient for event count (cool/warm/neon) | cool |
| minBubbleSize | Minimum bubble radius in pixels | 8 |
| maxBubbleSize | Maximum bubble radius in pixels | 50 |
| showOrbits | Display concentric retention tier orbit rings | true |
| showLegend | Display color and size legends at bottom | true |
| showGlow | Glow effect on bubbles proportional to event count | true |

## Drilldown

Click a bubble to drill down to that index. In Dashboard Studio, configure drilldown:

1. Select the panel, open **Drilldown** settings
2. Click **+ Add Drilldown** → set action to **Link to search**
3. Use `$row.title.value$` as the drilldown token

Example drilldown search:

```spl
index="$row.title.value$" | head 100
```

## Time Range

`-1m` to `now` (historical). The `| rest` command returns a point-in-time snapshot, so the time range only affects scheduling frequency.

## Build

From the repo root:

```bash
./build.sh index_universe
```

The tarball is output to `dist/index_universe-1.0.0.tar.gz`.
