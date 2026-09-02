import { cn } from "@/lib/utils";

export function Panel({
  title,
  hint,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  hint?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {(title || actions) && (
        <header className="etched flex items-center gap-3 px-4 py-2.5">
          <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
          {hint && <span className="rail-label">{hint}</span>}
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="rail-label">{label}</div>
      <div className="num mt-1.5 text-xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Confidence({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.85 ? "bg-ok" : value >= 0.7 ? "bg-warn" : "bg-risk";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={`Confidence ${pct}%`}>
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-etch">
        <span className={cn("absolute inset-y-0 left-0", tone)} style={{ width: `${pct}%` }} />
      </span>
      <span className="num text-[11px] text-muted-foreground">{pct}%</span>
    </span>
  );
}

const TONES = {
  neutral: "border-border bg-secondary text-muted-foreground",
  signal: "border-signal/40 bg-signal-soft text-signal",
  ok: "border-ok/40 bg-ok-soft text-ok",
  warn: "border-warn/40 bg-warn-soft text-warn",
  risk: "border-risk/40 bg-risk-soft text-risk",
} as const;

export function Tag({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const inr = (n: number | null | undefined, digits = 2) =>
  n == null
    ? "—"
    : n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
