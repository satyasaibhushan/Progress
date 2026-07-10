import assert from "node:assert/strict";
import test from "node:test";
import {
  getDateKeyFromInput,
  getDateKeyInTimeZone,
  isValidTimeZone,
} from "../lib/user-timezone";

test("IANA timezone validation rejects unknown zones", () => {
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Not/A_Timezone"), false);
});

test("timezone date keys follow the user's calendar day", () => {
  const instant = new Date("2026-07-09T20:00:00.000Z");
  assert.equal(getDateKeyInTimeZone(instant, "UTC"), "2026-07-09");
  assert.equal(getDateKeyInTimeZone(instant, "Asia/Kolkata"), "2026-07-10");
});

test("date input normalization preserves date-only values and applies timezone to datetimes", () => {
  assert.equal(getDateKeyFromInput("2026-02-28", "UTC"), "2026-02-28");
  assert.equal(getDateKeyFromInput("2026-02-30", "UTC"), null);
  assert.equal(
    getDateKeyFromInput("2026-07-09T20:00:00.000Z", "Asia/Kolkata"),
    "2026-07-10",
  );
});
