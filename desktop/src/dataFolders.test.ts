/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { readDataFolders, withFolder } from "./dataFolders";

test("stored folders are checked one by one", () => {
  assert.equal(readDataFolders(undefined), undefined);
  assert.equal(readDataFolders(["C:\\a"]), undefined, "a list is no setting");
  assert.deepEqual(
    readDataFolders({ claude: ["D:\\claude\\", 42, "", "d:\\CLAUDE"], codex: "D:\\codex", cursor: ["E:\\x"] }),
    { claude: ["D:\\claude"] },
  );
  assert.equal(readDataFolders({ claude: [] }), undefined);
});

test("a folder is added once, at most ten", () => {
  assert.deepEqual(withFolder(["D:\\a"], "D:\\A\\", "D:\\b"), ["D:\\a", "D:\\b"]);
  const many = Array.from({ length: 12 }, (_, index) => `D:\\f${index}`);
  assert.equal(withFolder([], ...many).length, 10);
  assert.deepEqual(withFolder([], "x".repeat(501)), [], "too long");
  assert.deepEqual(withFolder([], "D:\\", "E:/"), ["D:\\", "E:\\"], "a drive root keeps its separator");
});
