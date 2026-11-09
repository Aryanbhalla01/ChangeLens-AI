import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AIInsights } from "./pages/AIInsights";
import { Analysis } from "./pages/Analysis";
import { CommitExplorer } from "./pages/CommitExplorer";
import { Overview } from "./pages/Overview";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RepositoriesPage } from "./pages/RepositoriesPage";
import { RiskCenter } from "./pages/RiskCenter";
import {
  connectPublicRepository,
  getHealth,
  getRepositories,
  getRepository,
  getRepositoryStatus,
} from "./services/api";
import type { ApiRepository, ApiRepositoryStatus } from "./types";

type ConnectionState = "checking" | "online" | "offline";

function AppContent() {
  const [repositories, setRepositories] = useState<ApiRepository[]>([]);
  const [repositoryLoading, setRepositoryLoading] = useState(true);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [selectedRepository, setSelectedRepository] = useState("all");
  const [selectedRepositoryDetails, setSelectedRepositoryDetails] =
    useState<ApiRepository | null>(null);
  const [selectedRepositoryStatus, setSelectedRepositoryStatus] =
    useState<ApiRepositoryStatus | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsRefresh, setDetailsRefresh] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const loadRepositories = useCallback(async () => {
    setRepositoryLoading(true);
    setRepositoryError(null);
    setConnectionState("checking");
    const [healthResult, repositoriesResult] = await Promise.allSettled([
      getHealth(),
      getRepositories(),
    ]);

    if (
      healthResult.status === "fulfilled" ||
      repositoriesResult.status === "fulfilled"
    ) {
      setConnectionState("online");
    } else {
      setConnectionState("offline");
    }

    if (repositoriesResult.status === "fulfilled") {
      setRepositories(repositoriesResult.value);
    } else {
      setRepositoryError(
        repositoriesResult.reason instanceof Error
          ? repositoriesResult.reason.message
          : "Repositories could not be loaded.",
      );
    }
    setRepositoryLoading(false);
  }, []);

  useEffect(() => {
    void loadRepositories();
  }, [loadRepositories]);

  useEffect(() => {
    if (
      !repositoryLoading &&
      selectedRepository !== "all" &&
      !repositories.some((repository) => repository.id === selectedRepository)
    ) {
      setSelectedRepository("all");
    }
  }, [repositories, repositoryLoading, selectedRepository]);

  useEffect(() => {
    if (selectedRepository === "all") {
      setSelectedRepositoryDetails(null);
      setSelectedRepositoryStatus(null);
      setDetailsError(null);
      setDetailsLoading(false);
      return;
    }

    let active = true;
    setSelectedRepositoryDetails(null);
    setSelectedRepositoryStatus(null);
    setDetailsLoading(true);
    setDetailsError(null);
    void Promise.all([
      getRepository(selectedRepository),
      getRepositoryStatus(selectedRepository),
    ])
      .then(([details, status]) => {
        if (!active) return;
        setSelectedRepositoryDetails(details);
        setSelectedRepositoryStatus(status);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setDetailsError(
          requestError instanceof Error
            ? requestError.message
            : "Repository details could not be loaded.",
        );
        setSelectedRepositoryDetails(null);
        setSelectedRepositoryStatus(null);
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedRepository, detailsRefresh]);

  const retrySelectedData = useCallback(() => {
    void loadRepositories();
    setDetailsRefresh((value) => value + 1);
  }, [loadRepositories]);

  const handleConnectRepository = useCallback(
    async (url: string) => {
      const repository = await connectPublicRepository(url);
      await loadRepositories();
      setSelectedRepository(repository.id);
    },
    [loadRepositories],
  );

  return (
    <AppShell
      connectionState={connectionState}
      onRepositoryChange={setSelectedRepository}
      onRetry={() => void loadRepositories()}
      onSearchChange={setSearchQuery}
      repositories={repositories}
      repositoryLoading={repositoryLoading}
      searchQuery={searchQuery}
      selectedRepository={selectedRepository}
    >
      <Routes>
        <Route
          element={
            <Overview
              connectionState={connectionState}
              detailsError={detailsError}
              detailsLoading={detailsLoading}
              onRetry={retrySelectedData}
              onSelectRepository={setSelectedRepository}
              repositories={repositories}
              repositoryError={repositoryError}
              repositoryLoading={repositoryLoading}
              searchQuery={searchQuery}
              selectedRepository={selectedRepository}
              selectedRepositoryDetails={selectedRepositoryDetails}
              selectedRepositoryStatus={selectedRepositoryStatus}
            />
          }
          path="/"
        />
        <Route
          element={
            <RepositoriesPage
              detailsError={detailsError}
              detailsLoading={detailsLoading}
              onRetry={retrySelectedData}
              onConnectRepository={handleConnectRepository}
              onSelectRepository={setSelectedRepository}
              repositories={repositories}
              repositoryError={repositoryError}
              repositoryLoading={repositoryLoading}
              selectedRepository={selectedRepository}
              selectedRepositoryStatus={selectedRepositoryStatus}
            />
          }
          path="/repositories"
        />
        <Route
          element={
            <CommitExplorer
              repositories={repositories}
              searchQuery={searchQuery}
              selectedRepository={selectedRepository}
              selectedRepositoryDetails={selectedRepositoryDetails}
            />
          }
          path="/commits"
        />
        <Route
          element={
            <Analysis
              onSelectRepository={setSelectedRepository}
              repositories={repositories}
              repositoryError={repositoryError}
              repositoryLoading={repositoryLoading}
              selectedRepository={selectedRepository}
            />
          }
          path="/analysis"
        />
        <Route
          element={
            <AIInsights
              onSelectRepository={setSelectedRepository}
              repositories={repositories}
              repositoryError={repositoryError}
              repositoryLoading={repositoryLoading}
              selectedRepository={selectedRepository}
            />
          }
          path="/insights"
        />
        <Route
          element={
            <RiskCenter
              onSelectRepository={setSelectedRepository}
              repositories={repositories}
              repositoryError={repositoryError}
              repositoryLoading={repositoryLoading}
              selectedRepository={selectedRepository}
            />
          }
          path="/risk"
        />
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
