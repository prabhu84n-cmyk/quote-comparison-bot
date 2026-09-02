import { Link, useRouterState } from "@tanstack/react-router";
import { FileText, Inbox, Table2, MessagesSquare, CircleDot } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { vendors } from "@/data/vendors";

const NAV = [
  { to: "/", label: "RFQ", icon: FileText, step: "01" },
  { to: "/inbox", label: "Inbox", icon: Inbox, step: "02" },
  { to: "/compare", label: "Comparison", icon: Table2, step: "03" },
  { to: "/analyst", label: "Analyst", icon: MessagesSquare, step: "04" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { extractions, busy } = useWorkspace();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 etched bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-6 px-4">
          <div className="flex items-center gap-3">
            <div className="grid size-7 place-items-center rounded-sm border border-border bg-[image:var(--gradient-chrome)]">
              <CircleDot className="size-3.5 text-signal" />
            </div>
            <div className="leading-none">
              <div className="text-[13px] font-semibold tracking-tight">Sourcing Desk</div>
              <div className="rail-label mt-1">RFQ workspace</div>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {NAV.map((n) => {
              const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={[
                    "group relative flex items-center gap-2 rounded-sm px-3 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  ].join(" ")}
                >
                  <span className="rail-label opacity-60">{n.step}</span>
                  <n.icon className="size-3.5" />
                  {n.label}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-px h-px bg-[image:var(--gradient-signal)]" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <div className="hidden items-center gap-2 md:flex">
              <span className="rail-label">Quotes parsed</span>
              <span className="num text-[13px] text-foreground">
                {extractions.length}
                <span className="text-muted-foreground">/{vendors.length}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-sm border border-border bg-chassis px-2.5 py-1">
              <span
                className={[
                  "size-1.5 rounded-full",
                  busy ? "bg-warn blip" : extractions.length ? "bg-ok" : "bg-muted-foreground",
                ].join(" ")}
              />
              <span className="rail-label">{busy ? "Extracting" : extractions.length ? "Ready" : "Idle"}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-6">{children}</main>
    </div>
  );
}
