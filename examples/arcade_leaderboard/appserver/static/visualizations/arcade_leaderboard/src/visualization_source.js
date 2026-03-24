/*
 * Arcade Leaderboard — Splunk Custom Visualization
 *
 * 80s arcade-style high score leaderboard with cyberpunk neon colors,
 * CRT scanlines, pixel font, and retro glow effects.
 *
 * Expected SPL columns: rank, player_name, score
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Helper functions (pure, no `this`) ──────────────────────

    var FONT_FAMILY = "'Press Start 2P', monospace";

    // Cyberpunk rank colors: gold → silver → bronze → neon gradient
    var RANK_COLORS = [
        '#ffd700', // 1st — gold
        '#c0c0c0', // 2nd — silver
        '#cd7f32', // 3rd — bronze
        '#00ff41', // 4th — neon green
        '#00fff5', // 5th — cyan
        '#7b68ee', // 6th — medium slate blue
        '#ff00ff', // 7th — magenta
        '#ff3366', // 8th — hot pink
        '#ffff00', // 9th — yellow
        '#00ff41'  // 10th+ — neon green
    ];

    function getRankColor(rank) {
        if (rank < 1) return RANK_COLORS[0];
        if (rank > RANK_COLORS.length) return RANK_COLORS[RANK_COLORS.length - 1];
        return RANK_COLORS[rank - 1];
    }

    function padScore(score, digits) {
        if (digits <= 0) return String(Math.floor(score));
        var s = String(Math.floor(score));
        while (s.length < digits) {
            s = '0' + s;
        }
        return s;
    }

    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function drawGlowText(ctx, text, x, y, color, blur) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        // Double pass for stronger glow
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    function drawScanlines(ctx, w, h, opacity) {
        ctx.save();
        ctx.globalAlpha = opacity;
        var lineSpacing = 3;
        ctx.fillStyle = '#000000';
        for (var y = 0; y < h; y += lineSpacing) {
            ctx.fillRect(0, y, w, 1);
        }
        ctx.globalAlpha = 1.0;
        ctx.restore();
    }

    function drawCRTVignette(ctx, w, h) {
        var gradient = ctx.createRadialGradient(
            w / 2, h / 2, Math.min(w, h) * 0.2,
            w / 2, h / 2, Math.max(w, h) * 0.75
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
    }

    function fitTextSize(ctx, text, maxWidth, maxSize, fontFamily) {
        var size = maxSize;
        ctx.font = size + 'px ' + fontFamily;
        while (ctx.measureText(text).width > maxWidth && size > 6) {
            size -= 1;
            ctx.font = size + 'px ' + fontFamily;
        }
        return size;
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('arcade-leaderboard-viz');

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

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Arcade Leaderboard'
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

            var result = { colIdx: colIdx, rows: data.rows };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Font loading gate
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

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var title = config[ns + 'title'] || 'HIGH SCORES';
            var maxRows = parseInt(config[ns + 'maxRows'], 10) || 10;
            var scoreDigits = parseInt(config[ns + 'scoreDigits'], 10);
            if (isNaN(scoreDigits)) scoreDigits = 8;
            var showScanlines = (config[ns + 'showScanlines'] || 'true') === 'true';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';
            var titleColor = config[ns + 'titleColor'] || '#00fff5';
            var rankFieldName = config[ns + 'rankFieldName'] || 'rank';
            var nameFieldName = config[ns + 'nameFieldName'] || 'player_name';
            var scoreFieldName = config[ns + 'scoreFieldName'] || 'score';

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

            // ── Clear canvas (transparent) ──
            ctx.clearRect(0, 0, w, h);

            // ── Extract and sort data ──
            var colIdx = data.colIdx;
            var rows = data.rows;
            var entries = [];

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var rank = colIdx[rankFieldName] !== undefined ? parseInt(row[colIdx[rankFieldName]], 10) : i + 1;
                var name = colIdx[nameFieldName] !== undefined ? String(row[colIdx[nameFieldName]] || '???') : '???';
                var score = colIdx[scoreFieldName] !== undefined ? parseFloat(row[colIdx[scoreFieldName]]) : 0;
                if (isNaN(rank)) rank = i + 1;
                if (isNaN(score)) score = 0;
                entries.push({ rank: rank, name: name, score: score });
            }

            // Sort by rank ascending
            entries.sort(function(a, b) { return a.rank - b.rank; });

            // Limit to maxRows
            if (entries.length > maxRows) {
                entries = entries.slice(0, maxRows);
            }

            // ── Layout calculations ──
            var padding = Math.max(12, w * 0.03);
            var titleFontSize = fitTextSize(ctx, title, w * 0.9, Math.max(12, Math.min(36, h * 0.08)), FONT_FAMILY);
            var titleAreaH = titleFontSize * 2.5;
            var separatorH = 8;
            var availableH = h - titleAreaH - separatorH - padding * 2;
            var rowH = Math.min(Math.max(20, availableH / Math.max(entries.length, 1)), 60);
            var rowFontSize = Math.max(8, Math.min(20, rowH * 0.5));
            var rowGap = Math.max(2, rowH * 0.15);

            // ── Draw title ──
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = titleFontSize + 'px ' + FONT_FAMILY;

            if (showGlow) {
                drawGlowText(ctx, title, w / 2, titleAreaH / 2, titleColor, 20);
            } else {
                ctx.fillStyle = titleColor;
                ctx.fillText(title, w / 2, titleAreaH / 2);
            }

            // ── Draw separator line ──
            var sepY = titleAreaH;
            var sepGrad = ctx.createLinearGradient(padding, sepY, w - padding, sepY);
            sepGrad.addColorStop(0, 'rgba(0,255,245,0)');
            sepGrad.addColorStop(0.2, titleColor);
            sepGrad.addColorStop(0.5, '#ff00ff');
            sepGrad.addColorStop(0.8, titleColor);
            sepGrad.addColorStop(1, 'rgba(0,255,245,0)');
            ctx.fillStyle = sepGrad;
            ctx.fillRect(padding, sepY, w - padding * 2, 2);

            if (showGlow) {
                ctx.save();
                ctx.shadowColor = titleColor;
                ctx.shadowBlur = 10;
                ctx.fillStyle = sepGrad;
                ctx.fillRect(padding, sepY, w - padding * 2, 2);
                ctx.shadowBlur = 0;
                ctx.restore();
            }

            // ── Draw column headers ──
            var headerY = sepY + separatorH + padding * 0.5;
            var headerFontSize = Math.max(6, rowFontSize * 0.7);
            ctx.font = headerFontSize + 'px ' + FONT_FAMILY;
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.3)';

            var rankColX = padding + 4;
            var nameColX = padding + w * 0.12;
            var scoreColX = w - padding - 4;

            ctx.textAlign = 'left';
            ctx.fillText('RNK', rankColX, headerY + headerFontSize * 0.5);
            ctx.fillText('NAME', nameColX, headerY + headerFontSize * 0.5);
            ctx.textAlign = 'right';
            ctx.fillText('SCORE', scoreColX, headerY + headerFontSize * 0.5);

            // ── Draw rows ──
            var startY = headerY + headerFontSize + rowGap + padding * 0.3;

            for (var r = 0; r < entries.length; r++) {
                var entry = entries[r];
                var rowY = startY + r * (rowH + rowGap);
                var centerY = rowY + rowH / 2;
                var rankColor = getRankColor(entry.rank);

                // Row background — subtle gradient stripe
                if (r % 2 === 0) {
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                    ctx.fillRect(padding, rowY, w - padding * 2, rowH);
                }

                // Rank highlight bar for top 3
                if (entry.rank <= 3) {
                    ctx.save();
                    var barGrad = ctx.createLinearGradient(padding, rowY, padding + w * 0.08, rowY);
                    barGrad.addColorStop(0, hexToRgba(rankColor, 0.25));
                    barGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = barGrad;
                    ctx.fillRect(padding, rowY, w - padding * 2, rowH);
                    ctx.restore();
                }

                ctx.font = rowFontSize + 'px ' + FONT_FAMILY;
                ctx.textBaseline = 'middle';

                // Rank number
                var rankStr = entry.rank < 10 ? '0' + entry.rank : String(entry.rank);
                ctx.textAlign = 'left';
                ctx.fillStyle = rankColor;
                ctx.fillText(rankStr, rankColX, centerY);

                // Player name
                var displayName = entry.name.toUpperCase();
                var nameFontSize = fitTextSize(ctx, displayName, (scoreColX - nameColX) * 0.55, rowFontSize, FONT_FAMILY);
                ctx.font = nameFontSize + 'px ' + FONT_FAMILY;
                ctx.textAlign = 'left';
                ctx.fillStyle = rankColor;
                ctx.fillText(displayName, nameColX, centerY);

                // Score with leading zeros
                var scoreStr = padScore(entry.score, scoreDigits);
                var scoreFontSize = fitTextSize(ctx, scoreStr, (scoreColX - nameColX) * 0.4, rowFontSize, FONT_FAMILY);
                ctx.font = scoreFontSize + 'px ' + FONT_FAMILY;
                ctx.textAlign = 'right';
                ctx.fillStyle = rankColor;
                ctx.fillText(scoreStr, scoreColX, centerY);

                // Dot leaders between name and score
                ctx.save();
                var nameEndX = nameColX + ctx.measureText(displayName).width;
                // Recalculate name width at nameFontSize
                ctx.font = nameFontSize + 'px ' + FONT_FAMILY;
                nameEndX = nameColX + ctx.measureText(displayName).width;
                ctx.font = scoreFontSize + 'px ' + FONT_FAMILY;
                var scoreStartX = scoreColX - ctx.measureText(scoreStr).width;
                var dotGap = rowFontSize * 0.8;
                var dotStartX = nameEndX + dotGap;
                var dotEndX = scoreStartX - dotGap;
                if (dotEndX > dotStartX) {
                    ctx.fillStyle = hexToRgba(rankColor, 0.2);
                    var dotSize = Math.max(1, rowFontSize * 0.15);
                    var dotSpacing = dotSize * 4;
                    for (var dx = dotStartX; dx < dotEndX; dx += dotSpacing) {
                        ctx.fillRect(dx, centerY - dotSize / 2, dotSize, dotSize);
                    }
                }
                ctx.restore();
            }

            // ── CRT Effects ──
            if (showScanlines) {
                drawScanlines(ctx, w, h, 0.08);
            }

            // Vignette
            drawCRTVignette(ctx, w, h);

            // Reset state
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
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
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            var maxTextW = w * 0.85;
            var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
            var emojiSize = Math.round(fontSize * 1.6);
            var gap = fontSize * 0.5;

            // Scale font down if text overflows
            ctx.font = fontSize + 'px ' + FONT_FAMILY;
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = fontSize + 'px ' + FONT_FAMILY;
            }

            // Coin emoji above text
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\uD83C\uDFAE', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text in arcade font with glow
            ctx.font = fontSize + 'px ' + FONT_FAMILY;
            ctx.save();
            ctx.shadowColor = '#ff00ff';
            ctx.shadowBlur = 15;
            ctx.fillStyle = '#ff00ff';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);
            ctx.restore();

            // Scanlines
            drawScanlines(ctx, w, h, 0.06);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
            ctx.shadowBlur = 0;
        },

        reflow: function() {
            this.invalidateUpdateView();
        },

        destroy: function() {
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
