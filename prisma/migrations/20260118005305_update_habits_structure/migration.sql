-- Wipe existing habit data as requested
DELETE FROM "habit_logs";
DELETE FROM "habits";

-- Alter enum to remove N_PER_DAY and keep DAILY, WEEKLY, MONTHLY
-- First, create new enum type
CREATE TYPE "HabitType_new" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- Update existing habits (if any remain after delete, set to DAILY)
ALTER TABLE "habits" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "habits" ALTER COLUMN "type" TYPE "HabitType_new" USING (
  CASE 
    WHEN "type"::text = 'N_PER_DAY' THEN 'DAILY'::"HabitType_new"
    ELSE "type"::text::"HabitType_new"
  END
);

-- Drop old enum and rename new one
DROP TYPE "HabitType";
ALTER TYPE "HabitType_new" RENAME TO "HabitType";

-- Set default back
ALTER TABLE "habits" ALTER COLUMN "type" SET DEFAULT 'DAILY'::"HabitType";

-- Add activeDays column (array of integers for weekly habits)
ALTER TABLE "habits" ADD COLUMN "activeDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Make targetCount required (NOT NULL)
-- Since we wiped data, we can safely make it NOT NULL
ALTER TABLE "habits" ALTER COLUMN "targetCount" SET NOT NULL;
ALTER TABLE "habits" ALTER COLUMN "targetCount" DROP DEFAULT;
