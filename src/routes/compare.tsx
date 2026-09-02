import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Award, Info, Loader2, Play, Sparkles } from "lucide-react";
import { rfq } from "@/data/rfq";
import { vendors } from "@/data/vendors";
import { useWorkspace } from "@/state/workspace";
import { Button } from "@/components/ui/button";
import { Panel, Stat, Tag, Confidence, inr } from "@/components/Primitives";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { NormalizedCell } from "@/lib/types";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Quote Comparison — Normalised Side by Side" },
      {
        name: "description",
        content:
          "Landed unit prices normalised across currencies, pack sizes and per-kilogram rates, with confidence and evidence on every extracted value.",
      },
      { property: "og:title", content: "Quote Comparison — Normalised Side by Side" },
      {
        property: "og:description",
        content: "One comparable number per vendor per line, with the arithmetic shown.",
      },
    ],
  }),
  component: ComparePage,
});

const STATE_TONE = {
  ok: "ok",
  assumed: "warn",
  missing: "neutral",
  unmatched: "risk",
} as const;

function ComparePage() {
  const { comparison, extractions, runAll, busy, awards, award } = useWorkspace();
  const [detail, setDetail] = useState<NormalizedCell | null>(null);
  const [commonBasket, setCommonBasket] = useState(true);

  const ids = useMemo(() => vendors.filter((v) => extractions.some((e) => e.vendorId === v.id)), [extractions]);

  const basketLines = useMemo(() => {
    if (!comparison) return [];
    return rfq.lineItems
      .filter((l) =>
        ids.every((v) =>
          comparison.cells.some(
            (c) => c.vendorId === v.id && c.lineNo === l.lineNo && c.unitPriceLanded != null,
          ),
        ),
      )
      .map((l) => l.lineNo);
  }, [comparison, ids]);

  const totals = useMemo(() => {
    if (!comparison) return {};
    const out: Record<string, number> = {};
    for (const v of ids) {
      out[v.id] = comparison.cells
        .filter(
          (c) =>
            c.vendorId === v.id &&
            c.extendedTotal != null &&
            (!commonBasket || basketLines.includes(c.lineNo)),
        )
        .reduce((s, c) => s + (c.extendedTotal ?? 0), 0);
    }
    return out;
  }, [comparison, ids, commonBasket, basketLines]);

  const awardValue = useMemo(() => {
    if (!comparison) return 0;
    return Object.entries(awards).reduce((s, [lineNo, vid]) => {
      const c = comparison.cells.find((x) => x.vendorId === vid && x.lineNo === Number(lineNo));
      return s + (c?.extendedTotal ?? 0);
    }, 0);
  }, [awards, comparison]);

  if (!comparison) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="panel max-w-md p-8 text-center">
          <div className="rail-label">Step 03 · Comparison</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">Nothing to compare yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Run the AI extraction over the five vendor responses and the normalised grid builds itself.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={() => void runAll()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Extract all quotes
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/inbox">Open inbox</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const cellFor = (vid: string, lineNo: number) =>
    comparison.cells.find((c) => c.vendorId === vid && c.lineNo === lineNo)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="rail-label">Step 03 · Comparison</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Normalised side by side</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
            Every figure below is a landed unit price in {comparison.currency} — vendor rate, converted to the
            RFQ&apos;s pricing unit and currency, after discounts, plus tax and a pro-rata share of order-level
            charges. Click a cell to see the arithmetic and its source.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="basket" checked={commonBasket} onCheckedChange={setCommonBasket} />
            <Label htmlFor="basket" className="rail-label cursor-pointer">
              Common basket ({basketLines.length} lines)
            </Label>
          </div>
          <Button asChild>
            <Link to="/analyst">
              <Sparkles className="size-4" /> Ask the analyst <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Stat label="Vendors compared" value={String(ids.length)} sub={`${rfq.lineItems.length} lines each`} />
        <Stat
          label="Common basket"
          value={`${basketLines.length}/${rfq.lineItems.length}`}
          sub="lines every vendor priced"
        />
        <Stat
          label="Cells needing review"
          value={String(
            comparison.cells.filter((c) => c.state === "assumed" || c.state === "unmatched").length,
          )}
          sub="assumption or unresolved unit"
        />
        <Stat
          label="Awarded value"
          value={awardValue ? `₹${inr(awardValue, 0)}` : "—"}
          sub={`${Object.keys(awards).length} lines awarded`}
        />
      </div>

      <Panel title="Vendor scorecard" hint={commonBasket ? "common basket" : "as quoted"}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="etched">
                {["Vendor", "Coverage", "Total (INR)", "Avg confidence", "Low-confidence lines", "Qualification", "Notes"].map(
                  (h) => (
                    <th key={h} className="rail-label px-4 py-2 text-left font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {comparison.summaries.map((s) => {
                const cheapest =
                  Math.min(...Object.values(totals).filter((n) => n > 0)) === (totals[s.vendorId] ?? 0);
                return (
                  <tr key={s.vendorId} className="border-b border-border/60">
                    <td className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td className="num px-4 py-2.5">
                      {s.linesQuoted}/{s.linesTotal}
                    </td>
                    <td className="num px-4 py-2.5">
                      <span className={cheapest ? "text-ok" : ""}>₹{inr(totals[s.vendorId] ?? 0, 0)}</span>
                      {cheapest && <Tag tone="ok" className="ml-2">lowest</Tag>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Confidence value={s.avgConfidence} />
                    </td>
                    <td className="num px-4 py-2.5">{s.lowConfidenceLines}</td>
                    <td className="px-4 py-2.5">
                      <Tag tone={s.qualification.qualified ? "ok" : "risk"}>
                        {s.qualification.pct}% {s.qualification.qualified ? "qualified" : "below threshold"}
                      </Tag>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {s.currencyConverted ? "FX converted · " : ""}
                      {s.linesQuoted < s.linesTotal ? `${s.linesTotal - s.linesQuoted} lines not quoted` : "full coverage"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Line-by-line" hint="landed unit price, INR">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1200px] border-separate border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="rail-label sticky left-0 z-30 border-b border-border bg-chassis px-3 py-2 text-left font-medium">
                  Line
                </th>
                {ids.map((v) => (
                  <th
                    key={v.id}
                    className="border-b border-l border-border bg-chassis px-3 py-2 text-left font-medium"
                  >
                    <div className="text-[13px]">{v.shortName}</div>
                    <div className="rail-label mt-0.5">{v.kind}</div>
                  </th>
                ))}
                <th className="rail-label border-b border-l border-border bg-chassis px-3 py-2 text-left font-medium">
                  Award
                </th>
              </tr>
            </thead>
            <tbody>
              {rfq.lineItems.map((item) => {
                const row = ids.map((v) => cellFor(v.id, item.lineNo));
                const priced = row.filter((c) => c.unitPriceLanded != null);
                const best = priced.length
                  ? Math.min(...priced.map((c) => c.unitPriceLanded!))
                  : null;
                return (
                  <tr key={item.lineNo} className="group">
                    <td className="sticky left-0 z-10 border-b border-border/60 bg-background/95 px-3 py-2 align-top backdrop-blur">
                      <div className="flex items-baseline gap-2">
                        <span className="num text-muted-foreground">{item.lineNo}</span>
                        <span className="font-medium">{item.description}</span>
                      </div>
                      <div className="rail-label mt-0.5">
                        {item.sku} · {item.quantity.toLocaleString("en-IN")} {item.uom}
                      </div>
                    </td>
                    {row.map((c) => {
                      const isBest = best != null && c.unitPriceLanded === best;
                      return (
                        <td
                          key={c.vendorId}
                          className="border-b border-l border-border/60 p-0 align-top"
                        >
                          <button
                            onClick={() => setDetail(c)}
                            className={[
                              "h-full w-full px-3 py-2 text-left transition-colors hover:bg-secondary/70",
                              isBest ? "bg-ok-soft" : "",
                              c.state === "missing" ? "scanline" : "",
                            ].join(" ")}
                          >
                            <div className="flex items-center gap-2">
                              <span className={["num font-medium", isBest ? "text-ok" : ""].join(" ")}>
                                {c.unitPriceLanded == null ? "—" : `₹${inr(c.unitPriceLanded)}`}
                              </span>
                              {c.state !== "ok" && (
                                <Tag tone={STATE_TONE[c.state]}>{c.state}</Tag>
                              )}
                              {c.shortSupply && <Tag tone="warn">short</Tag>}
                              {c.compliance === "substitute" && <Tag tone="warn">sub</Tag>}
                              {c.compliance === "no" && <Tag tone="risk">non-comp</Tag>}
                            </div>
                            <div className="mt-1 truncate text-xs text-muted-foreground" title={c.statedText}>
                              {c.statedText}
                            </div>
                            {c.unitPriceLanded != null && (
                              <div className="mt-1">
                                <Confidence value={c.confidence} />
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-border/60 px-2 py-2 align-top">
                      <select
                        value={awards[String(item.lineNo)] ?? ""}
                        onChange={(e) => award(item.lineNo, e.target.value || null)}
                        className="num w-full rounded-sm border border-border bg-background px-2 py-1 text-xs outline-none focus:border-signal"
                      >
                        <option value="">—</option>
                        {ids
                          .filter((v) => cellFor(v.id, item.lineNo).unitPriceLanded != null)
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.shortName}
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Questionnaire responses" hint="scored against buyer thresholds">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="etched">
                <th className="rail-label px-4 py-2 text-left font-medium">Question</th>
                {comparison.summaries.map((s) => (
                  <th key={s.vendorId} className="rail-label px-4 py-2 text-left font-medium">
                    {s.name.split(" ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rfq.questionnaire.map((q) => (
                <tr key={q.id} className="border-b border-border/60">
                  <td className="px-4 py-2.5">
                    <div>{q.question}</div>
                    <div className="rail-label mt-0.5">
                      target {typeof q.target === "boolean" ? (q.target ? "yes" : "no") : `≥ ${q.target}`} · weight{" "}
                      {q.weight}
                    </div>
                  </td>
                  {comparison.summaries.map((s) => {
                    const a = s.qualification.answers.find((x) => x.id === q.id)!;
                    return (
                      <td key={s.vendorId} className="px-4 py-2.5 align-top">
                        <Tag tone={a.pass === null ? "neutral" : a.pass ? "ok" : "risk"}>
                          {a.normalized === "—" ? "no answer" : a.normalized}
                        </Tag>
                        <div className="mt-1 max-w-[220px] text-xs text-muted-foreground" title={a.evidence}>
                          {a.stated}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">
                  Line {detail.lineNo} ·{" "}
                  {rfq.lineItems.find((l) => l.lineNo === detail.lineNo)?.description}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-8">
                <div>
                  <div className="rail-label">Vendor</div>
                  <div className="mt-1 text-[13px]">
                    {vendors.find((v) => v.id === detail.vendorId)?.name}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="rail-label">As quoted</div>
                    <div className="num mt-1 text-[13px]">{detail.statedText}</div>
                  </div>
                  <div>
                    <div className="rail-label">Landed unit price</div>
                    <div className="num mt-1 text-lg font-semibold">
                      {detail.unitPriceLanded == null ? "—" : `₹${inr(detail.unitPriceLanded)}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Tag tone={STATE_TONE[detail.state]}>{detail.state}</Tag>
                  <Confidence value={detail.confidence} />
                </div>

                <div>
                  <div className="rail-label">Evidence</div>
                  <p className="mt-1.5 rounded-sm border border-border bg-background/60 px-3 py-2 text-[13px] leading-relaxed">
                    {detail.evidence}
                  </p>
                  {detail.raw?.matchBasis && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="rail-label">Match · </span>
                      {detail.raw.matchBasis} ({Math.round((detail.raw.matchConfidence ?? 0) * 100)}%)
                    </p>
                  )}
                </div>

                {detail.notes.length > 0 && (
                  <div>
                    <div className="rail-label">Normalisation trail</div>
                    <ul className="mt-1.5 space-y-1.5 text-[13px] text-muted-foreground">
                      {detail.notes.map((n, i) => (
                        <li key={i} className="flex gap-2">
                          <Info className="mt-0.5 size-3.5 shrink-0 text-signal" />
                          {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <Field label="Compliance" value={detail.compliance} />
                  <Field label="Lead time" value={detail.leadTimeDays ? `${detail.leadTimeDays} days` : "—"} />
                  <Field
                    label="Available qty"
                    value={detail.availableQty != null ? detail.availableQty.toLocaleString("en-IN") : "—"}
                  />
                  <Field label="Extended total" value={detail.extendedTotal == null ? "—" : `₹${inr(detail.extendedTotal, 0)}`} />
                  {detail.deviation && <Field label="Deviation" value={detail.deviation} full />}
                  {detail.substitute && <Field label="Substitute offered" value={detail.substitute} full />}
                </div>

                {detail.unitPriceLanded != null && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      award(detail.lineNo, detail.vendorId);
                      setDetail(null);
                    }}
                  >
                    <Award className="size-4" /> Award this line to{" "}
                    {vendors.find((v) => v.id === detail.vendorId)?.shortName}
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="rail-label">{label}</div>
      <div className="num mt-0.5">{value}</div>
    </div>
  );
}
