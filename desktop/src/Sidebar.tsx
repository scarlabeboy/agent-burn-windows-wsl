import { formatUsd } from "./aggregate";
import { EnvIcon } from "./EnvIcons";
import { percent, t } from "./i18n";
import { freshness, isMonthly, type QuotaCard } from "./quota";
import type { AgentReport, Distro, TabId } from "./types";
import { BrandIcon, OverviewIcon, agentLabel } from "./views";

export const OVERVIEW = "overview";

function pillClass(remaining: number): string {
  if (remaining < 20) return "pill bad";
  if (remaining < 50) return "pill mid";
  return "pill ok";
}

/** The side bar: environments, the overview, subscriptions with their quotas, other harnesses. */
export function Sidebar({
  tabs,
  tab,
  openTab,
  distros,
  activeDistro,
  onDistro,
  page,
  showSettings,
  openPage,
  overviewCost,
  subscriptionIds,
  weeklyCard,
  costOf,
  nowMs,
  otherAgents,
}: {
  tabs: { id: TabId; label: string }[];
  tab: TabId;
  openTab: (id: TabId) => void;
  distros: Distro[];
  activeDistro: Distro | undefined;
  onDistro: (name: string) => void;
  page: string;
  showSettings: boolean;
  openPage: (id: string) => void;
  overviewCost: number | undefined;
  subscriptionIds: string[];
  weeklyCard: (id: string) => QuotaCard | undefined;
  /** The spend shown beside a subscription, over the period or since its reset day. */
  costOf: (id: string) => number | undefined;
  nowMs: number;
  otherAgents: AgentReport[];
}) {
  const text = t();
  return (
    <aside className="sidebar">
      <div className="brand-row">
        <span className="flame">🔥</span>
        <strong>Agent Burn Windows</strong>
      </div>

      <nav className="sidebar-nav">

        {tabs.length > 0 && (
          <>
            <div className="nav-group">{text.app.environment}</div>
            {/* The computer on its own line, then its two parts, Windows and WSL, side by side. */}
            {[tabs.slice(0, 1), tabs.slice(1)].map((row, index) => (
              <div key={index} className={index === 0 ? "nav-row" : "nav-row nav-pair"}>
                {row.map((entry) => (
                  <button
                    key={entry.id}
                    className={`nav env${tab === entry.id ? " on" : ""}`}
                    onClick={() => openTab(entry.id)}
                  >
                    <span className="nav-icon">
                      <EnvIcon env={entry.id} />
                    </span>
                    <span className="nav-label">{entry.label}</span>
                  </button>
                ))}
              </div>
            ))}
            {tab === "wsl" && distros.length > 1 && (
              <select
                className="nav-select"
                value={activeDistro?.name}
                title={activeDistro?.name}
                onChange={(event) => onDistro(event.target.value)}
                aria-label={text.app.wslDistro}
              >
                {distros.map((entry) => (
                  <option key={entry.name}>{entry.name}</option>
                ))}
              </select>
            )}
          </>
        )}

        <div className="nav-group">{text.app.view}</div>
        <button className={`nav${page === OVERVIEW && !showSettings ? " on" : ""}`} onClick={() => openPage(OVERVIEW)}>
          <OverviewIcon />
          <span className="nav-label">{text.app.overview}</span>
          <span className="nav-value">{overviewCost !== undefined ? formatUsd(overviewCost) : ""}</span>
        </button>

        {subscriptionIds.length > 0 && <div className="nav-group">{text.app.subscriptions}</div>}
        {subscriptionIds.map((id) => {
          const quota = weeklyCard(id);
          const stale = quota !== undefined && !freshness(quota.observedAt, nowMs).fresh;
          const cost = costOf(id);
          // The spend line matches every harness; the weekly quota goes below it, only while read.
          return (
            <button
              key={id}
              className={`nav sub${page === id && !showSettings ? " on" : ""}`}
              onClick={() => openPage(id)}
            >
              <span className="nav-line">
                <BrandIcon agent={id} />
                <span className="nav-label">{agentLabel(id)}</span>
                <span className="nav-value">{cost !== undefined ? formatUsd(cost) : ""}</span>
              </span>
              {quota && (
                <span className={`nav-line nav-quota${quota.session ? " both" : ""}`}>
                  {/* Grey when the reading is not live. */}
                  {quota.session && (
                    <span className={`${pillClass(quota.session.remaining)}${stale ? " stale" : ""}`}>
                      {percent(quota.session.remaining.toFixed(0))}
                    </span>
                  )}
                  <span className="nav-label">
                    {quota.session
                      ? text.app.bothQuotas
                      : isMonthly(quota.weekly.window.windowMinutes)
                        ? text.app.monthlyQuota
                        : text.app.weeklyQuota}
                  </span>
                  <span className={`${pillClass(quota.weekly.remaining)}${stale ? " stale" : ""}`}>
                    {percent(quota.weekly.remaining.toFixed(0))}
                  </span>
                </span>
              )}
            </button>
          );
        })}

        {otherAgents.length > 0 && <div className="nav-group">{text.app.harness}</div>}
        {otherAgents.map((agent) => (
          <button
            key={agent.agent}
            className={`nav${page === agent.agent && !showSettings ? " on" : ""}`}
            onClick={() => openPage(agent.agent)}
          >
            <BrandIcon agent={agent.agent} />
            <span className="nav-label">{agentLabel(agent.agent)}</span>
            <span className="nav-value">{formatUsd(agent.totalCost)}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
