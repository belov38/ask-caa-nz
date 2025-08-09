import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from 'openai/resources/chat/completions'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'

type AskRequestBody = {
  question?: string
  max_tokens?: number
  temperature?: number
}

function readTextOrThrow(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`System prompt file not found: ${filePath}`)
  }
  return fs.readFileSync(filePath, 'utf8')
}

function readTextIfExists(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
  } catch {}
  return ''
}

function buildPolicy(): string {
  return [
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
  ].join('\n')
}

function resolveDefaultPaths() {
  // Default to repository layout: <repo>/scripts/md/{car, caa}
  // API route runs with CWD of the frontend app in dev/build.
  const repoRoot = path.resolve(process.cwd(), '..')
  const scriptsRoot = path.resolve(repoRoot, 'scripts')
  const mdRoot = path.resolve(scriptsRoot, 'md')
  return {
    defaultSystemPath: path.resolve(mdRoot, 'ALL_CAR.md'),
    defaultCaaPath: path.resolve(mdRoot, 'caa', 'CAA_2023_0010.md'),
  }
}

async function handleAsk(question: string, bodyOverrides?: Partial<AskRequestBody>) {
  const { defaultSystemPath, defaultCaaPath } = resolveDefaultPaths()

  const model = process.env.OPENAI_MODEL || 'gpt-4.1'
  const systemPath = process.env.SYSTEM_PATH || defaultSystemPath
  const caaPath = process.env.CAA_PATH || defaultCaaPath
  const maxOutputTokensEnv = process.env.MAX_OUTPUT_TOKENS
  const temperatureEnv = process.env.TEMPERATURE

  const maxTokens =
    typeof bodyOverrides?.max_tokens === 'number'
      ? bodyOverrides!.max_tokens
      : maxOutputTokensEnv
      ? Number(maxOutputTokensEnv)
      : 32000

  const temperature =
    typeof bodyOverrides?.temperature === 'number'
      ? bodyOverrides!.temperature
      : temperatureEnv !== undefined && temperatureEnv !== ''
      ? Number(temperatureEnv)
      : undefined

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing OPENAI_API_KEY in env. Set it before running.' },
      { status: 500 },
    )
  }

  const carText = readTextOrThrow(systemPath)
  const caaText = readTextIfExists(caaPath)

  const sections: string[] = []
  sections.push(buildPolicy())
  if (caaText && caaText.trim()) {
    sections.push('===== BEGIN: CAA (Act) =====')
    sections.push(caaText)
    sections.push('===== END: CAA (Act) =====')
  }
  sections.push('===== BEGIN: CAR (Rules) =====')
  sections.push(carText)
  sections.push('===== END: CAR (Rules) =====')
  const fullSystemText = sections.join('\n\n')

  const client = new OpenAI({ apiKey })

  const payload: ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: [
      { role: 'system', content: fullSystemText },
      { role: 'user', content: question },
    ],
    stream: false,
    ...(typeof maxTokens === 'number' && !Number.isNaN(maxTokens)
      ? { max_tokens: maxTokens }
      : {}),
    ...(typeof temperature === 'number' && !Number.isNaN(temperature)
      ? { temperature }
      : {}),
  }

  const resp = (await client.chat.completions.create(payload)) as ChatCompletion
  const content = resp.choices?.[0]?.message?.content || ''
  const summary = {
    id: resp.id,
    model: resp.model,
    created: resp.created,
    usage: resp.usage,
    finish_reason: resp.choices?.[0]?.finish_reason,
  }

  return NextResponse.json({ content, summary })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as AskRequestBody
    const question = body?.question?.trim()
    if (!question) {
      return NextResponse.json(
        { error: 'Missing question. Provide { "question": "..." } in JSON body.' },
        { status: 400 },
      )
    }
    return await handleAsk(question, body)
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? 'Unexpected server error' },
      { status: 500 },
    )
  }
}

// GET removed to keep API surface minimal; use POST only.


