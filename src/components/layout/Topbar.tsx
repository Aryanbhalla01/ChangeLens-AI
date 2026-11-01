import {
  Bell,
  ChevronDown,
  Menu,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Repository } from "../../types";

interface TopbarProps {
  title: string;
  repositories: Repository[];
  selectedRepository: string;
  searchQuery: string;
  onRepositoryChange: (repository: string) => void;
  onSearchChange: (query: string) => void;
  onOpenMobileNavigation: () => void;
}

export function Topbar({
  title,
  repositories,
  selectedRepository,
  searchQuery,
  onRepositoryChange,
  onSearchChange,
  onOpenMobileNavigation,
}: TopbarProps) {
  const [openMenu, setOpenMenu] = useState<"repositories" | "notifications" | "user" | null>(
    null,
  );
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  const toggleMenu = (menu: NonNullable<typeof openMenu>) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

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
            aria-label="Search demo activity"
            className="h-9 w-full rounded-lg border border-line bg-sidebar pl-9 pr-10 text-xs text-slate-200 outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search activity..."
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
              {selectedRepository === "all" ? "All repositories" : selectedRepository}
            </span>
            <ChevronDown className="shrink-0 text-slate-500" size={14} />
          </button>
          {openMenu === "repositories" && (
            <div className="popover right-0 w-64 p-1.5">
              <p className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Demo repositories
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
                    onRepositoryChange(repository.fullName);
                    setOpenMenu(null);
                  }}
                >
                  {repository.fullName}
                </button>
              ))}
              <p className="px-2.5 py-2 text-[10px] text-slate-600">
                Demo data · not connected to Git
              </p>
            </div>
          )}
        </div>

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
            aria-expanded={openMenu === "user"}
            aria-label="Open account menu"
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-elevated"
            onClick={() => toggleMenu("user")}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-elevated text-[10px] font-semibold text-slate-300 ring-1 ring-line">
              JD
            </span>
            <ChevronDown className="hidden text-slate-500 sm:block" size={13} />
          </button>
          {openMenu === "user" && (
            <div className="popover right-0 w-52 p-1.5">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <UserRound className="text-slate-500" size={15} />
                <div>
                  <p className="text-xs font-medium text-slate-200">Jordan Developer</p>
                  <p className="text-[10px] text-slate-500">Preview account</p>
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
          aria-label="Search demo activity"
          className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search demo activity..."
          ref={mobileSearchRef}
          type="search"
          value={searchQuery}
        />
      </div>
    </header>
  );
}
