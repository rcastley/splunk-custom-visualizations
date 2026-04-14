# Radar Chart — Splunk Custom Visualization

A radar (spider) chart that overlays multiple data series as semi-transparent filled polygons on a shared radial grid. Inspired by the ECharts AQI radar example. Supports any number of axes and series, with configurable colors, grid rings, and legend.

## Install

1. Copy or symlink the `radar_chart/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Radar Chart" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| series | string | Name of the data series (e.g., "Beijing") |

All remaining columns are treated as numeric axes. Column headers become axis labels.

## Notes

- Each unique value in the `series` column becomes a separate polygon
- Axis max values are auto-detected from the data (or set manually via config)
- Multiple rows with the same series name are averaged
- Columns after `series` are plotted as axes in order

## Search

```spl
| makeresults count=1
| eval series="Beijing",  AQI=260, SO2=120, NO2=180, CO=280, PM10=210, PM2_5=300
| append [| makeresults count=1 | eval series="Shanghai", AQI=160, SO2=80,  NO2=120, CO=150, PM10=130, PM2_5=180]
| append [| makeresults count=1 | eval series="Guangzhou", AQI=90,  SO2=50,  NO2=70,  CO=100, PM10=80,  PM2_5=110]
| table series AQI SO2 NO2 CO PM10 PM2_5
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| title | Chart title text | (empty) |
| maxValue | Max axis value (0 = auto) | 0 |
| gridRings | Number of concentric grid rings | 4 |
| showLegend | Show legend at the bottom | true |
| colorTheme | Color palette: warm, cool, green | warm |

## Time Range

`-60m` to `now` (or any range that produces the expected columns)

## Build

From the repo root:

```bash
./build.sh radar_chart
```

The tarball is output to `dist/radar_chart-1.0.0.tar.gz`.
