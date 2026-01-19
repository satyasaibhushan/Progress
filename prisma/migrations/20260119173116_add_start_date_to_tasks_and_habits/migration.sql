-- AlterTable
ALTER TABLE "habits" ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "startDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "habits_startDate_idx" ON "habits"("startDate");

-- CreateIndex
CREATE INDEX "tasks_startDate_idx" ON "tasks"("startDate");
