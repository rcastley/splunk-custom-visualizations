# Line Trend Chart — Splunk Custom Visualization

Line/area trend chart with colored background sections, multiple series, smooth or straight lines, interactive hover crosshair with tooltip, and clickable legend. Ideal for visualizing trends with highlighted zones (e.g., peak hours, maintenance windows, incidents).

## Install

1. Copy or symlink the `line_trend_chart/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Line Trend Chart" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
|--------|------|-------------|
| x-axis field | string/time | X-axis values (configurable, default: `_time`) |
| value columns | numeric | One or more numeric columns, each becomes a line series |

## Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| zone field | string | Background highlight zone name (empty = no zone for that point) |

## Notes

- If `seriesFields` is empty, all numeric columns (except x-axis and zone) are auto-detected as series.
- Consecutive rows with the same zone value create a single highlighted background band.
- Zone labels appear above the plot area.
- Click legend items to toggle series visibility.

## Search

```spl
| makeresults count=19
| streamstats count as idx
| eval hour=case( \
    idx=1,"00:00", idx=2,"01:15", idx=3,"02:30", idx=4,"03:45", \
    idx=5,"05:00", idx=6,"06:15", idx=7,"07:30", idx=8,"08:45", \
    idx=9,"10:00", idx=10,"11:15", idx=11,"12:30", idx=12,"13:45", \
    idx=13,"15:00", idx=14,"16:15", idx=15,"17:30", idx=16,"18:45", \
    idx=17,"20:00", idx=18,"21:15", idx=19,"23:45")
| eval consumption=case( \
    idx=1,260, idx=2,240, idx=3,220, idx=4,230, \
    idx=5,240, idx=6,250, idx=7,280, idx=8,460, \
    idx=9,500, idx=10,380, idx=11,390, idx=12,370, \
    idx=13,380, idx=14,400, idx=15,410, idx=16,600, \
    idx=17,610, idx=18,780, idx=19,400)
| eval generation=case( \
    idx=1,0, idx=2,0, idx=3,0, idx=4,0, \
    idx=5,0, idx=6,0, idx=7,50, idx=8,350, \
    idx=9,400, idx=10,380, idx=11,360, idx=12,350, \
    idx=13,340, idx=14,380, idx=15,450, idx=16,750, \
    idx=17,800, idx=18,680, idx=19,0)
| eval zone=case( \
    idx>=7 AND idx<=9, "Morning Peak", \
    idx>=16 AND idx<=18, "Evening Peak", \
    1=1, "")
| table hour consumption generation zone
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| title | Chart title | (empty) |
| xField | Column for X axis | _time |
| seriesFields | Comma-separated series column names (empty = auto) | (empty) |
| zoneField | Column for background zones (empty = none) | (empty) |
| lineStyle | smooth or straight | smooth |
| showArea | Semi-transparent fill under lines | false |
| showPoints | Show data point circles | true |
| showTooltip | Hover crosshair and tooltip | true |
| showLegend | Show legend | true |
| legendPosition | top, bottom, left, right | top |
| yUnit | Y-axis unit label | (empty) |
| maxY | Max Y value (0 = auto) | 0 |
| colorTheme | warm, cool, green | warm |
| colorOverrides | Per-series colors, e.g. `series1:#FF0000` | (empty) |
| zoneColor | Default zone background color | rgba(255,180,180,0.3) |
| zoneColorOverrides | Per-zone colors, e.g. `Morning Peak:rgba(255,180,180,0.3)` | (empty) |

## Time Range

`-60m` to `now` (or `rt-1m` to `rt` for real-time)

## Build

From the repo root:

```bash
./build.sh line_trend_chart
```

The tarball is output to `dist/line_trend_chart-1.0.0.tar.gz`.
