import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const buildScript = resolve(repositoryRoot, "scripts/vercel-build.mjs");

function getBuildPlan(vercelEnvironment: "preview" | "production") {
  const result = spawnSync(process.execPath, [buildScript, "--print-plan"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_ENV: vercelEnvironment,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as string[];
}

test("Vercel production deploys migrations before building", () => {
  assert.deepEqual(getBuildPlan("production"), [
    "npm run db:deploy",
    "npm run build",
  ]);
});

test("Vercel previews build without mutating the database", () => {
  assert.deepEqual(getBuildPlan("preview"), ["npm run build"]);
});

test("Vercel uses the migration-aware build entrypoint", () => {
  const config = JSON.parse(
    readFileSync(resolve(repositoryRoot, "vercel.json"), "utf8"),
  ) as { buildCommand?: string };

  assert.equal(config.buildCommand, "npm run build:vercel");
});
