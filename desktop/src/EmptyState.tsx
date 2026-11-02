import { t } from "./i18n";

/** Shown instead of the overview when no harness left any usage: a first launch, or a machine
 *  where none of the supported agents has been used yet. */
export function EmptyState({
  where,
  harnesses,
  disabledCount,
}: {
  /** Where nothing was found, in words: "on this Windows", "in WSL"… */
  where: string;
  /** Names of the harnesses the app can read. */
  harnesses: string[];
  disabledCount: number;
}) {
  const text = t().empty;
  return (
    <div className="card empty-state">
      <h2>{text.title}</h2>
      <p>{text.intro(where)}</p>
      <p className="muted">{text.supported(harnesses.join(", "))}</p>
      <p>{text.howTo}</p>
      {disabledCount > 0 && <p className="muted small">{text.disabled(disabledCount)}</p>}
    </div>
  );
}
