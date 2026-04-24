/*
 * Data Pipeline — Splunk Custom Visualization
 *
 * Animated data pipeline showing ingestion volume flowing from sources
 * into Splunk. Sources appear as labeled nodes on the left, connected
 * by glowing bezier-curve streams to a central ">" chevron. Stream
 * width and particle density scale with volume.
 *
 * Expected SPL columns: name (string), volume (number)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Color helpers ───────────────────────────────────────────

    function parseHex(hex) {
        hex = hex.replace('#', '');
        return {
            r: parseInt(hex.substring(0, 2), 16) || 0,
            g: parseInt(hex.substring(2, 4), 16) || 0,
            b: parseInt(hex.substring(4, 6), 16) || 0
        };
    }

    function lerpRGB(c1, c2, t) {
        return {
            r: Math.round(c1.r + (c2.r - c1.r) * t),
            g: Math.round(c1.g + (c2.g - c1.g) * t),
            b: Math.round(c1.b + (c2.b - c1.b) * t)
        };
    }

    function rgb(c) {
        return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
    }

    function rgba(c, a) {
        return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
    }

    // ── Geometry helpers ────────────────────────────────────────

    function bezierPt(t, p0, c1, c2, p3) {
        var u = 1 - t;
        var uu = u * u;
        var uuu = uu * u;
        var tt = t * t;
        var ttt = tt * t;
        return {
            x: uuu * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + ttt * p3.x,
            y: uuu * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + ttt * p3.y
        };
    }

    // ── Formatting helpers ──────────────────────────────────────

    function formatVol(val, unit) {
        if (unit === 'bytes') {
            if (val >= 1e12) return (val / 1e12).toFixed(1) + ' TB';
            if (val >= 1e9) return (val / 1e9).toFixed(1) + ' GB';
            if (val >= 1e6) return (val / 1e6).toFixed(1) + ' MB';
            if (val >= 1e3) return (val / 1e3).toFixed(1) + ' KB';
            return Math.round(val) + ' B';
        }
        if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
        if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
        if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
        return Math.round(val).toString();
    }

    function truncText(ctx, text, maxW) {
        if (ctx.measureText(text).width <= maxW) return text;
        var t = text;
        while (t.length > 2 && ctx.measureText(t + '\u2026').width > maxW) {
            t = t.substring(0, t.length - 1);
        }
        return t + '\u2026';
    }

    // ── Drawing helpers ─────────────────────────────────────────

    function drawPipePath(ctx, p0, c1, c2, p3) {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
    }

    function drawChevron(ctx, x, y, size, color, pulse) {
        ctx.save();
        ctx.shadowColor = rgb(color);
        ctx.shadowBlur = 12 * pulse;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size * 0.7, y);
        ctx.lineTo(x, y + size);
        ctx.strokeStyle = rgba(color, 0.85 * pulse);
        ctx.lineWidth = Math.max(2.5, size * 0.12);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawSourceDot(ctx, x, y, radius, color) {
        ctx.save();
        ctx.shadowColor = rgb(color);
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = rgb(color);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawParticle(ctx, x, y, radius, color, glowSize) {
        ctx.save();
        ctx.shadowColor = rgb(color);
        ctx.shadowBlur = glowSize;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = rgba(color, 0.9);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // ── Visualization ───────────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('data-pipeline-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._particles = null;
            this._animTimer = null;
            this._tick = 0;
            this._sourceCount = 0;
            this._lastAnimSpeed = null;
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
                    'Awaiting data \u2014 Data Pipeline'
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
                if (statusVal) return { _status: statusVal };
            }

            var result = { colIdx: colIdx, rows: data.rows };
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

            var ns = this.getPropertyNamespaceInfo().propertyNamespace;

            // ── Read settings ──
            var nameField   = config[ns + 'nameField']   || 'name';
            var volumeField = config[ns + 'volumeField'] || 'volume';
            var maxSources  = parseInt(config[ns + 'maxSources'], 10) || 10;
            var animSpeed   = config[ns + 'animSpeed']   || 'medium';
            var showVolume  = (config[ns + 'showVolume']  || 'true') === 'true';
            var showChevron = (config[ns + 'showChevron'] || 'true') === 'true';
            var showTotal   = (config[ns + 'showTotal']   || 'true') === 'true';
            var colorLow    = config[ns + 'colorLow']    || '#00B4D8';
            var colorHigh   = config[ns + 'colorHigh']   || '#65A637';
            var volumeUnit  = config[ns + 'volumeUnit']  || 'events';

            var cLow = parseHex(colorLow);
            var cHigh = parseHex(colorHigh);

            // ── Extract sources ──
            var colIdx = data.colIdx;
            var rows = data.rows;
            var sources = [];
            var total = 0;

            for (var i = 0; i < rows.length && sources.length < maxSources; i++) {
                var nm = colIdx[nameField] !== undefined
                    ? (rows[i][colIdx[nameField]] || 'unknown') : 'src_' + i;
                var vol = colIdx[volumeField] !== undefined
                    ? parseFloat(rows[i][colIdx[volumeField]]) : 0;
                if (isNaN(vol)) vol = 0;
                sources.push({ name: nm, volume: vol });
                total += vol;
            }

            sources.sort(function(a, b) { return b.volume - a.volume; });

            // ── Canvas sizing ──
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

            var n = sources.length;
            if (n === 0) return;

            // ── Layout ──
            var labelMaxW = Math.min(w * 0.2, 150);
            var leftPad = labelMaxW + 30;
            var rightPad = w * 0.14;
            var topPad = h * 0.07;
            var botPad = h * 0.07;
            var pipeStartX = leftPad;
            var pipeEndX = w - rightPad;
            var chevX = pipeEndX + 10;
            var chevY = h / 2;
            var availH = h - topPad - botPad;
            var spacing = n > 1 ? availH / (n - 1) : 0;
            var maxVol = sources[0].volume || 1;

            // Pipe thickness range
            var minThick = Math.max(1.5, h * 0.006);
            var maxThick = Math.max(4, Math.min(h * 0.04, availH / n * 0.4));

            // Speed
            var speedMap = { slow: 0.002, medium: 0.005, fast: 0.012 };
            var baseSpd = speedMap[animSpeed] || 0.005;

            // ── Initialize / reset particles ──
            var needReset = !this._particles
                || this._sourceCount !== n
                || this._lastAnimSpeed !== animSpeed;

            if (needReset) {
                this._particles = [];
                for (var s = 0; s < n; s++) {
                    var frac = maxVol > 0 ? sources[s].volume / maxVol : 0;
                    var nParts = Math.max(4, Math.round(14 * frac));
                    var pArr = [];
                    for (var p = 0; p < nParts; p++) {
                        pArr.push({
                            t: Math.random(),
                            spd: baseSpd * (0.6 + Math.random() * 0.8),
                            size: 0.7 + Math.random() * 0.6
                        });
                    }
                    this._particles.push(pArr);
                }
                this._sourceCount = n;
                this._lastAnimSpeed = animSpeed;
            }

            // Advance particles
            for (var s = 0; s < n; s++) {
                var pArr = this._particles[s];
                if (!pArr) continue;
                for (var p = 0; p < pArr.length; p++) {
                    pArr[p].t += pArr[p].spd;
                    if (pArr[p].t > 1) pArr[p].t -= 1;
                }
            }

            this._tick++;

            // ── Font sizes ──
            var nameFontSize = Math.max(9, Math.min(14, availH / n * 0.35));
            var volFontSize = Math.max(8, nameFontSize - 2);

            // ── Draw subtle background grid dots ──
            var gridSpacing = Math.max(20, Math.min(40, w * 0.03));
            ctx.fillStyle = 'rgba(255,255,255,0.015)';
            for (var gx = gridSpacing; gx < w; gx += gridSpacing) {
                for (var gy = gridSpacing; gy < h; gy += gridSpacing) {
                    ctx.beginPath();
                    ctx.arc(gx, gy, 0.6, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // ── Draw pipes and particles ──
            for (var s = 0; s < n; s++) {
                var src = sources[s];
                var frac = maxVol > 0 ? src.volume / maxVol : 0;
                var srcY = n === 1 ? h / 2 : topPad + s * spacing;
                var thick = minThick + (maxThick - minThick) * frac;
                var color = lerpRGB(cLow, cHigh, frac);

                // Bezier control points — smooth S-curve converging to chevron
                var p0 = { x: pipeStartX, y: srcY };
                var p3 = { x: pipeEndX, y: chevY };
                var c1 = { x: pipeStartX + (pipeEndX - pipeStartX) * 0.45, y: srcY };
                var c2 = { x: pipeStartX + (pipeEndX - pipeStartX) * 0.55, y: chevY };

                // Outer pipe glow (wide, very transparent)
                drawPipePath(ctx, p0, c1, c2, p3);
                ctx.strokeStyle = rgba(color, 0.06);
                ctx.lineWidth = thick * 3;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Main pipe body (semi-transparent)
                drawPipePath(ctx, p0, c1, c2, p3);
                ctx.strokeStyle = rgba(color, 0.13);
                ctx.lineWidth = thick;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Inner highlight line
                drawPipePath(ctx, p0, c1, c2, p3);
                ctx.strokeStyle = rgba(color, 0.06);
                ctx.lineWidth = Math.max(1, thick * 0.3);
                ctx.stroke();

                // Particles
                var pArr = this._particles[s];
                if (pArr) {
                    for (var p = 0; p < pArr.length; p++) {
                        var pt = bezierPt(pArr[p].t, p0, c1, c2, p3);
                        var pRadius = Math.max(1.2, thick * 0.3 * pArr[p].size);
                        drawParticle(ctx, pt.x, pt.y, pRadius, color, pRadius * 4);
                    }
                }

                // Source dot
                var dotR = Math.max(3, thick * 0.5);
                drawSourceDot(ctx, pipeStartX - 8, srcY, dotR, color);

                // Source label
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';

                if (showVolume) {
                    var lineGap = volFontSize + 3;
                    // Name
                    ctx.font = nameFontSize + 'px sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.75)';
                    var dispName = truncText(ctx, src.name, labelMaxW);
                    ctx.fillText(dispName, pipeStartX - 18, srcY - lineGap * 0.3);
                    // Volume
                    ctx.font = volFontSize + 'px monospace';
                    ctx.fillStyle = rgba(color, 0.65);
                    ctx.fillText(formatVol(src.volume, volumeUnit), pipeStartX - 18, srcY + lineGap * 0.55);
                } else {
                    ctx.font = nameFontSize + 'px sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.75)';
                    var dispName = truncText(ctx, src.name, labelMaxW);
                    ctx.fillText(dispName, pipeStartX - 18, srcY);
                }
            }

            // ── Chevron ──
            if (showChevron) {
                var chevSize = Math.max(14, Math.min(w * 0.04, h * 0.12));
                var pulse = 0.7 + 0.3 * Math.sin(this._tick * 0.06);
                drawChevron(ctx, chevX, chevY, chevSize, cHigh, pulse);

                // Second, outer chevron for depth
                ctx.globalAlpha = 0.15 * pulse;
                drawChevron(ctx, chevX - 6, chevY, chevSize * 1.15, cHigh, 1);
                ctx.globalAlpha = 1;
            }

            // ── Total ──
            if (showTotal) {
                var totalFontSize = Math.max(10, Math.min(18, h * 0.05));
                var chevSize2 = showChevron ? Math.max(14, Math.min(w * 0.04, h * 0.12)) : 0;
                var totalY = chevY + chevSize2 + 16;

                ctx.textAlign = 'center';

                // Value
                ctx.font = 'bold ' + totalFontSize + 'px monospace';
                ctx.fillStyle = 'rgba(255,255,255,0.65)';
                ctx.textBaseline = 'top';
                ctx.fillText(formatVol(total, volumeUnit), chevX + chevSize2 * 0.35, totalY);

                // Label
                ctx.font = (totalFontSize - 3) + 'px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.28)';
                ctx.fillText('total', chevX + chevSize2 * 0.35, totalY + totalFontSize + 3);
            }

            // Reset text alignment
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';

            // ── Start animation ──
            if (!this._animTimer) {
                var self = this;
                var fpsMap = { slow: 24, medium: 30, fast: 45 };
                var fps = fpsMap[animSpeed] || 30;
                this._animTimer = setInterval(function() {
                    self.invalidateUpdateView();
                }, 1000 / fps);
            }
        },

        // ── No-data rendering ───────────────────────────────────

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

        // ── Lifecycle ───────────────────────────────────────────

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            if (this._animTimer) {
                clearInterval(this._animTimer);
                this._animTimer = null;
            }
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
