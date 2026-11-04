import { AlertTriangle, GitBranch, GitCommitHorizontal, LoaderCircle, RefreshCw } from "lucide-react";
import type { ApiRepository, ApiRepositoryStatus } from "../types";

interface RepositoriesPageProps {
  repositories: ApiRepository[];
  repositoryLoading: boolean;
  repositoryError: string | null;
  selectedRepository: string;
  selectedRepositoryStatus: ApiRepositoryStatus | null;
  detailsLoading: boolean;
  detailsError: string | null;
  onSelectRepository: (id: string) => void;
  onRetry: () => void;
}

export function RepositoriesPage({
  repositories,
  repositoryLoading,
  repositoryError,
  selectedRepository,
  selectedRepositoryStatus,
  detailsLoading,
  detailsError,
  onSelectRepository,
  onRetry,
}: RepositoriesPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Repositories
          </h2>
          <p className="mt-1.5 text-xs text-slate-500">
            Local repositories registered with the read-only ChangeLens backend.
          </p>
        </div>
        <button className="button-secondary self-start sm:self-auto" disabled={repositoryLoading} onClick={onRetry}>
          <RefreshCw className={repositoryLoading ? "animate-spin" : ""} size={13} />
          Refresh
        </button>
      </div>

      {repositoryError && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200" role="alert">
          {repositoryError}
          <button className="ml-3 text-blue-300 hover:text-blue-200" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {repositoryLoading && repositories.length === 0 ? (
        <div className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center">
          <LoaderCircle className="animate-spin text-blue-300" size={23} />
          <p className="mt-3 text-sm text-slate-300">Loading registered repositories…</p>
        </div>
      ) : repositories.length === 0 ? (
        <div className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center">
          <GitBranch className="text-slate-500" size={23} />
          <p className="mt-3 text-sm font-medium text-slate-200">No repositories registered</p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Repository registration is not available in this read-only frontend milestone.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {repositories.map((repository) => {
            const selected = repository.id === selectedRepository;
            return (
              <article
                className={`panel-card min-w-0 p-5 transition-colors ${
                  selected ? "border-blue-500/40" : ""
                }`}
                key={repository.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-100">
                      {repository.name}
                    </h3>
                    <p className="mt-1 break-all text-[11px] text-slate-500">{repository.path}</p>
                  </div>
                  {selected && (
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[9px] font-medium text-blue-200">
                      Selected
                    </span>
                  )}
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line bg-sidebar/60 p-3">
                    <p className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
                      <GitBranch size={13} /> Branch
                    </p>
                    <p className="mt-2 truncate text-xs text-slate-200">
                      {repository.branch ?? "Detached HEAD"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-sidebar/60 p-3">
                    <p className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
                      <GitCommitHorizontal size={13} /> Commits
                    </p>
                    <p className="mt-2 text-xs text-slate-200">
                      {repository.commitCountTruncated ? "At least " : ""}
                      {repository.commitCount.toLocaleString()}
                    </p>
                  </div>
                </div>
                {selected && (
                  <div className="mt-3 rounded-lg border border-line bg-sidebar/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Working tree
                    </p>
                    {detailsLoading ? (
                      <p className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                        <LoaderCircle className="animate-spin" size={13} /> Loading status…
                      </p>
                    ) : selectedRepositoryStatus ? (
                      <>
                        <p className="mt-2 text-xs text-slate-200">
                          {selectedRepositoryStatus.isDirty ? "Changes present" : "Clean"}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {selectedRepositoryStatus.stagedFileCount} staged ·{" "}
                          {selectedRepositoryStatus.modifiedFileCount} modified ·{" "}
                          {selectedRepositoryStatus.untrackedFileCount}
                          {selectedRepositoryStatus.untrackedFileCountTruncated ? "+" : ""} untracked
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                        <AlertTriangle size={13} /> {detailsError ?? "Status unavailable"}
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <p className="truncate text-[10px] text-slate-500">
                    {repository.latestCommit
                      ? `${repository.latestCommit.shortHash} · ${repository.latestCommit.message}`
                      : "No commits"}
                  </p>
                  <button
                    className="button-secondary shrink-0"
                    onClick={() => onSelectRepository(selected ? "all" : repository.id)}
                  >
                    {selected ? "Clear selection" : "Select repository"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
