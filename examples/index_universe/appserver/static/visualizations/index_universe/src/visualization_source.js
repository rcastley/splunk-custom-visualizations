/*
 * Index Universe — Splunk Custom Visualization
 *
 * Orbital bubble chart showing Splunk indexes as celestial bodies.
 * Bubble size = disk usage, color = event count, orbit = retention age.
 *
 * Expected SPL columns: title, totalEventCount, currentDBSizeMB,
 *                       maxTotalDataSizeMB, retention_days
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var ORBIT_TIERS = [
        { label: '30d',  maxDays: 30 },
        { label: '90d',  maxDays: 90 },
        { label: '180d', maxDays: 180 },
        { label: '1y',   maxDays: 365 },
        { label: '3y',   maxDays: 1095 },
        { label: '10y+', maxDays: Infinity }
    ];

    var COLOR_SCHEMES = {
        cool: {
            low:  '#1a5276',
            mid:  '#2e86c1',
            high: '#f39c12',
            peak: '#e74c3c'
        },
        warm: {
            low:  '#00857c',
            mid:  '#00d2be',
            high: '#ff8700',
            peak: '#e10600'
        },
        neon: {
            low:  '#0077b6',
            mid:  '#00f5d4',
            high: '#fee440',
            peak: '#f72585'
        }
    };

    // ── Helper functions ────────────────────────────────────────

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
        return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    function eventCountToColor(count, maxCount, scheme) {
        if (maxCount <= 0) return scheme.low;
        // Use log scale for event counts (they vary enormously)
        var logVal = Math.log10(Math.max(1, count));
        var logMax = Math.log10(Math.max(1, maxCount));
        var t = clamp(logVal / logMax, 0, 1);

        if (t <= 0.33) return lerpColor(scheme.low, scheme.mid, t / 0.33);
        if (t <= 0.66) return lerpColor(scheme.mid, scheme.high, (t - 0.33) / 0.33);
        return lerpColor(scheme.high, scheme.peak, (t - 0.66) / 0.34);
    }

    function sizeToRadius(sizeMB, maxSizeMB, minR, maxR) {
        if (maxSizeMB <= 0) return minR;
        // Use sqrt scale so area is proportional to size
        var t = Math.sqrt(clamp(sizeMB / maxSizeMB, 0, 1));
        return minR + t * (maxR - minR);
    }

    function getOrbitTierIndex(retentionDays) {
        for (var i = 0; i < ORBIT_TIERS.length; i++) {
            if (retentionDays <= ORBIT_TIERS[i].maxDays) return i;
        }
        return ORBIT_TIERS.length - 1;
    }

    function formatEventCount(count) {
        if (count >= 1000000000) return (count / 1000000000).toFixed(1) + 'B';
        if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
        if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
        return String(Math.round(count));
    }

    function formatSizeMB(mb) {
        if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
        return Math.round(mb) + ' MB';
    }

    function drawStarField(ctx, w, h, stars) {
        for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,' + s.a + ')';
            ctx.fill();
        }
    }

    function initStarField(count) {
        var stars = [];
        for (var i = 0; i < count; i++) {
            // Deterministic pseudo-random based on index
            var seed = i * 137.508;
            stars.push({
                x: (Math.sin(seed) * 0.5 + 0.5),
                y: (Math.cos(seed * 1.3) * 0.5 + 0.5),
                r: 0.3 + (seed % 3) * 0.3,
                a: 0.1 + (seed % 5) * 0.06
            });
        }
        return stars;
    }

    function drawOrbitRing(ctx, cx, cy, radius, label, labelFS) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,215,245,0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label at top of ring
        if (label) {
            ctx.font = labelFS + 'px sans-serif';
            ctx.fillStyle = 'rgba(220,230,255,0.5)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, cx, cy - radius - 3);
        }
    }

    function drawBubble(ctx, x, y, radius, color, showGlow) {
        // Glow
        if (showGlow) {
            ctx.shadowColor = color;
            ctx.shadowBlur = radius * 0.6;
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Border
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Specular highlight
        var hlR = radius * 0.35;
        var hlX = x - radius * 0.25;
        var hlY = y - radius * 0.25;
        var hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR);
        hlGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
        hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(hlX, hlY, hlR, 0, Math.PI * 2);
        ctx.fillStyle = hlGrad;
        ctx.fill();
    }

    function drawTooltip(ctx, x, y, lines, w, h) {
        var tipFS = Math.max(10, Math.min(13, w * 0.02));
        var pad = 8;
        var lineH = tipFS + 4;
        var tipW = 0;

        ctx.font = tipFS + 'px sans-serif';
        for (var i = 0; i < lines.length; i++) {
            var lw = ctx.measureText(lines[i]).width;
            if (lw > tipW) tipW = lw;
        }
        tipW += pad * 2;
        var tipH = lineH * lines.length + pad * 2;

        // Position tooltip, keep on screen
        var tx = x + 12;
        var ty = y - tipH / 2;
        if (tx + tipW > w - 5) tx = x - tipW - 12;
        if (ty < 5) ty = 5;
        if (ty + tipH > h - 5) ty = h - tipH - 5;

        // Background
        ctx.fillStyle = 'rgba(10,12,25,0.92)';
        ctx.beginPath();
        ctx.moveTo(tx + 4, ty);
        ctx.lineTo(tx + tipW - 4, ty);
        ctx.arcTo(tx + tipW, ty, tx + tipW, ty + 4, 4);
        ctx.lineTo(tx + tipW, ty + tipH - 4);
        ctx.arcTo(tx + tipW, ty + tipH, tx + tipW - 4, ty + tipH, 4);
        ctx.lineTo(tx + 4, ty + tipH);
        ctx.arcTo(tx, ty + tipH, tx, ty + tipH - 4, 4);
        ctx.lineTo(tx, ty + 4);
        ctx.arcTo(tx, ty, tx + 4, ty, 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,150,220,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (var j = 0; j < lines.length; j++) {
            // First line bold (title)
            if (j === 0) {
                ctx.font = 'bold ' + tipFS + 'px sans-serif';
                ctx.fillStyle = '#ffffff';
            } else {
                ctx.font = tipFS + 'px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
            }
            ctx.fillText(lines[j], tx + pad, ty + pad + j * lineH);
        }
    }

    // Collision avoidance: nudge bubbles that overlap
    function resolveCollisions(bubbles, iterations) {
        for (var iter = 0; iter < iterations; iter++) {
            for (var i = 0; i < bubbles.length; i++) {
                for (var j = i + 1; j < bubbles.length; j++) {
                    var dx = bubbles[j].x - bubbles[i].x;
                    var dy = bubbles[j].y - bubbles[i].y;
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    var minDist = bubbles[i].radius + bubbles[j].radius + 3;
                    if (dist < minDist && dist > 0) {
                        var overlap = (minDist - dist) / 2;
                        var nx = dx / dist;
                        var ny = dy / dist;
                        bubbles[i].x -= nx * overlap;
                        bubbles[i].y -= ny * overlap;
                        bubbles[j].x += nx * overlap;
                        bubbles[j].y += ny * overlap;
                    }
                }
            }
        }
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('index-universe-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
            this._stars = initStarField(80);
            this._hoverIndex = -1;
            this._bubblePositions = [];

            // Hover tracking
            var self = this;
            this.canvas.addEventListener('mousemove', function(event) {
                var canvasRect = self.canvas.getBoundingClientRect();
                var mx = event.clientX - canvasRect.left;
                var my = event.clientY - canvasRect.top;
                var prevHover = self._hoverIndex;
                self._hoverIndex = -1;

                for (var i = 0; i < self._bubblePositions.length; i++) {
                    var b = self._bubblePositions[i];
                    var dx = mx - b.x;
                    var dy = my - b.y;
                    if (dx * dx + dy * dy <= b.radius * b.radius) {
                        self._hoverIndex = i;
                        break;
                    }
                }

                self.canvas.style.cursor = self._hoverIndex >= 0 ? 'pointer' : 'default';
                if (self._hoverIndex !== prevHover) {
                    self._mouseX = mx;
                    self._mouseY = my;
                    self.invalidateUpdateView();
                }
            });

            this.canvas.addEventListener('mouseleave', function() {
                if (self._hoverIndex !== -1) {
                    self._hoverIndex = -1;
                    self.canvas.style.cursor = 'default';
                    self.invalidateUpdateView();
                }
            });

            // Drilldown on click
            this.canvas.addEventListener('click', function(event) {
                if (self._hoverIndex < 0 || !self._bubblePositions[self._hoverIndex]) return;
                var b = self._bubblePositions[self._hoverIndex];
                var drilldownData = { title: b.title };
                event.preventDefault();
                self.drilldown({
                    action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                    data: drilldownData
                }, event);
            });
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
                    'Awaiting data \u2014 Index Universe'
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

            var indexes = [];
            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var title = getStr(row, 'title', '');
                if (!title || title === 'none') continue;
                indexes.push({
                    title: title,
                    totalEventCount: getVal(row, 'totalEventCount', 0),
                    currentDBSizeMB: getVal(row, 'currentDBSizeMB', 0),
                    maxTotalDataSizeMB: getVal(row, 'maxTotalDataSizeMB', 0),
                    retention_days: getVal(row, 'retention_days', 30)
                });
            }

            // Sort by retention days then by size for consistent layout
            indexes.sort(function(a, b) {
                var tierA = getOrbitTierIndex(a.retention_days);
                var tierB = getOrbitTierIndex(b.retention_days);
                if (tierA !== tierB) return tierA - tierB;
                return b.currentDBSizeMB - a.currentDBSizeMB;
            });

            var result = { indexes: indexes };
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
                if (this._lastGoodData) {
                    data = this._lastGoodData;
                } else {
                    return;
                }
            }

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var colorScheme = config[ns + 'colorScheme'] || 'cool';
            var minBubbleSize = parseInt(config[ns + 'minBubbleSize'], 10) || 8;
            var maxBubbleSize = parseInt(config[ns + 'maxBubbleSize'], 10) || 50;
            var showOrbits = (config[ns + 'showOrbits'] || 'true') === 'true';
            var showLegend = (config[ns + 'showLegend'] || 'true') === 'true';
            var showGlow = (config[ns + 'showGlow'] || 'true') === 'true';

            var scheme = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cool;

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

            var indexes = data.indexes;
            if (!indexes || indexes.length === 0) return;

            // ── Star field background ──
            drawStarField(ctx, w, h, this._stars);

            // ── Layout calculations ──
            var cx = w / 2;
            var cy = h / 2;
            var legendH = showLegend ? 50 : 0;
            var maxOrbitR = Math.min(cx, cy - legendH / 2) * 0.88;
            var minOrbitR = maxOrbitR * 0.18;

            // Find which orbit tiers are populated
            var usedTiers = {};
            for (var ti = 0; ti < indexes.length; ti++) {
                var tier = getOrbitTierIndex(indexes[ti].retention_days);
                usedTiers[tier] = true;
            }

            // Build active tier list
            var activeTiers = [];
            for (var at = 0; at < ORBIT_TIERS.length; at++) {
                if (usedTiers[at]) activeTiers.push(at);
            }
            if (activeTiers.length === 0) return;

            // Map tier index to orbit radius
            var tierRadii = {};
            for (var ri = 0; ri < activeTiers.length; ri++) {
                var t = activeTiers.length > 1 ? ri / (activeTiers.length - 1) : 0.5;
                tierRadii[activeTiers[ri]] = minOrbitR + t * (maxOrbitR - minOrbitR);
            }

            // ── Draw orbit rings ──
            if (showOrbits) {
                var orbitLabelFS = Math.max(8, Math.min(12, w * 0.018));
                for (var oi = 0; oi < activeTiers.length; oi++) {
                    var oTier = activeTiers[oi];
                    drawOrbitRing(ctx, cx, cy, tierRadii[oTier], ORBIT_TIERS[oTier].label, orbitLabelFS);
                }
            }

            // ── Draw center "core" ──
            var coreR = Math.max(8, minOrbitR * 0.35);
            var coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
            coreGrad.addColorStop(0, 'rgba(100,180,255,0.4)');
            coreGrad.addColorStop(0.7, 'rgba(60,120,200,0.15)');
            coreGrad.addColorStop(1, 'rgba(40,80,160,0)');
            ctx.beginPath();
            ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
            ctx.fillStyle = coreGrad;
            ctx.fill();

            var coreLabelFS = Math.max(7, Math.min(11, coreR * 0.6));
            ctx.font = '600 ' + coreLabelFS + 'px sans-serif';
            ctx.fillStyle = 'rgba(150,200,255,0.6)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SPLUNK', cx, cy);

            // ── Compute bubble positions ──
            var maxEventCount = 0;
            var maxSizeMB = 0;
            for (var mi = 0; mi < indexes.length; mi++) {
                if (indexes[mi].totalEventCount > maxEventCount) maxEventCount = indexes[mi].totalEventCount;
                if (indexes[mi].currentDBSizeMB > maxSizeMB) maxSizeMB = indexes[mi].currentDBSizeMB;
            }

            // Cap bubble size to a fraction of the available space
            var scaledMaxBubble = Math.min(maxBubbleSize, maxOrbitR * 0.15);
            var scaledMinBubble = Math.min(minBubbleSize, scaledMaxBubble * 0.5);

            // Group indexes by tier for angle distribution
            var tierGroups = {};
            for (var gi = 0; gi < indexes.length; gi++) {
                var gTier = getOrbitTierIndex(indexes[gi].retention_days);
                if (!tierGroups[gTier]) tierGroups[gTier] = [];
                tierGroups[gTier].push(gi);
            }

            var bubbles = [];
            for (var bt = 0; bt < ORBIT_TIERS.length; bt++) {
                if (!tierGroups[bt]) continue;
                var group = tierGroups[bt];
                var orbitR = tierRadii[bt];
                var angleStep = (Math.PI * 2) / group.length;
                // Offset each tier so bubbles don't align radially
                var angleOffset = bt * 0.618 * Math.PI;

                for (var bi = 0; bi < group.length; bi++) {
                    var idx = indexes[group[bi]];
                    var angle = angleOffset + bi * angleStep;
                    var bRadius = sizeToRadius(idx.currentDBSizeMB, maxSizeMB, scaledMinBubble, scaledMaxBubble);
                    bubbles.push({
                        x: cx + orbitR * Math.cos(angle),
                        y: cy + orbitR * Math.sin(angle),
                        radius: bRadius,
                        color: eventCountToColor(idx.totalEventCount, maxEventCount, scheme),
                        title: idx.title,
                        totalEventCount: idx.totalEventCount,
                        currentDBSizeMB: idx.currentDBSizeMB,
                        maxTotalDataSizeMB: idx.maxTotalDataSizeMB,
                        retention_days: idx.retention_days
                    });
                }
            }

            // Resolve overlapping bubbles
            resolveCollisions(bubbles, 8);

            // Store for hover/click detection
            this._bubblePositions = bubbles;

            // ── Draw bubbles ──
            for (var di = 0; di < bubbles.length; di++) {
                var bub = bubbles[di];
                var isHovered = (di === this._hoverIndex);
                var drawR = isHovered ? bub.radius * 1.1 : bub.radius;

                drawBubble(ctx, bub.x, bub.y, drawR, bub.color, showGlow);

                // Highlight ring on hover
                if (isHovered) {
                    ctx.beginPath();
                    ctx.arc(bub.x, bub.y, drawR + 3, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }

                // Label
                if (showLabels && bub.radius >= scaledMinBubble + 2) {
                    var lblFS = Math.max(7, Math.min(11, bub.radius * 0.55));
                    ctx.font = '600 ' + lblFS + 'px sans-serif';
                    var lblText = bub.title;
                    // Truncate if too wide
                    var maxLblW = bub.radius * 1.8;
                    if (ctx.measureText(lblText).width > maxLblW) {
                        while (lblText.length > 3 && ctx.measureText(lblText + '..').width > maxLblW) {
                            lblText = lblText.slice(0, -1);
                        }
                        lblText += '..';
                    }
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(lblText, bub.x, bub.y);
                } else if (showLabels) {
                    // Small bubbles: label below
                    var sLblFS = Math.max(7, Math.min(10, w * 0.014));
                    ctx.font = sLblFS + 'px sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(bub.title, bub.x, bub.y + bub.radius + 3);
                }
            }

            // ── Tooltip on hover ──
            if (this._hoverIndex >= 0 && this._hoverIndex < bubbles.length) {
                var hb = bubbles[this._hoverIndex];
                var tooltipLines = [
                    hb.title,
                    'Events: ' + formatEventCount(hb.totalEventCount),
                    'Disk: ' + formatSizeMB(hb.currentDBSizeMB) + ' / ' + formatSizeMB(hb.maxTotalDataSizeMB),
                    'Retention: ' + hb.retention_days + ' days'
                ];
                drawTooltip(ctx, this._mouseX, this._mouseY, tooltipLines, w, h);
            }

            // ── Legend ──
            if (showLegend) {
                var legFS = Math.max(8, Math.min(11, w * 0.016));
                var legY = h - legendH + 10;

                // Color legend (event count)
                ctx.font = legFS + 'px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'left';

                var gradW = Math.min(120, w * 0.18);
                var gradH = 8;
                var gradX = w * 0.12;

                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('Events:', gradX - ctx.measureText('Events: ').width, legY + gradH / 2);

                var grad = ctx.createLinearGradient(gradX, 0, gradX + gradW, 0);
                grad.addColorStop(0, scheme.low);
                grad.addColorStop(0.33, scheme.mid);
                grad.addColorStop(0.66, scheme.high);
                grad.addColorStop(1, scheme.peak);
                ctx.fillStyle = grad;
                ctx.fillRect(gradX, legY, gradW, gradH);
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(gradX, legY, gradW, gradH);

                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = (legFS - 1) + 'px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText('Low', gradX, legY + gradH + legFS);
                ctx.textAlign = 'right';
                ctx.fillText('High', gradX + gradW, legY + gradH + legFS);

                // Size legend (disk usage)
                var sizeX = w * 0.65;
                ctx.textAlign = 'left';
                ctx.font = legFS + 'px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('Disk:', sizeX, legY + gradH / 2);

                var smallR = scaledMinBubble * 0.8;
                var bigR = scaledMaxBubble * 0.5;
                var sizeStartX = sizeX + ctx.measureText('Disk: ').width + 5;

                ctx.beginPath();
                ctx.arc(sizeStartX + smallR, legY + gradH / 2, smallR, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(100,150,220,0.4)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 0.5;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(sizeStartX + smallR * 2 + bigR + 8, legY + gradH / 2, bigR, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(100,150,220,0.4)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.stroke();

                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = (legFS - 1) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Small', sizeStartX + smallR, legY + gradH + legFS);
                ctx.fillText('Large', sizeStartX + smallR * 2 + bigR + 8, legY + gradH + legFS);
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

            // Draw star field even in no-data state
            drawStarField(ctx, w, h, this._stars);

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
            ctx.fillText('\uD83C\uDF0C', w / 2, h / 2 - fontSize * 0.5 - gap);

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
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
