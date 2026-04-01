/*
 * Liability Exposure Gauge — Splunk Custom Visualization
 *
 * Multi-ring concentric gauge showing liability exposure across different
 * betting outcomes. Rings fill proportionally to exposure/threshold with
 * color transitioning green → yellow → red. Pulsing glow on danger rings.
 * Center displays aggregate exposure with RAG status color.
 *
 * Expected SPL columns: category (required), exposure (required), threshold (required), status (optional)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var PI2 = Math.PI * 2;
    var ARC_START_DEG = 135;   // bottom-left, sweep clockwise
    var ARC_SWEEP_DEG = 270;   // 270-degree arc (leaving a gap at the bottom)
    var ANIM_INTERVAL = 50;

    // ── Helper Functions (pure, no `this`) ──────────────────────

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function degToRad(deg) {
        return deg * Math.PI / 180;
    }

    function lerpColor(a, b, t) {
        var ar = parseInt(a.slice(1, 3), 16);
        var ag = parseInt(a.slice(3, 5), 16);
        var ab = parseInt(a.slice(5, 7), 16);
        var br = parseInt(b.slice(1, 3), 16);
        var bg = parseInt(b.slice(3, 5), 16);
        var bb = parseInt(b.slice(5, 7), 16);
        var r = Math.round(ar + (br - ar) * t);
        var g = Math.round(ag + (bg - ag) * t);
        var bl = Math.round(ab + (bb - ab) * t);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
    }

    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function formatCurrency(n) {
        var abs = Math.abs(n);
        var s;
        if (abs >= 1000000) {
            s = (n / 1000000).toFixed(1) + 'M';
        } else if (abs >= 1000) {
            s = (n / 1000).toFixed(0) + 'K';
        } else {
            s = Math.round(n).toString();
        }
        return s;
    }

    function formatFullNumber(n) {
        var s = Math.round(n).toString();
        var result = '';
        for (var i = s.length - 1, c = 0; i >= 0; i--, c++) {
            if (c > 0 && c % 3 === 0) result = ',' + result;
            result = s[i] + result;
        }
        return result;
    }

    function getStatusColor(pct, warnPct, safeColor, warnColor, dangerColor) {
        if (pct >= 1.0) return dangerColor;
        if (pct >= warnPct) {
            var t = (pct - warnPct) / (1.0 - warnPct);
            return lerpColor(warnColor, dangerColor, clamp(t, 0, 1));
        }
        if (pct >= warnPct * 0.5) {
            var t2 = (pct - warnPct * 0.5) / (warnPct * 0.5);
            return lerpColor(safeColor, warnColor, clamp(t2, 0, 1));
        }
        return safeColor;
    }

    function getWorstStatus(items, warnPct) {
        var worst = 'ok';
        for (var i = 0; i < items.length; i++) {
            var st = items[i].status;
            if (st === 'critical') return 'critical';
            if (st === 'warning' && worst === 'ok') worst = 'warning';
            // Also check percentage
            if (items[i].pct >= 1.0) return 'critical';
            if (items[i].pct >= warnPct && worst === 'ok') worst = 'warning';
        }
        return worst;
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    // ── Draw a single arc ring ──────────────────────────────────

    function drawArcRing(ctx, cx, cy, radius, thickness, fillPct, color, glowIntensity, showPulse) {
        var startRad = degToRad(ARC_START_DEG);
        var fullSweep = degToRad(ARC_SWEEP_DEG);
        var fillSweep = fullSweep * clamp(fillPct, 0, 1.0);

        // Allow overfill up to 100% of the arc (cap at full sweep)
        if (fillPct > 1.0) {
            fillSweep = fullSweep;
        }

        // Background track
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startRad, startRad + fullSweep);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Filled arc
        if (fillSweep > 0) {
            // Pulse glow for danger rings
            if (showPulse && fillPct >= 0.8) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 8 + glowIntensity * 16;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startRad, startRad + fillSweep);
            ctx.strokeStyle = color;
            ctx.lineWidth = thickness;
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.8 + 0.2 * glowIntensity;
            ctx.stroke();

            ctx.globalAlpha = 1;
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }
    }

    // ── Draw threshold tick marks ───────────────────────────────

    function drawTickMark(ctx, cx, cy, radius, thickness, pctPosition, color) {
        var startRad = degToRad(ARC_START_DEG);
        var fullSweep = degToRad(ARC_SWEEP_DEG);
        var angle = startRad + fullSweep * clamp(pctPosition, 0, 1);

        var innerR = radius - thickness / 2 - 2;
        var outerR = radius + thickness / 2 + 2;

        var x1 = cx + innerR * Math.cos(angle);
        var y1 = cy + innerR * Math.sin(angle);
        var x2 = cx + outerR * Math.cos(angle);
        var y2 = cy + outerR * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'butt';
        ctx.stroke();
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('liability-gauge-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._pulsePhase = 0;
            this._timer = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 100
            };
        },

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Liability Exposure Gauge'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Check for _status message from appendpipe fallback
            if (colIdx._status !== undefined) {
                var lastRow = data.rows[data.rows.length - 1];
                var statusVal = lastRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            // Validate required columns
            if (colIdx.category === undefined || colIdx.exposure === undefined || colIdx.threshold === undefined) {
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: category, exposure, threshold'
                );
            }

            // Build array of category items
            var items = [];
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var cat = row[colIdx.category];
                var exp = parseFloat(row[colIdx.exposure]);
                var thr = parseFloat(row[colIdx.threshold]);

                if (!cat || isNaN(exp) || isNaN(thr) || thr <= 0) continue;

                var pct = exp / thr;
                var status = 'ok';
                if (colIdx.status !== undefined && row[colIdx.status]) {
                    status = row[colIdx.status];
                } else if (pct >= 1.0) {
                    status = 'critical';
                } else if (pct >= 0.7) {
                    status = 'warning';
                }

                items.push({
                    category: cat,
                    exposure: exp,
                    threshold: thr,
                    pct: pct,
                    status: status
                });
            }

            var result = { items: items };
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

            if (!data || !data.items) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            var items = data.items;
            if (!items || items.length === 0) return;

            // ── Read settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var safeColor = config[ns + 'safeColor'] || '#00cc66';
            var warnColor = config[ns + 'warnColor'] || '#ffaa00';
            var dangerColor = config[ns + 'dangerColor'] || '#ff3333';
            var warnThreshold = parseInt(config[ns + 'warnThreshold'], 10) || 70;
            var showValues = (config[ns + 'showValues'] || 'true') === 'true';
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var ringGap = parseInt(config[ns + 'ringGap'], 10) || 8;
            var showPulse = (config[ns + 'showPulse'] || 'true') === 'true';

            var warnPct = warnThreshold / 100;

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

            // ── Manage animation timer ──
            if (showPulse) {
                this._startAnimation();
            } else {
                this._stopAnimation();
            }

            // Update pulse phase
            this._pulsePhase += 0.06;
            var glowIntensity = 0.3 + 0.7 * Math.abs(Math.sin(this._pulsePhase));

            // ── Clear & background ──
            ctx.clearRect(0, 0, w, h);

            // Dark background
            var bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
            bgGrad.addColorStop(0, '#1a1a2e');
            bgGrad.addColorStop(1, '#0a0a14');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, w, h);

            // ── Calculate ring dimensions ──
            var numRings = items.length;
            var maxRadius = Math.min(w, h) * 0.42;
            var minRadius = Math.min(w, h) * 0.14;
            var availableSpace = maxRadius - minRadius;
            var ringThickness = Math.max(6, Math.min(24, (availableSpace - ringGap * (numRings - 1)) / numRings));

            // Recalculate to fit with the computed thickness
            var totalRingSpace = numRings * ringThickness + (numRings - 1) * ringGap;
            var startRadius = minRadius + (availableSpace - totalRingSpace) / 2 + totalRingSpace;

            // ── Draw rings from outside in ──
            for (var i = 0; i < numRings; i++) {
                var item = items[i];
                var radius = startRadius - i * (ringThickness + ringGap);
                var fillPct = clamp(item.pct, 0, 1.15); // allow slight overfill visual
                var ringColor = getStatusColor(item.pct, warnPct, safeColor, warnColor, dangerColor);

                // Draw the arc ring
                drawArcRing(ctx, cx, cy, radius, ringThickness, fillPct, ringColor, glowIntensity, showPulse);

                // Draw threshold tick marks
                // Warning tick
                drawTickMark(ctx, cx, cy, radius, ringThickness, warnPct, 'rgba(255,255,255,0.25)');
                // 100% (danger) tick
                drawTickMark(ctx, cx, cy, radius, ringThickness, 1.0, 'rgba(255,255,255,0.4)');

                // ── Category label (left side) ──
                if (showLabels) {
                    var labelAngle = degToRad(ARC_START_DEG) - degToRad(10);
                    var labelR = radius + ringThickness / 2 + 6;
                    var labelX = cx + labelR * Math.cos(labelAngle);
                    var labelY = cy + labelR * Math.sin(labelAngle);

                    var labelFontSize = Math.max(8, Math.min(13, ringThickness * 0.8));
                    ctx.font = '500 ' + labelFontSize + 'px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'rgba(255,255,255,0.55)';
                    ctx.fillText(item.category, labelX, labelY);
                }

                // ── Exposure value at end of fill ──
                if (showValues) {
                    var valuePct = clamp(item.pct, 0, 1.0);
                    var valueAngle = degToRad(ARC_START_DEG) + degToRad(ARC_SWEEP_DEG) * valuePct;
                    var valueR = radius + ringThickness / 2 + 8;
                    var valueX = cx + valueR * Math.cos(valueAngle);
                    var valueY = cy + valueR * Math.sin(valueAngle);

                    var valueFontSize = Math.max(7, Math.min(11, ringThickness * 0.65));
                    ctx.font = 'bold ' + valueFontSize + 'px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = ringColor;
                    ctx.fillText(formatCurrency(item.exposure), valueX, valueY);
                }
            }

            // ── Center: total aggregate exposure ──
            var totalExposure = 0;
            for (var j = 0; j < items.length; j++) {
                totalExposure += items[j].exposure;
            }

            var worstStatus = getWorstStatus(items, warnPct);
            var centerColor;
            if (worstStatus === 'critical') {
                centerColor = dangerColor;
            } else if (worstStatus === 'warning') {
                centerColor = warnColor;
            } else {
                centerColor = safeColor;
            }

            // Center glow
            var centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, minRadius * 0.9);
            centerGlow.addColorStop(0, hexToRgba(centerColor, 0.12 * glowIntensity));
            centerGlow.addColorStop(0.6, hexToRgba(centerColor, 0.04 * glowIntensity));
            centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = centerGlow;
            ctx.beginPath();
            ctx.arc(cx, cy, minRadius * 0.9, 0, PI2);
            ctx.fill();

            // Total exposure number
            var totalFontSize = Math.max(14, Math.min(42, minRadius * 0.55));
            ctx.font = 'bold ' + totalFontSize + 'px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Pulse glow on center text if critical
            if (showPulse && worstStatus === 'critical') {
                ctx.shadowColor = centerColor;
                ctx.shadowBlur = 10 + glowIntensity * 14;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            ctx.fillStyle = centerColor;
            ctx.fillText(formatCurrency(totalExposure), cx, cy - totalFontSize * 0.15);

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // "TOTAL EXPOSURE" label
            var totalLabelSize = Math.max(7, totalFontSize * 0.28);
            ctx.font = '600 ' + totalLabelSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillText('TOTAL EXPOSURE', cx, cy + totalFontSize * 0.4);

            // Status badge
            var statusText = worstStatus.toUpperCase();
            var badgeFontSize = Math.max(7, totalFontSize * 0.24);
            ctx.font = 'bold ' + badgeFontSize + 'px sans-serif';
            var badgeW = ctx.measureText(statusText).width + badgeFontSize * 2;
            var badgeH = badgeFontSize * 2;
            var badgeX = cx - badgeW / 2;
            var badgeY = cy + totalFontSize * 0.65;

            roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
            ctx.fillStyle = hexToRgba(centerColor, 0.2);
            ctx.fill();
            ctx.strokeStyle = hexToRgba(centerColor, 0.5);
            ctx.lineWidth = 1;
            roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
            ctx.stroke();

            ctx.fillStyle = centerColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(statusText, cx, badgeY + badgeH / 2);

            // ── Title at top ──
            var titleFontSize = Math.max(10, Math.min(18, w * 0.025));
            ctx.font = '600 ' + titleFontSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText('LIABILITY EXPOSURE', cx, 12);

            // ── Legend at bottom ──
            var legendY = h - 20;
            var legendFontSize = Math.max(7, Math.min(11, w * 0.016));
            var dotR = legendFontSize * 0.4;
            var legendItems = [
                { label: 'Safe', color: safeColor },
                { label: 'Warning', color: warnColor },
                { label: 'Danger', color: dangerColor }
            ];
            var totalLegendW = 0;
            ctx.font = '500 ' + legendFontSize + 'px sans-serif';
            for (var li = 0; li < legendItems.length; li++) {
                totalLegendW += dotR * 2 + 4 + ctx.measureText(legendItems[li].label).width;
                if (li < legendItems.length - 1) totalLegendW += 16;
            }
            var legendX = cx - totalLegendW / 2;
            for (var lj = 0; lj < legendItems.length; lj++) {
                // Dot
                ctx.beginPath();
                ctx.arc(legendX + dotR, legendY, dotR, 0, PI2);
                ctx.fillStyle = legendItems[lj].color;
                ctx.fill();
                legendX += dotR * 2 + 4;

                // Label
                ctx.font = '500 ' + legendFontSize + 'px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText(legendItems[lj].label, legendX, legendY);
                legendX += ctx.measureText(legendItems[lj].label).width + 16;
            }

            // Reset text alignment
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        // ── Animation Timer ─────────────────────────────────────

        _startAnimation: function() {
            if (this._timer) return;
            var self = this;
            this._timer = setInterval(function() {
                self.invalidateUpdateView();
            }, ANIM_INTERVAL);
        },

        _stopAnimation: function() {
            if (this._timer) {
                clearInterval(this._timer);
                this._timer = null;
            }
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
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

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
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            this._stopAnimation();
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
