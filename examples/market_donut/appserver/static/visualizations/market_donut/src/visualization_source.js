/*
 * Market Depth Donut — Splunk Custom Visualization
 *
 * Nested donut chart where the outer ring shows bet type categories
 * and the inner ring shows specific markets within each category.
 * Segment size is proportional to volume with color coding.
 *
 * Expected SPL columns: category (required), market (required), volume (required)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var PI2 = Math.PI * 2;
    var DEG_TO_RAD = Math.PI / 180;

    var PALETTES = {
        vibrant: ['#0088ff', '#ff6600', '#00cc66', '#ff3366', '#9933ff', '#ffcc00', '#00cccc', '#ff9900'],
        pastel:  ['#6ca0dc', '#e8915c', '#7cc47c', '#d96b8c', '#a77ccf', '#d4c060', '#6cc0c0', '#d4a060'],
        neon:    ['#00ddff', '#ff4400', '#00ff88', '#ff0066', '#aa00ff', '#ffee00', '#00ffcc', '#ff8800']
    };

    var DARK_BG = '#0d0d1a';

    // ── Helper Functions (pure, no `this`) ──────────────────────

    function degToRad(deg) {
        return deg * DEG_TO_RAD;
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function formatNumber(n) {
        var s = Math.round(n).toString();
        var result = '';
        for (var i = s.length - 1, c = 0; i >= 0; i--, c++) {
            if (c > 0 && c % 3 === 0) result = ',' + result;
            result = s[i] + result;
        }
        return result;
    }

    function hexToRgb(hex) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return { r: r, g: g, b: b };
    }

    function rgbToHex(r, g, b) {
        r = clamp(Math.round(r), 0, 255);
        g = clamp(Math.round(g), 0, 255);
        b = clamp(Math.round(b), 0, 255);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function hexToRgba(hex, alpha) {
        var c = hexToRgb(hex);
        return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
    }

    function lightenColor(hex, amount) {
        var c = hexToRgb(hex);
        return rgbToHex(
            c.r + (255 - c.r) * amount,
            c.g + (255 - c.g) * amount,
            c.b + (255 - c.b) * amount
        );
    }

    function darkenColor(hex, amount) {
        var c = hexToRgb(hex);
        return rgbToHex(
            c.r * (1 - amount),
            c.g * (1 - amount),
            c.b * (1 - amount)
        );
    }

    function brightenColor(hex, amount) {
        var c = hexToRgb(hex);
        return rgbToHex(
            Math.min(255, c.r + amount),
            Math.min(255, c.g + amount),
            Math.min(255, c.b + amount)
        );
    }

    /**
     * Build structured category data from raw rows.
     * Returns { categories: [...], grandTotal: number }
     * Each category: { name, volume, color, markets: [{ name, volume, color }] }
     */
    function buildCategoryData(rows, colIdx, palette) {
        var colors = PALETTES[palette] || PALETTES.vibrant;
        var categoryOrder = [];
        var categoryMap = {};
        var grandTotal = 0;
        var i, row, catName, mktName, vol;

        for (i = 0; i < rows.length; i++) {
            row = rows[i];
            catName = (row[colIdx.category] || '').toString();
            mktName = (row[colIdx.market] || '').toString();
            vol = parseFloat(row[colIdx.volume]);
            if (isNaN(vol) || vol <= 0) vol = 0;

            if (!catName) continue;

            if (!categoryMap[catName]) {
                categoryMap[catName] = {
                    name: catName,
                    volume: 0,
                    markets: [],
                    colorIdx: categoryOrder.length
                };
                categoryOrder.push(catName);
            }

            categoryMap[catName].volume += vol;
            categoryMap[catName].markets.push({
                name: mktName,
                volume: vol
            });
            grandTotal += vol;
        }

        var categories = [];
        for (i = 0; i < categoryOrder.length; i++) {
            var cat = categoryMap[categoryOrder[i]];
            var baseColor = colors[cat.colorIdx % colors.length];
            cat.color = baseColor;

            // Assign inner ring colors — alternate lighter/darker shades
            for (var m = 0; m < cat.markets.length; m++) {
                var shade;
                if (cat.markets.length === 1) {
                    shade = lightenColor(baseColor, 0.15);
                } else {
                    // Spread from darker to lighter across markets
                    var t = m / (cat.markets.length - 1);
                    shade = darkenColor(baseColor, 0.2 - t * 0.4);
                    if (t > 0.5) {
                        shade = lightenColor(baseColor, (t - 0.5) * 0.4);
                    } else {
                        shade = darkenColor(baseColor, (0.5 - t) * 0.3);
                    }
                }
                cat.markets[m].color = shade;
            }

            categories.push(cat);
        }

        return {
            categories: categories,
            grandTotal: grandTotal
        };
    }

    /**
     * Point-in-arc hit test.
     * Returns true if (px, py) is within the arc segment defined by
     * center (cx, cy), innerRadius, outerRadius, startAngle, endAngle.
     */
    function pointInArc(px, py, cx, cy, innerR, outerR, startAngle, endAngle) {
        var dx = px - cx;
        var dy = py - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < innerR || dist > outerR) return false;

        var angle = Math.atan2(dy, dx);
        if (angle < 0) angle += PI2;

        // Normalize angles to 0..2PI
        var sa = startAngle % PI2;
        if (sa < 0) sa += PI2;
        var ea = endAngle % PI2;
        if (ea < 0) ea += PI2;

        if (sa <= ea) {
            return angle >= sa && angle <= ea;
        }
        // Wraps around 0
        return angle >= sa || angle <= ea;
    }

    /**
     * Draw an arc segment (donut slice).
     */
    function drawArcSegment(ctx, cx, cy, innerR, outerR, startAngle, endAngle, fillColor) {
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, endAngle);
        ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
    }

    /**
     * Draw a label at a given angle and radius from center.
     */
    function drawRadialLabel(ctx, cx, cy, radius, midAngle, text, fontSize, color) {
        var lx = cx + Math.cos(midAngle) * radius;
        var ly = cy + Math.sin(midAngle) * radius;

        ctx.save();
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';

        // Determine text alignment based on angle
        var normalizedAngle = midAngle % PI2;
        if (normalizedAngle < 0) normalizedAngle += PI2;

        if (normalizedAngle > Math.PI * 0.5 && normalizedAngle < Math.PI * 1.5) {
            ctx.textAlign = 'right';
            lx -= fontSize * 0.3;
        } else {
            ctx.textAlign = 'left';
            lx += fontSize * 0.3;
        }

        ctx.fillText(text, lx, ly);
        ctx.restore();
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('market-donut-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._hoverSegment = null;
            this._segments = [];
            this._boundMouseMove = null;
            this._boundMouseLeave = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000
            };
        },

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Market Depth Donut'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Check for status message from appendpipe fallback
            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            // Validate required columns
            if (colIdx.category === undefined || colIdx.market === undefined || colIdx.volume === undefined) {
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: category, market, volume'
                );
            }

            var result = {
                colIdx: colIdx,
                rows: data.rows
            };

            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Custom no-data message
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            // ── Read settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var palette = config[ns + 'palette'] || 'vibrant';
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var showCenter = (config[ns + 'showCenter'] || 'true') === 'true';
            var showInnerLabels = (config[ns + 'showInnerLabels'] || 'false') === 'true';
            var gapAngle = parseFloat(config[ns + 'gapAngle']);
            if (isNaN(gapAngle)) gapAngle = 1;
            gapAngle = clamp(gapAngle, 0, 5);
            var ringRatio = parseFloat(config[ns + 'ringRatio']);
            if (isNaN(ringRatio)) ringRatio = 0.6;
            ringRatio = clamp(ringRatio, 0.3, 0.9);
            var outerThickness = parseFloat(config[ns + 'outerThickness']);
            if (isNaN(outerThickness)) outerThickness = 0;

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
            var cx = w / 2;
            var cy = h / 2;

            // ── Build category data ──
            var catData = buildCategoryData(data.rows, data.colIdx, palette);
            var categories = catData.categories;
            var grandTotal = catData.grandTotal;

            if (grandTotal <= 0 || categories.length === 0) {
                ctx.clearRect(0, 0, w, h);
                return;
            }

            // ── Calculate ring dimensions ──
            var labelMargin = showLabels ? Math.max(60, Math.min(w, h) * 0.15) : 20;
            var maxRadius = (Math.min(w, h) / 2) - labelMargin;
            var outerR = maxRadius;
            var outerThick = outerThickness > 0 ? outerThickness : Math.max(20, maxRadius * 0.25);
            var innerOuterR = outerR - outerThick;
            var gapBetweenRings = Math.max(4, maxRadius * 0.04);
            var innerR = innerOuterR - gapBetweenRings;
            var innerThick = Math.max(14, innerR * (1 - ringRatio));
            var innerInnerR = innerR - innerThick;

            // Ensure inner ring doesn't go negative
            if (innerInnerR < 10) innerInnerR = 10;
            if (innerR <= innerInnerR) innerR = innerInnerR + 14;

            var gapRad = degToRad(gapAngle);

            // ── Build segment geometry for hit testing ──
            var segments = [];
            var currentAngle = -Math.PI / 2; // Start at 12 o'clock
            var totalGapOuter = gapRad * categories.length;
            var availableOuter = PI2 - totalGapOuter;
            var i, j, cat, mkt;

            for (i = 0; i < categories.length; i++) {
                cat = categories[i];
                var catSweep = (cat.volume / grandTotal) * availableOuter;
                var catStart = currentAngle;
                var catEnd = currentAngle + catSweep;

                segments.push({
                    type: 'outer',
                    index: i,
                    name: cat.name,
                    volume: cat.volume,
                    color: cat.color,
                    innerR: innerOuterR,
                    outerR: outerR,
                    startAngle: catStart,
                    endAngle: catEnd
                });

                // Inner segments within this category's angle range
                var innerGapTotal = gapRad * cat.markets.length;
                var availableInner = catSweep - innerGapTotal;
                if (availableInner < 0) availableInner = catSweep;
                var innerCurrent = catStart;

                for (j = 0; j < cat.markets.length; j++) {
                    mkt = cat.markets[j];
                    var mktSweep;
                    if (cat.volume > 0) {
                        mktSweep = (mkt.volume / cat.volume) * availableInner;
                    } else {
                        mktSweep = availableInner / cat.markets.length;
                    }
                    var mktStart = innerCurrent;
                    var mktEnd = innerCurrent + mktSweep;

                    segments.push({
                        type: 'inner',
                        index: j,
                        catIndex: i,
                        name: mkt.name,
                        catName: cat.name,
                        volume: mkt.volume,
                        color: mkt.color,
                        parentColor: cat.color,
                        innerR: innerInnerR,
                        outerR: innerR,
                        startAngle: mktStart,
                        endAngle: mktEnd
                    });

                    innerCurrent = mktEnd + gapRad;
                }

                currentAngle = catEnd + gapRad;
            }

            this._segments = segments;
            this._cx = cx;
            this._cy = cy;

            // ── Set up mouse listeners (once) ──
            if (!this._boundMouseMove) {
                var self = this;
                this._boundMouseMove = function(e) {
                    var canvasRect = self.canvas.getBoundingClientRect();
                    var mx = e.clientX - canvasRect.left;
                    var my = e.clientY - canvasRect.top;
                    var hit = null;

                    for (var s = 0; s < self._segments.length; s++) {
                        var seg = self._segments[s];
                        if (pointInArc(mx, my, self._cx, self._cy, seg.innerR, seg.outerR, seg.startAngle, seg.endAngle)) {
                            hit = seg;
                            break;
                        }
                    }

                    if (hit !== self._hoverSegment) {
                        self._hoverSegment = hit;
                        self.invalidateUpdateView();
                    }
                };

                this._boundMouseLeave = function() {
                    if (self._hoverSegment) {
                        self._hoverSegment = null;
                        self.invalidateUpdateView();
                    }
                };

                this.canvas.addEventListener('mousemove', this._boundMouseMove);
                this.canvas.addEventListener('mouseleave', this._boundMouseLeave);
            }

            // ── Clear and draw background ──
            ctx.clearRect(0, 0, w, h);

            // Dark background
            ctx.fillStyle = DARK_BG;
            ctx.fillRect(0, 0, w, h);

            // ── Draw outer ring (categories) ──
            for (i = 0; i < segments.length; i++) {
                var seg = segments[i];
                if (seg.type !== 'outer') continue;

                var fillColor = seg.color;
                if (this._hoverSegment && this._hoverSegment === seg) {
                    fillColor = brightenColor(seg.color, 50);
                } else if (this._hoverSegment && this._hoverSegment.type === 'inner' && this._hoverSegment.catIndex === seg.index) {
                    // Slightly brighten parent when hovering inner segment
                    fillColor = brightenColor(seg.color, 25);
                }

                drawArcSegment(ctx, cx, cy, seg.innerR, seg.outerR, seg.startAngle, seg.endAngle, fillColor);

                // Subtle glow on hover
                if (this._hoverSegment && this._hoverSegment === seg) {
                    ctx.shadowColor = seg.color;
                    ctx.shadowBlur = 12;
                    drawArcSegment(ctx, cx, cy, seg.innerR, seg.outerR, seg.startAngle, seg.endAngle, fillColor);
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                }
            }

            // ── Draw inner ring (markets) ──
            for (i = 0; i < segments.length; i++) {
                var seg = segments[i];
                if (seg.type !== 'inner') continue;

                var fillColor = seg.color;
                if (this._hoverSegment && this._hoverSegment === seg) {
                    fillColor = brightenColor(seg.color, 60);
                }

                drawArcSegment(ctx, cx, cy, seg.innerR, seg.outerR, seg.startAngle, seg.endAngle, fillColor);

                // Subtle glow on hover
                if (this._hoverSegment && this._hoverSegment === seg) {
                    ctx.shadowColor = seg.parentColor;
                    ctx.shadowBlur = 10;
                    drawArcSegment(ctx, cx, cy, seg.innerR, seg.outerR, seg.startAngle, seg.endAngle, fillColor);
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                }
            }

            // ── Draw category labels (outer ring) ──
            if (showLabels) {
                var labelRadius = outerR + Math.max(8, maxRadius * 0.06);
                var labelFontSize = Math.max(9, Math.min(14, Math.min(w, h) * 0.025));

                for (i = 0; i < segments.length; i++) {
                    var seg = segments[i];
                    if (seg.type !== 'outer') continue;

                    var midAngle = (seg.startAngle + seg.endAngle) / 2;
                    var sweepDeg = (seg.endAngle - seg.startAngle) * 180 / Math.PI;

                    // Only draw label if segment is wide enough
                    if (sweepDeg < 8) continue;

                    drawRadialLabel(ctx, cx, cy, labelRadius, midAngle, seg.name, labelFontSize, 'rgba(255,255,255,0.85)');
                }
            }

            // ── Draw inner market labels ──
            if (showInnerLabels) {
                var innerLabelRadius = (innerR + innerInnerR) / 2;
                var innerLabelFontSize = Math.max(7, Math.min(11, Math.min(w, h) * 0.018));

                for (i = 0; i < segments.length; i++) {
                    var seg = segments[i];
                    if (seg.type !== 'inner') continue;

                    var midAngle = (seg.startAngle + seg.endAngle) / 2;
                    var sweepDeg = (seg.endAngle - seg.startAngle) * 180 / Math.PI;

                    // Only draw label if segment is wide enough
                    if (sweepDeg < 10) continue;

                    // Draw text along the arc at midpoint
                    var lx = cx + Math.cos(midAngle) * innerLabelRadius;
                    var ly = cy + Math.sin(midAngle) * innerLabelRadius;

                    ctx.save();
                    ctx.translate(lx, ly);

                    // Rotate text to follow arc, flipping if on left side
                    var rotation = midAngle;
                    var normalizedAngle = midAngle % PI2;
                    if (normalizedAngle < 0) normalizedAngle += PI2;

                    if (normalizedAngle > Math.PI * 0.5 && normalizedAngle < Math.PI * 1.5) {
                        rotation += Math.PI;
                    }

                    ctx.rotate(rotation);
                    ctx.font = innerLabelFontSize + 'px sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(seg.name, 0, 0);
                    ctx.restore();
                }
            }

            // ── Draw center text ──
            if (showCenter) {
                // Total volume number
                var centerFontSize = Math.max(16, Math.min(48, innerInnerR * 0.55));
                ctx.font = 'bold ' + centerFontSize + 'px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(formatNumber(grandTotal), cx, cy - centerFontSize * 0.2);

                // "TOTAL BETS" label
                var subFontSize = Math.max(8, centerFontSize * 0.3);
                ctx.font = '600 ' + subFontSize + 'px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('TOTAL BETS', cx, cy + centerFontSize * 0.45);
            }

            // ── Draw hover tooltip ──
            if (this._hoverSegment) {
                var seg = this._hoverSegment;
                var tooltipText = seg.name + ': ' + formatNumber(seg.volume);
                if (seg.type === 'inner') {
                    tooltipText = seg.catName + ' > ' + seg.name + ': ' + formatNumber(seg.volume);
                }

                var pct = grandTotal > 0 ? ((seg.volume / grandTotal) * 100).toFixed(1) : '0.0';
                tooltipText += ' (' + pct + '%)';

                var tipFontSize = Math.max(10, Math.min(14, Math.min(w, h) * 0.025));
                ctx.font = '600 ' + tipFontSize + 'px sans-serif';
                var tipW = ctx.measureText(tooltipText).width + 20;
                var tipH = tipFontSize + 16;
                var tipX = cx - tipW / 2;
                var tipY = h - tipH - 12;

                // Background pill
                ctx.beginPath();
                var tipR = tipH / 2;
                ctx.moveTo(tipX + tipR, tipY);
                ctx.lineTo(tipX + tipW - tipR, tipY);
                ctx.arcTo(tipX + tipW, tipY, tipX + tipW, tipY + tipR, tipR);
                ctx.lineTo(tipX + tipW, tipY + tipH - tipR);
                ctx.arcTo(tipX + tipW, tipY + tipH, tipX + tipW - tipR, tipY + tipH, tipR);
                ctx.lineTo(tipX + tipR, tipY + tipH);
                ctx.arcTo(tipX, tipY + tipH, tipX, tipY + tipH - tipR, tipR);
                ctx.lineTo(tipX, tipY + tipR);
                ctx.arcTo(tipX, tipY, tipX + tipR, tipY, tipR);
                ctx.closePath();

                ctx.fillStyle = 'rgba(0,0,0,0.75)';
                ctx.fill();
                ctx.strokeStyle = hexToRgba(seg.type === 'inner' ? seg.parentColor : seg.color, 0.5);
                ctx.lineWidth = 1;
                ctx.stroke();

                // Text
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(tooltipText, cx, tipY + tipH / 2);
            }

            // Reset text alignment
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        // ── Custom No-Data Message ──────────────────────────────

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

            // Dark background
            ctx.fillStyle = DARK_BG;
            ctx.fillRect(0, 0, w, h);

            var maxTextW = w * 0.85;
            var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
            var emojiSize = Math.round(fontSize * 1.6);
            var gap = fontSize * 0.5;

            ctx.font = '500 ' + fontSize + 'px sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px sans-serif';
            }

            // Football emoji
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u26BD', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.50)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            if (this._boundMouseMove) {
                this.canvas.removeEventListener('mousemove', this._boundMouseMove);
                this.canvas.removeEventListener('mouseleave', this._boundMouseLeave);
                this._boundMouseMove = null;
                this._boundMouseLeave = null;
            }
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
