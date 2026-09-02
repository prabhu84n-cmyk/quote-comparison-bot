import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Loader2, Sparkles, TriangleAlert, Check, Download } from "lucide-react";
import { rfq } from "@/data/rfq";
import { downloadRfqPdf } from "@/lib/rfq-pdf";
import { rfqCopilot, type CopilotReply, type RfqChange } from "@/lib/copilot.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel, Stat } from "@/components/Primitives";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RFQ Brief — Corrugated Packaging Sourcing Desk" },
      {
        name: "description",
        content:
          "A 30-line corrugated packaging RFQ with an AI drafting copilot that amends terms and flags gaps that would break vendor comparability.",
      },
      { property: "og:title", content: "RFQ Brief — Corrugated Packaging Sourcing Desk" },
      {
        property: "og:description",
        content: "AI-drafted RFQ header, 30 line items, and comparability checks before issue.",
      },
    ],
  }),
  component: RfqPage,
});

const HEADER_FIELDS: [keyof typeof rfq, string][] = [
  ["buyingOrganization", "Buying organization"],
  ["businessUnit", "Business unit"],
  ["buyerContact", "Buyer"],
  ["productCategory", "Category"],
  ["issueDate", "Issued"],
  ["questionsDeadline", "Questions deadline"],
  ["submissionDeadline", "Submission deadline"],
  ["expectedAwardDate", "Expected award"],
  ["quoteValidity", "Quote validity"],
  ["deliveryLocation", "Delivery location"],
  ["expectedDeliveryDate", "Required by"],
  ["contractDuration", "Contract duration"],
];

function RfqPage() {
  const [patch, setPatch] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState("");
  const [thread, setThread] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [reply, setReply] = useState<CopilotReply | null>(null);
  const [pending, setPending] = useState<RfqChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = { ...rfq, ...patch } as typeof rfq & Record<string, string>;

  async function send() {
    const q = instruction.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setInstruction("");
    try {
      const res = await rfqCopilot({ data: { instruction: q, current: patch, history: thread } });
      setThread((t) => [...t, { role: "user", content: q }, { role: "assistant", content: res.reply }]);
      setReply(res);
      setPending(res.changes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function applyAll() {
    setPatch((p) => ({ ...p, ...Object.fromEntries(pending.map((c) => [c.field, c.to])) }));
    setPending([]);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rail-label">Step 01 · Requisition</div>
          <h1 className="mt-1 max-w-3xl text-2xl font-semibold tracking-tight">{live.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{live.purpose}</p>
        </div>
        <Button asChild>
          <Link to="/inbox">
            Vendor responses <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Stat label="Line items" value={String(rfq.lineItems.length)} sub="across 6 sub-categories" />
        <Stat
          label="Annual quantity"
          value={rfq.estimatedTotalQuantity.toLocaleString("en-IN")}
          sub="units over 12 months"
        />
        <Stat label="Currency" value={live.currency} sub="quotes accepted in any currency" />
        <Stat label="Responses" value="5" sub="xlsx · pdf · docx · photo · email" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Panel title="RFQ header" hint="Editable before issue">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 md:grid-cols-3">
            {HEADER_FIELDS.map(([k, label]) => {
              const changed = k in patch;
              return (
                <div key={String(k)}>
                  <dt className="rail-label">{label}</dt>
                  <dd
                    className={[
                      "num mt-1 text-[13px]",
                      changed ? "text-signal" : "text-foreground",
                    ].join(" ")}
                  >
                    {String(live[k as keyof typeof live])}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className="border-t border-border p-4">
            <div className="rail-label">Submission instructions</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {live.submissionInstructions}
            </p>
          </div>
        </Panel>

        <Panel title="Drafting copilot" hint="Live AI">
          <div className="space-y-3 p-4">
            <div className="flex gap-2">
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
                }}
                rows={3}
                placeholder="e.g. Push the submission deadline out by a week and make quotes valid for 90 days"
                className="resize-none bg-background text-[13px]"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="rail-label">⌘↵ to send</span>
              <Button size="sm" onClick={() => void send()} disabled={loading || !instruction.trim()}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Amend RFQ
              </Button>
            </div>

            {error && (
              <p className="rounded-sm border border-risk/40 bg-risk-soft px-3 py-2 text-[13px] text-risk">
                {error}
              </p>
            )}

            {reply?.reply && (
              <p className="rounded-sm border border-border bg-background/60 px-3 py-2.5 text-[13px] leading-relaxed">
                {reply.reply}
              </p>
            )}

            {pending.length > 0 && (
              <div className="rounded-sm border border-signal/40 bg-signal-soft p-3">
                <div className="flex items-center justify-between">
                  <span className="rail-label text-signal">{pending.length} proposed change(s)</span>
                  <Button size="sm" variant="secondary" onClick={applyAll}>
                    <Check className="size-3.5" /> Apply
                  </Button>
                </div>
                <ul className="mt-2.5 space-y-2">
                  {pending.map((c) => (
                    <li key={c.field} className="text-[13px]">
                      <div className="rail-label">{c.label}</div>
                      <div className="num mt-0.5">
                        <span className="text-muted-foreground line-through">{c.from}</span>
                        <span className="mx-2 text-signal">→</span>
                        <span>{c.to}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.rationale}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {reply && reply.gaps.length > 0 && (
              <div className="rounded-sm border border-warn/40 bg-warn-soft p-3">
                <div className="flex items-center gap-1.5">
                  <TriangleAlert className="size-3.5 text-warn" />
                  <span className="rail-label text-warn">Comparability risks</span>
                </div>
                <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
                  {reply.gaps.map((g, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-warn">·</span>
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Line items" hint={`${rfq.lineItems.length} rows`}>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-chassis">
              <tr className="etched">
                {["#", "SKU", "Description", "Specification", "Qty", "UOM", "kg/unit", "Required by", "Substitute"].map(
                  (h) => (
                    <th key={h} className="rail-label px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rfq.lineItems.map((l) => (
                <tr key={l.lineNo} className="border-b border-border/60 hover:bg-secondary/40">
                  <td className="num px-3 py-2 text-muted-foreground">{l.lineNo}</td>
                  <td className="num px-3 py-2">{l.sku}</td>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="max-w-[420px] px-3 py-2 text-muted-foreground">{l.specification}</td>
                  <td className="num px-3 py-2 text-right">{l.quantity.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.uom}</td>
                  <td className="num px-3 py-2 text-right text-muted-foreground">{l.kgPerUnit}</td>
                  <td className="num px-3 py-2 text-muted-foreground">{l.requiredBy}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.substituteAllowed ? "allowed" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Qualification questionnaire" hint="Weighted, scored on extraction">
        <ul className="divide-y divide-border">
          {rfq.questionnaire.map((q) => (
            <li key={q.id} className="flex items-center gap-4 px-4 py-2.5 text-[13px]">
              <span className="rail-label w-10">{q.id}</span>
              <span className="flex-1">{q.question}</span>
              <span className="num text-muted-foreground">
                target {typeof q.target === "boolean" ? (q.target ? "yes" : "no") : `≥ ${q.target}`}
              </span>
              <span className="num w-16 text-right text-muted-foreground">weight {q.weight}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
