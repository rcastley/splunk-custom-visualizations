#!/usr/bin/env node
import { build, context } from 'esbuild';
import { mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
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

const buildOptions = {
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2017',
    minify: isProduction,
    sourcemap: !isProduction,
    ...(entryFileName.endsWith('.jsx') && { jsx: 'automatic' }),
    plugins: [cssInjectAndSizeWarnPlugin],
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
            console.warn(colors.warning(`Warning: ${vizName}/src/${entryFileName} not found, skipping`));
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
            console.warn(colors.warning(`Warning: ${vizName}/src/${entryFileName} not found, skipping`));
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