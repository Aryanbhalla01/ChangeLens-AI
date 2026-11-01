import { demoMode, demoOverview } from "../data/demo";
import type { OverviewDashboardData } from "../types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

async function request<T>(path: string): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL is not configured.");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API request failed (${response.status} ${response.statusText}).`);
  }

  return (await response.json()) as T;
}

export async function getOverviewDashboard(): Promise<OverviewDashboardData> {
  if (demoMode) {
    return demoOverview;
  }

  return request<OverviewDashboardData>("/api/overview");
}
