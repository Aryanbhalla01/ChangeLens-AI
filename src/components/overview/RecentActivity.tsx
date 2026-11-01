import { Circle } from "lucide-react";
import type { RecentActivity as ActivityItem } from "../../types";

interface RecentActivityProps {
  items: ActivityItem[];
  onViewAll: () => void;
}

const riskClasses: Record<ActivityItem["riskLevel"], string> = {
  low: "text-green-400",
  medium: "text-amber-300",
  high: "text-orange-400",
  critical: "text-red-400",
};

export function RecentActivity({ items, onViewAll }: RecentActivityProps) {
  return (
    <section className="panel-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Recent activity</h2>
          <p className="mt-1 text-[11px] text-slate-500">Latest sample workspace events</p>
        </div>
        <button className="text-[11px] font-medium text-blue-300 hover:text-blue-200" onClick={onViewAll}>
          View all
        </button>
      </div>
      <div className="mt-3 divide-y divide-line/70">
        {items.length > 0 ? (
          items.map((item) => (
            <article className="flex items-start gap-3 py-3.5" key={item.id}>
              <span className={`mt-1.5 ${riskClasses[item.riskLevel]}`}>
                <Circle size={7} fill="currentColor" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="truncate text-xs font-medium text-slate-200">{item.action}</p>
                  <span className="shrink-0 text-[10px] text-slate-600">{item.time}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  <span className="text-slate-400">{item.repository}</span>
                  <span className="px-1.5 text-slate-700">·</span>
                  {item.detail}
                </p>
              </div>
            </article>
          ))
        ) : (
          <p className="py-8 text-center text-xs text-slate-500">
            No demo activity matches this search.
          </p>
        )}
      </div>
      <p className="mt-1 border-t border-line pt-3 text-[10px] text-slate-600">
        Demo events only · activity is not sourced from Git
      </p>
    </section>
  );
}
