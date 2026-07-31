#!/usr/bin/env node
import { build, context } from 'esbuild';
import { mkdirSync, readdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { cssInjectAndSizeWarnPlugin } from './build-plugins/css-and-size.mjs';

const colors = {
    success: (text) => chalk.green(text),
    error: (text) => chalk.red(text),
    warning: (text) => chalk.yellow(text),
    info: (text) => chalk.cyan(text),
    dim: (text) => chalk.dim(text),
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const entryArg = process.argv.find((a) => a.startsWith('--entry='));
const entryFileName = entryArg ? entryArg.split('=')[1] : 'visualization.js';
const isWatch = process.argv.includes('--watch');
const isProduction = process.env.NODE_ENV === 'production';

const visualizationsDir = join(__dirname, 'visualizations');
const distDir = join(__dirname, 'dist');

if (!isWatch && existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
}

mkdirSync(distDir, { recursive: true });

const vizDirs = readdirSync(visualizationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

if (vizDirs.length === 0) {
    console.error(colors.error('Error: No visualizations found in visualizations/ directory'));
    process.exit(1);
}

// Reads the nearest package.json from a resolved file path and checks whether
// the package declares ESM support via an "import" condition in its exports map
// or a "module" field — covering both the modern (exports map) and legacy
// (bundler-only "module" field) dual CJS+ESM conventions.
function packageHasEsmEntry(resolvedPath) {
    let dir = dirname(resolvedPath);
    while (dir !== dirname(dir)) {
        const pkgPath = join(dir, 'package.json');
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
                if (pkg.module) return true;
                if (pkg.exports && JSON.stringify(pkg.exports).includes('"import"')) return true;
            } catch {
                // ignore malformed package.json
            }
            return false;
        }
        dir = dirname(dir);
    }
    return false;
}

// esbuild uses __toESM(..., 1) (node-compat mode) for CJS files in node_modules,
// which ignores __esModule:true and sets `default` to the whole module object.
// This plugin intercepts @splunk imports, resolves them to their absolute CJS
// paths, and re-exports via a virtual ESM shim so esbuild never applies
// node-compat mode. Inspired by EsmInteropPlugin in dashboard-enterprise.
const splunkCjsInteropPlugin = {
    name: 'splunk-cjs-interop',
    setup(build) {
        build.onResolve({ filter: /^@splunk\// }, async (args) => {
            // Only intercept ESM import statements — not require() calls inside
            // @splunk packages themselves (which stay as regular CJS).
            if (args.kind !== 'import-statement' && args.kind !== 'entry-point') return undefined;

            const result = await build.resolve(args.path, {
                resolveDir: args.resolveDir,
                kind: 'require-call',
            });
            if (result.errors.length) return result;

            // If the package declares ESM support (via exports map "import"
            // condition or legacy "module" field), esbuild handles it natively.
            if (packageHasEsmEntry(result.path)) return undefined;
            return { path: result.path, namespace: 'splunk-esm-shim' };
        });

        build.onLoad({ filter: /.*/, namespace: 'splunk-esm-shim' }, (args) => ({
            // Virtual ESM module: require() the CJS file and unwrap .default.
            // Not in node_modules, so esbuild skips node-compat __toESM wrapping.
            contents: `
const _cjs = require(${JSON.stringify(args.path)});
const _mod = (_cjs && _cjs.__esModule) ? _cjs : { default: _cjs };
const _default = (typeof _mod.default === 'object' && _mod.default !== null && typeof _mod.default.default === 'function')
    ? _mod.default.default
    : _mod.default;
export default _default;
export * from ${JSON.stringify(args.path)};
`,
            loader: 'js',
            resolveDir: dirname(args.path),
        }));
    },
};

const useJsx = entryFileName.endsWith('.jsx') || entryFileName.endsWith('.tsx');
const buildOptions = {
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2017',
    minify: isProduction,
    sourcemap: !isProduction,
    ...(useJsx && { jsx: 'automatic' }),
    plugins: [splunkCjsInteropPlugin, cssInjectAndSizeWarnPlugin],
    loader: {
        '.png': 'dataurl',
        '.jpg': 'dataurl',
        '.jpeg': 'dataurl',
        '.gif': 'dataurl',
        '.svg': 'dataurl',
        '.ico': 'dataurl',
        '.woff': 'dataurl',
        '.woff2': 'dataurl',
        '.ttf': 'dataurl',
        '.otf': 'dataurl',
    },
};

if (isWatch) {
    const contexts = [];
    for (const vizName of vizDirs) {
        const entryPoint = join(visualizationsDir, vizName, 'src', entryFileName);
        const outFile = join(distDir, vizName, 'visualization.js');

        if (!existsSync(entryPoint)) {
            console.warn(
                colors.warning(`Warning: ${vizName}/src/${entryFileName} not found, skipping`)
            );
            continue;
        }

        const ctx = await context({
            ...buildOptions,
            entryPoints: [entryPoint],
            outfile: outFile,
        });
        contexts.push({ ctx, vizName });
    }

    console.log(colors.info('Watching for changes...'));
    for (const { ctx, vizName } of contexts) {
        await ctx.watch();
        console.log(colors.dim(`  ✓ Watching ${vizName}`));
    }
} else {
    console.log(colors.info('Building visualizations...'));
    for (const vizName of vizDirs) {
        const entryPoint = join(visualizationsDir, vizName, 'src', entryFileName);
        const outFile = join(distDir, vizName, 'visualization.js');

        if (!existsSync(entryPoint)) {
            console.warn(
                colors.warning(`Warning: ${vizName}/src/${entryFileName} not found, skipping`)
            );
            continue;
        }

        try {
            await build({
                ...buildOptions,
                entryPoints: [entryPoint],
                outfile: outFile,
            });
            console.log(colors.dim(`  ✓ Built ${vizName}`));
        } catch (error) {
            console.error(colors.error(`Error building ${vizName}:`), error);
            process.exit(1);
        }
    }
    console.log(colors.success(`\nBuild complete! Output: dist/`));
}
