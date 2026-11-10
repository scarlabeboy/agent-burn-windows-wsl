/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveProblem, archivedDays, cachedReports, flush, loadArchive } from "./archive";

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

test("archives of the wrong shape stay read-only, the sound one loads", async () => {
  await loadArchive();
  await flush();
  const problem = archiveProblem() ?? "";
  assert.match(problem, /quota-history\.json holds unexpected content|report-cache\.json holds unexpected content/);
  assert.deepEqual(cachedReports(), {});
  assert.deepEqual(archivedDays("windows"), { claude: { "2026-09-01": { tokens: 10, cost: 1 } } });
  assert.ok(!written.includes("quota-history") && !written.includes("report-cache"));
});
