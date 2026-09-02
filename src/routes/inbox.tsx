import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  FileSpreadsheet,
  FileText,
  FileType2,
  Image as ImageIcon,
  Mail,
  Loader2,
  Play,
  RotateCcw,
  Check,
  AlertCircle,
} from "lucide-react";
import { vendors } from "@/data/vendors";
import { rfq } from "@/data/rfq";
import { useWorkspace } from "@/state/workspace";
import { Button } from "@/components/ui/button";
import { Panel, Tag, Confidence } from "@/components/Primitives";
import type { SourceKind } from "@/lib/types";

export const Route = createFileRoute("/inbox")({
  validateSearch: (search: Record<string, unknown>) =>
    ({ rfq: typeof search["rfq"] === "string" && search["rfq"] ? search["rfq"] : rfq.id }) as {
      rfq?: string;
    },
  head: () => ({
    meta: [
      { title: "Vendor Inbox — Quote Ingestion" },
      {
        name: "description",
        content:
          "Five vendor quotes in five different formats — spreadsheet, PDF, Word, a phone photo and a plain email — read and structured by AI.",
      },
      { property: "og:title", content: "Vendor Inbox — Quote Ingestion" },
      {
        property: "og:description",
        content: "Heterogeneous vendor quote formats normalised into one structured model.",
      },
    ],
  }),
  component: InboxPage,
});

const ICONS: Record<SourceKind, typeof Mail> = {
  xlsx: FileSpreadsheet,
  pdf: FileText,
  docx: FileType2,
  image: ImageIcon,
  email: Mail,
};

function InboxPage() {
  const { rfq: rfqId = rfq.id } = Route.useSearch();
  const { states, extractions, runVendor, runAll, resetAll, busy } = useWorkspace();
  const rfqVendors = rfqId === rfq.id ? vendors : [];
  const [open, setOpen] = useState<string>(vendors[0]!.id);
  const active = rfqVendors.find((v) => v.id === open) ?? rfqVendors[0];
  const activeExtraction = active ? extractions.find((e) => e.vendorId === active.id) : undefined;
  const ActiveIcon = active ? ICONS[active.kind] : Mail;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rail-label">Step 02 · Ingestion · {rfqId}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Vendor inbox</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Mailbox and storage are mocked. The attachments are real files, and the AI reads them as they
            arrived — no templates, no vendor portal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/rfq/$id" params={{ id: rfqId }}>
              Back to RFQ
            </Link>
          </Button>
          {rfqVendors.length > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={resetAll} disabled={busy}>
                <RotateCcw className="size-4" /> Reset
              </Button>
              <Button onClick={() => void runAll()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Extract all quotes
              </Button>
              {extractions.length > 0 && (
                <Button variant="secondary" asChild>
                  <Link to="/compare">
                    Comparison <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {rfqVendors.length === 0 ? (
        <Panel title="Inbox" hint="0 messages">
          <div className="grid min-h-[40vh] place-items-center p-10 text-center">
            <div>
              <Mail className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-4 text-base font-semibold tracking-tight">No responses received for this RFQ</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                No vendor quotes have arrived for <span className="num">{rfqId}</span> yet. Once vendors respond,
                their messages will appear here and the AI extraction can run on them.
              </p>
            </div>
          </div>
        </Panel>
      ) : (
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <Panel title="Inbox" hint={`${rfqVendors.length} messages`}>
          <ul className="divide-y divide-border">
            {rfqVendors.map((v) => {
              const st = states[v.id]?.status ?? "idle";
              const Icon = ICONS[v.kind];
              const selected = v.id === open;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => setOpen(v.id)}
                    className={[
                      "w-full px-4 py-3 text-left transition-colors",
                      selected ? "bg-secondary" : "hover:bg-secondary/50",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-[13px] font-medium">{v.name}</span>
                      <span className="ml-auto">
                        {st === "done" && <Check className="size-3.5 text-ok" />}
                        {st === "error" && <AlertCircle className="size-3.5 text-risk" />}
                        {(st === "reading" || st === "extracting") && (
                          <Loader2 className="size-3.5 animate-spin text-signal" />
                        )}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{v.subject}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Tag tone={st === "done" ? "ok" : st === "error" ? "risk" : "neutral"}>{v.kind}</Tag>
                      <span className="rail-label">
                        {new Date(v.receivedAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Asia/Kolkata",
                        })}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-5">
          <Panel
            title={active.name}
            hint={active.fileLabel}
            actions={
              <Button
                size="sm"
                variant={states[active.id]?.status === "done" ? "secondary" : "default"}
                onClick={() => void runVendor(active)}
                disabled={busy}
              >
                {states[active.id]?.status === "reading" || states[active.id]?.status === "extracting" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {states[active.id]?.status === "done" ? "Re-extract" : "Extract"}
              </Button>
            }
          >
            <div className="space-y-4 p-4">
              <div className="grid gap-1 text-[13px]">
                <div className="flex gap-3">
                  <span className="rail-label w-16 pt-0.5">From</span>
                  <span className="num">{active.from}</span>
                </div>
                <div className="flex gap-3">
                  <span className="rail-label w-16 pt-0.5">To</span>
                  <span className="num text-muted-foreground">{rfq.buyerEmail}</span>
                </div>
                <div className="flex gap-3">
                  <span className="rail-label w-16 pt-0.5">Subject</span>
                  <span>{active.subject}</span>
                </div>
              </div>
              <p className="whitespace-pre-wrap border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
                {active.body}
              </p>
              <a
                href={active.file}
                download={active.fileLabel}
                className="flex items-center gap-3 rounded-sm border border-border bg-background/60 px-3 py-2.5 transition-colors hover:border-signal/50"
              >
                <ActiveIcon className="size-4 text-signal" />
                <span className="num text-[13px]">{active.fileLabel}</span>
                <span className="ml-auto rail-label">download attachment</span>
              </a>
              <p className="text-xs text-muted-foreground">
                <span className="rail-label">Known quirk · </span>
                {active.hint}
              </p>

              {active.kind === "image" && (
                <img
                  src={active.file}
                  alt={`Photograph of the printed rate card sent by ${active.name}`}
                  className="w-full rounded-sm border border-border"
                  loading="lazy"
                />
              )}
            </div>
          </Panel>

          {states[active.id]?.status === "error" && (
            <Panel title="Extraction failed">
              <p className="p-4 text-[13px] text-risk">{states[active.id]?.error}</p>
            </Panel>
          )}

          {activeExtraction && (
            <Panel
              title="Extraction result"
              hint={`${activeExtraction.model} · ${states[active.id]?.ms ? `${(states[active.id]!.ms! / 1000).toFixed(1)}s` : "cached"}`}
              actions={<Confidence value={activeExtraction.overallConfidence ?? 0} />}
            >
              <div className="grid gap-4 p-4 md:grid-cols-2">
                <div>
                  <div className="rail-label">Vendor identity read from the document</div>
                  <dl className="mt-2 space-y-1 text-[13px]">
                    {Object.entries(activeExtraction.vendor ?? {}).map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
                        <dd className="num">{v ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div>
                  <div className="rail-label">Commercials</div>
                  <dl className="mt-2 space-y-1 text-[13px]">
                    {Object.entries(activeExtraction.charges ?? {})
                      .filter(([k, v]) => k !== "evidence" && v !== null && v !== false)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-3">
                          <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
                          <dd className="num">{String(v)}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              </div>
              <div className="border-t border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone="signal">{activeExtraction.lines?.length ?? 0} lines captured</Tag>
                  <Tag tone="neutral">
                    {activeExtraction.questionnaire?.length ?? 0} questionnaire answers
                  </Tag>
                  {(activeExtraction.warnings ?? []).length > 0 && (
                    <Tag tone="warn">{activeExtraction.warnings.length} warnings</Tag>
                  )}
                </div>
                {(activeExtraction.warnings ?? []).length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-[13px] text-muted-foreground">
                    {activeExtraction.warnings.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-warn">·</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <details className="border-t border-border">
                <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-muted-foreground hover:text-foreground">
                  What the model was given
                </summary>
                <pre className="max-h-72 overflow-auto bg-background/60 px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {activeExtraction.sourceExcerpt}
                </pre>
              </details>
            </Panel>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
