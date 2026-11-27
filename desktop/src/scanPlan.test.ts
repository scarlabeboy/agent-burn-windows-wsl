/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { scanOptions, sourcesToScan } from "./scanPlan";

test("only a new source is scanned when the sources change", () => {
  const options = scanOptions(false, true, undefined);
  const scanned = new Map([["windows", options]]);
  assert.deepEqual(sourcesToScan(["windows", "wsl:Ubuntu"], scanned, options), ["wsl:Ubuntu"]);
  assert.deepEqual(sourcesToScan(["windows"], scanned, options), []);
});

test("every source is scanned again once an option changes", () => {
  const before = scanOptions(false, true, undefined);
  const scanned = new Map([
    ["windows", before],
    ["wsl:Ubuntu", before],
  ]);
  for (const after of [scanOptions(true, true, undefined), scanOptions(false, false, undefined), scanOptions(false, true, ["codex"])]) {
    assert.deepEqual(sourcesToScan(["windows", "wsl:Ubuntu"], scanned, after), ["windows", "wsl:Ubuntu"]);
  }
});
