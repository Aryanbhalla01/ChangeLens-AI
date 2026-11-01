export type RiskLevel = "low" | "medium" | "high" | "critical";

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
