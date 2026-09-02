import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Mic, Plus, Save, Sparkles, Square, Trash2 } from "lucide-react";
import { Dictation, LiveTranscriber, transcribe } from "@/lib/dictation";
import { draftRfqFromText, type DraftPatch } from "@/lib/rfq-draft.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "@/components/Primitives";
import { StatusSelect } from "@/components/RfqStatus";
import { nextRfqId, useRfqStore, type RfqStatus } from "@/state/rfqs";
import type { QuestionnaireItem, Rfq, RfqLineItem } from "@/lib/types";

export const Route = createFileRoute("/rfq/new")({
  head: () => ({
    meta: [
      { title: "Create RFQ — Sourcing Desk" },
      {
        name: "description",
        content: "Draft a new request for quotation: terms, line items and a custom qualification questionnaire.",
      },
      { property: "og:title", content: "Create RFQ — Sourcing Desk" },
      { property: "og:description", content: "Draft RFQ terms, line items and your own questionnaire." },
    ],
  }),
  component: NewRfqPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

type LineDraft = Omit<RfqLineItem, "lineNo">;

const emptyLine = (): LineDraft => ({
  sku: "",
  category: "",
  subCategory: "",
  description: "",
  ply: 0,
  specification: "",
  quantity: 0,
  uom: "piece",
  kgPerUnit: 0,
  deliveryLocation: "",
  requiredBy: plusDays(60),
  substituteAllowed: true,
  mandatorySpec: "",
  notes: "",
});

/** Auto SKU in the format AER-<year>-<3-digit sequence starting at 001>. */
const skuFor = (index: number) => `AER-${new Date().getFullYear()}-${String(index + 1).padStart(3, "0")}`;

const emptyQuestion = (i: number): QuestionnaireItem => ({
  id: `Q${i}`,
  question: "",
  type: "boolean",
  target: true,
  weight: 10,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="rail-label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function NewRfqPage() {
  const navigate = useNavigate();
  const { rfqs, addRfq } = useRfqStore();

  const [head, setHead] = useState({
    title: "",
    buyingOrganization: "",
    businessUnit: "",
    buyerContact: "",
    buyerEmail: "",
    productCategory: "",
    purpose: "",
    issueDate: today(),
    questionsDeadline: plusDays(7),
    submissionDeadline: plusDays(14),
    expectedAwardDate: plusDays(30),
    quoteValidity: "1 month",
    deliveryLocation: "",
    expectedDeliveryDate: plusDays(60),
    contractDuration: "12 months",
    currency: "INR",
    submissionInstructions:
      "Reply to this email with your quote and the completed questionnaire attached. Any document format is accepted.",
  });
  const [status, setStatus] = useState<RfqStatus>("Draft");
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine(), sku: skuFor(0) }]);
  const [questions, setQuestions] = useState<QuestionnaireItem[]>([emptyQuestion(1)]);
  const [error, setError] = useState<string | null>(null);

  // ---- drafting copilot ----
  const [instruction, setInstruction] = useState("");
  const [thread, setThread] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [pending, setPending] = useState<DraftPatch | null>(null);
  const [reply, setReply] = useState<DraftPatch | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const dictation = useRef<Dictation | null>(null);
  const live = useRef<LiveTranscriber | null>(null);
  const instructionBase = useRef("");

  const currentForm = () => ({
    ...head,
    lineItems: lines.filter((l) => l.description.trim() || l.sku.trim()),
    questionnaire: questions.filter((q) => q.question.trim()),
  });

  async function askCopilot() {
    const q = instruction.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setInstruction("");
    try {
      const res = await draftRfqFromText({ data: { instruction: q, form: currentForm(), history: thread } });
      setThread((t) => [...t, { role: "user", content: q }, { role: "assistant", content: res.reply }]);
      setReply(res);
      setPending(res);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  }

  function applyPatch() {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (Object.keys(p.header).length) setHead((h) => ({ ...h, ...p.header }) as typeof h);
    if (p.lineItems.length) {
      const mapped = p.lineItems.map((raw) => {
        const base = emptyLine();
        const l: LineDraft = { ...base };
        for (const [k, v] of Object.entries(raw)) {
          if (!(k in base) || v == null) continue;
          const key = k as keyof LineDraft;
          const cur = base[key];
          (l as Record<string, unknown>)[key] =
            typeof cur === "number" ? Number(v) || 0 : typeof cur === "boolean" ? Boolean(v) : String(v);
        }
        return l;
      });
      setLines((ls) => {
        const kept = p.lineMode === "replace" ? [] : ls.filter((l) => l.description.trim() || l.sku.trim());
        return [...kept, ...mapped].map((l, i) => (l.sku.trim() ? l : { ...l, sku: skuFor(i) }));
      });
    }
    if (p.questionnaire.length) {
      setQuestions((qs) => {
        const kept = p.questionMode === "replace" ? [] : qs.filter((q) => q.question.trim());
        const merged = [...kept, ...p.questionnaire.map((q) => ({ ...q, id: "" }))];
        return merged.map((q, i) => ({ ...q, id: `Q${i + 1}` }));
      });
    }
    setError(null);
  }

  async function toggleMic() {
    if (recording) {
      setRecording(false);
      const base = instructionBase.current;
      const liveText = live.current?.stop() ?? "";
      live.current = null;
      const applyText = (text: string) =>
        setInstruction(text.trim() ? (base ? `${base} ${text.trim()}` : text.trim()) : base);
      applyText(liveText);
      setTranscribing(true);
      try {
        const blob = await dictation.current!.stop();
        const text = await transcribe(blob);
        if (text.trim()) applyText(text);
        else if (!liveText.trim()) setAiError("Nothing was picked up — try recording again.");
      } catch (e) {
        if (!liveText.trim()) setAiError(e instanceof Error ? e.message : String(e));
      } finally {
        setTranscribing(false);
      }
      return;
    }
    setAiError(null);
    try {
      dictation.current = new Dictation();
      await dictation.current.start();
      instructionBase.current = instruction.trim();
      const lt = new LiveTranscriber();
      live.current = lt;
      if (lt.supported) {
        const base = instructionBase.current;
        lt.start((text) => setInstruction(base ? `${base} ${text}` : text));
      }
      setRecording(true);
    } catch {
      setAiError("Microphone access is needed to dictate. Allow it in your browser and try again.");
    }
  }

  const pendingCount =
    (pending ? Object.keys(pending.header).length : 0) +
    (pending?.lineItems.length ?? 0) +
    (pending?.questionnaire.length ?? 0);

  const set = (k: keyof typeof head, v: string) => setHead((h) => ({ ...h, [k]: v }));
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setQ = (i: number, patch: Partial<QuestionnaireItem>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  async function save() {
    if (!head.title.trim()) return setError("Give the RFQ a name.");
    const kept = lines.filter((l) => l.description.trim() || l.sku.trim());
    if (!kept.length) return setError("Add at least one line item with a description.");
    const keptQuestions = questions.filter((q) => q.question.trim());
    if (keptQuestions.length > 0) {
      const total = keptQuestions.reduce((s, q) => s + (Number(q.weight) || 0), 0);
      if (total !== 100) {
        return setError(
          `Questionnaire weights must add up to 100% — they currently total ${total}%. Adjust the weights before saving.`,
        );
      }
    }


    const id = nextRfqId(rfqs.map((r) => r.id));
    const created: Rfq = {
      ...head,
      id,
      taxable: true,
      partialQuotationAllowed: true,
      alternativeProductAllowed: true,
      partialAwardAllowed: true,
      estimatedTotalQuantity: kept.reduce((s, l) => s + Number(l.quantity || 0), 0),
      lineItems: kept.map((l, i) => ({
        ...l,
        sku: l.sku.trim() || skuFor(i),
        lineNo: i + 1,
        category: l.category || head.productCategory,
        deliveryLocation: l.deliveryLocation || head.deliveryLocation,
      })),
      questionnaire: questions
        .filter((q) => q.question.trim())
        .map((q, i) => ({ ...q, id: `Q${i + 1}` })),
    };
    try {
      await addRfq(created, status);
    } catch {
      return setError("Could not save the RFQ to the database. Please try again.");
    }
    void navigate({ to: "/rfq/$id", params: { id } });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rail-label">New requisition</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create RFQ</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Define the commercial terms, the items you need quoted, and your own qualification questionnaire.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect value={status} onChange={setStatus} />
          <Button variant="secondary" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" /> Cancel
            </Link>
          </Button>
          <Button onClick={save}>
            <Save className="size-4" /> Create RFQ
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-sm border border-risk/40 bg-risk-soft px-3 py-2 text-[13px] text-risk">{error}</p>
      )}

      <Panel title="Drafting copilot" hint="Describe the RFQ — type or dictate">
        <div className="space-y-3 p-4">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void askCopilot();
            }}
            rows={3}
            placeholder="e.g. Annual corrugated carton requirement for our Pune plant, 3-ply 150 GSM boxes, 10,000 pieces required by August, quotes due in two weeks. Ask vendors about ISO certification and lead time."
            className="resize-none bg-background text-[13px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rail-label">
              {recording ? "Recording — click stop when done" : transcribing ? "Transcribing…" : "⌘↵ to send"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={recording ? "destructive" : "secondary"}
                onClick={() => void toggleMic()}
                disabled={transcribing}
              >
                {transcribing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : recording ? (
                  <Square className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
                {recording ? "Stop" : "Dictate"}
              </Button>
              <Button size="sm" onClick={() => void askCopilot()} disabled={aiLoading || !instruction.trim()}>
                {aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Draft RFQ
              </Button>
            </div>
          </div>

          {aiError && (
            <p className="rounded-sm border border-risk/40 bg-risk-soft px-3 py-2 text-[13px] text-risk">{aiError}</p>
          )}

          {reply?.reply && (
            <p className="rounded-sm border border-border bg-background/60 px-3 py-2.5 text-[13px] leading-relaxed">
              {reply.reply}
            </p>
          )}

          {pendingCount > 0 && (
            <div className="rounded-sm border border-signal/40 bg-signal-soft p-3">
              <div className="flex items-center justify-between">
                <span className="rail-label text-signal">{pendingCount} proposed value(s)</span>
                <Button size="sm" variant="secondary" onClick={applyPatch}>
                  <Check className="size-3.5" /> Fill form
                </Button>
              </div>
              <ul className="mt-2.5 space-y-1.5 text-[13px]">
                {Object.entries(pending?.header ?? {}).map(([k, v]) => (
                  <li key={k}>
                    <span className="rail-label">{k}</span>
                    <div className="num break-words">{v}</div>
                  </li>
                ))}
                {(pending?.lineItems ?? []).map((l, i) => (
                  <li key={`l${i}`}>
                    <span className="rail-label">Line item · {pending?.lineMode}</span>
                    <div className="num break-words">
                      {String(l["description"] ?? l["sku"] ?? "")} · qty {String(l["quantity"] ?? "—")}{" "}
                      {String(l["uom"] ?? "")}
                    </div>
                  </li>
                ))}
                {(pending?.questionnaire ?? []).map((q, i) => (
                  <li key={`q${i}`}>
                    <span className="rail-label">Question · weight {q.weight}%</span>
                    <div className="num break-words">{q.question}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Review the filled form, then click “Create RFQ” to save — nothing is saved automatically.
              </p>
            </div>
          )}

          {(reply?.gaps?.length ?? 0) > 0 && (
            <div className="rounded-sm border border-warn/40 bg-warn-soft p-3">
              <span className="rail-label text-warn">Still missing</span>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px]">
                {reply?.gaps.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="RFQ header">
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Field label="RFQ name">
              <Input value={head.title} onChange={(e) => set("title", e.target.value)} placeholder="Annual requirement — …" />
            </Field>
          </div>
          <Field label="Buying organization">
            <Input value={head.buyingOrganization} onChange={(e) => set("buyingOrganization", e.target.value)} />
          </Field>
          <Field label="Business unit">
            <Input value={head.businessUnit} onChange={(e) => set("businessUnit", e.target.value)} />
          </Field>
          <Field label="Product category">
            <Input value={head.productCategory} onChange={(e) => set("productCategory", e.target.value)} />
          </Field>
          <Field label="Buyer">
            <Input value={head.buyerContact} onChange={(e) => set("buyerContact", e.target.value)} />
          </Field>
          <Field label="Buyer email">
            <Input value={head.buyerEmail} onChange={(e) => set("buyerEmail", e.target.value)} />
          </Field>
          <Field label="Currency">
            <Input value={head.currency} onChange={(e) => set("currency", e.target.value)} />
          </Field>
          <Field label="Issue date">
            <Input type="date" value={head.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          </Field>
          <Field label="Questions deadline">
            <Input type="date" value={head.questionsDeadline} onChange={(e) => set("questionsDeadline", e.target.value)} />
          </Field>
          <Field label="Submission deadline">
            <Input type="date" value={head.submissionDeadline} onChange={(e) => set("submissionDeadline", e.target.value)} />
          </Field>
          <Field label="Expected award">
            <Input type="date" value={head.expectedAwardDate} onChange={(e) => set("expectedAwardDate", e.target.value)} />
          </Field>
          <Field label="Required by">
            <Input type="date" value={head.expectedDeliveryDate} onChange={(e) => set("expectedDeliveryDate", e.target.value)} />
          </Field>
          <Field label="Quote validity">
            <Input value={head.quoteValidity} onChange={(e) => set("quoteValidity", e.target.value)} />
          </Field>
          <Field label="Delivery location">
            <Input value={head.deliveryLocation} onChange={(e) => set("deliveryLocation", e.target.value)} />
          </Field>
          <Field label="Contract duration">
            <Input value={head.contractDuration} onChange={(e) => set("contractDuration", e.target.value)} />
          </Field>
          <div className="md:col-span-3">
            <Field label="Purpose">
              <Input value={head.purpose} onChange={(e) => set("purpose", e.target.value)} />
            </Field>
          </div>
          <div className="md:col-span-3">
            <Field label="Submission instructions">
              <Textarea
                rows={3}
                className="resize-none text-[13px]"
                value={head.submissionInstructions}
                onChange={(e) => set("submissionInstructions", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel
        title="Line items"
        hint={`${lines.length} row(s)`}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setLines((l) => [...l, { ...emptyLine(), sku: skuFor(l.length) }])}>
            <Plus className="size-3.5" /> Add line
          </Button>
        }
      >
        <div className="overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-chassis">
              <tr className="etched">
                {["#", "Item number", "Description", "Specification", "Qty", "UOM", "kg/unit", "Required by", ""].map((h) => (
                  <th key={h} className="rail-label px-2 py-2 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="num px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 w-32" value={l.sku} onChange={(e) => setLine(i, { sku: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 min-w-56"
                      value={l.description}
                      onChange={(e) => setLine(i, { description: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 min-w-56"
                      value={l.specification}
                      onChange={(e) => setLine(i, { specification: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-24"
                      type="number"
                      value={l.quantity || ""}
                      onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 w-24" value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-24"
                      type="number"
                      step="0.01"
                      value={l.kgPerUnit || ""}
                      onChange={(e) => setLine(i, { kgPerUnit: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      className="h-8 w-36"
                      type="date"
                      value={l.requiredBy}
                      onChange={(e) => setLine(i, { requiredBy: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Qualification questionnaire"
        hint="Your own questions, targets and weights"
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setQuestions((q) => [...q, emptyQuestion(q.length + 1)])}
          >
            <Plus className="size-3.5" /> Add question
          </Button>
        }
      >
        <ul className="divide-y divide-border">
          {questions.map((q, i) => (
            <li key={i} className="flex flex-wrap items-end gap-3 px-4 py-3">
              <span className="rail-label w-8 pb-2">Q{i + 1}</span>
              <div className="min-w-64 flex-1">
                <Field label="Question">
                  <Input value={q.question} onChange={(e) => setQ(i, { question: e.target.value })} />
                </Field>
              </div>
              <Field label="Answer type">
                <Select
                  value={q.type}
                  onValueChange={(v) =>
                    setQ(i, { type: v as QuestionnaireItem["type"], target: v === "boolean" ? true : 0 })
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
              </Field>
              <Field label="Target">
                {q.type === "boolean" ? (
                  <Select value={String(q.target)} onValueChange={(v) => setQ(i, { target: v === "true" })}>
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
                    onChange={(e) => setQ(i, { target: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label="Weight">
                <Input
                  className="h-9 w-24"
                  type="number"
                  value={q.weight}
                  onChange={(e) => setQ(i, { weight: Number(e.target.value) })}
                />
              </Field>
              <Button
                size="icon"
                variant="ghost"
                className="mb-0.5 size-9"
                onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
