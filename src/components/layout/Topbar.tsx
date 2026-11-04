import {
  Bell,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Menu,
  Search,
  Settings,
  Laptop,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ApiRepository } from "../../types";

interface TopbarProps {
  title: string;
  repositories: ApiRepository[];
  selectedRepository: string;
  searchQuery: string;
  repositoryLoading: boolean;
  connectionState: "checking" | "online" | "offline";
  onRepositoryChange: (repository: string) => void;
  onSearchChange: (query: string) => void;
  onOpenMobileNavigation: () => void;
  onRetry: () => void;
}

export function Topbar({
  title,
  repositories,
  selectedRepository,
  searchQuery,
  repositoryLoading,
  connectionState,
  onRepositoryChange,
  onSearchChange,
  onOpenMobileNavigation,
  onRetry,
}: TopbarProps) {
  const [openMenu, setOpenMenu] = useState<"repositories" | "notifications" | "workspace" | null>(
    null,
  );
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  const toggleMenu = (menu: NonNullable<typeof openMenu>) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };
  const selectedRepositoryName =
    repositories.find((repository) => repository.id === selectedRepository)?.name ??
    "All repositories";
  const ConnectionIcon =
    connectionState === "online"
      ? CircleCheck
      : connectionState === "offline"
        ? CircleAlert
        : CircleHelp;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const searchRef = window.matchMedia("(min-width: 768px)").matches
          ? desktopSearchRef
          : mobileSearchRef;
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur-xl">
      <div className="flex min-h-[72px] items-center gap-4 px-4 sm:px-7">
        <button
          aria-label="Open navigation"
          className="rounded-lg p-2 text-slate-400 hover:bg-elevated hover:text-white lg:hidden"
          onClick={onOpenMobileNavigation}
        >
          <Menu size={19} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">Workspace</span>
            <span className="hidden text-slate-700 sm:inline">/</span>
            <span className="truncate text-slate-200">{title}</span>
          </div>
          <h1 className="mt-0.5 truncate text-base font-semibold tracking-tight text-slate-100">
            {title}
          </h1>
        </div>

        <div className="relative hidden w-[220px] md:block xl:w-[260px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            size={15}
          />
          <input
            aria-label="Search repositories and commits"
            className="h-9 w-full rounded-lg border border-line bg-sidebar pl-9 pr-10 text-xs text-slate-200 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search repositories and commits..."
            ref={desktopSearchRef}
            type="search"
            value={searchQuery}
          />
          <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-slate-500">
            Ctrl K
          </span>
        </div>

        <div className="relative">
          <button
            aria-expanded={openMenu === "repositories"}
            aria-label="Select repository"
            className="flex h-9 max-w-[190px] items-center gap-2 rounded-lg border border-line bg-sidebar px-3 text-xs text-slate-300 hover:border-slate-600"
            onClick={() => toggleMenu("repositories")}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" />
            <span className="truncate">
              {selectedRepository === "all" ? "All repositories" : selectedRepositoryName}
            </span>
            <ChevronDown className="shrink-0 text-slate-500" size={14} />
          </button>
          {openMenu === "repositories" && (
            <div className="popover right-0 w-64 p-1.5">
              <p className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Local repositories
              </p>
              <button
                className="menu-item w-full"
                onClick={() => {
                  onRepositoryChange("all");
                  setOpenMenu(null);
                }}
              >
                All repositories
              </button>
              {repositories.map((repository) => (
                <button
                  className="menu-item w-full"
                  key={repository.id}
                  onClick={() => {
                    onRepositoryChange(repository.id);
                    setOpenMenu(null);
                  }}
                >
                  {repository.name}
                </button>
              ))}
              {repositoryLoading ? (
                <p className="px-2.5 py-2 text-[10px] text-slate-500">Loading repositories…</p>
              ) : repositories.length === 0 ? (
                <p className="px-2.5 py-2 text-[10px] leading-relaxed text-slate-500">
                  No registered repositories found.
                </p>
              ) : null}
              <div className="my-1 border-t border-line" />
              <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <ConnectionIcon
                    className={
                      connectionState === "online"
                        ? "text-emerald-400"
                        : connectionState === "offline"
                          ? "text-rose-400"
                          : "text-slate-500"
                    }
                    size={12}
                  />
                  API {connectionState}
                </span>
                <button className="text-[10px] text-blue-300 hover:text-blue-200" onClick={onRetry}>
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>

        <span
          aria-label={`API ${connectionState}`}
          className={`hidden h-2 w-2 rounded-full md:block ${
            connectionState === "online"
              ? "bg-emerald-400"
              : connectionState === "offline"
                ? "bg-rose-400"
                : "bg-slate-500"
          }`}
          title={`API ${connectionState}`}
        />

        <div className="relative">
          <button
            aria-expanded={openMenu === "notifications"}
            aria-label="Notifications"
            className="relative rounded-lg p-2 text-slate-400 hover:bg-elevated hover:text-slate-100"
            onClick={() => toggleMenu("notifications")}
          >
            <Bell size={17} />
          </button>
          {openMenu === "notifications" && (
            <div className="popover right-0 w-72 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-100">Notifications</p>
                <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-slate-500">
                  Preview
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Notifications are not connected in this frontend preview.
              </p>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            aria-expanded={openMenu === "workspace"}
            aria-label="Open workspace menu"
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-elevated"
            onClick={() => toggleMenu("workspace")}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-elevated text-[10px] font-semibold text-slate-300 ring-1 ring-line">
              CL
            </span>
            <ChevronDown className="hidden text-slate-500 sm:block" size={13} />
          </button>
          {openMenu === "workspace" && (
            <div className="popover right-0 w-52 p-1.5">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <Laptop className="text-slate-500" size={15} />
                <div>
                  <p className="text-xs font-medium text-slate-200">Local workspace</p>
                  <p className="text-[10px] text-slate-500">ChangeLens API</p>
                </div>
              </div>
              <div className="my-1 border-t border-line" />
              <Link
                className="menu-item flex w-full items-center gap-2"
                onClick={() => setOpenMenu(null)}
                to="/settings"
              >
                <Settings size={14} /> Settings
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line/60 px-4 py-2 md:hidden">
        <Search className="shrink-0 text-slate-500" size={14} />
        <input
          aria-label="Search repositories and commits"
          className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search repositories and commits..."
          ref={mobileSearchRef}
          type="search"
          value={searchQuery}
        />
      </div>
    </header>
  );
}
