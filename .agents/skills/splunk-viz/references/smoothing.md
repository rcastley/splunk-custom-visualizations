# Smoothing Between SPL Samples (Client-Side Tween)

See rule 32 in SKILL.md for when and why to apply smoothing. This file contains the full implementation.

Two variants:

- **Variant A — single numeric value** (gauges, single-value displays, rotations).
- **Variant B — per-entity positions** (anything that moves multiple items on the canvas, keyed by an identifier from the data).

Both use the same frame-rate-independent ease-out formula and the same timer/cleanup structure — only the state shape and the sync step differ.

## Variant A — single numeric value

```javascript
// ── In initialize ──
this._currentValue = 0;
this._targetValue = 0;
this._animTimer = null;
this._lastFrameTime = 0;
this._hasFirstSample = false;
this._idleFrames = 0;
this._smoothness = 8;
this._lastData = null;
this._lastConfig = null;

// ── In updateView, after guards and extracting rawVal from data ──
var ns = this.getPropertyNamespaceInfo().propertyNamespace;
var sm = parseFloat(config[ns + 'smoothness']);
if (isNaN(sm) || sm < 0) sm = 8;
this._smoothness = sm;

this._targetValue = rawVal;
if (!this._hasFirstSample || sm === 0) {
    this._currentValue = rawVal;
    this._hasFirstSample = true;
}

this._idleFrames = 0;
this._lastData = data;
this._lastConfig = config;
this._draw();                        // draws using this._currentValue
if (sm > 0) this._startAnimLoop();
```

## Variant B — per-entity positions

```javascript
// ── In initialize ──
this._entityState = {};              // keyed by identifier
this._entityScopeId = null;          // optional: reset state when scope changes
this._animTimer = null;
this._lastFrameTime = 0;
this._idleFrames = 0;
this._smoothness = 8;
this._lastData = null;
this._lastConfig = null;

// ── In updateView, after guards and building the entity list from data ──
var ns = this.getPropertyNamespaceInfo().propertyNamespace;
var sm = parseFloat(config[ns + 'smoothness']);
if (isNaN(sm) || sm < 0) sm = 8;
this._smoothness = sm;

// Optional: reset state when the coordinate scope changes
if (data.scopeId != null && data.scopeId !== this._entityScopeId) {
    this._entityState = {};
    this._entityScopeId = data.scopeId;
}

for (var i = 0; i < data.entities.length; i++) {
    var e = data.entities[i];
    if (e.x == null || e.y == null) continue;
    var s = this._entityState[e.id];
    if (!s) {
        // First sample for this entity — snap to avoid sweeping from (0,0)
        this._entityState[e.id] = {
            currentX: e.x, currentY: e.y,
            targetX:  e.x, targetY:  e.y
        };
    } else {
        s.targetX = e.x;
        s.targetY = e.y;
        if (sm === 0) { s.currentX = e.x; s.currentY = e.y; }
    }
}

this._idleFrames = 0;
this._lastData = data;
this._lastConfig = config;
this._draw();                        // draws each entity using _entityState[id].currentX/Y
if (sm > 0) this._startAnimLoop();
```

## Shared timer, cleanup, and redraw path

Add to the viz's method object:

```javascript
_startAnimLoop: function() {
    if (this._animTimer) return;
    var self = this;
    this._lastFrameTime = Date.now();
    this._animTimer = setInterval(function() {
        var now = Date.now();
        var dt = (now - self._lastFrameTime) / 1000;
        self._lastFrameTime = now;

        // Frame-rate-independent exponential ease-out
        var alpha = 1 - Math.exp(-self._smoothness * dt);
        if (alpha > 1) alpha = 1;

        // Variant A:
        self._currentValue += (self._targetValue - self._currentValue) * alpha;
        var maxDelta = Math.abs(self._targetValue - self._currentValue);

        // Variant B (replace the Variant A lines above with this block):
        // var maxDelta = 0;
        // var ids = Object.keys(self._entityState);
        // for (var i = 0; i < ids.length; i++) {
        //     var s = self._entityState[ids[i]];
        //     var dx = s.targetX - s.currentX;
        //     var dy = s.targetY - s.currentY;
        //     s.currentX += dx * alpha;
        //     s.currentY += dy * alpha;
        //     var d = Math.abs(dx) + Math.abs(dy);
        //     if (d > maxDelta) maxDelta = d;
        // }

        self._draw();

        // Idle-stop when settled. Threshold depends on value range:
        //   - Single value: 0.05 works for 0–100 percentages; scale for larger ranges.
        //   - 2D coordinates: ~0.5 world-units; tune to your coordinate space.
        if (maxDelta < 0.05) {
            self._idleFrames += 1;
            if (self._idleFrames >= 3) {
                // Snap final frame exactly on target, then stop
                // (Variant A: self._currentValue = self._targetValue)
                // (Variant B: loop ids, set currentX=targetX, currentY=targetY)
                self._draw();
                self._stopAnimLoop();
            }
        } else {
            self._idleFrames = 0;
        }
    }, 16);
},

_stopAnimLoop: function() {
    if (this._animTimer) {
        clearInterval(this._animTimer);
        this._animTimer = null;
    }
},

destroy: function() {
    this._stopAnimLoop();
    SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
}
```

## Notes

- `_draw()` is the viz's render helper. It reads from `this._lastData` / `this._lastConfig` and uses `this._currentValue` (Variant A) or `this._entityState[id].currentX/Y` (Variant B) for drawn values. The same helper is called from both `updateView` (fresh data) and the timer (cached data, tweened values).
- The timer also needs to run when the viz receives a `_status` sentinel from the SPL `appendpipe` fallback (rule 27) — stop it in the status-message branch of `updateView` so the loop doesn't fire behind the placeholder.
- For vizs where the full `_draw()` is too expensive to run at 60 FPS, layer a static-scene snapshot via `getImageData` / `putImageData` so the timer only redraws the moving parts. Use `requestAnimationFrame` for that variant to avoid `setInterval` backlogs when a frame runs long.
