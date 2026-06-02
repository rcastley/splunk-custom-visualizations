# Top Markets — Splunk Custom Visualization

A ranked horizontal-bar list of countries/markets — colour flag, name, a
gradient bar, the value and its share of the total. Sorts descending and shows
the top N. A clear, comparable replacement for country pie charts. Renders in
the bundled Clash Display font.

Flags are bundled as base64 PNGs (`flags.json`, ~18KB) keyed by ISO 3166-1
alpha-2 code, plus an "International" globe. The viz resolves a country column
that may contain either an ISO code (`es`) or a common name (`Spain`).

## Install

1. Copy or symlink the `top_markets/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Top Markets" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
| --- | --- | --- |
| `country` | string | ISO alpha-2 code (`es`) or country name (`Spain`). `International` (or `global`, `other`) maps to the globe. Column name is configurable. |
| `count` | number | The per-country value. Bars scale to the largest; share % is computed from the total. Column name is configurable. |

## Notes

- The viz sorts descending and shows the top N (default 6); bar widths scale to
  the largest shown value.
- **Share % is computed by the viz** as `value ÷ total of all returned rows` —
  your SPL only needs to emit a count per country.
- Unrecognised markets render with a neutral placeholder dot instead of a flag.
- Bundled markets: ES, IT, RO, BR, DK, GB, IE, US, CA, MX, DE, FR, PT, NL, BE,
  SE, NO, FI, PL, GR, AT, CH, AU, IN, AR, CO, CL, PE, JP, ZA, NG, TR, CZ, HU,
  BG, HR, SK, SI, UA, NZ, plus International. Ask to add more.
- Flag images: [flagcdn](https://flagcdn.com) (lipis, free to use). Globe:
  [Twemoji](https://github.com/twitter/twemoji) (CC-BY 4.0).

## Search

```spl
index=prod_session action=login brand IN (paddypower, betfair)
| eval country = coalesce(country, "International")
| stats count by country
| sort - count
```

## Configuration

| Setting | Description | Default |
| --- | --- | --- |
| Country Field | Column with ISO code or country name | `country` |
| Value Field | Column with the per-country count | `count` |
| Title | Heading shown top-left | `Customer Reach · Top Markets` |
| Tag Text | Badge shown top-right | `by active users` |
| Top N | How many markets to show | `6` |
| Show Share % | Show each market's share of the total | `true` |
| Abbreviate Values | Shorten numbers (54100 → 54.1K) | `true` |
| Bar Start Colour | Left end of the bar gradient | `#0285FF` |
| Bar End Colour | Right end of the bar gradient | `#CCE5FF` |
| Text Colour | Country names and values | `#ffffff` |
| Tag Colour | Top-right badge colour | `#F8CD4B` |
| Fill Colour | Panel background | `transparent` |
| Show Border | Draw a rounded border | `true` |
| Border Colour | Border colour | `#2A3566` |
| Corner Radius | Border corner radius (px) | `16` |

## Time Range

`-60m` to `now` (historical). Do NOT use real-time (`rt-1m` to `rt`) — Splunk
Cloud vetting rejects real-time saved searches
(`check_for_real_time_saved_searches_for_cloud`).

## Build

From the repo root:

```bash
./build.sh top_markets
```

The tarball is output to `dist/top_markets-1.0.0.tar.gz`. The build prepends the
shared Clash Display `@font-face` CSS into `visualization.css` automatically.
