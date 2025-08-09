-- CreateTable
CREATE TABLE "public"."QueryHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "totalTokens" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "finishReason" TEXT,
    "durationMs" INTEGER,
    "rawResponse" JSONB,

    CONSTRAINT "QueryHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueryHistory_createdAt_idx" ON "public"."QueryHistory"("createdAt");
