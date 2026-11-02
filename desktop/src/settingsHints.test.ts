/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatUsd } from "./aggregate";
import { setLang } from "./i18n";
import { formatAge } from "./quota";
import {
  autoUpdateActive,
  limitUsageOffReason,
  quotaHint,
  quotaOffReason,
  quotasActive,
  refreshHint,
  subscriptionOffReason,
} from "./settingsHints";
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
  assert.match(quotaHint({ ...base, quotas: false }), /ni affichés/);
  assert.match(quotaHint({ ...base, offline: true, quotas: false }), /hors ligne/);
  assert.equal(quotaOffReason(base), undefined);
  assert.match(quotaOffReason({ ...base, quotas: false }) ?? "", /désactivée/);
  assert.match(quotaOffReason({ ...base, offline: true }) ?? "", /hors ligne/);
});

test("every quota-based block gives the offline reason first, then the quota switch", () => {
  const off = { ...base, quotas: false };
  const both = { ...off, offline: true };
  for (const reason of [quotaOffReason, subscriptionOffReason, limitUsageOffReason]) {
    assert.equal(reason(base), undefined);
    assert.match(reason(off) ?? "", /lecture des quotas est désactivée/);
    assert.match(reason(both) ?? "", /hors ligne/);
  }
});

test("the usage refresh hint names the interval, or the manual button when it is off", () => {
  assert.equal(refreshHint(5), "Relit les journaux des harness toutes les 5 minutes.");
  assert.match(refreshHint(0), /démarrage et avec le bouton/);
});

test("hints, amounts and ages follow the chosen language", () => {
  setLang("en");
  try {
    assert.equal(refreshHint(5), "Reads the harness logs again every 5 minutes.");
    assert.match(quotaOffReason({ ...base, offline: true }) ?? "", /offline mode/);
    assert.equal(formatUsd(1684.3), "$1,684.30");
    assert.equal(formatAge(2 * 86_400_000), "2 days");
  } finally {
    setLang("fr");
  }
  assert.equal(formatUsd(1684.3).replace(/\s/g, " "), "1 684,30 $US");
  assert.equal(formatAge(2 * 86_400_000), "2 j");
});
