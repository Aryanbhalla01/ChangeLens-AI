import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Overview } from "./pages/Overview";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { getOverviewDashboard } from "./services/api";
import type { OverviewDashboardData } from "./types";

function AppContent() {
  const [data, setData] = useState<OverviewDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepository, setSelectedRepository] = useState("all");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOverviewDashboard());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "An unexpected error occurred while loading the overview.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <AppShell
      onRepositoryChange={setSelectedRepository}
      onSearchChange={setSearchQuery}
      repositories={data?.repositories ?? []}
      searchQuery={searchQuery}
      selectedRepository={selectedRepository}
    >
      <Routes>
        <Route
          element={
            <Overview
              data={data}
              error={error}
              loading={loading}
              onRetry={() => void loadOverview()}
              searchQuery={searchQuery}
              selectedRepository={selectedRepository}
            />
          }
          path="/"
        />
        <Route element={<PlaceholderPage title="Repositories" />} path="/repositories" />
        <Route element={<PlaceholderPage title="Commit Explorer" />} path="/commits" />
        <Route element={<PlaceholderPage title="Code Analysis" />} path="/analysis" />
        <Route element={<PlaceholderPage title="AI Insights" />} path="/insights" />
        <Route element={<PlaceholderPage title="Risk Center" />} path="/risk" />
        <Route element={<PlaceholderPage title="Settings" />} path="/settings" />
        <Route element={<PlaceholderPage title="Page not found" />} path="*" />
      </Routes>
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
