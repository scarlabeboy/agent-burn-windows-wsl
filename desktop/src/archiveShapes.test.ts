/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveProblem, archivedDays, cacheReport, cachedReports, flush, loadArchive } from "./archive";

// Two archives of the wrong shape (an array for a dictionary, a missing report), one sound.
const written: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: { name: string }) => {
      if (command === "archive_write") {
        written.push(args.name);
        return null;
      }
      if (args.name === "quota-history") return { version: 1, series: [] };
      if (args.name === "report-cache") return { version: 1, sources: { windows: null } };
      return { version: 1, sources: { windows: { claude: { "2026-09-01": { tokens: 10, cost: 1 } } } } };
    },
  },
};

test("a history of the wrong shape stays read-only, a broken report cache starts over", async () => {
  await loadArchive();
  await flush();
  const problem = archiveProblem() ?? "";
  assert.match(problem, /quota-history\.json holds unexpected content/);
  assert.doesNotMatch(problem, /report-cache/, "the report cache is rebuilt, not reported");
  assert.deepEqual(cachedReports(), {});
  assert.deepEqual(archivedDays("windows"), { claude: { "2026-09-01": { tokens: 10, cost: 1 } } });
  assert.ok(!written.includes("quota-history"), "the damaged history is never saved over");
  cacheReport("windows", { agents: [], daily: [], models: [], totals: { totalCost: 0, totalTokens: 0 } }, 2, false);
  await flush();
  assert.ok(written.includes("report-cache"), "the next scan saves the cache again");
});
