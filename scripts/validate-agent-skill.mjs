import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const canonicalDirectory = join(repositoryRoot, '.agents', 'skills', 'splunk-viz');
const canonicalPath = join(canonicalDirectory, 'SKILL.md');
const claudeAdapterPath = join(
    repositoryRoot,
    '.claude',
    'skills',
    'splunk-viz',
    'SKILL.md'
);
const failures = [];

function fail(message) {
    failures.push(message);
}

function readRequired(path, label) {
    if (!existsSync(path)) {
        fail(`${label} does not exist: ${path}`);
        return '';
    }
    return readFileSync(path, 'utf8');
}

function parseFrontmatter(markdown, label) {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) {
        fail(`${label} has no valid YAML frontmatter block`);
        return { keys: [], name: '', description: '' };
    }

    const lines = match[1].split(/\r?\n/);
    const keys = lines
        .filter((line) => /^[a-z][a-z0-9_-]*:/.test(line))
        .map((line) => line.slice(0, line.indexOf(':')));
    const nameLine = lines.find((line) => line.startsWith('name:')) || '';
    const descriptionStart = lines.findIndex((line) => line.startsWith('description:'));
    const descriptionLines = [];

    if (descriptionStart >= 0) {
        const inline = lines[descriptionStart].slice('description:'.length).trim();
        if (inline && inline !== '>-' && inline !== '>') descriptionLines.push(inline);
        for (let index = descriptionStart + 1; index < lines.length; index += 1) {
            if (!/^\s+/.test(lines[index])) break;
            descriptionLines.push(lines[index].trim());
        }
    }

    return {
        keys,
        name: nameLine.slice('name:'.length).trim().replace(/^['"]|['"]$/g, ''),
        description: descriptionLines.join(' ').replace(/\s+/g, ' ').trim(),
    };
}

const canonical = readRequired(canonicalPath, 'Canonical skill');
const adapter = readRequired(claudeAdapterPath, 'Claude adapter');
const canonicalMetadata = parseFrontmatter(canonical, 'Canonical skill');
const adapterMetadata = parseFrontmatter(adapter, 'Claude adapter');
const canonicalReferenceNames = new Set(
    readdirSync(join(canonicalDirectory, 'references')).filter((name) => name.endsWith('.md'))
);
const portableContent = [
    canonical,
    ...Array.from(canonicalReferenceNames, (name) =>
        readFileSync(join(canonicalDirectory, 'references', name), 'utf8')
    ),
].join('\n');

const allowedKeys = ['description', 'name'];
for (const key of canonicalMetadata.keys) {
    if (!allowedKeys.includes(key)) {
        fail(`Canonical skill uses host-specific frontmatter key: ${key}`);
    }
}

for (const requiredKey of allowedKeys) {
    if (!canonicalMetadata.keys.includes(requiredKey)) {
        fail(`Canonical skill is missing frontmatter key: ${requiredKey}`);
    }
}

if (canonicalMetadata.name !== 'splunk-viz') {
    fail(`Canonical skill name must be splunk-viz, found: ${canonicalMetadata.name}`);
}

if (adapterMetadata.name !== canonicalMetadata.name) {
    fail('Claude adapter name does not match the canonical skill');
}

if (adapterMetadata.description !== canonicalMetadata.description) {
    fail('Claude adapter description does not match the canonical skill');
}

const canonicalLineCount = canonical.split(/\r?\n/).length;
if (canonicalLineCount > 500) {
    fail(`Canonical SKILL.md has ${canonicalLineCount} lines; keep it at or below 500`);
}

const forbiddenPatterns = [
    ['Claude settings path', /\.claude\/settings/],
    ['Cursor rules path', /\.cursor\/rules/],
    ['Codex configuration path', /\.codex\/config/],
    ['Claude-only allowed-tools', /^allowed-tools:/m],
    ['Claude-only invocation control', /^disable-model-invocation:/m],
    ['Claude-only skill variable', /\$\{CLAUDE_SKILL_DIR\}/],
];

for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(portableContent)) fail(`Canonical skill package contains ${label}`);
}

const referenceMatches = canonical.matchAll(/`(references\/[a-z0-9-]+\.md)`/g);
for (const match of referenceMatches) {
    const referencePath = join(canonicalDirectory, match[1]);
    if (!existsSync(referencePath)) fail(`Missing referenced skill file: ${match[1]}`);
}

if (canonicalReferenceNames.size === 0) fail('Canonical skill has no reference files');

const adapterTarget = resolve(dirname(claudeAdapterPath), '../../../.agents/skills/splunk-viz/SKILL.md');
if (adapterTarget !== canonicalPath || !existsSync(adapterTarget)) {
    fail('Claude adapter does not resolve to the canonical SKILL.md');
}

if (!adapter.includes('../../../.agents/skills/splunk-viz/SKILL.md')) {
    fail('Claude adapter does not instruct Claude to load the canonical skill');
}

for (const instructionFile of ['AGENTS.md', 'CLAUDE.md']) {
    if (!existsSync(join(repositoryRoot, instructionFile))) {
        fail(`Missing repository instruction adapter: ${instructionFile}`);
    }
}

if (failures.length > 0) {
    console.error('Portable skill validation failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log(
    `Portable skill validation passed (${canonicalLineCount} SKILL.md lines, ` +
        `${canonicalReferenceNames.size} references).`
);
