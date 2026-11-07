import {
  AlertTriangle,
  GitCommitHorizontal,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type {
  ApiCommitPage,
  ApiCommitRisk,
  ApiCommitSummary,
  ApiRepository,
  ApiRiskFactor,
  ApiRiskClassification,
} from "../types";
import { getCommits, getCommitRisk } from "../services/api";

interface RiskCenterProps {
  repositories: ApiRepository[];
  repositoryLoading: boolean;
  repositoryError: string | null;
  selectedRepository: string;
  onSelectRepository: (id: string) => void;
}

const classificationStyles: Record<ApiRiskClassification, string> = {
  low: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  moderate: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  high: "border-orange-500/25 bg-orange-500/10 text-orange-200",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-200",
};

const factorTitles: Record<ApiRiskFactor["name"], string> = {
  changedFiles: "Changed Files",
  changedLines: "Changed Lines",
  sensitivePaths: "Sensitive Paths",
  staticFindings: "Static Findings",
};

function requestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function RiskCenter({
  repositories,
  repositoryLoading,
  repositoryError,
  selectedRepository,
  onSelectRepository,
}: RiskCenterProps) {
  const [commits, setCommits] = useState<ApiCommitSummary[]>([]);
  const [pagination, setPagination] =
    useState<ApiCommitPage["pagination"] | null>(null);
  const [commitPage, setCommitPage] = useState(1);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [selectedCommitHash, setSelectedCommitHash] = useState("");
  const [commitsRepository, setCommitsRepository] = useState<string | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<ApiCommitRisk | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [assessmentRefresh, setAssessmentRefresh] = useState(0);

  useEffect(() => {
    if (selectedRepository === "all") {
      setCommits([]);
      setPagination(null);
      setCommitsRepository(null);
      setCommitsError(null);
      setCommitsLoading(false);
      return;
    }

    let active = true;
    setCommits([]);
    setPagination(null);
    setCommitsRepository(null);
    setCommitsLoading(true);
    setCommitsError(null);

    void getCommits(selectedRepository, { page: commitPage, perPage: 20 })
      .then((result) => {
        if (!active) return;
        setCommits(result.items);
        setPagination(result.pagination);
        setCommitsRepository(selectedRepository);
        setSelectedCommitHash((current) =>
          result.items.some((commit) => commit.hash === current)
            ? current
            : result.items[0]?.hash ?? "",
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCommitsError(
          requestErrorMessage(error, "Commit history could not be loaded."),
        );
      })
      .finally(() => {
        if (active) setCommitsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedRepository, commitPage, historyRefresh]);

  useEffect(() => {
    if (
      selectedRepository === "all" ||
      commitsRepository !== selectedRepository ||
      !commits.some((commit) => commit.hash === selectedCommitHash)
    ) {
      setAssessment(null);
      setAssessmentError(null);
      setAssessmentLoading(false);
      return;
    }

    let active = true;
    setAssessment(null);
    setAssessmentError(null);
    setAssessmentLoading(true);

    void getCommitRisk(selectedRepository, selectedCommitHash)
      .then((result) => {
        if (active) setAssessment(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setAssessmentError(
            requestErrorMessage(error, "Risk assessment could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) setAssessmentLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedRepository,
    selectedCommitHash,
    commitsRepository,
    commits,
    assessmentRefresh,
  ]);

  const selectedCommit = commits.find(
    (commit) => commit.hash === selectedCommitHash,
  );
  const changeCommitPage = (page: number) => {
    setSelectedCommitHash("");
    setAssessment(null);
    setAssessmentLoading(false);
    setAssessmentError(null);
    setCommitPage(page);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Risk Center
          </h2>
          <p className="mt-1.5 text-xs text-slate-500">
            Inspect the explainable heuristic risk assessment for a commit.
          </p>
        </div>
        <button
          className="button-secondary self-start sm:self-auto"
          disabled={repositoryLoading || commitsLoading || selectedRepository === "all"}
          onClick={() => setHistoryRefresh((value) => value + 1)}
        >
          <RefreshCw className={commitsLoading ? "animate-spin" : ""} size={13} />
          Refresh commits
        </button>
      </header>

      {repositoryError && (
        <div
          className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs text-rose-200"
          role="alert"
        >
          {repositoryError}
        </div>
      )}

      <section className="panel-card grid gap-4 p-5 md:grid-cols-2">
        <label className="block text-xs font-medium text-slate-300">
          Connected repository
          <select
            className="mt-2 h-10 w-full rounded-lg border border-line bg-sidebar px-3 text-xs text-slate-200 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
            disabled={repositoryLoading || repositories.length === 0}
            onChange={(event) => {
              setCommitPage(1);
              setSelectedCommitHash("");
              setAssessment(null);
              setAssessmentError(null);
              onSelectRepository(event.target.value);
            }}
            value={selectedRepository}
          >
            <option value="all">Select a repository</option>
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-slate-300">
          Commit
          <select
            className="mt-2 h-10 w-full rounded-lg border border-line bg-sidebar px-3 text-xs text-slate-200 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
            disabled={
              selectedRepository === "all" ||
              commitsLoading ||
              commits.length === 0
            }
            onChange={(event) => setSelectedCommitHash(event.target.value)}
            value={selectedCommitHash}
          >
            <option value="">
              {commitsLoading ? "Loading commits…" : "Select a commit"}
            </option>
            {commits.map((commit) => (
              <option key={commit.hash} value={commit.hash}>
                {commit.shortHash} · {commit.message}
              </option>
            ))}
          </select>
        </label>
      </section>

      {repositoryLoading && repositories.length === 0 ? (
        <StatusPanel loading message="Loading connected repositories…" />
      ) : repositories.length === 0 ? (
        <StatusPanel
          icon={<GitCommitHorizontal size={23} />}
          message="No connected repositories"
          detail="Connect a repository before assessing commit risk."
        />
      ) : selectedRepository === "all" ? (
        <StatusPanel
          icon={<ShieldAlert size={23} />}
          message="Select a repository and commit"
          detail="The risk assessment is fetched from the backend for the commit you choose."
        />
      ) : commitsLoading && commitsRepository !== selectedRepository ? (
        <StatusPanel loading message="Loading commit history…" />
      ) : commitsError ? (
        <StatusPanel
          alert
          detail={commitsError}
          icon={<AlertTriangle size={23} />}
          message="Commit history unavailable"
          onRetry={() => setHistoryRefresh((value) => value + 1)}
          retryLabel="Retry"
        />
      ) : !commitsLoading && commits.length === 0 ? (
        <StatusPanel
          icon={<GitCommitHorizontal size={23} />}
          message="No commits found"
          detail="This repository has no commits available to assess."
        />
      ) : assessmentError ? (
        <StatusPanel
          alert
          detail={assessmentError}
          icon={<AlertTriangle size={23} />}
          message="Risk assessment unavailable"
          onRetry={() => setAssessmentRefresh((value) => value + 1)}
          retryLabel="Retry assessment"
        />
      ) : assessmentLoading || (commitsLoading && !selectedCommit) ? (
        <StatusPanel loading message="Loading risk assessment…" />
      ) : assessment ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {selectedCommit ? (
              <p className="truncate text-[11px] text-slate-500">
                <span className="font-mono text-cyan">{selectedCommit.shortHash}</span>
                {" · "}
                {selectedCommit.message}
                {" · "}
                {new Date(selectedCommit.date).toLocaleString()}
              </p>
            ) : <span />}
            {pagination && (
              <div className="flex items-center gap-2">
                <button
                  aria-label="Previous commit page"
                  className="button-secondary px-2 py-1.5"
                  disabled={commitPage <= 1 || commitsLoading}
                  onClick={() => changeCommitPage(Math.max(1, commitPage - 1))}
                >
                  Previous
                </button>
                <span className="text-[10px] text-slate-500">
                  Page {pagination.page}
                  {pagination.total !== null
                    ? ` of ${Math.max(1, Math.ceil(pagination.total / pagination.perPage))}`
                    : ""}
                </span>
                <button
                  aria-label="Next commit page"
                  className="button-secondary px-2 py-1.5"
                  disabled={!pagination.hasMore || commitsLoading}
                  onClick={() => changeCommitPage(commitPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
          <section className="panel-card p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Commit risk assessment
                </p>
                <h3 className="mt-2 break-words text-sm font-semibold text-slate-100">
                  {assessment.commit.message}
                </h3>
                <p className="mt-2 text-[11px] text-slate-500">
                  <span className="font-mono text-cyan">
                    {assessment.commit.shortHash}
                  </span>
                  {" · "}
                  {assessment.commit.author}
                  {" · "}
                  {new Date(assessment.commit.date).toLocaleString()}
                </p>
                {assessment.baseCommit && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    Compared with{" "}
                    <span className="font-mono text-cyan">
                      {assessment.baseCommit.shortHash}
                    </span>
                    {" · "}
                    {assessment.baseCommit.message}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="text-right">
                  <p className="text-3xl font-semibold tabular-nums text-slate-100">
                    {assessment.score}
                    <span className="text-sm text-slate-500"> / 100</span>
                  </p>
                  <span
                    className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${classificationStyles[assessment.classification]}`}
                  >
                    {assessment.classification}
                  </span>
                </div>
                <button
                  aria-label="Refresh risk assessment"
                  className="button-secondary px-2.5 py-2"
                  disabled={assessmentLoading}
                  onClick={() => setAssessmentRefresh((value) => value + 1)}
                >
                  <RefreshCw
                    className={assessmentLoading ? "animate-spin" : ""}
                    size={14}
                  />
                </button>
              </div>
            </div>
            <div
              aria-label={`Risk score ${assessment.score} out of 100`}
              className="mt-5 h-2 overflow-hidden rounded-full bg-sidebar"
              role="meter"
              aria-valuenow={assessment.score}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan to-blue-500"
                style={{ width: `${assessment.score}%` }}
              />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-100">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={14} />
              <p>{assessment.disclaimer}</p>
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Contributing factors
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">
                Each factor contributes up to 25 points to the score.
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {assessment.factors.map((factor) => (
                <RiskFactorCard factor={factor} key={factor.name} />
              ))}
            </div>
          </section>

          <section className="panel-card p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              Limitations and configured bounds
            </h3>
            <ul className="mt-3 space-y-2">
              {assessment.limitations.map((limitation) => (
                <li
                  className="flex gap-2 text-xs leading-relaxed text-slate-400"
                  key={limitation}
                >
                  <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={13} />
                  <span>{limitation}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4 text-[10px] text-slate-500">
              <span className="rounded-md border border-line bg-sidebar px-2 py-1">
                Max files: {assessment.limits.maxFiles}
              </span>
              <span className="rounded-md border border-line bg-sidebar px-2 py-1">
                Max diff: {assessment.limits.maxDiffResponseBytes.toLocaleString()} bytes
              </span>
              <span className="rounded-md border border-line bg-sidebar px-2 py-1">
                Max changed lines: {assessment.limits.maxChangedLines.toLocaleString()}
              </span>
              <span className="rounded-md border border-line bg-sidebar px-2 py-1">
                Max findings: {assessment.limits.maxFindings}
              </span>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function RiskFactorCard({ factor }: { factor: ApiRiskFactor }) {
  return (
    <article className="panel-card min-w-0 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">
            {factorTitles[factor.name]}
          </h4>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            {factor.explanation}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-200">
          {factor.score}
          <span className="text-[10px] text-slate-500"> / {factor.maxScore}</span>
        </p>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        {factor.name === "changedFiles" ? (
          <p className="text-xs text-slate-300">
            {factor.value} changed file{factor.value === 1 ? "" : "s"}
          </p>
        ) : factor.name === "changedLines" ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
            <span className="text-emerald-300">+{factor.additions} additions</span>
            <span className="text-rose-300">−{factor.deletions} deletions</span>
            <span className="text-slate-500">
              {factor.unavailableFileCount} file(s) without line counts
            </span>
          </div>
        ) : factor.name === "sensitivePaths" ? (
          factor.categories.length ? (
            <ul className="space-y-3">
              {factor.categories.map((category) => (
                <li key={category.name}>
                  <p className="text-xs text-slate-300">
                    {category.name}
                    <span className="ml-2 text-slate-500">+{category.score}</span>
                  </p>
                  <p className="mt-1 break-all font-mono text-[10px] text-cyan">
                    {category.matchedPaths.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No sensitive paths matched.</p>
          )
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Introduced findings by severity
            </p>
            {Object.keys(factor.severityCounts).length ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(factor.severityCounts).map(([severity, count]) => (
                  <span
                    className="rounded-md border border-line bg-sidebar px-2 py-1 text-[10px] text-slate-300"
                    key={severity}
                  >
                    {severity}: {count}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No introduced findings counted.</p>
            )}
            <p className="text-[10px] text-slate-500">
              Removed findings excluded: {factor.removedFindingsExcluded}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function StatusPanel({
  loading = false,
  alert = false,
  icon,
  message,
  detail,
  onRetry,
  retryLabel,
}: {
  loading?: boolean;
  alert?: boolean;
  icon?: ReactNode;
  message: string;
  detail?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <section
      className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center"
      role={alert ? "alert" : undefined}
    >
      {loading ? (
        <LoaderCircle className="animate-spin text-blue-300" size={23} />
      ) : (
        <span className={alert ? "text-rose-300" : "text-slate-500"}>{icon}</span>
      )}
      <p className="mt-3 text-sm font-medium text-slate-200">{message}</p>
      {detail && (
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">
          {detail}
        </p>
      )}
      {onRetry && retryLabel && (
        <button className="button-secondary mt-4" onClick={onRetry}>
          <RefreshCw size={13} />
          {retryLabel}
        </button>
      )}
    </section>
  );
}
