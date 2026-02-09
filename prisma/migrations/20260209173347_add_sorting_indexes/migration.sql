-- CreateIndex
CREATE INDEX "habits_endDate_idx" ON "habits"("endDate");

-- CreateIndex
CREATE INDEX "habits_userId_startDate_idx" ON "habits"("userId", "startDate");

-- CreateIndex
CREATE INDEX "habits_userId_endDate_idx" ON "habits"("userId", "endDate");

-- CreateIndex
CREATE INDEX "habits_userId_updatedAt_idx" ON "habits"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "tasks_userId_startDate_idx" ON "tasks"("userId", "startDate");

-- CreateIndex
CREATE INDEX "tasks_userId_deadline_idx" ON "tasks"("userId", "deadline");

-- CreateIndex
CREATE INDEX "tasks_userId_updatedAt_idx" ON "tasks"("userId", "updatedAt");
