import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { quitApp, setTrayIcon, setTrayLabels, setTrayTooltip } from "./api";
import { flush } from "./archive";
import { t, type Lang } from "./i18n";
import { formatAge, freshness, isMonthly, trayPercent, trayTone, type QuotaCard } from "./quota";
import { TRAY_ICON_SIZE, drawTrayIcon, type TrayIconTone } from "./trayIcon";
import type { Settings } from "./types";
import { agentLabel } from "./views";

/**
 * The notification-area icon: its tooltip, its figure, its menu words, and the menu's actions
 * (refresh, and a last save of the archive before quitting).
 */
export function useTrayIntegration({
  accountCards,
  nowMs,
  trayIcon,
  trayWindow,
  quotasOn,
  lang,
  refresh,
  refreshQuotas,
  multiHarnesses,
}: {
  accountCards: QuotaCard[];
  nowMs: number;
  trayIcon: Settings["trayIcon"];
  trayWindow: Settings["trayWindow"];
  quotasOn: boolean;
  lang: Lang;
  refresh: () => void;
  refreshQuotas: (force: boolean) => void;
  /** Harnesses with accounts declared by hand: their line says which environment it was read in. */
  multiHarnesses: string[];
}) {
  // Tray menu actions, and a last save of the archive before the app quits (tray "Quit", or
  // closing the window when it does not stay in the notification area): the process ends once
  // saved. "Refresh quotas" reads the quotas; with quotas off it reads the usage instead.
  useEffect(() => {
    const unlisten = [
      listen("tray-refresh", () => (quotasOn ? refreshQuotas(true) : refresh())),
      listen("quit-requested", () => void flush().finally(() => void quitApp())),
    ];
    return () => {
      unlisten.forEach((pending) => void pending.then((stop) => stop()));
    };
  }, [refreshQuotas, refresh, quotasOn]);

  const text = t();
  // Quota summary on the notification-area icon: the account, whatever tab is open. A reading
  // that is not live says how old it is, as the quota cards do.
  const tooltip = accountCards
    .map((card) => {
      const line = text.app.tooltipLine(
        agentLabel(card.harness),
        card.session?.remaining.toFixed(0),
        card.weekly.remaining.toFixed(0),
        isMonthly(card.weekly.window.windowMinutes),
      );
      const withSource = multiHarnesses.includes(card.harness) ? `${line} · ${card.sources.join(" · ")}` : line;
      return freshness(card.observedAt, nowMs).fresh
        ? withSource
        : `${withSource} · ${text.app.tooltipAge(formatAge(nowMs - card.observedAt))}`;
    })
    .join("\n");
  useEffect(() => {
    // Without any quota the summary goes too, rather than keep percentages that no longer hold.
    void setTrayTooltip(tooltip ? `Agent Burn Windows\n${tooltip}` : "Agent Burn Windows").catch(() => undefined);
  }, [tooltip]);
  // The remaining quota on the notification-area icon, when one is chosen: the logo otherwise,
  // when nothing is read and when all of it is left. An old reading turns the figure grey.
  const trayCards = trayIcon === "logo" ? [] : accountCards.filter((card) => card.harness === trayIcon);
  const trayValue = trayPercent(trayCards, trayWindow, nowMs);
  const trayFresh =
    trayCards.length > 0 && freshness(Math.max(...trayCards.map((card) => card.observedAt)), nowMs).fresh;
  const trayKey = trayValue === null ? "logo" : `${trayValue}|${trayFresh ? trayTone(trayValue) : "stale"}`;
  useEffect(() => {
    const [value, tone] = trayKey.split("|");
    const rgba = trayKey === "logo" ? null : drawTrayIcon(Number(value), tone as TrayIconTone);
    void setTrayIcon(rgba, TRAY_ICON_SIZE).catch(() => undefined);
  }, [trayKey]);
  // The notification-area menu is built by the Rust side: it gets its words from here. Its
  // refresh entry reads the usage instead when quotas are not read, and says so.
  useEffect(() => {
    const { open, refresh, refreshUsage, quit } = t().tray;
    void setTrayLabels({ open, refresh: quotasOn ? refresh : refreshUsage, quit }).catch(() => undefined);
  }, [lang, quotasOn]);
}
