# Live Ticker — Splunk Custom Visualization

A broadcast-style horizontal scrolling ticker that displays the most recent events with customizable field labels, a pulsing LIVE badge, and a time-ago indicator. Designed as a thin strip panel for NOC dashboards and conference booth displays.

## Install

1. Copy or symlink the `live_ticker/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Live Ticker" visualization appears in the viz picker.

## Required Columns

| Column | Type   | Description                          |
| ------ | ------ | ------------------------------------ |
| _time  | time   | Event timestamp for time-ago display |

## Optional Columns

Up to 4 configurable fields. Column names are set in the formatter.

| Column  | Type   | Description          |
| ------- | ------ | -------------------- |
| field 1 | string | First display field  |
| field 2 | string | Second display field |
| field 3 | string | Third display field  |
| field 4 | string | Fourth display field |

## Notes

- Rows are displayed most-recent-first with a horizontal scroll
- Up to 20 rows are consumed; the ticker loops seamlessly
- The time-ago display shows the elapsed time since the most recent row's `_time`
- Edge fade gradients mask entries entering/leaving the visible area
- The LIVE badge pulses with a smooth sine-wave alpha animation

## Search

```spl
index=main earliest=-4d
| table _time size lanyard host location
| sort -_time
| head 20
| appendpipe [| stats count | where count=0
  | eval _status="Awaiting giveaway data", size="", lanyard="", host="", location=""]
```

## Configuration

| Setting        | Description                                | Default   |
| -------------- | ------------------------------------------ | --------- |
| Title          | Event/brand name on the left               | .conf25   |
| Scroll Speed   | Ticker speed (slow/medium/fast)            | medium    |
| Field 1        | Column name for first value                | size      |
| Label 1        | Prepend text for field 1                   | Size      |
| Field 2        | Column name for second value               | lanyard   |
| Label 2        | Prepend text for field 2                   | Lanyard   |
| Field 3        | Column name for third value                | region    |
| Label 3        | Prepend text for field 3                   | Region    |
| Field 4        | Column name for fourth value               | device    |
| Label 4        | Prepend text for field 4                   | Device    |
| Background     | Ticker strip background color              | #1a1a2e   |
| Text Color     | Scrolling text color                       | #ffffff   |
| Accent Color   | LIVE badge, title, and separator dot color | #e20082   |
| Separator Color| Vertical line between title and ticker     | #444466   |

## Time Range

`rt-60m` to `rt` for live monitoring, or any historical range.

## Build

From the repo root:

```bash
./build.sh live_ticker
```

The tarball is output to `dist/live_ticker-1.0.0.tar.gz`.
