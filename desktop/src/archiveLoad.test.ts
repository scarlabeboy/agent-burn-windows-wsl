/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheReport, flush, loadArchive } from "./archive";
import type { UsageReport } from "./types";

// The Rust side, as the page sees it: the daily archive exists but cannot be read.
const written: string[] = [];
(globalThis as unknown as { window: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: { name: string }) => {
      if (command === "archive_write") {
        written.push(args.name);
        return null;
      }
      if (args.name === "daily-metrics") throw new Error("daily-metrics.json cannot be read");
      return null;
    },
  },
};

const report: UsageReport = {
  agents: [
    {
      agent: "claude",
      daily: [{ date: "2026-11-03", tokens: 10, cost: 1 }],
      models: [],
      tokenBreakdown: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      totalCost: 1,
      totalTokens: 10,
    },
  ],
  daily: [{ date: "2026-11-03", tokens: 10, cost: 1 }],
  models: [],
  totals: { totalCost: 1, totalTokens: 10 },
};

test("an archive that could not be read is never saved over", async () => {
  await loadArchive();
  cacheReport("windows", report, 1, true);
  flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(written, ["report-cache"], "the report cache is saved, the daily archive left alone");
});
