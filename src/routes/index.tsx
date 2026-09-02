import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RfqGrid } from "@/components/RfqStatus";
import { useRfqStore } from "@/state/rfqs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Requisitions — Corrugated Packaging Sourcing Desk" },
      {
        name: "description",
        content:
          "Manage RFQs, review vendor responses, and run AI-powered side-by-side quote comparisons.",
      },
      { property: "og:title", content: "Requisitions — Corrugated Packaging Sourcing Desk" },
      {
        property: "og:description",
        content: "RFQ list, vendor ingestion, and AI comparison workspace.",
      },
    ],
  }),
  component: RfqListPage,
});

function RfqListPage() {
  const { summaries } = useRfqStore();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rail-label">Step 01 · Requisition</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Requisitions</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Create, review and issue RFQs. Click a requisition to open its detail page.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild>
            <Link to="/rfq/new">
              <Plus className="size-4" /> New RFQ
            </Link>
          </Button>
          <Button asChild>
            <Link to="/inbox">
              Vendor responses <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <RfqGrid rows={summaries} />
    </div>
  );
}
