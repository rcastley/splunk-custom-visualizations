/*
 * Geographic Bet Flow Map — Splunk Custom Visualization
 *
 * Simplified world map showing animated particle flows from bet origin
 * countries to the match venue. Size/intensity proportional to betting volume.
 *
 * Expected SPL columns: country (required), lat (required), lon (required),
 *   volume (required), venue_lat (optional), venue_lon (optional)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var ANIM_INTERVALS = { slow: 60, medium: 35, fast: 18 };
    var PARTICLE_COUNTS = { low: 3, medium: 6, high: 10 };

    // ── Continent Outlines (simplified [lon, lat] coordinates) ──

    var CONTINENTS = [
        // North America
        [
            [-130, 50], [-125, 55], [-120, 60], [-110, 65], [-100, 68],
            [-85, 70], [-75, 65], [-60, 55], [-65, 45], [-70, 42],
            [-75, 35], [-80, 30], [-85, 28], [-90, 28], [-95, 25],
            [-100, 20], [-105, 20], [-110, 25], [-115, 30], [-120, 35],
            [-125, 40], [-130, 45], [-130, 50]
        ],
        // Central America
        [
            [-100, 20], [-95, 18], [-90, 16], [-85, 14], [-82, 10],
            [-80, 8], [-78, 8], [-80, 10], [-85, 12], [-88, 16],
            [-92, 18], [-97, 20], [-100, 20]
        ],
        // South America
        [
            [-80, 10], [-75, 12], [-70, 12], [-60, 5], [-52, 3],
            [-45, -2], [-40, -5], [-38, -10], [-37, -15], [-40, -22],
            [-45, -25], [-50, -30], [-55, -35], [-60, -40], [-65, -45],
            [-70, -50], [-75, -52], [-72, -47], [-70, -40], [-72, -30],
            [-70, -20], [-75, -15], [-77, -5], [-80, 0], [-80, 5],
            [-78, 8], [-80, 10]
        ],
        // Europe
        [
            [-10, 36], [-5, 36], [0, 38], [5, 44], [3, 47], [-2, 48],
            [-5, 50], [-10, 52], [-8, 55], [-5, 58], [5, 60], [10, 58],
            [12, 55], [15, 55], [18, 56], [22, 55], [25, 58], [28, 60],
            [30, 62], [35, 65], [40, 68], [42, 65], [40, 60], [35, 55],
            [30, 50], [28, 46], [25, 42], [22, 38], [20, 36], [15, 38],
            [10, 38], [5, 40], [0, 38], [-5, 36], [-10, 36]
        ],
        // Africa
        [
            [-15, 30], [-17, 20], [-17, 15], [-15, 10], [-10, 5],
            [-5, 5], [0, 5], [5, 4], [10, 4], [15, 7], [20, 10],
            [25, 10], [30, 8], [35, 5], [40, 0], [42, -2], [45, -10],
            [40, -15], [38, -20], [35, -25], [32, -30], [28, -34],
            [20, -35], [15, -30], [12, -25], [15, -18], [12, -12],
            [10, -5], [8, 0], [5, 4], [0, 5], [-5, 5], [-10, 5],
            [-15, 10], [-17, 15], [-17, 20], [-15, 25], [-13, 30],
            [-10, 34], [-5, 36], [-10, 36], [-15, 30]
        ],
        // Asia (simplified)
        [
            [40, 68], [50, 70], [60, 72], [80, 72], [100, 70],
            [120, 68], [135, 65], [140, 60], [145, 55], [142, 50],
            [135, 45], [130, 40], [125, 35], [122, 30], [120, 25],
            [115, 20], [110, 15], [105, 10], [100, 5], [95, 8],
            [90, 12], [85, 15], [80, 10], [75, 12], [70, 20],
            [65, 25], [60, 25], [55, 22], [50, 25], [45, 30],
            [40, 35], [35, 35], [30, 38], [28, 42], [30, 46],
            [32, 50], [35, 55], [40, 60], [40, 68]
        ],
        // Australia
        [
            [115, -20], [120, -18], [130, -14], [135, -12], [140, -15],
            [145, -18], [150, -22], [153, -27], [152, -32], [148, -37],
            [142, -38], [137, -35], [132, -34], [128, -33], [122, -34],
            [118, -35], [115, -33], [113, -28], [114, -24], [115, -20]
        ]
    ];

    // ── Helper Functions (pure, no `this`) ──────────────────────

    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
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

    // Equirectangular projection: lon/lat to canvas x/y
    function lonLatToXY(lon, lat, mapW, mapH, offsetX, offsetY) {
        var x = (lon + 180) / 360 * mapW + offsetX;
        var y = (90 - lat) / 180 * mapH + offsetY;
        return { x: x, y: y };
    }

    // Quadratic bezier point at parameter t
    function bezierPoint(t, p0x, p0y, cpx, cpy, p1x, p1y) {
        var mt = 1 - t;
        var x = mt * mt * p0x + 2 * mt * t * cpx + t * t * p1x;
        var y = mt * mt * p0y + 2 * mt * t * cpy + t * t * p1y;
        return { x: x, y: y };
    }

    // Calculate control point for curved arc between two points
    function calcControlPoint(x0, y0, x1, y1) {
        var mx = (x0 + x1) / 2;
        var my = (y0 + y1) / 2;
        var dx = x1 - x0;
        var dy = y1 - y0;
        var dist = Math.sqrt(dx * dx + dy * dy);
        // Perpendicular offset proportional to distance
        var bulge = dist * 0.3;
        // Always curve upward (negative y)
        var nx = -dy / (dist || 1);
        var ny = dx / (dist || 1);
        // Pick the direction that curves upward
        if (ny > 0) { nx = -nx; ny = -ny; }
        return { x: mx + nx * bulge, y: my + ny * bulge };
    }

    // Draw the simplified world map
    function drawMap(ctx, mapW, mapH, offsetX, offsetY, mapColor) {
        ctx.strokeStyle = mapColor;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';

        for (var c = 0; c < CONTINENTS.length; c++) {
            var pts = CONTINENTS[c];
            ctx.beginPath();
            for (var p = 0; p < pts.length; p++) {
                var pos = lonLatToXY(pts[p][0], pts[p][1], mapW, mapH, offsetX, offsetY);
                if (p === 0) {
                    ctx.moveTo(pos.x, pos.y);
                } else {
                    ctx.lineTo(pos.x, pos.y);
                }
            }
            ctx.closePath();
            ctx.fillStyle = hexToRgba(mapColor, 0.08);
            ctx.fill();
            ctx.stroke();
        }
    }

    // Draw a glowing dot for origin point
    function drawOriginDot(ctx, x, y, radius, color) {
        // Outer glow
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.12);
        ctx.fill();

        // Middle glow
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.25);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Highlight
        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
    }

    // Draw pulsing venue marker
    function drawVenueMarker(ctx, x, y, baseRadius, color, pulsePhase) {
        var pulseScale = 1 + 0.3 * Math.sin(pulsePhase);
        var r = baseRadius * pulseScale;

        // Outer pulse ring
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(color, 0.15 + 0.1 * Math.sin(pulsePhase));
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;

        // Second ring
        ctx.beginPath();
        ctx.arc(x, y, r * 2, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(color, 0.3);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;

        // Glow
        ctx.beginPath();
        ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.15);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Star shape (4-point) drawn over center
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(pulsePhase * 0.3);
        ctx.beginPath();
        for (var i = 0; i < 8; i++) {
            var angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
            var starR = (i % 2 === 0) ? r * 1.2 : r * 0.5;
            var sx = Math.cos(angle) * starR;
            var sy = Math.sin(angle) * starR;
            if (i === 0) {
                ctx.moveTo(sx, sy);
            } else {
                ctx.lineTo(sx, sy);
            }
        }
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.6);
        ctx.fill();
        ctx.restore();

        // White center
        ctx.beginPath();
        ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
    }

    // Draw a curved arc from origin to destination
    function drawArc(ctx, x0, y0, x1, y1, cpx, cpy, color, alpha) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cpx, cpy, x1, y1);
        ctx.strokeStyle = hexToRgba(color, alpha);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
    }

    // Draw volume legend
    function drawLegend(ctx, w, h, origins, arcColor) {
        if (origins.length === 0) return;

        var maxVol = 0;
        var minVol = Infinity;
        for (var i = 0; i < origins.length; i++) {
            if (origins[i].volume > maxVol) maxVol = origins[i].volume;
            if (origins[i].volume < minVol) minVol = origins[i].volume;
        }

        var legendX = 10;
        var legendY = h - 60;
        var legendW = 140;
        var legendH = 50;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.moveTo(legendX + 4, legendY);
        ctx.lineTo(legendX + legendW - 4, legendY);
        ctx.arcTo(legendX + legendW, legendY, legendX + legendW, legendY + 4, 4);
        ctx.lineTo(legendX + legendW, legendY + legendH - 4);
        ctx.arcTo(legendX + legendW, legendY + legendH, legendX + legendW - 4, legendY + legendH, 4);
        ctx.lineTo(legendX + 4, legendY + legendH);
        ctx.arcTo(legendX, legendY + legendH, legendX, legendY + legendH - 4, 4);
        ctx.lineTo(legendX, legendY + 4);
        ctx.arcTo(legendX, legendY, legendX + 4, legendY, 4);
        ctx.closePath();
        ctx.fill();

        // Title
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('BET VOLUME', legendX + 8, legendY + 6);

        // Gradient bar
        var barX = legendX + 8;
        var barY = legendY + 20;
        var barW = legendW - 16;
        var barH = 6;
        var grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, hexToRgba(arcColor, 0.3));
        grad.addColorStop(1, arcColor);
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, barW, barH);

        // Labels
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'left';
        ctx.fillText(formatNumber(minVol), barX, barY + barH + 8);
        ctx.textAlign = 'right';
        ctx.fillText(formatNumber(maxVol), barX + barW, barY + barH + 8);

        // Reset
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('bet-flow-map-viz');

            // Create canvas element
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            // Internal state
            this._lastGoodData = null;
            this._animTimer = null;
            this._particles = [];
            this._tickCount = 0;
            this._pulsePhase = 0;
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
                    'Awaiting data \u2014 Geographic Bet Flow Map'
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

            // Validate required columns
            if (colIdx.country === undefined || colIdx.lat === undefined ||
                colIdx.lon === undefined || colIdx.volume === undefined) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: country, lat, lon, volume'
                );
            }

            // Build origins array from all rows
            var origins = [];
            var venueLat = 0;
            var venueLon = 0;
            var hasVenue = false;

            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var country = row[colIdx.country] || '';
                var lat = parseFloat(row[colIdx.lat]);
                var lon = parseFloat(row[colIdx.lon]);
                var volume = parseFloat(row[colIdx.volume]);

                if (!country || isNaN(lat) || isNaN(lon) || isNaN(volume)) continue;

                // Read venue from first row that has it
                if (!hasVenue && colIdx.venue_lat !== undefined && colIdx.venue_lon !== undefined) {
                    var vLat = parseFloat(row[colIdx.venue_lat]);
                    var vLon = parseFloat(row[colIdx.venue_lon]);
                    if (!isNaN(vLat) && !isNaN(vLon)) {
                        venueLat = vLat;
                        venueLon = vLon;
                        hasVenue = true;
                    }
                }

                origins.push({
                    country: country,
                    lat: lat,
                    lon: lon,
                    volume: volume
                });
            }

            var result = {
                origins: origins,
                venueLat: venueLat,
                venueLon: venueLon
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
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            if (!data.origins || data.origins.length === 0) return;

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var arcColor = config[ns + 'arcColor'] || '#0088ff';
            var venueColor = config[ns + 'venueColor'] || '#ff6600';
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var showMap = (config[ns + 'showMap'] || 'true') === 'true';
            var mapColor = config[ns + 'mapColor'] || '#1a2a3a';
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var particleDensity = config[ns + 'particleDensity'] || 'medium';

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

            // Store render state for animation
            this._renderState = {
                w: w,
                h: h,
                dpr: dpr,
                data: data,
                arcColor: arcColor,
                venueColor: venueColor,
                showLabels: showLabels,
                showMap: showMap,
                mapColor: mapColor,
                particleDensity: particleDensity
            };

            // Initialize particles if needed
            this._initParticles(data, particleDensity);

            // Draw the scene
            this._drawScene(ctx, w, h);

            // Start animation if not already running
            var interval = ANIM_INTERVALS[animSpeed] || 35;
            this._startAnimation(interval);
        },

        _initParticles: function(data, density) {
            var pCount = PARTICLE_COUNTS[density] || 6;
            var origins = data.origins;

            // Only reinit if origin count or density changed
            var expectedTotal = origins.length * pCount;
            if (this._particles.length === expectedTotal && this._lastDensity === density) return;
            this._lastDensity = density;

            this._particles = [];
            for (var i = 0; i < origins.length; i++) {
                for (var p = 0; p < pCount; p++) {
                    this._particles.push({
                        originIdx: i,
                        t: Math.random(),          // position along curve [0..1]
                        speed: 0.003 + Math.random() * 0.005,
                        size: 1 + Math.random() * 2,
                        alpha: 0.4 + Math.random() * 0.6
                    });
                }
            }
        },

        _drawScene: function(ctx, w, h) {
            var rs = this._renderState;
            if (!rs) return;

            var data = rs.data;
            var origins = data.origins;

            // Map layout: use 90% of canvas with margin
            var margin = Math.min(w, h) * 0.05;
            var mapW = w - margin * 2;
            var mapH = h - margin * 2;
            var offsetX = margin;
            var offsetY = margin;

            // ── Clear canvas with dark background ──
            ctx.fillStyle = '#0a0e14';
            ctx.fillRect(0, 0, w, h);

            // ── Draw map outline ──
            if (rs.showMap) {
                drawMap(ctx, mapW, mapH, offsetX, offsetY, rs.mapColor);
            }

            // ── Compute max volume for sizing ──
            var maxVol = 0;
            for (var i = 0; i < origins.length; i++) {
                if (origins[i].volume > maxVol) maxVol = origins[i].volume;
            }
            if (maxVol === 0) maxVol = 1;

            // ── Convert venue to screen coords ──
            var venueScreen = lonLatToXY(data.venueLon, data.venueLat, mapW, mapH, offsetX, offsetY);

            // ── Draw arcs and origin dots ──
            var arcData = [];
            for (var j = 0; j < origins.length; j++) {
                var o = origins[j];
                var volNorm = o.volume / maxVol;
                var originScreen = lonLatToXY(o.lon, o.lat, mapW, mapH, offsetX, offsetY);
                var cp = calcControlPoint(originScreen.x, originScreen.y, venueScreen.x, venueScreen.y);

                arcData.push({
                    ox: originScreen.x,
                    oy: originScreen.y,
                    cpx: cp.x,
                    cpy: cp.y,
                    vx: venueScreen.x,
                    vy: venueScreen.y,
                    volNorm: volNorm
                });

                // Draw arc
                var arcAlpha = 0.15 + volNorm * 0.35;
                drawArc(ctx, originScreen.x, originScreen.y, venueScreen.x, venueScreen.y,
                    cp.x, cp.y, rs.arcColor, arcAlpha);

                // Draw origin dot
                var dotRadius = 3 + volNorm * 5;
                drawOriginDot(ctx, originScreen.x, originScreen.y, dotRadius, rs.arcColor);

                // Draw label
                if (rs.showLabels) {
                    var fontSize = Math.max(8, Math.min(11, Math.min(w, h) * 0.022));
                    ctx.font = fontSize + 'px sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(o.country, originScreen.x, originScreen.y - dotRadius - 4);

                    // Volume number below dot
                    ctx.font = (fontSize - 1) + 'px monospace';
                    ctx.fillStyle = hexToRgba(rs.arcColor, 0.6);
                    ctx.textBaseline = 'top';
                    ctx.fillText(formatNumber(o.volume), originScreen.x, originScreen.y + dotRadius + 3);

                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'alphabetic';
                }
            }

            // Store arc data for particle animation
            this._arcData = arcData;

            // ── Draw particles along arcs ──
            for (var k = 0; k < this._particles.length; k++) {
                var particle = this._particles[k];
                var ad = arcData[particle.originIdx];
                if (!ad) continue;

                var pt = bezierPoint(particle.t, ad.ox, ad.oy, ad.cpx, ad.cpy, ad.vx, ad.vy);

                // Particle glow
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, particle.size * 2, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(rs.arcColor, particle.alpha * 0.2);
                ctx.fill();

                // Particle core
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, particle.size, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(rs.arcColor, particle.alpha);
                ctx.fill();
            }

            // ── Draw venue marker (on top of everything) ──
            var venueRadius = Math.max(5, Math.min(w, h) * 0.015);
            drawVenueMarker(ctx, venueScreen.x, venueScreen.y, venueRadius, rs.venueColor, this._pulsePhase);

            // ── Draw venue label ──
            if (rs.showLabels) {
                var vFontSize = Math.max(9, Math.min(13, Math.min(w, h) * 0.028));
                ctx.font = 'bold ' + vFontSize + 'px sans-serif';
                ctx.fillStyle = hexToRgba(rs.venueColor, 0.9);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('VENUE', venueScreen.x, venueScreen.y - venueRadius * 3 - 4);
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }

            // ── Draw legend ──
            drawLegend(ctx, w, h, origins, rs.arcColor);
        },

        _startAnimation: function(interval) {
            if (this._animTimer) return; // Already running

            var self = this;
            this._animTimer = setInterval(function() {
                self._tickCount++;
                self._pulsePhase += 0.08;

                // Update particles
                for (var i = 0; i < self._particles.length; i++) {
                    var p = self._particles[i];
                    p.t += p.speed;
                    if (p.t >= 1) {
                        p.t = 0;
                        p.speed = 0.003 + Math.random() * 0.005;
                        p.alpha = 0.4 + Math.random() * 0.6;
                    }
                }

                // Redraw
                var rs = self._renderState;
                if (!rs) return;

                var dpr = rs.dpr;
                self.canvas.width = rs.w * dpr;
                self.canvas.height = rs.h * dpr;
                var ctx = self.canvas.getContext('2d');
                if (!ctx) return;
                ctx.scale(dpr, dpr);

                self._drawScene(ctx, rs.w, rs.h);
            }, interval);
        },

        _stopAnimation: function() {
            if (this._animTimer) {
                clearInterval(this._animTimer);
                this._animTimer = null;
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
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            // Dark background
            ctx.fillStyle = '#0a0e14';
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

            // Football emoji above text
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u26BD', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text below emoji
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this._stopAnimation();
            this.invalidateUpdateView();
        },

        destroy: function() {
            this._stopAnimation();
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});
