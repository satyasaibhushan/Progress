ALTER TABLE "task_labels"
ADD COLUMN "inheritedFromTaskId" TEXT;

ALTER TABLE "habit_labels"
ADD COLUMN "inheritedFromTaskId" TEXT;

WITH RECURSIVE task_ancestors AS (
  SELECT child."id" AS "taskId", child."parentId" AS "ancestorId", 1 AS depth
  FROM "tasks" AS child
  WHERE child."parentId" IS NOT NULL

  UNION ALL

  SELECT ancestry."taskId", parent."parentId", ancestry.depth + 1
  FROM task_ancestors AS ancestry
  JOIN "tasks" AS parent ON parent."id" = ancestry."ancestorId"
  WHERE parent."parentId" IS NOT NULL
), closest_sources AS (
  SELECT
    descendant."taskId",
    descendant."labelId",
    ancestry."ancestorId" AS "sourceTaskId",
    ROW_NUMBER() OVER (
      PARTITION BY descendant."taskId", descendant."labelId"
      ORDER BY ancestry.depth
    ) AS rank
  FROM "task_labels" AS descendant
  JOIN task_ancestors AS ancestry ON ancestry."taskId" = descendant."taskId"
  JOIN "task_labels" AS ancestor
    ON ancestor."taskId" = ancestry."ancestorId"
   AND ancestor."labelId" = descendant."labelId"
)
UPDATE "task_labels" AS target
SET "inheritedFromTaskId" = source."sourceTaskId"
FROM closest_sources AS source
WHERE source.rank = 1
  AND target."taskId" = source."taskId"
  AND target."labelId" = source."labelId";

WITH RECURSIVE habit_ancestors AS (
  SELECT habit."id" AS "habitId", habit."parentTaskId" AS "ancestorId", 0 AS depth
  FROM "habits" AS habit
  WHERE habit."parentTaskId" IS NOT NULL

  UNION ALL

  SELECT ancestry."habitId", parent."parentId", ancestry.depth + 1
  FROM habit_ancestors AS ancestry
  JOIN "tasks" AS parent ON parent."id" = ancestry."ancestorId"
  WHERE parent."parentId" IS NOT NULL
), closest_sources AS (
  SELECT
    habit_label."habitId",
    habit_label."labelId",
    ancestry."ancestorId" AS "sourceTaskId",
    ROW_NUMBER() OVER (
      PARTITION BY habit_label."habitId", habit_label."labelId"
      ORDER BY ancestry.depth
    ) AS rank
  FROM "habit_labels" AS habit_label
  JOIN habit_ancestors AS ancestry ON ancestry."habitId" = habit_label."habitId"
  JOIN "task_labels" AS task_label
    ON task_label."taskId" = ancestry."ancestorId"
   AND task_label."labelId" = habit_label."labelId"
)
UPDATE "habit_labels" AS target
SET "inheritedFromTaskId" = source."sourceTaskId"
FROM closest_sources AS source
WHERE source.rank = 1
  AND target."habitId" = source."habitId"
  AND target."labelId" = source."labelId";

CREATE INDEX "task_labels_inheritedFromTaskId_idx"
ON "task_labels"("inheritedFromTaskId");

CREATE INDEX "habit_labels_inheritedFromTaskId_idx"
ON "habit_labels"("inheritedFromTaskId");
