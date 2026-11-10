import type {
  ApiCommitDetail,
  ApiCommitPage,
  ApiAISummary,
  ApiCommitRisk,
  ApiCommitDependencies,
  ApiComparison,
  ApiFailure,
  ApiHealth,
  ApiRepository,
  ApiRepositoryStatus,
  ApiSuccess,
} from "../types";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:5000";

export function getApiOrigin(): string {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return "Custom endpoint configured";
  }
}

function isSuccessEnvelope<T>(value: unknown): value is ApiSuccess<T> {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.success === true && "data" in record;
}

function isFailureEnvelope(value: unknown): value is ApiFailure {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const error = record.error;
  return (
    record.success === false &&
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      `Could not reach the ChangeLens API at ${apiBaseUrl}. Check that the backend is running and VITE_API_BASE_URL is correct.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`The API returned an invalid response (${response.status}).`);
  }

  if (isFailureEnvelope(body)) {
    throw new Error(body.error.message);
  }
  if (!isSuccessEnvelope<T>(body)) {
    throw new Error(`The API returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`API request failed (${response.status} ${response.statusText}).`);
  }

  return body.data;
}

export function getHealth(): Promise<ApiHealth> {
  return request<ApiHealth>("/api/health");
}

export function getRepositories(): Promise<ApiRepository[]> {
  return request<ApiRepository[]>("/api/repositories");
}

export function connectPublicRepository(url: string): Promise<ApiRepository> {
  return request<ApiRepository>("/api/repositories/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

export function getRepository(id: string): Promise<ApiRepository> {
  return request<ApiRepository>(`/api/repositories/${encodeURIComponent(id)}`);
}

export function getRepositoryStatus(id: string): Promise<ApiRepositoryStatus> {
  return request<ApiRepositoryStatus>(
    `/api/repositories/${encodeURIComponent(id)}/status`,
  );
}

export function getCommits(
  id: string,
  options: { page?: number; perPage?: number; search?: string; branch?: string } = {},
): Promise<ApiCommitPage> {
  const params = new URLSearchParams();
  if (options.page !== undefined) params.set("page", String(options.page));
  if (options.perPage !== undefined) params.set("per_page", String(options.perPage));
  if (options.search) params.set("search", options.search);
  if (options.branch) params.set("branch", options.branch);
  const query = params.toString();
  return request<ApiCommitPage>(
    `/api/repositories/${encodeURIComponent(id)}/commits${query ? `?${query}` : ""}`,
  );
}

export function getCommitDetails(
  id: string,
  hash: string,
): Promise<ApiCommitDetail> {
  return request<ApiCommitDetail>(
    `/api/repositories/${encodeURIComponent(id)}/commits/${encodeURIComponent(hash)}`,
  );
}

export function getCommitSummary(
  id: string,
  hash: string,
): Promise<ApiAISummary> {
  return request<ApiAISummary>(
    `/api/repositories/${encodeURIComponent(id)}/commits/${encodeURIComponent(hash)}/summary`,
  );
}

export function getCommitRisk(
  repositoryId: string,
  commitHash: string,
): Promise<ApiCommitRisk> {
  return request<ApiCommitRisk>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/commits/${encodeURIComponent(commitHash)}/risk`,
  );
}

export function getCommitDependencies(
  repositoryId: string,
  commitHash: string,
): Promise<ApiCommitDependencies> {
  return request<ApiCommitDependencies>(
    `/api/repositories/${encodeURIComponent(repositoryId)}/commits/${encodeURIComponent(commitHash)}/dependencies`,
  );
}

export function compareCommits(
  id: string,
  base: string,
  target: string,
): Promise<ApiComparison> {
  const params = new URLSearchParams({ base, target });
  return request<ApiComparison>(
    `/api/repositories/${encodeURIComponent(id)}/compare?${params.toString()}`,
  );
}
