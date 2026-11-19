"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMonthShort, monthOf } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export type ChartPoint = { date: string; real?: number; projected?: number };

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Evolução do saldo (realizado) + projeção (tracejada). Valores em centavos. */
export function BoxChart({ data, color }: { data: ChartPoint[]; color: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Gráfico da evolução do saldo da caixinha">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="boxFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => formatMonthShort(monthOf(d)).split("/")[0]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            tickFormatter={(v: number) => `R$ ${compact.format(v / 100)}`}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              color: "var(--foreground)",
              fontSize: 13,
            }}
            labelFormatter={(d) => formatMonthShort(monthOf(String(d)))}
            formatter={(v, name) => [formatBRL(Number(v)), name === "real" ? "Saldo" : "Projeção"]}
          />
          <Area type="monotone" dataKey="real" stroke={color} strokeWidth={2} fill="url(#boxFill)" connectNulls animationDuration={400} />
          <Area type="monotone" dataKey="projected" stroke={color} strokeWidth={2} strokeDasharray="5 5" fill="transparent" connectNulls animationDuration={400} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
