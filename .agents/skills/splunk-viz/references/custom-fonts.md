# Custom Font Embedding in Splunk Visualizations

Splunk custom vizs cannot reliably load custom fonts via the JavaScript FontFace API, external CSS `@font-face` URL references, or relative `url()` paths to font files. Only base64-encoding the font directly into the CSS works reliably — Splunk loads `visualization.css` when the viz renders, registering the `@font-face` for both DOM and Canvas 2D contexts. This approach is practical for fonts under ~50KB per weight (woff2 format).

## Centralised font management

To avoid duplicating the base64 font data across every viz, store a shared CSS file (e.g., `shared/fonts.css`) containing the `@font-face` declarations and have the build script prepend it to each viz's `visualization.css` during packaging. The source CSS stays clean; the packaged output is self-contained.

**In `shared/fonts.css`** — the single source of truth:
```css
@font-face {
    font-family: 'CustomFont';
    src: url(data:font/woff2;base64,{BASE64_ENCODED_FONT_DATA}) format('woff2');
    font-weight: bold;
    font-style: normal;
    font-display: swap;
}
```

**In each viz's `visualization.css`** (source) — just the viz styles, no font:
```css
.{app-name}-viz {
    background: transparent;
}
```

**In `build.sh`** — prepend font CSS before packaging, restore source after:
```bash
if [ -f "$FONT_CSS" ] && [ -f "$VIZ_CSS" ] && ! grep -q "@font-face" "$VIZ_CSS"; then
    ORIGINAL_CSS=$(cat "$VIZ_CSS")
    cat "$FONT_CSS" "$VIZ_CSS" > "$VIZ_CSS.tmp" && mv "$VIZ_CSS.tmp" "$VIZ_CSS"
    CSS_MODIFIED=true
fi
# ... tar packaging ...
if [ "$CSS_MODIFIED" = true ]; then echo "$ORIGINAL_CSS" > "$VIZ_CSS"; fi
```

To generate the base64 string: `base64 -i FontFile.woff2 | tr -d '\n'`

## Waiting for font load in visualization_source.js

Wait for the font to load before first draw using `document.fonts.ready`:

```javascript
initialize: function() {
    // ... canvas setup ...
    this._fontReady = false;
    this._fontCheckDone = false;
},

updateView: function(data, config) {
    if (!this._fontReady && !this._fontCheckDone) {
        this._fontCheckDone = true;
        var self = this;
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function() {
                self._fontReady = true;
                self.invalidateUpdateView();
            });
        } else {
            setTimeout(function() {
                self._fontReady = true;
                self.invalidateUpdateView();
            }, 200);
        }
        return;
    }
    // ... rest of drawing code using 'CustomFont', sans-serif ...
}
```

Then use the font in Canvas drawing: `ctx.font = "bold 24px \"CustomFont\", sans-serif"`

## Quoting in `ctx.font` strings

The font family name must be quoted inside the `ctx.font` value, but JavaScript string quoting conflicts with this. Use escaped double quotes inside single-quoted JS strings:

```javascript
// WRONG — nested single quotes break the JS string
ctx.font = '700 ' + size + 'px \'CustomFont\', sans-serif';

// WRONG — replace-all of 'sans-serif' → '\'CustomFont\', sans-serif' produces broken syntax
ctx.font = '700 ' + size + 'px 'CustomFont', sans-serif';

// CORRECT — escaped double quotes inside single-quoted string
ctx.font = '700 ' + size + 'px "CustomFont", sans-serif';

// CORRECT — store font family in a variable (avoids quoting issues entirely)
var fontFamily = "'CustomFont', sans-serif";
ctx.font = '700 ' + size + 'px ' + fontFamily;
```

The variable approach is safest — define `var fontFamily = "'CustomFont', sans-serif"` once and concatenate it everywhere. This avoids quoting errors when doing bulk find-and-replace across vizs.

Always include a system font fallback (e.g., `sans-serif`) so the viz renders legibly if the embedded font fails to load.

## Harness-vs-Splunk gotcha: OpenType feature leakage

In Splunk the viz renders inside an iframe, so parent-document CSS does not reach it. In the test harness the viz renders into `#vizRoot` in the main document and inherits the harness chrome's styles — including `font-feature-settings`. Canvas 2D text rendering respects inherited `font-feature-settings`, and OpenType feature tags are not namespaced: `ss01` on the harness's UI font (e.g. Host Grotesk) and `ss01` on a viz font (e.g. Formula1) are unrelated features that happen to share a 4-letter tag. When the harness enables stylistic sets for its own UI font, those flags silently activate same-tagged alternates in the viz font, producing letterforms (broken-edge S, A, E, etc.) that do not appear in Splunk. Symptom: identical `@font-face` data, identical `ctx.font` string, different glyphs between harness and Splunk. Fix lives in the harness, not the viz — reset the features on the viz container so nothing leaks in:

```css
#vizRoot, #vizRoot * {
    font-feature-settings: normal;
    font-variant-ligatures: normal;
}
```

When diagnosing a harness-vs-Splunk font mismatch, first confirm it's not this by inspecting the viz font's GSUB feature list (`fontTools.ttLib.TTFont(...)['GSUB'].table.FeatureList`) for `ssNN`/`cvNN` tags that overlap with whatever `font-feature-settings` the harness applies to `html, body`. If they overlap, this is the cause. Do not change `shared/fonts.css` or `visualization.css` to "fix" it — they are correct; the harness was leaking.
