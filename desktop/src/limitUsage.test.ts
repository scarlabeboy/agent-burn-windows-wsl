/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OTHER,
  buildChart,
  modelLabel,
  surfaceLabel,
  totalUsed,
  type LimitUsageDay,
} from "./limitUsage";

const day = (
  date: string,
  surfaces: [string, number][],
  models: [string, string | null, number][] = [],
): LimitUsageDay => ({
  date,
  usedPercent: surfaces.reduce((sum, [, percent]) => sum + percent, 0),
  surfaces: surfaces.map(([surface, usedPercent]) => ({ surface, usedPercent })),
  models: models.map(([model, speed, usedPercent]) => ({ model, speed, usedPercent })),
});

test("surfaces get readable names, and unknown ones are counted as other", () => {
  assert.equal(surfaceLabel("cli"), "CLI");
  assert.equal(surfaceLabel("desktop_app"), "Application de bureau");
  assert.equal(surfaceLabel("work_desktop"), "Application de bureau (Work)");
  assert.equal(surfaceLabel("a_surface_nobody_heard_of"), OTHER);
});

test("a model shows its speed only when it is not the standard one", () => {
  assert.equal(modelLabel({ model: "gpt-6", speed: "fast", usedPercent: 1 }), "gpt-6 (fast)");
  assert.equal(modelLabel({ model: "gpt-6", speed: "standard", usedPercent: 1 }), "gpt-6");
  assert.equal(modelLabel({ model: "gpt-6", speed: null, usedPercent: 1 }), "gpt-6");
});

test("rows are ordered by date and carry the percent of each series", () => {
  const chart = buildChart(
    [
      day("2026-10-31", [["desktop_app", 30], ["cli", 2]]),
      day("2026-10-30", [["cli", 40]]),
    ],
    "surface",
  );
  assert.deepEqual(chart.rows, [
    { date: "2026-10-30", CLI: 40 },
    { date: "2026-10-31", "Application de bureau": 30, CLI: 2 },
  ]);
  assert.deepEqual(
    chart.series.map((entry) => entry.name),
    ["CLI", "Application de bureau"],
  );
  assert.equal(chart.series[0].total, 42);
});

test("only the five biggest series are kept, the rest become other", () => {
  const surfaces: [string, number][] = [
    ["cli", 50],
    ["desktop_app", 40],
    ["vscode", 30],
    ["web", 20],
    ["mobile", 10],
    ["slack", 3],
    ["linear", 2],
  ];
  const chart = buildChart([day("2026-10-31", surfaces)], "surface");
  assert.deepEqual(
    chart.series.map((entry) => entry.name),
    ["CLI", "Application de bureau", "Extension IDE", "Cloud", "Mobile", OTHER],
  );
  assert.equal(chart.series[5].total, 5);
  assert.equal(chart.rows[0][OTHER], 5);
});

test("models can be grouped instead of surfaces", () => {
  const chart = buildChart(
    [
      day("2026-10-31", [["cli", 33]], [
        ["gpt-5.6-sol", null, 30],
        ["gpt-6.1-sol", "fast", 3],
      ]),
    ],
    "model",
  );
  assert.deepEqual(
    chart.series.map((entry) => entry.name),
    ["gpt-5.6-sol", "gpt-6.1-sol (fast)"],
  );
});

test("a day without usage still has a row, and no days give an empty chart", () => {
  assert.deepEqual(buildChart([day("2026-11-01", [])], "surface").rows, [{ date: "2026-11-01" }]);
  assert.deepEqual(buildChart([], "surface"), { rows: [], series: [] });
});

test("the total adds every day up", () => {
  assert.equal(totalUsed([day("a", [["cli", 5]]), day("b", [["cli", 10], ["web", 1]])]), 16);
});

test("the days given are not reordered in place", () => {
  const days = [day("2026-10-31", [["cli", 1]]), day("2026-10-30", [["cli", 1]])];
  buildChart(days, "surface");
  assert.deepEqual(
    days.map((entry) => entry.date),
    ["2026-10-31", "2026-10-30"],
  );
});
