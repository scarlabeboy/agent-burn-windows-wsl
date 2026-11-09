import { openUrl } from "@tauri-apps/plugin-opener";
import { EnvIcon } from "./EnvIcons";
import { HarnessSettings } from "./HarnessSettings";
import type { groupHarnesses } from "./harnesses";
import { LANG_NAMES, t, type Lang } from "./i18n";
import { MultiAccountSettings } from "./MultiAccountSettings";
import { SettingRow, SettingsCard, Switch } from "./SettingsUi";
import { autoUpdateActive, autoUpdateHint, offlineHint, quotaHint, refreshHint } from "./settingsHints";
import { Glyph } from "./TitleIcons";
import { QUOTA_HARNESSES, type QuotaHarness, type Settings, type TrayWindow, type WslMode } from "./types";
import { checkHint, foundHint } from "./updateHints";
import { REPO_URL, type useUpdater } from "./updater";
import { agentLabel } from "./views";

const MELVYNX_URL = "https://github.com/Melvynx/agent-burn";
const DAVID_URL = "https://github.com/DavidSZD/agent-burn";

/** The settings page, in place of the open page. Every change goes through `updateSettings`. */
export function SettingsPage({
  settings,
  lang,
  updateSettings,
  quotasOn,
  autostart,
  autostartBusy,
  toggleAutostart,
  hasDistros,
  harnessGroups,
  toggleHarness,
  updater,
  appVersion,
  openUpdate,
  detectedPlans,
}: {
  settings: Settings;
  lang: Lang;
  updateSettings: (next: Settings) => void;
  quotasOn: boolean;
  autostart: boolean | null;
  autostartBusy: boolean;
  toggleAutostart: (enabled: boolean) => void;
  /** WSL has distributions to read: its card stays while reading is off or kept running. */
  hasDistros: boolean;
  harnessGroups: ReturnType<typeof groupHarnesses>;
  toggleHarness: (id: string, off: boolean) => void;
  updater: ReturnType<typeof useUpdater>;
  appVersion: string;
  openUpdate: () => void;
  /** The catalog plan the CLI detects for each harness, for the first multi-account line. */
  detectedPlans: Partial<Record<QuotaHarness, string | null>>;
}) {
  const text = t();
  return (
    <div className="settings">
      <SettingsCard title={text.settings.general} icon={<Glyph kind="general" size={16} />}>
        <SettingRow title={text.settings.language} description={text.settings.languageHint}>
          <select
            value={lang}
            onChange={(event) => updateSettings({ ...settings, language: event.target.value as Lang })}
          >
            {(Object.keys(LANG_NAMES) as Lang[]).map((value) => (
              <option key={value} value={value}>
                {LANG_NAMES[value]}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title={text.settings.theme} description={text.settings.themeHints[settings.theme]}>
          <select
            aria-label={text.settings.theme}
            value={settings.theme}
            onChange={(event) => {
              const theme = event.target.value;
              if (theme === "system" || theme === "dark" || theme === "light") {
                updateSettings({ ...settings, theme });
              }
            }}
          >
            <option value="system">{text.settings.themes.system}</option>
            <option value="dark">{text.settings.themes.dark}</option>
            <option value="light">{text.settings.themes.light}</option>
          </select>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title={text.settings.background} icon={<Glyph kind="monitor" size={16} />}>
        <SettingRow title={text.settings.autostart} description={text.settings.autostartHint}>
          <Switch
            checked={autostart ?? false}
            disabled={autostart === null || autostartBusy}
            tip={autostartBusy ? text.settings.autostartBusy : undefined}
            label={text.settings.autostart}
            onChange={toggleAutostart}
          />
        </SettingRow>
        <SettingRow title={text.settings.restartOnCrash} description={text.settings.restartOnCrashHint}>
          <Switch
            checked={settings.restartOnCrash}
            label={text.settings.restartOnCrash}
            onChange={(next) => updateSettings({ ...settings, restartOnCrash: next })}
          />
        </SettingRow>
        <SettingRow title={text.settings.tray} description={text.settings.trayHint}>
          <Switch
            checked={settings.closeToTray}
            label={text.settings.tray}
            onChange={(next) => updateSettings({ ...settings, closeToTray: next })}
          />
        </SettingRow>
        <SettingRow
          title={text.settings.trayIcon}
          description={quotasOn ? text.settings.trayIconHint : text.settings.trayIconIdle}
        >
          <select
            aria-label={text.settings.trayIcon}
            value={settings.trayIcon}
            disabled={!quotasOn}
            onChange={(event) => updateSettings({ ...settings, trayIcon: event.target.value as Settings["trayIcon"] })}
          >
            <option value="logo">{text.settings.trayLogo}</option>
            {QUOTA_HARNESSES.map((harness) => (
              <option key={harness} value={harness}>
                {agentLabel(harness)}
              </option>
            ))}
          </select>
        </SettingRow>
        {settings.trayIcon !== "logo" && (
          <SettingRow title={text.settings.trayWindow} description={text.settings.trayWindowHints[settings.trayWindow]}>
            <select
              aria-label={text.settings.trayWindow}
              value={settings.trayWindow}
              disabled={!quotasOn}
              onChange={(event) => updateSettings({ ...settings, trayWindow: event.target.value as TrayWindow })}
            >
              {(["tightest", "session", "weekly"] as TrayWindow[]).map((window) => (
                <option key={window} value={window}>
                  {text.settings.trayWindows[window]}
                </option>
              ))}
            </select>
          </SettingRow>
        )}
      </SettingsCard>

      {/* The refresh comes first: under the offline switch it would look governed by it, as
          the WSL mode is by its switch, while it keeps going offline. */}
      <SettingsCard title={text.settings.data} icon={<Glyph kind="data" size={16} />}>
        <SettingRow title={text.settings.refresh} description={refreshHint(settings.refreshMinutes)}>
          <select
            value={settings.refreshMinutes}
            onChange={(event) => updateSettings({ ...settings, refreshMinutes: Number(event.target.value) })}
          >
            <option value={0}>{text.settings.never}</option>
            {/* A WSL scan with OpenCode takes about 30 s: every minute would read almost
                nonstop. 1 can come back here if scans get faster. */}
            {[5, 10, 30].map((minutes) => (
              <option key={minutes} value={minutes}>
                {text.settings.everyMinutes(minutes)}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow title={text.settings.offline} description={offlineHint(settings.offline)}>
          <Switch
            checked={settings.offline}
            label={text.settings.offline}
            onChange={(next) => updateSettings({ ...settings, offline: next })}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title={text.settings.quotasCard} icon={<Glyph kind="subscription" size={16} />}>
        <SettingRow title={text.settings.quotas} description={quotaHint(settings)}>
          <Switch
            checked={quotasOn}
            disabled={settings.offline}
            label={text.settings.quotas}
            onChange={(next) => updateSettings({ ...settings, quotas: next })}
          />
        </SettingRow>
        {/* Renewal only happens on an online quota reading: without one the switch has no effect. */}
        <SettingRow
          title={text.settings.claudeRenew}
          description={quotasOn ? text.settings.claudeRenewHint : text.settings.claudeRenewIdle}
        >
          <Switch
            checked={settings.claudeRenew}
            disabled={!quotasOn}
            label={text.settings.claudeRenew}
            onChange={(next) => updateSettings({ ...settings, claudeRenew: next })}
          />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title={text.settings.multiCard} icon={<Glyph kind="subscription" size={16} />}>
        <MultiAccountSettings settings={settings} updateSettings={updateSettings} detectedPlans={detectedPlans} />
      </SettingsCard>

      {/* Hidden when there is no WSL to turn off; kept while off so it can be turned back on. */}
      {(!settings.wslRead || settings.wslMode === "keep" || hasDistros) && (
        <SettingsCard title="WSL" icon={<EnvIcon env="wsl" size={16} />}>
          <SettingRow
            title={text.settings.wslRead}
            description={settings.wslRead ? text.settings.wslReadOn : text.settings.wslReadOff}
          >
            <Switch
              checked={settings.wslRead}
              label={text.settings.wslRead}
              onChange={(next) => updateSettings({ ...settings, wslRead: next })}
            />
          </SettingRow>
          {/* The mode is kept while reading is off, and greyed out. */}
          <SettingRow title={text.settings.wslModeTitle} description={text.settings.wslModeHints[settings.wslMode]}>
            <select
              value={settings.wslMode}
              disabled={!settings.wslRead}
              onChange={(event) => updateSettings({ ...settings, wslMode: event.target.value as WslMode })}
            >
              {(["auto", "keep"] as WslMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {text.settings.wslModes[mode]}
                </option>
              ))}
            </select>
          </SettingRow>
        </SettingsCard>
      )}

      <SettingsCard title={text.app.harness} icon={<Glyph kind="flame" size={16} />}>
        <HarnessSettings groups={harnessGroups} onToggle={toggleHarness} />
        <p className="muted small set-note">{text.settings.harnessNote}</p>
      </SettingsCard>

      <SettingsCard title={text.settings.updates} icon={<Glyph kind="updates" size={16} />}>
        <SettingRow title={text.settings.autoUpdate} description={autoUpdateHint(settings.offline)}>
          <Switch
            checked={autoUpdateActive(settings)}
            disabled={settings.offline}
            label={text.settings.autoUpdate}
            onChange={(next) => updateSettings({ ...settings, autoUpdate: next })}
          />
        </SettingRow>
        {/* Checking stays at hand when a version is found: a newer one may follow. */}
        <SettingRow
          title={text.settings.installedVersion(appVersion)}
          description={checkHint(updater.state, updater.checking, updater.checkError, updater.checkedAt, updater.nextAt)}
        >
          <button
            className="btn"
            disabled={settings.offline || updater.checking || updater.state.status === "installing"}
            onClick={() => void updater.checkNow()}
          >
            {text.settings.checkNow}
          </button>
        </SettingRow>
        {(updater.state.status === "available" || updater.state.status === "installing") && (
          <SettingRow
            title={t().update.availableTitle(updater.state.version)}
            description={foundHint(updater.state, settings.offline)}
          >
            <button className="btn primary" onClick={openUpdate}>
              {text.settings.seeVersion(updater.state.version)}
            </button>
          </SettingRow>
        )}
      </SettingsCard>

      <SettingsCard title={text.settings.about} icon={<Glyph kind="about" size={16} />}>
        <SettingRow
          title={`Agent Burn Windows${appVersion ? ` ${appVersion}` : ""}`}
          description={text.settings.aboutHint}
        >
          <button className="btn" onClick={() => void openUrl(REPO_URL)}>
            {text.settings.repo}
          </button>
        </SettingRow>
        <SettingRow title={text.settings.origin} description={text.settings.originHint}>
          <button className="btn" onClick={() => void openUrl(MELVYNX_URL)}>
            Agent Burn ↗
          </button>
        </SettingRow>
        <SettingRow title={text.settings.inspiration} description={text.settings.inspirationHint}>
          <button className="btn" onClick={() => void openUrl(DAVID_URL)}>
            DavidSZD ↗
          </button>
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
