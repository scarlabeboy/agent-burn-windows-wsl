/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheReport, flush, loadArchive } from "./archive";
import type { UsageReport } from "./types";

// The Rust side, as the page sees it: the daily archive exists but cannot be read.
const written: string[] = [];
let writeArchive = async (name: string) => {
  written.push(name);
  return null;
};
(globalThis as unknown as { window: unknown }).window = {
  __TAURI_INTERNALS__: {
    invoke: async (command: string, args: { name: string }) => {
      if (command === "archive_write") {
        return writeArchive(args.name);
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
  await flush();
  assert.deepEqual(written, ["report-cache"], "the report cache is saved, the daily archive left alone");
});

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("writes of the same archive wait for the previous write", async (context) => {
  await loadArchive();
  const previous = writeArchive;
  context.after(() => { writeArchive = previous; });
  const starts = [deferred(), deferred()];
  const finishes = [deferred(), deferred()];
  let started = 0;
  writeArchive = async (name) => {
    assert.equal(name, "report-cache");
    const index = started++;
    starts[index].resolve();
    await finishes[index].promise;
    return null;
  };

  cacheReport("windows", report, 2, false);
  const firstFlush = flush();
  await starts[0].promise;
  cacheReport("windows", report, 3, false);
  let flushed = false;
  const secondFlush = flush().then(() => { flushed = true; });
  await Promise.resolve();
  assert.equal(started, 1, "the second write must not overlap the first");

  finishes[0].resolve();
  await starts[1].promise;
  assert.equal(flushed, false, "flush waits for the queued write too");
  finishes[1].resolve();
  await Promise.all([firstFlush, secondFlush]);
  assert.equal(started, 2);
  assert.equal(flushed, true);
});

test("flush waits for an ongoing write even with no pending timer", async (context) => {
  await loadArchive();
  const previous = writeArchive;
  context.after(() => { writeArchive = previous; });
  const started = deferred();
  const finish = deferred();
  writeArchive = async () => {
    started.resolve();
    await finish.promise;
    return null;
  };

  cacheReport("windows", report, 4, false);
  const saving = flush();
  await started.promise;
  let flushed = false;
  const closing = flush().then(() => { flushed = true; });
  await Promise.resolve();
  assert.equal(flushed, false);
  finish.resolve();
  await Promise.all([saving, closing]);
  assert.equal(flushed, true);
});

test("a failed archive write does not block the next save", async (context) => {
  await loadArchive();
  const previous = writeArchive;
  context.after(() => { writeArchive = previous; });
  writeArchive = async () => { throw new Error("archive is temporarily unavailable"); };
  cacheReport("windows", report, 5, false);
  await flush();

  let saved = false;
  writeArchive = async () => { saved = true; return null; };
  cacheReport("windows", report, 6, false);
  await flush();
  assert.equal(saved, true);
});
