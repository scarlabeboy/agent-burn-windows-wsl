/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { autoUpdateActive, quotaHint, quotaOffReason, quotasActive, refreshHint } from "./settingsHints";
import type { Settings } from "./types";

const base: Settings = {
  wslMode: "auto",
  offline: false,
  quotas: true,
  refreshMinutes: 10,
  closeToTray: false,
  autoUpdate: true,
  harnessStates: {},
};

test("offline mode turns quotas and updates off without changing their own setting", () => {
  const offline = { ...base, offline: true };
  assert.equal(quotasActive(offline), false);
  assert.equal(autoUpdateActive(offline), false);
  assert.equal(offline.quotas, true);
  assert.equal(quotasActive(base), true);
  assert.equal(autoUpdateActive(base), true);
  assert.equal(quotasActive({ ...base, quotas: false }), false);
});

test("the quota hint and the missing-quota reason follow the settings", () => {
  assert.match(quotaHint(base), /chaque minute/);
  assert.match(quotaHint({ ...base, quotas: false }), /dernier relevé/);
  assert.match(quotaHint({ ...base, offline: true, quotas: false }), /hors ligne/);
  assert.equal(quotaOffReason(base), undefined);
  assert.match(quotaOffReason({ ...base, quotas: false }) ?? "", /désactivée/);
  assert.match(quotaOffReason({ ...base, offline: true }) ?? "", /hors ligne/);
});

test("the usage refresh hint names the interval, or the manual button when it is off", () => {
  assert.equal(refreshHint(5), "Relit les journaux des harness toutes les 5 minutes.");
  assert.match(refreshHint(0), /démarrage et avec le bouton/);
});
