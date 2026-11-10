/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { readSettings } from "./api";

const cases = [
  { name: "no saved settings", raw: null, expected: "system" },
  { name: "an absent theme", raw: "{}", expected: "system" },
  { name: "an unknown theme", raw: '{"theme":"sepia"}', expected: "system" },
  { name: "a null theme", raw: '{"theme":null}', expected: "system" },
  { name: "a non-string theme", raw: '{"theme":42}', expected: "system" },
  { name: "the system theme", raw: '{"theme":"system"}', expected: "system" },
  { name: "the dark theme", raw: '{"theme":"dark"}', expected: "dark" },
  { name: "the light theme", raw: '{"theme":"light"}', expected: "light" },
] as const satisfies readonly { name: string; raw: string | null; expected: string }[];

for (const { name, raw, expected } of cases) {
  test(`readSettings normalizes ${name}`, (context) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    context.after(() => {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => key === "abf.settings" ? raw : null },
    });

    assert.equal(readSettings().theme, expected);
  });
}

const trayCases = [
  { raw: "{}", icon: "logo", window: "tightest" },
  { raw: '{"trayIcon":"codex","trayWindow":"session"}', icon: "codex", window: "session" },
  { raw: '{"trayIcon":"claude","trayWindow":"weekly"}', icon: "claude", window: "weekly" },
  { raw: '{"trayIcon":"opencode","trayWindow":"month"}', icon: "logo", window: "tightest" },
] as const;

for (const { raw, icon, window } of trayCases) {
  test(`readSettings keeps a known tray choice only: ${raw}`, (context) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    context.after(() => {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === "abf.settings" ? raw : null) },
    });

    const settings = readSettings();
    assert.equal(settings.trayIcon, icon);
    assert.equal(settings.trayWindow, window);
  });
}

const damagedCases = [
  { raw: '{"harnessStates":null,"refreshMinutes":"x"}', states: {}, minutes: 10 },
  { raw: '{"harnessStates":["codex"],"refreshMinutes":null}', states: {}, minutes: 10 },
  { raw: '{"harnessStates":{"pi":"off"},"refreshMinutes":0}', states: { pi: "off" }, minutes: 0 },
  { raw: '{"refreshMinutes":0.00001}', states: {}, minutes: 10 },
  { raw: '{"refreshMinutes":30}', states: {}, minutes: 30 },
  { raw: '{"offline":"yes","quotas":1}', states: {}, minutes: 10 },
  { raw: "null", states: {}, minutes: 10 },
] as const;

for (const { raw, states, minutes } of damagedCases) {
  test(`readSettings repairs damaged values: ${raw}`, (context) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    context.after(() => {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { getItem: (key: string) => (key === "abf.settings" ? raw : null) },
    });

    const settings = readSettings();
    assert.deepEqual(settings.harnessStates, states);
    assert.equal(settings.refreshMinutes, minutes);
    // Every switch is a real true or false, whatever was saved.
    for (const key of ["offline", "quotas", "closeToTray", "claudeRenew", "restartOnCrash", "autoUpdate"] as const) {
      assert.equal(typeof settings[key], "boolean", key);
    }
  });
}

test("readSettings keeps a valid multi-account setting and drops a damaged one", (context) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  context.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  let raw = JSON.stringify({ multiAccount: { codex: { on: true, accounts: [{ name: "A", plan: "plus" }, { name: "", plan: null }] } } });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => (key === "abf.settings" ? raw : null) },
  });
  assert.deepEqual(readSettings().multiAccount?.codex?.accounts.map((line) => line.plan), ["plus", null]);
  raw = JSON.stringify({ multiAccount: "broken", theme: "dark" });
  assert.equal(readSettings().multiAccount, undefined);
  assert.equal(readSettings().theme, "dark");
});
