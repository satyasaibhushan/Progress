import assert from "node:assert/strict";
import test from "node:test";
import { deriveEffectiveTaskBounds } from "../lib/hierarchy-bounds";

test("date bounds pass through ancestors whose own dates are empty", () => {
  const bounds = deriveEffectiveTaskBounds([
    {
      id: "root",
      parentId: null,
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      deadline: new Date("2026-12-31T00:00:00.000Z"),
    },
    { id: "middle", parentId: "root", startDate: null, deadline: null },
    {
      id: "leaf",
      parentId: "middle",
      startDate: new Date("2026-03-01T00:00:00.000Z"),
      deadline: new Date("2026-11-30T00:00:00.000Z"),
    },
  ]);

  assert.equal(bounds.get("middle")?.minStartDate?.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(bounds.get("middle")?.maxEndDate?.toISOString(), "2026-12-31T00:00:00.000Z");
  assert.equal(bounds.get("leaf")?.minStartDate?.toISOString(), "2026-03-01T00:00:00.000Z");
  assert.equal(bounds.get("leaf")?.maxEndDate?.toISOString(), "2026-11-30T00:00:00.000Z");
});

test("the strictest date in an ancestry chain wins", () => {
  const bounds = deriveEffectiveTaskBounds([
    {
      id: "root",
      parentId: null,
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      deadline: new Date("2026-12-31T00:00:00.000Z"),
    },
    {
      id: "child",
      parentId: "root",
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      deadline: new Date("2026-09-30T00:00:00.000Z"),
    },
  ]);

  assert.equal(bounds.get("child")?.minStartDate?.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(bounds.get("child")?.maxEndDate?.toISOString(), "2026-09-30T00:00:00.000Z");
});
