import { VisualizationAPI } from '@splunk/dashboard-studio-extension';
import './visualization.css';
import type { DataSources, SplunkSearchData } from './types/data';
import { buildIndexHealthModel, normalizeSearchData, parseOptions } from './model';
import { drawIndexHealth, drawMessage, prepareCanvas } from './render';

type Theme = 'light' | 'dark';

const root = document.getElementById('root') || document.body;
const canvas = document.createElement('canvas');
canvas.className = 'index-health-canvas';
canvas.setAttribute('role', 'img');
canvas.setAttribute('aria-label', 'Index health overview');
root.replaceChildren(canvas);

const state: {
    dataSources: DataSources;
    loading: boolean;
    options: Record<string, unknown>;
    width: number;
    height: number;
    theme: Theme;
} = {
    dataSources: {},
    loading: false,
    options: {},
    width: 0,
    height: 0,
    theme: 'light',
};

let animationFrame = 0;
let currentError = '';

function reportError(message: string) {
    if (message === currentError) return;
    currentError = message;
    if (message) VisualizationAPI.setError(message);
    else VisualizationAPI.clearError();
}

function requestRender() {
    if (animationFrame) return;
    animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        render();
    });
}

function render() {
    const context = prepareCanvas(canvas, state.width, state.height);
    if (!context) return;

    if (state.loading) {
        reportError('');
        drawMessage(context, state.width, state.height, 'Loading index health…', state.theme);
        return;
    }

    const sourceData = state.dataSources?.primary?.data as SplunkSearchData | undefined;
    if (!sourceData) {
        reportError('');
        drawMessage(context, state.width, state.height, 'No index health data', state.theme);
        return;
    }

    const normalized = normalizeSearchData(sourceData);
    if (normalized.rows.length === 0) {
        reportError('');
        drawMessage(context, state.width, state.height, 'No indexes found', state.theme);
        return;
    }

    const parsedOptions = parseOptions(state.options);
    if ('error' in parsedOptions) {
        reportError(parsedOptions.error);
        return;
    }

    const result = buildIndexHealthModel(normalized, parsedOptions);
    if ('error' in result) {
        reportError(result.error);
        return;
    }

    reportError('');
    canvas.setAttribute(
        'aria-label',
        `Index health overview: ${result.model.healthyCount} healthy, ${result.model.warningCount} warning, ${result.model.criticalCount} critical`
    );
    drawIndexHealth(context, state.width, state.height, result.model, parsedOptions, state.theme);
}

const cleanups = [
    VisualizationAPI.addDataSourcesListener(
        ({ dataSources, loading }: { dataSources: DataSources; loading: boolean }) => {
            state.dataSources = dataSources || {};
            state.loading = Boolean(loading);
            requestRender();
        },
        { invokeImmediately: true }
    ),
    VisualizationAPI.addOptionsListener(
        ({ options }: { options: Record<string, unknown> }) => {
            state.options = options || {};
            requestRender();
        },
        { invokeImmediately: true }
    ),
    VisualizationAPI.addDimensionsListener(
        ({ width, height }: { width: number; height: number }) => {
            state.width = width || 0;
            state.height = height || 0;
            requestRender();
        },
        { invokeImmediately: true }
    ),
    VisualizationAPI.addThemeListener(
        ({ theme }: { theme: Theme }) => {
            state.theme = theme || 'light';
            requestRender();
        },
        { invokeImmediately: true }
    ),
];

function destroy() {
    cleanups.forEach((cleanup) => cleanup?.());
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    canvas.remove();
}

window.addEventListener('pagehide', destroy, { once: true });
