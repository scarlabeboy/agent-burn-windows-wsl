/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { sortModels, totalBreakdown } from "./aggregate";
import type { AgentReport, ModelRow, UsageReport } from "./types";

const rows: ModelRow[] = [
  { model: "gpt-5", totalTokens: 900, totalCost: 2, percentage: 20 },
  { model: "claude-opus", totalTokens: 300, totalCost: 7, percentage: 70 },
  { model: "claude-haiku", totalTokens: 300, totalCost: 1, percentage: 10 },
];
const names = (list: ModelRow[]) => list.map((row) => row.model);

test("the models table orders by spend, highest first", () => {
  assert.deepEqual(names(sortModels(rows, { key: "cost", descending: true })), ["claude-opus", "gpt-5", "claude-haiku"]);
});

test("models sort by name and by tokens, equal tokens in name order", () => {
  assert.deepEqual(names(sortModels(rows, { key: "model", descending: false })), ["claude-haiku", "claude-opus", "gpt-5"]);
  assert.deepEqual(names(sortModels(rows, { key: "tokens", descending: true })), ["gpt-5", "claude-haiku", "claude-opus"]);
  assert.deepEqual(names(sortModels(rows, { key: "share", descending: false })), ["claude-haiku", "gpt-5", "claude-opus"]);
});

test("the overview breakdown adds up every harness", () => {
  const agent = (name: string, input: number, output: number, cacheRead: number, cacheWrite: number) =>
    ({ agent: name, tokenBreakdown: { input, output, cacheRead, cacheWrite } }) as AgentReport;
  const report = { agents: [agent("codex", 10, 2, 300, 0), agent("claude", 5, 1, 900, 40)] } as UsageReport;
  assert.deepEqual(totalBreakdown(report), { input: 15, output: 3, cacheRead: 1200, cacheWrite: 40 });
});
