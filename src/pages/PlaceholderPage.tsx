import { ArrowLeft, Construction } from "lucide-react";
import { Link } from "react-router-dom";

interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section className="panel-card flex min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-elevated text-slate-400">
        <Construction size={21} />
      </span>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.17em] text-cyan">
        Not implemented
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-100">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        {title === "Local Commit Insights" || title === "Risk Center"
          ? "Local commit insights and risk scoring are available in their dedicated views."
          : `${title} is not available in this milestone. Repository, status, commit history, and comparison data are available in the implemented views.`}
      </p>
      <Link className="button-secondary mt-6" to="/">
        <ArrowLeft size={14} /> Back to overview
      </Link>
    </section>
  );
}
