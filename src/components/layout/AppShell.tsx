import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { Repository } from "../../types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppShellProps {
  children: ReactNode;
  repositories: Repository[];
  selectedRepository: string;
  searchQuery: string;
  onRepositoryChange: (repository: string) => void;
  onSearchChange: (query: string) => void;
}

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/repositories": "Repositories",
  "/commits": "Commit Explorer",
  "/analysis": "Code Analysis",
  "/insights": "AI Insights",
  "/risk": "Risk Center",
  "/settings": "Settings",
};

export function AppShell({
  children,
  repositories,
  selectedRepository,
  searchQuery,
  onRepositoryChange,
  onSearchChange,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-canvas text-slate-100">
      <div className="flex min-h-screen">
        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          onToggle={() => setCollapsed((value) => !value)}
        />
        <div className="min-w-0 flex-1">
          <Topbar
            onOpenMobileNavigation={() => setMobileOpen(true)}
            onRepositoryChange={onRepositoryChange}
            onSearchChange={onSearchChange}
            repositories={repositories}
            searchQuery={searchQuery}
            selectedRepository={selectedRepository}
            title={pageTitles[pathname] ?? "Overview"}
          />
          <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
