/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { setLang } from "./i18n";
import { formatPricing, formatRate, pricingTip } from "./pricingFormat";
import type { ModelPricing } from "./types";

const pricing = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } satisfies ModelPricing;

test("French rates round floating-point noise and keep at most four decimals", () => {
  setLang("fr");
  assert.equal(formatRate(0.19999999999999998), "0,2");
  assert.equal(formatRate(3.0000000000000004), "3");
  assert.equal(formatRate(12.345678), "12,3457");
  assert.equal(formatRate(0), "0");
  assert.equal(formatRate(0.0001), "0,0001");
});

test("English rates use the app locale without unnecessary zeros", () => {
  setLang("en");
  try {
    assert.equal(formatRate(0.19999999999999998), "0.2");
    assert.equal(formatRate(3.0000000000000004), "3");
    assert.equal(formatRate(12.345678), "12.3457");
    assert.equal(formatRate(0), "0");
    assert.equal(formatRate(0.0001), "0.0001");
  } finally {
    setLang("fr");
  }
});

test("the French tooltip lists base rates and the reference-price notice", () => {
  setLang("fr");
  assert.equal(formatPricing(pricing), [
    "Tarif de référence :",
    "Entrée : 3 $US / M tokens",
    "Sortie : 15 $US / M tokens",
    "Écriture cache : 3,75 $US / M tokens",
    "Lecture cache : 0,3 $US / M tokens",
    "",
    "(pas forcément celui du coût affiché)",
  ].join("\n"));
});

test("the English tooltip includes only available long-context rates and fast mode", () => {
  setLang("en");
  try {
    assert.equal(formatPricing({ ...pricing, inputAbove200k: 6, cacheReadAbove200k: 0, fastMultiplier: 2.5 }), [
      "Reference rate:",
      "Input: 3 US$ / M tokens",
      "Output: 15 US$ / M tokens",
      "Cache write: 3.75 US$ / M tokens",
      "Cache read: 0.3 US$ / M tokens",
      "Above 200k tokens:",
      "Input: 6 US$ / M tokens",
      "Cache read: 0 US$ / M tokens",
      "Fast mode: ×2.5",
      "",
      "(may differ from the displayed cost)",
    ].join("\n"));
  } finally {
    setLang("fr");
  }
});

test("the French tooltip localizes every long-context rate and the fast multiplier", () => {
  setLang("fr");
  assert.equal(formatPricing({
    ...pricing,
    inputAbove200k: 6,
    outputAbove200k: 30,
    cacheWriteAbove200k: 7.5,
    cacheReadAbove200k: 0.6,
    fastMultiplier: 2.5,
  }), [
    "Tarif de référence :",
    "Entrée : 3 $US / M tokens",
    "Sortie : 15 $US / M tokens",
    "Écriture cache : 3,75 $US / M tokens",
    "Lecture cache : 0,3 $US / M tokens",
    "Au-delà de 200k tokens :",
    "Entrée : 6 $US / M tokens",
    "Sortie : 30 $US / M tokens",
    "Écriture cache : 7,5 $US / M tokens",
    "Lecture cache : 0,6 $US / M tokens",
    "Mode rapide : ×2,5",
    "",
    "(pas forcément celui du coût affiché)",
  ].join("\n"));
});

test("the badge greys out unknown and all-zero rates, but not a model with one paid rate", () => {
  setLang("fr");
  assert.deepEqual(pricingTip(undefined), { text: "Tarif inconnu pour ce modèle.", muted: true });
  const free = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cacheReadAbove200k: 0, fastMultiplier: 2 };
  assert.deepEqual(pricingTip(free), { text: "Tarif à 0 : modèle gratuit ou non tarifé.", muted: true });
  assert.equal(pricingTip({ ...free, output: 0.5 }).muted, false);
  assert.equal(pricingTip(pricing).text, formatPricing(pricing));
});
