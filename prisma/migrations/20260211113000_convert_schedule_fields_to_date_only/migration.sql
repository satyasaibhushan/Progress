-- Reinterpret stored task/habit schedule timestamps as user-local time,
-- convert that local time to UTC, then keep only the UTC calendar date.

UPDATE "tasks" t
SET "startDate" = ((t."startDate" AT TIME ZONE COALESCE(tz.name, 'UTC')) AT TIME ZONE 'UTC')
FROM "users" u
LEFT JOIN pg_timezone_names tz ON tz.name = u."timezone"
WHERE t."userId" = u.id
  AND t."startDate" IS NOT NULL;

UPDATE "tasks" t
SET "deadline" = ((t."deadline" AT TIME ZONE COALESCE(tz.name, 'UTC')) AT TIME ZONE 'UTC')
FROM "users" u
LEFT JOIN pg_timezone_names tz ON tz.name = u."timezone"
WHERE t."userId" = u.id
  AND t."deadline" IS NOT NULL;

UPDATE "habits" h
SET "startDate" = ((h."startDate" AT TIME ZONE COALESCE(tz.name, 'UTC')) AT TIME ZONE 'UTC')
FROM "users" u
LEFT JOIN pg_timezone_names tz ON tz.name = u."timezone"
WHERE h."userId" = u.id
  AND h."startDate" IS NOT NULL;

UPDATE "habits" h
SET "endDate" = ((h."endDate" AT TIME ZONE COALESCE(tz.name, 'UTC')) AT TIME ZONE 'UTC')
FROM "users" u
LEFT JOIN pg_timezone_names tz ON tz.name = u."timezone"
WHERE h."userId" = u.id
  AND h."endDate" IS NOT NULL;

ALTER TABLE "tasks"
ALTER COLUMN "startDate" TYPE DATE USING ("startDate"::DATE),
ALTER COLUMN "deadline" TYPE DATE USING ("deadline"::DATE);

ALTER TABLE "habits"
ALTER COLUMN "startDate" TYPE DATE USING ("startDate"::DATE),
ALTER COLUMN "endDate" TYPE DATE USING ("endDate"::DATE);

