import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  GitCommitHorizontal,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { ApiCommitInsights, ApiCommitPage, ApiCommitSummary, ApiRepository } from "../types";
import { getCommitSummary, getCommits } from "../services/api";

interface AIInsightsProps {
  repositories: ApiRepository[];
  repositoryLoading: boolean;
  repositoryError: string | null;
  selectedRepository: string;
  onSelectRepository: (id: string) => void;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function requestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AIInsights({
  repositories,
  repositoryLoading,
  repositoryError,
  selectedRepository,
  onSelectRepository,
}: AIInsightsProps) {
  const [commits, setCommits] = useState<ApiCommitSummary[]>([]);
  const [pagination, setPagination] =
    useState<ApiCommitPage["pagination"] | null>(null);
  const [commitPage, setCommitPage] = useState(1);
  const [commitRefresh, setCommitRefresh] = useState(0);
  const [selectedCommitHash, setSelectedCommitHash] = useState("");
  const [commitsRepository, setCommitsRepository] = useState<string | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ApiCommitInsights | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryRefresh, setSummaryRefresh] = useState(0);

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
        setCommitsError(requestErrorMessage(error, "Commit history could not be loaded."));
      })
      .finally(() => {
        if (active) setCommitsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedRepository, commitPage, commitRefresh]);

  useEffect(() => {
    const hasSelectedCommit = commits.some(
      (commit) => commit.hash === selectedCommitHash,
    );
    if (
      selectedRepository === "all" ||
      commitsRepository !== selectedRepository ||
      !hasSelectedCommit
    ) {
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(false);
      return;
    }

    let active = true;
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);

    void getCommitSummary(selectedRepository, selectedCommitHash)
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setSummaryError(requestErrorMessage(error, "Local insights could not be loaded."));
        }
      })
      .finally(() => {
        if (active) setSummaryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedRepository, selectedCommitHash, commitsRepository, commits, summaryRefresh]);

  const selectedCommit = commits.find(
    (commit) => commit.hash === selectedCommitHash,
  );
  const retryHistory = () => setCommitRefresh((value) => value + 1);
  const retrySummary = () => setSummaryRefresh((value) => value + 1);
  const changeCommitPage = (page: number) => {
    setSelectedCommitHash("");
    setSummary(null);
    setSummaryLoading(false);
    setSummaryError(null);
    setCommitPage(page);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Local Commit Insights
          </h2>
          <p className="mt-1.5 text-xs text-slate-500">
            Deterministic summaries from commit metadata, bounded diffs, and existing static-analysis findings.
          </p>
        </div>
        <button
          className="button-secondary self-start sm:self-auto"
          disabled={repositoryLoading || commitsLoading}
          onClick={retryHistory}
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
              setSummary(null);
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
              !selectedRepository ||
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
        <div className="panel-card flex min-h-56 items-center justify-center gap-2 p-8 text-xs text-slate-400">
          <LoaderCircle className="animate-spin" size={16} />
          Loading connected repositories…
        </div>
      ) : repositories.length === 0 ? (
        <div className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center">
          <GitCommitHorizontal className="text-slate-500" size={23} />
          <p className="mt-3 text-sm font-medium text-slate-200">
            No connected repositories
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Connect a repository before requesting a commit summary.
          </p>
        </div>
      ) : selectedRepository === "all" ? (
        <div className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center">
          <Sparkles className="text-cyan" size={23} />
          <p className="mt-3 text-sm font-medium text-slate-200">
            Select a repository and commit
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-500">
            Local insights are generated from the commit and its available diff.
          </p>
        </div>
      ) : commitsLoading && commitsRepository !== selectedRepository ? (
        <div className="panel-card flex min-h-56 items-center justify-center gap-2 p-8 text-xs text-slate-400">
          <LoaderCircle className="animate-spin" size={16} />
          Loading commit history…
        </div>
      ) : commitsError ? (
        <div
          className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center"
          role="alert"
        >
          <AlertTriangle className="text-rose-300" size={23} />
          <p className="mt-3 text-sm font-medium text-slate-200">
            Commit history unavailable
          </p>
          <p className="mt-1 text-xs text-slate-400">{commitsError}</p>
          <button className="button-secondary mt-4" onClick={retryHistory}>
            Retry
          </button>
        </div>
      ) : !commitsLoading && commits.length === 0 ? (
        <div className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center">
          <GitCommitHorizontal className="text-slate-500" size={23} />
          <p className="mt-3 text-sm font-medium text-slate-200">No commits found</p>
          <p className="mt-1 text-xs text-slate-500">
            This repository has no commits available to summarize.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {selectedCommit ? (
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <p className="truncate text-[11px] text-slate-500">
                  <span className="font-mono text-cyan">{selectedCommit.shortHash}</span>
                  {" · "}
                  {selectedCommit.message}
                  {" · "}
                  {formatDate(selectedCommit.date)}
                </p>
                <button
                  className="button-secondary shrink-0"
                  disabled={summaryLoading || commitsLoading}
                  onClick={retrySummary}
                >
                  <RefreshCw
                    className={summaryLoading ? "animate-spin" : ""}
                    size={13}
                  />
                  Refresh insights
                </button>
              </div>
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
                  {pagination.total !== null ? ` of ${Math.max(1, Math.ceil(pagination.total / pagination.perPage))}` : ""}
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

          {summaryError ? (
            <div
              className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center"
              role="alert"
            >
              <AlertTriangle className="text-rose-300" size={23} />
              <p className="mt-3 text-sm font-medium text-slate-200">
                Summary could not be loaded
              </p>
              <p className="mt-1 text-xs text-slate-400">{summaryError}</p>
              <button className="button-secondary mt-4" onClick={retrySummary}>
                Retry summary
              </button>
            </div>
          ) : summaryLoading || (commitsLoading && !selectedCommit) ? (
            <div
              aria-live="polite"
              className="panel-card flex min-h-56 items-center justify-center gap-2 p-8 text-xs text-slate-400"
            >
              <LoaderCircle className="animate-spin" size={16} />
              Generating local insights…
            </div>
          ) : summary && !summary.available ? (
            <div className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center">
              <AlertTriangle className="text-amber-300" size={23} />
              <p className="mt-3 text-sm font-medium text-slate-200">
                Local insights unavailable
              </p>
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-amber-200">
                {summary.summary}
              </p>
            </div>
          ) : summary?.available ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <p className="rounded-lg border border-cyan/20 bg-cyan/5 px-4 py-2 text-[11px] font-medium text-cyan xl:col-span-2">
                {summary.label}
              </p>
              <InsightSection
                icon={<Sparkles size={16} />}
                title="Commit Summary"
              >
                {summary.whatChanged}
              </InsightSection>
              <InsightSection
                icon={<GitCommitHorizontal size={16} />}
                title="Commit Metadata"
              >
                <dl className="space-y-3">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-500">
                      Author
                    </dt>
                    <dd className="mt-1 text-slate-200">{summary.author || "Unknown author"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-500">
                      Commit message
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap text-slate-200">
                      {summary.commitMessage || "(no commit message)"}
                    </dd>
                  </div>
                </dl>
              </InsightSection>
              <InsightSection
                icon={<CheckCircle2 size={16} />}
                title="Why It Matters"
              >
                {summary.whyItMatters}
              </InsightSection>
              <InsightSection
                icon={<FileCode2 size={16} />}
                title="Files Changed"
              >
                <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                  {summary.statistics.changedFileCount ?? summary.filesChanged.length} file(s) ·{" "}
                  {summary.statistics.addedFileCount} added ·{" "}
                  {summary.statistics.modifiedFileCount} modified ·{" "}
                  {summary.statistics.deletedFileCount} deleted ·{" "}
                  {summary.statistics.renamedFileCount} renamed
                </p>
                <p className="mb-3 text-[11px] text-slate-400">
                  {summary.statistics.insertions === null || summary.statistics.deletions === null
                    ? "Line-change counts unavailable"
                    : `+${summary.statistics.insertions} insertions · -${summary.statistics.deletions} deletions`}
                </p>
                <ul className="space-y-2">
                  {summary.filesChanged.map((file) => (
                    <li
                      className="rounded-lg border border-line bg-sidebar/60 px-3 py-2"
                      key={`${file.changeType}:${file.path}`}
                    >
                      <p className="break-all font-mono text-[11px] text-cyan">
                        {file.path}
                      </p>
                      <p className="mt-1 text-[10px] capitalize text-slate-500">
                        {file.changeType}
                        {file.additions !== null && file.deletions !== null
                          ? ` · +${file.additions} / -${file.deletions}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
                {(summary.statistics.filesTruncated || summary.statistics.diffTruncated) && (
                  <p className="mt-3 text-[11px] text-amber-200">
                    The file list or diff was limited by configured bounds.
                  </p>
                )}
              </InsightSection>
              <InsightSection
                icon={<AlertTriangle size={16} />}
                title="Existing Static-Analysis Findings"
              >
                {summary.riskFindings.length === 0 ? (
                  <p>No existing static-analysis findings were reported for the available analysis.</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.riskFindings.map((finding, index) => (
                      <li
                        className="rounded-lg border border-line bg-sidebar/60 px-3 py-3"
                        key={`${finding.ruleId}:${finding.path}:${finding.lineNumber}:${index}`}
                      >
                        <p className="font-medium text-slate-200">
                          {finding.title} · {finding.severity}
                        </p>
                        <p className="mt-1 break-all font-mono text-[10px] text-cyan">
                          {finding.path}:{finding.lineNumber} · {finding.findingDisposition}
                        </p>
                        <p className="mt-2 text-[11px] text-slate-400">
                          {finding.explanation}
                        </p>
                        {finding.evidence && (
                          <pre className="mt-2 overflow-x-auto rounded bg-canvas p-2 text-[10px] text-slate-300">
                            {finding.evidence}
                          </pre>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {summary.findingsTruncated && (
                  <p className="mt-3 text-[11px] text-amber-200">
                    Static-analysis results were limited by configured bounds.
                  </p>
                )}
              </InsightSection>
              <InsightSection
                icon={<CheckCircle2 size={16} />}
                title="Suggested Review Checks"
              >
                <ul className="space-y-2">
                  {summary.suggestedReviewChecks.map((check, index) => (
                    <li
                      className="flex gap-2 text-xs leading-relaxed text-slate-300"
                      key={`${index}:${check}`}
                    >
                      <CheckCircle2
                        className="mt-0.5 shrink-0 text-cyan"
                        size={14}
                      />
                      <span>{check}</span>
                    </li>
                  ))}
                </ul>
              </InsightSection>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function InsightSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel-card min-w-0 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <span className="text-cyan">{icon}</span>
        {title}
      </h3>
      <div className="mt-4 text-xs leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}
