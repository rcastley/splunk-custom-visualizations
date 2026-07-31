import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const listeners = Object.fromEntries(
    ['dataSources', 'options', 'dimensions', 'theme'].map((name) => [name, new Set()])
);
const lifecycleListeners = new Map();
const textDraws = [];
const errors = [];
let currentError = '';
let rafId = 0;

const state = {
    dataSources: {},
    loading: false,
    options: {},
    width: 720,
    height: 420,
    theme: 'light',
};

function snapshot(name) {
    if (name === 'dataSources') return { dataSources: state.dataSources, loading: state.loading };
    if (name === 'dimensions') return { width: state.width, height: state.height };
    if (name === 'theme') return { theme: state.theme };
    return { options: state.options };
}

function subscribe(name, callback, options = {}) {
    listeners[name].add(callback);
    if (options.invokeImmediately) callback(snapshot(name));
    return () => listeners[name].delete(callback);
}

function emit(name) {
    listeners[name].forEach((callback) => callback(snapshot(name)));
}

function context2d() {
    return {
        setTransform() {}, clearRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {},
        lineTo() {}, arcTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {},
        measureText(value) { return { width: String(value).length * 7 }; },
        fillText(value) { textDraws.push(String(value)); },
        fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
        shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    };
}

const canvas = {
    className: '', style: {}, width: 0, height: 0, attributes: {}, removed: false,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getContext(kind) { return kind === '2d' ? context2d() : null; },
    remove() { this.removed = true; },
};
const root = { replaceChildren(node) { this.child = node; } };

globalThis.document = {
    body: root,
    head: { appendChild() {} },
    getElementById(id) { return id === 'root' ? root : null; },
    createElement(name) {
        if (name === 'style') return { textContent: '' };
        assert.equal(name, 'canvas');
        return canvas;
    },
};
globalThis.window = {
    devicePixelRatio: 2,
    addEventListener(name, callback) { lifecycleListeners.set(name, callback); },
};
globalThis.requestAnimationFrame = (callback) => {
    const id = ++rafId;
    setTimeout(() => callback(Date.now()), 0);
    return id;
};
globalThis.cancelAnimationFrame = () => {};
globalThis.DashboardExtensionAPI = {
    addDataSourcesListener: (callback, options) => subscribe('dataSources', callback, options),
    addOptionsListener: (callback, options) => subscribe('options', callback, options),
    addDimensionsListener: (callback, options) => subscribe('dimensions', callback, options),
    addThemeListener: (callback, options) => subscribe('theme', callback, options),
    setError(message) { currentError = String(message); errors.push(currentError); },
    clearError() { currentError = ''; errors.push(''); },
};

const fixture = {
    fields: [
        { name: 'index' }, { name: 'current_size_mb' }, { name: 'max_size_mb' },
        { name: 'event_rate' }, { name: 'latest_event_age_seconds' },
    ],
    columns: [
        ['main', 'security', 'archive'], ['61000', '92000', '97000'], ['100000', '100000', '100000'],
        ['18000', '7600', '12'], ['18', '42', '2400'],
    ],
};

async function flush() {
    await new Promise((resolveFlush) => setTimeout(resolveFlush, 5));
}

await import(`${pathToFileURL(resolve('dist/index_health/visualization.js')).href}?smoke=1`);
state.dataSources = { primary: { data: fixture } };
emit('dataSources');
await flush();
assert.equal(currentError, '');
assert.equal(canvas.width, 1440, 'DPR 2 backing width');
assert.equal(canvas.height, 840, 'DPR 2 backing height');
assert.match(canvas.attributes['aria-label'], /1 healthy, 0 warning, 2 critical/);

textDraws.length = 0;
state.loading = true;
emit('dataSources');
await flush();
assert.ok(textDraws.includes('Loading index health…'));

state.loading = false;
state.dataSources = { primary: { data: { fields: fixture.fields, columns: [[], [], [], [], []] } } };
emit('dataSources');
await flush();
assert.ok(textDraws.includes('No indexes found'));

state.dataSources = { primary: { data: { fields: [{ name: 'index' }], columns: [['main']] } } };
emit('dataSources');
await flush();
assert.match(currentError, /Required fields not found/);

state.dataSources = { primary: { data: fixture } };
state.options = { warningThreshold: 95, criticalThreshold: 80 };
emit('options');
emit('dataSources');
await flush();
assert.match(currentError, /Warning threshold/);

state.options = { warningThreshold: 'not-a-number', healthyColor: 'unsafe', showEventRate: false };
state.theme = 'dark';
state.width = 320;
state.height = 220;
emit('options');
emit('theme');
emit('dimensions');
await flush();
assert.equal(currentError, '', 'valid data recovers from an error');
assert.equal(canvas.width, 640);
assert.equal(canvas.height, 440);

state.dataSources = {
    primary: {
        data: {
            fields: fixture.fields,
            rows: [['summary', '500', '1000', '20', '5']],
        },
    },
};
emit('dataSources');
await flush();
assert.equal(currentError, '', 'row-oriented compatibility');

assert.equal([...listeners.dataSources].length, 1);
lifecycleListeners.get('pagehide')?.();
assert.equal([...listeners.dataSources].length, 0, 'subscriptions cleaned up');
assert.equal(canvas.removed, true, 'owned canvas removed');
assert.ok(errors.some(Boolean), 'invalid-state errors were reported');
assert.ok(errors.includes(''), 'errors were cleared after recovery');

console.log('Studio adapter smoke tests passed: loading, empty, malformed, valid, recovery, options, theme, resize, DPR 2, row/column data, and teardown.');
