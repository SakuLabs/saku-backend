-- AlterTable
ALTER TABLE "Message" ADD COLUMN "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Message_readAt_idx" ON "Message"("readAt");
