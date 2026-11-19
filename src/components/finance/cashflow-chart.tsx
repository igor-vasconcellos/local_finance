"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMonthShort } from "@/lib/dates";
import { formatBRL } from "@/lib/money";

export type CashflowPoint = {
  month: string;
  income: number;
  outflow: number;
  free: number;
  freeSimulated?: number;
};

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Entradas × saídas (barras) e saldo livre (linha); com simulações, linha extra tracejada. Valores em centavos. */
export function CashflowChart({ data, showSimulated }: { data: CashflowPoint[]; showSimulated: boolean }) {
  return (
    <div className="h-80 w-full" role="img" aria-label="Gráfico do fluxo de caixa: entradas, saídas e saldo livre por mês">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
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
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 13 }}
            labelFormatter={(m) => formatMonthShort(String(m))}
            formatter={(v, name) => [formatBRL(Number(v)), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name="Entradas" fill="var(--success)" fillOpacity={0.8} radius={[4, 4, 0, 0]} animationDuration={400} />
          <Bar dataKey="outflow" name="Saídas" fill="var(--danger)" fillOpacity={0.75} radius={[4, 4, 0, 0]} animationDuration={400} />
          <Line
            type="monotone"
            dataKey="free"
            name={showSimulated ? "Livre (real)" : "Saldo livre"}
            stroke={showSimulated ? "var(--muted-foreground)" : "var(--primary)"}
            strokeWidth={2.5}
            dot={{ r: 3 }}
            animationDuration={400}
          />
          {showSimulated && (
            <Line
              type="monotone"
              dataKey="freeSimulated"
              name="Livre com simulações"
              stroke="var(--primary)"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={{ r: 3 }}
              animationDuration={400}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
