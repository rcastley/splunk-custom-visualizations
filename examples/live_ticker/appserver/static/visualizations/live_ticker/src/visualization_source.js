/*
 * Live Ticker — Splunk Custom Visualization
 *
 * Broadcast-style horizontal scrolling ticker showing the most recent
 * events with configurable field labels and a live time-ago indicator.
 *
 * Expected SPL columns: _time, plus up to 4 configurable fields
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helpers ──────────────────────────────────────────────────

    function hexToRgba(hex, alpha) {
        if (!hex || hex === 'transparent') return 'rgba(0,0,0,0)';
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        var r = parseInt(hex.slice(0, 2), 16);
        var g = parseInt(hex.slice(2, 4), 16);
        var b = parseInt(hex.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function formatTimeAgo(epochSeconds) {
        if (!epochSeconds || isNaN(epochSeconds)) return '';
        var now = Date.now() / 1000;
        var diff = Math.max(0, Math.floor(now - epochSeconds));
        if (diff < 60) return diff + 's ago';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
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

    // ── Visualization ───────────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('live-ticker-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._scrollOffset = 0;
            this._lastFrame = 0;
            this._animating = false;
            this._pulsePhase = 0;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 50
            };
        },

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Live Ticker'
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

            var result = { colIdx: colIdx, rows: data.rows };
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
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            // ── Read settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var title = config[ns + 'title'] || '.conf25';
            var bgColor = config[ns + 'bgColor'] || '#1a1a2e';
            var textColor = config[ns + 'textColor'] || '#ffffff';
            var accentColor = config[ns + 'accentColor'] || '#e20082';
            var separatorColor = config[ns + 'separatorColor'] || '#444466';
            var scrollSpeed = config[ns + 'scrollSpeed'] || 'medium';

            var fieldNames = [];
            var fieldLabels = [];
            for (var fi = 1; fi <= 4; fi++) {
                var fn = config[ns + 'field' + fi] || '';
                var fl = config[ns + 'label' + fi] || '';
                if (fn) {
                    fieldNames.push(fn);
                    fieldLabels.push(fl);
                }
            }
            // Defaults if no fields configured
            if (fieldNames.length === 0) {
                fieldNames = ['size', 'lanyard', 'host', 'location'];
                fieldLabels = ['Size', 'Lanyard', 'Host', 'Location'];
            }

            var speedMap = { slow: 30, medium: 60, fast: 100 };
            var pxPerSec = speedMap[scrollSpeed] || 60;

            // ── Build entries from rows (most recent first) ──
            var colIdx = data.colIdx;
            var rows = data.rows;
            var entries = [];
            var maxEntries = Math.min(20, rows.length);

            // Rows are oldest-first; reverse to get most recent first
            for (var ri = rows.length - 1; ri >= Math.max(0, rows.length - maxEntries); ri--) {
                var row = rows[ri];
                var parts = [];
                for (var fi2 = 0; fi2 < fieldNames.length; fi2++) {
                    var idx = colIdx[fieldNames[fi2]];
                    if (idx !== undefined && row[idx]) {
                        var val = row[idx];
                        if (fieldLabels[fi2]) {
                            parts.push(fieldLabels[fi2] + ': ' + val);
                        } else {
                            parts.push(val);
                        }
                    }
                }
                var timeVal = 0;
                if (colIdx._time !== undefined) {
                    timeVal = parseFloat(row[colIdx._time]) || 0;
                }
                var timeAgoStr = formatTimeAgo(timeVal);
                if (timeAgoStr) {
                    parts.push(timeAgoStr);
                }
                if (parts.length > 0) {
                    entries.push({ text: parts.join('  \u2022  '), time: timeVal });
                }
            }

            if (entries.length === 0) return;

            // ── Size canvas ──
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

            // ── Store render state for animation ──
            this._renderState = {
                w: w, h: h, dpr: dpr,
                title: title,
                bgColor: bgColor,
                textColor: textColor,
                accentColor: accentColor,
                separatorColor: separatorColor,
                entries: entries,
                pxPerSec: pxPerSec
            };

            // Start animation loop if not running
            if (!this._animating) {
                this._animating = true;
                this._lastFrame = performance.now();
                this._startAnimLoop();
            }

            this._drawFrame(performance.now());
        },

        _startAnimLoop: function() {
            var self = this;
            function loop(ts) {
                if (!self._animating) return;
                self._drawFrame(ts);
                self._rafId = requestAnimationFrame(loop);
            }
            self._rafId = requestAnimationFrame(loop);
        },

        _drawFrame: function(timestamp) {
            var s = this._renderState;
            if (!s) return;

            var dt = (timestamp - this._lastFrame) / 1000;
            this._lastFrame = timestamp;
            this._scrollOffset += s.pxPerSec * dt;
            this._pulsePhase += dt * 2.5;

            var dpr = s.dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;

            // Reset transform
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);

            var w = s.w;
            var h = s.h;
            var entries = s.entries;

            // ── Background ──
            ctx.clearRect(0, 0, w, h);
            if (s.bgColor !== 'transparent') {
                ctx.fillStyle = s.bgColor;
                ctx.fillRect(0, 0, w, h);
            }

            // ── Layout ──
            var fontSize = Math.max(10, Math.min(48, h * 0.28));
            var titleFontSize = Math.max(11, Math.min(56, h * 0.32));
            var badgeFontSize = Math.max(8, Math.min(32, h * 0.18));
            var titlePadX = Math.max(10, w * 0.015);
            var cy = h / 2;

            // ── Title section (left) ──
            ctx.font = 'bold ' + titleFontSize + 'px sans-serif';
            var titleW = ctx.measureText(s.title).width;

            // LIVE badge
            var badgeText = 'LIVE';
            ctx.font = 'bold ' + badgeFontSize + 'px sans-serif';
            var badgeTextW = ctx.measureText(badgeText).width;
            var badgePadX = badgeFontSize * 0.5;
            var badgePadY = badgeFontSize * 0.3;
            var badgeW = badgeTextW + badgePadX * 2;
            var badgeH = badgeFontSize + badgePadY * 2;

            var titleSectionW = titlePadX + titleW + 8 + badgeW + titlePadX;

            // Draw title
            ctx.font = 'bold ' + titleFontSize + 'px sans-serif';
            ctx.fillStyle = s.accentColor;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.title, titlePadX, cy);

            // Draw LIVE badge with pulse
            var pulseAlpha = 0.7 + 0.3 * Math.sin(this._pulsePhase * Math.PI);
            var badgeX = titlePadX + titleW + 8;
            var badgeY = cy - badgeH / 2;
            ctx.globalAlpha = pulseAlpha;
            ctx.fillStyle = s.accentColor;
            roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.font = 'bold ' + badgeFontSize + 'px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, badgeX + badgeW / 2, cy);

            // ── Separator line ──
            var sepX = titleSectionW;
            ctx.beginPath();
            ctx.moveTo(sepX, h * 0.15);
            ctx.lineTo(sepX, h * 0.85);
            ctx.strokeStyle = s.separatorColor;
            ctx.lineWidth = 1;
            ctx.stroke();

            // ── Scrolling ticker area ──
            var tickerX = sepX + titlePadX;
            var tickerW = w - tickerX;

            ctx.save();
            ctx.beginPath();
            ctx.rect(tickerX, 0, tickerW, h);
            ctx.clip();

            // Measure total content width
            ctx.font = fontSize + 'px sans-serif';
            var entryGap = fontSize * 3;
            var dotSep = '  \u25CF  ';
            var dotW = ctx.measureText(dotSep).width;
            var totalContentW = 0;

            var entryWidths = [];
            for (var ei = 0; ei < entries.length; ei++) {
                var ew = ctx.measureText(entries[ei].text).width;
                entryWidths.push(ew);
                totalContentW += ew;
                if (ei < entries.length - 1) totalContentW += dotW;
            }
            totalContentW += entryGap; // gap before loop restarts

            // Wrap scroll offset
            if (totalContentW > 0) {
                this._scrollOffset = this._scrollOffset % totalContentW;
            }

            // Draw entries twice for seamless loop
            for (var pass = 0; pass < 2; pass++) {
                var drawX = tickerX + tickerW - this._scrollOffset + pass * totalContentW;

                for (var di = 0; di < entries.length; di++) {
                    // Skip if completely off-screen
                    if (drawX > tickerX + tickerW + 100) { drawX += entryWidths[di] + dotW; continue; }
                    if (drawX + entryWidths[di] < tickerX - 100) { drawX += entryWidths[di] + dotW; continue; }

                    // Draw entry text
                    ctx.font = fontSize + 'px sans-serif';
                    ctx.fillStyle = s.textColor;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(entries[di].text, drawX, cy);

                    drawX += entryWidths[di];

                    // Draw dot separator
                    if (di < entries.length - 1) {
                        ctx.fillStyle = s.accentColor;
                        ctx.fillText(dotSep, drawX, cy);
                        drawX += dotW;
                    }
                }
            }

            ctx.restore();

            // ── Edge fade gradients ──
            var fadeW = Math.min(40, tickerW * 0.08);
            if (s.bgColor !== 'transparent') {
                // Left fade
                var gradL = ctx.createLinearGradient(tickerX, 0, tickerX + fadeW, 0);
                gradL.addColorStop(0, s.bgColor);
                gradL.addColorStop(1, hexToRgba(s.bgColor, 0));
                ctx.fillStyle = gradL;
                ctx.fillRect(tickerX, 0, fadeW, h);

                // Right fade
                var gradR = ctx.createLinearGradient(w - fadeW, 0, w, 0);
                gradR.addColorStop(0, hexToRgba(s.bgColor, 0));
                gradR.addColorStop(1, s.bgColor);
                ctx.fillStyle = gradR;
                ctx.fillRect(w - fadeW, 0, fadeW, h);
            }

            // ── Top/bottom accent lines ──
            ctx.fillStyle = s.accentColor;
            ctx.fillRect(0, 0, w, 2);
            ctx.fillRect(0, h - 2, w, 2);
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
            this._animating = false;
            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
