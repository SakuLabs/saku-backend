-- CreateTable
CREATE TABLE "LlmProxyUsage" (
    "id" TEXT NOT NULL,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmProxyUsage_pkey" PRIMARY KEY ("id")
);
