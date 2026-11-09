import assert from "node:assert/strict";
import test from "node:test";
import { monthCost, multiSummary, readMultiAccount } from "./multiAccount";
import { catalogIdOf } from "./plans";
import type { UsageReport } from "./types";

const report = (agent: string, days: [string, number][]): UsageReport => {
  const daily = days.map(([date, cost]) => ({ date, tokens: 1, cost }));
  const total = daily.reduce((sum, point) => sum + point.cost, 0);
  return {
    agents: [
      {
        agent,
        daily,
        models: [],
        tokenBreakdown: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        totalCost: total,
        totalTokens: daily.length,
      },
    ],
    daily,
    models: [],
    totals: { totalCost: total, totalTokens: daily.length },
  };
};

test("the total adds up every chosen plan, and a line without one marks it incomplete", () => {
  const both = multiSummary("codex", { on: true, accounts: [{ name: "Perso", plan: "plus" }, { name: "", plan: "pro100" }] }, 360);
  assert.equal(both.total, 120);
  assert.equal(both.ratio, 3);
  assert.deepEqual(both.accounts[0], { name: "Perso", label: "Plus", price: 20 });
  const missing = multiSummary("codex", { on: true, accounts: [{ name: "", plan: "plus" }, { name: "", plan: null }] }, 360);
  assert.equal(missing.total, 20);
  assert.equal(missing.incomplete, true);
  assert.equal(missing.ratio, null);
});

test("free plans total zero dollars and have no ratio; no spend data has none either", () => {
  const free = multiSummary("codex", { on: true, accounts: [{ name: "", plan: "free" }, { name: "", plan: "free" }] }, 50);
  assert.deepEqual([free.total, free.incomplete, free.ratio], [0, false, null]);
  assert.equal(multiSummary("claude", { on: true, accounts: [{ name: "", plan: "pro" }, { name: "", plan: "ultra" }] }, null).ratio, null);
});

test("stored settings keep empty lines, drop damaged ones and plans outside the catalog", () => {
  const read = readMultiAccount({
    codex: { on: true, accounts: [{ name: "x".repeat(60), plan: "plus" }, { plan: "Pro 200" }, null, { name: "B", plan: null }] },
    claude: { on: "yes", accounts: [] },
    cursor: { on: true, accounts: [] },
  });
  assert.deepEqual(Object.keys(read ?? {}), ["codex"]);
  assert.equal(read?.codex?.accounts.length, 3);
  assert.equal(read?.codex?.accounts[0].name.length, 40);
  assert.equal(read?.codex?.accounts[1].plan, null);
  // A single stored line comes back with the second one beside it.
  assert.equal(readMultiAccount({ claude: { on: false, accounts: [{ name: "", plan: "max" }] } })?.claude?.accounts.length, 2);
  assert.equal(readMultiAccount([]), undefined);
  assert.equal(readMultiAccount(null), undefined);
});

test("the month's spend counts every source since the first, archived days included", () => {
  const now = new Date(2026, 10, 9, 12);
  const windows = { report: report("codex", [["2026-10-31", 99], ["2026-11-02", 10], ["2026-11-09", 5]]), days: {} };
  // WSL's report lost its first days: the archive brings them back, but not last month's.
  const wsl = {
    report: report("codex", [["2026-11-08", 20]]),
    days: { codex: { "2026-11-01": { tokens: 1, cost: 7 }, "2026-10-30": { tokens: 1, cost: 50 } } },
  };
  assert.equal(monthCost([windows, wsl], "codex", [], now), 42);
  assert.equal(monthCost([windows], "claude", [], now), 0);
  assert.equal(monthCost([], "codex", [], now), null);
  assert.equal(monthCost([windows], "codex", ["codex"], now), null);
});

test("a detected plan finds its catalog entry under any of its names", () => {
  assert.equal(catalogIdOf("codex", "Prolite", null), "pro100");
  assert.equal(catalogIdOf("codex", "Pro", 200), "pro200");
  assert.equal(catalogIdOf("claude", "Max 20×", 200), "ultra");
  assert.equal(catalogIdOf("codex", "Team", null), null);
  assert.equal(catalogIdOf("claude", null, null), null);
});
