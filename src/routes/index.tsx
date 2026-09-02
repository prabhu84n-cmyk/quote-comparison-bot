import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RfqGrid } from "@/components/RfqStatus";
import { RFQ_STATUSES, useRfqStore, type RfqStatus } from "@/state/rfqs";

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
  const [statusFilter, setStatusFilter] = useState<RfqStatus | "all">("all");

  const rows = statusFilter === "all" ? summaries : summaries.filter((r) => r.status === statusFilter);

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
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RfqStatus | "all")}>
            <SelectTrigger className="h-9 w-[190px] bg-chassis text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[13px]">
                All statuses
              </SelectItem>
              {RFQ_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-[13px]">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild>
            <Link to="/rfq/new">
              <Plus className="size-4" /> New RFQ
            </Link>
          </Button>
        </div>
      </div>

      <RfqGrid rows={rows} />
    </div>
  );
}
