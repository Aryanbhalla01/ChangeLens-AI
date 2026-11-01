import {
  Activity,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  GitCommitHorizontal,
  GitFork,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { NavLink } from "react-router-dom";

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onCloseMobile: () => void;
}

const navigation = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Repositories", path: "/repositories", icon: GitFork },
  { label: "Commit Explorer", path: "/commits", icon: GitCommitHorizontal },
  { label: "Code Analysis", path: "/analysis", icon: Activity },
  { label: "AI Insights", path: "/insights", icon: Sparkles },
  { label: "Risk Center", path: "/risk", icon: ShieldAlert },
];

export function Sidebar({
  collapsed,
  mobileOpen,
  onToggle,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-sidebar transition-transform duration-200 lg:static lg:z-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-[76px]" : "lg:w-[248px]"}`}
      >
        <div
          className={`flex h-[72px] items-center border-b border-line px-5 ${
            collapsed ? "lg:justify-center lg:px-0" : "justify-between"
          }`}
        >
          <NavLink
            aria-label="ChangeLens AI home"
            className="flex items-center gap-3 overflow-hidden"
            onClick={onCloseMobile}
            to="/"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <span className="text-sm font-bold tracking-tight">CL</span>
            </span>
            <span className={`whitespace-nowrap ${collapsed ? "lg:hidden" : ""}`}>
              <span className="block text-sm font-semibold text-slate-100">
                ChangeLens
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                AI workspace
              </span>
            </span>
          </NavLink>
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`hidden rounded-lg p-1.5 text-slate-500 hover:bg-elevated hover:text-slate-200 lg:block ${
              collapsed ? "lg:hidden" : ""
            }`}
            onClick={onToggle}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {collapsed && (
          <button
            aria-label="Expand sidebar"
            className="mx-auto mt-4 hidden rounded-lg p-2 text-slate-500 hover:bg-elevated hover:text-slate-200 lg:block"
            onClick={onToggle}
          >
            <ChevronRight size={16} />
          </button>
        )}

        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3 py-6">
          <p
            className={`mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 ${
              collapsed ? "lg:hidden" : ""
            }`}
          >
            Workspace
          </p>
          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              aria-label={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-blue-300"
                    : "text-slate-400 hover:bg-elevated/70 hover:text-slate-100"
                } ${collapsed ? "lg:justify-center lg:px-0" : ""}`
              }
              onClick={onCloseMobile}
              title={collapsed ? label : undefined}
              to={path}
            >
              <Icon className="shrink-0" size={17} strokeWidth={1.8} />
              <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
              {path === "/" && (
                <span
                  className={`ml-auto h-1.5 w-1.5 rounded-full bg-primary ${
                    collapsed ? "lg:hidden" : ""
                  }`}
                />
              )}
            </NavLink>
          ))}
          <div className="my-5 border-t border-line" />
          <NavLink
            aria-label={collapsed ? "Settings" : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-blue-300"
                  : "text-slate-400 hover:bg-elevated/70 hover:text-slate-100"
              } ${collapsed ? "lg:justify-center lg:px-0" : ""}`
            }
            onClick={onCloseMobile}
            title={collapsed ? "Settings" : undefined}
            to="/settings"
          >
            <Settings className="shrink-0" size={17} strokeWidth={1.8} />
            <span className={collapsed ? "lg:hidden" : ""}>Settings</span>
          </NavLink>
        </nav>

        <div className={`border-t border-line p-4 ${collapsed ? "lg:px-2" : ""}`}>
          <div
            className={`rounded-xl border border-line bg-surface p-3 ${
              collapsed ? "lg:hidden" : ""
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <BookOpenCheck className="text-cyan" size={15} />
              Frontend preview
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Sample workspace data only. No repositories are connected.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
