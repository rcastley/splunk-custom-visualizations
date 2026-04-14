/*
 * Gauge — Splunk Custom Visualization
 *
 * Multi-mode gauge with arc, donut, bar, and status display modes.
 * Segmented color zones, tick marks, needle, glow effects, and
 * optional LED indicator row.
 *
 * Expected SPL columns: any numeric column (configurable via Field Name setting)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var ARC_START_DEG = 135;    // bottom-left
    var ARC_END_DEG = 405;      // bottom-right (270° sweep)
    var ARC_SWEEP_DEG = 270;
    var DEG_TO_RAD = Math.PI / 180;

    // Color scheme presets
    var COLOR_SCHEMES = {
        teal_red: [
            { stop: 0.0,  color: '#00d2be' },
            { stop: 0.3,  color: '#00d2be' },
            { stop: 0.5,  color: '#ffffff' },
            { stop: 0.75, color: '#ff8700' },
            { stop: 1.0,  color: '#e10600' }
        ],
        green_red_stepped: [
            { stop: 0.0,  color: '#00c853' },
            { stop: 0.4,  color: '#00c853' },
            { stop: 0.6,  color: '#ffeb3b' },
            { stop: 0.8,  color: '#ff8700' },
            { stop: 0.95, color: '#e10600' },
            { stop: 1.0,  color: '#ff0040' }
        ],
        green_red: [
            { stop: 0.0,  color: '#00c853' },
            { stop: 0.5,  color: '#00c853' },
            { stop: 0.75, color: '#ffeb3b' },
            { stop: 0.9,  color: '#ff8700' },
            { stop: 1.0,  color: '#e10600' }
        ],
        green_red_early: [
            { stop: 0.0,  color: '#00c853' },
            { stop: 0.3,  color: '#00c853' },
            { stop: 0.5,  color: '#ffeb3b' },
            { stop: 0.7,  color: '#ff8700' },
            { stop: 1.0,  color: '#e10600' }
        ],
        red_green: [
            { stop: 0.0,  color: '#e10600' },
            { stop: 0.2,  color: '#ff8700' },
            { stop: 0.4,  color: '#ffeb3b' },
            { stop: 0.6,  color: '#00c853' },
            { stop: 1.0,  color: '#00c853' }
        ],
        blue_red: [
            { stop: 0.0,  color: '#00b4d8' },
            { stop: 0.3,  color: '#00d2be' },
            { stop: 0.5,  color: '#ffeb3b' },
            { stop: 0.75, color: '#ff8700' },
            { stop: 1.0,  color: '#e10600' }
        ],
        blue_green_red: [
            { stop: 0.0,  color: '#00b4d8' },
            { stop: 0.4,  color: '#00c853' },
            { stop: 0.6,  color: '#00c853' },
            { stop: 0.8,  color: '#ff8700' },
            { stop: 1.0,  color: '#e10600' }
        ],
        severity: [
            { stop: 0.0,  color: '#00c853' },
            { stop: 0.3,  color: '#00c853' },
            { stop: 0.5,  color: '#ffeb3b' },
            { stop: 0.7,  color: '#ff8700' },
            { stop: 0.85, color: '#e10600' },
            { stop: 1.0,  color: '#ff0040' }
        ]
    };

    var GAUGE_FONT = 'sans-serif';
    var GAUGE_MONO = 'monospace';

    // ── Helper functions ────────────────────────────────────────

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function degToRad(deg) {
        return deg * DEG_TO_RAD;
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
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    function getSchemeColor(stops, t) {
        t = clamp(t, 0, 1);
        for (var i = 0; i < stops.length - 1; i++) {
            if (t >= stops[i].stop && t <= stops[i + 1].stop) {
                var range = stops[i + 1].stop - stops[i].stop;
                var local = range > 0 ? (t - stops[i].stop) / range : 0;
                return lerpColor(stops[i].color, stops[i + 1].color, local);
            }
        }
        return stops[stops.length - 1].color;
    }

    function formatValue(val) {
        return Math.round(val).toLocaleString('en-US');
    }

    function drawSegmentedArc(ctx, cx, cy, radius, arcWidth, pct, stops, totalSegments, showGlow) {
        var gapDeg = 1.2;
        var segSweep = (ARC_SWEEP_DEG - gapDeg * (totalSegments - 1)) / totalSegments;
        var filledSegments = Math.round(pct * totalSegments);

        for (var i = 0; i < totalSegments; i++) {
            var segStart = ARC_START_DEG + i * (segSweep + gapDeg);
            var segEnd = segStart + segSweep;
            var startRad = degToRad(segStart);
            var endRad = degToRad(segEnd);
            var segT = (i + 0.5) / totalSegments;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startRad, endRad, false);
            ctx.lineWidth = arcWidth;
            ctx.lineCap = 'butt';

            if (i < filledSegments) {
                var color = getSchemeColor(stops, segT);
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.85 + 0.15 * (i / totalSegments);

                if (showGlow && i >= filledSegments - 3 && filledSegments > 0) {
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 8 + (i - (filledSegments - 3)) * 4;
                }

                ctx.stroke();
                ctx.shadowBlur = 0;
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.globalAlpha = 1;
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    function drawTicks(ctx, cx, cy, outerR, innerR, maxVal, majorCount) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;

        var step = maxVal / majorCount;
        for (var i = 0; i <= majorCount; i++) {
            var t = i / majorCount;
            var deg = ARC_START_DEG + t * ARC_SWEEP_DEG;
            var rad = degToRad(deg);
            var cos = Math.cos(rad);
            var sin = Math.sin(rad);

            var tickLen = outerR * 0.08;
            var x1 = cx + (outerR + 4) * cos;
            var y1 = cy + (outerR + 4) * sin;
            var x2 = cx + (outerR + 4 + tickLen) * cos;
            var y2 = cy + (outerR + 4 + tickLen) * sin;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            var label = String(Math.round(i * step));
            var labelR = outerR + 4 + tickLen + 10;
            var lx = cx + labelR * cos;
            var ly = cy + labelR * sin;

            var fontSize = Math.max(9, Math.min(13, outerR * 0.1));
            ctx.font = fontSize + 'px ' + GAUGE_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, lx, ly);
        }

        var minorCount = majorCount * 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        for (var j = 0; j <= minorCount; j++) {
            if (j % 2 === 0) continue;
            var mt = j / minorCount;
            var mdeg = ARC_START_DEG + mt * ARC_SWEEP_DEG;
            var mrad = degToRad(mdeg);
            var mcos = Math.cos(mrad);
            var msin = Math.sin(mrad);

            var minorLen = outerR * 0.04;
            var mx1 = cx + (outerR + 4) * mcos;
            var my1 = cy + (outerR + 4) * msin;
            var mx2 = cx + (outerR + 4 + minorLen) * mcos;
            var my2 = cy + (outerR + 4 + minorLen) * msin;

            ctx.beginPath();
            ctx.moveTo(mx1, my1);
            ctx.lineTo(mx2, my2);
            ctx.stroke();
        }
    }

    function drawNeedle(ctx, cx, cy, radius, pct) {
        var deg = ARC_START_DEG + pct * ARC_SWEEP_DEG;
        var rad = degToRad(deg);
        var needleLen = radius * 0.85;
        var tipX = cx + needleLen * Math.cos(rad);
        var tipY = cy + needleLen * Math.sin(rad);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(tipX, tipY);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
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

    function drawHorizontalBar(ctx, x, y, w, h, pad, pct, rawVal, maxValue, unit, label, stops, showGlow, fontSizeOverride) {
        var barSegments = 20;
        var gap = 2;
        var valueFontSize = fontSizeOverride > 0 ? fontSizeOverride : Math.max(10, Math.min(32, h * 0.25));
        var textBarGap = 4;
        var barH = Math.max(10, Math.min(24, h * 0.18));

        var totalContentH = valueFontSize + textBarGap + barH;
        var startY = (h - totalContentH) / 2;

        var barX = x + pad;
        var barW = w - pad * 2;

        if (label) {
            ctx.font = valueFontSize + 'px ' + GAUGE_FONT;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(label.toUpperCase(), barX + 2, startY);
        }

        var valueStr = Math.round(rawVal).toLocaleString('en-US');
        if (unit) valueStr += ' ' + unit;

        var tipColor = getSchemeColor(stops, pct);
        if (showGlow && pct > 0.1) {
            ctx.shadowColor = tipColor;
            ctx.shadowBlur = Math.max(10, valueFontSize * 0.3);
        }
        ctx.font = 'bold ' + valueFontSize + 'px ' + GAUGE_MONO;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(valueStr, barX + barW - 2, startY);
        ctx.shadowBlur = 0;

        var barY = startY + valueFontSize + textBarGap;
        var segW = (barW - gap * (barSegments - 1)) / barSegments;
        var filledSegs = Math.round(pct * barSegments);

        for (var i = 0; i < barSegments; i++) {
            var sx = barX + i * (segW + gap);
            var segT = (i + 0.5) / barSegments;

            if (i < filledSegs) {
                var color = getSchemeColor(stops, segT);
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.7 + 0.3 * (i / Math.max(filledSegs, 1));

                if (showGlow && i >= filledSegs - 3 && filledSegs > 0) {
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 6 + (i - (filledSegs - 3)) * 3;
                }
            } else {
                ctx.fillStyle = '#1a1a2e';
                ctx.globalAlpha = 0.5;
                ctx.shadowBlur = 0;
            }

            ctx.fillRect(sx, barY, segW, barH);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        roundRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // LED indicator colors: 5 green, 5 red, 5 purple
    var LED_COLORS = [
        '#00cc66', '#00cc66', '#00cc66', '#00cc66', '#00cc66',
        '#ff3333', '#ff3333', '#ff3333', '#ff3333', '#ff3333',
        '#9933ff', '#9933ff', '#9933ff', '#9933ff', '#9933ff'
    ];

    function drawLedIndicators(ctx, cx, cy, radius, pct, count, tickMargin) {
        var arcSpan = 120;
        var startDeg = -90 - arcSpan / 2;
        var dotR = Math.max(3, radius * 0.03);
        var lightsR = radius + tickMargin + dotR + 4;
        var filledCount = Math.round(pct * count);

        for (var i = 0; i < count; i++) {
            var t = (i + 0.5) / count;
            var deg = startDeg + t * arcSpan;
            var rad = degToRad(deg);
            var x = cx + lightsR * Math.cos(rad);
            var y = cy + lightsR * Math.sin(rad);

            ctx.beginPath();
            ctx.arc(x, y, dotR, 0, Math.PI * 2);

            if (i < filledCount) {
                var color = LED_COLORS[i] || '#9933ff';
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.9;
                ctx.shadowColor = color;
                ctx.shadowBlur = 6;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
            }

            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('gauge-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
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
                    'Awaiting data \u2014 Gauge'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            var row = data.rows[data.rows.length - 1];
            var result = {
                colIdx: colIdx,
                row: row
            };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) {
                    data = this._lastGoodData;
                } else {
                    this._drawNoData();
                    return;
                }
            }

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var displayMode = config[ns + 'displayMode'] || 'arc';
            var fieldName = config[ns + 'field'] || 'value';
            var maxValue = parseInt(config[ns + 'maxValue'], 10) || 100;
            var unit = config[ns + 'unit'] !== undefined ? config[ns + 'unit'] : '%';
            var label = config[ns + 'label'] || '';
            var colorScheme = config[ns + 'colorScheme'] || 'teal_red';
            var showTicks = (config[ns + 'showTicks'] || 'true') === 'true';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var fontSizeOverride = parseInt(config[ns + 'fontSize'], 10) || 0;
            var alignment = config[ns + 'alignment'] || 'center';
            var labelAlign = config[ns + 'labelAlign'] || 'center';
            var showLeds = (config[ns + 'showLeds'] || 'false') === 'true';
            var ledField = config[ns + 'ledField'] || 'led_percent';

            var stops = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.teal_red;

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

            var rawVal = 0;
            if (data.colIdx[fieldName] !== undefined) {
                var v = parseFloat(data.row[data.colIdx[fieldName]]);
                if (!isNaN(v)) rawVal = v;
            }

            var value = clamp(rawVal, 0, maxValue);
            var pct = value / maxValue;

            // ── Bar mode ──
            if (displayMode === 'bar') {
                drawHorizontalBar(ctx, 0, 0, w, h, Math.max(10, w * 0.04), pct, rawVal, maxValue, unit, label, stops, showGlow, fontSizeOverride);
                return;
            }

            // ── Status mode ──
            if (displayMode === 'status') {
                var sPad = Math.max(10, w * 0.04);
                var scx = alignment === 'left' ? sPad : alignment === 'right' ? w - sPad : w / 2;
                var scy = h / 2;
                var activeColor = '#00c853';
                var inactiveColor = 'rgba(255,255,255,0.15)';
                var ACTIVE_WORDS = {
                    'open': 1, 'on': 1, 'yes': 1, 'true': 1, 'active': 1,
                    'enabled': 1, '1': 1
                };

                var rawStr = '';
                if (data.colIdx[fieldName] !== undefined) {
                    rawStr = String(data.row[data.colIdx[fieldName]] || '');
                }

                var isActive;
                var numVal = parseFloat(rawStr);
                if (!isNaN(numVal)) {
                    isActive = numVal >= 1;
                } else {
                    isActive = ACTIVE_WORDS.hasOwnProperty(rawStr.toLowerCase());
                }

                var statusText;
                if (rawStr && isNaN(numVal)) {
                    statusText = rawStr.toUpperCase();
                } else {
                    statusText = label || fieldName.toUpperCase();
                }

                var sLabelFS = 0;
                var sLabelH = 0;
                if (label && rawStr && isNaN(numVal)) {
                    sLabelFS = Math.max(8, Math.min(w * 0.08, h * 0.12));
                    sLabelH = sLabelFS * 1.6;
                }

                var sFS = fontSizeOverride > 0 ? fontSizeOverride : Math.max(12, Math.min(48, Math.min(w * 0.25, h * 0.35)));
                var pillPadY = sFS * 0.4;
                var pillW = w - sPad * 2;
                var pillH = sFS + pillPadY * 2;
                var pillX = alignment === 'left' ? sPad : alignment === 'right' ? w - sPad - pillW : scx - pillW / 2;
                var pillY = scy - pillH / 2 + sLabelH / 2;
                var pillR = Math.min(pillH * 0.3, 12);
                var pillCX = pillX + pillW / 2;

                if (sLabelFS > 0) {
                    ctx.font = sLabelFS + 'px ' + GAUGE_FONT;
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.textAlign = labelAlign;
                    ctx.textBaseline = 'bottom';
                    var sLabelX = labelAlign === 'left' ? pillX : labelAlign === 'right' ? pillX + pillW : pillCX;
                    ctx.fillText(label.toUpperCase(), sLabelX, pillY - 6);
                }

                roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
                if (isActive) {
                    ctx.fillStyle = activeColor;
                    ctx.globalAlpha = 0.15;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.strokeStyle = activeColor;
                    ctx.lineWidth = 2;
                    if (showGlow) {
                        ctx.shadowColor = activeColor;
                        ctx.shadowBlur = Math.max(10, sFS * 0.3);
                    }
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                } else {
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                    ctx.fill();
                    ctx.strokeStyle = inactiveColor;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                ctx.font = 'bold ' + sFS + 'px ' + GAUGE_MONO;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (isActive) {
                    ctx.fillStyle = activeColor;
                    if (showGlow) {
                        ctx.shadowColor = activeColor;
                        ctx.shadowBlur = Math.max(10, sFS * 0.3);
                    }
                } else {
                    ctx.fillStyle = inactiveColor;
                }
                ctx.fillText(statusText, pillCX, pillY + pillH / 2);
                ctx.shadowBlur = 0;

                if (unit) {
                    var sUnitFS = Math.max(8, sFS * 0.35);
                    ctx.font = sUnitFS + 'px ' + GAUGE_FONT;
                    ctx.fillStyle = isActive ? 'rgba(0,200,83,0.6)' : 'rgba(255,255,255,0.25)';
                    ctx.textAlign = 'center';
                    ctx.fillText(unit, pillCX, pillY + pillH + sUnitFS * 1.2);
                }
                return;
            }

            // ── Donut mode ──
            if (displayMode === 'donut') {
                var dcx = w / 2;
                var dLabelReserve = label ? 28 : 0;
                var dMargin = Math.max(10, Math.min(w, h) * 0.08);
                var dRadius = Math.max(30, (Math.min(w, h) / 2) - dMargin - dLabelReserve / 2);
                var dArcW = Math.max(12, dRadius * 0.25);
                var dcy = h / 2 + dLabelReserve / 2;

                drawSegmentedArc(ctx, dcx, dcy, dRadius, dArcW, 0, stops, 40, false);
                drawSegmentedArc(ctx, dcx, dcy, dRadius, dArcW, pct, stops, 40, showGlow);

                var dValFS = fontSizeOverride > 0 ? fontSizeOverride : Math.max(12, Math.min(60, dRadius * 0.45));
                var dValueStr = formatValue(rawVal);
                var dTipColor = getSchemeColor(stops, pct);
                if (showGlow && pct > 0.1) {
                    ctx.shadowColor = dTipColor;
                    ctx.shadowBlur = Math.max(10, dValFS * 0.3);
                }
                ctx.font = 'bold ' + dValFS + 'px ' + GAUGE_MONO;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(dValueStr, dcx, dcy);
                ctx.shadowBlur = 0;

                var dUnitFS = Math.max(8, dValFS * 0.35);
                ctx.font = dUnitFS + 'px ' + GAUGE_FONT;
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.fillText(unit, dcx, dcy + dValFS * 0.55 + dUnitFS * 0.5);

                if (label) {
                    var dLabelFS = Math.max(8, Math.min(20, dRadius * 0.13));
                    ctx.font = dLabelFS + 'px ' + GAUGE_FONT;
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.textBaseline = 'top';
                    ctx.textAlign = labelAlign;
                    var dLabelPad = Math.max(10, w * 0.04);
                    var dLabelX = labelAlign === 'left' ? dLabelPad : labelAlign === 'right' ? w - dLabelPad : dcx;
                    ctx.fillText(label.toUpperCase(), dLabelX, 4);
                }
                return;
            }

            // ── Arc gauge mode ──

            var cx = w / 2;
            var tickMargin = showTicks ? Math.max(35, Math.min(55, w * 0.12)) : Math.max(15, w * 0.05);
            var hasLeds = showLeds;
            var sinArcEnd = 0.71;
            var bottomPad = showTicks ? 25 : 10;
            var labelReserve = label ? 28 : 0;

            var topExtra = tickMargin + (hasLeds ? 20 : 0) + 8 + labelReserve;
            var maxRadiusFromH = (h - topExtra - bottomPad) / (1 + sinArcEnd);
            var maxRadius = Math.min(w / 2 - tickMargin, maxRadiusFromH);
            var radius = Math.max(40, maxRadius);
            var arcWidth = Math.max(8, Math.min(20, radius * 0.12));

            var arcOuter = radius + arcWidth / 2;
            var topExtent = arcOuter + (showTicks ? arcOuter * 0.08 + 22 : 4);
            if (hasLeds) {
                var dotR = Math.max(3, radius * 0.03);
                topExtent = Math.max(topExtent, arcOuter + (showTicks ? tickMargin : 8) + dotR * 2 + 4);
            }
            var cy = topExtent + 8 + labelReserve;
            cy = Math.min(cy, h - radius * sinArcEnd - bottomPad);
            cy = Math.max(cy, topExtent + 8 + labelReserve);
            var segmentCount = 40;

            drawSegmentedArc(ctx, cx, cy, radius, arcWidth, 0, stops, segmentCount, false);
            drawSegmentedArc(ctx, cx, cy, radius, arcWidth, pct, stops, segmentCount, showGlow);

            if (showTicks) {
                var majorCount = this._getMajorTickCount(maxValue);
                drawTicks(ctx, cx, cy, radius + arcWidth / 2, radius - arcWidth / 2, maxValue, majorCount);
            }

            if (showLeds) {
                var ledPct = 0;
                if (data.colIdx[ledField] !== undefined) {
                    var rlv = parseFloat(data.row[data.colIdx[ledField]]);
                    if (!isNaN(rlv)) ledPct = clamp(rlv, 0, 100) / 100;
                }
                drawLedIndicators(ctx, cx, cy, radius, ledPct, 15, showTicks ? tickMargin : 8);
            }

            drawNeedle(ctx, cx, cy, radius - arcWidth / 2, pct);

            // ── Center readout ──
            var valueFontSize = fontSizeOverride > 0 ? fontSizeOverride : Math.max(12, Math.min(72, radius * 0.4));
            var valueStr = formatValue(rawVal);

            var tipColor = getSchemeColor(stops, pct);
            if (showGlow && pct > 0.1) {
                ctx.shadowColor = tipColor;
                ctx.shadowBlur = Math.max(10, valueFontSize * 0.3);
            }

            ctx.font = 'bold ' + valueFontSize + 'px ' + GAUGE_MONO;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(valueStr, cx, cy);
            ctx.shadowBlur = 0;

            var unitFontSize = Math.max(8, Math.min(18, radius * 0.12));
            ctx.font = unitFontSize + 'px ' + GAUGE_FONT;
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText(unit, cx, cy + valueFontSize * 0.55 + unitFontSize * 0.5);

            if (label) {
                var labelFontSize = Math.max(8, Math.min(20, radius * 0.13));
                ctx.font = labelFontSize + 'px ' + GAUGE_FONT;
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.textBaseline = 'top';
                ctx.textAlign = labelAlign;
                var lPad = Math.max(10, w * 0.04);
                var labelX = labelAlign === 'left' ? lPad : labelAlign === 'right' ? w - lPad : cx;
                ctx.fillText(label.toUpperCase(), labelX, 4);
            }
        },

        _getMajorTickCount: function(maxValue) {
            if (maxValue <= 10) return maxValue;
            if (maxValue <= 50) return 5;
            if (maxValue <= 200) return 4;
            if (maxValue <= 400) return 8;
            if (maxValue <= 1000) return 10;
            if (maxValue <= 5000) return 5;
            if (maxValue <= 15000) return 5;
            return 10;
        },

        _drawNoData: function() {
            var rect = this.el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            ctx.clearRect(0, 0, rect.width, rect.height);

            var fontSize = Math.max(12, Math.min(16, rect.width * 0.04));
            ctx.font = fontSize + 'px ' + GAUGE_FONT;
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Gauge \u2014 Waiting for data', rect.width / 2, rect.height / 2 - fontSize);
            ctx.font = (fontSize * 0.8) + 'px ' + GAUGE_FONT;
            ctx.fillText('Set Field Name in Format options to match your search', rect.width / 2, rect.height / 2 + fontSize * 0.5);
        },

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

            ctx.font = '500 ' + fontSize + 'px ' + GAUGE_FONT;
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                ctx.font = '500 ' + fontSize + 'px ' + GAUGE_FONT;
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
