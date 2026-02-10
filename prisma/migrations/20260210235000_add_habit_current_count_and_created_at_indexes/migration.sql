ALTER TABLE "habits"
ADD COLUMN "currentCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "habits" AS h
SET "currentCount" = COALESCE(log_totals.total_count, 0)
FROM (
  SELECT "habitId", SUM("count")::INTEGER AS total_count
  FROM "habit_logs"
  GROUP BY "habitId"
) AS log_totals
WHERE h."id" = log_totals."habitId";

CREATE INDEX "habits_userId_createdAt_idx" ON "habits"("userId", "createdAt");

CREATE INDEX "tasks_userId_createdAt_idx" ON "tasks"("userId", "createdAt");
