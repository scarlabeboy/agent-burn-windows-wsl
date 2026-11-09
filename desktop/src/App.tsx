import { useEffect, useMemo, useState } from "react";
import { readPeriod, readSeen, readTab, writePeriod, writeSeen, writeSettings, writeTab } from "./api";
import { EmptyPeriod, LimitUsageSection, Pending, QuotaMissing, ReadingLimitSection, noUsage } from "./AppNotices";
import { totalBreakdown } from "./aggregate";
import { archivedDays } from "./archive";
import { hasUsage } from "./dailyArchive";
import { EmptyState } from "./EmptyState";
import { errorText } from "./errors";
import { SUBSCRIPTIONS, SUPPORTED_HARNESSES, disabledHarnesses, groupHarnesses, scanAgents } from "./harnesses";
import { setLang, systemLang, t } from "./i18n";
import { planProfile, withPlanProfile } from "./plans";
import { PERIODS, defaultGranularity, periodLabel, type Period } from "./periods";
import { isMonthly, quotaCards, quotaFailure, type QuotaCard } from "./quota";
import { SettingsPage } from "./SettingsPage";
import {
  limitUsageOffReason,
  quotaOffReason,
  quotasActive,
  readingLimitOffReason,
  subscriptionOffReason,
} from "./settingsHints";
import { OVERVIEW, Sidebar } from "./Sidebar";
import { loadedAtOf, reportOf } from "./sourceState";
import { StatusBar, useAppVersion } from "./StatusBar";
import { pickClaudeAccount, pickSubscription, withAccountSpend } from "./subscription";
import { Tooltip } from "./Tooltip";
import { QUOTA_HARNESSES, type ModelPricing, type QuotaReading, type Settings, type SourceId, type TabId, type UsageReport } from "./types";
import { UpdateDialog } from "./UpdateDialog";
import { useUpdater } from "./updater";
import { useCodexBackfill, useCodexLimitUsage } from "./useCodexHistory";
import { useDesktopPreferences } from "./useDesktopPreferences";
import { useNow } from "./useNow";
import { usePeriodReports } from "./usePeriodReports";
import { useQuotaReadings } from "./useQuotaReadings";
import { useSourceDiscovery } from "./useSourceDiscovery";
import { useTrayIntegration } from "./useTrayIntegration";
import { useUsageReports } from "./useUsageReports";
import {
  BrandIcon,
  EnvironmentSplit,
  HarnessList,
  Models,
  OverviewIcon,
  Page,
  QuotaIcon,
  QuotaSection,
  SpendChart,
  SubscriptionCard,
  Stats,
  TokenBreakdownCard,
  agentLabel,
  asReport,
} from "./views";

export default function App({ initialSettings, onThemeChange }: {
  initialSettings: Settings;
  onThemeChange: (theme: Settings["theme"]) => void;
}) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  // Set before anything renders: every text and format below reads it.
  const lang = settings.language ?? systemLang();
  setLang(lang);
  const text = t();
  // WSL distributions, detected (and kept running) as the settings ask.
  const detected = useSourceDiscovery(settings.wslRead, settings.wslMode);
  const [pricing, setPricing] = useState<Record<string, ModelPricing>>({});
  const [storedTab, setStoredTab] = useState<TabId | null>(readTab);
  const [distro, setDistro] = useState<string | null>(null);
  const [page, setPage] = useState<string>(OVERVIEW);
  const [showSettings, setShowSettings] = useState(false);
  const [period, setPeriodState] = useState<Period>(readPeriod);
  const setPeriod = (next: Period) => {
    setPeriodState(next);
    writePeriod(next);
  };

  const distros = useMemo(
    () => (settings.wslRead ? (detected?.distros ?? []) : []),
    [settings.wslRead, detected],
  );
  const sourceIds = useMemo<SourceId[]>(
    () => ["windows", ...distros.map((entry) => `wsl:${entry.name}` as SourceId)],
    [distros],
  );
  // Sources that can be read now: a stopped WSL distribution keeps its last report instead.
  const readableIds = useMemo<SourceId[]>(
    () => ["windows", ...distros.filter((entry) => entry.running).map((entry) => `wsl:${entry.name}` as SourceId)],
    [distros],
  );
  const readableKey = readableIds.join(",");

  // Harnesses turned off are not scanned. `seen` remembers every harness that ever had data,
  // so a disabled one stays listed even though a scan no longer reports it.
  const [seen, setSeen] = useState<string[]>(readSeen);
  const disabled = useMemo(() => disabledHarnesses(settings.harnessStates), [settings.harnessStates]);
  const disabledKey = disabled.join(",");
  const scanKey = scanAgents(disabled, seen)?.join(",") ?? "";
  const agentsToScan = useMemo(() => (scanKey ? scanKey.split(",") : undefined), [scanKey]);
  const activeDistro = distros.find((entry) => entry.name === distro) ?? distros[0];
  const hasWsl = distros.length > 0;
  // Windows alone when WSL is off or absent; otherwise the last tab, Computer on first run.
  const tab: TabId = hasWsl ? (storedTab ?? "computer") : "windows";
  const setTab = (next: TabId) => {
    setStoredTab(next);
    writeTab(next);
  };

  // Archive first, then full scans of every readable source.
  const { states, archiveReady, refresh, refreshRef, nextScan } = useUsageReports({
    settings,
    readableIds,
    agentsToScan,
    detected,
    setPricing,
  });
  useCodexBackfill({ archiveReady, readableIds, disabled, disabledKey, detected });

  // Quotas off, or offline: no read at all; the readings already shown stay with their time.
  const quotasOn = quotasActive(settings);
  const { quotas, quotaErrors, refreshQuotas } = useQuotaReadings({
    readableIds,
    disabled,
    disabledKey,
    quotasOn,
    archiveReady,
    detected,
    refreshRef,
  });

  // Background behaviour: the Windows startup entry and closing to the notification area.
  const { autostart, autostartBusy, toggleAutostart } = useDesktopPreferences(settings);

  const updater = useUpdater(settings.autoUpdate, settings.offline);
  const [showUpdate, setShowUpdate] = useState(false);
  // The dialog closes for good when no version is offered any more: it must not come back by
  // itself with the next one found.
  const offered = updater.state.status === "available" || updater.state.status === "installing";
  useEffect(() => {
    if (!offered) setShowUpdate(false);
  }, [offered]);
  const appVersion = useAppVersion();
  const updateSettings = (next: Settings) => {
    if (next.theme !== settings.theme) onThemeChange(next.theme);
    setSettings(next);
    writeSettings(next);
  };

  const label = (id: string) => (id === "windows" ? "Windows" : `WSL · ${id.slice(4)}`);
  const activeIds: string[] =
    tab === "windows" ? ["windows"] : tab === "wsl" ? (activeDistro ? [`wsl:${activeDistro.name}`] : []) : sourceIds;
  const activeKey = activeIds.join(",");
  // Every source of this tab answered and none has a harness or an archived day: a first launch,
  // or a machine where no supported agent was used yet. A stopped distribution never read yet has
  // nothing to add, so it does not hold the message back (a stopped one with a saved report does).
  const answeringIds = activeIds.filter((id) => readableIds.includes(id as SourceId) || states[id]);
  const hasNoData =
    answeringIds.length > 0 &&
    answeringIds.every((id) => {
      const state = states[id];
      return state?.status === "ready" && !hasUsage(state.report, archivedDays(id), disabled);
    });
  const stoppedNames = distros
    .filter((entry) => !entry.running && activeIds.includes(`wsl:${entry.name}`))
    .map((entry) => entry.name);
  // A stopped distribution with a saved report shows old figures; one never read shows none.
  const staleNames = stoppedNames.filter((name) => reportOf(states[`wsl:${name}`]));
  const unreadNames = stoppedNames.filter((name) => !reportOf(states[`wsl:${name}`]));
  const pendingState = states[activeIds[0] ?? "windows"];
  // A failed read keeps the previous figures on screen; the status bar says it failed.
  const failedId = readableIds.find((id) => states[id]?.status === "error");
  const failedState = failedId ? states[failedId] : undefined;
  const scanError =
    failedId && failedState?.status === "error"
      ? text.app.scanError(label(failedId), errorText(failedState.message))
      : undefined;
  const lastScan = Math.max(
    0,
    ...sourceIds.map((id) => {
      const state = states[id];
      return state?.status === "ready" ? state.loadedAt : 0;
    }),
  );

  // A quota is read in one environment: a tab shows only its own readings, and a source that
  // cannot be read now (WSL stopped) shows none rather than an old value. When several sources
  // are shown together (Computer), only the freshest reading of each harness is kept.
  // A plan known to have no 5-hour session (Claude Ultra) shows none, from any source's scan.
  const noSessionKey = QUOTA_HARNESSES.filter((harness) => {
    const reports = sourceIds
      .map((id) => reportOf(states[id]))
      .filter((entry): entry is UsageReport => entry !== undefined);
    const sub = pickSubscription(reports, harness);
    return sub ? (planProfile(harness, sub.plan, sub.pricePerMonth)?.noSession ?? false) : false;
  }).join(",");
  const quotaCardsFor = (ids: string[]): QuotaCard[] => {
    const freshest = new Map<string, { source: string; reading: QuotaReading }>();
    for (const id of ids.filter((entry) => readableIds.includes(entry as SourceId))) {
      for (const reading of Object.values(quotas[id] ?? {})) {
        if (disabled.includes(reading.agent)) continue;
        const best = freshest.get(reading.agent);
        if (!best || reading.observedAt > best.reading.observedAt) {
          freshest.set(reading.agent, { source: label(id), reading });
        }
      }
    }
    return quotaCards([...freshest.values()], noSessionKey ? noSessionKey.split(",") : []);
  };
  // Quotas that are no longer read are not shown anywhere: a stale reading looks live. Their
  // history stays in the archive and comes back with the next reading.
  const cards: QuotaCard[] = useMemo(
    () => (quotasOn ? quotaCardsFor(activeIds) : []),
    [quotas, activeKey, readableKey, disabledKey, quotasOn, noSessionKey],
  );
  const accountCards: QuotaCard[] = useMemo(
    () => (quotasOn ? quotaCardsFor(sourceIds) : []),
    [quotas, sourceIds, readableKey, disabledKey, quotasOn, noSessionKey],
  );
  const pageCards = cards.filter((card) => card.harness === page);

  // Ages of the quota readings shown in the tooltip and the sidebar, kept current.
  const nowMs = useNow(15_000);
  useTrayIntegration({
    accountCards,
    nowMs,
    trayIcon: settings.trayIcon,
    trayWindow: settings.trayWindow,
    quotasOn,
    lang,
    refresh,
    refreshQuotas,
  });
  // Screen readers and the WebView's own texts take the page language from `<html lang>`.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const { effectivePeriod, range, localParts, localReport, navReport, resetRtd, resetSpend, report, detailError } =
    usePeriodReports({
      period,
      page,
      pageCards,
      cards,
      activeIds,
      activeKey,
      readableKey,
      states,
      disabled,
      disabledKey,
      label,
      archiveReady,
      detected,
      lastScan,
      offline: settings.offline,
      agentsToScan,
      setPricing,
    });

  const { limitBest, limitAttempted } = useCodexLimitUsage({
    page,
    quotasOn,
    archiveReady,
    disabled,
    disabledKey,
    activeIds,
    activeKey,
    readableIds,
    readableKey,
    lastScan,
  });

  // Plan, price and account meters come from the sources of the open tab.
  const sourceReports = useMemo(
    () =>
      activeIds
        .map((id) => reportOf(states[id]))
        .filter((entry): entry is UsageReport => entry !== undefined),
    [activeKey, states],
  );

  // The quota belongs to the account, so its value counts the spend of every source, whichever
  // tab is open: a stopped WSL distribution counts through its last report.
  const accountReadings = useMemo(
    () =>
      sourceIds.flatMap((id) => {
        const report = reportOf(states[id]);
        return report ? [{ report, at: loadedAtOf(states[id]) }] : [];
      }),
    [sourceIds, states],
  );

  // Only offered with WSL: with Windows alone there is nothing to choose.
  const tabs: { id: TabId; label: string }[] = hasWsl
    ? [
        { id: "computer", label: text.app.computer },
        { id: "windows", label: "Windows" },
        { id: "wsl", label: "WSL" },
      ]
    : [];

  const loading = sourceIds.some((id) => states[id]?.status === "loading");

  // Ctrl+R or F5 does what ⟳ does, Ctrl+Shift+R reads the quotas only. The page itself is never
  // reloaded, which would drop what is on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const reload = event.key === "F5" || (event.ctrlKey && event.key.toLowerCase() === "r");
      if (!reload) return;
      event.preventDefault();
      if (event.repeat) return;
      if (event.ctrlKey && event.shiftKey) {
        if (quotasOn) refreshQuotas(true);
      } else if (!loading) {
        refresh();
        if (quotasOn) refreshQuotas(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refreshQuotas, refresh, quotasOn, loading]);

  // The sidebar always uses the locally filtered report, which lists every harness.
  // A report scanned before a harness was turned off (or from a stopped WSL) may still list it.
  const visibleAgents = navReport?.agents.filter((agent) => !disabled.includes(agent.agent)) ?? [];
  const agentIds = visibleAgents.map((agent) => agent.agent);

  // Remember each harness that shows data, and leave the page of one that was just turned off.
  const detectedNow = useMemo(
    () => [
      ...new Set(
        sourceIds.flatMap((id) => reportOf(states[id])?.agents.map((agent) => agent.agent) ?? []),
      ),
    ],
    [states, sourceIds],
  );
  useEffect(() => {
    const fresh = detectedNow.filter((id) => !seen.includes(id) && !disabled.includes(id));
    if (fresh.length === 0) return;
    const next = [...seen, ...fresh].sort();
    setSeen(next);
    writeSeen(next);
  }, [detectedNow, seen, disabledKey]);
  useEffect(() => {
    if (disabled.includes(page)) setPage(OVERVIEW);
  }, [page, disabledKey]);
  const harnessGroups = groupHarnesses(detectedNow, seen, disabled);
  const toggleHarness = (id: string, off: boolean) => {
    const { [id]: _removed, ...rest } = settings.harnessStates;
    updateSettings({ ...settings, harnessStates: off ? { ...rest, [id]: "off" } : rest });
  };
  const subscriptionIds = SUBSCRIPTIONS.filter(
    (id) => agentIds.includes(id) || cards.some((card) => card.harness === id),
  );
  const otherAgents = visibleAgents.filter((agent) => !SUBSCRIPTIONS.includes(agent.agent));
  const weeklyCard = (id: string) => cards.find((card) => card.harness === id);
  const selected =
    page === OVERVIEW
      ? null
      : (report?.agents.find((agent) => agent.agent === page) ??
        // A period without usage for this harness: show its exact zero totals.
        (range ? localReport?.agents.find((agent) => agent.agent === page) : undefined));
  const approx = report?.approxDetail ?? false;

  // The settings take the place of the page; choosing a page or an environment leaves them.
  const openPage = (id: string) => {
    setPage(id);
    setShowSettings(false);
  };
  const openTab = (id: TabId) => {
    setTab(id);
    setShowSettings(false);
  };

  const header = showSettings ? (
    <div className="page-head">
      <h1 className="page-title">{text.app.settings}</h1>
      <p className="muted page-sub">{text.app.settingsSub}</p>
    </div>
  ) : (
    <div className="page-head">
      <h1 className="page-title">
        {page === OVERVIEW ? (
          <>
            <OverviewIcon size={22} /> {text.app.overview}
          </>
        ) : (
          <>
            <BrandIcon agent={page} size={22} /> {agentLabel(page)}
          </>
        )}
      </h1>
      <p className="muted page-sub">
        {tab === "computer"
          ? text.app.subComputer
          : tab === "wsl"
            ? `WSL · ${activeDistro?.name ?? ""}`
            : text.app.subWindows}{" "}
        · {periodLabel(effectivePeriod)}
        {period === "rtd" && effectivePeriod === "all" && text.app.rtdNote}
      </p>
    </div>
  );

  return (
    <div className="app">
      <Sidebar
        tabs={tabs}
        tab={tab}
        openTab={openTab}
        distros={distros}
        activeDistro={activeDistro}
        onDistro={setDistro}
        page={page}
        showSettings={showSettings}
        openPage={openPage}
        overviewCost={navReport?.totals.totalCost}
        subscriptionIds={subscriptionIds}
        weeklyCard={weeklyCard}
        costOf={(id) =>
          resetRtd ? resetSpend.get(id) : localReport?.agents.find((entry) => entry.agent === id)?.totalCost
        }
        nowMs={nowMs}
        otherAgents={otherAgents}
      />

      <div className="content">
        <header className="topbar">
          {header}
          <div className="spacer" />
          {!showSettings && (
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
              aria-label={text.app.periodShown}
            >
              {PERIODS.map((value) => (
                <option key={value} value={value}>
                  {periodLabel(value)}
                </option>
              ))}
            </select>
          )}
          <Tooltip text={text.app.refresh}>
            <button
              className="icon"
              onClick={() => {
                refresh();
                if (quotasOn) refreshQuotas(true);
              }}
              disabled={loading}
              aria-label={text.app.refresh}
            >
              {loading ? "…" : "⟳"}
            </button>
          </Tooltip>
          <Tooltip text={showSettings ? text.app.closeSettings : text.app.settings}>
            <button
              className={`icon${showSettings ? " on" : ""}`}
              onClick={() => setShowSettings((value) => !value)}
              aria-label={showSettings ? text.app.closeSettings : text.app.settings}
            >
              ⚙
            </button>
          </Tooltip>
        </header>

        <main>
          {showSettings ? (
            <SettingsPage
              settings={settings}
              lang={lang}
              updateSettings={updateSettings}
              quotasOn={quotasOn}
              autostart={autostart}
              autostartBusy={autostartBusy}
              toggleAutostart={toggleAutostart}
              hasDistros={distros.length > 0}
              harnessGroups={harnessGroups}
              toggleHarness={toggleHarness}
              updater={updater}
              appVersion={appVersion}
              openUpdate={() => setShowUpdate(true)}
            />
          ) : !report ? (
            stoppedNames.length > 0 && !pendingState ? (
              <div className="notice">{text.app.wslOffNoData(stoppedNames.join(", "))}</div>
            ) : (
              <Pending
                state={pendingState}
                label={tab === "computer" ? text.app.theComputer : label(activeIds[0] ?? "windows")}
              />
            )
          ) : (
            <Page>
              {staleNames.length > 0 && <div className="notice">{text.app.wslOffStale(staleNames.join(", "))}</div>}
              {unreadNames.length > 0 && <div className="notice">{text.app.wslOffNoData(unreadNames.join(", "))}</div>}
              {tab === "computer" && localParts.length < sourceIds.length - stoppedNames.length && (
                <div className="notice error">{text.app.partial}</div>
              )}
              {page === OVERVIEW && hasNoData ? (
                <EmptyState
                  where={text.app.emptyWhere[tab]}
                  harnesses={SUPPORTED_HARNESSES.map(agentLabel)}
                  disabledCount={disabled.length}
                />
              ) : page === OVERVIEW && range && noUsage(report.totals.totalTokens, report.totals.totalCost) ? (
                <EmptyPeriod period={periodLabel(effectivePeriod)} />
              ) : page === OVERVIEW ? (
                <>
                  <Stats report={report} label={text.app.allHarnesses} period={periodLabel(effectivePeriod)} />
                  {tab === "computer" && <EnvironmentSplit parts={localParts} />}
                  <div className="grid">
                    <SpendChart
                      key={effectivePeriod}
                      report={report}
                      defaultGranularity={defaultGranularity(effectivePeriod)}
                    />
                    <HarnessList report={report} onSelect={setPage} />
                  </div>
                  <TokenBreakdownCard breakdown={totalBreakdown(report)} pending={approx} detailError={detailError} />
                  <Models report={report} pricing={pricing} detailError={detailError} />
                </>
              ) : (
                <>
                  {(page === "claude" || page === "codex") &&
                    pageCards.length === 0 &&
                    (quotaOffReason(settings) ? (
                      <section className="card">
                        <header className="card-head">
                          <h2>
                            <QuotaIcon harness={page} />
                            {text.app.quotaTitle(agentLabel(page))}
                          </h2>
                        </header>
                        <p className="muted small">{quotaOffReason(settings)}</p>
                      </section>
                    ) : (
                      <QuotaMissing
                        harness={page}
                        tab={tab}
                        wslRunning={activeDistro?.running ?? false}
                        cause={quotaFailure(
                          activeIds
                            .filter((id) => readableIds.includes(id as SourceId))
                            .map((id) => quotaErrors[`${id}|${page}`]),
                        )}
                      />
                    ))}
                  {pageCards.map((card) => (
                    <QuotaSection
                      key={card.harness}
                      card={card}
                      resetCredits={pickSubscription(sourceReports, card.harness)?.resetCreditsAvailable ?? undefined}
                      scoped={card.harness === "claude" ? pickClaudeAccount(sourceReports)?.scoped : undefined}
                    />
                  ))}
                  {(page === "claude" || page === "codex") && (
                    <SubscriptionCard
                      harness={page}
                      sub={withPlanProfile(withAccountSpend(pickSubscription(sourceReports, page), accountReadings))}
                      account={pickClaudeAccount(sourceReports)}
                      card={pageCards[0]}
                      offReason={subscriptionOffReason(settings)}
                    />
                  )}
                  {/* On Codex Free the dashboard's daily figures are not shares of the monthly quota
                      (0.16 % for a day that used 7 % of it): the chart would mislead, so it goes.
                      With no readable source in the tab (WSL off), nothing would ever be read. */}
                  {page === "codex" &&
                    !pageCards.some((card) => isMonthly(card.weekly.window.windowMinutes)) &&
                    (limitUsageOffReason(settings) || activeIds.some((id) => readableIds.includes(id as SourceId))) && (
                    <LimitUsageSection
                      offReason={limitUsageOffReason(settings)}
                      best={limitBest}
                      attempted={limitAttempted}
                      label={label}
                    />
                  )}
                  {page === "claude" && <ReadingLimitSection offReason={readingLimitOffReason(settings)} />}
                  {range && (!selected || noUsage(selected.totalTokens, selected.totalCost)) ? (
                    <EmptyPeriod period={periodLabel(effectivePeriod)} harness={agentLabel(page)} />
                  ) : selected ? (
                    <>
                      <Stats
                        report={asReport(selected, approx)}
                        label={agentLabel(selected.agent)}
                        period={periodLabel(effectivePeriod)}
                      />
                      <SpendChart
                        key={effectivePeriod}
                        report={asReport(selected, approx)}
                        defaultGranularity={defaultGranularity(effectivePeriod)}
                      />
                      <TokenBreakdownCard
                        breakdown={selected.tokenBreakdown}
                        pending={approx}
                        detailError={detailError}
                      />
                      <Models report={asReport(selected, approx)} pricing={pricing} detailError={detailError} />
                    </>
                  ) : (
                    <div className="notice">{text.app.noUsageData(agentLabel(page))}</div>
                  )}
                </>
              )}
            </Page>
          )}
        </main>
        <StatusBar
          loading={loading}
          lastScan={lastScan}
          nextScan={nextScan}
          autoRefresh={settings.refreshMinutes > 0}
          error={scanError}
          errorDetail={failedState?.status === "error" ? failedState.message : undefined}
          offline={settings.offline}
          update={updater.state}
          onOpenUpdate={() => setShowUpdate(true)}
        />
      </div>
      {showUpdate && (
        <UpdateDialog
          state={updater.state}
          offline={settings.offline}
          onInstall={() => {
            // Installing downloads the release: never in offline mode.
            if (!settings.offline) void updater.install();
          }}
          onClose={() => setShowUpdate(false)}
        />
      )}
    </div>
  );
}
