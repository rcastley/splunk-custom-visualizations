# visualization_source.js — The Core Pattern

This is the most important file in a Splunk custom viz. Every new viz starts from this exact AMD module structure. Follow it precisely — the lifecycle methods, guard checks, and caching patterns are all load-bearing.

```javascript
/*
 * {Display Label} — Splunk Custom Visualization
 *
 * {Brief description of what it renders.}
 *
 * Expected SPL columns: {list columns}
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helper functions (pure, no `this`) ──────────────────────

    // Place all utility functions here: color math, formatting,
    // coordinate transforms, drawing primitives, etc.

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('{app-name}-viz');

            // Create canvas element
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            // Internal state (non-config)
            // e.g., this._cachedBounds = null;
            this._lastGoodData = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000  // see rule 20 for real-time sizing guidance
            };
        },

        formatData: function(data, config) {
            // Keep formatData lightweight — see rule 21.
            // Build column index and pass through row data.
            // Do NOT read config here — field selection belongs
            // in updateView to avoid Splunk caching issues.

            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 {Viz Display Name}'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Check for status message from appendpipe fallback (see rule 27)
            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            // Helper to safely parse numeric values
            function getVal(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                var v = parseFloat(row[colIdx[name]]);
                return isNaN(v) ? fallback : v;
            }

            function getStr(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                return row[colIdx[name]] || fallback;
            }

            var row = data.rows[data.rows.length - 1];

            // Option A: Multi-column viz (hardcoded fields)
            // var result = {
            //     value1: getVal(row, 'field1', 0),
            //     value2: getStr(row, 'field2', '')
            // };

            // Option B: Configurable field viz (field chosen in updateView)
            var result = { colIdx: colIdx, row: row };

            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Main render method. Called whenever data or config changes.
            //
            // MUST handle:
            //   1. data === false (no data) — use cached data or show placeholder
            //   2. Canvas sizing with devicePixelRatio for sharp rendering
            //   3. Reading user settings from config
            //   4. Full canvas redraw (clear + draw)

            // Custom no-data message from appendpipe fallback (see rule 27)
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            // ── Read user settings ──
            // IMPORTANT: The || fallback values below MUST match the
            // default values in formatter.html. Splunk does not send
            // formatter defaults to JS until the user interacts with
            // the Format panel. See rule 19.
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var setting1 = config[ns + '{setting1}'] || '{default1}';
            // parseFloat/parseInt for numeric settings
            // === 'true' for boolean settings from radio inputs

            // ── Size canvas for HiDPI ──
            var el = this.el;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            var w = rect.width;
            var h = rect.height;

            // ── Clear canvas (transparent — inherits dashboard background) ──
            ctx.clearRect(0, 0, w, h);

            // ... all Canvas 2D drawing code here ...
            // Use w, h for layout calculations
            // Use data (the object returned by formatData)
            // NOTE: Do NOT fill the canvas with an opaque background color
            // unless the user explicitly requests it. Transparent is the default.
        },

        // ── Custom no-data message support (see rule 27) ──

        _ensureCanvas: function() {
            if (!this.canvas) {
                this.el.innerHTML = '';
                this.canvas = document.createElement('canvas');
                this.canvas.style.width = '100%';
                this.canvas.style.height = '100%';
                this.canvas.style.display = 'block';
                this.el.appendChild(this.canvas);
            }
            var rect = this.el.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
        },

        _drawStatusMessage: function(message) {
            var rect = this.el.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            if (rect.width <= 0 || rect.height <= 0) return;
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            var maxTextW = w * 0.85;
            var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
            var emojiSize = Math.round(fontSize * 1.6);
            var gap = fontSize * 0.5;

            // Scale font down if text overflows container
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px sans-serif';
            }

            // Optional emoji icon above text (full opacity)
            // Replace the emoji string with any relevant Unicode emoji
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u23F3', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text below emoji (dimmed)
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        // Optional: clean up timers, event listeners
        destroy: function() {
            // Clear any setInterval/setTimeout references
            // if (this._timer) { clearInterval(this._timer); this._timer = null; }
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
```
