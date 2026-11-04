/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventCallback } from "@tauri-apps/api/event";
import { createThemeController, resolveTheme, type ResolvedTheme } from "./theme";
import type { Settings } from "./types";

const cases = [
  { preference: "system", system: "light", expected: "light" },
  { preference: "system", system: "dark", expected: "dark" },
  { preference: "light", system: "dark", expected: "light" },
  { preference: "dark", system: "light", expected: "dark" },
] as const satisfies readonly {
  preference: Settings["theme"];
  system: ResolvedTheme;
  expected: ResolvedTheme;
}[];

for (const { preference, system, expected } of cases) {
  test(`resolves ${preference} on a ${system} system to ${expected}`, () => {
    assert.equal(resolveTheme(preference, system), expected);
  });
}

function setup(system: ResolvedTheme = "light") {
  let listener: EventCallback<ResolvedTheme> = () => {};
  let effective: ResolvedTheme | null = system;
  let stopped = false;
  const applied: (ResolvedTheme | null)[] = [];
  const shown: ResolvedTheme[] = [];
  const nativeWindow = {
    setTheme: async (theme?: ResolvedTheme | null) => {
      applied.push(theme ?? null);
      effective = theme ?? system;
    },
    theme: async (): Promise<ResolvedTheme | null> => effective,
    onThemeChanged: async (handler: typeof listener) => {
      listener = handler;
      return () => { stopped = true; };
    },
  };
  const controller = createThemeController(nativeWindow, (theme) => shown.push(theme), () => system);
  return {
    controller, nativeWindow, applied, shown,
    emit: (theme: ResolvedTheme) => listener({ event: "tauri://theme-changed", id: 0, payload: theme }),
    stopped: () => stopped,
  };
}

test("startup waits for the native theme and applies it before rendering can continue", async () => {
  const { controller, nativeWindow, shown } = setup();
  let finish = (_theme: ResolvedTheme | null) => {};
  nativeWindow.theme = () => new Promise((resolve) => { finish = resolve; });
  let rendered = false;
  const ready = controller.apply("system").then(() => { rendered = true; });
  // The queued update reaches theme() before this task runs.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(rendered, false);
  finish("light");
  await ready;
  assert.deepEqual(shown, ["light"]);
  assert.equal(rendered, true);
});

test("returning to system clears the forced native theme before reading Windows", async () => {
  const { controller, applied, shown } = setup("light");
  await controller.apply("dark");
  await controller.apply("system");
  assert.deepEqual(applied, ["dark", null]);
  assert.deepEqual(shown, ["dark", "light"]);
});

test("system follows live native changes", async () => {
  const { controller, emit, shown } = setup();
  await controller.apply("system");
  emit("dark");
  emit("light");
  assert.deepEqual(shown, ["light", "dark", "light"]);
});

for (const preference of ["dark", "light"] as const) {
  test(`${preference} stays forced when Windows changes`, async () => {
    const { controller, emit, applied, shown } = setup();
    const ready = controller.apply(preference);
    assert.deepEqual(shown, [preference], "the DOM updates synchronously");
    await ready;
    emit(preference === "dark" ? "light" : "dark");
    assert.deepEqual(applied, [preference]);
    assert.deepEqual(shown, [preference]);
  });
}

test("a newer system event wins over an in-flight native theme read", async () => {
  const { controller, nativeWindow, emit, shown } = setup();
  let finish = (_theme: ResolvedTheme | null) => {};
  nativeWindow.theme = () => new Promise((resolve) => { finish = resolve; });
  const ready = controller.apply("system");
  await new Promise((resolve) => setTimeout(resolve, 0));
  emit("dark");
  finish("light");
  await ready;
  assert.deepEqual(shown, ["dark"]);
});

test("a pending system read cannot override a newer explicit choice", async () => {
  const { controller, nativeWindow, applied, shown } = setup();
  let finish = (_theme: ResolvedTheme | null) => {};
  nativeWindow.theme = () => new Promise((resolve) => { finish = resolve; });
  const systemReady = controller.apply("system");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const lightReady = controller.apply("light");
  finish("dark");
  await Promise.all([systemReady, lightReady]);
  assert.deepEqual(shown, ["light"]);
  assert.deepEqual(applied, [null, "light"]);
});

test("rapid choices leave the native window on the latest theme", async () => {
  const { controller, applied, shown } = setup();
  await Promise.all([controller.apply("dark"), controller.apply("light"), controller.apply("system")]);
  assert.deepEqual(applied, [null]);
  assert.equal(shown.at(-1), "light");
});

test("an in-flight native write finishes before the newest choice is applied", async () => {
  const { controller, nativeWindow, applied, shown } = setup();
  let finish = () => {};
  nativeWindow.setTheme = (theme) => {
    applied.push(theme ?? null);
    return new Promise<void>((resolve) => { finish = resolve; });
  };
  const darkReady = controller.apply("dark");
  await new Promise((resolve) => setTimeout(resolve, 0));
  nativeWindow.setTheme = async (theme) => { applied.push(theme ?? null); };
  const lightReady = controller.apply("light");
  finish();
  await Promise.all([darkReady, lightReady]);
  assert.deepEqual(applied, ["dark", "light"]);
  assert.equal(shown.at(-1), "light");
});

test("an unavailable native theme uses the media fallback", async () => {
  const { controller, nativeWindow, shown } = setup("light");
  nativeWindow.theme = async () => null;
  await controller.apply("system");
  assert.deepEqual(shown, ["light"]);
});

test("a failed native update does not prevent rendering or later theme changes", async () => {
  const { controller, nativeWindow, shown } = setup("light");
  nativeWindow.setTheme = async () => { throw new Error("native window unavailable"); };
  await controller.apply("system");
  assert.deepEqual(shown, ["light"]);
  await controller.apply("dark");
  assert.equal(shown.at(-1), "dark");
});

test("disposing releases the native listener and ignores further events", async () => {
  const { controller, emit, shown, stopped } = setup();
  await controller.apply("system");
  await controller.dispose();
  emit("dark");
  assert.equal(stopped(), true);
  assert.deepEqual(shown, ["light"]);
});
