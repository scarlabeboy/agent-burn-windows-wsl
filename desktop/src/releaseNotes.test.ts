/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { setLang } from "./i18n";
import { parseNotes, releaseDay, updateError } from "./releaseNotes";

test("the release day is read from the updater's date or an ISO date", () => {
  assert.equal(releaseDay("2026-11-02 0:30:20.0 +00:00:00"), "2 novembre 2026");
  assert.equal(releaseDay("2026-11-02T00:30:20Z"), "2 novembre 2026");
  assert.equal(releaseDay(undefined), undefined);
});

test("release notes keep their sections and items, without markup", () => {
  const notes = "### Nouveautés\n- Page « À propos »\n- **Resets** en stock\n\n### Retiré\n\n### Corrections\r\n- Barres alignées";
  assert.deepEqual(parseNotes(notes, "fr"), [
    { title: "Nouveautés", items: ["Page « À propos »", "**Resets** en stock"] },
    { title: "Corrections", items: ["Barres alignées"] },
  ]);
});

test("notes without titles are one untitled list; no notes give nothing", () => {
  assert.deepEqual(parseNotes("- Un point\nUne phrase", "fr"), [{ items: ["Un point", "Une phrase"] }]);
  assert.deepEqual(parseNotes(undefined, "fr"), []);
});

test("bilingual notes keep only the block of the chosen language; old ones show whole", () => {
  const notes = "#### English\n### New\n- Language setting\n\n#### Français\n### Nouveautés\n- Réglage de langue";
  assert.deepEqual(parseNotes(notes, "en"), [{ title: "New", items: ["Language setting"] }]);
  assert.deepEqual(parseNotes(notes, "fr"), [{ title: "Nouveautés", items: ["Réglage de langue"] }]);
  assert.deepEqual(parseNotes("### Corrections\n- Un point", "en"), [{ title: "Corrections", items: ["Un point"] }]);
});

test("updater errors are said in the interface language", () => {
  assert.match(updateError("Could not fetch a valid release JSON from the remote"), /aucune version publiée/);
  assert.match(updateError(new Error("error sending request for url")), /injoignable/);
  assert.match(updateError("signature verification failed"), /signature/);
  assert.match(updateError("boom"), /inattendue \(boom\)/);
  setLang("en");
  try {
    assert.match(updateError("error sending request for url"), /cannot be reached/);
    assert.equal(releaseDay("2026-11-02"), "November 2, 2026");
  } finally {
    setLang("fr");
  }
});
