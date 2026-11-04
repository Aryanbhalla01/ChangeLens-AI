import {
  AlertTriangle,
  GitCommitHorizontal,
  GitCompareArrows,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  compareCommits,
  getCommitDetails,
  getCommits,
} from "../services/api";
import type {
  ApiCommitDetail,
  ApiCommitPage,
  ApiComparison,
  ApiCompareFile,
  ApiCommitFile,
  ApiRepository,
} from "../types";

interface CommitExplorerProps {
  repositories: ApiRepository[];
  selectedRepository: string;
  selectedRepositoryDetails: ApiRepository | null;
  searchQuery: string;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function DiffContent({ diff }: { diff: string }) {
  if (!diff) {
    return (
      <p className="px-4 py-8 text-center text-xs text-slate-500">
        No text diff is available for this file.
      </p>
    );
  }

  return (
    <pre className="max-h-[55vh] overflow-auto bg-[#080d19] py-3 font-mono text-[11px] leading-relaxed">
      {diff.split("\n").map((line, index) => {
        const added = line.startsWith("+") && !line.startsWith("+++");
        const removed = line.startsWith("-") && !line.startsWith("---");
        const header = line.startsWith("@@");
        return (
          <span
            className={`block min-w-max px-4 ${
              added
                ? "bg-emerald-500/10 text-emerald-300"
                : removed
                  ? "bg-rose-500/10 text-rose-300"
                  : header
                    ? "bg-blue-500/10 text-blue-300"
                    : "text-slate-400"
            }`}
            key={`${index}:${line}`}
          >
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

export function CommitExplorer({
  repositories,
  selectedRepository,
  selectedRepositoryDetails,
  searchQuery,
}: CommitExplorerProps) {
  const navigate = useNavigate();
  const [history, setHistory] = useState<ApiCommitPage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [selectedHash, setSelectedHash] = useState("");
  const [detail, setDetail] = useState<ApiCommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [baseHash, setBaseHash] = useState("");
  const [targetHash, setTargetHash] = useState("");
  const [comparison, setComparison] = useState<ApiComparison | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<ApiCommitFile | null>(null);
  const [fileDiff, setFileDiff] = useState<ApiCompareFile | null>(null);
  const [fileDiffLoading, setFileDiffLoading] = useState(false);
  const [fileDiffError, setFileDiffError] = useState<string | null>(null);
  const [fileDiffRefresh, setFileDiffRefresh] = useState(0);

  useEffect(() => {
    if (selectedRepository === "all") {
      setHistory(null);
      setSelectedHash("");
      setHistoryError(null);
      return;
    }

    let active = true;
    setHistoryLoading(true);
    setHistoryError(null);
    void getCommits(selectedRepository, {
      page,
      perPage: 20,
      search: searchQuery.trim() || undefined,
      branch: selectedRepositoryDetails?.branch ?? undefined,
    })
      .then((result) => {
        if (!active) return;
        setHistory(result);
        setSelectedHash((current) =>
          result.items.some((commit) => commit.hash === current)
            ? current
            : result.items[0]?.hash ?? "",
        );
        setTargetHash((current) =>
          result.items.some((commit) => commit.hash === current)
            ? current
            : result.items[0]?.hash ?? "",
        );
        setBaseHash("");
        setComparison(null);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setHistoryError(
          requestError instanceof Error
            ? requestError.message
            : "Commit history could not be loaded.",
        );
        setHistory(null);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedRepository,
    selectedRepositoryDetails?.branch,
    searchQuery,
    page,
    historyRefresh,
  ]);

  useEffect(() => {
    setSelectedFile(null);
    if (selectedRepository === "all" || !selectedHash) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    void getCommitDetails(selectedRepository, selectedHash)
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setBaseHash(result.parents[0]?.hash ?? "");
        setTargetHash(result.hash);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setDetailError(
          requestError instanceof Error
            ? requestError.message
            : "Commit details could not be loaded.",
        );
        setDetail(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedRepository, selectedHash, detailRefresh]);

  useEffect(() => {
    if (!selectedFile) {
      setFileDiff(null);
      setFileDiffError(null);
      setFileDiffLoading(false);
      return;
    }

    if (!detail?.parents[0]) {
      setFileDiff(null);
      setFileDiffError(null);
      setFileDiffLoading(false);
      return;
    }

    let active = true;
    setFileDiff(null);
    setFileDiffLoading(true);
    setFileDiffError(null);
    void compareCommits(selectedRepository, detail.parents[0].hash, detail.hash)
      .then((result) => {
        if (!active) return;
        const matchingFile = result.files.find(
          (item) =>
            item.path === selectedFile.path &&
            (item.previousPath ?? null) === (selectedFile.previousPath ?? null),
        );
        setFileDiff(matchingFile ?? null);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setFileDiffError(
          requestError instanceof Error
            ? requestError.message
            : "The file diff could not be loaded.",
        );
      })
      .finally(() => {
        if (active) setFileDiffLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedRepository,
    detail,
    selectedFile,
    fileDiffRefresh,
  ]);

  const availableCommits = useMemo(() => history?.items ?? [], [history]);
  const selectedCommit = availableCommits.find((commit) => commit.hash === selectedHash);
  const comparisonCommits = useMemo(() => {
    const commits = [...availableCommits];
    if (detail?.parents[0] && !commits.some((commit) => commit.hash === detail.parents[0].hash)) {
      commits.push({
        ...detail,
        hash: detail.parents[0].hash,
        shortHash: detail.parents[0].shortHash,
        message: detail.parents[0].message,
        branch: null,
        changedFileCount: null,
        insertions: null,
        deletions: null,
        statsAvailable: false,
      });
    }
    return commits;
  }, [availableCommits, detail]);

  const runComparison = async () => {
    if (!selectedRepository || !baseHash || !targetHash || baseHash === targetHash) return;
    setCompareLoading(true);
    setCompareError(null);
    setComparison(null);
    try {
      setComparison(await compareCommits(selectedRepository, baseHash, targetHash));
    } catch (requestError) {
      setCompareError(
        requestError instanceof Error
          ? requestError.message
          : "The commit comparison could not be loaded.",
      );
    } finally {
      setCompareLoading(false);
    }
  };

  if (selectedRepository === "all") {
    return (
      <section className="panel-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <GitCommitHorizontal className="text-slate-500" size={24} />
        <h2 className="mt-3 text-sm font-medium text-slate-200">Choose a repository</h2>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          Select a registered repository to load its commit history, details, and comparisons.
        </p>
        <button className="button-secondary mt-4" onClick={() => navigate("/repositories")}>
          Browse repositories
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Commit Explorer
          </h2>
          <p className="mt-1.5 text-xs text-slate-500">
            {repositories.find((repository) => repository.id === selectedRepository)?.name ??
              "Selected repository"}
            {selectedRepositoryDetails?.branch
              ? ` · ${selectedRepositoryDetails.branch}`
              : ""}
          </p>
        </div>
        <button
          className="button-secondary self-start sm:self-auto"
          disabled={historyLoading}
          onClick={() => setHistoryRefresh((value) => value + 1)}
        >
          <RefreshCw className={historyLoading ? "animate-spin" : ""} size={13} />
          Refresh history
        </button>
      </div>

      {historyError && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs text-rose-200" role="alert">
          {historyError}
          <button
            className="ml-3 text-blue-300 hover:text-blue-200"
            onClick={() => setHistoryRefresh((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.4fr)]">
        <section className="panel-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">History</h3>
              <p className="mt-1 text-[10px] text-slate-500">
                {history?.pagination.total === null || history?.pagination.total === undefined
                  ? `${availableCommits.length} commits on this page`
                  : `${history.pagination.total.toLocaleString()} matching commits`}
                {history?.pagination.truncated ? " · history truncated" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous commit page"
                className="button-secondary px-2 py-1.5"
                disabled={page <= 1 || historyLoading}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                ‹
              </button>
              <span className="text-[10px] text-slate-500">{page}</span>
              <button
                aria-label="Next commit page"
                className="button-secondary px-2 py-1.5"
                disabled={!history?.pagination.hasMore || historyLoading}
                onClick={() => setPage((value) => value + 1)}
              >
                ›
              </button>
            </div>
          </div>
          {historyLoading && !history && (
            <div className="flex min-h-40 items-center justify-center gap-2 text-xs text-slate-400">
              <LoaderCircle className="animate-spin" size={15} /> Loading commit history…
            </div>
          )}
          {!historyLoading && !historyError && availableCommits.length === 0 && (
            <p className="px-5 py-10 text-center text-xs text-slate-500">
              No commits match this repository and search.
            </p>
          )}
          <div className="max-h-[720px] divide-y divide-line/70 overflow-y-auto">
            {availableCommits.map((commit) => (
              <button
                className={`block w-full px-4 py-3.5 text-left transition-colors hover:bg-white/[0.025] ${
                  selectedHash === commit.hash ? "bg-blue-500/[0.06]" : ""
                }`}
                key={commit.hash}
                onClick={() => setSelectedHash(commit.hash)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] text-cyan">{commit.shortHash}</span>
                  <span className="truncate text-[10px] text-slate-500">{formatDate(commit.date)}</span>
                </span>
                <span className="mt-1.5 block truncate text-xs font-medium text-slate-200">
                  {commit.message}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
                  <span>{commit.author}</span>
                  <span>·</span>
                  <span>{commit.changedFileCount ?? "?"} files</span>
                  {commit.statsAvailable && (
                    <span className="text-slate-400">
                      +{commit.insertions ?? 0} / −{commit.deletions ?? 0}
                    </span>
                  )}
                  {!commit.statsAvailable && <span>diff stats unavailable</span>}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-5">
          <section className="panel-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Commit details
                </p>
                {detailLoading ? (
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                    <LoaderCircle className="animate-spin" size={14} /> Loading commit…
                  </p>
                ) : detail ? (
                  <>
                    <h3 className="mt-2 break-words text-sm font-semibold text-slate-100">
                      {detail.message}
                    </h3>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {detail.author} · {formatDate(detail.date)} ·{" "}
                      <span className="font-mono text-cyan">{detail.shortHash}</span>
                    </p>
                  </>
                ) : detailError ? (
                  <p className="mt-3 flex items-center gap-2 text-xs text-rose-300">
                    <AlertTriangle size={14} /> {detailError}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    {selectedCommit ? "Choose a commit to inspect." : "No commit selected."}
                  </p>
                )}
              </div>
              {detailError && (
                <button
                  className="button-secondary shrink-0"
                  onClick={() => setDetailRefresh((value) => value + 1)}
                >
                  Retry
                </button>
              )}
            </div>
            {detail && (
              <>
                <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-slate-400">
                  <span className="rounded-md border border-line bg-sidebar px-2 py-1">
                    {detail.addedFiles.length} added
                  </span>
                  <span className="rounded-md border border-line bg-sidebar px-2 py-1">
                    {detail.modifiedFiles.length} modified
                  </span>
                  <span className="rounded-md border border-line bg-sidebar px-2 py-1">
                    {detail.deletedFiles.length} deleted
                  </span>
                  <span className="rounded-md border border-line bg-sidebar px-2 py-1">
                    {detail.renamedFiles.length} renamed
                  </span>
                  {detail.filesTruncated && (
                    <span className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-amber-200">
                      File list truncated
                    </span>
                  )}
                </div>
                <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-line">
                  {detail.files.length > 0 ? (
                    detail.files.map((file) => (
                      <button
                        aria-label={`Open ${file.changeType} file ${file.path}`}
                        className={`flex w-full flex-wrap items-center justify-between gap-2 border-b border-line/70 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-white/[0.035] ${
                          file.changeType === "deleted"
                            ? "hover:text-rose-200"
                            : "hover:text-blue-200"
                        }`}
                        key={`${file.changeType}:${file.path}`}
                        onClick={() => {
                          setSelectedFile(file);
                          setFileDiff(null);
                          setFileDiffError(null);
                          setFileDiffRefresh((value) => value + 1);
                        }}
                      >
                        <span className="min-w-0 break-all font-mono text-[10px] text-slate-300">
                          {file.previousPath ? `${file.previousPath} → ` : ""}
                          {file.path}
                        </span>
                        <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[9px] capitalize text-slate-500">
                          {file.changeType}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-5 text-center text-xs text-slate-500">
                      No changed files reported.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="panel-card p-5">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="text-cyan" size={16} />
              <h3 className="text-sm font-semibold text-slate-100">Compare commits</h3>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Bounded file diffs from the backend; binary and truncated files are labeled.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="text-[10px] text-slate-500">
                Base
                <select
                  className="mt-1.5 h-9 w-full rounded-lg border border-line bg-sidebar px-2 text-xs text-slate-200"
                  onChange={(event) => {
                    setBaseHash(event.target.value);
                    setComparison(null);
                  }}
                  value={baseHash}
                >
                  <option value="">Select base</option>
                  {comparisonCommits.map((commit) => (
                    <option key={commit.hash} value={commit.hash}>
                      {commit.shortHash} · {commit.message}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] text-slate-500">
                Target
                <select
                  className="mt-1.5 h-9 w-full rounded-lg border border-line bg-sidebar px-2 text-xs text-slate-200"
                  onChange={(event) => {
                    setTargetHash(event.target.value);
                    setComparison(null);
                  }}
                  value={targetHash}
                >
                  <option value="">Select target</option>
                  {availableCommits.map((commit) => (
                    <option key={commit.hash} value={commit.hash}>
                      {commit.shortHash} · {commit.message}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button-primary self-end"
                disabled={!baseHash || !targetHash || baseHash === targetHash || compareLoading}
                onClick={() => void runComparison()}
              >
                {compareLoading ? <LoaderCircle className="animate-spin" size={13} /> : <GitCompareArrows size={13} />}
                Compare
              </button>
            </div>
            {compareError && (
              <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-200" role="alert">
                {compareError}
                <button className="ml-3 text-blue-300 hover:text-blue-200" onClick={() => void runComparison()}>
                  Retry
                </button>
              </div>
            )}
            {comparison && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                  <span>{comparison.files.length} files shown</span>
                  {comparison.filesTruncated && <span className="text-amber-200">· file list truncated</span>}
                  {comparison.diffTruncated && <span className="text-amber-200">· diff response truncated</span>}
                </div>
                {comparison.files.map((file) => (
                  <article className="overflow-hidden rounded-lg border border-line" key={`${file.changeType}:${file.path}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sidebar/60 px-3 py-2">
                      <span className="min-w-0 break-all font-mono text-[10px] text-slate-300">
                        {file.previousPath ? `${file.previousPath} → ` : ""}
                        {file.path}
                      </span>
                      <span className="shrink-0 text-[9px] capitalize text-slate-500">
                        {file.changeType}
                        {file.binary ? " · binary" : ""}
                        {file.truncated ? " · truncated" : ""}
                      </span>
                    </div>
                    {!file.binary && file.diff && (
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[10px] leading-relaxed text-slate-400">
                        {file.diff}
                      </pre>
                    )}
                    {file.binary && (
                      <p className="px-3 py-3 text-[10px] text-slate-500">
                        Binary file content is not displayed.
                      </p>
                    )}
                  </article>
                ))}
                {comparison.files.length === 0 && (
                  <p className="rounded-lg border border-line px-3 py-5 text-center text-xs text-slate-500">
                    No file changes were reported between these commits.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {selectedFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedFile(null)}
        >
          <section
            aria-labelledby="commit-file-detail-title"
            aria-modal="true"
            className="panel-card w-full max-w-5xl overflow-hidden shadow-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Commit file · {selectedFile.changeType}
                </p>
                <h2
                  className="mt-1 break-all font-mono text-sm font-medium text-slate-100"
                  id="commit-file-detail-title"
                >
                  {selectedFile.path}
                </h2>
                {selectedFile.previousPath && (
                  <p className="mt-1 break-all text-[11px] text-slate-500">
                    Renamed from <span className="font-mono">{selectedFile.previousPath}</span>
                  </p>
                )}
              </div>
              <button
                aria-label="Close file details"
                className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-elevated hover:text-white"
                onClick={() => setSelectedFile(null)}
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-[11px]">
              <span className="rounded-md border border-line bg-sidebar px-2.5 py-1 text-slate-300">
                {selectedFile.changeType}
              </span>
              <span className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-emerald-300">
                +{fileDiff?.additions ?? "—"} additions
              </span>
              <span className="rounded-md border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 text-rose-300">
                −{fileDiff?.deletions ?? "—"} deletions
              </span>
              {selectedFile.changeType === "deleted" && (
                <span className="text-slate-500">The file was removed by this commit.</span>
              )}
            </div>

            {fileDiffLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-xs text-slate-400">
                <LoaderCircle className="animate-spin" size={16} />
                Loading bounded file diff…
              </div>
            ) : fileDiffError ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
                <AlertTriangle className="text-amber-300" size={20} />
                <p className="mt-3 text-xs text-slate-300">{fileDiffError}</p>
                <button
                  className="button-secondary mt-4"
                  onClick={() => setFileDiffRefresh((value) => value + 1)}
                >
                  <RefreshCw size={13} /> Retry
                </button>
              </div>
            ) : !detail?.parents[0] ? (
              <p className="px-6 py-10 text-center text-xs leading-relaxed text-slate-500">
                This is a root commit and has no parent. The existing comparison API accepts two
                commits, so it cannot produce a parent-to-commit diff for this file.
              </p>
            ) : fileDiff ? (
              fileDiff.binary ? (
                <p className="px-6 py-10 text-center text-xs text-slate-500">
                  This is a binary file. Its contents are not displayed.
                </p>
              ) : fileDiff.truncated && !fileDiff.diff ? (
                <p className="px-6 py-10 text-center text-xs leading-relaxed text-slate-500">
                  The backend omitted this diff because it exceeded the configured safe read
                  limits. File metadata is still available.
                </p>
              ) : (
                <>
                  {fileDiff.truncated && (
                    <p className="border-b border-amber-500/15 bg-amber-500/5 px-5 py-2 text-[10px] text-amber-200">
                      The diff is truncated to the backend&apos;s configured response limit.
                    </p>
                  )}
                  <DiffContent diff={fileDiff.diff} />
                </>
              )
            ) : (
              <p className="px-6 py-10 text-center text-xs leading-relaxed text-slate-500">
                No matching diff entry was returned. It may have been omitted because the
                comparison reached its file limit.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
