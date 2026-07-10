import assert from "node:assert/strict"
import test from "node:test"
import {
  deriveProgressModel,
  sumHabitLogCounts,
} from "../lib/progress-model"

test("habit logs are authoritative when the cached count has drifted", () => {
  const logs = [{ count: 20 }, { count: 18 }]

  assert.equal(sumHabitLogCounts(logs), 38)

  const model = deriveProgressModel([], [
    {
      id: "habit",
      parentTaskId: null,
      importance: 50,
      targetCount: 200,
      currentCount: 39,
      habitLogs: logs,
    },
  ])

  assert.equal(model.habits.get("habit")?.currentCount, 38)
  assert.equal(model.habits.get("habit")?.progress, 19)
})

test("adding a first child replaces the former leaf contribution", () => {
  const model = deriveProgressModel([
    { id: "root", parentId: null, importance: 100, progress: 0 },
    { id: "parent", parentId: "root", importance: 80, progress: 10 },
    { id: "child", parentId: "parent", importance: 40, progress: 100 },
  ], [])

  assert.deepEqual(model.tasks.get("parent"), {
    isLeaf: false,
    progress: 100,
    totalWeight: 40,
    weightedProgress: 4000,
  })
  assert.deepEqual(model.tasks.get("root"), {
    isLeaf: false,
    progress: 100,
    totalWeight: 40,
    weightedProgress: 4000,
  })
})

test("removing the last child restores the task's leaf contribution", () => {
  const model = deriveProgressModel([
    { id: "root", parentId: null, importance: 100, progress: 0 },
    { id: "parent", parentId: "root", importance: 80, progress: 25 },
  ], [])

  assert.deepEqual(model.tasks.get("root"), {
    isLeaf: false,
    progress: 25,
    totalWeight: 80,
    weightedProgress: 2000,
  })
})

test("linked habits contribute their log-derived progress to every ancestor", () => {
  const model = deriveProgressModel([
    { id: "root", parentId: null, importance: 100, progress: 0 },
    { id: "parent", parentId: "root", importance: 80, progress: 0 },
  ], [
    {
      id: "habit",
      parentTaskId: "parent",
      importance: 60,
      targetCount: 4,
      currentCount: 4,
      habitLogs: [{ count: 1 }, { count: 1 }],
    },
  ])

  assert.equal(model.habits.get("habit")?.progress, 50)
  assert.deepEqual(model.tasks.get("root"), {
    isLeaf: false,
    progress: 50,
    totalWeight: 60,
    weightedProgress: 3000,
  })
})
