import { spawnSync } from "node:child_process";

const buildScripts =
  process.env.VERCEL_ENV === "production"
    ? ["db:deploy", "build"]
    : ["build"];

if (process.argv.includes("--print-plan")) {
  console.log(JSON.stringify(buildScripts.map((script) => `npm run ${script}`)));
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

for (const script of buildScripts) {
  const result = spawnSync(npmCommand, ["run", script], {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
