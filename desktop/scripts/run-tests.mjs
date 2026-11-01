// Compiles every src/*.test.ts with esbuild, then runs the result with Node's built-in test
// runner. No test framework: the tests use node:test and node:assert.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = `${root}src`;
const output = `${root}.test-build`;

const tests = readdirSync(source)
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => `${source}/${name}`);
if (tests.length === 0) {
  console.log("No test files.");
  process.exit(0);
}

rmSync(output, { recursive: true, force: true });
await build({
  entryPoints: tests,
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: output,
  outExtension: { ".js": ".mjs" },
  logLevel: "warning",
});

const built = readdirSync(output)
  .filter((name) => name.endsWith(".mjs"))
  .map((name) => `${output}/${name}`);
const run = spawnSync(process.execPath, ["--test", ...built], { stdio: "inherit" });
process.exit(run.status ?? 1);
