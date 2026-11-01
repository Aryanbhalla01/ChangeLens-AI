import { ArrowUpRight, GitBranchPlus, Sparkles } from "lucide-react";

interface QuickActionsProps {
  onConnectRepository: () => void;
  onExploreInsights: () => void;
}

export function QuickActions({ onConnectRepository, onExploreInsights }: QuickActionsProps) {
  return (
    <section className="panel-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Quick actions</h2>
        <p className="mt-1 text-[11px] text-slate-500">Start from the workspace overview</p>
      </div>
      <button className="action-card mt-4 w-full text-left" onClick={onConnectRepository}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
          <GitBranchPlus size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-slate-200">Connect a repository</span>
          <span className="mt-1 block text-[10px] text-slate-500">
            Set up a source for future reviews
          </span>
        </span>
        <ArrowUpRight className="shrink-0 text-slate-600" size={15} />
      </button>
      <button
        className="action-card mt-2 w-full text-left"
        onClick={onExploreInsights}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan/10 text-cyan">
          <Sparkles size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-slate-200">Explore sample changes</span>
          <span className="mt-1 block text-[10px] text-slate-500">
            Jump to the example review table
          </span>
        </span>
        <ArrowUpRight className="shrink-0 text-slate-600" size={15} />
      </button>
    </section>
  );
}
