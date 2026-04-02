# F1 ERS Energy — Splunk Custom Visualization

F1 Energy Recovery System visualization showing battery level, deploy mode,
and harvest/deploy stats.

## Install

1. Copy or symlink the `f1_ers/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "F1 ERS Energy" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| -------- |------| ------------- |
| `ers_store_energy` | float | ERS stored energy in Joules (max 4,000,000) |

## Optional Columns

| Column | Type | Description |
| -------- |------| ------------- |
| `ers_deploy_mode` | integer | Deploy mode: 0=None, 1=Medium, 2=Hotlap, 3=Overtake |
| `ers_harvested_this_lap_mguk` | float | Energy harvested this lap via MGU-K (Joules) |
| `ers_harvested_this_lap_mguh` | float | Energy harvested this lap via MGU-H (Joules) |
| `ers_deployed_this_lap` | float | Energy deployed this lap (Joules) |

## Search

```spl
index="data_drivers_f1_2025" sourcetype="CarStatusData"

| stats latest(ers_store_energy) as ers_store_energy
        latest(ers_deploy_mode) as ers_deploy_mode
        latest(ers_harvested_this_lap_mguk) as ers_harvested_this_lap_mguk
        latest(ers_harvested_this_lap_mguh) as ers_harvested_this_lap_mguh
        latest(ers_deployed_this_lap) as ers_deployed_this_lap
    by host
| head 1
```

## Time Range

`rt-1m` to `rt`

## Build

```
cd appserver/static/visualizations/f1_ers
npm install
npm run build
```
