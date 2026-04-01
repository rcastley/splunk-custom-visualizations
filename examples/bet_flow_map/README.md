# Geographic Bet Flow Map — Splunk Custom Visualization

A geographic visualization showing animated particle flows from bet origin countries to the match venue. Each origin is shown as a glowing dot sized by betting volume, connected to the destination venue by curved arcs with flowing particles. A simplified world map outline provides geographic context.

## Install

1. Copy or symlink the `bet_flow_map/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Geographic Bet Flow Map" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
|--------|------|-------------|
| country | string | Country name (e.g., "United Kingdom") |
| lat | number | Latitude of the betting origin |
| lon | number | Longitude of the betting origin |
| volume | number | Betting volume from this country |

## Optional Columns

| Column | Type | Description |
|--------|------|-------------|
| venue_lat | number | Match venue latitude (default 0 if not present) |
| venue_lon | number | Match venue longitude (default 0 if not present) |

## Notes

- Each row represents bets from one country to the match venue
- All rows should share the same venue_lat/venue_lon values (read from the first row)
- Volume values are used for relative sizing — higher volume = larger dots and brighter arcs
- The map uses an equirectangular projection (simple lon/lat to x/y mapping)

## Search

```spl
| makeresults count=10
| streamstats count as idx
| eval data=case(
    idx=1, "United Kingdom,51.5,-0.1,45000",
    idx=2, "France,48.9,2.3,38000",
    idx=3, "Germany,52.5,13.4,22000",
    idx=4, "Brazil,-15.8,-47.9,31000",
    idx=5, "United States,38.9,-77.0,28000",
    idx=6, "Australia,-33.9,151.2,12000",
    idx=7, "Japan,35.7,139.7,9500",
    idx=8, "India,28.6,77.2,18000",
    idx=9, "Nigeria,9.1,7.5,8200",
    idx=10, "Argentina,-34.6,-58.4,15000")
| eval parts=split(data, ",")
| eval country=mvindex(parts, 0), lat=mvindex(parts, 1), lon=mvindex(parts, 2), volume=mvindex(parts, 3)
| eval venue_lat=25.3, venue_lon=51.5
| fields country, lat, lon, volume, venue_lat, venue_lon
| appendpipe [| stats count | where count=0 | eval _status="Awaiting betting data", country="", lat=0, lon=0, volume=0, venue_lat=0, venue_lon=0]
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| arcColor | Color of flow arcs from origin to venue | #0088ff |
| venueColor | Color of the destination venue marker | #ff6600 |
| showLabels | Display country name labels at origin points | true |
| showMap | Display world map outline background | true |
| mapColor | Color of the world map outline strokes | #1a2a3a |
| animSpeed | Speed of particle flow animation (slow/medium/fast) | medium |
| particleDensity | Number of particles per flow arc (low/medium/high) | medium |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk Cloud vetting rejects real-time saved searches (`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh bet_flow_map
```

The tarball is output to `dist/bet_flow_map-1.0.0.tar.gz`.
