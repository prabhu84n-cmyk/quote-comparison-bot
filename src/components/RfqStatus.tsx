import { Link } from "@tanstack/react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel, Tag } from "@/components/Primitives";
import { RFQ_STATUSES, type RfqStatus, type RfqSummary } from "@/state/rfqs";

const TONE: Record<RfqStatus, "neutral" | "signal" | "ok" | "warn" | "risk"> = {
  Draft: "neutral",
  Approved: "signal",
  "Waiting for Quotes": "warn",
  Awarded: "ok",
  Closed: "risk",
};

export function StatusTag({ status }: { status: RfqStatus }) {
  return <Tag tone={TONE[status]}>{status}</Tag>;
}

export function StatusSelect({
  value,
  onChange,
  className,
}: {
  value: RfqStatus;
  onChange: (s: RfqStatus) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RfqStatus)}>
      <SelectTrigger className={className ?? "h-8 w-[190px] bg-chassis text-[13px]"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RFQ_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-[13px]">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RfqGrid({ rows }: { rows: RfqSummary[] }) {
  return (
    <Panel title="Requisitions" hint={`${rows.length} RFQ${rows.length === 1 ? "" : "s"}`}>
      <table className="w-full text-[13px]">
        <thead className="bg-chassis">
          <tr className="etched">
            {["RFQ ID", "RFQ name", "Product category", "Lines", "Submission deadline", "Status"].map((h) => (
              <th key={h} className="rail-label px-3 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
              <td className="num px-3 py-2">
                <Link
                  to={r.seed ? "/" : "/rfq/$id"}
                  params={{ id: r.id }}
                  className="text-signal hover:underline"
                >
                  {r.id}
                </Link>
              </td>
              <td className="max-w-[520px] px-3 py-2">{r.title}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.productCategory}</td>
              <td className="num px-3 py-2 text-right text-muted-foreground">{r.lineItems}</td>
              <td className="num px-3 py-2 text-muted-foreground">{r.submissionDeadline}</td>
              <td className="px-3 py-2">
                <StatusTag status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
