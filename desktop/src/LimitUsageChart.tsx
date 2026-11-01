import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { OTHER, buildChart, totalUsed, type Grouping, type LimitUsageDay } from "./limitUsage";

const COLORS = ["#ff8a3d", "#4f7cff", "#c44dff", "#2ec4b6", "#f4d35e"];
const OTHER_COLOR = "#8d99ae";
const colorOf = (name: string, index: number) => (name === OTHER ? OTHER_COLOR : COLORS[index % COLORS.length]);

const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: "surface", label: "Surface" },
  { id: "model", label: "Modèle" },
];

/** "2026-10-31" as "31/10". */
const shortDay = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * The weekly Codex limit each day used, stacked by surface (CLI, desktop app, IDE…) or by model.
 * Percentages are shares of one weekly limit; the data covers the whole account.
 */
export function LimitUsageChart({ days, where }: { days: LimitUsageDay[]; where: string }) {
  const [grouping, setGrouping] = useState<Grouping>("surface");
  const chart = useMemo(() => buildChart(days, grouping), [days, grouping]);
  const total = totalUsed(days);
  return (
    <section className="card chart-card">
      <header className="card-head">
        <h2>Limite hebdomadaire utilisée par jour</h2>
        <div className="seg" role="group" aria-label="Regrouper par">
          {GROUPINGS.map((entry) => (
            <button key={entry.id} className={grouping === entry.id ? "on" : ""} onClick={() => setGrouping(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
      </header>
      {total <= 0 ? (
        <p className="muted">Aucune consommation de la limite sur les {days.length} derniers jours.</p>
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
                  tickFormatter={(value: number) => `${Math.round(value)} %`}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8 }}
                  labelFormatter={(date: string) => shortDay(date)}
                  formatter={(value: number, name: string) => [`${value.toFixed(1)} %`, name]}
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
                {entry.name} · {entry.total.toFixed(0)} %
              </span>
            ))}
          </div>
        </>
      )}
      <p className="muted small hint">
        Part d'une limite hebdomadaire consommée chaque jour, sur {days.length} jours : {total.toFixed(0)} % en tout. Compte
        entier, tous les appareils confondus, d'après le tableau de bord ChatGPT · lu {where}.
      </p>
    </section>
  );
}
