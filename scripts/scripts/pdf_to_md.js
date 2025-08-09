#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import YAML from 'yaml';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep a handle to both roots: the scripts package root and the repository root
const scriptsRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '..', '..');
const dataFile = path.resolve(scriptsRoot, 'car.yaml');
// paths are provided per-entry in YAML (pdf_path, md_path)

function readYaml(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(text);
}

function zeroPadPart(part) {
  return String(part).padStart(3, '0');
}

function buildFrontMatter({ part, name, url, pages }) {
  const title = `CAR Part ${part} - ${name}`;
  const date = new Date().toISOString();
  return [
    '---',
    `title: ${title}`,
    `source_url: ${url}`,
    `pages: ${pages}`,
    `generated_at: ${date}`,
    '---',
    ''
  ].join('\n');
}

function normalizeTextToMarkdown(text) {
  // Minimal normalization: trim excessive blank lines
  const lines = text.split(/\r?\n/);
  const compact = [];
  let blankCount = 0;
  for (const line of lines) {
    const trimmed = line.replace(/\s+$/,'');
    if (trimmed === '') {
      blankCount += 1;
      if (blankCount <= 2) compact.push('');
    } else {
      blankCount = 0;
      compact.push(trimmed);
    }
  }
  return compact.join('\n');
}

async function convertOne(pdfPath, meta, outFile) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages = pdf.numPages;
  let text = '';
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(it => (typeof it.str === 'string' ? it.str : ''));
    text += strings.join(' ') + '\n\n';
  }
  const markdownBody = normalizeTextToMarkdown(text);
  const fm = buildFrontMatter({ part: zeroPadPart(meta.part), name: meta.name, url: meta.url, pages });
  const md = `${fm}# ${meta.name}\n\n${markdownBody}\n`;
  fs.writeFileSync(outFile, md, 'utf8');
  return { outFile, pages, bytes: Buffer.byteLength(md, 'utf8') };
}

async function main() {
  const entries = readYaml(dataFile);
  const byPart = new Map(entries.map(e => [zeroPadPart(e.part), e]));
  const results = [];
  for (const [part, meta] of byPart.entries()) {
    // Determine PDF path relative to repo root, mirroring downloader behavior
    let relPdf;
    if (meta.pdf && typeof meta.pdf === 'string' && meta.pdf.trim() !== '') {
      const candidate = meta.pdf.trim();
      const hasPathSeparator = candidate.includes('/') || candidate.includes(path.sep);
      relPdf = hasPathSeparator ? candidate : path.join('download', 'car', candidate);
    } else {
      relPdf = path.join('download', 'car', `Part_${part}_Consolidation.pdf`);
    }
    const pdfPath = path.resolve(repoRoot, relPdf);
    if (!fs.existsSync(pdfPath)) {
      console.warn(`[MISS] Part ${part} missing PDF at ${pdfPath}`);
      results.push({ part, ok: false, error: 'missing_pdf', pdfPath });
      continue;
    }
    try {
      // determine output path based on meta.md (kept relative to scripts root)
      let relMd;
      if (meta.md && typeof meta.md === 'string' && meta.md.trim() !== '') {
        const candidate = meta.md.trim();
        const hasPathSeparator = candidate.includes('/') || candidate.includes(path.sep);
        relMd = hasPathSeparator ? candidate : path.join('md', 'car', candidate);
      } else {
        relMd = path.join('md', 'car', `Part_${part}.md`);
      }
      if (relMd.toLowerCase().endsWith('.pdf')) relMd = relMd.slice(0, -4) + '.md';
      const outFile = path.resolve(scriptsRoot, relMd);
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      const r = await convertOne(pdfPath, meta, outFile);
      console.log(`[OK] Part ${part} -> ${r.outFile} (${r.pages} pages, ${r.bytes} bytes)`);
      results.push({ part, ok: true, ...r });
    } catch (err) {
      console.error(`[FAIL] Part ${part} -> ${err.message}`);
      results.push({ part, ok: false, error: String(err) });
    }
  }

  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  const reportPath = path.resolve(scriptsRoot, 'convert_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Summary: ${ok} ok, ${fail} fail`);
  console.log(`Report: ${reportPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


