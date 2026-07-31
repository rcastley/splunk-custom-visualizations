# Custom Fonts

Use this reference when embedding or debugging fonts. Keep each packaged visualization self-contained and verify licensing permits redistribution.

## Contents

- [Shared requirements](#shared-requirements)
- [Legacy packaging](#legacy-packaging)
- [Native Studio packaging](#native-studio-packaging)
- [Wait before measuring](#wait-before-measuring)
- [Canvas font syntax](#canvas-font-syntax)
- [Harness isolation](#harness-isolation)

## Shared requirements

- Prefer WOFF2 and include only the weights and glyphs the visualization needs.
- Declare a system fallback so missing fonts do not make the visualization unreadable.
- Wait for required fonts before measuring or drawing text.
- Test the production bundle in its real iframe/document boundary; a development page can mask asset and inheritance problems.
- Do not load fonts from an arbitrary external origin. Cloud policy, CSP, authentication, and offline environments can block them.

## Legacy packaging

The most portable legacy approach is an inline WOFF2 data URL in `visualization.css`, because the packaged CSS has no runtime path dependency:

```css
@font-face {
    font-family: "CustomFont";
    src: url(data:font/woff2;base64,{BASE64_DATA}) format("woff2");
    font-weight: 700;
    font-style: normal;
    font-display: swap;
}
```

A repository may keep declarations in a shared source file and prepend them during packaging, but the resulting app must remain self-contained. Do not state that the JavaScript `FontFace` API or packaged relative URLs can never work; choose inline data when reliability across legacy deployments matters more than bundle size.

## Native Studio packaging

Use the generated extension build pipeline for imported assets. Fonts referenced from source or CSS are normally inlined by the scaffold's build plugin for iframe isolation. Preserve that plugin unless a tested requirement calls for a different asset strategy.

Do not apply a legacy CSS-prepend step to native Studio output. Verify the built bundle and `.spl`, because development-server success does not prove the font was packaged.

## Wait before measuring

Use `document.fonts.load` for the exact face where supported, then redraw:

```javascript
function waitForFont(fontSpec) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return document.fonts.load(fontSpec).then(function() {});
}
```

Legacy adapters can call `invalidateUpdateView()` after the promise settles. Native adapters should schedule their normal render path or update component state. Guard against redraw after teardown.

## Canvas font syntax

Quote family names containing spaces and keep a fallback:

```javascript
var fontFamily = '"CustomFont", sans-serif';
ctx.font = '700 ' + size + 'px ' + fontFamily;
```

Keep the same family spelling, weight, and style in `@font-face`, `document.fonts.load`, DOM CSS, and `ctx.font`.

## Harness isolation

The legacy harness may render the visualization in its own document, while the Studio harness must render the extension in an iframe. Match the target framework rather than assuming one inheritance model.

For a same-document legacy harness, prevent the harness chrome from leaking OpenType feature settings into the visualization:

```css
#vizRoot,
#vizRoot * {
    font-feature-settings: normal;
    font-variant-ligatures: normal;
}
```

For native Studio, put font declarations inside the extension bundle and inspect the iframe document. Parent styles and CSS variables do not cross the iframe boundary.
