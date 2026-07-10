import assert from "node:assert/strict";
import test from "node:test";
import { resolveRootGoal } from "../lib/suggestion-context";

test("suggestion root goal resolution follows every ancestor", () => {
  const ancestors = new Map([
    ["child", { id: "child", title: "Child", parentId: "parent" }],
    ["parent", { id: "parent", title: "Parent", parentId: "root" }],
    ["root", { id: "root", title: "Root", parentId: null }],
  ]);

  assert.deepEqual(resolveRootGoal("child", ancestors), {
    id: "root",
    title: "Root",
  });
});
