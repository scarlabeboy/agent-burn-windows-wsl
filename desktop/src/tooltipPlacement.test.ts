/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { tooltipPlacement } from "./tooltipPlacement";

test("a top-right trigger uses the left side and slides down inside the margin", () => {
  assert.deepEqual(
    tooltipPlacement({ top: 12, right: 780, bottom: 46, left: 746 }, { width: 200, height: 60 }, { width: 800, height: 600 }),
    { top: 8, left: 538, side: "left" },
  );
});

test("a bottom-left trigger uses the top side and slides right inside the margin", () => {
  assert.deepEqual(
    tooltipPlacement({ top: 570, right: 108, bottom: 592, left: 8 }, { width: 200, height: 60 }, { width: 800, height: 600 }),
    { top: 502, left: 8, side: "top" },
  );
});

test("a middle trigger prefers the top side and centers the tooltip", () => {
  assert.deepEqual(
    tooltipPlacement({ top: 280, right: 420, bottom: 320, left: 380 }, { width: 200, height: 60 }, { width: 800, height: 600 }),
    { top: 212, left: 300, side: "top" },
  );
});

test("the right side is tried before the bottom side when top and left cannot fit", () => {
  assert.deepEqual(
    tooltipPlacement({ top: 8, right: 48, bottom: 42, left: 14 }, { width: 200, height: 60 }, { width: 800, height: 600 }),
    { top: 8, left: 56, side: "right" },
  );
});

test("the bottom side leaves 28 pixels for the pointer", () => {
  assert.deepEqual(
    tooltipPlacement({ top: 8, right: 420, bottom: 42, left: 380 }, { width: 760, height: 60 }, { width: 800, height: 600 }),
    { top: 70, left: 20, side: "bottom" },
  );
});

test("a fitting side takes priority over a side with more space", () => {
  assert.deepEqual(
    tooltipPlacement({ top: 70, right: 420, bottom: 110, left: 380 }, { width: 200, height: 50 }, { width: 800, height: 600 }),
    { top: 12, left: 300, side: "top" },
  );
});

test("a small window clamps the tooltip inside its margin even when it overlaps the trigger", () => {
  const trigger = { top: 50, right: 160, bottom: 70, left: 140 };
  const size = { width: 220, height: 90 };
  const viewport = { width: 300, height: 120 };
  const placement = tooltipPlacement(trigger, size, viewport);
  assert.equal(placement.side, "left");
  assert.ok(placement.left >= 8);
  assert.ok(placement.top >= 8);
  assert.ok(placement.left + size.width <= viewport.width - 8);
  assert.ok(placement.top + size.height <= viewport.height - 8);
  assert.ok(placement.left < trigger.right && placement.left + size.width > trigger.left);
  assert.ok(placement.top < trigger.bottom && placement.top + size.height > trigger.top);
});
