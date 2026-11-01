import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CommitActivityPoint } from "../../types";

interface CommitActivityChartProps {
  data: CommitActivityPoint[];
}

export function CommitActivityChart({ data }: CommitActivityChartProps) {
  return (
    <section className="panel-card min-w-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Commit activity</h2>
          <p className="mt-1 text-[11px] text-slate-500">Last 7 days · sample data</p>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-blue-500" /> Commits
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-cyan/70" /> Changes
          </span>
        </div>
      </div>
      <div className="mt-5 h-[220px] w-full">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data} margin={{ top: 4, right: 2, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="#263449" strokeDasharray="3 5" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="day"
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              tickMargin={8}
            />
            <Tooltip
              contentStyle={{
                background: "#111B2D",
                border: "1px solid #263449",
                borderRadius: 8,
                color: "#e2e8f0",
                fontSize: 11,
              }}
              cursor={{ fill: "rgba(148, 163, 184, 0.06)" }}
              labelStyle={{ color: "#94a3b8", marginBottom: 4 }}
            />
            <Bar dataKey="commits" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="changes" fill="#22D3EE" fillOpacity={0.68} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
