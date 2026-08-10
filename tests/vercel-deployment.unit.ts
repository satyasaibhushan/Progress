import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const buildScript = resolve(repositoryRoot, "scripts/vercel-build.mjs");

function getChildEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  const environment = { ...process.env, ...overrides };
  delete environment.NODE_TEST_CONTEXT;
  return environment;
}

function getBuildPlan(vercelEnvironment: "preview" | "production") {
  const result = spawnSync(process.execPath, [buildScript, "--print-plan"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: getChildEnvironment({
      VERCEL_ENV: vercelEnvironment,
    }),
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as string[];
}

function getNextConfigOutput(vercel: boolean) {
  const environment = getChildEnvironment();

  if (vercel) {
    environment.VERCEL = "1";
  } else {
    delete environment.VERCEL;
  }

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      'import("./next.config.ts").then((module) => { const config = module.default?.default ?? module.default; process.stdout.write(JSON.stringify(config.output ?? null)); })',
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as string | null;
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

test("Vercel owns its Next.js output tracing", () => {
  assert.equal(getNextConfigOutput(true), null);
});

test("self-hosted builds retain standalone output", () => {
  assert.equal(getNextConfigOutput(false), "standalone");
});
