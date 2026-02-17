/*
  Warnings:

  - Made the column `description` on table `Task` required. This step will fail if there are existing NULL values in that column.

*/
UPDATE "Task" SET "description" = 'No description provided' WHERE "description" IS NULL;
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "directMessageUserId" TEXT;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "description" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "Message_directMessageUserId_idx" ON "Message"("directMessageUserId");
