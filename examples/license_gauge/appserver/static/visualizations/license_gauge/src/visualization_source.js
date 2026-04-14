/*
 * License Gauge — Splunk Custom Visualization
 *
 * Glass-skeuomorphic arc gauge showing daily Splunk license consumption
 * as a percentage of quota. Matches the indexing pipeline flow visual
 * language: glass tube track, liquid fill, animated particles, glow.
 *
 * Expected SPL columns: used_gb, quota_gb (configurable field names)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var DEG_TO_RAD = Math.PI / 180;
    var ARC_START_DEG = 135;
    var ARC_END_DEG = 405;
    var ARC_START_RAD = ARC_START_DEG * DEG_TO_RAD;
    var ARC_END_RAD = ARC_END_DEG * DEG_TO_RAD;
    var ARC_SWEEP_RAD = ARC_END_RAD - ARC_START_RAD;

    var SPEED_MAP = { slow: 0.3, medium: 0.7, fast: 1.4 };

    var THEMES = {
        default: {
            tubeStroke: 'rgba(100,180,255,0.25)',
            tubeGlass: 'rgba(60,130,220,0.06)',
            liquidLow: '#00d4aa',
            liquidMid: '#ffcc00',
            liquidHigh: '#ff3355',
            particle: 'rgba(100,200,255,0.8)',
            connector: 'rgba(100,180,255,0.15)',
            text: 'rgba(255,255,255,0.6)',
            valueBg: 'rgba(0,0,0,0.3)'
        },
        dark: {
            tubeStroke: 'rgba(80,80,120,0.3)',
            tubeGlass: 'rgba(30,30,60,0.1)',
            liquidLow: '#00b894',
            liquidMid: '#fdcb6e',
            liquidHigh: '#e17055',
            particle: 'rgba(150,150,200,0.7)',
            connector: 'rgba(80,80,120,0.15)',
            text: 'rgba(255,255,255,0.5)',
            valueBg: 'rgba(0,0,0,0.4)'
        },
        neon: {
            tubeStroke: 'rgba(0,255,200,0.3)',
            tubeGlass: 'rgba(0,255,200,0.04)',
            liquidLow: '#00ff88',
            liquidMid: '#ffff00',
            liquidHigh: '#ff0066',
            particle: 'rgba(0,255,200,0.9)',
            connector: 'rgba(0,255,200,0.2)',
            text: 'rgba(0,255,200,0.7)',
            valueBg: 'rgba(0,0,0,0.5)'
        }
    };

    // ── Helper Functions ────────────────────────────────────────

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function parseColor(c) {
        if (c.charAt(0) === '#') {
            return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
        }
        var m = c.match(/(\d+)/g);
        if (m && m.length >= 3) {
            return [parseInt(m[0], 10), parseInt(m[1], 10), parseInt(m[2], 10)];
        }
        return [0, 0, 0];
    }

    function lerpColor(a, b, t) {
        var ac = parseColor(a);
        var bc = parseColor(b);
        var r = Math.round(ac[0] + (bc[0] - ac[0]) * t);
        var g = Math.round(ac[1] + (bc[1] - ac[1]) * t);
        var bl = Math.round(ac[2] + (bc[2] - ac[2]) * t);
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    function getFillColor(pct, warnThresh, critThresh, theme) {
        if (pct >= critThresh) return theme.liquidHigh;
        if (pct >= warnThresh) {
            var t = (pct - warnThresh) / (critThresh - warnThresh);
            return lerpColor(theme.liquidMid, theme.liquidHigh, t);
        }
        if (pct >= warnThresh * 0.5) {
            var t2 = (pct - warnThresh * 0.5) / (warnThresh * 0.5);
            return lerpColor(theme.liquidLow, theme.liquidMid, t2);
        }
        return theme.liquidLow;
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

    function pctToAngle(pct) {
        return ARC_START_RAD + ARC_SWEEP_RAD * (clamp(pct, 0, 100) / 100);
    }

    function pointOnArc(cx, cy, radius, angle) {
        return {
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius
        };
    }

    function initArcParticles(count) {
        var particles = [];
        for (var i = 0; i < count; i++) {
            particles.push({
                pos: Math.random(),
                speed: 0.02 + Math.random() * 0.03,
                size: 1.2 + Math.random() * 1.8,
                alpha: 0.4 + Math.random() * 0.6,
                offset: (Math.random() - 0.5) * 0.6
            });
        }
        return particles;
    }

    // ── Drawing Functions ───────────────────────────────────────

    function drawGlassArcTrack(ctx, cx, cy, radius, lineW, theme) {
        // Glass fill arc (full sweep)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, ARC_START_RAD, ARC_END_RAD, false);
        ctx.strokeStyle = theme.tubeGlass;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Glass border arc (outer edge)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, ARC_START_RAD, ARC_END_RAD, false);
        ctx.strokeStyle = theme.tubeStroke;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Glass highlight — a thin lighter arc along the outer edge
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius + lineW * 0.35, ARC_START_RAD + 0.1, ARC_END_RAD - 0.1, false);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = Math.max(1, lineW * 0.15);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }

    function drawLiquidArc(ctx, cx, cy, radius, lineW, pct, fillColor, showGlow, time) {
        if (pct <= 0) return;

        var fillAngle = pctToAngle(pct);
        var shimmer = 0.85 + Math.sin(time * 3) * 0.05;

        ctx.save();

        // Draw the liquid fill arc with gradient effect (multiple segments)
        var segments = Math.max(8, Math.round(pct * 0.5));
        var segSweep = (fillAngle - ARC_START_RAD) / segments;

        for (var i = 0; i < segments; i++) {
            var segStart = ARC_START_RAD + segSweep * i;
            var segEnd = segStart + segSweep + 0.005; // tiny overlap
            var segT = i / segments;
            var darken = segT * 0.35;
            var segColor = lerpColor(fillColor, '#000000', darken);

            ctx.beginPath();
            ctx.arc(cx, cy, radius, segStart, segEnd, false);
            ctx.strokeStyle = segColor;
            ctx.lineWidth = lineW - 4;
            ctx.lineCap = (i === 0 || i === segments - 1) ? 'round' : 'butt';
            ctx.globalAlpha = shimmer;
            ctx.stroke();
        }

        // Bright leading edge overlay
        ctx.beginPath();
        ctx.arc(cx, cy, radius, ARC_START_RAD, Math.min(fillAngle, ARC_START_RAD + 0.15), false);
        ctx.strokeStyle = fillColor;
        ctx.lineWidth = lineW - 4;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.95;
        ctx.stroke();

        ctx.globalAlpha = 1;

        // Glow effect for high fill
        if (showGlow && pct > 50) {
            var glowIntensity = (pct - 50) / 50;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, ARC_START_RAD, fillAngle, false);
            ctx.strokeStyle = fillColor;
            ctx.lineWidth = lineW - 2;
            ctx.lineCap = 'round';
            ctx.shadowColor = fillColor;
            ctx.shadowBlur = 12 * glowIntensity;
            ctx.globalAlpha = 0.2 * glowIntensity;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    function drawArcParticles(ctx, cx, cy, radius, lineW, pct, particles, time, speed, theme) {
        if (pct <= 0) return;

        var fillAngle = pctToAngle(pct);
        var fillSweep = fillAngle - ARC_START_RAD;

        ctx.save();
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            // Advance particle position
            p.pos += p.speed * speed * 0.016;
            if (p.pos > 1) p.pos -= 1;

            // Map particle position to angle within the filled arc
            var angle = ARC_START_RAD + fillSweep * p.pos;
            var pr = radius + p.offset * (lineW * 0.4);
            var pt = pointOnArc(cx, cy, pr, angle);

            ctx.beginPath();
            ctx.arc(pt.x, pt.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = theme.particle;
            ctx.globalAlpha = p.alpha * (0.6 + Math.sin(time * 4 + i) * 0.4);
            ctx.shadowColor = theme.particle;
            ctx.shadowBlur = 4;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawThresholdTick(ctx, cx, cy, radius, lineW, pct, color) {
        var angle = pctToAngle(pct);
        var innerR = radius - lineW * 0.6;
        var outerR = radius + lineW * 0.6;
        var inner = pointOnArc(cx, cy, innerR, angle);
        var outer = pointOnArc(cx, cy, outerR, angle);

        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(outer.x, outer.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    function drawCenterText(ctx, cx, cy, radius, lineW, pct, usedVal, quotaVal, unit, showLabel, warnThresh, critThresh, theme) {
        // Available space inside the arc (same approach as resource gauge)
        var innerR = radius - lineW / 2 - 4;
        var availCenter = innerR * 2 * 0.85;

        // Font sizes constrained by available center space
        var titleFS = showLabel ? Math.max(8, Math.min(14, availCenter * 0.1)) : 0;
        var pctFS = Math.max(10, Math.min(22, availCenter * 0.17));
        var subFS = Math.max(7, Math.min(12, availCenter * 0.08));

        // Measure total block height
        var titleH = showLabel ? titleFS + 4 : 0;
        var pctH = pctFS + 4;
        var subH = subFS + 2;
        var totalBlockH = titleH + pctH + subH;

        // Vertically center the block
        var blockTopY = cy - totalBlockH / 2;

        // Title: "LICENSE USAGE"
        if (showLabel) {
            ctx.font = '600 ' + titleFS + 'px sans-serif';
            ctx.fillStyle = theme.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('LICENSE USAGE', cx, blockTopY);
        }

        // Percentage value
        var pctStr = Math.round(pct) + '%';
        var fillColor = getFillColor(pct, warnThresh, critThresh, theme);
        ctx.font = 'bold ' + pctFS + 'px monospace';
        ctx.fillStyle = fillColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(pctStr, cx, blockTopY + titleH);

        // Used / Quota sub-text
        ctx.font = subFS + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        var subStr = usedVal.toFixed(2) + ' / ' + quotaVal.toFixed(2) + ' ' + unit;
        ctx.fillText(subStr, cx, blockTopY + titleH + pctH);
    }

    function drawLegend(ctx, w, h, warnThresh, critThresh, theme) {
        var legendFS = Math.max(8, Math.min(11, w * 0.022));
        var legendY = h - Math.max(10, h * 0.04);
        var legendItems = [
            { color: theme.liquidLow, label: 'Normal (<' + warnThresh + '%)' },
            { color: theme.liquidMid, label: 'Warning (' + warnThresh + '-' + critThresh + '%)' },
            { color: theme.liquidHigh, label: 'Critical (>' + critThresh + '%)' }
        ];

        ctx.font = legendFS + 'px sans-serif';
        ctx.textBaseline = 'middle';

        var swatchSize = legendFS;
        var legendPad = legendFS * 0.6;
        var totalLegendW = 0;
        for (var li = 0; li < legendItems.length; li++) {
            totalLegendW += swatchSize + legendPad + ctx.measureText(legendItems[li].label).width;
            if (li < legendItems.length - 1) totalLegendW += legendPad * 2;
        }
        var lx = (w - totalLegendW) / 2;

        for (var lj = 0; lj < legendItems.length; lj++) {
            ctx.fillStyle = legendItems[lj].color;
            ctx.globalAlpha = 0.8;
            ctx.fillRect(lx, legendY - swatchSize / 2, swatchSize, swatchSize);
            ctx.globalAlpha = 1;
            lx += swatchSize + legendPad;
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.textAlign = 'left';
            ctx.fillText(legendItems[lj].label, lx, legendY);
            lx += ctx.measureText(legendItems[lj].label).width + legendPad * 2;
        }
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('license-gauge-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._animTime = 0;
            this._particles = null;
            this._timer = null;
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
                    'Awaiting data \u2014 License Gauge'
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

            // Pass raw data through — field name resolution happens in updateView
            var result = {
                rows: data.rows,
                colIdx: colIdx
            };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Custom no-data message
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                this._stopAnimation();
                return;
            }

            if (!data) {
                if (this._lastGoodData) {
                    data = this._lastGoodData;
                } else {
                    return;
                }
            }

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var colorTheme = config[ns + 'colorTheme'] || 'default';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var warningThreshold = parseInt(config[ns + 'warningThreshold'], 10) || 80;
            var criticalThreshold = parseInt(config[ns + 'criticalThreshold'], 10) || 90;
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var showLabel = (config[ns + 'showLabel'] || 'true') === 'true';
            var usedField = config[ns + 'usedField'] || 'used_gb';
            var quotaField = config[ns + 'quotaField'] || 'quota_gb';
            var unit = config[ns + 'unit'] || 'GB';

            var theme = THEMES[colorTheme] || THEMES['default'];
            var speed = SPEED_MAP[animSpeed] || SPEED_MAP.medium;

            // ── Extract values using configurable field names ──
            var colIdx = data.colIdx;
            var row = data.rows[0];
            var usedVal = 0;
            var quotaVal = 0;

            if (colIdx[usedField] !== undefined) {
                usedVal = parseFloat(row[colIdx[usedField]]);
                if (isNaN(usedVal)) usedVal = 0;
            }
            if (colIdx[quotaField] !== undefined) {
                quotaVal = parseFloat(row[colIdx[quotaField]]);
                if (isNaN(quotaVal)) quotaVal = 0;
            }

            var pct = (quotaVal > 0) ? clamp((usedVal / quotaVal) * 100, 0, 100) : 0;

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

            ctx.clearRect(0, 0, w, h);

            // ── Layout calculations ──
            // Match resource gauge sizing: radius = 42% of smaller dimension
            var minDim = Math.min(w, h);
            var radius = Math.max(40, minDim * 0.42);
            var cx = w / 2;
            var cy = h / 2;

            // Arc line width
            var lineW = Math.max(12, Math.min(40, radius * 0.18));

            // Initialise particles if needed
            var particleCount = Math.max(5, Math.min(8, Math.round(pct / 15)));
            if (!this._particles || this._particles.length !== particleCount) {
                this._particles = initArcParticles(particleCount);
            }

            // ── Draw glass arc track ──
            drawGlassArcTrack(ctx, cx, cy, radius, lineW, theme);

            // ── Draw threshold ticks ──
            drawThresholdTick(ctx, cx, cy, radius, lineW, warningThreshold, theme.liquidMid);
            drawThresholdTick(ctx, cx, cy, radius, lineW, criticalThreshold, theme.liquidHigh);

            // ── Draw liquid fill arc ──
            var fillColor = getFillColor(pct, warningThreshold, criticalThreshold, theme);
            drawLiquidArc(ctx, cx, cy, radius, lineW, pct, fillColor, showGlow, this._animTime);

            // ── Draw particles along the filled arc ──
            drawArcParticles(ctx, cx, cy, radius, lineW, pct, this._particles, this._animTime, speed, theme);

            // ── Draw center text ──
            drawCenterText(ctx, cx, cy, radius, lineW, pct, usedVal, quotaVal, unit, showLabel, warningThreshold, criticalThreshold, theme);

            // ── Draw legend at bottom ──
            drawLegend(ctx, w, h, warningThreshold, criticalThreshold, theme);

            // ── Start animation loop ──
            this._startAnimation();
        },

        _startAnimation: function() {
            if (this._timer) return;
            var self = this;
            this._timer = setInterval(function() {
                self._animTime += 0.016;
                self.invalidateUpdateView();
            }, 50);
        },

        _stopAnimation: function() {
            if (this._timer) {
                clearInterval(this._timer);
                this._timer = null;
            }
        },

        // ── Custom no-data message support ──

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

            ctx.font = '500 ' + fontSize + 'px sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px sans-serif';
            }

            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u23F3', w / 2, h / 2 - fontSize * 0.5 - gap);

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
