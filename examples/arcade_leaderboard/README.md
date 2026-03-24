# Arcade Leaderboard — Splunk Custom Visualization

An 80s arcade-style high score leaderboard with cyberpunk neon colors, CRT scanline effects, neon glow, and the retro "Press Start 2P" pixel font. Top 3 entries get gold/silver/bronze highlights with enhanced glow. Scores display with classic arcade leading-zero formatting.

## Install

1. Copy or symlink the `arcade_leaderboard/` directory into `$SPLUNK_HOME/etc/apps/`
2. Restart Splunk: `splunk restart`
3. The "Arcade Leaderboard" visualization appears in the viz picker.

## Required Columns

| Column | Type | Description |
|--------|------|-------------|
| rank | integer | Position on the leaderboard (1 = first place) |
| player_name | string | Player's display name |
| score | number | Player's score value |

## Notes

- Column names are configurable via the formatter Fields tab — defaults are `rank`, `player_name`, `score`
- Scores are shown with leading zeros (configurable: 6, 8, or 10 digits)
- Top 3 ranks get gold/silver/bronze coloring with enhanced neon glow
- Ranks 4+ cycle through cyberpunk neon colors (green, cyan, purple, magenta, pink, yellow)
- Background is transparent by default — works on dark dashboards or custom backgrounds
- Uses the "Press Start 2P" Google Font embedded via base64 in the CSS

## Search

```spl
|sim flow query="data('arcade.logger.score', rollup='max').max(over='1d').top(count=10).publish()"
|stats latest(_value) as score by player_name
|sort - score
|streamstats count as rank
|appendpipe [| stats count | where count=0 | eval _status="INSERT COIN", rank=0, player_name="---", score=0]
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| Title | Header text (rendered in arcade pixel font) | HIGH SCORES |
| Max Rows | Maximum leaderboard entries to display | 10 |
| Score Digits | Leading-zero digit count (0 = no padding) | 8 |
| Title Color | Neon color for the title text | #00fff5 (cyan) |
| Scanlines | CRT scanline overlay effect | On |
| Neon Glow | Glow effect on text (enhanced for top 3) | On |
| Rank Field | Column name for rank | rank |
| Name Field | Column name for player name | player_name |
| Score Field | Column name for score | score |

## Time Range

`rt-1m` to `rt` (or `-60m` to `now` for historical)

## Build

From the repo root:

```bash
./build.sh arcade_leaderboard
```

The tarball is output to `dist/arcade_leaderboard-1.0.0.tar.gz`.
