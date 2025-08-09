#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import process from 'node:process';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Defaults (overridable via env)
const DEFAULT_URL = process.env.CAA_URL
  || 'https://www.legislation.govt.nz/act/public/2023/0010/latest/096be8ed81f4efea.pdf';
const DEFAULT_PDF_REL = process.env.CAA_PDF_OUT || path.join('download', 'caa', 'CAA_2023_0010.pdf');
const DEFAULT_MD_REL = process.env.CAA_MD_OUT || path.join('md', 'caa', 'CAA_2023_0010.md');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const REFERER = 'https://www.legislation.govt.nz/act/public/2023/0010/latest/whole.html';
const ACCEPT = 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8';

function getClient(url) {
  return url.startsWith('https:') ? https : http;
}

function fetchWithRedirects(url, options = {}, maxRedirects = 5, cookieJar = new Map()) {
  return new Promise((resolve, reject) => {
    const client = getClient(url);
    const cookie = Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    const headers = { 'User-Agent': UA, 'Accept': ACCEPT, 'Referer': REFERER };
    if (cookie) headers['Cookie'] = cookie;
    const req = client.get(url, { headers, ...options }, res => {
      const setCookie = res.headers['set-cookie'];
      if (setCookie) {
        for (const cookieStr of setCookie) {
          const [kv] = cookieStr.split(';');
          const [k, v] = kv.split('=');
          if (k && v) cookieJar.set(k.trim(), v.trim());
        }
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects === 0) return reject(new Error('Too many redirects'));
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchWithRedirects(next, options, maxRedirects - 1, cookieJar));
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', reject);
  });
}

function normalizeTextToMarkdown(text) {
  const lines = text.split(/\r?\n/);
  const compact = [];
  let blankCount = 0;
  for (const line of lines) {
    const trimmed = line.replace(/\s+$/, '');
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

function buildFrontMatter({ title, url, pages }) {
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

function looksLikePdf(buffer) {
  if (!buffer || buffer.length < 5) return false;
  const head = buffer.subarray(0, 5).toString('utf8');
  return head === '%PDF-';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadPdf(url, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  const cookieJar = new Map();
  let res = await fetchWithRedirects(url, {}, 8, cookieJar);
  let mime = (res.headers['content-type'] || '').split(';')[0].trim();
  if ((mime !== 'application/pdf' || res.body.length < 10240) && !looksLikePdf(res.body)) {
    await sleep(400);
    res = await fetchWithRedirects(url, {}, 8, cookieJar);
    mime = (res.headers['content-type'] || '').split(';')[0].trim();
  }
  if (!looksLikePdf(res.body)) {
    throw new Error(`Unexpected response (status ${res.statusCode}, type ${mime || 'unknown'}, size ${res.body.length})`);
  }
  fs.writeFileSync(tmpPath, res.body);
  fs.renameSync(tmpPath, outPath);
  return { outPath, bytes: res.body.length, mime: mime || 'application/pdf' };
}

async function convertPdfToMarkdown(pdfPath, outPath, meta) {
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
  const fm = buildFrontMatter({ title: meta.title, url: meta.url, pages });
  const md = `${fm}# ${meta.title}\n\n${markdownBody}\n`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, 'utf8');
  return { outPath, pages, bytes: Buffer.byteLength(md, 'utf8') };
}

async function main() {
  const url = DEFAULT_URL;
  const pdfOut = path.resolve(projectRoot, DEFAULT_PDF_REL);
  const mdOut = path.resolve(projectRoot, DEFAULT_MD_REL);
  const title = 'Civil Aviation Act 2023';

  console.log(`[CAA] Downloading PDF from ${url}`);
  const dl = await downloadPdf(url, pdfOut);
  console.log(`[CAA] Saved PDF -> ${dl.outPath} (${dl.bytes} bytes)`);

  console.log(`[CAA] Converting PDF to Markdown`);
  const conv = await convertPdfToMarkdown(pdfOut, mdOut, { title, url });
  console.log(`[CAA] Saved Markdown -> ${conv.outPath} (${conv.pages} pages, ${conv.bytes} bytes)`);

  console.log(`[CAA] Done.`);
}

main().catch(err => {
  console.error('[CAA] ERROR:', err.message || err);
  process.exit(1);
});


