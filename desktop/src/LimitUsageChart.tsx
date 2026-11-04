import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getLang, percent, t } from "./i18n";
import { TitleIcon } from "./TitleIcons";
import { buildChart, otherLabel, totalUsed, type Grouping, type LimitUsageDay } from "./limitUsage";

const COLORS = ["#ff8a3d", "#4f7cff", "#c44dff", "#2ec4b6", "#f4d35e"];
const OTHER_COLOR = "#8d99ae";
const colorOf = (name: string, index: number) => (name === otherLabel() ? OTHER_COLOR : COLORS[index % COLORS.length]);

const GROUPINGS: Grouping[] = ["surface", "model"];

/** "2026-10-31" as "31/10", or "10/31" in English. */
const shortDay = (date: string) =>
  getLang() === "en" ? `${date.slice(5, 7)}/${date.slice(8, 10)}` : `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * The weekly Codex limit each day used, stacked by surface (CLI, desktop app, IDE…) or by model.
 * Percentages are shares of one weekly limit; the data covers the whole account.
 */
export function LimitUsageChart({ days, where }: { days: LimitUsageDay[]; where: string }) {
  const [grouping, setGrouping] = useState<Grouping>("surface");
  const lang = getLang();
  // The language is a key: "Other" is a series name, so it changes with it.
  const chart = useMemo(() => buildChart(days, grouping), [days, grouping, lang]);
  const total = totalUsed(days);
  const text = t().limit;
  return (
    <section className="card chart-card">
      <header className="card-head">
        <h2>
          <TitleIcon kind="calendar" />
          {text.title}
        </h2>
        <div className="seg" role="group" aria-label={text.groupBy}>
          {GROUPINGS.map((id) => (
            <button key={id} className={grouping === id ? "on" : ""} onClick={() => setGrouping(id)}>
              {text[id]}
            </button>
          ))}
        </div>
      </header>
      {total <= 0 ? (
        <p className="muted">{text.none(days.length)}</p>
      ) : (
        <>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted)" tickLine={false} minTickGap={24} tickFormatter={shortDay} />
                <YAxis
                  stroke="var(--muted)"
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(value: number) => percent(Math.round(value))}
                />
                <Tooltip
                  cursor={{ className: "chart-cursor" }}
                  contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8 }}
                  labelFormatter={(date: string) => shortDay(date)}
                  formatter={(value: number, name: string) => [percent(value.toFixed(1)), name]}
                />
                {chart.series.map((entry, index) => (
                  <Bar
                    key={entry.name}
                    dataKey={entry.name}
                    stackId="limit"
                    fill={colorOf(entry.name, index)}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            {chart.series.map((entry, index) => (
              <span key={entry.name}>
                <i style={{ background: colorOf(entry.name, index) }} />
                {entry.name} · {text.share(Math.round((entry.total / total) * 100))}
              </span>
            ))}
          </div>
        </>
      )}
      <p className="muted small hint">{text.hint(where)}</p>
    </section>
  );
}
