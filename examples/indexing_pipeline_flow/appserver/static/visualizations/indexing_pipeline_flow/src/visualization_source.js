/*
 * Indexing Pipeline Flow — Splunk Custom Visualization
 *
 * Animated visualization of Splunk's internal indexing pipeline queues.
 * Renders four pipeline stages (parsing, merging, typing, indexing) as
 * glass tubes with liquid fill levels and animated flow particles.
 *
 * Expected SPL columns: name, fill_pct, avg_size, capacity
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var PIPELINE_ORDER = ['parsingqueue', 'mergingqueue', 'typingqueue', 'indexqueue'];
    var PIPELINE_LABELS = {
        parsingqueue: 'PARSING',
        mergingqueue: 'MERGING',
        typingqueue: 'TYPING',
        indexqueue: 'INDEXING'
    };

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

    // ── Helper functions ────────────────────────────────────────

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

    function drawGlassTube(ctx, x, y, w, h, r, theme) {
        // Outer glass border
        roundRect(ctx, x, y, w, h, r);
        ctx.fillStyle = theme.tubeGlass;
        ctx.fill();
        ctx.strokeStyle = theme.tubeStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Glass highlight (left edge reflection)
        var highlightW = Math.max(2, w * 0.08);
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, x, y, w, h, r);
        ctx.clip();
        var hlGrad = ctx.createLinearGradient(x, y, x + highlightW * 3, y);
        hlGrad.addColorStop(0, 'rgba(255,255,255,0.0)');
        hlGrad.addColorStop(0.3, 'rgba(255,255,255,0.08)');
        hlGrad.addColorStop(0.6, 'rgba(255,255,255,0.03)');
        hlGrad.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = hlGrad;
        ctx.fillRect(x + 2, y, highlightW * 3, h);
        ctx.restore();
    }

    function drawLiquid(ctx, x, y, tubeW, tubeH, r, fillPct, color, showGlow, time) {
        if (fillPct <= 0) return;

        var inset = 3;
        var lx = x + inset;
        var lw = tubeW - inset * 2;
        var lr = Math.max(1, r - inset);
        var maxFillH = tubeH - inset * 2;
        var fillH = maxFillH * (fillPct / 100);
        var ly = y + tubeH - inset - fillH;

        ctx.save();

        // Clip to tube interior
        roundRect(ctx, x + inset, y + inset, lw, maxFillH, lr);
        ctx.clip();

        // Liquid gradient (darker at bottom, lighter at top)
        var lGrad = ctx.createLinearGradient(lx, ly, lx, ly + fillH);
        lGrad.addColorStop(0, color);
        lGrad.addColorStop(0.4, color);
        lGrad.addColorStop(1, lerpColor(color, '#000000', 0.35));
        ctx.fillStyle = lGrad;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(lx, ly, lw, fillH);

        // Animated wave on the liquid surface (compound sine for organic feel)
        var waveAmp = Math.min(6, fillH * 0.15);
        var wavePeriod1 = lw * 0.35;
        var wavePeriod2 = lw * 0.55;

        function waveY(wx, t) {
            return Math.sin((wx / wavePeriod1) * Math.PI * 2 + t * 3.5) * waveAmp
                 + Math.sin((wx / wavePeriod2) * Math.PI * 2 - t * 2.2) * waveAmp * 0.4;
        }

        ctx.beginPath();
        ctx.moveTo(lx, ly + waveY(0, time));
        for (var wx = 1; wx <= lw; wx += 2) {
            ctx.lineTo(lx + wx, ly + waveY(wx, time));
        }
        ctx.lineTo(lx + lw, ly + fillH + 5);
        ctx.lineTo(lx, ly + fillH + 5);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Liquid surface highlight
        ctx.beginPath();
        ctx.moveTo(lx, ly + waveY(0, time));
        for (var sx = 1; sx <= lw; sx += 2) {
            ctx.lineTo(lx + sx, ly + waveY(sx, time));
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Bubble particles inside liquid
        var bubbleCount = Math.max(2, Math.floor(fillPct / 15));
        for (var b = 0; b < bubbleCount; b++) {
            var seed = b * 137.508;
            var bx = lx + (((seed * 7.3) % lw));
            var rawBy = ly + fillH * 0.2 + ((seed * 3.7 + time * 30) % (fillH * 0.7));
            var by = Math.min(rawBy, ly + fillH - 4);
            var br = 1 + (seed % 2);
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fill();
        }

        ctx.restore();

        // Glow effect for high-fill tubes
        if (showGlow && fillPct > 50) {
            var glowIntensity = (fillPct - 50) / 50;
            ctx.shadowColor = color;
            ctx.shadowBlur = 12 * glowIntensity;
            roundRect(ctx, x, y, tubeW, tubeH, r);
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.2 * glowIntensity;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }
    }

    function drawConnector(ctx, x1, y1, x2, y2, pipeH, theme, particles, time, speed) {
        var midY = (y1 + y2) / 2;

        // Connector pipe background
        ctx.fillStyle = theme.connector;
        ctx.fillRect(x1, midY - pipeH / 2, x2 - x1, pipeH);

        // Pipe border
        ctx.strokeStyle = theme.tubeStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, midY - pipeH / 2);
        ctx.lineTo(x2, midY - pipeH / 2);
        ctx.moveTo(x1, midY + pipeH / 2);
        ctx.lineTo(x2, midY + pipeH / 2);
        ctx.stroke();

        // Flow particles
        var pipeLen = x2 - x1;
        for (var p = 0; p < particles.length; p++) {
            var particle = particles[p];
            var px = x1 + ((particle.offset + time * speed * 60) % pipeLen);
            if (px < x1) px += pipeLen;
            if (px > x2) px -= pipeLen;

            var pSize = particle.size;
            ctx.beginPath();
            ctx.arc(px, midY, pSize, 0, Math.PI * 2);
            ctx.fillStyle = theme.particle;
            ctx.globalAlpha = 0.4 + particle.alpha * 0.6;

            ctx.shadowColor = theme.particle;
            ctx.shadowBlur = 4;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
        }
    }

    function drawArrowHead(ctx, x, y, size, theme) {
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.closePath();
        ctx.fillStyle = theme.particle;
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function initParticles(count, pipeLen) {
        var particles = [];
        for (var i = 0; i < count; i++) {
            particles.push({
                offset: Math.random() * pipeLen,
                size: 1.5 + Math.random() * 1.5,
                alpha: 0.3 + Math.random() * 0.7
            });
        }
        return particles;
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('indexing-pipeline-flow-viz');

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
                    'Awaiting data \u2014 Indexing Pipeline Flow'
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

            function getVal(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                var v = parseFloat(row[colIdx[name]]);
                return isNaN(v) ? fallback : v;
            }

            function getStr(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                return row[colIdx[name]] || fallback;
            }

            // Build queue data from all rows
            var queues = {};
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var name = getStr(row, 'name', '');
                if (!name) continue;
                queues[name] = {
                    name: name,
                    fill_pct: clamp(getVal(row, 'fill_pct', 0), 0, 100),
                    avg_size: getVal(row, 'avg_size', 0),
                    capacity: getVal(row, 'capacity', 0)
                };
            }

            var result = { queues: queues };
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
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var colorTheme = config[ns + 'colorTheme'] || 'default';
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var showValues = (config[ns + 'showValues'] || 'true') === 'true';
            var warningThreshold = parseInt(config[ns + 'warningThreshold'], 10) || 70;
            var criticalThreshold = parseInt(config[ns + 'criticalThreshold'], 10) || 85;
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';

            var theme = THEMES[colorTheme] || THEMES['default'];
            var speed = SPEED_MAP[animSpeed] || SPEED_MAP.medium;

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
            var stageCount = PIPELINE_ORDER.length;
            var arrowPad = 30;
            var padX = Math.max(16, w * 0.03);
            var padY = Math.max(16, h * 0.08);
            var labelH = showLabels ? Math.max(20, h * 0.1) : 0;
            var valueH = showValues ? Math.max(18, h * 0.07) : 0;
            var connectorW = Math.max(16, w * 0.04);
            var totalConnW = connectorW * (stageCount - 1);
            var availW = w - padX * 2 - arrowPad - totalConnW;
            var tubeW = Math.min(availW / stageCount, h * 0.55);
            var tubeH = h - padY * 2 - labelH - valueH;
            tubeH = Math.max(60, Math.min(tubeH, 300));
            var tubeR = Math.min(12, tubeW * 0.15);

            // Center pipeline horizontally
            var pipelineW = tubeW * stageCount + connectorW * (stageCount - 1);
            var startX = Math.max(padX + arrowPad, (w - pipelineW) / 2);
            var tubeY = padY + valueH;

            // Connector pipe height
            var pipeH = Math.max(6, tubeH * 0.06);

            // Initialise particles for connectors if not done
            if (!this._particles || this._particles.length !== stageCount - 1) {
                this._particles = [];
                for (var p = 0; p < stageCount - 1; p++) {
                    this._particles.push(initParticles(6, connectorW));
                }
            }

            // ── Draw title ──
            var titleFS = Math.max(10, Math.min(16, w * 0.025));
            ctx.font = '600 ' + titleFS + 'px sans-serif';
            ctx.fillStyle = theme.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('INDEXING PIPELINE', w / 2, Math.max(4, padY * 0.2));

            // ── Draw input arrow ──
            var firstTubeX = startX;
            var arrowX = firstTubeX - 14;
            var arrowY = tubeY + tubeH / 2;
            ctx.fillStyle = theme.connector;
            ctx.fillRect(arrowX - 16, arrowY - pipeH / 2, 16, pipeH);
            drawArrowHead(ctx, firstTubeX - 4, arrowY, pipeH * 0.8, theme);

            // ── Draw each stage ──
            for (var s = 0; s < stageCount; s++) {
                var queueName = PIPELINE_ORDER[s];
                var queueData = data.queues[queueName] || { name: queueName, fill_pct: 0, avg_size: 0, capacity: 0 };
                var fillPct = queueData.fill_pct;

                var tx = startX + s * (tubeW + connectorW);
                var ty = tubeY;

                // Fill color based on thresholds
                var fillColor = getFillColor(fillPct, warningThreshold, criticalThreshold, theme);

                // Visual fill: always show at least 5% liquid so tubes look alive
                var visualFill = Math.max(5, fillPct);

                // Draw glass tube
                drawGlassTube(ctx, tx, ty, tubeW, tubeH, tubeR, theme);

                // Draw liquid (visual fill for rendering, real % for label)
                drawLiquid(ctx, tx, ty, tubeW, tubeH, tubeR, visualFill, fillColor, showGlow, this._animTime);

                // Draw fill percentage on tube
                if (showValues) {
                    var valFS = Math.max(10, Math.min(22, tubeW * 0.28));
                    var valStr = Math.round(fillPct) + '%';

                    // Background pill for readability
                    ctx.font = 'bold ' + valFS + 'px monospace';
                    var valW = ctx.measureText(valStr).width + 12;
                    var valH2 = valFS + 6;
                    var valX = tx + tubeW / 2 - valW / 2;
                    var valY = ty + tubeH / 2 - valH2 / 2;
                    roundRect(ctx, valX, valY, valW, valH2, 4);
                    ctx.fillStyle = theme.valueBg;
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    if (showGlow && fillPct >= criticalThreshold) {
                        ctx.shadowColor = fillColor;
                        ctx.shadowBlur = 8;
                    }
                    ctx.fillText(valStr, tx + tubeW / 2, ty + tubeH / 2);
                    ctx.shadowBlur = 0;
                }

                // Draw label below tube
                if (showLabels) {
                    var labelFS = Math.max(9, Math.min(14, tubeW * 0.16));
                    ctx.font = '600 ' + labelFS + 'px sans-serif';
                    ctx.fillStyle = theme.text;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(PIPELINE_LABELS[queueName] || queueName, tx + tubeW / 2, ty + tubeH + 6);

                    // Size info
                    if (queueData.capacity > 0) {
                        var sizeFS = Math.max(7, labelFS * 0.75);
                        ctx.font = sizeFS + 'px sans-serif';
                        ctx.fillStyle = 'rgba(255,255,255,0.3)';
                        var sizeStr = Math.round(queueData.avg_size) + ' / ' + Math.round(queueData.capacity) + ' KB';
                        ctx.fillText(sizeStr, tx + tubeW / 2, ty + tubeH + 6 + labelFS + 2);
                    }
                }

                // Draw connector to next stage
                if (s < stageCount - 1) {
                    var cx1 = tx + tubeW;
                    var cx2 = cx1 + connectorW;
                    var cy = ty + tubeH / 2;
                    drawConnector(ctx, cx1, cy, cx2, cy, pipeH, theme, this._particles[s], this._animTime, speed);
                }
            }

            // ── Draw output arrow ──
            var lastTubeX = startX + (stageCount - 1) * (tubeW + connectorW);
            var outX = lastTubeX + tubeW;
            ctx.fillStyle = theme.connector;
            ctx.fillRect(outX, arrowY - pipeH / 2, 16, pipeH);
            drawArrowHead(ctx, outX + 18, arrowY, pipeH * 0.8, theme);

            // ── Draw legend ──
            var legendFS = Math.max(8, Math.min(11, w * 0.018));
            var legendY = h - Math.max(8, padY * 0.4);
            var legendItems = [
                { color: theme.liquidLow, label: 'Normal (<' + warningThreshold + '%)' },
                { color: theme.liquidMid, label: 'Warning (' + warningThreshold + '-' + criticalThreshold + '%)' },
                { color: theme.liquidHigh, label: 'Critical (>' + criticalThreshold + '%)' }
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
            ctx.fillStyle = 'rgba(255,255,255,0.50)';
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
