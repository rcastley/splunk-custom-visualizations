# Steampunk Gauge — Splunk Custom Visualization

A Victorian-era industrial gauge rendered on a Canvas 2D. The brass body
surrounds an aged ivory dial face, with a 270° tick scale, up to three
configurable colour zones, and a classic counter-weighted needle on a
brass hub.

The display takes two columns from the search:

- `value` — the numeric reading shown on the gauge and printed below the
  hub
- `label` — text rendered on the dial below the centre (for example
  `PRESSURE`, `RPM`, or `TEMPERATURE`)

## Install

1. Copy or symlink the `steampunk_gauge/` directory into
   `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Steampunk Gauge" visualization appears in the viz picker.

## Required Columns

| Column | Type   | Description                                              |
| ------ | ------ | -------------------------------------------------------- |
| value  | number | The reading shown by the needle and the digital readout. |
| label  | string | Text rendered on the dial face below the centre hub.     |

Both column names are configurable via the **Value Field** and **Label
Field** formatter settings, so the viz can be pointed at any existing
columns in a shared base search without renaming.

## Notes

- The needle smoothly tweens between samples (see the **Smoothness**
  setting). Set smoothness to `0` to disable tweening and snap the needle
  instantly.
- Turn **Show Readout** off for an authentic analogue look — the
  digital value disappears and only the unit (e.g. `PSI`) is printed on
  the dial face above the label, like a vintage pressure gauge.
- The wear stains on the dial are deterministic, not random — the same
  dial looks identical across renders.
- Out-of-range values are clamped to the configured min/max for needle
  position but the raw value is still printed in the centre.

## Zones

Up to three independent zones colour the matching arc segment, tick
marks, tick numbers and centre readout while the value sits inside the
zone's range. Each zone has an independent `min`, `max` and `colour`.

- Zones use **value units**, not percentages — for a 0–4000 RPM gauge a
  redline at 3400 is just `min=3400 max=4000`.
- Empty `min` or `max` disables that zone, so a gauge can use 0, 1, 2 or
  3 zones freely.
- If zones overlap, **zone 1 wins over zone 2 wins over zone 3**.
- Values that fall outside every enabled zone use the default dark dial
  ink — there is no "background" zone colour.

For example, a gauge that expects the value `12` and treats anything
too low or too high as bad would be configured as:

| Zone   | Min | Max | Colour |
| ------ | --- | --- | ------ |
| Zone 1 | 0   | 8   | red    |
| Zone 2 | 11  | 13  | green  |
| Zone 3 | 15  | 20  | red    |

The gap from 8–11 and 13–15 is left in the default dial colour.

## Search

```spl
| makeresults
| eval value=round(random() % 100), label="PRESSURE"
```

For a real telemetry stream, replace the `eval` with the metric you
want to surface, e.g.:

```spl
index=metrics sourcetype=boiler
| stats latest(pressure_psi) as value
| eval label="PRESSURE"
```

## Configuration

| Setting       | Description                                                       | Default   |
| ------------- | ----------------------------------------------------------------- | --------- |
| Value Field   | Column name containing the numeric value.                         | `value`   |
| Label Field   | Column name containing the dial label.                            | `label`   |
| Min Value     | Lower bound of the gauge scale.                                   | `0`       |
| Max Value     | Upper bound of the gauge scale.                                   | `100`     |
| Unit          | Suffix on the value readout, or stand-alone dial inscription.     | _(empty)_ |
| Decimals      | Decimal places shown on the value readout.                        | `0`       |
| Zone 1 Min    | Lower bound of zone 1 in value units (empty = disabled).          | _(empty)_ |
| Zone 1 Max    | Upper bound of zone 1 in value units (empty = disabled).          | _(empty)_ |
| Zone 1 Colour | Colour applied to the arc, tick marks and readout inside zone 1.  | `#a52319` |
| Zone 2 Min    | Lower bound of zone 2 in value units (empty = disabled).          | _(empty)_ |
| Zone 2 Max    | Upper bound of zone 2 in value units (empty = disabled).          | _(empty)_ |
| Zone 2 Colour | Colour applied to the arc, tick marks and readout inside zone 2.  | `#2e7d32` |
| Zone 3 Min    | Lower bound of zone 3 in value units (empty = disabled).          | _(empty)_ |
| Zone 3 Max    | Upper bound of zone 3 in value units (empty = disabled).          | _(empty)_ |
| Zone 3 Colour | Colour applied to the arc, tick marks and readout inside zone 3.  | `#a52319` |
| Show Readout  | Digital value+unit readout below the centre. Off = unit only.     | `true`    |
| Show Rivets   | Decorative brass screw heads around the bezel.                    | `true`    |
| Show Wear     | Aged stains and patina on the ivory dial face.                    | `true`    |
| Smoothness    | Needle follow speed per second (`0` disables tweening).           | `8`       |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) —
Splunk Cloud vetting rejects real-time saved searches
(`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh steampunk_gauge
```

The tarball is output to `dist/steampunk_gauge-1.0.0.tar.gz`.
