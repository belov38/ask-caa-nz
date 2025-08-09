import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const takeParam = Number(searchParams.get('take') ?? '50')
    const take = Number.isFinite(takeParam) && takeParam > 0 && takeParam <= 500 ? takeParam : 50

    const items = await prisma.queryHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        question: true,
        answer: true,
        model: true,
        totalTokens: true,
        promptTokens: true,
        completionTokens: true,
        finishReason: true,
        durationMs: true,
      },
    })

    return NextResponse.json({ items })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? 'Unexpected server error' },
      { status: 500 },
    )
  }
}


