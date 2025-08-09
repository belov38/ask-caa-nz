#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataPath = path.resolve(projectRoot, 'data', 'car.yaml');

function zeroPadPart(part) { return String(part).padStart(3, '0'); }

const text = fs.readFileSync(dataPath, 'utf8');
const list = YAML.parse(text);
const updated = list.map(item => {
  const part = zeroPadPart(item.part);
  const pdf = item.pdf && String(item.pdf).trim() !== ''
    ? item.pdf
    : path.join('download', 'car', `Part_${part}_Consolidation.pdf`);
  let md = item.md && String(item.md).trim() !== ''
    ? item.md
    : path.join('md', 'car', `Part_${part}.md`);
  // normalize md extension to .md if mistakenly set to .pdf
  if (md.toLowerCase().endsWith('.pdf')) {
    md = md.slice(0, -4) + '.md';
  }
  // remove legacy keys if present
  const { pdf_path, md_path, ...rest } = item;
  return { ...rest, pdf, md };
});

const outText = YAML.stringify(updated);
fs.writeFileSync(dataPath, outText, 'utf8');
console.log(`Updated ${dataPath} with pdf and md fields.`);


