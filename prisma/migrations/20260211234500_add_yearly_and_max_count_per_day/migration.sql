-- Add YEARLY habit type
ALTER TYPE "HabitType" ADD VALUE IF NOT EXISTS 'YEARLY';

-- Add max count per day to habits
ALTER TABLE "habits" ADD COLUMN "maxCountPerDay" INTEGER NOT NULL DEFAULT 1;

-- Backfill maxCountPerDay from existing DAILY countPerPeriod values
UPDATE "habits"
SET "maxCountPerDay" = CASE
  WHEN "type" = 'DAILY' THEN GREATEST(1, COALESCE("countPerPeriod", 1))
  ELSE 1
END;

-- Normalize DAILY habits to use countPerPeriod=1
UPDATE "habits"
SET "countPerPeriod" = 1
WHERE "type" = 'DAILY';

-- Default DAILY activeDays to all days if empty
UPDATE "habits"
SET "activeDays" = ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[]
WHERE "type" = 'DAILY'
  AND (cardinality("activeDays") = 0 OR "activeDays" IS NULL);
