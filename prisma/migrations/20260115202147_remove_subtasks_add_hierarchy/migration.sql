/*
  Warnings:

  - You are about to drop the column `isManualProgress` on the `tasks` table. All the data in the column will be lost.
  - You are about to drop the `subtasks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "subtasks" DROP CONSTRAINT "subtasks_taskId_fkey";

-- AlterTable
ALTER TABLE "habits" ADD COLUMN     "parentTaskId" TEXT;

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "isManualProgress",
ADD COLUMN     "parentId" TEXT,
ALTER COLUMN "importance" SET DEFAULT 50;

-- DropTable
DROP TABLE "subtasks";

-- CreateIndex
CREATE INDEX "habits_parentTaskId_idx" ON "habits"("parentTaskId");

-- CreateIndex
CREATE INDEX "tasks_parentId_idx" ON "tasks"("parentId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
