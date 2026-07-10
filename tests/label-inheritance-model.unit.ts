import assert from "node:assert/strict";
import test from "node:test";
import { deriveInheritedLabelSources } from "../lib/label-inheritance-model";

const directTaskLabels = new Map([
  ["root", new Set(["focus"])],
  ["child", new Set(["urgent"])],
  ["grandchild", new Set<string>()],
  ["other-root", new Set(["personal"])],
]);
const directHabitLabels = new Map([["habit", new Set(["daily"])]]);

test("labels flow through the full task ancestry to linked habits", () => {
  const model = deriveInheritedLabelSources(
    [
      { id: "root", parentId: null },
      { id: "child", parentId: "root" },
      { id: "grandchild", parentId: "child" },
      { id: "other-root", parentId: null },
    ],
    [{ id: "habit", parentTaskId: "grandchild" }],
    directTaskLabels,
    directHabitLabels
  );

  assert.deepEqual([...model.taskSources.get("grandchild")!.entries()].sort(), [
    ["focus", "root"],
    ["urgent", "child"],
  ]);
  assert.deepEqual([...model.habitSources.get("habit")!.entries()].sort(), [
    ["focus", "root"],
    ["urgent", "child"],
  ]);
});

test("reparenting drops old inherited labels and adopts the new ancestry", () => {
  const model = deriveInheritedLabelSources(
    [
      { id: "root", parentId: null },
      { id: "child", parentId: "other-root" },
      { id: "grandchild", parentId: "child" },
      { id: "other-root", parentId: null },
    ],
    [{ id: "habit", parentTaskId: "grandchild" }],
    directTaskLabels,
    directHabitLabels
  );

  assert.deepEqual([...model.taskSources.get("grandchild")!.entries()].sort(), [
    ["personal", "other-root"],
    ["urgent", "child"],
  ]);
  assert.equal(model.taskSources.get("grandchild")!.has("focus"), false);
  assert.equal(model.habitSources.get("habit")!.has("focus"), false);
});
