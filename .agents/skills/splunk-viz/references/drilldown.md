# Drilldown from Canvas-Based Visualizations

Splunk custom vizs can fire drilldown events when the user clicks a data element. For Canvas vizs, this requires: (a) tracking which canvas regions map to data, (b) listening for click events, and (c) calling `this.drilldown()` with the correct payload.

## In `initialize` — set up click and hover handlers

```javascript
initialize: function() {
    // ... canvas setup ...
    this._hitRects = [];
    this._drilldownField = 'name'; // updated in updateView from config

    var self = this;
    this.canvas.addEventListener('click', function(event) {
        if (!self._hitRects || self._hitRects.length === 0) return;

        var canvasRect = self.canvas.getBoundingClientRect();
        var clickX = event.clientX - canvasRect.left;
        var clickY = event.clientY - canvasRect.top;

        for (var i = 0; i < self._hitRects.length; i++) {
            var t = self._hitRects[i];
            if (clickX >= t.x && clickX <= t.x + t.w &&
                clickY >= t.y && clickY <= t.y + t.h) {
                var drilldownData = {};
                drilldownData[self._drilldownField] = t.name;
                event.preventDefault();
                self.drilldown({
                    action: SplunkVisualizationBase.FIELD_VALUE_DRILLDOWN,
                    data: drilldownData
                }, event);
                break;
            }
        }
    });

    // Pointer cursor on hover
    this.canvas.addEventListener('mousemove', function(event) {
        var canvasRect = self.canvas.getBoundingClientRect();
        var mx = event.clientX - canvasRect.left;
        var my = event.clientY - canvasRect.top;
        var over = false;
        for (var i = 0; i < self._hitRects.length; i++) {
            var t = self._hitRects[i];
            if (mx >= t.x && mx <= t.x + t.w &&
                my >= t.y && my <= t.y + t.h) {
                over = true;
                break;
            }
        }
        self.canvas.style.cursor = over ? 'pointer' : 'default';
    });
}
```

## In `updateView` — store hit rects during drawing

```javascript
this._drilldownField = config[ns + 'fieldName'] || 'name';
this._hitRects = [];

// While drawing each element:
this._hitRects.push({
    x: elementX, y: elementY, w: elementW, h: elementH,
    name: dataValue  // the value to pass in the drilldown
});
```

## Dashboard Studio drilldown configuration

Required — Studio has no default drilldown action.

The visualization fires the event, but Dashboard Studio requires the user to configure a drilldown action on the panel:
1. Select the panel → open **Drilldown** settings
2. Click **+ Add Drilldown** → set action to **Link to search**
3. Use `$row.<fieldname>.value$` as the drilldown token (where `<fieldname>` matches the key in the `drilldownData` object)

Example drilldown search for a component status board:
```spl
index=_internal sourcetype=splunkd component="$row.component.value$" (log_level=ERROR OR log_level=WARN)
```

**Important**: Always quote the token in SPL (`"$row.field.value$"`) because values may contain special characters like colons.

In Classic SimpleXML dashboards, the default drilldown behaviour (open in Search) works automatically without additional configuration.

**Document drilldown setup in the viz README** — always include a "Drilldown" section explaining the token format and example search, since Dashboard Studio users must configure it manually.
