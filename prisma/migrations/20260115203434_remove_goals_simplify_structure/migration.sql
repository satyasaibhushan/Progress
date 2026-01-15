/*
  Warnings:

  - You are about to drop the column `goalId` on the `tasks` table. All the data in the column will be lost.
  - You are about to drop the `goal_habits` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `goal_labels` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `goals` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "goal_habits" DROP CONSTRAINT "goal_habits_goalId_fkey";

-- DropForeignKey
ALTER TABLE "goal_habits" DROP CONSTRAINT "goal_habits_habitId_fkey";

-- DropForeignKey
ALTER TABLE "goal_labels" DROP CONSTRAINT "goal_labels_goalId_fkey";

-- DropForeignKey
ALTER TABLE "goal_labels" DROP CONSTRAINT "goal_labels_labelId_fkey";

-- DropForeignKey
ALTER TABLE "goals" DROP CONSTRAINT "goals_groupId_fkey";

-- DropForeignKey
ALTER TABLE "goals" DROP CONSTRAINT "goals_userId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_goalId_fkey";

-- DropIndex
DROP INDEX "tasks_goalId_idx";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "goalId",
ADD COLUMN     "groupId" TEXT;

-- DropTable
DROP TABLE "goal_habits";

-- DropTable
DROP TABLE "goal_labels";

-- DropTable
DROP TABLE "goals";

-- CreateIndex
CREATE INDEX "tasks_groupId_idx" ON "tasks"("groupId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
