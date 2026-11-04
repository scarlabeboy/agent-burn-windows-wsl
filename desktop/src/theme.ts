import type { Window } from "@tauri-apps/api/window";
import type { Settings } from "./types";

export type ResolvedTheme = "dark" | "light";

export const resolveTheme = (preference: Settings["theme"], system: ResolvedTheme): ResolvedTheme =>
  preference === "system" ? system : preference;

/** One controller for the page lifetime, independent of React's StrictMode effect replay. */
export function createThemeController(
  nativeWindow: Pick<Window, "setTheme" | "theme" | "onThemeChanged">,
  show: (theme: ResolvedTheme) => void,
  fallback: () => ResolvedTheme,
) {
  let preference: Settings["theme"] = "system";
  let followingSystem = false;
  let revision = 0;
  let eventRevision = 0;
  let pending = Promise.resolve();
  const listening = nativeWindow.onThemeChanged(({ payload }) => {
    eventRevision++;
    if (followingSystem) show(payload);
  }).catch(() => () => {});

  return {
    apply(next: Settings["theme"]): Promise<void> {
      preference = next;
      followingSystem = false;
      const request = ++revision;
      if (next !== "system") show(next);

      // Serialize native writes: a slower old choice must not win over the latest one.
      pending = pending.then(async () => {
        if (request !== revision) return;
        await listening;
        if (request !== revision) return;
        await nativeWindow.setTheme(next === "system" ? null : next);
        if (request !== revision || preference !== "system") return;

        // Only read the effective theme after clearing the native override. matchMedia
        // may still reflect that override, so native events own live system tracking.
        followingSystem = true;
        const beforeRead = eventRevision;
        const system = await nativeWindow.theme().catch(() => null);
        if (request === revision && beforeRead === eventRevision) {
          show(resolveTheme(next, system ?? fallback()));
        }
      }).catch(() => {
        // Keep the UI usable if the native bridge is unavailable.
        if (request === revision && preference === "system") show(fallback());
      });
      return pending;
    },
    async dispose(): Promise<void> {
      revision++;
      followingSystem = false;
      (await listening)();
    },
  };
}
