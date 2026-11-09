import { t } from "./i18n";
import { MULTI_MIN_ACCOUNTS, MULTI_NAME_MAX, withMinimumAccounts } from "./multiAccount";
import { PLAN_CATALOG } from "./plans";
import { SettingRow, Switch } from "./SettingsUi";
import type { MultiAccountConfig, MultiAccountEntry, QuotaHarness, Settings } from "./types";
import { agentLabel } from "./views";

/** Codex first, as the settings list it. */
const ORDER: QuotaHarness[] = ["codex", "claude"];

/**
 * One switch per harness; once on, the declared accounts (an optional name and a plan each), a
 * button to add one, and a cross from the third line on. The lines stay stored while off.
 */
export function MultiAccountSettings({
  settings,
  updateSettings,
  detectedPlans,
}: {
  settings: Settings;
  updateSettings: (next: Settings) => void;
  /** The catalog plan the CLI detects for each harness, to fill the first line on first use. */
  detectedPlans: Partial<Record<QuotaHarness, string | null>>;
}) {
  const text = t().settings;
  const save = (harness: QuotaHarness, config: MultiAccountConfig) =>
    updateSettings({ ...settings, multiAccount: { ...settings.multiAccount, [harness]: config } });
  return (
    <>
      {ORDER.map((harness) => {
        const stored = settings.multiAccount?.[harness];
        const name = agentLabel(harness);
        const accounts = stored?.accounts ?? [];
        const setLine = (index: number, line: MultiAccountEntry) =>
          save(harness, { on: true, accounts: accounts.map((entry, at) => (at === index ? line : entry)) });
        return (
          <div key={harness}>
            <SettingRow title={text.multiTitle(name)} description={text.multiHint(name)}>
              <Switch
                checked={stored?.on ?? false}
                label={text.multiTitle(name)}
                onChange={(on) =>
                  save(harness, {
                    on,
                    // First use: the detected plan on the first line, the second left to choose.
                    accounts: stored
                      ? withMinimumAccounts(stored.accounts)
                      : withMinimumAccounts([{ name: "", plan: detectedPlans[harness] ?? null }]),
                  })
                }
              />
            </SettingRow>
            {stored?.on &&
              accounts.map((line, index) => (
                <SettingRow key={index} title={text.multiAccount(name, index + 1)}>
                  <div className="multi-line">
                    <input
                      type="text"
                      className="multi-name"
                      value={line.name}
                      maxLength={MULTI_NAME_MAX}
                      placeholder={text.multiName}
                      aria-label={`${text.multiAccount(name, index + 1)} · ${text.multiName}`}
                      onChange={(event) => setLine(index, { ...line, name: event.target.value })}
                    />
                    <select
                      aria-label={`${text.multiAccount(name, index + 1)} · ${text.multiPlan}`}
                      value={line.plan ?? ""}
                      onChange={(event) => setLine(index, { ...line, plan: event.target.value || null })}
                    >
                      <option value="">{text.multiChoose}</option>
                      {PLAN_CATALOG[harness].map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.label}
                        </option>
                      ))}
                    </select>
                    {index >= MULTI_MIN_ACCOUNTS ? (
                      <button
                        type="button"
                        className="btn multi-remove"
                        aria-label={text.multiRemove(name, index + 1)}
                        title={text.multiRemove(name, index + 1)}
                        onClick={() => save(harness, { on: true, accounts: accounts.filter((_, at) => at !== index) })}
                      >
                        ×
                      </button>
                    ) : (
                      <span className="multi-remove" aria-hidden="true" />
                    )}
                  </div>
                </SettingRow>
              ))}
            {stored?.on && (
              <div className="set-row multi-add">
                <button
                  type="button"
                  className="btn"
                  onClick={() => save(harness, { on: true, accounts: [...accounts, { name: "", plan: null }] })}
                >
                  {text.multiAdd(name)}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p className="muted small set-note">{text.multiNote}</p>
    </>
  );
}
