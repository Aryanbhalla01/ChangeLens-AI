import {
  AlertTriangle,
  GitBranch,
  GitCommitHorizontal,
  Layers3,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { StatCard } from "../components/overview/StatCard";
import type { ApiRepository, ApiRepositoryStatus } from "../types";

interface OverviewProps {
  repositories: ApiRepository[];
  repositoryLoading: boolean;
  repositoryError: string | null;
  selectedRepository: string;
  selectedRepositoryDetails: ApiRepository | null;
  selectedRepositoryStatus: ApiRepositoryStatus | null;
  detailsLoading: boolean;
  detailsError: string | null;
  searchQuery: string;
  connectionState: "checking" | "online" | "offline";
  onSelectRepository: (id: string) => void;
  onRetry: () => void;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function Overview({
  repositories,
  repositoryLoading,
  repositoryError,
  selectedRepository,
  selectedRepositoryDetails,
  selectedRepositoryStatus,
  detailsLoading,
  detailsError,
  searchQuery,
  connectionState,
  onSelectRepository,
  onRetry,
}: OverviewProps) {
  const navigate = useNavigate();
  const visibleRepositories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return repositories.filter((repository) => {
      const selected =
        selectedRepository === "all" || repository.id === selectedRepository;
      const matches =
        !query ||
        `${repository.name} ${repository.path} ${repository.branch ?? ""} ${repository.latestCommit?.message ?? ""}`
          .toLowerCase()
          .includes(query);
      return selected && matches;
    });
  }, [repositories, searchQuery, selectedRepository]);
  const reportedCommitCount = visibleRepositories.reduce(
    (total, repository) => total + repository.commitCount,
    0,
  );
  const countTruncated = visibleRepositories.some(
    (repository) => repository.commitCountTruncated,
  );
  const latestCommits = visibleRepositories
    .filter((repository) => repository.latestCommit)
    .map((repository) => ({
      repository,
      commit: repository.latestCommit!,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              Repository overview
            </h2>
            <span className="rounded-full border border-cyan/20 bg-cyan/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan">
              Live local data
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Read-only status and commit metadata from repositories registered with the backend.
          </p>
        </div>
        <button
          className="button-secondary self-start sm:self-auto"
          disabled={repositoryLoading}
          onClick={onRetry}
        >
          <RefreshCw className={repositoryLoading ? "animate-spin" : ""} size={13} />
          Refresh
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.045] px-4 py-3">
        <ShieldAlert className="mt-0.5 shrink-0 text-amber-300" size={16} />
        <p className="text-[11px] leading-relaxed text-slate-400">
          AI insights and risk scoring are <span className="font-medium text-slate-300">not implemented</span>.
          This page shows repository and Git metadata only.
        </p>
      </div>

      {connectionState === "offline" && (
        <div
          className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-2.5 text-xs text-rose-200"
          role="alert"
        >
          The backend API is unavailable. Start the Flask service and retry.
        </div>
      )}
      {repositoryError && repositories.length > 0 && (
        <div
          className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200"
          role="alert"
        >
          Refresh failed: {repositoryError}
        </div>
      )}

      {repositoryLoading && repositories.length === 0 ? (
        <div className="panel-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <LoaderCircle className="animate-spin text-blue-300" size={24} />
          <p className="mt-3 text-sm font-medium text-slate-200">Loading repositories</p>
          <p className="mt-1 text-xs text-slate-500">Contacting the ChangeLens API…</p>
        </div>
      ) : repositoryError && repositories.length === 0 ? (
        <div className="panel-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="text-amber-300" size={24} />
          <p className="mt-3 text-sm font-medium text-slate-200">Repositories could not be loaded</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">{repositoryError}</p>
          <button className="button-secondary mt-4" onClick={onRetry}>
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      ) : repositories.length === 0 ? (
        <div className="panel-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <Layers3 className="text-slate-500" size={24} />
          <p className="mt-3 text-sm font-medium text-slate-200">No registered repositories</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            The backend has not registered any local repositories yet.
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Repository statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              accent="blue"
              caption="Registered with this backend"
              icon={Layers3}
              label="Repositories"
              value={visibleRepositories.length.toLocaleString()}
            />
            <StatCard
              accent="cyan"
              caption={countTruncated ? "Reported lower bound" : "Reported commit history"}
              icon={GitCommitHorizontal}
              label="Commits"
              value={`${countTruncated ? "≥ " : ""}${reportedCommitCount.toLocaleString()}`}
            />
            <StatCard
              accent="green"
              caption="Current branch from repository metadata"
              icon={GitBranch}
              label="Selected branch"
              value={
                selectedRepository === "all"
                  ? "Select repository"
                  : selectedRepositoryDetails?.branch ?? "Unavailable"
              }
            />
            <StatCard
              accent="amber"
              caption="Working tree status"
              icon={AlertTriangle}
              label="Working tree"
              value={
                selectedRepository === "all"
                  ? "Select repository"
                  : detailsLoading
                    ? "Loading…"
                    : selectedRepositoryStatus
                      ? selectedRepositoryStatus.isDirty
                        ? "Changes present"
                        : "Clean"
                      : "Unavailable"
              }
            />
          </section>

          {selectedRepository !== "all" && detailsError && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200" role="alert">
              Selected repository status could not be loaded: {detailsError}
            </div>
          )}

          <section className="panel-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Registered repositories</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  Select a repository to inspect its status and commit history.
                </p>
              </div>
              <button className="text-[11px] font-medium text-blue-300 hover:text-blue-200" onClick={() => navigate("/repositories")}>
                View repositories
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="border-y border-line bg-sidebar/60 text-[10px] font-medium uppercase tracking-wider text-slate-600">
                    <th className="px-5 py-2.5">Repository</th>
                    <th className="px-4 py-2.5">Branch</th>
                    <th className="px-4 py-2.5">Commits</th>
                    <th className="px-5 py-2.5">Latest commit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {visibleRepositories.map((repository) => (
                    <tr
                      className={`cursor-pointer transition-colors hover:bg-white/[0.025] ${
                        selectedRepository === repository.id ? "bg-blue-500/[0.04]" : ""
                      }`}
                      key={repository.id}
                      onClick={() => onSelectRepository(repository.id)}
                    >
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-medium text-slate-200">{repository.name}</p>
                        <p className="mt-1 max-w-[280px] truncate text-[10px] text-slate-500" title={repository.path}>
                          {repository.path}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-slate-400">{repository.branch ?? "Detached"}</td>
                      <td className="px-4 py-3.5 text-[11px] text-slate-400">
                        {repository.commitCountTruncated ? "≥ " : ""}
                        {repository.commitCount.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5">
                        {repository.latestCommit ? (
                          <>
                            <p className="max-w-[280px] truncate text-xs text-slate-300">
                              {repository.latestCommit.message}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-500">
                              {repository.latestCommit.shortHash} · {formatDate(repository.latestCommit.date)}
                            </p>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-500">No commits</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibleRepositories.length === 0 && (
                    <tr>
                      <td className="px-5 py-9 text-center text-xs text-slate-500" colSpan={4}>
                        No repositories match this search or selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel-card overflow-hidden">
            <div className="px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-100">Latest commits</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                Latest commit metadata returned for the repositories shown above.
              </p>
            </div>
            <div className="divide-y divide-line/70">
              {latestCommits.length > 0 ? (
                latestCommits.map(({ repository, commit }) => (
                  <button
                    className="flex w-full items-start justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.025]"
                    key={repository.id}
                    onClick={() => {
                      onSelectRepository(repository.id);
                      navigate("/commits");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-slate-200">
                        {commit.message}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-slate-500">
                        {repository.name} · {commit.author} · {commit.shortHash}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-500">{formatDate(commit.date)}</span>
                  </button>
                ))
              ) : (
                <p className="px-5 py-8 text-center text-xs text-slate-500">
                  No latest-commit data is available for this selection.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
