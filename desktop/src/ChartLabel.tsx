import { t } from "./i18n";

/** The tooltip title of a stacked bar, with the bar's total under it when it stacks several series. */
export function ChartLabel({
  label,
  payload,
  format,
}: {
  label: string;
  payload: readonly { value?: unknown }[] | undefined;
  format: (total: number) => string;
}) {
  const values = (payload ?? []).map((entry) => Number(entry.value) || 0);
  return (
    <>
      {label}
      {values.length > 1 && (
        <span className="chart-total">{t().views.chartTotal(format(values.reduce((sum, value) => sum + value, 0)))}</span>
      )}
    </>
  );
}

/**
 * The rows of a stacked bar chart with their parts at zero left out of the tooltip: a null part
 * is not listed. A row with nothing at all keeps its first zero, so its tooltip still shows.
 */
export function withoutZeros<T extends object>(rows: T[], keys: string[]): T[] {
  return rows.map((row) => {
    const values = row as Record<string, unknown>;
    const zeros = keys.filter((key) => values[key] === 0);
    if (zeros.length === 0) return row;
    const keep = keys.some((key) => Number(values[key]) > 0) ? undefined : zeros[0];
    const copy: Record<string, unknown> = { ...values };
    for (const key of zeros) if (key !== keep) copy[key] = null;
    return copy as T;
  });
}
