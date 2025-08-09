#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import { execSync } from 'node:child_process';
import process from 'node:process';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const dataFile = path.resolve(projectRoot, 'data', 'car.yaml');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const REFERER = 'https://www.aviation.govt.nz/rules/rule-part/';

// output paths will be resolved per-entry from YAML (pdf_path)

function readYaml(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(text);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getClient(url) {
  return url.startsWith('https:') ? https : http;
}

function fetchWithRedirects(url, options = {}, maxRedirects = 5, cookieJar = new Map()) {
  return new Promise((resolve, reject) => {
    const client = getClient(url);
    const headers = { 'User-Agent': UA, 'Referer': REFERER, 'Accept': 'application/pdf,*/*' };
    const cookie = Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) headers['Cookie'] = cookie;
    const req = client.get(url, { headers, ...options }, res => {
      // collect set-cookie
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

async function warmSession(cookieJar) {
  try {
    await fetchWithRedirects(REFERER, {}, 5, cookieJar);
  } catch {}
}

function zeroPadPart(part) {
  return String(part).padStart(3, '0');
}

function computeDefaultPdfPath(part) {
  const p = zeroPadPart(part);
  return path.join('download', 'car', `Part_${p}_Consolidation.pdf`);
}

async function downloadPdf(entry, cookieJar) {
  const part = zeroPadPart(entry.part);
  const url = entry.url;
  const relOut = entry.pdf && typeof entry.pdf === 'string' && entry.pdf.trim() !== ''
    ? entry.pdf
    : computeDefaultPdfPath(part);
  const outPath = path.resolve(projectRoot, relOut);
  const tmpPath = `${outPath}.tmp`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const tryOnce = async () => {
    const res = await fetchWithRedirects(url, {}, 8, cookieJar);
    return res;
  };

  let res = await tryOnce();
  const mime = (res.headers['content-type'] || '').split(';')[0].trim();
  if (mime !== 'application/pdf' || res.body.length < 10240) {
    // Some endpoints require extra delay or second attempt
    await sleep(400);
    res = await tryOnce();
  }

  const mime2 = (res.headers['content-type'] || '').split(';')[0].trim();
  if (mime2 !== 'application/pdf' || res.body.length < 10240) {
    return { ok: false, part, size: res.body.length, mime: mime2, outPath };
  }

  fs.writeFileSync(tmpPath, res.body);
  fs.renameSync(tmpPath, outPath);
  return { ok: true, part, size: res.body.length, mime: mime2, outPath };
}

async function main() {
  const list = readYaml(dataFile);
  const cookieJar = new Map();
  await warmSession(cookieJar);
  const results = [];
  for (const entry of list) {
    const r = await downloadPdf(entry, cookieJar);
    results.push({ ...entry, ...r });
    const status = r.ok ? 'OK' : 'FAIL';
    console.log(`[${status}] Part ${r.part} -> ${r.mime} ${r.size} bytes ${r.ok ? 'saved' : ''}`);
  }
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  // write report json
  const reportPath = path.resolve(projectRoot, 'download', 'car', 'report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Summary: ${ok} ok, ${fail} fail`);
  console.log(`Output: ${path.resolve(projectRoot)}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


