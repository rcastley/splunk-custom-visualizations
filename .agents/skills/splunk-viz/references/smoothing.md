# Smoothing Between SPL Samples

Use client-side tweening only for continuous numeric motion. Keep categorical, boolean, discrete-count, and rank-reordering changes unsmoothed.

## Contents

- [Shared model](#shared-model)
- [Single-value update](#single-value-update)
- [Per-entity update](#per-entity-update)
- [Animation step](#animation-step)
- [Legacy integration](#legacy-integration)
- [Native Studio integration](#native-studio-integration)
- [Tuning and verification](#tuning-and-verification)

## Shared model

Keep the math framework-neutral. The adapter owns subscription, scheduling, redraw, and cleanup.

Use frame-rate-independent exponential easing:

```javascript
function smoothingAlpha(speed, deltaSeconds) {
    if (speed <= 0) return 1;
    return Math.min(1, 1 - Math.exp(-speed * deltaSeconds));
}
```

Snap the first sample to its target so a newly loaded visualization does not sweep from zero. Store later samples as targets and animate the displayed state toward them.

## Single-value update

```javascript
function updateScalar(state, nextValue, speed) {
    state.speed = speed;
    state.target = nextValue;

    if (!state.hasSample || speed === 0) {
        state.current = nextValue;
        state.hasSample = true;
    }

    state.idleFrames = 0;
}
```

Initialize `current`, `target`, `speed`, `hasSample`, and `idleFrames` in adapter-owned state.

## Per-entity update

Key motion state by a stable entity identifier. Reset it when the coordinate scope changes.

```javascript
function updateEntities(stateById, entities, speed) {
    entities.forEach(function(entity) {
        if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;

        var state = stateById.get(entity.id);
        if (!state) {
            stateById.set(entity.id, {
                currentX: entity.x,
                currentY: entity.y,
                targetX: entity.x,
                targetY: entity.y
            });
            return;
        }

        state.targetX = entity.x;
        state.targetY = entity.y;
        if (speed === 0) {
            state.currentX = entity.x;
            state.currentY = entity.y;
        }
    });
}
```

For an ES5 legacy source, use an object plus `for` loops instead of `Map`, `forEach`, and `Number.isFinite`; the state model remains the same.

## Animation step

Use `requestAnimationFrame` unless the existing visualization has a tested scheduler abstraction:

```javascript
function stepScalar(state, now) {
    var deltaSeconds = Math.min(0.25, (now - state.lastFrame) / 1000);
    state.lastFrame = now;
    var alpha = smoothingAlpha(state.speed, deltaSeconds);
    state.current += (state.target - state.current) * alpha;
    return Math.abs(state.target - state.current);
}
```

Cap large time deltas after background-tab suspension. When the remaining delta is below a scale-appropriate threshold for several frames, snap exactly to target, draw once, and stop scheduling.

## Legacy integration

- Store tween state and the animation-frame ID on the visualization instance.
- In `updateView`, parse the formatter setting, update targets, cache only the normalized render model/options needed for redraw, and start the loop when unsettled.
- Draw loading, invalid, or custom status states only after cancelling the active loop.
- In `destroy`, cancel the frame before calling `SplunkVisualizationBase.prototype.destroy`.
- Use ES5 syntax in source when required by the app's legacy target.

```javascript
_stopAnimation: function() {
    if (this._animationFrame) {
        cancelAnimationFrame(this._animationFrame);
        this._animationFrame = 0;
    }
}
```

## Native Studio integration

- Keep tween state inside the iframe module or React component; do not store it in Dashboard Studio option state.
- Update targets from `addDataSourceResultsListener` and relevant option listeners.
- Redraw with the latest dimension, theme, and option snapshots.
- Export an idempotent teardown that cancels the frame and invokes every API cleanup callback.
- In React, keep mutable animation values and the frame ID in refs; cancel the frame in the effect cleanup.

```javascript
export function destroyVisualization() {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
}
```

## Tuning and verification

Time to close approximately 95% of the gap is `3 / speed` seconds. A speed near 8 settles in roughly 375 ms; lower values trade responsiveness for continuous broadcast-style motion.

- Use one default across related panels to avoid visible desynchronization.
- Expose speed only when users benefit from controlling it; `0` should snap.
- Test first sample, rapid target changes, background-tab recovery, no-data transitions, resize during motion, and teardown.
- If a full redraw is expensive, separate static and moving layers rather than allowing queued timer callbacks.
