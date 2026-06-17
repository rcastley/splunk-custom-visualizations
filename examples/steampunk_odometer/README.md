# Steampunk Odometer — Splunk Custom Visualization

A Victorian-era mechanical counter rendered on a Canvas 2D. Number drums
are drawn as true cylinders: digits live on the cylinder surface and
roll away to the back over the top of each drum while new digits emerge
rolling in from below — physically modelled with sinusoidal projection,
vertical foreshortening, and depth-based dimming. Brass end-caps with a
central axle pin sit on each side of every drum, and the drum surface
carries a worn texture (smudges and circumferential grime rings) that
scrolls together with the digits so the rolling motion reads at a
glance. An engraved label sits below the drums.

Designed as a companion to the `steampunk_gauge` viz — same brass body,
same wear / rivet aesthetic, same `value` + `label` data contract — so
the two render naturally side-by-side on the same dashboard.

The display takes two columns from the search:

- `value` — the numeric reading shown on the drums. Negative values
  are clamped to `0` (odometers count up).
- `label` — text engraved on the brass below the drums (for example
  `DISTANCE`, `EVENTS`, or `TRIP`).

## Install

1. Copy or symlink the `steampunk_odometer/` directory into
   `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Steampunk Odometer" visualization appears in the viz picker.

## Required Columns

| Column | Type   | Description                                              |
| ------ | ------ | -------------------------------------------------------- |
| value  | number | The reading shown on the digit drums.                    |
| label  | string | Text engraved on the brass below the drums.              |

Both column names are configurable via the **Value Field** and **Label
Field** formatter settings, so the viz can be pointed at any existing
columns in a shared base search without renaming.

## Notes

- The drums roll using a **carry cascade** — each digit only begins to
  roll when the digit immediately below it is in the last 10 % of its
  own roll, exactly the way a real car odometer behaves.
- Each drum is rendered as a cylinder with 10 digits at 36° spacing
  around its circumference. Up to **five digits are visible at once**
  on the front face: the current digit at the centre and ±1 / ±2
  neighbours curving away to the top and bottom, foreshortened by
  `cos θ` and dimmed by `cos θ^1.3`. Beyond ±90° the digit is on the
  back of the cylinder and is not drawn.
- The drum surface texture (wear smudges + circumferential grime
  rings) is anchored to angular positions on the cylinder, not to
  screen coordinates, so it scrolls vertically together with the
  digits as the drum rotates. This is the visual cue that sells the
  spinning motion.
- Each drum has narrow **brass end-caps** with a central axle pin on
  both sides. The end-caps darken at the top and bottom to suggest the
  disc's curvature falling away from the viewer.
- The needle/drum movement is tweened client-side from the previous
  sample to the new one (see the **Smoothness** setting). Set
  smoothness to `0` to disable tweening and snap to the target value
  instantly.
- The decimal point is drawn as a small brass dot between the integer
  and fractional drums when **Decimals** is greater than zero.
- Values exceeding the drum capacity (e.g. `1234567` with **Whole
  Digits** set to `6`) are clamped so the drums "max out" at `999999`
  rather than wrapping around.
- The wear stains on the brass panel are deterministic, not random —
  the same panel looks identical across renders. The wear on each
  drum's surface is also deterministic per drum index, so adjacent
  drums never look identical.

## Search

```spl
| makeresults
| eval value=round(random() % 100000), label="DISTANCE"
```

For a real telemetry stream, replace the `eval` with the metric you
want to surface, e.g.:

```spl
index=metrics sourcetype=fleet
| stats sum(distance_km) as value
| eval label="DISTANCE"
```

## Configuration

| Setting       | Description                                                                       | Default     |
| ------------- | --------------------------------------------------------------------------------- | ----------- |
| Value Field   | Column name containing the numeric value.                                         | `value`     |
| Label Field   | Column name containing the engraved label.                                        | `label`     |
| Whole Digits  | Number of integer digit drums (1–12).                                             | `6`         |
| Decimals      | Number of decimal digit drums (0–4).                                              | `0`         |
| Unit          | Optional unit text shown to the right of the drums (e.g. `km`).                   | _(empty)_   |
| Show Rivets   | Decorative brass screw heads at the corners of the panel.                         | `true`      |
| Show Wear     | Aged stains and patina on the brass panel and drum surfaces.                      | `true`      |
| Digit Spacing | Vertical spacing between digits on each drum (`0` tight … `100` loose).           | `50`        |
| Smoothness    | Drum roll speed per second (`0` disables tweening).                               | `8`         |

## Time Range

`-1m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) —
Splunk Cloud vetting rejects real-time saved searches
(`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh steampunk_odometer
```

The tarball is output to `dist/steampunk_odometer-1.0.0.tar.gz`.
