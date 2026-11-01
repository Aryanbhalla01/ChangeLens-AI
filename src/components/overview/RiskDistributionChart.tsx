import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { RiskDistributionPoint } from "../../types";

interface RiskDistributionChartProps {
  data: RiskDistributionPoint[];
}

const riskColors: Record<RiskDistributionPoint["level"], string> = {
  low: "#22C55E",
  medium: "#F59E0B",
  high: "#F97316",
  critical: "#EF4444",
};

const riskLabels: Record<RiskDistributionPoint["level"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function RiskDistributionChart({ data }: RiskDistributionChartProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="panel-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Risk distribution</h2>
        <p className="mt-1 text-[11px] text-slate-500">Across sample changes</p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-[170px] w-[170px] shrink-0">
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                innerRadius={51}
                outerRadius={73}
                paddingAngle={3}
                stroke="none"
              >
                {data.map((entry) => (
                  <Cell fill={riskColors[entry.level]} key={entry.level} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#111B2D",
                  border: "1px solid #263449",
                  borderRadius: 8,
                  color: "#e2e8f0",
                  fontSize: 11,
                }}
                formatter={(value: number, _name: string, item) => [
                  value,
                  riskLabels[item.payload.level as RiskDistributionPoint["level"]],
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold text-slate-100">{total}</span>
            <span className="text-[9px] uppercase tracking-wider text-slate-500">sampled</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {data.map((item) => (
            <div className="flex items-center justify-between gap-2" key={item.level}>
              <span className="flex items-center gap-2 text-[11px] text-slate-400">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: riskColors[item.level] }}
                />
                {riskLabels[item.level]}
              </span>
              <span className="text-xs font-medium tabular-nums text-slate-200">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-line pt-3 text-[10px] leading-relaxed text-slate-600">
        Illustrative distribution only — no risk scoring has been run.
      </p>
    </section>
  );
}
