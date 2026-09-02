import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rfq as seedRfq } from "@/data/rfq";
import { vendors } from "@/data/vendors";
import { buildComparison, QUALIFY_THRESHOLD } from "./normalize";
import type { Rfq, VendorExtraction } from "./types";

const Input = z.object({
  question: z.string(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  extractions: z.array(z.any()),
  awards: z.record(z.string(), z.string()),
  rfqDoc: z.any().optional(),
});

export interface AnalystTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface AnalystChart {
  type: "bar" | "line";
  title: string;
  categoryKey: string;
  seriesKeys: string[];
  data: Record<string, string | number>[];
}

export interface AnalystAnswer {
  answer: string;
  table: AnalystTable | null;
  chart: AnalystChart | null;
  caveats: string[];
  basis: string[];
  csv: { filename: string; content: string } | null;
}

/** Renders the normalized comparison into the compact text the model reasons over. */
function buildContext(extractions: VendorExtraction[], awards: Record<string, string>, rfq: Rfq = seedRfq) {
  const comparison = buildComparison(extractions as VendorExtraction[], {}, rfq);
  const ids = comparison.summaries.map((s) => s.vendorId);
  const lines: string[] = [];

  lines.push(`RFQ ${rfq.id} — ${rfq.title}`);
  lines.push(
    `Currency ${rfq.currency}. FX reference rates: ${Object.entries(comparison.fx)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}. Delivery ${rfq.deliveryLocation}. ${rfq.lineItems.length} line items, ${ids.length} vendors responded.`,
  );

  lines.push("\n## VENDOR SUMMARY");
  lines.push(
    "vendorId | name | linesQuoted | comparableTotal(landed, INR, over lines they quoted) | avgConfidence | lowConfidenceLines | currencyConverted | qualificationScore% | qualified",
  );
  for (const s of comparison.summaries) {
    lines.push(
      `${s.vendorId} | ${s.name} | ${s.linesQuoted}/${s.linesTotal} | ${s.comparableTotal} | ${s.avgConfidence} | ${s.lowConfidenceLines} | ${s.currencyConverted} | ${s.qualification.pct}% | ${s.qualification.qualified}`,
    );
  }
  lines.push(`Qualification threshold is ${QUALIFY_THRESHOLD}% of the weighted questionnaire.`);

  lines.push("\n## QUESTIONNAIRE (system-scored against buyer thresholds)");
  for (const s of comparison.summaries) {
    for (const a of s.qualification.answers) {
      lines.push(
        `${s.vendorId} | ${a.id} | ${a.question} | stated="${a.stated}" | normalized=${a.normalized} | pass=${a.pass} | weight=${a.weight} | conf=${a.confidence}`,
      );
    }
  }

  lines.push("\n## COMMERCIAL / FULFILMENT TERMS PER VENDOR");
  for (const ex of extractions as VendorExtraction[]) {
    const c = ex.charges ?? ({} as VendorExtraction["charges"]);
    const f = ex.fulfilment ?? ({} as VendorExtraction["fulfilment"]);
    lines.push(
      `${ex.vendorId} | currency=${c.currency} | tax%=${c.taxRatePct} taxIncluded=${c.taxIncludedInPrice} | freight=${c.freightAmount} included=${c.freightIncluded} (${c.freightBasis ?? "-"}) | packing=${c.packingAmount} | insurance=${c.insuranceAmount ?? c.insurancePctOfValue + "%"} | orderDiscount%=${c.orderLevelDiscountPct} | earlyPay=${c.earlyPaymentDiscount} | rebate=${c.volumeRebate} | escalation=${c.priceEscalation} | payment=${c.paymentTerms} | validity=${c.quoteValidity} | partialDelivery=${f.partialDelivery} | schedule=${f.deliverySchedule} | backorder=${f.backOrderPolicy} | replacement=${f.replacementTurnaround} | localStock=${f.stockHeldLocally} | continuity=${f.supplyContinuity}`,
    );
    for (const w of ex.warnings ?? []) lines.push(`${ex.vendorId} | WARNING | ${w}`);
  }

  lines.push("\n## NORMALIZED LINE COMPARISON");
  lines.push(
    "Each cell: vendorId=landedUnitPrice(INR, incl. discounts+tax+allocated charges); state; conf; compliance; lead(days); stated=verbatim vendor value",
  );
  for (const item of rfq.lineItems) {
    const parts = ids.map((vid) => {
      const c = comparison.cells.find((x) => x.vendorId === vid && x.lineNo === item.lineNo)!;
      return `${vid}=${c.unitPriceLanded ?? "null"}; state=${c.state}; conf=${c.confidence}; compliance=${c.compliance}; lead=${c.leadTimeDays ?? "?"}; short=${c.shortSupply}; stated="${c.statedText}"${c.deviation ? `; deviation=${c.deviation}` : ""}${c.substitute ? `; substitute=${c.substitute}` : ""}`;
    });
    lines.push(
      `L${item.lineNo} | ${item.sku} | ${item.description} | spec: ${item.specification} | qty ${item.quantity} ${item.uom} | required by ${item.requiredBy}\n    ${parts.join("\n    ")}`,
    );
  }

  const awarded = Object.entries(awards).filter(([, v]) => v);
  lines.push("\n## CURRENT AWARD SELECTION");
  lines.push(awarded.length ? awarded.map(([ln, v]) => `L${ln} -> ${v}`).join(", ") : "nothing awarded yet");

  return lines.join("\n");
}

/** Maps every vendorId present in the comparison to the vendor's display name. */
function buildVendorNameMap(extractions: VendorExtraction[], rfq: Rfq = seedRfq) {
  const comparison = buildComparison(extractions as VendorExtraction[], {}, rfq);
  return Object.fromEntries(comparison.summaries.map((s) => [s.vendorId, s.name])) as Record<
    string,
    string
  >;
}

/** Replaces raw vendorIds in a text block with the corresponding vendor names. */
function humanizeVendorIds(text: string, map: Record<string, string>) {
  const ids = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = text;
  for (const id of ids) {
    out = out.split(id).join(map[id]!);
  }
  return out;
}

const SYSTEM = `You are the procurement analyst copilot inside a quote-comparison tool. A buyer with a large committed spend is deciding an award from the comparison below.

Hard rules:
- Answer ONLY from the CONTEXT given. Never invent a vendor, price, term or certificate.
- Do the arithmetic yourself from the numbers in the context. State the arithmetic when it matters.
- If data that materially affects the answer is missing, low confidence, assumed, or the vendor did not quote the line, say so explicitly and say what it changes. Do not quietly drop those lines from a total.
- Comparable totals in the context only cover the lines each vendor actually quoted. If a question compares vendors overall, either restrict to a common basket of lines all compared vendors quoted, or state clearly that coverage differs.
- When you recommend, name the basis you used (price / compliance / qualification / delivery / risk) in "basis".
- Currency-converted and per-kg-derived values rest on buyer assumptions. Flag them when they drive the conclusion.
- Be concise and specific. Numbers in Indian format where natural. No filler.

Return ONE JSON object:
{
  "answer": "markdown text, 1-4 short paragraphs or a tight bullet list",
  "table": null | { "title": string, "columns": string[], "rows": (string|number)[][] },
  "chart": null | { "type": "bar"|"line", "title": string, "categoryKey": string, "seriesKeys": string[], "data": [ { "<categoryKey>": string, "<seriesKey>": number } ] },
  "caveats": string[],
  "basis": string[],
  "csv": null | { "filename": string, "content": "comma separated with a header row" }
}
Include a table when the answer compares more than two things. Include a chart when a magnitude comparison helps. Include csv only when the buyer asks to export or the answer is a list they would paste into a sheet. JSON only.`;

export const askAnalyst = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<AnalystAnswer> => {
    const { chatText, parseJsonLoose, ANALYST_MODEL } = await import("./ai.server");
    const context = buildContext(data.extractions as VendorExtraction[], data.awards, (data.rfqDoc as Rfq | undefined) ?? seedRfq);

    const raw = await chatText({
      model: ANALYST_MODEL,
      jsonMode: true,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `CONTEXT\n${context}` },
        ...data.history.slice(-8).map((m) => ({ role: m.role, content: m.content }) as const),
        { role: "user", content: data.question },
      ],
    });

    const parsed = parseJsonLoose<AnalystAnswer>(raw);
    return {
      answer: parsed.answer ?? "No answer produced.",
      table: parsed.table ?? null,
      chart: parsed.chart ?? null,
      caveats: parsed.caveats ?? [],
      basis: parsed.basis ?? [],
      csv: parsed.csv ?? null,
    };
  });

export const suggestQuestions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ extractions: z.array(z.any()), rfqDoc: z.any().optional() }).parse(d))
  .handler(async ({ data }): Promise<string[]> => {
    const { chatText, parseJsonLoose, ANALYST_MODEL } = await import("./ai.server");
    const context = buildContext(data.extractions as VendorExtraction[], {}, (data.rfqDoc as Rfq | undefined) ?? seedRfq);
    const raw = await chatText({
      model: ANALYST_MODEL,
      jsonMode: true,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            'You suggest sharp questions a procurement analyst should ask about THIS specific comparison. Ground each one in something actually present in the data (a gap, a conversion, a conflict, an outlier). Return {"questions": string[]} with exactly 4 short questions. JSON only.',
        },
        { role: "user", content: context.slice(0, 20000) },
      ],
    });
    return parseJsonLoose<{ questions: string[] }>(raw).questions ?? [];
  });

export const vendorNames = () => vendors.map((v) => v.shortName);
