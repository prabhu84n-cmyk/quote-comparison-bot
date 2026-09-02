import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Stat } from "@/components/Primitives";
import { StatusSelect } from "@/components/RfqStatus";
import { useRfqStore } from "@/state/rfqs";
import { downloadRfqPdf } from "@/lib/rfq-pdf";

export const Route = createFileRoute("/rfq/$id")({
  head: () => ({
    meta: [
      { title: "RFQ detail — Sourcing Desk" },
      { name: "description", content: "Review an RFQ's terms, line items, questionnaire and status." },
      { property: "og:title", content: "RFQ detail — Sourcing Desk" },
      { property: "og:description", content: "RFQ terms, line items, questionnaire and lifecycle status." },
    ],
  }),
  component: RfqDetailPage,
});

const HEADER_FIELDS: [string, string][] = [
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

function RfqDetailPage() {
  const { id } = Route.useParams();
  const { getRfq, statusOf, setStatus } = useRfqStore();
  const rfq = getRfq(id);

  if (!rfq) {
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rail-label">{rfq.id} · Requisition</div>
          <h1 className="mt-1 max-w-3xl text-2xl font-semibold tracking-tight">{rfq.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{rfq.purpose}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect value={statusOf(rfq.id)} onChange={(s) => setStatus(rfq.id, s)} />
          <Button variant="secondary" onClick={() => downloadRfqPdf(rfq)}>
            <Download className="size-4" /> Download RFQ (PDF)
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">
              <ArrowLeft className="size-4" /> All RFQs
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Stat label="Line items" value={String(rfq.lineItems.length)} />
        <Stat label="Total quantity" value={rfq.estimatedTotalQuantity.toLocaleString("en-IN")} />
        <Stat label="Currency" value={rfq.currency} />
        <Stat label="Questions" value={String(rfq.questionnaire.length)} />
      </div>

      <Panel title="RFQ header">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 md:grid-cols-3">
          {HEADER_FIELDS.map(([k, label]) => (
            <div key={k}>
              <dt className="rail-label">{label}</dt>
              <dd className="num mt-1 text-[13px]">{String((rfq as unknown as Record<string, unknown>)[k] ?? "—")}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-border p-4">
          <div className="rail-label">Submission instructions</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {rfq.submissionInstructions}
          </p>
        </div>
      </Panel>

      <Panel title="Line items" hint={`${rfq.lineItems.length} rows`}>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-chassis">
              <tr className="etched">
                {["#", "SKU", "Description", "Specification", "Qty", "UOM", "Required by"].map((h) => (
                  <th key={h} className="rail-label px-3 py-2 text-left font-medium">
                    {h}
                  </th>
                ))}
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
                  <td className="num px-3 py-2 text-muted-foreground">{l.requiredBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Qualification questionnaire" hint={`${rfq.questionnaire.length} questions`}>
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
