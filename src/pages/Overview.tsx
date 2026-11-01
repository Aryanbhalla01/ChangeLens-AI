import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  GitCommitHorizontal,
  Layers3,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommitActivityChart } from "../components/overview/CommitActivityChart";
import { QuickActions } from "../components/overview/QuickActions";
import { RecentActivity } from "../components/overview/RecentActivity";
import { RecentAnalyses } from "../components/overview/RecentAnalyses";
import { RiskDistributionChart } from "../components/overview/RiskDistributionChart";
import { StatCard } from "../components/overview/StatCard";
import type { OverviewDashboardData } from "../types";

interface OverviewProps {
  data: OverviewDashboardData | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  selectedRepository: string;
  onRetry: () => void;
}

interface ConnectDialogProps {
  onClose: () => void;
}

function ConnectDialog({ onClose }: ConnectDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        aria-labelledby="connect-dialog-title"
        aria-modal="true"
        className="panel-card w-full max-w-md p-6 shadow-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
          <GitCommitHorizontal size={19} />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-100" id="connect-dialog-title">
          Repository connection
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Git repository integration is not part of this frontend milestone. No repository
          connection was attempted.
        </p>
        <div className="mt-5 flex justify-end">
          <button className="button-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </section>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="panel-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <LoaderCircle className="animate-spin text-blue-300" size={24} />
      <p className="mt-3 text-sm font-medium text-slate-200">Loading overview</p>
      <p className="mt-1 text-xs text-slate-500">Preparing the sample workspace data...</p>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="panel-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <AlertTriangle className="text-amber-300" size={24} />
      <p className="mt-3 text-sm font-medium text-slate-200">Overview could not be loaded</p>
      <p className="mt-1 max-w-md text-xs text-slate-500">{message}</p>
      <button className="button-secondary mt-4" onClick={onRetry}>
        <RefreshCw size={13} /> Try again
      </button>
    </div>
  );
}

export function Overview({
  data,
  loading,
  error,
  searchQuery,
  selectedRepository,
  onRetry,
}: OverviewProps) {
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const navigate = useNavigate();

  const { activity, analyses } = useMemo(() => {
    if (!data) {
      return { activity: [], analyses: [] };
    }

    const query = searchQuery.trim().toLowerCase();
    const matchesRepository = (repository: string) =>
      selectedRepository === "all" || repository === selectedRepository;
    const matchesQuery = (text: string) => !query || text.toLowerCase().includes(query);

    return {
      activity: data.recentActivity.filter(
        (item) =>
          matchesRepository(item.repository) &&
          matchesQuery(`${item.repository} ${item.action} ${item.detail}`),
      ),
      analyses: data.recentAnalyses.filter(
        (item) =>
          matchesRepository(item.repository) &&
          matchesQuery(`${item.repository} ${item.title} ${item.branch}`),
      ),
    };
  }, [data, searchQuery, selectedRepository]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              Good to see you, Jordan
            </h2>
            <span className="rounded-full border border-cyan/20 bg-cyan/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan">
              Demo workspace
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            A snapshot of your engineering activity across sample repositories.
          </p>
        </div>
        <button
          className="button-secondary self-start sm:self-auto"
          disabled={loading}
          onClick={onRetry}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} size={13} />
          Refresh preview
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-500/15 bg-blue-500/[0.045] px-4 py-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-blue-300" size={16} />
        <p className="text-[11px] leading-relaxed text-slate-400">
          This is a <span className="font-medium text-slate-300">frontend demo</span> with
          illustrative sample data. No Git repositories were read, and no AI analysis or risk
          scoring has been performed.
        </p>
      </div>

      {loading && !data ? (
        <LoadingPanel />
      ) : error && !data ? (
        <ErrorPanel message={error} onRetry={onRetry} />
      ) : data ? (
        <>
          {error && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200">
              Refresh failed: {error}. Showing the last available sample data.
            </div>
          )}

          <section aria-label="Sample workspace statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              accent="blue"
              caption="Across all sample repositories"
              icon={Layers3}
              label="Repositories"
              value={data.statistics.totalRepositories.toLocaleString()}
            />
            <StatCard
              accent="cyan"
              caption="Illustrative historical sample"
              icon={GitCommitHorizontal}
              label="Commits analyzed"
              value={data.statistics.commitsAnalyzed.toLocaleString()}
            />
            <StatCard
              accent="green"
              caption="Example review records"
              icon={BarChart3}
              label="Changes reviewed"
              value={data.statistics.changesReviewed.toLocaleString()}
            />
            <StatCard
              accent="amber"
              caption="Sample labels · not calculated"
              icon={AlertTriangle}
              label="High-risk changes"
              value={data.statistics.highRiskChanges.toLocaleString()}
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.9fr)]">
            <CommitActivityChart data={data.commitActivity} />
            <RiskDistributionChart data={data.riskDistribution} />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]">
            <div className="space-y-4">
              <RecentAnalyses
                items={analyses}
                onViewAll={() => navigate("/analysis")}
              />
              <RecentActivity
                items={activity}
                onViewAll={() => navigate("/commits")}
              />
            </div>
            <div className="space-y-4">
              <QuickActions
                onConnectRepository={() => setConnectDialogOpen(true)}
                onExploreInsights={() =>
                  document.getElementById("recent-analyses")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              />
              <div className="rounded-xl border border-line bg-surface/60 p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <ArrowUpRight className="text-cyan" size={14} />
                  Preview status
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Charts and review records are local fixtures for this milestone. Live data
                  requires a future backend connection.
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-600">
                  <ArrowDownRight size={12} />
                  No external services contacted
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {connectDialogOpen && <ConnectDialog onClose={() => setConnectDialogOpen(false)} />}
    </div>
  );
}
