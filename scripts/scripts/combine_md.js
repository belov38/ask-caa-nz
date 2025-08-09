#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const dataFile = path.resolve(projectRoot, 'car.yaml');
const defaultOut = path.resolve(projectRoot, 'md', 'ALL_CAR.md');

function readYaml(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(text);
}

function zeroPadPart(part) { return String(part).padStart(3, '0'); }

function extractFrontMatterAndBody(mdText) {
  const lines = mdText.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { meta: {}, body: mdText };
  }
  let i = 1;
  while (i < lines.length && lines[i].trim() !== '---') i += 1;
  if (i >= lines.length) return { meta: {}, body: mdText };
  const yamlText = lines.slice(1, i).join('\n');
  const body = lines.slice(i + 1).join('\n');
  let meta = {};
  try { meta = YAML.parse(yamlText) || {}; } catch {}
  return { meta, body };
}

function normalizeSpacing(text) {
  // Ensure exactly one blank line between docs
  return text.replace(/\n{3,}/g, '\n\n');
}

async function main() {
  const entries = readYaml(dataFile);
  const outPath = process.env.OUT || defaultOut;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  // Sort by numeric part
  const sorted = [...entries].sort((a, b) => (a.part || 0) - (b.part || 0));

  const parts = [];
  let count = 0;
  for (const e of sorted) {
    // Ensure CAR files are searched under scripts/md/car/*.md
    let mdRel;
    if (e.md && typeof e.md === 'string') {
      mdRel = path.isAbsolute(e.md) ? e.md : path.join('md', 'car', e.md);
    } else {
      mdRel = path.join('md', 'car', `Part_${zeroPadPart(e.part)}.md`);
    }
    const mdAbs = path.resolve(projectRoot, mdRel);
    if (!fs.existsSync(mdAbs)) {
      console.warn(`[MISS] skipping Part ${zeroPadPart(e.part)} (not found: ${mdAbs})`);
      continue;
    }
    const raw = fs.readFileSync(mdAbs, 'utf8');
    const { meta, body } = extractFrontMatterAndBody(raw);
    const metaBlock = {
      part: zeroPadPart(e.part),
      name: e.name,
      source_url: meta.source_url || e.url,
      pages: meta.pages,
      generated_at: meta.generated_at
    };
    // drop undefined fields
    Object.keys(metaBlock).forEach(k => metaBlock[k] === undefined && delete metaBlock[k]);
    const header = `\n\n<!-- BEGIN Part_${zeroPadPart(e.part)}: ${e.name} -->\n` +
      '```yaml\n' + YAML.stringify(metaBlock) + '```\n';
    const footer = `\n<!-- END Part_${zeroPadPart(e.part)} -->\n`;
    parts.push(header + body.trimEnd() + footer);
    count += 1;
  }

  const combined = normalizeSpacing(parts.join('\n')) + '\n';
  fs.writeFileSync(outPath, combined, 'utf8');
  console.log(`Combined ${count} files -> ${outPath} (${combined.length} chars)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


