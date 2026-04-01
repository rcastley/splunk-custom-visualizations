# Goal Event Timeline — Splunk Custom Visualization

Horizontal timeline for a match showing betting volume as a filled area chart with event markers (goals, red cards, penalties, VAR reviews) annotated at the corresponding time positions. Designed for NOC/dark dashboard display with a dark background, gradient area fill, and glowing event markers.

## Install

1. Copy or symlink the `goal_timeline/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Goal Event Timeline" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
|--------|------|-------------|
| minute | number | Match minute (0-90+) |
| volume | number | Betting volume at this minute |

## Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| event | string | Event description e.g., "Goal - Kane", "Red Card - Silva" |
| event_type | string | "goal", "red_card", "var", "penalty" — determines marker color/icon |

## Notes

- Timeline spans 0-90 minutes by default, extending automatically for extra time
- Events without `event_type` default to goal styling
- Half-time dashed line drawn at 45 minutes
- Volume axis auto-scales with 10% headroom

## Search

```spl
| makeresults count=24
| streamstats count as idx
| eval minute=case(idx=1,0,idx=2,5,idx=3,10,idx=4,15,idx=5,20,idx=6,23,idx=7,25,idx=8,30,idx=9,35,idx=10,40,idx=11,45,idx=12,50,idx=13,55,idx=14,58,idx=15,60,idx=16,65,idx=17,67,idx=18,68,idx=19,70,idx=20,75,idx=21,80,idx=22,85,idx=23,87,idx=24,90)
| eval volume=case(idx=1,1200,idx=2,1800,idx=3,2100,idx=4,2400,idx=5,3100,idx=6,8500,idx=7,12000,idx=8,4200,idx=9,3800,idx=10,3200,idx=11,5500,idx=12,3900,idx=13,4100,idx=14,2800,idx=15,9200,idx=16,5100,idx=17,11000,idx=18,15000,idx=19,13000,idx=20,6200,idx=21,4800,idx=22,7500,idx=23,11500,idx=24,8900)
| eval event=case(idx=6,"Goal - Kane",idx=14,"Red Card - Silva",idx=17,"VAR Review - Penalty",idx=18,"Penalty - Mbappe",idx=22,"Goal - Saka",1=1,"")
| eval event_type=case(idx=6,"goal",idx=14,"red_card",idx=17,"var",idx=18,"penalty",idx=22,"goal",1=1,"")
| table minute volume event event_type
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| areaColor | Fill color for the betting volume area chart | #0088ff |
| goalColor | Marker color for goal events | #00cc66 |
| cardColor | Marker color for red card events | #ff3333 |
| varColor | Marker color for VAR review events | #3399ff |
| penaltyColor | Marker color for penalty events | #ffcc00 |
| showGrid | Show subtle grid lines for volume scale | true |
| showLabels | Show event labels above markers | true |
| smoothing | Smooth area chart curves using bezier interpolation | true |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh goal_timeline
```

The tarball is output to `dist/goal_timeline-1.0.0.tar.gz`.
