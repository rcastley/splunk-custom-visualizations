/*
 * F1 ERS Energy — Splunk Custom Visualization
 *
 * Renders an F1-style Energy Recovery System display with:
 *   - Battery bar colored by deploy mode
 *   - Percentage readout
 *   - Deploy mode badge (None / Medium / Hotlap / Overtake)
 *   - Harvest (MGU-K + MGU-H) vs Deploy stats
 *
 * Expected SPL columns:
 *   ers_store_energy             — current energy in joules (max 4,000,000 = 4MJ)
 *   ers_deploy_mode              — 0=None, 1=Medium, 2=Hotlap, 3=Overtake
 *   ers_harvested_this_lap_mguk  — energy harvested from MGU-K this lap (joules)
 *   ers_harvested_this_lap_mguh  — energy harvested from MGU-H this lap (joules)
 *   ers_deployed_this_lap        — energy deployed this lap (joules)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var MAX_ERS_JOULES = 4000000; // 4 MJ

    var DEPLOY_MODES = [
        { label: 'NONE',     color: '#555555' },
        { label: 'MEDIUM',   color: '#00d2be' },
        { label: 'HOTLAP',   color: '#ff8700' },
        { label: 'OVERTAKE', color: '#e10600' }
    ];

    var F1_FONT = "'Formula1', sans-serif";
    var F1_MONO = "'Formula1', monospace";

    // ── Helper functions ────────────────────────────────────────

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function formatEnergy(joules) {
        if (joules >= 1000000) {
            return (joules / 1000000).toFixed(2) + ' MJ';
        }
        if (joules >= 1000) {
            return (joules / 1000).toFixed(0) + ' kJ';
        }
        return Math.round(joules) + ' J';
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

    function batteryColor(overallPct, modeColor) {
        // Red only when overall charge is critically low
        if (overallPct <= 0.15) {
            return lerpColor('#661111', '#cc2222', overallPct / 0.15);
        }
        return modeColor;
    }

    function drawBatterySegments(ctx, x, y, w, h, pct, modeColor, radius, showGlow) {
        var segmentCount = 20;
        var gap = 2;
        var segW = (w - gap * (segmentCount - 1)) / segmentCount;
        var filledSegments = Math.round(pct * segmentCount);
        var color = batteryColor(pct, modeColor);

        for (var i = 0; i < segmentCount; i++) {
            var sx = x + i * (segW + gap);

            if (i < filledSegments) {
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.7 + 0.3 * (i / filledSegments);

                // Glow on leading edge segments
                if (showGlow && i >= filledSegments - 3 && filledSegments > 0) {
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 6 + (i - (filledSegments - 3)) * 3;
                }
            } else {
                ctx.fillStyle = '#1a1a2e';
                ctx.globalAlpha = 0.5;
                ctx.shadowBlur = 0;
            }

            ctx.fillRect(sx, y, segW, h);
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
    }

    function drawModeBadge(ctx, cx, cy, label, color, fontSize) {
        ctx.font = 'bold ' + fontSize + 'px ' + F1_FONT;
        var textWidth = ctx.measureText(label).width;
        var padX = fontSize * 0.6;
        var padY = fontSize * 0.35;
        var bw = textWidth + padX * 2;
        var bh = fontSize + padY * 2;

        roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 4);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
    }

    function drawStatBar(ctx, x, y, w, h, pct, color, radius) {
        // Background track
        roundRect(ctx, x, y, w, h, radius);
        ctx.fillStyle = '#1a1a2e';
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Filled portion
        var fillW = Math.max(0, w * clamp(pct, 0, 1));
        if (fillW > 0) {
            roundRect(ctx, x, y, fillW, h, radius);
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.8;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawLightningBolt(ctx, cx, cy, size, color) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(size / 24, size / 24);
        ctx.beginPath();
        ctx.moveTo(2, -12);
        ctx.lineTo(-4, 1);
        ctx.lineTo(0, 1);
        ctx.lineTo(-2, 12);
        ctx.lineTo(4, -1);
        ctx.lineTo(0, -1);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('f1-ers-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._fontReady = false;
            this._fontCheckDone = false;
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
                    'Awaiting data \u2014 ERS'
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

            if (colIdx.ers_store_energy === undefined) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Search results must include column: ers_store_energy. ' +
                    'Optional: ers_deploy_mode, ers_harvested_this_lap_mguk, ers_harvested_this_lap_mguh, ers_deployed_this_lap.'
                );
            }

            function getVal(row, name, fallback) {
                if (colIdx[name] === undefined) return fallback;
                var v = parseFloat(row[colIdx[name]]);
                return isNaN(v) ? fallback : v;
            }

            var row = data.rows[data.rows.length - 1];
            var result = {
                storeEnergy: getVal(row, 'ers_store_energy', 0),
                deployMode: getVal(row, 'ers_deploy_mode', 0),
                harvestedMguk: getVal(row, 'ers_harvested_this_lap_mguk', 0),
                harvestedMguh: getVal(row, 'ers_harvested_this_lap_mguh', 0),
                deployed: getVal(row, 'ers_deployed_this_lap', 0)
            };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            if (!this._fontReady && !this._fontCheckDone) {
                this._fontCheckDone = true;
                var self = this;
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(function() {
                        self._fontReady = true;
                        self.invalidateUpdateView();
                    });
                } else {
                    setTimeout(function() {
                        self._fontReady = true;
                        self.invalidateUpdateView();
                    }, 200);
                }
                return;
            }

            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { this._drawNoData(); return; }
            }

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var accentColor = config[ns + 'accentColor'] || '#ff8700';
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var showStats = (config[ns + 'showStats'] || 'true') === 'true';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var layout = config[ns + 'layout'] || 'horizontal';

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

            // ── Clear canvas ──
            ctx.clearRect(0, 0, w, h);

            // ── Parse data ──
            var pct = clamp(data.storeEnergy / MAX_ERS_JOULES, 0, 1);
            var modeIdx = clamp(Math.round(data.deployMode), 0, 3);
            var mode = DEPLOY_MODES[modeIdx];
            var totalHarvested = data.harvestedMguk + data.harvestedMguh;

            // ── Responsive sizing ──
            var isCompact = h < 120;
            var padding = Math.max(12, Math.min(24, w * 0.03));

            if (layout === 'vertical') {
                this._drawVertical(ctx, w, h, padding, pct, mode, data, totalHarvested, accentColor, showLabels, showStats, isCompact, showGlow);
            } else {
                this._drawHorizontal(ctx, w, h, padding, pct, mode, data, totalHarvested, accentColor, showLabels, showStats, isCompact, showGlow);
            }
        },

        _drawHorizontal: function(ctx, w, h, pad, pct, mode, data, totalHarvested, accent, showLabels, showStats, isCompact, showGlow) {
            var percentText = Math.round(pct * 100) + '%';
            var baseFontSize = Math.max(11, Math.min(18, h * 0.1));
            var bigFontSize = Math.max(16, Math.min(42, h * 0.22));

            // Measure the percentage text width so battery starts cleanly after it
            ctx.font = 'bold ' + bigFontSize + 'px ' + F1_MONO;
            var pctTextW = ctx.measureText(percentText).width;
            var boltSize = Math.max(14, bigFontSize * 0.55);
            var boltW = boltSize + 6;

            // Measure the mode badge width
            var badgeFontSize = Math.max(10, baseFontSize * 0.9);
            ctx.font = 'bold ' + badgeFontSize + 'px ' + F1_FONT;
            var badgeTextW = ctx.measureText(mode.label).width;
            var badgeW = badgeTextW + badgeFontSize * 1.2 + pad;

            // Layout zones: [bolt pct gap] [battery bar] [gap badge]
            var leftW = boltW + pctTextW + pad;
            var barX = pad + leftW;
            var barW = w - barX - badgeW - pad;

            // Vertical layout: split into main zone and stats zone
            var labelH = showLabels && !isCompact ? baseFontSize + 8 : 0;
            var statsH = showStats ? Math.max(50, h * 0.32) : 0;
            var mainH = h - statsH;
            var barH = Math.max(14, Math.min(36, mainH * 0.35));
            var barY = (mainH - barH - labelH) / 2;

            // Lightning bolt + percentage
            var centerY = barY + barH / 2;
            drawLightningBolt(ctx, pad + boltSize * 0.5, centerY, boltSize, accent);

            if (showGlow && pct > 0.1) {
                ctx.shadowColor = mode.color;
                ctx.shadowBlur = Math.max(10, bigFontSize * 0.3);
            }
            ctx.font = 'bold ' + bigFontSize + 'px ' + F1_MONO;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(percentText, pad + boltW, centerY);
            ctx.shadowBlur = 0;

            // Battery bar
            if (barW > 20) {
                drawBatterySegments(ctx, barX, barY, barW, barH, pct, mode.color, 3, showGlow);

                // Battery outline
                roundRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, 4);
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Battery terminal (right side)
                var termH = barH * 0.4;
                roundRect(ctx, barX + barW + 1, centerY - termH / 2, 6, termH, 2);
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fill();
            }

            // Deploy mode badge
            var badgeCx = w - pad - (badgeW - pad) / 2;
            drawModeBadge(ctx, badgeCx, centerY, mode.label, mode.color, badgeFontSize);

            // Labels below battery and badge
            if (showLabels && !isCompact) {
                ctx.font = baseFontSize * 0.7 + 'px ' + F1_FONT;
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText('ERS ENERGY', barX + barW / 2, barY + barH + 6);
                ctx.fillText('DEPLOY MODE', badgeCx, barY + barH + 6);
            }

            // Stats row
            if (showStats && statsH > 20) {
                this._drawStatsRow(ctx, pad, mainH, w - pad * 2, statsH, data, totalHarvested, accent, baseFontSize);
            }
        },

        _drawVertical: function(ctx, w, h, pad, pct, mode, data, totalHarvested, accent, showLabels, showStats, isCompact, showGlow) {
            var percentText = Math.round(pct * 100) + '%';
            var baseFontSize = Math.max(10, Math.min(16, w * 0.05));
            var bigFontSize = Math.max(16, Math.min(36, w * 0.12));

            // Layout: top badge, center battery column, bottom stats
            var badgeH = Math.max(30, h * 0.12);
            var statsH = showStats ? Math.max(50, h * 0.25) : 0;
            var barH = h - badgeH - statsH - pad * 2;
            var barW = Math.max(24, Math.min(50, w * 0.2));
            var barX = w / 2 - barW / 2;
            var barY = badgeH + pad;

            // Deploy mode badge at top
            drawModeBadge(ctx, w / 2, badgeH / 2, mode.label, mode.color, baseFontSize);

            // Vertical battery (draw segments bottom to top)
            if (barH > 20) {
                var segmentCount = 20;
                var gap = 2;
                var segH = (barH - gap * (segmentCount - 1)) / segmentCount;
                var filledSegments = Math.round(pct * segmentCount);

                var color = batteryColor(pct, mode.color);
                for (var i = 0; i < segmentCount; i++) {
                    var sy = barY + barH - (i + 1) * (segH + gap) + gap;
                    if (i < filledSegments) {
                        ctx.fillStyle = color;
                        ctx.globalAlpha = 0.7 + 0.3 * (i / filledSegments);

                        if (showGlow && i >= filledSegments - 3 && filledSegments > 0) {
                            ctx.shadowColor = color;
                            ctx.shadowBlur = 6 + (i - (filledSegments - 3)) * 3;
                        }
                    } else {
                        ctx.fillStyle = '#1a1a2e';
                        ctx.globalAlpha = 0.5;
                        ctx.shadowBlur = 0;
                    }
                    ctx.fillRect(barX, sy, barW, segH);
                    ctx.shadowBlur = 0;
                }
                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;

                // Battery outline
                roundRect(ctx, barX - 1, barY - 1, barW + 2, barH + 2, 4);
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1;
                ctx.stroke();

                // Battery terminal
                var termW = barW * 0.4;
                roundRect(ctx, w / 2 - termW / 2, barY - 6, termW, 6, 2);
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                ctx.fill();
            }

            // Percentage beside battery
            if (showGlow && pct > 0.1) {
                ctx.shadowColor = mode.color;
                ctx.shadowBlur = Math.max(10, bigFontSize * 0.3);
            }
            ctx.font = 'bold ' + bigFontSize + 'px ' + F1_MONO;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(percentText, barX + barW + pad, barY + barH / 2);
            ctx.shadowBlur = 0;

            // Lightning bolt
            var boltSize = Math.max(14, bigFontSize * 0.5);
            drawLightningBolt(ctx, barX - pad - boltSize * 0.3, barY + barH / 2, boltSize, accent);

            // Stats at bottom
            if (showStats && statsH > 20) {
                this._drawStatsRow(ctx, pad, h - statsH, w - pad * 2, statsH, data, totalHarvested, accent, baseFontSize);
            }
        },

        _drawStatsRow: function(ctx, x, y, w, h, data, totalHarvested, accent, fontSize) {
            var labelSize = fontSize * 0.7;
            var valueSize = fontSize * 0.9;

            // Divider line
            ctx.beginPath();
            ctx.moveTo(x, y + 2);
            ctx.lineTo(x + w, y + 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();

            var colW = w / 4;
            var stats = [
                { label: 'MGU-K HARVEST', value: formatEnergy(data.harvestedMguk), color: '#00d2be' },
                { label: 'MGU-H HARVEST', value: formatEnergy(data.harvestedMguh), color: '#00b4d8' },
                { label: 'TOTAL HARVEST', value: formatEnergy(totalHarvested), color: accent },
                { label: 'DEPLOYED',       value: formatEnergy(data.deployed),      color: '#e10600' }
            ];

            // Vertically center the content within the stats zone
            var contentH = labelSize + 4 + valueSize + 8 + 3; // label + gap + value + gap + mini bar
            var startY = y + (h - contentH) / 2 + 4;

            for (var i = 0; i < stats.length; i++) {
                var cx = x + colW * i + colW / 2;

                // Label
                ctx.font = labelSize + 'px ' + F1_FONT;
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(stats[i].label, cx, startY);

                // Value
                ctx.font = 'bold ' + valueSize + 'px ' + F1_MONO;
                ctx.fillStyle = stats[i].color;
                ctx.fillText(stats[i].value, cx, startY + labelSize + 4);

                // Mini bar
                var barW = colW * 0.6;
                var barH = 3;
                var maxRef = MAX_ERS_JOULES;
                var val = 0;
                if (i === 0) val = data.harvestedMguk;
                else if (i === 1) val = data.harvestedMguh;
                else if (i === 2) val = data.harvestedMguk + data.harvestedMguh;
                else val = data.deployed;

                var barPct = clamp(val / maxRef, 0, 1);
                drawStatBar(ctx, cx - barW / 2, startY + labelSize + valueSize + 8, barW, barH, barPct, stats[i].color, 1.5);
            }
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

            var fontSize = Math.max(12, Math.min(16, rect.width * 0.03));
            ctx.font = fontSize + 'px ' + F1_FONT;
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ERS Energy — Waiting for data', rect.width / 2, rect.height / 2 - fontSize);
            ctx.font = (fontSize * 0.8) + 'px ' + F1_FONT;
            ctx.fillText('Required: ers_store_energy | Optional: ers_deploy_mode, ers_harvested_this_lap_mguk, ers_harvested_this_lap_mguh, ers_deployed_this_lap', rect.width / 2, rect.height / 2 + fontSize * 0.5);
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
            var emojiSize = Math.round(fontSize * 1.6);
            var gap = fontSize * 0.5;

            ctx.font = '500 ' + fontSize + 'px ' + F1_FONT;
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px ' + F1_FONT;
            }

            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\uD83C\uDFCE\uFE0F', w / 2, h / 2 - fontSize * 0.5 - gap);

            ctx.font = '500 ' + fontSize + 'px ' + F1_FONT;
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

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
