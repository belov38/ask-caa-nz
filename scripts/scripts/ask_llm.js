#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import OpenAI from 'openai';
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Config
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-nano';
const SYSTEM_PATH = process.env.SYSTEM_PATH || path.resolve(projectRoot, 'md', 'car', 'ALL_CAR.md');
const CAA_PATH = process.env.CAA_PATH || path.resolve(projectRoot, 'md', 'caa', 'CAA_2023_0010.md');
const MAX_OUTPUT_TOKENS = process.env.MAX_OUTPUT_TOKENS ? Number(process.env.MAX_OUTPUT_TOKENS) : 32000;
const TEMPERATURE = process.env.TEMPERATURE !== undefined && process.env.TEMPERATURE !== ''
  ? Number(process.env.TEMPERATURE)
  : undefined; // omit if not set to respect model defaults


function readTextOrThrow(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`System prompt file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function readTextIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
  } catch {}
  return '';
}

function getUserPromptFromArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npm run ask:car -- "<your question>"');
    process.exit(2);
  }
  return args.join(' ');
}

async function main() {

  const carText = readTextOrThrow(SYSTEM_PATH);
  const caaText = readTextIfExists(CAA_PATH);
  const userPrompt = getUserPromptFromArgs();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY in env. Set it before running.');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  // Strict response policy: use ONLY provided primary texts (CAA and CAR); Act-first hierarchy; legal advice tone.
  const policy = [
    'You are advising using the current New Zealand Civil Aviation Act 2023 (CAA) and Civil Aviation Rules (CAR) contained in the system prompt.',
    'Authoritative sources are LIMITED to the provided CAA and CAR texts. Do NOT rely on internal knowledge, training data, or external sources.',
    '',
    'Strict requirements for EVERY response:',
    '- Identify and cite the controlling authority: CAA sections (e.g., CAA s 30) and CAR rules (e.g., Part 091, rule 91.xx).',
    '- The Act prevails over the Rules. If there is any tension, rely on the Act and explicitly note the conflict.',
    '- For every substantive proposition, include a short verbatim quotation from the relevant provision in fenced code blocks.',
    '- Include a URL for every citation. Prefer URLs found in metadata (source_url) inside the provided texts.',
    '- If the answer cannot be grounded in the provided CAA/CAR texts, state that explicitly and stop.',
    '',
    'Formatting guidelines (Markdown only):',
    '- Output MUST be valid Markdown with these sections and nothing else:',
    '  - ## Issue',
    '  - ## Rule (include one or more verbatim quotations in fenced code blocks)',
    '  - ## Application',
    '  - ## Conclusion',
    '  - ## Citations',
    '- Within the Rule section, separate “Act (CAA)” and “Rules (CAR)” when both apply.',
    '- Verbatim quotations MUST be fenced using exactly ```text.',
    '- Each citation line MUST be precise, for example: CAA s <section> — <url> OR CAR Part <part>, rule <rule> — <url>.',
    '',
    'Professional legal-advice tone (NZ context):',
    '- Be precise, conservative, and avoid speculation. If assumptions are needed, state them succinctly in the Application.',
    '- Prefer primary authority (CAA first, then CAR). Explain interpretive choices only when necessary.',
    '- Where relevant, surface definitions and offence/penalty provisions from the provided texts.',
    '',
    'Example quote block:',
    '```text',
    'Quoted passage exactly as written…',
    '```',
  ].join('\n');

  const sections = [];
  sections.push(policy);
  if (caaText && caaText.trim()) {
    sections.push('===== BEGIN: CAA (Act) =====');
    sections.push(caaText);
    sections.push('===== END: CAA (Act) =====');
  }
  sections.push('===== BEGIN: CAR (Rules) =====');
  sections.push(carText);
  sections.push('===== END: CAR (Rules) =====');
  const fullSystemText = sections.join('\n\n');

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: fullSystemText },
      { role: 'user', content: userPrompt },
    ],
  };
  if (typeof MAX_OUTPUT_TOKENS === 'number' && !Number.isNaN(MAX_OUTPUT_TOKENS)) {
    payload.max_tokens = MAX_OUTPUT_TOKENS;
  }
  if (typeof TEMPERATURE === 'number' && !Number.isNaN(TEMPERATURE)) {
    payload.temperature = TEMPERATURE;
  }

  console.debug('MAX_OUTPUT_TOKENS', MAX_OUTPUT_TOKENS);
  console.debug('TEMPERATURE', TEMPERATURE);
  const resp = await client.chat.completions.create(payload);
  const content = resp.choices?.[0]?.message?.content || '';
  process.stdout.write(content + '\n');

  // Log response metadata for auditing (token usage, model, finish reason)
  const summary = {
    id: resp.id,
    model: resp.model,
    created: resp.created,
    usage: resp.usage,
    finish_reason: resp.choices?.[0]?.finish_reason,
  };
  console.log('\n[ask_llm] response summary:', JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

