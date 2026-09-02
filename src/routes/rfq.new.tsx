import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
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
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [questions, setQuestions] = useState<QuestionnaireItem[]>([emptyQuestion(1)]);
  const [error, setError] = useState<string | null>(null);

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
          <Button size="sm" variant="secondary" onClick={() => setLines((l) => [...l, emptyLine()])}>
            <Plus className="size-3.5" /> Add line
          </Button>
        }
      >
        <div className="overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-chassis">
              <tr className="etched">
                {["#", "SKU", "Description", "Specification", "Qty", "UOM", "kg/unit", "Required by", ""].map((h) => (
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
