/*
 * Category Breakdown — Splunk Custom Visualization
 *
 * A snapshot ranked breakdown that replaces legend-heavy multi-series charts.
 * A single-value-style headline sits above top_markets-style ranked bars:
 *
 *   - Set a "primary" category (e.g. SUCCESS) → the headline becomes a
 *     RAG-coloured rate (primary ÷ total %) and that category is excluded
 *     from the bars, so you see the failure/category mix.
 *   - Leave primary unset → the headline is the grand total and every
 *     category ranks.
 *   - The long tail collapses into a single "Other" bar (Top N + Other),
 *     so shares add to 100%.
 *
 * Data contract (one row per category, value aggregated in SPL):
 *   - category column (configurable, default "category")
 *   - value    column (configurable, default "count")
 *   - delta    column (configurable, default "delta") — optional headline delta
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    var FONT = "'Clash Display', sans-serif";

    // ── Pure helpers (no `this`) ────────────────────────────────

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

    // Headline number + suffix width at a given size (no prefix needed here).
    function composedWidth(ctx, value, suffix, vSize) {
        ctx.font = '700 ' + vSize + 'px ' + FONT;
        var t = ctx.measureText(value).width;
        if (suffix) {
            ctx.font = '600 ' + (vSize * 0.52) + 'px ' + FONT;
            t += vSize * 0.07 + ctx.measureText(suffix).width;
        }
        return t;
    }

    function fitValueSize(ctx, value, suffix, maxW, maxH) {
        var vSize = maxH;
        while (vSize > 8 && composedWidth(ctx, value, suffix, vSize) > maxW) vSize -= 1;
        return vSize;
    }

    // RAG: up to 5 (threshold, colour) stops. Highest stop whose threshold
    // `num` meets/exceeds wins; null if below all (caller keeps fixed colour).
    function pickThresholdColor(config, ns, num) {
        var stops = [];
        for (var i = 1; i <= 5; i++) {
            var t = config[ns + 'threshold' + i];
            if (t === undefined || t === null || t === '') continue;
            var tn = parseFloat(t);
            if (isNaN(tn)) continue;
            stops.push({ t: tn, c: config[ns + 'bandColor' + i] || '#ffffff' });
        }
        if (!stops.length) return null;
        stops.sort(function(a, b) { return a.t - b.t; });
        var chosen = null;
        for (var k = 0; k < stops.length; k++) {
            if (num >= stops[k].t) chosen = stops[k].c;
        }
        return chosen;
    }

    function descByValue(a, b) { return b.value - a.value; }

    // ── Visualization class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('category-breakdown-viz');
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);
            this._lastGoodData = null;
            this._fontReady = false;
            this._fontCheckDone = false;
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
                    'Awaiting data — Category Breakdown'
                );
            }
            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) colIdx[fields[i].name] = i;
            var result = { colIdx: colIdx, rows: data.rows };
            this._lastGoodData = result;
            return result;
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

            // Data
            var categoryField = config[ns + 'categoryField'] || 'category';
            var valueField    = config[ns + 'valueField']    || 'count';
            var deltaField    = config[ns + 'deltaField']    || 'delta';

            // Headline
            var primaryName     = (config[ns + 'primaryCategory'] || '').replace(/^\s+|\s+$/g, '');
            var headlineLabel   = config[ns + 'headlineLabel']  || '';
            var headlineSuffix  = config[ns + 'headlineSuffix'] || '';
            var headlineColor   = config[ns + 'headlineColor']  || '#ffffff';
            var abbr            = (config[ns + 'abbreviate'] || 'true') === 'true';
            var deltaSuffix     = config[ns + 'deltaSuffix']  || '';
            var showArrow       = (config[ns + 'showArrow']      || 'true') === 'true';
            var higherIsBetter  = (config[ns + 'higherIsBetter'] || 'true') === 'true';
            var upColor         = config[ns + 'upColor']   || '#61D27E';
            var downColor       = config[ns + 'downColor'] || '#D5225D';
            var colorMode       = config[ns + 'colorMode'] || 'fixed';

            // Bars
            var title      = config[ns + 'title']    || '';
            var tagText    = config[ns + 'tagText']  || '';
            var tagColor   = config[ns + 'tagColor'] || '#F8CD4B';
            var topN       = parseInt(config[ns + 'topN'], 10); if (isNaN(topN) || topN < 1) topN = 6;
            var showOther  = (config[ns + 'showOther'] || 'true') === 'true';
            var otherLabel = config[ns + 'otherLabel'] || 'Other';
            var showShare  = (config[ns + 'showShare'] || 'true') === 'true';
            var barColor1  = config[ns + 'barColor1'] || '#0285FF';
            var barColor2  = config[ns + 'barColor2'] || '#CCE5FF';

            // Appearance
            var fillColor    = config[ns + 'fillColor']    || 'transparent';
            var showBorder   = (config[ns + 'showBorder']  || 'true') === 'true';
            var borderColor  = config[ns + 'borderColor']  || '#2A3566';
            var cornerRadius = parseInt(config[ns + 'cornerRadius'], 10); if (isNaN(cornerRadius)) cornerRadius = 16;
            var showAccent     = (config[ns + 'showAccent'] || 'false') === 'true';
            var accentColor    = config[ns + 'accentColor'] || '#0285FF';
            var accentPosition = config[ns + 'accentPosition'] || 'top';

            // ── Build items ──
            var rows = data.rows, colIdx = data.colIdx;
            var items = [], total = 0, i;
            if (colIdx[categoryField] !== undefined && colIdx[valueField] !== undefined) {
                for (i = 0; i < rows.length; i++) {
                    var v = parseFloat(rows[i][colIdx[valueField]]);
                    if (isNaN(v)) continue;
                    var cat = rows[i][colIdx[categoryField]];
                    items.push({ name: String(cat == null ? '' : cat), value: v, row: rows[i] });
                    total += v;
                }
            }

            // ── Primary category → rate headline, else total ──
            var primaryItem = null;
            if (primaryName) {
                for (i = 0; i < items.length; i++) {
                    if (items[i].name.toLowerCase() === primaryName.toLowerCase()) { primaryItem = items[i]; break; }
                }
            }
            var isRate = !!primaryItem;
            var headlineNum, headlineStr, barTotal;
            if (isRate) {
                headlineNum = total > 0 ? Math.round((primaryItem.value / total) * 1000) / 10 : 0;
                headlineStr = String(headlineNum);
                barTotal = total - primaryItem.value;
            } else {
                headlineNum = total;
                headlineStr = abbr ? abbreviate(total) : groupThousands(Math.round(total));
                barTotal = total;
            }

            // ── Optional headline delta ──
            var deltaStr = '';
            if (colIdx[deltaField] !== undefined) {
                if (isRate) {
                    var pd = primaryItem.row[colIdx[deltaField]];
                    if (pd !== undefined && pd !== null && String(pd) !== '') deltaStr = String(pd);
                } else {
                    for (i = 0; i < items.length; i++) {
                        var dv = items[i].row[colIdx[deltaField]];
                        if (dv !== undefined && dv !== null && String(dv) !== '') { deltaStr = String(dv); break; }
                    }
                }
            }
            var deltaNum = parseFloat(deltaStr);
            var hasDelta = deltaStr !== '' && !isNaN(deltaNum);

            // ── RAG headline colour ──
            if (colorMode === 'thresholds' && !isNaN(headlineNum)) {
                var rag = pickThresholdColor(config, ns, headlineNum);
                if (rag) headlineColor = rag;
            }

            // ── Bars: rank non-primary, Top N + Other ──
            var barItems = [];
            for (i = 0; i < items.length; i++) { if (items[i] !== primaryItem) barItems.push(items[i]); }
            barItems.sort(descByValue);
            var shown = barItems.slice(0, topN);
            if (showOther) {
                var otherSum = 0;
                for (i = topN; i < barItems.length; i++) otherSum += barItems[i].value;
                if (otherSum > 0) shown.push({ name: otherLabel, value: otherSum, other: true });
            }
            var maxBar = 0;
            for (i = 0; i < shown.length; i++) { if (shown[i].value > maxBar) maxBar = shown[i].value; }
            if (maxBar <= 0) maxBar = 1;

            // ── Canvas (HiDPI) ──
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

            // Clip element to rounded radius so fills can't bleed past corners.
            this.el.style.borderRadius = cornerRadius + 'px';
            this.el.style.overflow = 'hidden';

            // ── Panel ──
            roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, cornerRadius);
            if (fillColor && fillColor !== 'transparent') { ctx.fillStyle = fillColor; ctx.fill(); }
            if (showBorder) { ctx.strokeStyle = borderColor; ctx.lineWidth = 1.5; ctx.stroke(); }

            // Accent strip (brand colour) on the chosen edge (left/top/right) + glow.
            if (showAccent && accentColor && accentColor !== 'transparent') {
                var aThick = Math.max(3, Math.min(w, h) * 0.012);
                var aGlow = aThick * 7;
                var ac0 = hexToRgba(accentColor, 0.22), ac1 = hexToRgba(accentColor, 0);
                var ag;
                if (accentPosition === 'left') {
                    ag = ctx.createLinearGradient(0, 0, aGlow, 0);
                    ag.addColorStop(0, ac0); ag.addColorStop(1, ac1);
                    ctx.fillStyle = ag; ctx.fillRect(0, 0, aGlow, h);
                    ctx.fillStyle = accentColor; ctx.fillRect(0, 0, aThick, h);
                } else if (accentPosition === 'right') {
                    ag = ctx.createLinearGradient(w, 0, w - aGlow, 0);
                    ag.addColorStop(0, ac0); ag.addColorStop(1, ac1);
                    ctx.fillStyle = ag; ctx.fillRect(w - aGlow, 0, aGlow, h);
                    ctx.fillStyle = accentColor; ctx.fillRect(w - aThick, 0, aThick, h);
                } else {
                    ag = ctx.createLinearGradient(0, 0, 0, aGlow);
                    ag.addColorStop(0, ac0); ag.addColorStop(1, ac1);
                    ctx.fillStyle = ag; ctx.fillRect(0, 0, w, aGlow);
                    ctx.fillStyle = accentColor; ctx.fillRect(0, 0, w, aThick);
                }
            }

            var padX = Math.max(18, w * 0.035);
            var padY = Math.max(16, h * 0.06);
            var innerW = w - padX * 2;

            // ── Header: title + tag ──
            var titleSize = Math.max(11, h * 0.05);
            if (title) {
                ctx.font = '600 ' + titleSize + 'px ' + FONT;
                ctx.fillStyle = 'rgba(255,255,255,0.55)';
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
            var headerBottom = padY + titleSize + Math.max(8, h * 0.04);

            // ── Headline number ──
            var numZoneH = Math.max(26, h * 0.20);
            var hasLine = hasDelta || (headlineLabel && headlineLabel.length > 0);
            var deltaLineH = hasLine ? Math.max(15, h * 0.08) : 0;

            var maxValSize = Math.min(numZoneH * 0.98, h * 0.42);
            var vSize = fitValueSize(ctx, headlineStr, headlineSuffix, innerW, maxValSize);
            var sSize = vSize * 0.52;
            var baseY = headerBottom + numZoneH / 2 + vSize * 0.35;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.font = '700 ' + vSize + 'px ' + FONT;
            ctx.fillStyle = headlineColor;
            ctx.fillText(headlineStr, padX, baseY);
            var hx = padX + ctx.measureText(headlineStr).width;
            if (headlineSuffix) {
                hx += vSize * 0.07;
                ctx.font = '600 ' + sSize + 'px ' + FONT;
                ctx.fillStyle = hexToRgba(headlineColor, 0.65);
                ctx.fillText(headlineSuffix, hx, baseY);
            }

            // ── Headline delta badge + label line ──
            if (hasLine) {
                var lineCy = headerBottom + numZoneH + deltaLineH / 2 + Math.max(2, h * 0.01);
                var dFont = Math.max(10, deltaLineH * 0.6);
                var sx = padX;
                if (hasDelta) {
                    var positive = deltaNum > 0, negative = deltaNum < 0;
                    var dColor = (deltaNum === 0) ? '#9aa7c7' : ((higherIsBetter ? positive : negative) ? upColor : downColor);
                    var arrow = positive ? '▲' : (negative ? '▼' : '');
                    var shownDelta = showArrow ? deltaStr.replace(/^-/, '') : deltaStr;
                    var pillText = (showArrow && arrow ? (arrow + ' ') : '') + shownDelta + deltaSuffix;
                    ctx.font = '600 ' + dFont + 'px ' + FONT;
                    var tw = ctx.measureText(pillText).width;
                    var pillPad = dFont * 0.65, pillH = dFont * 1.75, pillW = tw + pillPad * 2;
                    roundRect(ctx, sx, lineCy - pillH / 2, pillW, pillH, pillH / 2);
                    ctx.fillStyle = hexToRgba(dColor, 0.15);
                    ctx.fill();
                    ctx.fillStyle = dColor;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(pillText, sx + pillPad, lineCy + 0.5);
                    sx += pillW + dFont * 0.7;
                }
                if (headlineLabel) {
                    ctx.font = '500 ' + dFont + 'px ' + FONT;
                    ctx.fillStyle = 'rgba(255,255,255,0.65)';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(headlineLabel, sx, lineCy + 0.5);
                }
            }

            var barsTop = headerBottom + numZoneH + (hasLine ? (deltaLineH + Math.max(4, h * 0.02)) : 0) + Math.max(8, h * 0.04);
            var barsBottom = h - padY;

            // ── Empty state ──
            if (!shown.length) {
                ctx.font = '500 ' + Math.max(12, h * 0.04) + 'px ' + FONT;
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('No categories', w / 2, (barsTop + barsBottom) / 2);
                return;
            }

            // ── Ranked bars (no flags) ──
            var rowH = (barsBottom - barsTop) / shown.length;
            var nameX = padX;
            var nameColW = Math.max(120, w * 0.22);
            var nameGap = Math.max(16, w * 0.018);
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

            // Uniform name font size: fit the WIDEST name once so every row
            // matches (per-row fitting makes long names shrink and looks uneven).
            var nameSize = textSize;
            for (i = 0; i < shown.length; i++) {
                var fs = fitText(ctx, shown[i].name, nameColW - nameGap, textSize, '600', FONT);
                if (fs < nameSize) nameSize = fs;
            }

            for (i = 0; i < shown.length; i++) {
                var it = shown[i];
                var cy = barsTop + rowH * (i + 0.5);

                // Name — uniform size for a balanced column (Other dimmed)
                ctx.font = '600 ' + nameSize + 'px ' + FONT;
                ctx.fillStyle = it.other ? 'rgba(255,255,255,0.7)' : '#ffffff';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(it.name, nameX, cy);

                // Bar track + gradient fill
                roundRect(ctx, barX, cy - barH / 2, barW, barH, barH / 2);
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fill();
                var fw = Math.max(barH, (it.value / maxBar) * barW);
                if (it.other) {
                    ctx.fillStyle = 'rgba(255,255,255,0.22)';
                } else {
                    var grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
                    grad.addColorStop(0, barColor1);
                    grad.addColorStop(1, barColor2);
                    ctx.fillStyle = grad;
                }
                roundRect(ctx, barX, cy - barH / 2, fw, barH, barH / 2);
                ctx.fill();

                // Value
                var valStr = abbr ? abbreviate(it.value) : groupThousands(Math.round(it.value));
                ctx.font = '700 ' + textSize + 'px ' + FONT;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(valStr, valueRightX, cy);

                // Share %
                if (showShare) {
                    var pct = barTotal > 0 ? Math.round((it.value / barTotal) * 100) : 0;
                    ctx.font = '500 ' + (textSize * 0.82) + 'px ' + FONT;
                    ctx.fillStyle = 'rgba(255,255,255,0.42)';
                    ctx.textAlign = 'right';
                    ctx.fillText(pct + '%', shareRightX, cy);
                }
            }
        },

        reflow: function() { this.invalidateUpdateView(); },

        destroy: function() { SplunkVisualizationBase.prototype.destroy.call(this); }
    });
});
