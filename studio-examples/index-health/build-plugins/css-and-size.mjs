#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { transform } from 'esbuild';

const DEFAULT_SIZE_WARNING_THRESHOLD = 100 * 1024; // 100KB

const ASSET_EXTENSION_REGEX = /\.(?:png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|otf)$/;

/** @type {Record<string, string>} */
const MIME_BY_EXT = {
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const URL_REGEX = /url\s*\(\s*["']?([^"')]+)["']?\s*\)/g;
const IMPORT_REGEX =
    /@import\s+(?:"([^"]+)"|'([^']+)'|url\s*\(\s*["']?([^"')]+)["']?\s*\))\s*;/g;

/** Replace local url() paths with data URLs; leave data/http(s)/protocol-relative unchanged. */
function resolveUrlsInCss(cssContent, baseDir, options = {}) {
    const sizeWarningThreshold = options.sizeWarningThreshold ?? DEFAULT_SIZE_WARNING_THRESHOLD;
    return cssContent.replace(URL_REGEX, (match, pathRaw) => {
        const path = pathRaw.trim();
        if (
            !path ||
            path.startsWith('data:') ||
            path.startsWith('http:') ||
            path.startsWith('https:') ||
            path.startsWith('//')
        ) {
            return match;
        }
        const resolvedPath = resolve(baseDir, path);
        if (!existsSync(resolvedPath)) {
            console.warn(`[build] CSS url() target not found, leaving unchanged: ${path}`);
            return match;
        }
        const ext = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
        const mime = MIME_BY_EXT[ext.toLowerCase()];
        if (!mime) {
            return match;
        }
        try {
            if (sizeWarningThreshold > 0) {
                const stat = statSync(resolvedPath);
                if (stat.size > sizeWarningThreshold) {
                    const kb = (stat.size / 1024).toFixed(1);
                    console.warn(
                        `[build] Large asset inlined via CSS url() (${kb} KB): ${basename(resolvedPath)}. Consider optimizing or loading externally.`,
                    );
                }
            }
            if (ext.toLowerCase() === '.svg') {
                const text = readFileSync(resolvedPath, 'utf8');
                const dataUrl = `data:image/svg+xml,${encodeURIComponent(text)}`;
                return `url("${dataUrl}")`;
            }
            const buffer = readFileSync(resolvedPath);
            const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
            return `url("${dataUrl}")`;
        } catch (err) {
            console.warn(`[build] Failed to inline CSS url(): ${path}`, err);
            return match;
        }
    });
}

/** Replace each @import with the processed content of the target file (recursive, circular-safe). */
function resolveImportsInCss(cssContent, currentFilePath, visited, options = {}) {
    const baseDir = dirname(currentFilePath);
    return cssContent.replace(IMPORT_REGEX, (fullMatch, quotedDouble, quotedSingle, urlPath) => {
        const path = (quotedDouble ?? quotedSingle ?? urlPath)?.trim();
        if (!path) return fullMatch;
        const resolvedPath = resolve(baseDir, path.trim());
        const normalized = resolve(resolvedPath);
        if (visited.has(normalized)) {
            throw new Error(`Circular @import in CSS: ${normalized} (from ${currentFilePath})`);
        }
        if (!existsSync(resolvedPath)) {
            throw new Error(`CSS @import target not found: ${path} (resolved: ${resolvedPath})`);
        }
        visited.add(normalized);
        try {
            const importedContent = readFileSync(resolvedPath, 'utf8');
            const inlined = processCss(importedContent, resolvedPath, visited, options);
            return inlined;
        } finally {
            visited.delete(normalized);
        }
    });
}

/** Resolve url() then @import (recursive). Paths resolved from currentFilePath. */
function processCss(cssContent, currentFilePath, visited = new Set(), options = {}) {
    const baseDir = dirname(currentFilePath);
    let out = resolveUrlsInCss(cssContent, baseDir, options);
    out = resolveImportsInCss(out, currentFilePath, visited, options);
    return out;
}

/** esbuild plugin: CSS → injected style + inlined @import/url(), size warnings for large assets. */
export function createCssInjectAndSizeWarnPlugin(options = {}) {
    const sizeWarningThreshold = options.sizeWarningThreshold ?? DEFAULT_SIZE_WARNING_THRESHOLD;
    const pluginOptions = { sizeWarningThreshold };

    return {
        name: 'css-inject-and-size-warn',
        setup(build) {
            build.onLoad({ filter: /\.css$/ }, async (args) => {
                const cssContent = readFileSync(args.path, 'utf8');
                const processed = processCss(cssContent, args.path, new Set(), pluginOptions);
                const { code } = await transform(processed, {
                    loader: 'css',
                    target: build.initialOptions.target ?? 'es2017',
                });
                const escaped = JSON.stringify(code);
                const contents = [
                    `(function(){ var s = document.createElement('style'); s.textContent = ${escaped}; document.head.appendChild(s); })();`,
                    `export default ${escaped};`,
                ].join('\n');
                return { contents, loader: 'js' };
            });

            build.onLoad({ filter: ASSET_EXTENSION_REGEX }, (args) => {
                try {
                    const stat = statSync(args.path);
                    if (stat.size > sizeWarningThreshold) {
                        const kb = (stat.size / 1024).toFixed(1);
                        const name = basename(args.path);
                        console.warn(
                            `[build] Large asset may be inlined (${kb} KB): ${name}. Consider optimizing or loading externally.`,
                        );
                    }
                } catch {
                    /* let esbuild handle the file */
                }
                return undefined;
            });
        },
    };
}

export const cssInjectAndSizeWarnPlugin = createCssInjectAndSizeWarnPlugin();
