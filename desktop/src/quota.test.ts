/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { FRESH_MS, freshness } from "./quota";

const clock = (ms: number) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(ms);

test("a recent reading shows only the time it was measured", () => {
  const observed = new Date(2026, 10, 1, 13, 19).getTime();
  const state = freshness(observed, observed + 20_000);
  assert.equal(state.fresh, true);
  assert.equal(state.label, clock(observed));
});

test("a stale reading says how long ago it was measured", () => {
  const observed = new Date(2026, 10, 1, 13, 19).getTime();
  const state = freshness(observed, observed + FRESH_MS + 4 * 60_000);
  assert.equal(state.fresh, false);
  assert.equal(state.label, `${clock(observed)} · il y a 5 min`);
});
