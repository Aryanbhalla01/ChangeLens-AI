import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Database,
  FolderGit2,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import packageJson from "../../package.json";
import { getApiOrigin, getHealth } from "../services/api";
import type { ApiHealth, ApiRepository } from "../types";

type HealthState = "checking" | "online" | "degraded" | "offline";

interface SettingsPageProps {
  repositories: ApiRepository[];
  repositoryLoading: boolean;
  repositoryError: string | null;
}

function HealthIndicator({ state }: { state: HealthState }) {
  if (state === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-400/5 px-2.5 py-1 text-[10px] font-medium text-blue-200">
        <LoaderCircle className="animate-spin" size={12} />
        Checking
      </span>
    );
  }
  if (state === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-400/5 px-2.5 py-1 text-[10px] font-medium text-rose-200">
        <AlertCircle size={12} />
        Unavailable
      </span>
    );
  }
  if (state === "degraded") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-[10px] font-medium text-amber-200">
        <AlertCircle size={12} />
        Needs attention
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1 text-[10px] font-medium text-emerald-200">
      <CheckCircle2 size={12} />
      Connected
    </span>
  );
}

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel-card p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-elevated text-cyan">
          <Icon size={15} />
        </span>
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ConfigRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-line/70 py-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
      <span className="shrink-0 text-xs text-slate-400">{label}</span>
      <span className="text-left text-xs font-medium text-slate-200 sm:text-right">
        {value}
        {detail && <span className="mt-1 block font-normal text-slate-500">{detail}</span>}
      </span>
    </div>
  );
}

export function SettingsPage({
  repositories,
  repositoryLoading,
  repositoryError,
}: SettingsPageProps) {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshHealth = useCallback(async () => {
    setRefreshing(true);
    setHealthState("checking");
    try {
      const result = await getHealth();
      setHealth(result);
      setHealthState(result.status === "ok" ? "online" : "degraded");
      setCheckedAt(new Date());
    } catch {
      setHealth(null);
      setHealthState("offline");
      setCheckedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const repositoryCount = repositoryLoading
    ? "Checking"
    : repositoryError
      ? "Unavailable"
      : repositories.length.toLocaleString();
  const repositoryDetail = repositoryError
    ? "Repository list could not be refreshed."
    : "Registered with the connected backend";

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              Settings
            </h2>
            <span className="rounded-full border border-cyan/20 bg-cyan/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan">
              Application
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-500">
            Application details, service health, and the access boundaries used by this
            ChangeLens instance.
          </p>
        </div>
        <button
          className="button-secondary self-start sm:self-auto"
          disabled={refreshing}
          onClick={() => void refreshHealth()}
        >
          <RefreshCw className={refreshing ? "animate-spin" : ""} size={13} />
          Check connection
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <InfoCard icon={Info} title="Application information">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-lg font-semibold tracking-tight text-slate-100">
                ChangeLens AI
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Frontend version {packageJson.version}
              </p>
            </div>
            <HealthIndicator state={healthState} />
          </div>
          <div className="mt-5 border-t border-line/70 pt-1">
            <ConfigRow
              label="Backend application"
              value={health?.application ?? "Unavailable"}
            />
            <ConfigRow
              label="Backend version"
              value={health?.version ?? "Unavailable"}
              detail="Reported by the backend health endpoint"
            />
          </div>
        </InfoCard>

        <InfoCard icon={Server} title="Backend API">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-sidebar/60 p-3.5">
            {healthState === "online" ? (
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={16} />
            ) : healthState === "checking" ? (
              <LoaderCircle className="mt-0.5 shrink-0 animate-spin text-blue-300" size={16} />
            ) : (
              <AlertCircle className="mt-0.5 shrink-0 text-amber-300" size={16} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200">
                {healthState === "online"
                  ? "Health check passed"
                  : healthState === "checking"
                    ? "Checking the health endpoint"
                    : healthState === "degraded"
                      ? `The API reports status “${health?.status ?? "unknown"}”.`
                      : "The health endpoint could not be reached."}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {checkedAt
                  ? `Last checked ${checkedAt.toLocaleTimeString()}`
                  : "Connection status is being verified."}
              </p>
            </div>
          </div>
          {healthState === "offline" && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500" role="status">
              Confirm the backend is running and the API endpoint configuration is correct,
              then check again.
            </p>
          )}
          {healthState === "degraded" && (
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500" role="status">
              The endpoint responded, but did not report its normal healthy status.
            </p>
          )}
        </InfoCard>

        <InfoCard icon={CircleHelp} title="AI provider configuration">
          <div className="flex items-start gap-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3.5">
            <CircleHelp className="mt-0.5 shrink-0 text-amber-200" size={16} />
            <div>
              <p className="text-xs font-medium text-slate-200">
                Configuration status is not reported
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                The health endpoint does not include AI provider configuration, so its
                configured state cannot be verified here. Provider credentials and API keys
                are never displayed.
              </p>
            </div>
          </div>
        </InfoCard>

        <InfoCard icon={ShieldCheck} title="Repository access and privacy">
          <div className="space-y-3 text-[11px] leading-relaxed text-slate-400">
            <p className="flex gap-2.5">
              <FolderGit2 className="mt-0.5 shrink-0 text-cyan" size={14} />
              <span>
                Repository metadata is read through the backend. Local repository access is
                restricted to the backend&apos;s configured allowed roots.
              </span>
            </p>
            <p className="flex gap-2.5">
              <Database className="mt-0.5 shrink-0 text-cyan" size={14} />
              <span>
                Public GitHub repositories connected in the app are cloned into backend-managed
                storage. Repository data and access rules are controlled by that backend.
              </span>
            </p>
            <p className="flex gap-2.5">
              <LockKeyhole className="mt-0.5 shrink-0 text-cyan" size={14} />
              <span>
                The frontend does not receive backend repository allowlists or provider
                credentials.
              </span>
            </p>
          </div>
        </InfoCard>

        <InfoCard icon={Settings2} title="Current configuration">
          <ConfigRow label="Frontend mode" value={import.meta.env.MODE} />
          <ConfigRow
            label="Backend API origin"
            value={getApiOrigin()}
            detail="Credentials and URL query values are not shown"
          />
          <ConfigRow
            label="Registered repositories"
            value={repositoryCount}
            detail={repositoryDetail}
          />
          <ConfigRow
            label="Analysis access"
            value="Read-only"
            detail="Repository connections are managed by the backend"
          />
        </InfoCard>
      </div>
    </div>
  );
}
