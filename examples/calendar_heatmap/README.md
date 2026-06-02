# Calendar Heatmap — Splunk Custom Visualization

GitHub-style daily activity heatmap. The viz lays out the most recent 53 weeks as a 53-column × 7-row grid (weeks across, weekdays down). Each cell is a rounded square coloured by daily count using a 5-step scale that interpolates between a configurable low and high colour.

## Install

1. Copy or symlink the `calendar_heatmap/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Calendar Heatmap" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| _time | epoch | Day bucket (use `bin _time span=1d`) |
| count | number | Activity count for that day |

## Notes

- Each cell represents one calendar day. The rightmost column is the most recent week in the data; cells representing future days in that week are left empty.
- Multiple rows with the same `_time` day bucket are summed.
- Cells are bucketed into five steps based on a fraction of the maximum count: `0`, `0–25%`, `25–50%`, `50–75%`, `75–100%`. Empty days render in `lowColor`; the most active days render in `highColor`.
- Weekday labels on the left (Mon, Wed, Fri) follow the GitHub convention.
- Month labels at the top mark the first column of each new month.

## Search

```spl
index=_internal earliest=-1y@d
| bin _time span=1d
| stats count by _time
| appendpipe [| stats count | where count=0 | eval _status="Awaiting activity data", _time=0, count=0]
```

The trailing `appendpipe` ensures the viz can render its "Awaiting activity data" status message when the search yields zero results.

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| lowColor | Colour for empty / low-activity cells | `#ebedf0` |
| highColor | Colour for highest-activity cells | `#216e39` |
| cellSize | Side length of each cell in pixels | `12` |
| cellGap | Gap between cells in pixels | `2` |
| showMonthLabels | Display month labels above the columns | `yes` |

The viz auto-shrinks `cellSize` if the configured value would overflow the panel; it never grows past the configured value.

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh calendar_heatmap
```

The tarball is output to `dist/calendar_heatmap-1.0.0.tar.gz`.
