"use client"

import { useMemo, useState } from "react"
import type { HTMLAttributes, ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"

type AskResponse = {
  content: string
  summary: {
    id: string
    model: string
    created: number
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
      // Allow backend variations without breaking UI
      prompt_tokens_details?: Record<string, unknown>
      completion_tokens_details?: Record<string, unknown>
    }
    finish_reason?: string
  }
}

export default function Home() {
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<AskResponse | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  const durationSec = useMemo(() => {
    if (!startedAt || !loading) return null
    return Math.max(0, Math.round((Date.now() - startedAt) / 1000))
  }, [startedAt, loading])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setAnswer(null)
    setLoading(true)
    setStartedAt(Date.now())
    try {
      const resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      })
      const json = (await resp.json()) as unknown
      if (!resp.ok) {
        const maybeError = json as { error?: string }
        throw new Error(maybeError.error ?? `Request failed: ${resp.status}`)
      }
      setAnswer(json as AskResponse)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const totalTokens = answer?.summary?.usage?.total_tokens
  const promptTokens = answer?.summary?.usage?.prompt_tokens
  const completionTokens = answer?.summary?.usage?.completion_tokens

  type CodeProps = HTMLAttributes<HTMLElement> & { inline?: boolean; className?: string; children?: ReactNode }
  const markdownComponents: Partial<Components> = {
    code({ inline, children, ...props }: CodeProps) {
      if (inline) {
        return (
          <code className="break-words whitespace-pre-wrap" {...props}>
            {children}
          </code>
        )
      }
      return (
        <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted p-4" {...props}>
          {children}
        </pre>
      )
    },
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Ask CAA / CAR (NZ)</h1>
      <p className="text-sm text-muted-foreground mt-1">
        One-shot Q&A grounded on NZ Civil Aviation Act and Rules.
      </p>

      <Separator className="my-6" />

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="question">Question</Label>
          <Textarea
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., What are the VFR minima for class C and D airspace? Include citations."
            rows={6}
            required
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Asking…
              </span>
            ) : (
              "Ask"
            )}
          </Button>
          {loading && (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              Waiting for response{durationSec ? ` · ${durationSec}s` : ""}
            </span>
          )}
        </div>
      </form>

      {error && (
        <div className="mt-6">
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {answer && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Response — {answer.summary.model}
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {typeof totalTokens === "number" ? (
                <span>
                  tokens: {totalTokens}
                  {typeof promptTokens === "number" && typeof completionTokens === "number"
                    ? ` (prompt ${promptTokens} + completion ${completionTokens})`
                    : ""}
                </span>
              ) : (
                <span>tokens: n/a</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <article className="prose prose-neutral prose-headings:scroll-mt-24 prose-pre:whitespace-pre-wrap max-w-none dark:prose-invert break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {answer.content}
              </ReactMarkdown>
            </article>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
