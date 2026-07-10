ALTER TABLE "tasks" ADD COLUMN "directGroupId" TEXT;
ALTER TABLE "habits" ADD COLUMN "directGroupId" TEXT;

WITH RECURSIVE task_ancestors AS (
  SELECT child."id" AS "taskId", child."parentId" AS "ancestorId"
  FROM "tasks" AS child
  WHERE child."parentId" IS NOT NULL

  UNION ALL

  SELECT ancestry."taskId", parent."parentId"
  FROM task_ancestors AS ancestry
  JOIN "tasks" AS parent ON parent."id" = ancestry."ancestorId"
  WHERE parent."parentId" IS NOT NULL
)
UPDATE "tasks" AS task
SET "directGroupId" = task."groupId"
WHERE task."groupId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM task_ancestors AS ancestry
    JOIN "tasks" AS ancestor ON ancestor."id" = ancestry."ancestorId"
    WHERE ancestry."taskId" = task."id"
      AND ancestor."groupId" = task."groupId"
  );

UPDATE "habits" AS habit
SET "directGroupId" = habit."groupId"
WHERE habit."groupId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "tasks" AS parent
    WHERE parent."id" = habit."parentTaskId"
      AND parent."groupId" = habit."groupId"
  );

CREATE INDEX "tasks_directGroupId_idx" ON "tasks"("directGroupId");
CREATE INDEX "habits_directGroupId_idx" ON "habits"("directGroupId");

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_directGroupId_fkey"
FOREIGN KEY ("directGroupId") REFERENCES "groups"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "habits"
ADD CONSTRAINT "habits_directGroupId_fkey"
FOREIGN KEY ("directGroupId") REFERENCES "groups"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
