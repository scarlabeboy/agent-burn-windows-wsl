import { useMemo, useSyncExternalStore } from "react";
import { getVersion, readSeries, subscribe } from "./archive";
import { forecast, formatClock, formatDay, formatDuration, type GaugeModel } from "./quota";

const W = 560;
const H = 210;
const PAD = { left: 40, right: 14, top: 22, bottom: 28 };

interface Props {
  harness: string;
  model: GaugeModel;
  observedAt: number;
  color: string;
  weekly: boolean;
}

/** Remaining quota over one window: recorded steps, even pace, and the forecast to the reset. */
export function QuotaChart({ harness, model, observedAt, color, weekly }: Props) {
  const { startMs, endMs } = model;
  const x = (t: number) =>
    PAD.left + ((Math.min(Math.max(t, startMs), endMs) - startMs) / (endMs - startMs)) * (W - PAD.left - PAD.right);
  const y = (remaining: number) =>
    PAD.top + ((100 - Math.min(Math.max(remaining, 0), 100)) / 100) * (H - PAD.top - PAD.bottom);

  // Re-read whenever the archive changes (new readings, loaded or rebuilt history).
  const archiveVersion = useSyncExternalStore(subscribe, getVersion);
  const samples = useMemo(
    () => readSeries(harness, model.window.windowMinutes, startMs),
    [harness, model.window.windowMinutes, startMs, observedAt, archiveVersion],
  );

  const points = samples
    .filter((sample) => sample.t >= startMs && sample.t <= observedAt)
    .map((sample) => ({ t: sample.t, remaining: 100 - sample.used }));
  if (points.length === 0) points.push({ t: observedAt, remaining: model.remaining });
  const lastPoint = points[points.length - 1];
  if (lastPoint.t < observedAt) points.push({ t: observedAt, remaining: lastPoint.remaining });

  // Step path: hold each value until the next reading.
  let recorded = `M ${x(points[0].t)} ${y(points[0].remaining)}`;
  for (let i = 1; i < points.length; i++) {
    recorded += ` H ${x(points[i].t)} V ${y(points[i].remaining)}`;
  }

  const pace = (t: number) => 100 * (1 - (t - startMs) / (endMs - startMs));
  const ahead = model.pace >= 0;
  const fill =
    `${recorded} L ${x(observedAt)} ${y(pace(observedAt))} ` +
    `L ${x(points[0].t)} ${y(pace(points[0].t))} Z`;

  const projection = forecast(model);
  const nowX = x(observedAt);
  const nowY = y(model.remaining);
  const emptyAt = projection?.emptyAtMs ?? null;
  const hatchId = `hatch-${harness}-${model.window.windowMinutes}`;
  const labelId = `label-${harness}-${model.window.windowMinutes}`;
  const onPlot = `url(#${labelId})`;
  // "Maintenant" stays inside the chart near either edge instead of being cut off.
  const nowAnchor = nowX > W - PAD.right - 36 ? "end" : nowX < PAD.left + 36 ? "start" : "middle";
  // Near the reset the recorded curve reaches the label: it moves under the forecast line,
  // unless that line is already close to the bottom.
  const resetY =
    projection && nowX > W * 0.7 && projection.remainingAtReset > 15
      ? y(projection.remainingAtReset) + 16
      : y(projection?.remainingAtReset ?? 0) - 8;

  return (
    <svg className="qchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Historique du quota">
      <defs>
        <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="var(--danger)" strokeOpacity="0.45" strokeWidth="2" />
        </pattern>
        <LabelBackground id={labelId} />
      </defs>

      <ChartGrid />

      {emptyAt !== null && (
        <g>
          <rect
            x={x(emptyAt)}
            y={PAD.top}
            width={Math.max(0, x(endMs) - x(emptyAt))}
            height={H - PAD.top - PAD.bottom}
            fill={`url(#${hatchId})`}
          />
          <text x={(x(emptyAt) + x(endMs)) / 2} y={PAD.top + 40} textAnchor="middle" className="qlock">
            Verrouillé
          </text>
          <text x={(x(emptyAt) + x(endMs)) / 2} y={PAD.top + 54} textAnchor="middle" className="qlock">
            {formatDuration((endMs - emptyAt) / 60_000)}
          </text>
        </g>
      )}

      <path d={fill} fill={ahead ? "rgba(46,213,115,0.18)" : "rgba(255,93,108,0.18)"} />
      <line
        x1={x(startMs)}
        y1={y(100)}
        x2={x(endMs)}
        y2={y(0)}
        stroke="var(--muted)"
        strokeDasharray="3 4"
      />
      <text x={W * 0.52} y={y(pace(startMs + (endMs - startMs) * 0.62)) + 16} className="qaxis" filter={onPlot}>
        rythme régulier
      </text>

      {projection && (
        <g>
          <line
            x1={nowX}
            y1={nowY}
            x2={emptyAt !== null ? x(emptyAt) : x(endMs)}
            y2={emptyAt !== null ? y(0) : y(projection.remainingAtReset)}
            stroke={emptyAt !== null ? "var(--danger)" : color}
            strokeDasharray="5 4"
          />
          {emptyAt === null ? (
            <text x={x(endMs) - 4} y={resetY} textAnchor="end" className="qnote" fill={color} filter={onPlot}>
              ≈ {projection.remainingAtReset.toFixed(0)}% au reset
            </text>
          ) : (
            <text x={x(emptyAt) - 6} y={y(0) - 8} textAnchor="end" className="qnote" fill="var(--danger)" filter={onPlot}>
              Vide {formatDay(emptyAt)}
            </text>
          )}
        </g>
      )}

      <path d={recorded} fill="none" stroke={color} strokeWidth="2" />
      <line x1={nowX} x2={nowX} y1={PAD.top} y2={H - PAD.bottom} stroke={color} strokeOpacity="0.5" />
      <circle cx={nowX} cy={nowY} r="4" fill={color} />
      <text x={nowX} y={PAD.top - 8} textAnchor={nowAnchor} className="qnote" fill={color}>
        Maintenant
      </text>

      <text x={PAD.left} y={H - 8} className="qaxis">
        {formatClock(startMs, weekly)}
      </text>
      <text x={W - PAD.right} y={H - 8} textAnchor="end" className="qaxis">
        {formatClock(endMs, weekly)}
      </text>
    </svg>
  );
}

/**
 * An opaque box in the card colour, sized to the text it is applied to: labels stay readable
 * where curves cross them. A stroke halo did the same but overlapped the neighbouring glyphs.
 */
function LabelBackground({ id }: { id: string }) {
  return (
    <filter id={id} x="-0.04" y="-0.12" width="1.08" height="1.24">
      <feFlood style={{ floodColor: "var(--bg)" }} />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

function ChartGrid() {
  const y = (value: number) => PAD.top + ((100 - value) / 100) * (H - PAD.top - PAD.bottom);
  return (
    <>
      {[0, 25, 50, 75, 100].map((value) => (
        <g key={value}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} stroke="var(--grid)" />
          <text x={PAD.left - 6} y={y(value) + 4} textAnchor="end" className="qaxis">
            {value}%
          </text>
        </g>
      ))}
    </>
  );
}

/** The frame of a chart with nothing to draw yet, so an idle card keeps the look of the others. */
export function IdleChart({ note }: { note: string }) {
  return (
    <svg className="qchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={note}>
      <ChartGrid />
      <text x={(PAD.left + W - PAD.right) / 2} y={(PAD.top + H - PAD.bottom) / 2} textAnchor="middle" className="qidle">
        {note}
      </text>
    </svg>
  );
}
