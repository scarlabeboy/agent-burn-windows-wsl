import assert from "node:assert/strict";
import test from "node:test";
import { planProfile, withPlanProfile } from "./plans";
import type { SubscriptionAgent } from "./types";

test("every individual Codex plan gets its name and price, from any of its names", () => {
  const codex = (plan: string, price: number | null = null) => planProfile("codex", plan, price);
  assert.deepEqual(codex("Free"), { label: "Free", price: 0, noSession: false });
  assert.equal(codex("Go")?.price, 8);
  assert.equal(codex("Plus", 20)?.label, "Plus");
  // What the CLI shows today for each Pro plan, and the names it could use later.
  assert.deepEqual([codex("Prolite")?.label, codex("Pro", 200)?.label, codex("Promax")?.label], ["Pro 100", "Pro 200", "Pro 500"]);
  assert.deepEqual([codex("Pro 100")?.price, codex("Pro (More)")?.price, codex("Pro (Max)")?.price], [100, 200, 500]);
});

test("Claude's Max 20× is Ultra, without a 5-hour session", () => {
  assert.deepEqual(planProfile("claude", "Max 20×", 200), { label: "Ultra", price: 200, noSession: true });
  assert.deepEqual(planProfile("claude", "Ultra", null), { label: "Ultra", price: 200, noSession: true });
  assert.deepEqual(planProfile("claude", "Max 5×", 100), { label: "Max", price: 100, noSession: false });
  assert.equal(planProfile("claude", "Pro", 20)?.noSession, false);
});

test("an unknown plan keeps the CLI's name and price; no plan has no profile", () => {
  assert.deepEqual(planProfile("codex", "Team", null), { label: "Team", price: null, noSession: false });
  assert.equal(planProfile("codex", "Enterprise", 60)?.price, 60);
  assert.equal(planProfile("claude", null, null), undefined);
});

test("the value is worked out again with the app's price", () => {
  const sub = (plan: string, price: number | null): SubscriptionAgent => ({
    agent: "codex",
    plan,
    pricePerMonth: price,
    liveLimits: true,
    periodUsage: 0,
    resetCreditsAvailable: null,
    estimate: { fullQuotaValue: 900, monthlyValue: 400, projectedUsePercent: 50, valueMultiple: null },
  });
  assert.equal(withPlanProfile(sub("Prolite", null))?.estimate?.valueMultiple, 4);
  assert.equal(withPlanProfile(sub("Go", null))?.pricePerMonth, 8);
  // Free is worth no multiple of its price, and an unknown price none either.
  assert.equal(withPlanProfile(sub("Free", null))?.estimate?.valueMultiple, null);
  assert.equal(withPlanProfile(sub("Team", null))?.estimate?.valueMultiple, null);
});
