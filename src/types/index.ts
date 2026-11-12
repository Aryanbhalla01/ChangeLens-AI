export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface ApiHealth {
  status: string;
  application: string;
  version: string;
}

export interface ApiCommitSummary {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  branch: string | null;
  changedFileCount: number | null;
  insertions: number | null;
  deletions: number | null;
  statsAvailable: boolean;
}

export interface ApiRepository {
  id: string;
  name: string;
  path: string;
  branch: string | null;
  latestCommit: {
    hash: string;
    shortHash: string;
    author: string;
    date: string;
    message: string;
  } | null;
  commitCount: number;
  commitCountTruncated: boolean;
  createdAt: string;
}

export interface ApiRepositoryStatus {
  id: string;
  branch: string | null;
  isDirty: boolean;
  stagedFileCount: number;
  modifiedFileCount: number;
  untrackedFileCount: number;
  untrackedFileCountTruncated: boolean;
  commitCount: number;
  commitCountTruncated: boolean;
}

export interface ApiCommitPage {
  items: ApiCommitSummary[];
  pagination: {
    page: number;
    perPage: number;
    total: number | null;
    hasMore: boolean;
    truncated: boolean;
  };
}

export interface ApiCommitFile {
  path: string;
  previousPath: string | null;
  changeType: "added" | "modified" | "deleted" | "renamed";
}

export interface ApiCommitDetail extends ApiCommitSummary {
  parents: Array<{
    hash: string;
    shortHash: string;
    message: string;
  }>;
  files: ApiCommitFile[];
  addedFiles: ApiCommitFile[];
  modifiedFiles: ApiCommitFile[];
  deletedFiles: ApiCommitFile[];
  renamedFiles: ApiCommitFile[];
  filesTruncated: boolean;
}

export interface ApiCommitInsightFile {
  path: string;
  previousPath: string | null;
  changeType: "added" | "modified" | "deleted" | "renamed";
  additions: number | null;
  deletions: number | null;
}

export interface ApiStaticAnalysisFinding {
  ruleId: string;
  title: string;
  severity: string;
  path: string;
  previousPath: string | null;
  lineNumber: number;
  lineSide: "new" | "old";
  change: "added" | "deleted";
  findingDisposition: "introduced" | "removed";
  explanation: string;
  evidence: string;
  evidenceTruncated: boolean;
}

export interface ApiCommitInsights {
  available: boolean;
  summary: string;
  whatChanged: string | null;
  whyItMatters: string | null;
  importantFiles: string[];
  suggestedReviewChecks: string[];
  source: "local_rules";
  label: string;
  commitMessage: string;
  author: string;
  filesChanged: ApiCommitInsightFile[];
  statistics: {
    changedFileCount: number | null;
    insertions: number | null;
    deletions: number | null;
    addedFileCount: number;
    modifiedFileCount: number;
    deletedFileCount: number;
    renamedFileCount: number;
    filesTruncated: boolean;
    diffTruncated: boolean;
  };
  riskFindings: ApiStaticAnalysisFinding[];
  findingsTruncated: boolean;
}

export type ApiRiskClassification = "low" | "moderate" | "high" | "critical";

export interface ApiRiskPathCategory {
  name: string;
  score: number;
  matchedPaths: string[];
}

interface ApiRiskFactorBase {
  score: number;
  maxScore: number;
  explanation: string;
}

export type ApiRiskFactor =
  | (ApiRiskFactorBase & {
      name: "changedFiles";
      value: number;
    })
  | (ApiRiskFactorBase & {
      name: "changedLines";
      additions: number;
      deletions: number;
      unavailableFileCount: number;
    })
  | (ApiRiskFactorBase & {
      name: "sensitivePaths";
      categories: ApiRiskPathCategory[];
    })
  | (ApiRiskFactorBase & {
      name: "staticFindings";
      severityCounts: Partial<Record<"critical" | "error" | "warning" | "notice" | "info", number>>;
      removedFindingsExcluded: number;
    });

export interface ApiCommitRisk {
  commit: ApiCommitSummary;
  baseCommit: ApiCommitSummary | null;
  score: number;
  classification: ApiRiskClassification;
  heuristic: true;
  disclaimer: string;
  factors: ApiRiskFactor[];
  limitations: string[];
  limits: {
    maxFiles: number;
    maxDiffResponseBytes: number;
    maxChangedLines: number;
    maxFindings: number;
  };
}

export interface ApiDependencyGraphNode {
  path: string;
  module: string;
  present: boolean;
}

export interface ApiDependencyGraphEdge {
  from: string;
  to: string;
}

export interface ApiDependency {
  path: string;
  depth: number;
}

export interface ApiDependencySyntaxError {
  path: string;
  line: number | null;
  message: string;
}

export type ApiUnresolvedImportReason =
  | "relative_import_outside_package"
  | "ambiguous_local_module"
  | "ambiguous_imported_name"
  | "not_found_in_commit";

export interface ApiUnresolvedImport {
  path: string;
  module: string;
  level: number;
  reason: ApiUnresolvedImportReason;
  candidates: string[];
}

export interface ApiCommitDependencies {
  commit: ApiCommitSummary;
  baseCommit: ApiCommitSummary | null;
  baseStrategy: "first_parent" | "empty_tree";
  changedFiles: string[];
  graph: {
    nodes: ApiDependencyGraphNode[];
    edges: ApiDependencyGraphEdge[];
    directDependents: ApiDependency[];
    indirectDependents: ApiDependency[];
  };
  syntaxErrors: ApiDependencySyntaxError[];
  unresolvedImports: ApiUnresolvedImport[];
  summary: {
    pythonFilesScanned: number;
    treeEntriesScanned: number;
    totalBytesRead: number;
    parsedFiles: number;
    syntaxErrorCount: number;
    unresolvedImportCount: number;
    directDependentCount: number;
    indirectDependentCount: number;
    treeEntriesTruncated: boolean;
    filesTruncated: boolean;
    changedFilesTruncated: boolean;
    importsTruncated: boolean;
    edgesTruncated: boolean;
    graphTruncated: boolean;
    nodesTruncated: boolean;
    truncated: boolean;
  };
  limits: {
    maxTreeEntries: number;
    maxFiles: number;
    maxFileBytes: number;
    maxTotalBytes: number;
    maxNodes: number;
    maxEdges: number;
    maxImports: number;
    maxDepth: number;
    maxResults: number;
  };
}

export interface ApiCompareFile {
  path: string;
  previousPath: string | null;
  changeType: "added" | "modified" | "deleted" | "renamed";
  additions: number | null;
  deletions: number | null;
  binary: boolean;
  truncated: boolean;
  diff: string;
}

export interface ApiComparison {
  baseCommit: ApiCommitSummary;
  targetCommit: ApiCommitSummary;
  files: ApiCompareFile[];
  filesTruncated: boolean;
  diffTruncated: boolean;
  limits: {
    maxFiles: number;
    maxDiffResponseBytes: number;
  };
}

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  language: string;
  connectionStatus: "connected" | "demo";
  lastActivity: string;
}

export interface Commit {
  id: string;
  shortId: string;
  message: string;
  author: string;
  authoredAt: string;
  branch: string;
  repositoryId: string;
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  riskLevel?: RiskLevel;
}

export interface DiffResult {
  baseCommit: string;
  headCommit: string;
  files: FileChange[];
  additions: number;
  deletions: number;
}

export interface RiskAnalysis {
  score: number;
  level: RiskLevel;
  factors: Array<{ label: string; contribution: number }>;
  generatedAt: string;
  isDemo: boolean;
}

export interface AIInsight {
  id: string;
  summary: string;
  suggestedChecks: string[];
  generatedAt: string;
  isDemo: boolean;
}

export interface DashboardStatistics {
  totalRepositories: number;
  commitsAnalyzed: number;
  changesReviewed: number;
  highRiskChanges: number;
}

export interface CommitActivityPoint {
  day: string;
  commits: number;
  changes: number;
}

export interface RiskDistributionPoint {
  level: RiskLevel;
  count: number;
}

export interface RecentActivity {
  id: string;
  repository: string;
  action: string;
  detail: string;
  time: string;
  riskLevel: RiskLevel;
}

export interface RecentAnalysis {
  id: string;
  repository: string;
  title: string;
  branch: string;
  time: string;
  riskScore: number;
  riskLevel: RiskLevel;
  filesChanged: number;
  isDemo: boolean;
}

export interface OverviewDashboardData {
  statistics: DashboardStatistics;
  commitActivity: CommitActivityPoint[];
  riskDistribution: RiskDistributionPoint[];
  recentActivity: RecentActivity[];
  recentAnalyses: RecentAnalysis[];
  repositories: Repository[];
}
