import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel, Stat } from "@/components/Primitives";
import { StatusTag } from "@/components/RfqStatus";
import { useRfqStore } from "@/state/rfqs";
import { downloadRfqPdf } from "@/lib/rfq-pdf";
import { rfqCopilot, type CopilotReply, type LineOp, type QuestionOp, type RfqChange } from "@/lib/copilot.functions";
import type { QuestionnaireItem, Rfq, RfqLineItem } from "@/lib/types";

export const Route = createFileRoute("/rfq/$id")({
  head: () => ({
    meta: [
      { title: "RFQ detail — Sourcing Desk" },
      { name: "description", content: "Review and edit an RFQ's terms, line items, questionnaire and status." },
      { property: "og:title", content: "RFQ detail — Sourcing Desk" },
      { property: "og:description", content: "RFQ terms, line items, questionnaire and lifecycle status." },
    ],
  }),
  component: RfqDetailPage,
});

const HEADER_FIELDS: [keyof Rfq, string, "text" | "date" | "readonly"][] = [
  ["buyingOrganization", "Buying organization", "text"],
  ["businessUnit", "Business unit", "text"],
  ["buyerContact", "Buyer", "text"],
  ["productCategory", "Category", "text"],
  ["issueDate", "Issued", "date"],
  ["questionsDeadline", "Questions deadline", "date"],
  ["submissionDeadline", "Submission deadline", "date"],
  ["expectedAwardDate", "Expected award", "date"],
  ["quoteValidity", "Quote validity", "text"],
  ["deliveryLocation", "Delivery location", "text"],
  ["expectedDeliveryDate", "Required by", "date"],
  ["contractDuration", "Contract duration", "text"],
  ["currency", "Currency", "text"],
];

const plusDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

function newLine(rfq: Rfq, lineNo: number): RfqLineItem {
  return {
    lineNo,
    sku: "",
    category: rfq.productCategory,
    subCategory: "",
    description: "",
    ply: 0,
    specification: "",
    quantity: 0,
    uom: "piece",
    kgPerUnit: 0,
    deliveryLocation: rfq.deliveryLocation,
    requiredBy: rfq.expectedDeliveryDate || plusDays(60),
    substituteAllowed: true,
    mandatorySpec: "",
    notes: "",
  };
}

function renumber(lines: RfqLineItem[]): RfqLineItem[] {
  return lines.map((l, i) => ({ ...l, lineNo: i + 1 }));
}

function reidQuestions(qs: QuestionnaireItem[]): QuestionnaireItem[] {
  return qs.map((q, i) => ({ ...q, id: `Q${i + 1}` }));
}

function applyOps(base: Rfq, changes: RfqChange[], lineOps: LineOp[], questionOps: QuestionOp[]): Rfq {
  const next: Rfq = { ...base, lineItems: [...base.lineItems], questionnaire: [...base.questionnaire] };

  for (const c of changes) (next as unknown as Record<string, unknown>)[c.field] = c.to;

  for (const op of lineOps) {
    if (op.op === "delete" && op.lineNo != null) {
      next.lineItems = next.lineItems.filter((l) => l.lineNo !== op.lineNo);
    } else if (op.op === "update" && op.lineNo != null) {
      next.lineItems = next.lineItems.map((l) => (l.lineNo === op.lineNo ? { ...l, ...(op.fields ?? {}) } : l));
    } else if (op.op === "add") {
      next.lineItems = [
        ...next.lineItems,
        { ...newLine(next, next.lineItems.length + 1), ...(op.fields ?? {}) } as RfqLineItem,
      ];
    }
  }
  next.lineItems = renumber(next.lineItems);
  next.estimatedTotalQuantity = next.lineItems.reduce((s, l) => s + Number(l.quantity || 0), 0);

  for (const op of questionOps) {
    if (op.op === "delete" && op.id) {
      next.questionnaire = next.questionnaire.filter((q) => q.id !== op.id);
    } else if (op.op === "update" && op.id) {
      next.questionnaire = next.questionnaire.map((q) =>
        q.id === op.id
          ? {
              ...q,
              ...(op.question !== undefined ? { question: op.question } : {}),
              ...(op.type !== undefined ? { type: op.type } : {}),
              ...(op.target !== undefined ? { target: op.target } : {}),
              ...(op.weight !== undefined ? { weight: op.weight } : {}),
            }
          : q,
      );
    } else if (op.op === "add") {
      next.questionnaire = [
        ...next.questionnaire,
        {
          id: `Q${next.questionnaire.length + 1}`,
          question: op.question ?? "",
          type: op.type ?? "boolean",
          target: op.target ?? (op.type === "number" ? 0 : true),
          weight: op.weight ?? 10,
        },
      ];
    }
  }
  next.questionnaire = reidQuestions(next.questionnaire);
  return next;
}

function RfqDetailPage() {
  const { id } = Route.useParams();
  const { getRfq, statusOf, updateRfq } = useRfqStore();
  const stored = getRfq(id);

  const [draft, setDraft] = useState<Rfq | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [instruction, setInstruction] = useState("");
  const [thread, setThread] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [reply, setReply] = useState<CopilotReply | null>(null);
  const [pending, setPending] = useState<CopilotReply | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = (draft ?? stored) as Rfq;
  const dirty = draft !== null;

  const setField = (k: keyof Rfq, v: string) =>
    setDraft((d) => ({ ...((d ?? stored) as Rfq), [k]: v }) as Rfq);
  const mutate = (fn: (r: Rfq) => Rfq) => setDraft((d) => fn({ ...((d ?? stored) as Rfq) }));

  async function send() {
    const q = instruction.trim();
    if (!q || loading || !stored) return;
    setLoading(true);
    setError(null);
    setInstruction("");
    try {
      const res = await rfqCopilot({ data: { instruction: q, rfq: live as unknown as Record<string, unknown>, history: thread } });
      setThread((t) => [...t, { role: "user", content: q }, { role: "assistant", content: res.reply }]);
      setReply(res);
      setPending(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function weightError(r: Rfq): string | null {
    const q = r.questionnaire ?? [];
    if (q.length === 0) return null;
    const total = q.reduce((s, item) => s + (Number(item.weight) || 0), 0);
    return total === 100
      ? null
      : `Questionnaire weights must add up to 100% — they currently total ${total}%. Adjust the weights before saving.`;
  }

  // Copilot changes autosave on confirm; on error they stay in the draft for fixing.
  async function applyAll() {
    if (!pending || !stored) return;
    const ops = pending;
    setPending(null);
    const next = applyOps({ ...((draft ?? stored) as Rfq) }, ops.changes, ops.lineOps, ops.questionOps);
    const wErr = weightError(next);
    if (wErr) {
      setDraft(next);
      setEditing(true);
      setSaveError(wErr);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateRfq(next);
      setDraft(null);
      setEditing(false);
    } catch (e) {
      setDraft(next);
      setEditing(true);
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!draft) return;
    const wErr = weightError(draft);
    if (wErr) {
      setSaveError(wErr);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateRfq(draft);
      setDraft(null);
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!stored) {
    return (
      <Panel title="RFQ not found">
        <div className="p-6 text-[13px] text-muted-foreground">
          No RFQ with id <span className="num">{id}</span> exists in this workspace.{" "}
          <Link to="/" className="text-signal hover:underline">
            Back to requisitions
          </Link>
        </div>
      </Panel>
    );
  }

  const pendingCount =
    (pending?.changes.length ?? 0) + (pending?.lineOps.length ?? 0) + (pending?.questionOps.length ?? 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rail-label">{stored.id} · Requisition</div>
          {editing ? (
            <Input
              className="mt-1 h-10 max-w-3xl text-lg font-semibold"
              value={live.title}
              onChange={(e) => setField("title", e.target.value)}
            />
          ) : (
            <h1 className="mt-1 max-w-3xl text-2xl font-semibold tracking-tight">{live.title}</h1>
          )}
          {editing ? (
            <Input
              className="mt-2 max-w-2xl text-[13px]"
              value={live.purpose}
              onChange={(e) => setField("purpose", e.target.value)}
            />
          ) : (
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{live.purpose}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag status={statusOf(stored.id)} />
          {editing ? (
            <>
              <Button onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save changes
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(null);
                  setEditing(false);
                }}
              >
                <X className="size-4" /> Cancel
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit RFQ
            </Button>
          )}
          <Button variant="secondary" onClick={() => downloadRfqPdf(live)}>
            <Download className="size-4" /> Download RFQ (PDF)
          </Button>
          <Button asChild>
            <Link to="/inbox" search={{ rfq: stored.id }}>
              Vendor responses <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">
              <ArrowLeft className="size-4" /> All RFQs
            </Link>
          </Button>
        </div>
      </div>

      {saveError && (
        <p className="rounded-sm border border-risk/40 bg-risk-soft px-3 py-2 text-[13px] text-risk">{saveError}</p>
      )}
      {dirty && !saving && (
        <p className="rounded-sm border border-signal/40 bg-signal-soft px-3 py-2 text-[13px] text-signal">
          Unsaved changes — click “Save changes” to persist this RFQ.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <Stat label="Line items" value={String(live.lineItems.length)} />
        <Stat label="Total quantity" value={live.lineItems.reduce((s, l) => s + Number(l.quantity || 0), 0).toLocaleString("en-IN")} />
        <Stat label="Currency" value={live.currency} />
        <Stat label="Questions" value={String(live.questionnaire.length)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Panel title="RFQ header" hint={editing ? "Editing" : "Editable before issue"}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 md:grid-cols-3">
            {HEADER_FIELDS.map(([k, label, kind]) => (
              <div key={String(k)}>
                <dt className="rail-label">{label}</dt>
                <dd className="num mt-1 text-[13px]">
                  {editing ? (
                    <Input
                      className="h-8"
                      type={kind === "date" ? "date" : "text"}
                      value={String(live[k] ?? "")}
                      onChange={(e) => setField(k, e.target.value)}
                    />
                  ) : (
                    String(live[k] ?? "—")
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-border p-4">
            <div className="rail-label">Submission instructions</div>
            {editing ? (
              <Textarea
                rows={3}
                className="mt-1.5 resize-none text-[13px]"
                value={live.submissionInstructions}
                onChange={(e) => setField("submissionInstructions", e.target.value)}
              />
            ) : (
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{live.submissionInstructions}</p>
            )}
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
                placeholder="e.g. Add a line for 5-ply 200 GSM cartons, 2,000 pcs, and drop the ISO certification question"
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
              <p className="rounded-sm border border-risk/40 bg-risk-soft px-3 py-2 text-[13px] text-risk">{error}</p>
            )}

            {reply?.reply && (
              <p className="rounded-sm border border-border bg-background/60 px-3 py-2.5 text-[13px] leading-relaxed">
                {reply.reply}
              </p>
            )}

            {pendingCount > 0 && (
              <div className="rounded-sm border border-signal/40 bg-signal-soft p-3">
                <div className="flex items-center justify-between">
                  <span className="rail-label text-signal">{pendingCount} proposed change(s)</span>
                  <Button size="sm" variant="secondary" onClick={applyAll}>
                    <Check className="size-3.5" /> Apply
                  </Button>
                </div>
                <ul className="mt-2.5 space-y-2">
                  {pending?.changes.map((c) => (
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
                  {pending?.lineOps.map((o, i) => (
                    <li key={`l${i}`} className="text-[13px]">
                      <div className="rail-label">
                        Line item · {o.op}
                        {o.lineNo != null ? ` #${o.lineNo}` : ""}
                      </div>
                      <div className="num mt-0.5 break-words">
                        {o.op === "delete"
                          ? String(live.lineItems.find((l) => l.lineNo === o.lineNo)?.description ?? "")
                          : Object.entries(o.fields ?? {})
                              .map(([k, v]) => `${k}=${String(v)}`)
                              .join(" · ")}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{o.rationale}</p>
                    </li>
                  ))}
                  {pending?.questionOps.map((o, i) => (
                    <li key={`q${i}`} className="text-[13px]">
                      <div className="rail-label">
                        Question · {o.op}
                        {o.id ? ` ${o.id}` : ""}
                      </div>
                      <div className="mt-0.5 break-words">
                        {o.op === "delete"
                          ? String(live.questionnaire.find((q) => q.id === o.id)?.question ?? "")
                          : `${o.question ?? ""}${o.target !== undefined ? ` (target ${String(o.target)})` : ""}${
                              o.weight !== undefined ? ` · weight ${o.weight}` : ""
                            }`}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{o.rationale}</p>
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

      <Panel
        title="Line items"
        hint={`${live.lineItems.length} rows`}
        actions={
          editing ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => mutate((r) => ({ ...r, lineItems: [...r.lineItems, newLine(r, r.lineItems.length + 1)] }))}
            >
              <Plus className="size-3.5" /> Add line
            </Button>
          ) : null
        }
      >
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-chassis">
              <tr className="etched">
                {["#", "SKU", "Description", "Specification", "Qty", "UOM", "kg/unit", "Required by", "Substitute", ""].map(
                  (h, i) => (
                    <th key={i} className="rail-label px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {live.lineItems.map((l, idx) => {
                const setL = (patch: Partial<RfqLineItem>) =>
                  mutate((r) => ({
                    ...r,
                    lineItems: r.lineItems.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
                  }));
                return (
                  <tr key={l.lineNo} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="num px-3 py-2 text-muted-foreground">{l.lineNo}</td>
                    {editing ? (
                      <>
                        <td className="px-2 py-1.5">
                          <Input className="h-8 w-32" value={l.sku} onChange={(e) => setL({ sku: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 min-w-56"
                            value={l.description}
                            onChange={(e) => setL({ description: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 min-w-56"
                            value={l.specification}
                            onChange={(e) => setL({ specification: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 w-24"
                            type="number"
                            value={l.quantity || ""}
                            onChange={(e) => setL({ quantity: Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input className="h-8 w-24" value={l.uom} onChange={(e) => setL({ uom: e.target.value })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 w-24"
                            type="number"
                            step="0.01"
                            value={l.kgPerUnit || ""}
                            onChange={(e) => setL({ kgPerUnit: Number(e.target.value) })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 w-36"
                            type="date"
                            value={l.requiredBy}
                            onChange={(e) => setL({ requiredBy: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Select
                            value={l.substituteAllowed ? "yes" : "no"}
                            onValueChange={(v) => setL({ substituteAllowed: v === "yes" })}
                          >
                            <SelectTrigger className="h-8 w-28 text-[13px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">allowed</SelectItem>
                              <SelectItem value="no">no</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            onClick={() =>
                              mutate((r) => ({ ...r, lineItems: renumber(r.lineItems.filter((_, i) => i !== idx)) }))
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="num px-3 py-2">{l.sku}</td>
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="max-w-[420px] px-3 py-2 text-muted-foreground">{l.specification}</td>
                        <td className="num px-3 py-2 text-right">{l.quantity.toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2 text-muted-foreground">{l.uom}</td>
                        <td className="num px-3 py-2 text-right text-muted-foreground">{l.kgPerUnit}</td>
                        <td className="num px-3 py-2 text-muted-foreground">{l.requiredBy}</td>
                        <td className="px-3 py-2 text-muted-foreground">{l.substituteAllowed ? "allowed" : "no"}</td>
                        <td />
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Qualification questionnaire"
        hint="Weighted, scored on extraction"
        actions={
          editing ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                mutate((r) => ({
                  ...r,
                  questionnaire: [
                    ...r.questionnaire,
                    {
                      id: `Q${r.questionnaire.length + 1}`,
                      question: "",
                      type: "boolean" as const,
                      target: true,
                      weight: 10,
                    },
                  ],
                }))
              }
            >
              <Plus className="size-3.5" /> Add question
            </Button>
          ) : null
        }
      >
        <ul className="divide-y divide-border">
          {live.questionnaire.map((q, idx) => {
            const setQ = (patch: Partial<QuestionnaireItem>) =>
              mutate((r) => ({
                ...r,
                questionnaire: r.questionnaire.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
              }));
            if (!editing) {
              return (
                <li key={q.id} className="flex items-center gap-4 px-4 py-2.5 text-[13px]">
                  <span className="rail-label w-10">{q.id}</span>
                  <span className="flex-1">{q.question}</span>
                  <span className="num text-muted-foreground">
                    target {typeof q.target === "boolean" ? (q.target ? "yes" : "no") : `≥ ${q.target}`}
                  </span>
                  <span className="num w-16 text-right text-muted-foreground">weight {q.weight}</span>
                </li>
              );
            }
            return (
              <li key={q.id} className="flex flex-wrap items-end gap-3 px-4 py-3">
                <span className="rail-label w-8 pb-2">{q.id}</span>
                <div className="min-w-64 flex-1">
                  <Input className="h-9" value={q.question} onChange={(e) => setQ({ question: e.target.value })} />
                </div>
                <Select
                  value={q.type}
                  onValueChange={(v) =>
                    setQ({ type: v as QuestionnaireItem["type"], target: v === "boolean" ? true : 0 })
                  }
                >
                  <SelectTrigger className="h-9 w-32 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boolean">Yes / No</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                  </SelectContent>
                </Select>
                {q.type === "boolean" ? (
                  <Select value={String(q.target)} onValueChange={(v) => setQ({ target: v === "true" })}>
                    <SelectTrigger className="h-9 w-24 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="h-9 w-24"
                    type="number"
                    value={String(q.target ?? "")}
                    onChange={(e) => setQ({ target: Number(e.target.value) })}
                  />
                )}
                <Input
                  className="h-9 w-24"
                  type="number"
                  value={q.weight}
                  onChange={(e) => setQ({ weight: Number(e.target.value) })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="mb-0.5 size-9"
                  onClick={() =>
                    mutate((r) => ({ ...r, questionnaire: reidQuestions(r.questionnaire.filter((_, i) => i !== idx)) }))
                  }
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
