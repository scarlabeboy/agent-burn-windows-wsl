/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { errorText } from "./errors";
import { setLang } from "./i18n";

test("every known message of the Rust side reads as a short sentence in French", () => {
  setLang("fr");
  const cases: [string, string][] = [
    ["agent-burn timed out", "la lecture a dépassé 3 minutes"],
    ["agent-burn exited with exit code: 1", "l'outil de lecture s'est arrêté sur une erreur"],
    ["could not start agent-burn: Accès refusé. (os error 5)", "l'outil de lecture n'a pas pu démarrer"],
    ["agent-burn output is too large", "réponse de l'outil de lecture illisible"],
    ["agent-burn returned an unsupported report", "réponse de l'outil de lecture illisible"],
    ["WSL could not be listed", "WSL ne répond pas"],
    ["WSL distribution 'Ubuntu' is stopped", "distribution arrêtée"],
    ["WSL distribution 'Ubuntu' is unavailable", "distribution introuvable"],
    ["invalid date '2026-13-01'", "erreur inattendue"],
  ];
  for (const [message, expected] of cases) assert.equal(errorText(message), expected, message);
  assert.match(errorText("cli-missing: agent-burn.exe"), /agent-burn\.exe est absent/);
});

test("the same messages read in English", () => {
  setLang("en");
  assert.equal(errorText("agent-burn timed out"), "the read took over 3 minutes");
  assert.equal(errorText("WSL distribution 'Debian' is stopped"), "distribution stopped");
  assert.equal(errorText("something new"), "unexpected error");
  setLang("fr");
});
