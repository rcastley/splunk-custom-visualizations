/*
 * Top Markets — Splunk Custom Visualization
 *
 * A ranked horizontal-bar list of countries/markets: colour flag, name, a
 * gradient bar, the value and (optionally) its share of the total. Sorts
 * descending and shows the top N. Replaces country pie charts.
 *
 * Flags are bundled as base64 PNGs (flags.json) keyed by ISO 3166-1 alpha-2
 * code, plus an "int" globe for International. The viz resolves a country
 * column that may contain an ISO code OR a common country name.
 *
 * Data contract (one row per country):
 *   - country column (configurable, default "country") — ISO code or name.
 *   - value   column (configurable, default "count")   — the metric.
 * Share % is computed by the viz from the total of all returned rows.
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils',
    '../flags.json'
], function(SplunkVisualizationBase, SplunkVisualizationUtils, FLAGS) {

    // ── Country lookups ─────────────────────────────────────────

    var CODE2NAME = {
        es: 'Spain', it: 'Italy', ro: 'Romania', br: 'Brazil', dk: 'Denmark',
        gb: 'United Kingdom', ie: 'Ireland', us: 'United States', ca: 'Canada',
        mx: 'Mexico', de: 'Germany', fr: 'France', pt: 'Portugal', nl: 'Netherlands',
        be: 'Belgium', se: 'Sweden', no: 'Norway', fi: 'Finland', pl: 'Poland',
        gr: 'Greece', at: 'Austria', ch: 'Switzerland', au: 'Australia', in: 'India',
        ar: 'Argentina', co: 'Colombia', cl: 'Chile', pe: 'Peru', jp: 'Japan',
        za: 'South Africa', ng: 'Nigeria', tr: 'Turkey', cz: 'Czechia', hu: 'Hungary',
        bg: 'Bulgaria', hr: 'Croatia', sk: 'Slovakia', si: 'Slovenia', ua: 'Ukraine',
        nz: 'New Zealand', int: 'International'
    };

    var NAME2CODE = {
        spain: 'es', italy: 'it', romania: 'ro', brazil: 'br', denmark: 'dk',
        'united kingdom': 'gb', uk: 'gb', 'great britain': 'gb', britain: 'gb',
        england: 'gb', ireland: 'ie', 'united states': 'us', usa: 'us', us: 'us',
        america: 'us', canada: 'ca', mexico: 'mx', germany: 'de', france: 'fr',
        portugal: 'pt', netherlands: 'nl', holland: 'nl', belgium: 'be', sweden: 'se',
        norway: 'no', finland: 'fi', poland: 'pl', greece: 'gr', austria: 'at',
        switzerland: 'ch', australia: 'au', india: 'in', argentina: 'ar',
        colombia: 'co', chile: 'cl', peru: 'pe', japan: 'jp', 'south africa': 'za',
        nigeria: 'ng', turkey: 'tr', 'turkiye': 'tr', czechia: 'cz',
        'czech republic': 'cz', hungary: 'hu', bulgaria: 'bg', croatia: 'hr',
        slovakia: 'sk', slovenia: 'si', ukraine: 'ua', 'new zealand': 'nz'
    };

    var INTL = {
        international: 1, intl: 1, global: 1, world: 1, other: 1,
        'rest of world': 1, row: 1, ww: 1, xx: 1
    };

    function resolveCode(raw) {
        var s = String(raw == null ? '' : raw).trim().toLowerCase();
        if (!s) return null;
        if (INTL[s]) return 'int';
        if (s.length === 2 && FLAGS[s]) return s;
        if (NAME2CODE[s]) return NAME2CODE[s];
        if (FLAGS[s]) return s;
        return null;
    }

    // ── Pure draw helpers (no `this`) ───────────────────────────

    function hexToRgba(hex, a) {
        if (!hex || hex === 'transparent') return 'rgba(0,0,0,0)';
        var h = String(hex).replace('#', '');
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return 'rgba(255,255,255,' + a + ')';
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function roundRect(ctx, x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function groupThousands(numStr) {
        var parts = String(numStr).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    }

    function abbreviate(n) {
        var a = Math.abs(n);
        if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
        if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return String(Math.round(n));
    }

    function fitText(ctx, text, maxW, size, weight, family) {
        ctx.font = weight + ' ' + size + 'px ' + family;
        while (size > 8 && ctx.measureText(text).width > maxW) {
            size -= 1;
            ctx.font = weight + ' ' + size + 'px ' + family;
        }
        return size;
    }

    // ── Visualization class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('top-markets-viz');
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);
            this._lastGoodData = null;
            this._fontReady = false;
            this._fontCheckDone = false;
            this._flagCache = {};
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000
            };
        },

        formatData: function(data) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data — Top Markets'
                );
            }
            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) colIdx[fields[i].name] = i;
            var result = { colIdx: colIdx, rows: data.rows };
            this._lastGoodData = result;
            return result;
        },

        // Returns an Image for a flag code, loading it lazily and redrawing on load.
        _flag: function(code) {
            if (!code || !FLAGS[code]) return null;
            if (this._flagCache[code]) return this._flagCache[code];
            var img = new Image();
            var self = this;
            img.onload = function() { self.invalidateUpdateView(); };
            img.src = FLAGS[code];
            this._flagCache[code] = img;
            return img;
        },

        updateView: function(data, config) {
            // Wait for the embedded font before first paint.
            if (!this._fontReady && !this._fontCheckDone) {
                this._fontCheckDone = true;
                var self = this;
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(function() { self._fontReady = true; self.invalidateUpdateView(); });
                } else {
                    setTimeout(function() { self._fontReady = true; self.invalidateUpdateView(); }, 200);
                }
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var FONT = "'Clash Display', sans-serif";

            var countryField = config[ns + 'countryField'] || 'country';
            var valueField   = config[ns + 'valueField']   || 'count';
            var title        = (config[ns + 'title'] !== undefined) ? config[ns + 'title'] : 'Customer Reach · Top Markets';
            var tagText      = (config[ns + 'tagText'] !== undefined) ? config[ns + 'tagText'] : 'by active users';
            var topN         = parseInt(config[ns + 'topN'], 10); if (isNaN(topN) || topN < 1) topN = 6;
            var showShare    = (config[ns + 'showShare'] || 'true') === 'true';
            var abbr         = (config[ns + 'abbreviate'] || 'true') === 'true';

            var barColor1 = config[ns + 'barColor1'] || '#0285FF';
            var barColor2 = config[ns + 'barColor2'] || '#CCE5FF';
            var valueColor = config[ns + 'valueColor'] || '#ffffff';
            var tagColor   = config[ns + 'tagColor']   || '#F8CD4B';

            var fillColor    = config[ns + 'fillColor']    || 'transparent';
            var showBorder   = (config[ns + 'showBorder']  || 'true') === 'true';
            var borderColor  = config[ns + 'borderColor']  || '#2A3566';
            var cornerRadius = parseInt(config[ns + 'cornerRadius'], 10); if (isNaN(cornerRadius)) cornerRadius = 16;

            // ── Build, sort, slice ──
            var colIdx = data.colIdx, rows = data.rows;
            var items = [], total = 0;
            if (colIdx[countryField] !== undefined && colIdx[valueField] !== undefined) {
                for (var r = 0; r < rows.length; r++) {
                    var v = parseFloat(rows[r][colIdx[valueField]]);
                    if (isNaN(v)) continue;
                    var raw = rows[r][colIdx[countryField]];
                    var code = resolveCode(raw);
                    var name = (code && CODE2NAME[code]) ? CODE2NAME[code] : String(raw == null ? '' : raw);
                    items.push({ name: name, code: code, value: v });
                    total += v;
                }
            }
            items.sort(function(a, b) { return b.value - a.value; });
            var shown = items.slice(0, topN);
            var maxVal = shown.length ? shown[0].value : 1;

            // ── Canvas setup (HiDPI) ──
            var rect = this.el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);
            var w = rect.width, h = rect.height;
            ctx.clearRect(0, 0, w, h);

            // Clip the root element to the rounded radius so any background fill
            // (the viz fillColor OR a Dashboard Studio panel background) cannot
            // bleed past the rounded corners into the rectangular element box.
            this.el.style.borderRadius = cornerRadius + 'px';
            this.el.style.overflow = 'hidden';

            // ── Panel ──
            roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, cornerRadius);
            if (fillColor && fillColor !== 'transparent') { ctx.fillStyle = fillColor; ctx.fill(); }
            if (showBorder) { ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5; ctx.stroke(); }

            var padX = Math.max(18, w * 0.035);
            var padY = Math.max(16, h * 0.06);

            // ── Header: title + tag ──
            var titleSize = Math.max(11, Math.min(16, h * 0.05));
            var headerBottom = padY;
            if (title) {
                ctx.font = '600 ' + titleSize + 'px ' + FONT;
                ctx.fillStyle = hexToRgba(valueColor, 0.55);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                if ('letterSpacing' in ctx) { try { ctx.letterSpacing = '1px'; } catch (e) {} }
                ctx.fillText(title.toUpperCase(), padX, padY);
                if ('letterSpacing' in ctx) { try { ctx.letterSpacing = '0px'; } catch (e2) {} }
            }
            if (tagText) {
                var tagSize = Math.max(9, titleSize * 0.78);
                ctx.font = '600 ' + tagSize + 'px ' + FONT;
                var ttw = ctx.measureText(tagText).width;
                var tpad = tagSize * 0.7, tph = tagSize * 1.9, tpw = ttw + tpad * 2;
                var tpx = w - padX - tpw, tpy = padY - tph * 0.18;
                roundRect(ctx, tpx, tpy, tpw, tph, 6);
                ctx.fillStyle = hexToRgba(tagColor, 0.15);
                ctx.fill();
                ctx.fillStyle = tagColor;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(tagText, tpx + tpad, tpy + tph / 2 + 0.5);
            }
            headerBottom = padY + titleSize + Math.max(10, h * 0.05);

            // ── Empty state ──
            if (!shown.length) {
                ctx.font = '500 ' + Math.max(12, h * 0.04) + 'px ' + FONT;
                ctx.fillStyle = hexToRgba(valueColor, 0.4);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('No matching markets', w / 2, (headerBottom + h - padY) / 2);
                return;
            }

            // ── Rows ──
            var rowsTop = headerBottom, rowsBottom = h - padY;
            var rowH = (rowsBottom - rowsTop) / shown.length;

            var flagH = Math.min(rowH * 0.5, 26);
            var flagBoxW = flagH * 1.5;
            var nameX = padX + flagBoxW + Math.max(10, w * 0.012);
            var nameColW = Math.max(96, w * 0.15);
            var valueColW = Math.max(58, w * 0.085);
            var shareColW = showShare ? Math.max(40, w * 0.05) : 0;
            var gap = Math.max(14, w * 0.02);

            var shareRightX = w - padX;
            var valueRightX = w - padX - (showShare ? (shareColW + gap) : 0);
            var barX = nameX + nameColW;
            var barRight = (valueRightX - valueColW) - gap;
            var barW = Math.max(20, barRight - barX);
            var barH = Math.max(7, Math.min(11, rowH * 0.16));
            var textSize = Math.max(12, Math.min(17, rowH * 0.30));

            for (var i = 0; i < shown.length; i++) {
                var it = shown[i];
                var cy = rowsTop + rowH * (i + 0.5);

                // Flag (preserve aspect, centred in box)
                var img = this._flag(it.code);
                if (img && img.complete && img.naturalWidth > 0) {
                    var asp = img.naturalWidth / img.naturalHeight;
                    var dh = flagH, dw = flagH * asp;
                    if (dw > flagBoxW) { dw = flagBoxW; dh = dw / asp; }
                    var ix = padX + (flagBoxW - dw) / 2, iy = cy - dh / 2;
                    ctx.save();
                    roundRect(ctx, ix, iy, dw, dh, 3);
                    ctx.clip();
                    ctx.drawImage(img, ix, iy, dw, dh);
                    ctx.restore();
                    roundRect(ctx, ix, iy, dw, dh, 3);
                    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    // placeholder dot for unknown markets
                    ctx.beginPath();
                    ctx.arc(padX + flagBoxW / 2, cy, flagH * 0.42, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255,255,255,0.12)';
                    ctx.fill();
                }

                // Name
                var nSize = fitText(ctx, it.name, nameColW, textSize, '600', FONT);
                ctx.font = '600 ' + nSize + 'px ' + FONT;
                ctx.fillStyle = valueColor;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(it.name, nameX, cy);

                // Bar track + fill
                roundRect(ctx, barX, cy - barH / 2, barW, barH, barH / 2);
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fill();
                var fw = Math.max(barH, (it.value / maxVal) * barW);
                var grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
                grad.addColorStop(0, barColor1);
                grad.addColorStop(1, barColor2);
                roundRect(ctx, barX, cy - barH / 2, fw, barH, barH / 2);
                ctx.fillStyle = grad;
                ctx.fill();

                // Value
                var valStr = abbr ? abbreviate(it.value) : groupThousands(Math.round(it.value));
                ctx.font = '700 ' + textSize + 'px ' + FONT;
                ctx.fillStyle = valueColor;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(valStr, valueRightX, cy);

                // Share %
                if (showShare) {
                    var pct = total > 0 ? Math.round((it.value / total) * 100) : 0;
                    ctx.font = '500 ' + (textSize * 0.82) + 'px ' + FONT;
                    ctx.fillStyle = hexToRgba(valueColor, 0.42);
                    ctx.textAlign = 'right';
                    ctx.fillText(pct + '%', shareRightX, cy);
                }
            }
        },

        reflow: function() { this.invalidateUpdateView(); },

        destroy: function() { SplunkVisualizationBase.prototype.destroy.call(this); }
    });
});
