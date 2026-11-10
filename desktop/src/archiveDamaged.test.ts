/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveProblem, cachedReports, flush, loadArchive } from "./archive";

// A quota history with a damaged reading, next to a sound report cache.
const written: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: { name: string }) => {
      if (command === "archive_write") {
        written.push(args.name);
        return null;
      }
      if (args.name === "quota-history") return { version: 1, series: { "claude|10080|1": [null] } };
      if (args.name === "report-cache") return { version: 1, sources: { windows: { report: { agents: [], daily: [], models: [], totals: { totalCost: 0, totalTokens: 0 } }, loadedAt: 1 } } };
      return null;
    },
  },
};

test("a damaged quota history leaves the other archives loaded", async () => {
  await loadArchive();
  await flush();
  assert.match(archiveProblem() ?? "", /quota-history\.json holds unexpected content/);
  assert.deepEqual(Object.keys(cachedReports()), ["windows"]);
  assert.ok(!written.includes("quota-history"), "the damaged history is never saved over");
});
