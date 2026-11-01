import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  accent: "blue" | "cyan" | "green" | "amber";
}

const accents = {
  blue: "bg-blue-500/10 text-blue-300",
  cyan: "bg-cyan/10 text-cyan",
  green: "bg-green-500/10 text-green-400",
  amber: "bg-amber-500/10 text-amber-300",
};

export function StatCard({ label, value, caption, icon: Icon, accent }: StatCardProps) {
  return (
    <article className="panel-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="mt-3 text-[27px] font-semibold leading-none tracking-tight text-slate-100">
            {value}
          </p>
        </div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accents[accent]}`}>
          <Icon size={17} strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-4 text-[11px] text-slate-500">{caption}</p>
    </article>
  );
}
