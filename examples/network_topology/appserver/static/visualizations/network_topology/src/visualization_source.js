/*
 * Network Topology — Splunk Custom Visualization
 *
 * Force-directed network graph showing nodes as circles connected by
 * edges/links. Supports status-based node coloring, directional arrows,
 * and configurable layout parameters.
 *
 * Expected SPL columns: source, dest, weight (optional), status (optional)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Force-directed layout (ES5) ──────────────────────────────

    function forceLayout(nodes, edges, width, height, iterations) {
        var padding = 60;
        var area = (width - padding * 2) * (height - padding * 2);
        var k = Math.sqrt(area / Math.max(nodes.length, 1));
        var repulsionK = k * k;
        var attractionK = 0.05;
        var maxDisplacement = 50;
        var i, j, n, e;

        // Initialize random positions within bounds
        for (i = 0; i < nodes.length; i++) {
            nodes[i].x = padding + Math.random() * (width - padding * 2);
            nodes[i].y = padding + Math.random() * (height - padding * 2);
            nodes[i].vx = 0;
            nodes[i].vy = 0;
        }

        // Build node index map for fast lookup
        var nodeMap = {};
        for (i = 0; i < nodes.length; i++) {
            nodeMap[nodes[i].name] = i;
        }

        for (var iter = 0; iter < iterations; iter++) {
            var temp = maxDisplacement * (1 - iter / iterations);

            // Reset forces
            for (i = 0; i < nodes.length; i++) {
                nodes[i].vx = 0;
                nodes[i].vy = 0;
            }

            // Repulsion between all pairs
            for (i = 0; i < nodes.length; i++) {
                for (j = i + 1; j < nodes.length; j++) {
                    var dx = nodes[i].x - nodes[j].x;
                    var dy = nodes[i].y - nodes[j].y;
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 0.1) dist = 0.1;
                    var force = repulsionK / (dist * dist);
                    var fx = (dx / dist) * force;
                    var fy = (dy / dist) * force;
                    nodes[i].vx += fx;
                    nodes[i].vy += fy;
                    nodes[j].vx -= fx;
                    nodes[j].vy -= fy;
                }
            }

            // Attraction along edges
            for (i = 0; i < edges.length; i++) {
                e = edges[i];
                var srcIdx = nodeMap[e.source];
                var dstIdx = nodeMap[e.dest];
                if (srcIdx === undefined || dstIdx === undefined) continue;
                var edx = nodes[srcIdx].x - nodes[dstIdx].x;
                var edy = nodes[srcIdx].y - nodes[dstIdx].y;
                var eDist = Math.sqrt(edx * edx + edy * edy);
                if (eDist < 0.1) eDist = 0.1;
                var aForce = eDist * attractionK;
                var afx = (edx / eDist) * aForce;
                var afy = (edy / eDist) * aForce;
                nodes[srcIdx].vx -= afx;
                nodes[srcIdx].vy -= afy;
                nodes[dstIdx].vx += afx;
                nodes[dstIdx].vy += afy;
            }

            // Apply forces with temperature cooling
            for (i = 0; i < nodes.length; i++) {
                n = nodes[i];
                var vLen = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
                if (vLen > 0) {
                    var scale = Math.min(vLen, temp) / vLen;
                    n.x += n.vx * scale;
                    n.y += n.vy * scale;
                }
                // Keep within bounds
                n.x = Math.max(padding, Math.min(width - padding, n.x));
                n.y = Math.max(padding, Math.min(height - padding, n.y));
            }
        }

        // Center the layout
        var minX = Infinity, maxX = -Infinity;
        var minY = Infinity, maxY = -Infinity;
        for (i = 0; i < nodes.length; i++) {
            if (nodes[i].x < minX) minX = nodes[i].x;
            if (nodes[i].x > maxX) maxX = nodes[i].x;
            if (nodes[i].y < minY) minY = nodes[i].y;
            if (nodes[i].y > maxY) maxY = nodes[i].y;
        }

        var graphW = maxX - minX;
        var graphH = maxY - minY;
        var availW = width - padding * 2;
        var availH = height - padding * 2;
        var scaleX = graphW > 0 ? availW / graphW : 1;
        var scaleY = graphH > 0 ? availH / graphH : 1;
        var fitScale = Math.min(scaleX, scaleY, 1.5);

        var centerX = width / 2;
        var centerY = height / 2;
        var graphCX = (minX + maxX) / 2;
        var graphCY = (minY + maxY) / 2;

        for (i = 0; i < nodes.length; i++) {
            nodes[i].x = centerX + (nodes[i].x - graphCX) * fitScale;
            nodes[i].y = centerY + (nodes[i].y - graphCY) * fitScale;
        }
    }

    // ── Drawing helpers ──────────────────────────────────────────

    function drawArrowhead(ctx, fromX, fromY, toX, toY, nodeRadius, color) {
        var angle = Math.atan2(toY - fromY, toX - fromX);
        var arrowLen = 8;
        var arrowAngle = Math.PI / 6;

        // Shorten to node edge
        var tipX = toX - Math.cos(angle) * (nodeRadius + 2);
        var tipY = toY - Math.sin(angle) * (nodeRadius + 2);

        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
            tipX - arrowLen * Math.cos(angle - arrowAngle),
            tipY - arrowLen * Math.sin(angle - arrowAngle)
        );
        ctx.lineTo(
            tipX - arrowLen * Math.cos(angle + arrowAngle),
            tipY - arrowLen * Math.sin(angle + arrowAngle)
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    function getNodeColor(node, useStatus, defaultColor, okColor, warnColor, critColor) {
        if (useStatus && node.status) {
            var s = node.status.toLowerCase();
            if (s === 'critical') return critColor;
            if (s === 'warning') return warnColor;
            if (s === 'ok') return okColor;
        }
        return defaultColor;
    }

    // ── Visualization Class ──────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('network-topology-viz');

            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            this._lastGoodData = null;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 50000
            };
        },

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting network data'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            var i;
            for (i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Check for _status sentinel field (appendpipe fallback)
            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            var hasSrc = colIdx.source !== undefined;
            var hasDst = colIdx.dest !== undefined;

            if (!hasSrc || !hasDst) {
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: source, dest'
                );
            }

            var edges = [];
            var nodeStatusMap = {};
            var nodeSet = {};

            for (i = 0; i < data.rows.length; i++) {
                var row = data.rows[i];
                var src = String(row[colIdx.source] || '');
                var dst = String(row[colIdx.dest] || '');
                var weight = colIdx.weight !== undefined ? parseFloat(row[colIdx.weight]) : 1;
                var status = colIdx.status !== undefined ? String(row[colIdx.status] || '').toLowerCase() : '';

                if (!src || !dst) continue;
                if (isNaN(weight) || weight <= 0) weight = 1;

                edges.push({
                    source: src,
                    dest: dst,
                    weight: weight
                });

                nodeSet[src] = true;
                nodeSet[dst] = true;

                // Track status for nodes (last seen wins)
                if (status) {
                    nodeStatusMap[src] = status;
                    if (!nodeStatusMap[dst]) {
                        nodeStatusMap[dst] = status;
                    }
                }
            }

            var nodes = [];
            var names = Object.keys(nodeSet);
            for (i = 0; i < names.length; i++) {
                nodes.push({
                    name: names[i],
                    status: nodeStatusMap[names[i]] || 'ok',
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0
                });
            }

            var result = { nodes: nodes, edges: edges };
            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Handle _status sentinel
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                return;
            }

            // Handle no data with cache fallback
            if (!data) {
                if (this._lastGoodData) {
                    data = this._lastGoodData;
                } else {
                    return;
                }
            }

            if (!data.nodes || data.nodes.length === 0) return;

            // ── Read settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var nodeColor       = config[ns + 'nodeColor']       || '#4FC3F7';
            var edgeColor       = config[ns + 'edgeColor']       || '#555555';
            var nodeSize        = parseInt(config[ns + 'nodeSize'], 10);
            if (isNaN(nodeSize) || nodeSize < 1) nodeSize = 8;
            var showLabels      = (config[ns + 'showLabels'] || 'true') === 'true';
            var labelSize       = parseInt(config[ns + 'labelSize'], 10);
            if (isNaN(labelSize) || labelSize < 1) labelSize = 10;
            var edgeThickness   = parseFloat(config[ns + 'edgeThickness']);
            if (isNaN(edgeThickness) || edgeThickness < 0.1) edgeThickness = 1.5;
            var layoutIterations = parseInt(config[ns + 'layoutIterations'], 10);
            if (isNaN(layoutIterations) || layoutIterations < 1) layoutIterations = 100;
            var showArrows      = (config[ns + 'showArrows'] || 'false') === 'true';
            var statusColors    = (config[ns + 'statusColors'] || 'true') === 'true';
            var okColor         = config[ns + 'okColor']   || '#4CAF50';
            var warnColor       = config[ns + 'warnColor'] || '#FF9800';
            var critColor       = config[ns + 'critColor'] || '#F44336';

            // ── Size canvas for HiDPI ──
            this._ensureCanvas();
            var rect = this.el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;

            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            var w = rect.width;
            var h = rect.height;

            // Clear
            ctx.clearRect(0, 0, w, h);

            // ── Deep copy nodes for layout ──
            var nodes = [];
            var i;
            for (i = 0; i < data.nodes.length; i++) {
                var n = data.nodes[i];
                nodes.push({
                    name: n.name,
                    status: n.status,
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0
                });
            }
            var edges = data.edges;

            // ── Run force-directed layout ──
            forceLayout(nodes, edges, w, h, layoutIterations);

            // Build node position map for edge drawing
            var nodeMap = {};
            for (i = 0; i < nodes.length; i++) {
                nodeMap[nodes[i].name] = nodes[i];
            }

            // ── Draw edges ──
            for (i = 0; i < edges.length; i++) {
                var e = edges[i];
                var srcNode = nodeMap[e.source];
                var dstNode = nodeMap[e.dest];
                if (!srcNode || !dstNode) continue;

                var lineWidth = edgeThickness * (e.weight / 5);
                if (lineWidth < 0.5) lineWidth = 0.5;
                if (lineWidth > 6) lineWidth = 6;

                ctx.beginPath();
                ctx.moveTo(srcNode.x, srcNode.y);
                ctx.lineTo(dstNode.x, dstNode.y);
                ctx.strokeStyle = edgeColor;
                ctx.lineWidth = lineWidth;
                ctx.globalAlpha = 0.6;
                ctx.stroke();
                ctx.globalAlpha = 1;

                if (showArrows) {
                    drawArrowhead(ctx, srcNode.x, srcNode.y, dstNode.x, dstNode.y, nodeSize, edgeColor);
                }
            }

            // ── Draw nodes ──
            for (i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var fillColor = getNodeColor(node, statusColors, nodeColor, okColor, warnColor, critColor);

                // Node glow
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeSize + 3, 0, Math.PI * 2);
                ctx.fillStyle = fillColor;
                ctx.globalAlpha = 0.2;
                ctx.fill();
                ctx.globalAlpha = 1;

                // Node circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
                ctx.fillStyle = fillColor;
                ctx.fill();

                // Node border
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // ── Draw labels ──
            if (showLabels) {
                ctx.font = labelSize + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                for (i = 0; i < nodes.length; i++) {
                    var lNode = nodes[i];
                    var lx = lNode.x;
                    var ly = lNode.y + nodeSize + 3;

                    // Text shadow for readability
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.fillText(lNode.name, lx + 1, ly + 1);

                    // Label text
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.fillText(lNode.name, lx, ly);
                }

                // Reset text alignment
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }

            // Reset any remaining state
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
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

            ctx.font = '500 ' + fontSize + 'px sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                ctx.font = '500 ' + fontSize + 'px sans-serif';
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
