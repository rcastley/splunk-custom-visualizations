/*
 * World Cup Bets Pulse — Splunk Custom Visualization
 *
 * Football pitch-themed radial pulse gauge for real-time betting volume.
 * Renders a stylized pitch background with a 360-degree segmented ring gauge,
 * animated pulse glow, particle effects, and match information overlay.
 *
 * Expected SPL columns: bets_per_minute (required), match_name, peak_bpm, prev_bpm
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var PITCH_STYLES = {
        classic: {
            bg1: '#1a6b1a', bg2: '#0d4d0d',
            line: 'rgba(255,255,255,0.55)',
            grid: 'rgba(255,255,255,0.035)'
        },
        dark: {
            bg1: '#1a1a2e', bg2: '#0d0d1a',
            line: 'rgba(255,255,255,0.18)',
            grid: 'rgba(255,255,255,0.025)'
        },
        neon: {
            bg1: '#0a0a14', bg2: '#050510',
            line: 'rgba(0,255,140,0.45)',
            grid: 'rgba(0,255,140,0.025)'
        }
    };

    var ANIM_INTERVALS = { slow: 80, medium: 45, fast: 25 };
    var PULSE_RATES = { slow: 0.025, medium: 0.045, fast: 0.07 };
    var RING_SEGMENTS = 60;
    var SEGMENT_GAP_DEG = 1.5;
    var MAX_PARTICLES = 60;
    var PI2 = Math.PI * 2;

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

    function threeStopColor(t, low, mid, high) {
        t = clamp(t, 0, 1);
        if (t <= 0.5) return lerpColor(low, mid, t * 2);
        return lerpColor(mid, high, (t - 0.5) * 2);
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

    // ── Draw Football Pitch ─────────────────────────────────────

    function drawPitch(ctx, cx, cy, pw, ph, style) {
        var left = cx - pw / 2;
        var top = cy - ph / 2;

        // Background gradient
        var grad = ctx.createLinearGradient(left, top, left, top + ph);
        grad.addColorStop(0, style.bg1);
        grad.addColorStop(1, style.bg2);
        ctx.fillStyle = grad;
        roundRect(ctx, left, top, pw, ph, 8);
        ctx.fill();

        // Subtle grid
        ctx.strokeStyle = style.grid;
        ctx.lineWidth = 0.5;
        var gridStep = pw / 16;
        var i;
        for (i = left + gridStep; i < left + pw; i += gridStep) {
            ctx.beginPath();
            ctx.moveTo(i, top);
            ctx.lineTo(i, top + ph);
            ctx.stroke();
        }
        for (i = top + gridStep; i < top + ph; i += gridStep) {
            ctx.beginPath();
            ctx.moveTo(left, i);
            ctx.lineTo(left + pw, i);
            ctx.stroke();
        }

        // Pitch markings
        ctx.strokeStyle = style.line;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        // Outline
        roundRect(ctx, left + 4, top + 4, pw - 8, ph - 8, 4);
        ctx.stroke();

        // Halfway line
        ctx.beginPath();
        ctx.moveTo(left + 4, cy);
        ctx.lineTo(left + pw - 4, cy);
        ctx.stroke();

        // Center circle
        var centerR = Math.min(pw, ph) * 0.12;
        ctx.beginPath();
        ctx.arc(cx, cy, centerR, 0, PI2);
        ctx.stroke();

        // Center spot
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, PI2);
        ctx.fillStyle = style.line;
        ctx.fill();

        // Penalty areas (top and bottom)
        var paW = pw * 0.44;
        var paH = ph * 0.16;
        // Top penalty area
        ctx.strokeRect(cx - paW / 2, top + 4, paW, paH);
        // Bottom penalty area
        ctx.strokeRect(cx - paW / 2, top + ph - 4 - paH, paW, paH);

        // Goal areas
        var gaW = pw * 0.2;
        var gaH = ph * 0.06;
        ctx.strokeRect(cx - gaW / 2, top + 4, gaW, gaH);
        ctx.strokeRect(cx - gaW / 2, top + ph - 4 - gaH, gaW, gaH);

        // Penalty spots (12/18 = 0.667 into the penalty area)
        var penSpotDist = paH * 0.667;
        var topSpotY = top + 4 + penSpotDist;
        var botSpotY = top + ph - 4 - penSpotDist;
        ctx.beginPath();
        ctx.arc(cx, topSpotY, 2, 0, PI2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, botSpotY, 2, 0, PI2);
        ctx.fill();

        // Penalty arcs (D-shapes outside the penalty areas)
        // Arc radius = center circle radius (both 10 yards on a real pitch)
        // Calculate angle where arc exits the penalty area edge
        var arcR = centerR;
        var topPaEdgeY = top + 4 + paH;
        var botPaEdgeY = top + ph - 4 - paH;
        var dTop = topPaEdgeY - topSpotY; // distance from spot to PA edge
        var sinA = clamp(dTop / arcR, -1, 1);
        var halfAngle = Math.asin(sinA);

        // Top D: arc bulges downward, sweep from halfAngle to PI-halfAngle
        ctx.beginPath();
        ctx.arc(cx, topSpotY, arcR, halfAngle, Math.PI - halfAngle);
        ctx.stroke();
        // Bottom D: arc bulges upward, sweep from PI+halfAngle to 2PI-halfAngle
        ctx.beginPath();
        ctx.arc(cx, botSpotY, arcR, Math.PI + halfAngle, PI2 - halfAngle);
        ctx.stroke();

        // Corner arcs
        var cornerR = Math.min(pw, ph) * 0.025;
        // Top-left
        ctx.beginPath();
        ctx.arc(left + 4, top + 4, cornerR, 0, degToRad(90));
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.arc(left + pw - 4, top + 4, cornerR, degToRad(90), degToRad(180));
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.arc(left + 4, top + ph - 4, cornerR, degToRad(270), degToRad(360));
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.arc(left + pw - 4, top + ph - 4, cornerR, degToRad(180), degToRad(270));
        ctx.stroke();
    }

    // ── Draw Segmented Ring ─────────────────────────────────────

    function drawSegmentedRing(ctx, cx, cy, radius, thickness, fillPct, colorFn, glowIntensity) {
        var totalGapDeg = SEGMENT_GAP_DEG * RING_SEGMENTS;
        var segSweepDeg = (360 - totalGapDeg) / RING_SEGMENTS;
        var filledSegs = Math.round(fillPct * RING_SEGMENTS);
        var startAngle = -90; // 12 o'clock

        var i, aDeg, aStart, aEnd;

        // Draw unfilled segments (dim background)
        for (i = 0; i < RING_SEGMENTS; i++) {
            aDeg = startAngle + i * (segSweepDeg + SEGMENT_GAP_DEG);
            aStart = degToRad(aDeg);
            aEnd = degToRad(aDeg + segSweepDeg);

            ctx.beginPath();
            ctx.arc(cx, cy, radius, aStart, aEnd);
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = thickness;
            ctx.lineCap = 'butt';
            ctx.stroke();
        }

        // Draw filled segments
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        for (i = 0; i < filledSegs; i++) {
            aDeg = startAngle + i * (segSweepDeg + SEGMENT_GAP_DEG);
            aStart = degToRad(aDeg);
            aEnd = degToRad(aDeg + segSweepDeg);

            var segColor = colorFn(i / RING_SEGMENTS);
            var isNearTip = i >= filledSegs - 5;

            if (isNearTip) {
                ctx.shadowColor = segColor;
                ctx.shadowBlur = 6 + glowIntensity * 14;
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }

            ctx.beginPath();
            ctx.arc(cx, cy, radius, aStart, aEnd);
            ctx.strokeStyle = segColor;
            ctx.lineWidth = thickness;
            ctx.lineCap = 'butt';
            ctx.globalAlpha = 0.75 + 0.25 * glowIntensity;
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

    // ── Particle System ─────────────────────────────────────────

    function spawnParticle(cx, cy, canvasW, canvasH, color) {
        var edge = Math.floor(Math.random() * 4);
        var px, py;
        if (edge === 0) { px = Math.random() * canvasW; py = 0; }
        else if (edge === 1) { px = canvasW; py = Math.random() * canvasH; }
        else if (edge === 2) { px = Math.random() * canvasW; py = canvasH; }
        else { px = 0; py = Math.random() * canvasH; }

        var dx = cx - px;
        var dy = cy - py;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var speed = 1.5 + Math.random() * 2;

        return {
            x: px,
            y: py,
            vx: (dx / dist) * speed + (Math.random() - 0.5) * 0.5,
            vy: (dy / dist) * speed + (Math.random() - 0.5) * 0.5,
            alpha: 0.6 + Math.random() * 0.4,
            radius: 1.5 + Math.random() * 2.5,
            color: color
        };
    }

    function updateParticles(particles, cx, cy, volumePct, canvasW, canvasH, color) {
        // Update existing
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            // Gravity toward center
            var dx = cx - p.x;
            var dy = cy - p.y;
            var dist = Math.sqrt(dx * dx + dy * dy) || 1;
            p.vx += (dx / dist) * 0.08;
            p.vy += (dy / dist) * 0.08;
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.006;

            // Remove dead or arrived
            if (p.alpha <= 0 || dist < 25) {
                particles.splice(i, 1);
            }
        }

        // Spawn new particles when volume > 30%
        if (volumePct > 0.3 && particles.length < MAX_PARTICLES) {
            var spawnChance = (volumePct - 0.3) * 0.5;
            if (Math.random() < spawnChance) {
                particles.push(spawnParticle(cx, cy, canvasW, canvasH, color));
            }
            // Higher volume = more spawns
            if (volumePct > 0.7 && Math.random() < 0.3 && particles.length < MAX_PARTICLES) {
                particles.push(spawnParticle(cx, cy, canvasW, canvasH, color));
            }
        }
    }

    function drawParticles(ctx, particles) {
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, PI2);
            ctx.fillStyle = hexToRgba(p.color, p.alpha * 0.8);
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.fill();
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

    // ── Trend Arrow ─────────────────────────────────────────────

    function getTrendArrow(current, prev) {
        if (prev <= 0) return { symbol: '', color: 'transparent' };
        if (current > prev * 1.03) return { symbol: '\u25B2', color: '#00ff88' };
        if (current < prev * 0.97) return { symbol: '\u25BC', color: '#ff4444' };
        return { symbol: '\u25B6', color: '#ffcc00' };
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('worldcup-bets-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._pulsePhase = 0;
            this._particles = [];
            this._timer = null;
            this._animSpeed = 'medium';
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
                    'Awaiting data \u2014 World Cup Bets Pulse'
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

            var row = data.rows[data.rows.length - 1];
            var result = { colIdx: colIdx, row: row };
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
            var pitchStyle = config[ns + 'pitchStyle'] || 'dark';
            var colorLow = config[ns + 'colorLow'] || '#0088ff';
            var colorMid = config[ns + 'colorMid'] || '#ffcc00';
            var colorHigh = config[ns + 'colorHigh'] || '#ff3333';
            var maxBPM = parseInt(config[ns + 'maxBPM'], 10) || 10000;
            var animSpeed = config[ns + 'animationSpeed'] || 'medium';
            var showParticles = (config[ns + 'showParticles'] || 'true') === 'true';
            var showBreakdown = (config[ns + 'showBreakdown'] || 'true') === 'true';
            var showPeak = (config[ns + 'showPeak'] || 'true') === 'true';
            var showPitch = (config[ns + 'showPitch'] || 'true') === 'true';
            var bpmField = config[ns + 'bpmField'] || 'bets_per_minute';

            // ── Extract data ──
            var rawBPM = 0;
            if (data.colIdx[bpmField] !== undefined) {
                var v = parseFloat(data.row[data.colIdx[bpmField]]);
                if (!isNaN(v)) rawBPM = v;
            }
            var matchName = '';
            if (data.colIdx.match_name !== undefined) {
                matchName = data.row[data.colIdx.match_name] || '';
            }
            var peakBPM = 0;
            if (data.colIdx.peak_bpm !== undefined) {
                var pk = parseFloat(data.row[data.colIdx.peak_bpm]);
                if (!isNaN(pk)) peakBPM = pk;
            }
            var prevBPM = 0;
            if (data.colIdx.prev_bpm !== undefined) {
                var pv = parseFloat(data.row[data.colIdx.prev_bpm]);
                if (!isNaN(pv)) prevBPM = pv;
            }

            var pct = clamp(rawBPM / maxBPM, 0, 1);

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
            if (this._animSpeed !== animSpeed) {
                this._stopAnimation();
                this._animSpeed = animSpeed;
            }
            this._startAnimation();

            // Update pulse phase
            var pulseRate = PULSE_RATES[animSpeed] || 0.045;
            // Faster pulse at higher volume
            this._pulsePhase += pulseRate * (0.5 + pct * 1.5);
            var glowIntensity = 0.3 + 0.7 * Math.abs(Math.sin(this._pulsePhase));

            // ── Clear ──
            ctx.clearRect(0, 0, w, h);

            // ── 1. Pitch Background ──
            if (showPitch) {
                var pitchW = w * 0.88;
                var pitchH = h * 0.82;
                var style = PITCH_STYLES[pitchStyle] || PITCH_STYLES.dark;
                drawPitch(ctx, cx, cy, pitchW, pitchH, style);
            }

            // ── 2. Inner Glow ──
            var radius = Math.min(w, h) * 0.26;
            var currentColor = threeStopColor(pct, colorLow, colorMid, colorHigh);
            var innerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.2);
            innerGlow.addColorStop(0, hexToRgba(currentColor, 0.12 * glowIntensity));
            innerGlow.addColorStop(0.5, hexToRgba(currentColor, 0.05 * glowIntensity));
            innerGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = innerGlow;
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 1.2, 0, PI2);
            ctx.fill();

            // ── 3. Segmented Ring Gauge ──
            var thickness = Math.max(6, radius * 0.14);
            var colorFnLocal = function(t) {
                return threeStopColor(t, colorLow, colorMid, colorHigh);
            };
            drawSegmentedRing(ctx, cx, cy, radius, thickness, pct, colorFnLocal, glowIntensity);

            // ── 4. Central Numeric Display ──
            // BPM number
            var bpmFontSize = Math.max(16, Math.min(72, radius * 0.5));
            ctx.font = 'bold ' + bpmFontSize + 'px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = currentColor;
            ctx.shadowBlur = 8 + glowIntensity * 12;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(formatNumber(rawBPM), cx, cy - bpmFontSize * 0.15);
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // "BETS/MIN" label
            var labelFontSize = Math.max(8, bpmFontSize * 0.22);
            ctx.font = '600 ' + labelFontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText('BETS / MIN', cx, cy + bpmFontSize * 0.35);

            // Trend arrow + change label (own line below BETS/MIN)
            var trend = getTrendArrow(rawBPM, prevBPM);
            var nextLineY = cy + bpmFontSize * 0.55;
            if (trend.symbol) {
                var arrowSize = Math.max(8, bpmFontSize * 0.18);
                var changePct = prevBPM > 0 ? Math.round(((rawBPM - prevBPM) / prevBPM) * 100) : 0;
                var changeStr = trend.symbol + ' ' + (changePct >= 0 ? '+' : '') + changePct + '%';
                ctx.font = '600 ' + arrowSize + 'px sans-serif';
                ctx.fillStyle = trend.color;
                ctx.fillText(changeStr, cx, nextLineY);
                nextLineY += arrowSize * 1.5;
            }

            // Peak indicator
            if (showPeak && peakBPM > 0) {
                var peakFontSize = Math.max(7, bpmFontSize * 0.16);
                ctx.font = '500 ' + peakFontSize + 'px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fillText('PEAK: ' + formatNumber(peakBPM), cx, nextLineY);
            }

            // ── 5. Match Name Bar ──
            if (matchName) {
                var barFontSize = Math.max(10, Math.min(22, w * 0.028));
                var barPad = barFontSize * 0.6;
                ctx.font = 'bold ' + barFontSize + 'px sans-serif';
                var textW = ctx.measureText(matchName).width;
                var barW = textW + barPad * 4;
                var barH = barFontSize + barPad * 2;
                var barX = cx - barW / 2;
                var barY = 10;

                // Background pill
                roundRect(ctx, barX, barY, barW, barH, barH / 2);
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fill();

                // Border glow
                ctx.strokeStyle = hexToRgba(currentColor, 0.3);
                ctx.lineWidth = 1;
                roundRect(ctx, barX, barY, barW, barH, barH / 2);
                ctx.stroke();

                // Text
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold ' + barFontSize + 'px sans-serif';
                ctx.fillText(matchName, cx, barY + barH / 2);
            }

            // ── 6. Particles ──
            if (showParticles) {
                updateParticles(this._particles, cx, cy, pct, w, h, currentColor);
                drawParticles(ctx, this._particles);
            } else {
                this._particles = [];
            }

            // ── 7. Volume Breakdown Bar ──
            if (showBreakdown) {
                var volBarW = w * 0.5;
                var volBarH = Math.max(4, h * 0.012);
                var volBarX = cx - volBarW / 2;
                var volBarY = h - 20 - volBarH;
                var volBarR = volBarH / 2;

                // Background track
                roundRect(ctx, volBarX, volBarY, volBarW, volBarH, volBarR);
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fill();

                // Filled portion
                var fillW = Math.max(volBarH, volBarW * pct);
                roundRect(ctx, volBarX, volBarY, fillW, volBarH, volBarR);
                ctx.fillStyle = currentColor;
                ctx.globalAlpha = 0.6 + 0.4 * glowIntensity;
                ctx.fill();
                ctx.globalAlpha = 1;

                // Label below bar
                var volLabelSize = Math.max(7, h * 0.018);
                ctx.font = '500 ' + volLabelSize + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillText(Math.round(pct * 100) + '% CAPACITY', cx, volBarY + volBarH + 4);
            }

            // Reset text alignment
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        // ── Animation Timer ─────────────────────────────────────

        _startAnimation: function() {
            if (this._timer) return;
            var self = this;
            var interval = ANIM_INTERVALS[self._animSpeed] || 45;
            this._timer = setInterval(function() {
                self.invalidateUpdateView();
            }, interval);
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
