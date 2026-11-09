import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Boxes,
  FileCode2,
  GitCommitHorizontal,
  GitFork,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getCommitDependencies, getCommits } from "../services/api";
import type {
  ApiCommitDependencies,
  ApiCommitPage,
  ApiCommitSummary,
  ApiRepository,
} from "../types";

interface AnalysisProps {
  repositories: ApiRepository[];
  repositoryLoading: boolean;
  repositoryError: string | null;
  selectedRepository: string;
  onSelectRepository: (id: string) => void;
}

type GraphGroup = "indirect" | "direct" | "affected" | "other";

interface PositionedNode {
  path: string;
  module: string;
  present: boolean | null;
  group: GraphGroup;
  labelLines: string[];
  subColumn: number;
  width: number;
  height: number;
  x: number;
  y: number;
}

const graphWidth = 1200;
const groupFrames: Record<GraphGroup, { x: number; width: number }> = {
  indirect: { x: 10, width: 194 },
  direct: { x: 210, width: 194 },
  affected: { x: 410, width: 194 },
  other: { x: 610, width: 580 },
};
const nodeHeightMinimum = 60;
const nodeVerticalGap = 10;
const nodeInnerWidth = 164;
const groupTitles: Record<GraphGroup, string> = {
  indirect: "Indirect Dependents",
  direct: "Direct Dependents",
  affected: "Changed Files",
  other: "Other Files",
};
const groupAccents: Record<GraphGroup, string> = {
  indirect: "#a78bfa",
  direct: "#3b82f6",
  affected: "#fbbf24",
  other: "#64748b",
};

function wrapFilePath(path: string, maxLength = 30): string[] {
  return path.match(new RegExp(`.{1,${maxLength}}`, "gu")) ?? [path];
}

function calculateColumnOrder(
  columns: Record<GraphGroup, PositionedNode[]>,
  edges: ApiCommitDependencies["graph"]["edges"],
) {
  const groups: GraphGroup[] = ["indirect", "direct", "affected", "other"];
  const adjacentPaths = new Map<string, Set<string>>();
  for (const edge of edges) {
    const from = adjacentPaths.get(edge.from) ?? new Set<string>();
    from.add(edge.to);
    adjacentPaths.set(edge.from, from);
    const to = adjacentPaths.get(edge.to) ?? new Set<string>();
    to.add(edge.from);
    adjacentPaths.set(edge.to, to);
  }
  const getPositions = () => {
    const positions = new Map<string, { group: GraphGroup; index: number }>();
    for (const group of groups) {
      columns[group].forEach((node, index) =>
        positions.set(node.path, { group, index }),
      );
    }
    return positions;
  };

  for (let pass = 0; pass < 6; pass++) {
    const orderedGroups = pass % 2 === 0 ? groups : [...groups].reverse();
    for (const group of orderedGroups) {
      const positions = getPositions();
      const column = columns[group];
      const currentOrder = new Map(column.map((node, index) => [node.path, index]));
      const scores = new Map<string, number>();
      for (const node of column) {
        const neighborRanks: number[] = [];
        for (const neighborPath of adjacentPaths.get(node.path) ?? []) {
          const neighbor = positions.get(neighborPath);
          if (
            !neighbor ||
            Math.abs(groups.indexOf(group) - groups.indexOf(neighbor.group)) !== 1
          ) {
            continue;
          }
          neighborRanks.push(
            neighbor.index / Math.max(1, columns[neighbor.group].length - 1),
          );
        }
        scores.set(
          node.path,
          neighborRanks.length
            ? neighborRanks.reduce((sum, rank) => sum + rank, 0) /
                neighborRanks.length
            : (currentOrder.get(node.path) ?? 0) /
                Math.max(1, column.length - 1),
        );
      }
      column.sort(
        (a, b) =>
          (scores.get(a.path) ?? 0) - (scores.get(b.path) ?? 0) ||
          a.path.localeCompare(b.path),
      );
    }
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function DependencyGraph({
  result,
  selectedPath,
  onSelectPath,
}: {
  result: ApiCommitDependencies;
  selectedPath: string;
  onSelectPath: (path: string) => void;
}) {
  const [activePath, setActivePath] = useState(selectedPath);
  useEffect(() => setActivePath(selectedPath), [selectedPath]);

  const directPaths = new Set(result.graph.directDependents.map((item) => item.path));
  const indirectPaths = new Set(
    result.graph.indirectDependents.map((item) => item.path),
  );
  const changedPaths = new Set(result.changedFiles);
  const groupOf = (path: string): GraphGroup =>
    directPaths.has(path)
      ? "direct"
      : indirectPaths.has(path)
        ? "indirect"
        : changedPaths.has(path)
          ? "affected"
          : "other";

  const nodesByPath = new Map<string, PositionedNode>();
  for (const node of result.graph.nodes) {
    nodesByPath.set(node.path, {
      ...node,
      group: groupOf(node.path),
      labelLines: wrapFilePath(node.path),
      subColumn: 0,
      width: nodeInnerWidth,
      height: 0,
      x: 0,
      y: 0,
    });
  }
  for (const edge of result.graph.edges) {
    for (const path of [edge.from, edge.to]) {
      if (nodesByPath.has(path)) continue;
      nodesByPath.set(path, {
        path,
        module: "",
        present: null,
        group: groupOf(path),
        labelLines: wrapFilePath(path),
        subColumn: 0,
        width: nodeInnerWidth,
        height: 0,
        x: 0,
        y: 0,
      });
    }
  }
  const groups: GraphGroup[] = ["indirect", "direct", "affected", "other"];
  const columns: Record<GraphGroup, PositionedNode[]> = {
    indirect: [],
    direct: [],
    affected: [],
    other: [],
  };
  for (const node of nodesByPath.values()) columns[node.group].push(node);
  const depthByPath = new Map(
    [...result.graph.directDependents, ...result.graph.indirectDependents].map(
      (item) => [item.path, item.depth],
    ),
  );
  for (const group of groups) {
    columns[group].sort(
      (a, b) =>
        (depthByPath.get(a.path) ?? 0) - (depthByPath.get(b.path) ?? 0) ||
        a.path.localeCompare(b.path),
    );
  }
  calculateColumnOrder(columns, result.graph.edges);
  const otherColumns: PositionedNode[][] = [[], [], []];
  columns.other.forEach((node, index) => {
    otherColumns[index % otherColumns.length].push(node);
  });
  const gridColumns: Record<GraphGroup, PositionedNode[][]> = {
    indirect: [columns.indirect],
    direct: [columns.direct],
    affected: [columns.affected],
    other: otherColumns,
  };
  const topPadding = 78;
  const columnGap = 10;
  const cardHeights = new Map<string, number>();
  const gridColumnHeights: number[] = [];
  for (const group of groups) {
    const frame = groupFrames[group];
    const subColumns = gridColumns[group];
    const width =
      group === "other"
        ? Math.floor((frame.width - 32 - columnGap * 2) / 3)
        : frame.width - 22;
    for (const subColumn of subColumns) {
      let totalHeight = 0;
      for (const node of subColumn) {
        node.width = Math.min(nodeInnerWidth, width - 14);
        const maxLineLength = Math.max(12, Math.floor((node.width - 14) / 5.8));
        node.labelLines = wrapFilePath(node.path, maxLineLength);
        const height = Math.max(
          nodeHeightMinimum,
          33 + node.labelLines.length * 10,
        );
        cardHeights.set(node.path, height);
        totalHeight += height + nodeVerticalGap;
      }
      gridColumnHeights.push(totalHeight);
    }
  }
  const positions: PositionedNode[] = [];
  const maxGridHeight = Math.max(...gridColumnHeights, 0);
  groups.forEach((group) => {
    const frame = groupFrames[group];
    const subColumns = gridColumns[group];
    const subColumnWidth =
      group === "other"
        ? (frame.width - 32 - columnGap * 2) / 3
        : frame.width - 22;
    subColumns.forEach((subColumn, subColumnIndex) => {
      const currentHeight = subColumn.reduce(
        (height, node) =>
          height + (cardHeights.get(node.path) ?? nodeHeightMinimum) + nodeVerticalGap,
        0,
      );
      let y = topPadding + (maxGridHeight - currentHeight) / 2;
      for (const node of subColumn) {
        const height = cardHeights.get(node.path) ?? nodeHeightMinimum;
        const x =
          group === "other"
            ? frame.x + 16 + subColumnIndex * (subColumnWidth + columnGap) + subColumnWidth / 2
            : frame.x + frame.width / 2;
        node.subColumn = subColumnIndex;
        positions.push({ ...node, height, x, y: y + height / 2 });
        y += height + nodeVerticalGap;
      }
    });
  });
  const graphBottom = positions.reduce(
    (bottom, node) => Math.max(bottom, node.y + node.height / 2),
    topPadding,
  );
  const graphBottomPadding = 24;
  const graphHeight = Math.ceil(graphBottom + graphBottomPadding);
  const nodeByPath = new Map(positions.map((node) => [node.path, node]));
  const groupCounts = {
    indirect: columns.indirect.length,
    direct: columns.direct.length,
    affected: columns.affected.length,
    other: columns.other.length,
  };
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const edge of result.graph.edges) {
    const targets = outgoing.get(edge.from) ?? new Set<string>();
    targets.add(edge.to);
    outgoing.set(edge.from, targets);
    const sources = incoming.get(edge.to) ?? new Set<string>();
    sources.add(edge.from);
    incoming.set(edge.to, sources);
  }
  const relatedPaths = new Set([
    ...(incoming.get(activePath) ?? []),
    ...(outgoing.get(activePath) ?? []),
  ]);
  const hasActiveNode = nodeByPath.has(activePath);

  if (positions.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
        <GitFork className="text-slate-500" size={24} />
        <p className="mt-3 text-sm font-medium text-slate-200">
          No dependency graph is available
        </p>
        <p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-500">
          The selected commit has no Python files in the analyzed graph.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-[11px] text-slate-400">
          Import arrows point from the importing file to its dependency.
        </p>
        <p className="text-[10px] text-slate-500">
          {positions.length} nodes · {result.graph.edges.length} import edges
        </p>
      </div>
      <div
        aria-label="Dependency graph frame"
        className="w-full overflow-hidden"
        style={{
          height: graphHeight,
          backgroundColor: "#080e1b",
          backgroundImage:
            "radial-gradient(circle, rgba(100, 116, 139, 0.18) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
      >
        <svg
          aria-label="Directed Python dependency graph"
          className="block h-full w-full"
          preserveAspectRatio="xMidYMin meet"
          role="img"
          viewBox={`0 0 ${graphWidth} ${graphHeight}`}
        >
          <defs>
            <marker
              id="dependency-arrow"
              markerHeight="8"
              markerWidth="9"
              orient="auto"
              refX="8"
              refY="4"
              viewBox="0 0 9 8"
            >
              <path d="M0,0 L9,4 L0,8 z" fill="#94a3b8" />
            </marker>
            <filter id="selected-node-glow" x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur result="blur" stdDeviation="3" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {groups.map((group) => {
            const frame = groupFrames[group];
            return (
            <g key={group}>
              <rect
                fill="#0b1220"
                fillOpacity="0.58"
                height={graphHeight - 24}
                rx="14"
                stroke="#263349"
                strokeWidth="1"
                width={frame.width}
                x={frame.x}
                y="10"
              />
              <rect
                fill={groupAccents[group]}
                fillOpacity="0.85"
                height="3"
                rx="1"
                width="34"
                x={frame.x + frame.width / 2 - 17}
                y="54"
              />
              <text
                fill="#cbd5e1"
                fontSize="12"
                fontWeight="600"
                textAnchor="middle"
                x={frame.x + frame.width / 2}
                y="25"
              >
                {groupTitles[group]}
              </text>
              <text
                fill="#74839b"
                fontSize="9.5"
                textAnchor="middle"
                x={frame.x + frame.width / 2}
                y="42"
              >
                {groupCounts[group]} {groupCounts[group] === 1 ? "file" : "files"}
              </text>
            </g>
            );
          })}
          {result.graph.edges.map((edge, index) => {
            const from = nodeByPath.get(edge.from);
            const to = nodeByPath.get(edge.to);
            if (!from || !to) return null;
            const sameGroup = from.group === to.group;
            let path: string;
            if (sameGroup) {
              const frame = groupFrames[from.group];
              const subColumnWidth =
                (frame.width - 32 - columnGap * 2) / 3;
              const sourceLane =
                from.group === "other"
                  ? frame.x +
                    16 +
                    from.subColumn * (subColumnWidth + columnGap) +
                    subColumnWidth -
                    5
                  : frame.x + frame.width - 7;
              const targetLane =
                to.group === "other"
                  ? frame.x +
                    16 +
                    to.subColumn * (subColumnWidth + columnGap) +
                    subColumnWidth -
                    5
                  : frame.x + frame.width - 7;
              const sourcePort = from.x + from.width / 2;
              const targetApproach = to.x + to.width / 2 + 5;
              const sharedRouteY = topPadding - 10;
              path = `M ${sourcePort} ${from.y} H ${sourceLane} V ${sharedRouteY} H ${targetLane} V ${to.y} H ${targetApproach}`;
            } else {
              const direction = Math.sign(to.x - from.x);
              const sourcePort = from.x + direction * (from.width / 2);
              const targetPort = to.x - direction * (to.width / 2);
              const laneX = (sourcePort + targetPort) / 2;
              path = `M ${sourcePort} ${from.y} H ${laneX} V ${to.y} H ${targetPort}`;
            }
            const highlighted =
              !hasActiveNode ||
              edge.from === activePath ||
              edge.to === activePath;
            return (
              <path
                key={`${edge.from}:${edge.to}:${index}`}
                markerEnd="url(#dependency-arrow)"
                d={path}
                fill="none"
                stroke={highlighted ? "#a5b4c8" : "#64748b"}
                strokeDasharray={highlighted ? undefined : "4 5"}
                strokeOpacity={highlighted ? 0.72 : 0.18}
                strokeWidth={highlighted ? 1.5 : 1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {positions.map((node) => {
            const selected = node.path === activePath;
            const related = relatedPaths.has(node.path);
            const colors =
              node.group === "direct"
                ? { border: "#3b82f6", fill: "#111f3d", text: "#dbeafe" }
                : node.group === "indirect"
                  ? { border: "#a78bfa", fill: "#211b3c", text: "#ede9fe" }
                  : node.group === "affected"
                    ? { border: "#fbbf24", fill: "#342814", text: "#fef3c7" }
                    : { border: "#475569", fill: "#111827", text: "#cbd5e1" };
            return (
              <g
                aria-label={`${node.path}${selected ? ", selected" : related ? ", connected to selection" : ""}`}
                className="cursor-pointer"
                key={node.path}
                onClick={() => {
                  setActivePath(node.path);
                  if (changedPaths.has(node.path)) onSelectPath(node.path);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActivePath(node.path);
                    if (changedPaths.has(node.path)) onSelectPath(node.path);
                  }
                }}
                opacity={hasActiveNode && !selected && !related ? 0.46 : 1}
                role="button"
                tabIndex={0}
              >
                <rect
                  fill={colors.border}
                  fillOpacity={selected || related ? "0.14" : "0.04"}
                  filter={selected ? "url(#selected-node-glow)" : undefined}
                  height={node.height}
                  rx="10"
                  width={node.width}
                  x={node.x - node.width / 2}
                  y={node.y - node.height / 2}
                />
                <rect
                  fill={colors.fill}
                  height={node.height}
                  rx="9"
                  stroke={selected ? "#22d3ee" : colors.border}
                  strokeWidth={selected || related ? 1.8 : 1}
                  width={node.width}
                  x={node.x - node.width / 2}
                  y={node.y - node.height / 2}
                />
                {node.labelLines.map((line, lineIndex) => (
                  <text
                    fill={colors.text}
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    fontSize="10"
                    fontWeight="600"
                    key={`${node.path}:label:${lineIndex}`}
                    textAnchor="middle"
                    x={node.x}
                    y={node.y - node.height / 2 + 15 + lineIndex * 10}
                  >
                    {line}
                  </text>
                ))}
                <text
                  fill="#94a3b8"
                  fontSize="8.5"
                  textAnchor="middle"
                  x={node.x}
                  y={node.y + node.height / 2 - 7}
                >
                  {node.present === null
                    ? "Referenced by import edge"
                    : node.present
                      ? node.module || "Root module"
                      : "Deleted from commit"}
                </text>
                <title>{node.path}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-[#080e1b] px-4 py-3 text-[10px] text-slate-400">
        <Legend color="border-cyan-400 bg-cyan-950" label="Selected node" />
        <Legend color="border-amber-400 bg-amber-950" label="Changed file" />
        <Legend color="border-blue-500 bg-blue-950" label="Direct dependent" />
        <Legend color="border-violet-400 bg-violet-950" label="Indirect dependent" />
        <Legend color="border-slate-600 bg-slate-900" label="Other file" />
        <span className="ml-auto flex items-center gap-1.5">
          <ArrowRight size={12} /> Import direction
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-md border ${color}`} />
      {label}
    </span>
  );
}

function CountCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-sidebar/70 p-4">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
        {value}
      </p>
      <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

function ReportCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel-card min-w-0">
      <h3 className="flex items-center gap-2 border-b border-line px-4 py-3 text-xs font-semibold text-slate-100">
        <span className="text-cyan">{icon}</span>
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Analysis({
  repositories,
  repositoryLoading,
  repositoryError,
  selectedRepository,
  onSelectRepository,
}: AnalysisProps) {
  const [commits, setCommits] = useState<ApiCommitSummary[]>([]);
  const [pagination, setPagination] =
    useState<ApiCommitPage["pagination"] | null>(null);
  const [commitPage, setCommitPage] = useState(1);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [selectedCommitHash, setSelectedCommitHash] = useState("");
  const [commitsRepository, setCommitsRepository] = useState<string | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ApiCommitDependencies | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisRefresh, setAnalysisRefresh] = useState(0);
  const [selectedAffectedPath, setSelectedAffectedPath] = useState("");

  useEffect(() => {
    if (selectedRepository === "all") {
      setCommits([]);
      setPagination(null);
      setCommitsRepository(null);
      setCommitsError(null);
      setCommitsLoading(false);
      setSelectedCommitHash("");
      setAnalysis(null);
      setAnalysisError(null);
      return;
    }

    let active = true;
    setCommits([]);
    setPagination(null);
    setCommitsRepository(null);
    setCommitsLoading(true);
    setCommitsError(null);
    setSelectedCommitHash("");
    setAnalysis(null);
    setAnalysisError(null);

    void getCommits(selectedRepository, { page: commitPage, perPage: 20 })
      .then((result) => {
        if (!active) return;
        setCommits(result.items);
        setPagination(result.pagination);
        setCommitsRepository(selectedRepository);
        setSelectedCommitHash(result.items[0]?.hash ?? "");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCommitsError(
          getErrorMessage(error, "Commit history could not be loaded."),
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
      setAnalysis(null);
      setAnalysisError(null);
      setAnalysisLoading(false);
      setSelectedAffectedPath("");
      return;
    }

    let active = true;
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    setSelectedAffectedPath("");

    void getCommitDependencies(selectedRepository, selectedCommitHash)
      .then((result) => {
        if (!active) return;
        setAnalysis(result);
        setSelectedAffectedPath(result.changedFiles[0] ?? "");
      })
      .catch((error: unknown) => {
        if (active) {
          setAnalysisError(
            getErrorMessage(error, "Dependency analysis could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) setAnalysisLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    selectedRepository,
    selectedCommitHash,
    commitsRepository,
    commits,
    analysisRefresh,
  ]);

  const selectedCommit = commits.find(
    (commit) => commit.hash === selectedCommitHash,
  );
  const truncationLabels = analysis
    ? [
        ["treeEntriesTruncated", "Repository tree scan reached its entry limit"],
        ["filesTruncated", "Python file scan reached a file or byte limit"],
        ["changedFilesTruncated", "Changed-file list was capped"],
        ["importsTruncated", "Import scan reached its limit"],
        ["edgesTruncated", "Dependency edges reached their limit"],
        ["graphTruncated", "Dependent traversal reached a graph or result limit"],
        ["nodesTruncated", "Graph node list reached its limit"],
      ].filter(([key]) => analysis.summary[key as keyof typeof analysis.summary] === true)
        .map(([, label]) => label)
    : [];
  const changeCommitPage = (page: number) => {
    setSelectedCommitHash("");
    setAnalysis(null);
    setAnalysisLoading(false);
    setAnalysisError(null);
    setSelectedAffectedPath("");
    setCommitPage(page);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-100">
            Code Analysis
          </h2>
          <p className="mt-1.5 text-xs text-slate-500">
            Explore Python imports and files that depend on a selected commit.
          </p>
        </div>
        <button
          className="button-secondary self-start sm:self-auto"
          disabled={
            repositoryLoading ||
            commitsLoading ||
            selectedRepository === "all"
          }
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
              setAnalysis(null);
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
        <StatePanel loading title="Loading connected repositories…" />
      ) : repositories.length === 0 ? (
        <StatePanel
          icon={<GitCommitHorizontal size={23} />}
          title="No connected repositories"
          detail="Connect a repository before running dependency analysis."
        />
      ) : selectedRepository === "all" ? (
        <StatePanel
          icon={<Boxes size={23} />}
          title="Select a repository and commit"
          detail="Analysis is loaded from the backend for the commit you select."
        />
      ) : commitsLoading && commitsRepository !== selectedRepository ? (
        <StatePanel loading title="Loading commit history…" />
      ) : commitsError ? (
        <StatePanel
          alert
          detail={commitsError}
          onRetry={() => setHistoryRefresh((value) => value + 1)}
          title="Commit history unavailable"
        />
      ) : !commitsLoading && commits.length === 0 ? (
        <StatePanel
          icon={<GitCommitHorizontal size={23} />}
          title="No commits found"
          detail="This repository has no commits available to analyze."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {selectedCommit ? (
              <p className="min-w-0 truncate text-[11px] text-slate-500">
                <span className="font-mono text-cyan">{selectedCommit.shortHash}</span>
                {" · "}
                {selectedCommit.message}
                {" · "}
                {formatDate(selectedCommit.date)}
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

          {analysisError ? (
            <StatePanel
              alert
              detail={analysisError}
              onRetry={() => setAnalysisRefresh((value) => value + 1)}
              title="Dependency analysis unavailable"
            />
          ) : analysisLoading ||
            (commitsLoading && !selectedCommit) ||
            !analysis ? (
            <StatePanel loading title="Analyzing commit dependencies…" />
          ) : (
            <AnalysisReport
              analysis={analysis}
              selectedAffectedPath={selectedAffectedPath}
              onSelectAffectedPath={setSelectedAffectedPath}
              truncationLabels={truncationLabels}
            />
          )}
        </>
      )}
    </div>
  );
}

function StatePanel({
  title,
  detail,
  loading = false,
  alert = false,
  icon,
  onRetry,
}: {
  title: string;
  detail?: string;
  loading?: boolean;
  alert?: boolean;
  icon?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div
      className="panel-card flex min-h-56 flex-col items-center justify-center p-8 text-center"
      role={alert ? "alert" : undefined}
      aria-live={loading ? "polite" : undefined}
    >
      {loading ? (
        <LoaderCircle className="animate-spin text-slate-400" size={20} />
      ) : alert ? (
        <AlertTriangle className="text-rose-300" size={23} />
      ) : (
        <span className="text-cyan">{icon}</span>
      )}
      <p className="mt-3 text-sm font-medium text-slate-200">{title}</p>
      {detail && (
        <p className={`mt-1 max-w-2xl text-xs leading-relaxed ${alert ? "text-rose-200" : "text-slate-500"}`}>
          {detail}
        </p>
      )}
      {onRetry && (
        <button className="button-secondary mt-4" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

function AnalysisReport({
  analysis,
  selectedAffectedPath,
  onSelectAffectedPath,
  truncationLabels,
}: {
  analysis: ApiCommitDependencies;
  selectedAffectedPath: string;
  onSelectAffectedPath: (path: string) => void;
  truncationLabels: string[];
}) {
  const hasPythonFiles =
    analysis.summary.pythonFilesScanned > 0 || analysis.graph.nodes.length > 0;
  const nodeByPath = new Map(
    analysis.graph.nodes.map((node) => [node.path, node]),
  );

  return (
    <div className="space-y-5">
      {analysis.summary.truncated && (
        <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={15} />
          <div>
            <p className="font-medium">Analysis results are truncated</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-100/80">
              {truncationLabels.length > 0 ? (
                truncationLabels.map((label) => <li key={label}>{label}.</li>)
              ) : (
                <li>One or more configured analysis limits were reached.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CountCard
          detail={`${analysis.summary.parsedFiles} parsed successfully`}
          label="Python files scanned"
          value={analysis.summary.pythonFilesScanned}
        />
        <CountCard
          detail={`${analysis.summary.directDependentCount} direct dependents`}
          label="Indirect dependents"
          value={analysis.summary.indirectDependentCount}
        />
        <CountCard
          detail={`${analysis.graph.edges.length} import edges in graph`}
          label="Graph nodes"
          value={analysis.graph.nodes.length}
        />
        <CountCard
          detail={`${analysis.summary.syntaxErrorCount} syntax · ${analysis.summary.unresolvedImportCount} unresolved`}
          label="Warnings"
          value={
            analysis.summary.syntaxErrorCount +
            analysis.summary.unresolvedImportCount
          }
        />
      </section>

      {!hasPythonFiles && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3 text-xs text-slate-300">
          No Python files were scanned for this commit. There is no Python
          dependency graph to display.
        </div>
      )}

      {analysis.changedFiles.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-400">
            Select a changed file to highlight it. Direct and indirect dependents
            are shown for the commit&apos;s changed files.
          </p>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            Affected file
            <select
              className="h-9 max-w-[min(70vw,420px)] rounded-lg border border-line bg-sidebar px-3 text-[11px] text-slate-200 outline-none focus:border-primary/60"
              onChange={(event) => onSelectAffectedPath(event.target.value)}
              value={selectedAffectedPath}
            >
              {analysis.changedFiles.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <section className="panel-card overflow-hidden">
        <h3 className="flex items-center gap-2 border-b border-line px-4 py-3 text-xs font-semibold text-slate-100">
          <GitFork className="text-cyan" size={15} />
          Dependency graph
        </h3>
        <DependencyGraph
          onSelectPath={onSelectAffectedPath}
          result={analysis}
          selectedPath={selectedAffectedPath}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportCard icon={<ArrowRight size={15} />} title="Direct dependents">
          <DependentList
            items={analysis.graph.directDependents}
            nodeByPath={nodeByPath}
            empty="No analyzed file directly imports the changed files."
          />
        </ReportCard>
        <ReportCard icon={<ArrowDownRight size={15} />} title="Indirect dependents">
          <DependentList
            items={analysis.graph.indirectDependents}
            nodeByPath={nodeByPath}
            empty="No indirect dependents were found within the configured traversal depth."
          />
        </ReportCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportCard icon={<FileCode2 size={15} />} title="File status">
          {analysis.graph.nodes.length === 0 ? (
            <EmptyText>No file status records were returned.</EmptyText>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto">
              {analysis.graph.nodes.map((node) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-sidebar/50 px-3 py-2"
                  key={node.path}
                >
                  <span className="break-all font-mono text-[10px] text-slate-300">
                    {node.path}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] ${
                      node.present
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
                        : "border-slate-600 bg-slate-800 text-slate-400"
                    }`}
                  >
                    {node.present ? "Present in commit" : "Deleted"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ReportCard>

        <ReportCard icon={<AlertTriangle size={15} />} title="Unresolved imports">
          {analysis.unresolvedImports.length === 0 ? (
            <EmptyText>No unresolved local imports were reported.</EmptyText>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto">
              {analysis.unresolvedImports.map((item, index) => (
                <div
                  className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2"
                  key={`${item.path}:${item.module}:${index}`}
                >
                  <p className="break-all font-mono text-[10px] text-amber-100">
                    {item.path}
                    {" → "}
                    {item.module || "(relative package)"}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {item.reason.replace(/_/g, " ")}
                    {item.level > 0 ? ` · relative level ${item.level}` : ""}
                  </p>
                  {item.candidates.length > 0 && (
                    <p className="mt-1 break-all text-[10px] text-slate-500">
                      Candidates: {item.candidates.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ReportCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportCard icon={<Boxes size={15} />} title="Skipped files & scan coverage">
          {analysis.summary.filesTruncated ||
          analysis.summary.treeEntriesTruncated ? (
            <div className="space-y-2 text-xs leading-relaxed text-amber-100">
              <p>
                The backend reports that scan limits were reached. It does not
                return paths for individual files skipped by these limits, so
                this page does not infer or list them.
              </p>
              <p className="text-[10px] text-amber-100/70">
                Tree entries inspected: {analysis.summary.treeEntriesScanned} ·
                Python files counted: {analysis.summary.pythonFilesScanned} ·
                Bytes read: {analysis.summary.totalBytesRead.toLocaleString()}
              </p>
            </div>
          ) : (
            <EmptyText>
              No skipped files were reported by the configured scan limits.
            </EmptyText>
          )}
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Configured limits
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              {analysis.limits.maxFiles} files · {analysis.limits.maxFileBytes.toLocaleString()}{" "}
              bytes/file · {analysis.limits.maxTotalBytes.toLocaleString()} bytes
              total · {analysis.limits.maxImports.toLocaleString()} imports ·{" "}
              {analysis.limits.maxDepth} traversal levels
            </p>
          </div>
        </ReportCard>

        <ReportCard icon={<AlertTriangle size={15} />} title="Syntax warnings">
          {analysis.syntaxErrors.length === 0 ? (
            <EmptyText>No syntax or source decoding errors were reported.</EmptyText>
          ) : (
            <div className="max-h-80 space-y-2 overflow-auto">
              {analysis.syntaxErrors.map((item, index) => (
                <div
                  className="rounded-lg border border-rose-500/15 bg-rose-500/5 px-3 py-2"
                  key={`${item.path}:${item.line}:${index}`}
                >
                  <p className="break-all font-mono text-[10px] text-rose-100">
                    {item.path}
                    {item.line !== null ? `:${item.line}` : ""}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">{item.message}</p>
                </div>
              ))}
            </div>
          )}
        </ReportCard>
      </div>
    </div>
  );
}

function DependentList({
  items,
  nodeByPath,
  empty,
}: {
  items: ApiCommitDependencies["graph"]["directDependents"];
  nodeByPath: Map<string, ApiCommitDependencies["graph"]["nodes"][number]>;
  empty: string;
}) {
  if (items.length === 0) return <EmptyText>{empty}</EmptyText>;
  return (
    <div className="max-h-80 space-y-2 overflow-auto">
      {items.map((item) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-sidebar/50 px-3 py-2"
          key={item.path}
        >
          <span className="break-all font-mono text-[10px] text-slate-300">
            {item.path}
          </span>
          <span className="rounded-full border border-blue-500/20 bg-blue-500/5 px-2 py-0.5 text-[9px] text-blue-200">
            Depth {item.depth}
            {nodeByPath.get(item.path)?.present === false ? " · deleted" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <p className="py-2 text-xs leading-relaxed text-slate-500">{children}</p>
  );
}
