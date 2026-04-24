/*
 * World Cup Bracket — Splunk Custom Visualization
 *
 * Tournament bracket visualization where match nodes pulse/glow based on
 * current betting activity. Horizontal layout: R16 → QF → SF → Final.
 *
 * Expected SPL columns: round, position, team1, team2, volume, winner
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var ROUND_ORDER = ['R16', 'QF', 'SF', 'F'];
    var ROUND_LABELS = { R16: 'Round of 16', QF: 'Quarter Finals', SF: 'Semi Finals', F: 'Final' };
    var ROUND_MATCH_COUNT = { R16: 8, QF: 4, SF: 2, F: 1 };

    // ── Helper Functions (pure, no `this`) ──────────────────────

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
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

    function formatNumber(n) {
        var s = Math.round(n).toString();
        var result = '';
        for (var i = s.length - 1, c = 0; i >= 0; i--, c++) {
            if (c > 0 && c % 3 === 0) result = ',' + result;
            result = s[i] + result;
        }
        return result;
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

    // ── Draw a single match card ────────────────────────────────

    function drawCard(ctx, x, y, w, h, match, volumePct, colorLow, colorHigh, accentColor, showVolume) {
        var cardColor = lerpColor(colorLow, colorHigh, volumePct);
        var glowAlpha = 0.15 + volumePct * 0.6;
        var cornerR = Math.min(6, h * 0.1);

        // Outer glow
        ctx.shadowColor = cardColor;
        ctx.shadowBlur = 4 + volumePct * 18;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Card background
        roundRect(ctx, x, y, w, h, cornerR);
        var grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, hexToRgba(cardColor, 0.25 + volumePct * 0.2));
        grad.addColorStop(1, hexToRgba(cardColor, 0.08 + volumePct * 0.1));
        ctx.fillStyle = grad;
        ctx.fill();

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Card border
        roundRect(ctx, x, y, w, h, cornerR);
        ctx.strokeStyle = hexToRgba(cardColor, 0.5 + volumePct * 0.3);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Layout: team1 on top half, team2 on bottom half, divider in middle
        var midY = y + h / 2;
        var teamFontSize = Math.max(8, Math.min(14, w * 0.1));
        var padding = 6;

        // Divider line
        ctx.beginPath();
        ctx.moveTo(x + padding, midY);
        ctx.lineTo(x + w - padding, midY);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Team 1
        var team1Color = '#ffffff';
        var team1Alpha = 0.85;
        if (match.winner && match.winner === match.team1) {
            team1Color = accentColor;
            team1Alpha = 1;
        }
        ctx.font = '600 ' + teamFontSize + 'px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = hexToRgba(team1Color, team1Alpha);
        var team1Y = y + h * 0.25;
        var textMaxW = w - padding * 2;
        if (showVolume) {
            textMaxW = w - padding * 3 - 30;
        }
        ctx.fillText(truncateText(ctx, match.team1, textMaxW), x + padding, team1Y);

        // Winner indicator dot for team1
        if (match.winner && match.winner === match.team1) {
            ctx.beginPath();
            ctx.arc(x + w - padding - 4, team1Y, 3, 0, Math.PI * 2);
            ctx.fillStyle = accentColor;
            ctx.fill();
        }

        // Team 2
        var team2Color = '#ffffff';
        var team2Alpha = 0.85;
        if (match.winner && match.winner === match.team2) {
            team2Color = accentColor;
            team2Alpha = 1;
        }
        ctx.fillStyle = hexToRgba(team2Color, team2Alpha);
        var team2Y = y + h * 0.75;
        ctx.fillText(truncateText(ctx, match.team2, textMaxW), x + padding, team2Y);

        // Winner indicator dot for team2
        if (match.winner && match.winner === match.team2) {
            ctx.beginPath();
            ctx.arc(x + w - padding - 4, team2Y, 3, 0, Math.PI * 2);
            ctx.fillStyle = accentColor;
            ctx.fill();
        }

        // Volume bar at bottom
        if (showVolume) {
            var volBarH = Math.max(2, h * 0.06);
            var volBarW = w - padding * 2;
            var volBarX = x + padding;
            var volBarY = y + h - volBarH - 3;

            // Track
            roundRect(ctx, volBarX, volBarY, volBarW, volBarH, volBarH / 2);
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fill();

            // Fill
            var fillW = Math.max(volBarH, volBarW * volumePct);
            roundRect(ctx, volBarX, volBarY, fillW, volBarH, volBarH / 2);
            ctx.fillStyle = cardColor;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;

            // Volume number
            var volFontSize = Math.max(7, teamFontSize * 0.7);
            ctx.font = volFontSize + 'px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(formatNumber(match.volume), x + w - padding, midY);
        }

        // Reset text alignment
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    function truncateText(ctx, text, maxW) {
        if (!text) return '';
        if (ctx.measureText(text).width <= maxW) return text;
        var truncated = text;
        while (truncated.length > 1 && ctx.measureText(truncated + '...').width > maxW) {
            truncated = truncated.slice(0, -1);
        }
        return truncated + '...';
    }

    // ── Draw connectors between rounds ──────────────────────────

    function drawConnectors(ctx, prevPositions, nextPositions, color) {
        // Each pair of adjacent matches in prevPositions feeds into one match in nextPositions
        ctx.strokeStyle = hexToRgba(color, 0.2);
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        for (var i = 0; i < nextPositions.length; i++) {
            var idx1 = i * 2;
            var idx2 = i * 2 + 1;
            var target = nextPositions[i];

            if (idx1 < prevPositions.length) {
                drawConnectorLine(ctx, prevPositions[idx1], target);
            }
            if (idx2 < prevPositions.length) {
                drawConnectorLine(ctx, prevPositions[idx2], target);
            }
        }
    }

    function drawConnectorLine(ctx, from, to) {
        var midX = (from.rightX + to.leftX) / 2;

        ctx.beginPath();
        ctx.moveTo(from.rightX, from.cy);
        ctx.bezierCurveTo(midX, from.cy, midX, to.cy, to.leftX, to.cy);
        ctx.stroke();
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('wc-bracket-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 100
            };
        },

        formatData: function(data) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 World Cup Bracket'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Check for _status field from appendpipe fallback
            if (colIdx._status !== undefined) {
                var lastRow = data.rows[data.rows.length - 1];
                var statusVal = lastRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            // Require round, position, team1, team2, volume
            if (colIdx.round === undefined || colIdx.position === undefined ||
                colIdx.team1 === undefined || colIdx.team2 === undefined ||
                colIdx.volume === undefined) {
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: round, position, team1, team2, volume'
                );
            }

            var rounds = { R16: [], QF: [], SF: [], F: [] };
            var maxVolume = 0;

            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var roundVal = row[colIdx.round];
                var posVal = parseInt(row[colIdx.position], 10) || 0;
                var vol = parseFloat(row[colIdx.volume]) || 0;
                var winnerVal = colIdx.winner !== undefined ? (row[colIdx.winner] || '') : '';

                if (!rounds[roundVal]) continue;

                var match = {
                    round: roundVal,
                    position: posVal,
                    team1: row[colIdx.team1] || '',
                    team2: row[colIdx.team2] || '',
                    volume: vol,
                    winner: winnerVal
                };

                rounds[roundVal].push(match);
                if (vol > maxVolume) maxVolume = vol;
            }

            // Sort each round by position
            for (var ri = 0; ri < ROUND_ORDER.length; ri++) {
                var rKey = ROUND_ORDER[ri];
                rounds[rKey].sort(function(a, b) {
                    return a.position - b.position;
                });
            }

            var result = {
                rounds: rounds,
                maxVolume: maxVolume || 1
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

            if (!data || !data.rounds) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            // ── Read settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var colorLow = config[ns + 'colorLow'] || '#1a2a4a';
            var colorHigh = config[ns + 'colorHigh'] || '#ff6600';
            var showVolume = (config[ns + 'showVolume'] || 'true') === 'true';
            var cardWidthSetting = parseInt(config[ns + 'cardWidth'], 10) || 0;
            var showConnectors = (config[ns + 'showConnectors'] || 'true') === 'true';
            var accentColor = config[ns + 'accentColor'] || '#00ff88';

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

            // ── Clear with dark background ──
            ctx.fillStyle = '#0d0d1a';
            ctx.fillRect(0, 0, w, h);

            // ── Layout calculation ──
            var marginX = w * 0.04;
            var marginY = h * 0.06;
            var headerH = Math.max(20, h * 0.06);
            var usableW = w - marginX * 2;
            var usableH = h - marginY * 2 - headerH;

            var numRounds = ROUND_ORDER.length;
            var columnGap = usableW * 0.06;
            var totalGaps = (numRounds - 1) * columnGap;
            var columnW = (usableW - totalGaps) / numRounds;

            // Card dimensions
            var cardW = cardWidthSetting > 0 ? Math.min(cardWidthSetting, columnW) : columnW * 0.85;
            var maxCardH = 70;
            var minCardH = 40;

            // Store card positions for connectors
            var roundPositions = {};

            // ── Draw round headers ──
            var headerFontSize = Math.max(9, Math.min(14, columnW * 0.09));
            ctx.font = '600 ' + headerFontSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            for (var ri = 0; ri < numRounds; ri++) {
                var rKey = ROUND_ORDER[ri];
                var colX = marginX + ri * (columnW + columnGap);
                var colCenterX = colX + columnW / 2;

                // Round header
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillText(ROUND_LABELS[rKey], colCenterX, marginY);
            }

            // ── Draw cards and collect positions ──
            for (var ri2 = 0; ri2 < numRounds; ri2++) {
                var rKey2 = ROUND_ORDER[ri2];
                var matches = data.rounds[rKey2];
                var colX2 = marginX + ri2 * (columnW + columnGap);
                var colCenterX2 = colX2 + columnW / 2;
                var cardX = colCenterX2 - cardW / 2;

                var expectedCount = ROUND_MATCH_COUNT[rKey2] || matches.length;
                var matchCount = matches.length || 1;

                // Calculate card height based on available space and match count
                var availH = usableH;
                var cardGap = Math.max(8, availH * 0.02);
                var totalCardH = (availH - (matchCount - 1) * cardGap) / matchCount;
                var cardH = clamp(totalCardH, minCardH, maxCardH);

                // Recalculate total block height and center vertically
                var blockH = matchCount * cardH + (matchCount - 1) * cardGap;
                var startY = marginY + headerH + (usableH - blockH) / 2;

                var positions = [];

                for (var mi = 0; mi < matches.length; mi++) {
                    var match = matches[mi];
                    var cardY = startY + mi * (cardH + cardGap);
                    var volumePct = data.maxVolume > 0 ? clamp(match.volume / data.maxVolume, 0, 1) : 0;

                    drawCard(ctx, cardX, cardY, cardW, cardH, match, volumePct, colorLow, colorHigh, accentColor, showVolume);

                    positions.push({
                        leftX: cardX,
                        rightX: cardX + cardW,
                        cy: cardY + cardH / 2
                    });
                }

                roundPositions[rKey2] = positions;
            }

            // ── Draw connectors ──
            if (showConnectors) {
                for (var ci = 0; ci < numRounds - 1; ci++) {
                    var fromRound = ROUND_ORDER[ci];
                    var toRound = ROUND_ORDER[ci + 1];
                    var fromPos = roundPositions[fromRound];
                    var toPos = roundPositions[toRound];

                    if (fromPos && toPos && fromPos.length > 0 && toPos.length > 0) {
                        drawConnectors(ctx, fromPos, toPos, '#ffffff');
                    }
                }
            }

            // ── Trophy emoji for Final ──
            var finalMatches = data.rounds.F;
            if (finalMatches && finalMatches.length > 0 && finalMatches[0].winner) {
                var lastColX = marginX + (numRounds - 1) * (columnW + columnGap);
                var trophyX = lastColX + columnW + columnGap * 0.3;
                if (trophyX + 30 < w) {
                    var finalPos = roundPositions.F;
                    if (finalPos && finalPos.length > 0) {
                        var trophyFontSize = Math.max(20, Math.min(40, h * 0.07));
                        ctx.font = trophyFontSize + 'px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('\uD83C\uDFC6', trophyX + 15, finalPos[0].cy);
                    }
                }
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
            if (rect.width <= 0 || rect.height <= 0) return;
            var dpr = window.devicePixelRatio || 1;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;

            // Dark background
            ctx.fillStyle = '#0d0d1a';
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
        }
    });
});
