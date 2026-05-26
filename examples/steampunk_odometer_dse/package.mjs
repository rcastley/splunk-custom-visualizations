#!/usr/bin/env node

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import chalk from 'chalk';
import { create as createTar } from 'tar';

const __dirname = dirname(fileURLToPath(import.meta.url));

const colors = {
    success: (text) => chalk.green(text),
    error: (text) => chalk.red(text),
    warning: (text) => chalk.yellow(text),
    info: (text) => chalk.cyan(text),
    dim: (text) => chalk.dim(text),
    bold: (text) => chalk.bold(text),
};

// ---------------------------------------------------------------------------
// App conf parsing
// ---------------------------------------------------------------------------

const APP_ID_REGEX = /^[a-z0-9_.]+$/;
const STANZA_REGEX = /^\[([\w.]+)\]$/;

const APP_CONF_FIELDS = {
    package: { id: 'id' },
    launcher: { version: 'version', author: 'author', description: 'description' },
    ui: { label: 'label' },
    manifest: { category: 'category' },
};

function validateAppId(id) {
    if (!id || id.length < 1 || id.length > 100) {
        throw new Error(
            `Invalid [package] id length. Must be between 1 and 100 characters (current: ${id.length}).`
        );
    }
    if (!APP_ID_REGEX.test(id)) {
        throw new Error(
            `Invalid [package] id "${id}". Must contain only lowercase letters, numbers, dots, and underscores.`
        );
    }
    const first = id.charAt(0);
    const last = id.charAt(id.length - 1);
    if (/[_.]/.test(first) || /[_.]/.test(last)) {
        throw new Error(
            `Invalid [package] id "${id}". Cannot start or end with a dot or underscore.`
        );
    }
}

function parseAppConf(content) {
    const result = {};
    let currentStanza = '';
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const stanzaMatch = STANZA_REGEX.exec(line);
        if (stanzaMatch) {
            currentStanza = stanzaMatch[1];
            continue;
        }
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) continue;
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        const fieldName = APP_CONF_FIELDS[currentStanza]?.[key];
        if (fieldName) {
            result[fieldName] = value;
        }
    }
    return result;
}

function getAppConfPath(projectRoot) {
    const appConfPath = join(join(projectRoot, 'package', 'app'), 'app.conf');
    if (!existsSync(appConfPath)) {
        throw new Error('Missing package/app/app.conf. Run from a project created with init.');
    }
    return appConfPath;
}

// ---------------------------------------------------------------------------
// Template interpolation (<@- key @> placeholders in app.conf)
// ---------------------------------------------------------------------------

function interpolateTemplate(content, vars) {
    return content.replace(/<@-\s*(\w+)\s*@>/g, (match, key) => {
        const value = vars[key];
        return value === undefined ? match : String(value);
    });
}

// ---------------------------------------------------------------------------
// Visualization discovery
// ---------------------------------------------------------------------------

function discoverVisualizations(projectRoot) {
    const vizDir = join(projectRoot, 'visualizations');
    if (!existsSync(vizDir)) return [];

    const vizDirs = readdirSync(vizDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const vizs = [];
    for (const entry of vizDirs) {
        const name = entry.name;
        const configPath = join(vizDir, name, 'config.json');
        if (existsSync(configPath)) {
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));
            const distPath = join(projectRoot, 'dist', name, 'visualization.js');
            vizs.push({ name, configPath, config, distPath });
        }
    }
    return vizs;
}

function validateProjectStructure(projectRoot) {
    if (!existsSync(join(projectRoot, 'package.json'))) {
        throw new Error('Missing package.json\nMake sure you have a package.json in the project root.');
    }

    const vizDir = join(projectRoot, 'visualizations');
    if (!existsSync(vizDir)) {
        throw new Error(
            `Missing visualizations/ directory\n\nExpected project structure:\n` +
            `  project/\n` +
            `  ├── package.json\n` +
            `  ├── visualizations/\n` +
            `  │   └── my-viz/\n` +
            `  │       ├── src/\n` +
            `  │       │   └── visualization.js\n` +
            `  │       └── config.json\n` +
            `  └── dist/\n` +
            `      └── my-viz/\n` +
            `          └── visualization.js`
        );
    }

    const allDirs = readdirSync(vizDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (allDirs.length === 0) {
        throw new Error(
            'No visualization directories found in visualizations/\nCreate at least one visualization directory with config.json'
        );
    }

    const withConfig = allDirs.filter((e) => existsSync(join(vizDir, e.name, 'config.json')));
    if (withConfig.length === 0) {
        const list = allDirs.map((e) => `  - ${e.name}/ (missing config.json)`).join('\n');
        throw new Error(`No config.json found in any visualization directory\n\nFound directories:\n${list}`);
    }

    const missingBuilds = withConfig.filter(
        (e) => !existsSync(join(projectRoot, 'dist', e.name, 'visualization.js'))
    );
    if (missingBuilds.length > 0) {
        const list = missingBuilds.map((e) => `  - dist/${e.name}/visualization.js`).join('\n');
        throw new Error(
            `Missing built visualization bundles:\n${list}\n\nMake sure you have run the build command before packaging`
        );
    }
}

// ---------------------------------------------------------------------------
// Config file generation
// ---------------------------------------------------------------------------

function getVizLabel(viz) {
    return viz.config.config?.name ?? viz.config.label ?? viz.config.name ?? viz.name;
}

function getVizDescription(viz) {
    return viz.config.config?.description ?? viz.config.description ?? '';
}

function generateVisualizationsConf(vizs) {
    if (vizs.length === 0) return '# No visualizations found';
    return vizs
        .map((viz) => {
            const label = getVizLabel(viz);
            const description = getVizDescription(viz);
            return `[${viz.name}]\nlabel = ${label}\ndescription = ${description}\nframework_type = studio_visualization`;
        })
        .join('\n\n');
}

function generateDefaultMeta(vizs) {
    // Splunk Cloud's `check_meta_default_write_access` appinspect rule
    // fails the build if metadata/default.meta does not explicitly grant
    // write access to specific roles. The upstream @splunk/create v11
    // template only emits per-viz `[visualizations/...]` stanzas, which
    // is not enough. Prepend the standard global stanza that the legacy
    // viz template uses (and that passes Cloud vetting).
    const globalStanza = '[]\naccess = read : [ * ], write : [ admin, sc_admin ]';
    if (vizs.length === 0) return globalStanza + '\n';
    const vizStanzas = vizs
        .map((viz) => `[visualizations/${viz.name}]\nexport = system`)
        .join('\n\n');
    return globalStanza + '\n\n' + vizStanzas + '\n';
}

function generateAppManifest(appInfo) {
    const manifest = {
        schemaVersion: '2.0.0',
        info: {
            title: appInfo.label ?? '',
            id: {
                name: appInfo.id ?? '',
                version: appInfo.version ?? '0.0.0',
            },
            author: [{ name: appInfo.author ?? '' }],
            description: appInfo.description ?? '',
        },
        supportedDeployments: ['_standalone', '_distributed', '_search_head_clustering'],
        targetWorkloads: ['_search_heads'],
    };
    if (appInfo.category) {
        manifest.info.classification = { categories: [appInfo.category] };
    }
    return manifest;
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

function stageVisualizations(vizs, stageAppDir) {
    console.log(colors.info('Copying visualizations...'));
    for (const viz of vizs) {
        console.log(colors.dim(`  Packaging ${viz.name}...`));
        const destDir = join(stageAppDir, 'appserver', 'static', 'visualizations', viz.name);
        mkdirSync(destDir, { recursive: true });

        if (!existsSync(viz.distPath)) {
            throw new Error(`Missing built file: ${viz.distPath}\nRun your build command first`);
        }
        copyFileSync(viz.distPath, join(destDir, 'visualization.js'));

        const sourceMapPath = `${viz.distPath}.map`;
        if (existsSync(sourceMapPath)) {
            copyFileSync(sourceMapPath, join(destDir, 'visualization.js.map'));
        }

        writeFileSync(join(destDir, 'config.json'), JSON.stringify(viz.config, null, 2));
    }
}

function stageAppConf(projectRoot, buildNumber) {
    console.log(colors.info('Generating app configuration...'));
    const appConfPath = getAppConfPath(projectRoot);
    const appConfContent = readFileSync(appConfPath, 'utf-8');
    const appInfo = parseAppConf(appConfContent);

    if (!appInfo.id) {
        throw new Error('package/app/app.conf must contain [package] id = <app-id> (Splunk app identity).');
    }
    validateAppId(appInfo.id);

    const interpolated = interpolateTemplate(appConfContent, {
        buildNumber,
        appVersion: appInfo.version ?? '',
    });

    const stageDefaultDir = join(join(projectRoot, 'stage', appInfo.id), 'default');
    mkdirSync(stageDefaultDir, { recursive: true });
    writeFileSync(join(stageDefaultDir, 'app.conf'), interpolated);

    return appInfo;
}

function stageConfFiles(stageAppDir, vizs) {
    console.log(colors.info('Generating visualizations.conf...'));
    // NOTE: the upstream @splunk/create v11.0.0 template forgets to create
    // the default/ directory here. stageAppConf() does mkdir it, but main()
    // then rmSync's stageAppDir and only mkdirs the bare app dir again, so
    // by the time we get here default/ no longer exists. Make it ourselves.
    const defaultDir = join(stageAppDir, 'default');
    mkdirSync(defaultDir, { recursive: true });
    writeFileSync(join(defaultDir, 'visualizations.conf'), generateVisualizationsConf(vizs));

    console.log(colors.info('Generating metadata exports...'));
    const metaDir = join(stageAppDir, 'metadata');
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(join(metaDir, 'default.meta'), generateDefaultMeta(vizs));
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

async function createSplArchive(stageDir, appId, distDir, filename) {
    console.log(colors.info('Creating .spl archive...'));
    mkdirSync(distDir, { recursive: true });
    const outputPath = join(distDir, filename);
    await createTar({ gzip: true, file: outputPath, cwd: stageDir, filter: (p) => !p.startsWith('.') }, [appId]);
    return outputPath;
}

// ---------------------------------------------------------------------------
// Build number
// ---------------------------------------------------------------------------

function getGitHash(short = true) {
    try {
        return execSync(`git rev-parse ${short ? '--short' : ''} HEAD`).toString().trim();
    } catch {
        console.warn(colors.warning('Warning: Could not get git commit hash, using timestamp instead'));
        return Date.now().toString(16);
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main({ cwd }) {
    const projectRoot = resolve(cwd);

    console.log(colors.info('Validating project structure...'));
    try {
        validateProjectStructure(projectRoot);
    } catch (err) {
        console.error(colors.error(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }

    const vizs = discoverVisualizations(projectRoot);
    if (vizs.length === 0) {
        console.error(colors.error('Error: No visualizations found'));
        console.error(colors.error('Make sure visualizations/ directory contains subdirectories with config.json'));
        process.exit(1);
    }

    console.log(colors.info(`Found ${vizs.length} visualization(s):`));
    for (const viz of vizs) {
        console.log(colors.dim(`  - ${viz.name}`));
    }

    const fullHash = getGitHash(false);
    const shortHash = fullHash.substring(0, 7);
    const buildNumber = Number.parseInt(fullHash.substring(0, 8), 16);

    // Read app.conf first to get appId/version, but do NOT write the
    // staged copy yet — the rmSync below would wipe it. Stage it after
    // the dir is cleaned.
    let appInfo;
    try {
        const appConfPath = getAppConfPath(projectRoot);
        appInfo = parseAppConf(readFileSync(appConfPath, 'utf-8'));
        if (!appInfo.id) {
            throw new Error('package/app/app.conf must contain [package] id = <app-id> (Splunk app identity).');
        }
        validateAppId(appInfo.id);
    } catch (err) {
        console.error(colors.error(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }

    const appId = appInfo.id;
    const appVersion = appInfo.version ?? '0.0.0';
    console.log(colors.info(`\nPackaging ${appId} v${appVersion}...`));

    const stageDir = join(projectRoot, 'stage');
    const stageAppDir = join(stageDir, appId);
    const distDir = join(projectRoot, 'dist');

    console.log(colors.info('Creating app structure...'));
    rmSync(stageAppDir, { recursive: true, force: true });
    mkdirSync(stageAppDir, { recursive: true });

    // Now stage app.conf (writes stage/<appid>/default/app.conf)
    try {
        stageAppConf(projectRoot, buildNumber);
    } catch (err) {
        console.error(colors.error(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }

    try {
        stageVisualizations(vizs, stageAppDir);
    } catch (err) {
        console.error(colors.error(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
    }

    stageConfFiles(stageAppDir, vizs);

    console.log(colors.info('Generating app manifest...'));
    writeFileSync(join(stageAppDir, 'app.manifest'), JSON.stringify(generateAppManifest(appInfo), null, 2));

    const splatFilename = `${appId}-${appVersion}-${shortHash}.spl`;
    const outputPath = await createSplArchive(stageDir, appId, distDir, splatFilename);

    console.log(colors.success('Successfully created Splunk app package!'));
    console.log(colors.dim(`Output: ${outputPath}`));
    console.log(colors.dim(`Staging directory: ${stageAppDir}`));
}

main({ cwd: process.cwd() }).catch((err) => {
    console.error(err);
    process.exit(1);
});
