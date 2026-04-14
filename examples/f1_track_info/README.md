# F1 Track Info — Splunk Custom Visualization

Renders a track info card with miniature track silhouette colored by sector,
sector boundary markers, track name, length (km), and number of turns.

## Install

1. Copy or symlink the `f1_track_info/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "F1 Track Info" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| `track_id` | integer | Numeric track identifier |

## Optional Columns

| Column | Type | Description |
| --- | --- | --- |
| `track_length` | float | Track length in metres |
| `sector2_lap_distance_start` | float | Lap distance where sector 2 begins |
| `sector3_lap_distance_start` | float | Lap distance where sector 3 begins |

## Search

```spl
index="data_drivers_f1_2025" sourcetype="SessionData"
| stats latest(track_id) as track_id
        latest(track_length) as track_length
        latest(sector2_lap_distance_start) as sector2_lap_distance_start
        latest(sector3_lap_distance_start) as sector3_lap_distance_start
| table track_id track_length sector2_lap_distance_start sector3_lap_distance_start
```

## Time Range

`rt-1m` to `rt`

## Build

```bash
cd appserver/static/visualizations/f1_track_info
npm install
npm run build
```
