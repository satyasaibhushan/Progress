UPDATE "habits" AS habit
SET "currentCount" = COALESCE((
  SELECT SUM(log."count")::INTEGER
  FROM "habit_logs" AS log
  WHERE log."habitId" = habit."id"
), 0);

CREATE OR REPLACE FUNCTION sync_habit_current_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "habits"
    SET "currentCount" = "currentCount" + NEW."count"
    WHERE "id" = NEW."habitId";
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE "habits"
    SET "currentCount" = GREATEST(0, "currentCount" - OLD."count")
    WHERE "id" = OLD."habitId";
    RETURN OLD;
  END IF;

  IF OLD."habitId" = NEW."habitId" THEN
    UPDATE "habits"
    SET "currentCount" = GREATEST(0, "currentCount" + NEW."count" - OLD."count")
    WHERE "id" = NEW."habitId";
  ELSE
    UPDATE "habits"
    SET "currentCount" = GREATEST(0, "currentCount" - OLD."count")
    WHERE "id" = OLD."habitId";

    UPDATE "habits"
    SET "currentCount" = "currentCount" + NEW."count"
    WHERE "id" = NEW."habitId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "habit_logs_sync_current_count" ON "habit_logs";

CREATE TRIGGER "habit_logs_sync_current_count"
AFTER INSERT OR DELETE OR UPDATE OF "count", "habitId" ON "habit_logs"
FOR EACH ROW
EXECUTE FUNCTION sync_habit_current_count();
