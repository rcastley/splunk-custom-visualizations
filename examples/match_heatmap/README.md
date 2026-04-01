# Match Heatmap Grid — Splunk Custom Visualization

Grid visualization showing World Cup matches with cells colored by betting volume intensity. Rows represent matches, columns represent time periods (e.g., 15-minute intervals), and each cell is colored by a three-stop gradient from cool blue to hot red. Designed for NOC wall displays with a dark background.

## Install

1. Copy or symlink the `match_heatmap/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Match Heatmap Grid" visualization appears in the viz picker.

## Required Columns

| Column    | Type   | Description                                   |
|-----------|--------|-----------------------------------------------|
| match     | string | Match identifier e.g., "ENG vs FRA"           |
| time_slot | string | Time period label e.g., "0-15", "15-30"       |
| volume    | number | Betting volume for that match/time combination |

## Optional Columns

| Column | Type   | Description                                |
|--------|--------|--------------------------------------------|
| peak   | string | Whether this is a peak cell ("true"/"false") |

## Notes

- Each row in the search results represents one time bucket for one match.
- The visualization auto-scales cells to fill available space based on the number of matches and time slots.
- Volume values are normalized across all cells — the lowest volume maps to `colorLow` and the highest to `colorHigh`.
- The cell with the highest volume gets a glow highlight effect.

## Search

```spl
| makeresults count=24
| streamstats count as idx
| eval match=case(idx<=6,"ENG vs FRA",idx<=12,"BRA vs GER",idx<=18,"ARG vs NED",idx<=24,"ESP vs POR")
| eval slot_idx=((idx-1) % 6)
| eval time_slot=case(slot_idx==0,"0-15",slot_idx==1,"15-30",slot_idx==2,"30-45",slot_idx==3,"45-60",slot_idx==4,"60-75",slot_idx==5,"75-90")
| eval volume=round(random() % 15000)
| table match, time_slot, volume
| appendpipe [| stats count | where count=0 | eval _status="Awaiting betting data", match="", time_slot="", volume=0]
```

## Configuration

| Setting    | Description                         | Default   |
|------------|-------------------------------------|-----------|
| colorLow   | Color for low betting volume cells  | #0a1628   |
| colorMid   | Color for medium volume cells       | #1a6baa   |
| colorHigh  | Color for high volume cells         | #ff3333   |
| showValues | Overlay volume numbers on cells     | false     |
| cellRadius | Corner radius for cell rectangles   | 4         |
| cellGap    | Gap between cells in pixels         | 3         |
| labelWidth | Width of left label column in pixels | 120      |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh match_heatmap
```

The tarball is output to `dist/match_heatmap-1.0.0.tar.gz`.
