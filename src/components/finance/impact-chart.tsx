"use client";

import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMonthShort } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export type ImpactPoint = { month: string; before: number; after?: number };

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Saldo livre por mês: cenário atual × com a compra simulada (centavos). */
export function ImpactChart({ data, showAfter }: { data: ImpactPoint[]; showAfter: boolean }) {
  return (
    <div className="h-60 w-full" role="img" aria-label="Gráfico do saldo livre por mês, com e sem a compra simulada">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tickFormatter={(m: string) => formatMonthShort(m).split("/")[0]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `R$ ${compact.format(v / 100)}`}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 13 }}
            labelFormatter={(m) => formatMonthShort(String(m))}
            formatter={(v, name) => [formatBRL(Number(v)), name]}
          />
          {showAfter && <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />}
          <Bar dataKey="before" name="Livre hoje" fill="var(--muted-foreground)" fillOpacity={0.35} radius={[4, 4, 0, 0]} animationDuration={300} />
          {showAfter && <Bar dataKey="after" name="Com esta compra" fill="var(--primary)" radius={[4, 4, 0, 0]} animationDuration={300} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
