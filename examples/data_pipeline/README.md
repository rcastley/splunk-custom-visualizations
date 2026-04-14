# Data Pipeline — Splunk Custom Visualization

Animated data pipeline showing ingestion volume flowing from sources into Splunk. Each data source appears as a labeled node on the left, connected by a glowing bezier-curve stream to a central Splunk ">" chevron on the right. Stream width and particle density scale with volume, giving an immediate sense of which sources dominate ingestion. Particles flow continuously along the curves with configurable speed and color theming.

## Install

1. Copy or symlink the `data_pipeline/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Data Pipeline" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| name | string | Source / index / sourcetype label |
| volume | number | Volume value (event count or bytes) |

Column names are configurable via the Format panel (`Name Field`, `Volume Field`).

## Notes

- Rows are sorted by volume descending; the thickest pipe is always the highest-volume source.
- The `Volume Unit` setting controls label formatting: `events` formats as K/M/B, `bytes` formats as KB/MB/GB/TB.
- The visualization auto-scales pipe thickness relative to the maximum volume in the result set.
- Particle count per pipe is proportional to volume fraction.

## Search

Event count by index:

```spl
| tstats count where index=* by index
| sort -count
| head 10
| rename index as name, count as volume
| appendpipe [| stats count | where count=0 | eval _status="Awaiting ingestion data", name="none", volume=0]
```

License usage by index (bytes):

```spl
index=_internal source=*license_usage.log type=Usage
| stats sum(b) as volume by idx
| rename idx as name
| sort -volume
| head 10
| appendpipe [| stats count | where count=0 | eval _status="Awaiting ingestion data", name="none", volume=0]
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| Name Field | Column containing source names | name |
| Volume Field | Column containing volume values | volume |
| Max Sources | Maximum number of sources to display | 10 |
| Animation | Particle animation speed | medium |
| Show Volume | Display volume labels next to source names | true |
| Show Chevron | Show the Splunk ">" chevron at the endpoint | true |
| Show Total | Show aggregated total volume | true |
| Low Color | Color for lowest-volume pipes | #00B4D8 |
| High Color | Color for highest-volume pipes | #65A637 |
| Volume Unit | How to format volume labels | events |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh data_pipeline
```

The tarball is output to `dist/data_pipeline-1.0.0.tar.gz`.
