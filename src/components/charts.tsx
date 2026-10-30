"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTHB } from "@/lib/money";
import { useUiStore } from "@/lib/stores/ui";

export interface ChartPoint {
  label: string;
  [series: string]: string | number | null;
}

export interface SeriesDef {
  key: string;
  name: string;
  /** CSS variable slot: 1, 2 or 3 (fixed order, never cycled). */
  slot: 1 | 2 | 3;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

function useFormatters() {
  const hide = useUiStore((s) => s.hideAmounts);
  return {
    tick: (v: number) => (hide ? "•••" : compact.format(v / 100)),
    value: (v: unknown) => (hide ? "•••" : typeof v === "number" ? formatTHB(v) : "—"),
  };
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)" },
};

/** Grouped bars for comparing magnitudes per month (values in satang). */
export function MonthlyBars({ data, series }: { data: ChartPoint[]; series: SeriesDef[] }) {
  const f = useFormatters();
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={f.tick} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={f.value} cursor={{ fill: "var(--muted)" }} {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={`var(--series-${s.slot})`} radius={[4, 4, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-axis line chart over time (values in satang). Null values render as gaps, never as zero. */
export function TrendLine({ data, series, zeroLine = false }: { data: ChartPoint[]; series: SeriesDef[]; zeroLine?: boolean }) {
  const f = useFormatters();
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={f.tick} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          {zeroLine && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
          <Tooltip formatter={f.value} {...tooltipStyle} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={`var(--series-${s.slot})`}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
