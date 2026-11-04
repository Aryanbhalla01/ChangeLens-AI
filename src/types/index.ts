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
