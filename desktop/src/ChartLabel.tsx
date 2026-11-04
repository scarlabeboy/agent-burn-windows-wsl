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
