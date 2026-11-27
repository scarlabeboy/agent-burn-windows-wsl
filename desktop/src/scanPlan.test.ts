/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { scanOptions, sourceOptions, sourcesToScan } from "./scanPlan";
import type { SourceId } from "./types";

const plain = (options: string) => () => options;

test("only a new source is scanned when the sources change", () => {
  const options = scanOptions(false, true, undefined);
  const scanned = new Map([["windows", options]]);
  assert.deepEqual(sourcesToScan(["windows", "wsl:Ubuntu"], scanned, plain(options)), ["wsl:Ubuntu"]);
  assert.deepEqual(sourcesToScan(["windows"], scanned, plain(options)), []);
});

test("every source is scanned again once an option changes", () => {
  const before = scanOptions(false, true, undefined);
  const scanned = new Map([
    ["windows", before],
    ["wsl:Ubuntu", before],
  ]);
  for (const after of [scanOptions(true, true, undefined), scanOptions(false, false, undefined), scanOptions(false, true, ["codex"])]) {
    assert.deepEqual(sourcesToScan(["windows", "wsl:Ubuntu"], scanned, plain(after)), ["windows", "wsl:Ubuntu"]);
  }
});

test("a data folder change rescans Windows only", () => {
  const options = scanOptions(false, true, undefined);
  const before = (id: SourceId) => sourceOptions(options, id);
  const after = (id: SourceId) => sourceOptions(options, id, { claude: ["D:\\backup"] });
  const scanned = new Map([
    ["windows", before("windows")],
    ["wsl:Ubuntu", before("wsl:Ubuntu")],
  ]);
  assert.deepEqual(sourcesToScan(["windows", "wsl:Ubuntu"], scanned, after), ["windows"]);
});
