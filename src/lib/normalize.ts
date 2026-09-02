import { rfq } from "@/data/rfq";
import { vendors } from "@/data/vendors";
import type {
  Comparison,
  ExtractedLine,
  NormalizedCell,
  QualificationResult,
  VendorExtraction,
  VendorSummary,
} from "./types";

/** Buyer-set reference rates. Held here so every conversion is auditable. */
export const FX: Record<string, number> = {
  INR: 1,
  USD: 87.4,
  SGD: 65.2,
  EUR: 95.1,
  GBP: 111.3,
};

export const QUALIFY_THRESHOLD = 60;

const round = (n: number) => Math.round(n * 100) / 100;

function bestLineFor(lines: ExtractedLine[], lineNo: number): ExtractedLine | undefined {
  const cands = lines.filter((l) => l.rfqLineNo === lineNo);
  if (!cands.length) return undefined;
  return cands.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
}

function statedText(l: ExtractedLine, fallbackCurrency: string): string {
  const p = l.statedPrice;
  if (p?.amount == null) return l.quotedDescription ? `no price — ${l.quotedDescription}` : "no price stated";
  const cur = p.currency ?? fallbackCurrency;
  const basis =
    p.basisText ??
    (p.basis === "per_kg"
      ? "per kg"
      : p.basis === "per_pack"
        ? `per pack of ${p.packQty ?? "?"}`
        : "per unit");
  return `${cur} ${p.amount.toLocaleString("en-IN")} ${basis}`;
}

export interface OverrideMap {
  /** `${vendorId}:${lineNo}` -> buyer-approved landed unit price. */
  [key: string]: { unitPriceLanded: number; note: string } | undefined;
}

export function buildComparison(
  extractions: VendorExtraction[],
  overrides: OverrideMap = {},
): Comparison {
  const cells: NormalizedCell[] = [];
  const summaries: VendorSummary[] = [];

  for (const ex of extractions) {
    const vendor = vendors.find((v) => v.id === ex.vendorId);
    const docCurrency = ex.charges?.currency ?? "INR";
    const vendorCells: NormalizedCell[] = [];
    let currencyConverted = false;

    // Pass 1 — per-line net value in RFQ currency.
    for (const item of rfq.lineItems) {
      const raw = bestLineFor(ex.lines ?? [], item.lineNo);
      const key = `${ex.vendorId}:${item.lineNo}`;

      if (!raw) {
        vendorCells.push({
          vendorId: ex.vendorId,
          lineNo: item.lineNo,
          state: "missing",
          statedText: "not quoted",
          unitPriceLanded: null,
          unitPriceNet: null,
          extendedTotal: null,
          confidence: 1,
          evidence: "No matching row found in this vendor's submission.",
          compliance: "unknown",
          deviation: null,
          substitute: null,
          leadTimeDays: null,
          availableQty: null,
          shortSupply: false,
          notes: ["Vendor did not quote this line."],
        });
        continue;
      }

      const notes: string[] = [...(raw.issues ?? [])];
      const p = raw.statedPrice ?? { amount: null, currency: null, basis: "unknown", packQty: null, basisText: null };
      let net: number | null = null;
      let assumed = false;

      if (p.amount != null && p.basis !== "unknown") {
        if (p.basis === "per_unit") {
          net = p.amount;
        } else if (p.basis === "per_pack") {
          const packQty = p.packQty && p.packQty > 0 ? p.packQty : null;
          if (packQty) {
            net = p.amount / packQty;
            notes.push(`Pricing unit converted: ${p.basisText ?? `pack of ${packQty}`} ÷ ${packQty} → per ${item.uom}.`);
          } else {
            assumed = true;
            net = null;
            notes.push("Pack quantity not stated — price per unit cannot be derived safely.");
          }
        } else if (p.basis === "per_kg") {
          net = p.amount * item.kgPerUnit;
          assumed = true;
          notes.push(
            `UOM converted: ${p.amount}/kg × ${item.kgPerUnit} kg per ${item.uom} (board weight from the RFQ spec, not from the vendor) → per ${item.uom}.`,
          );
        }
      }

      const cur = (p.currency ?? docCurrency ?? "INR").toUpperCase();
      if (net != null && cur !== rfq.currency) {
        const rate = FX[cur];
        if (rate) {
          net = net * rate;
          currencyConverted = true;
          notes.push(`Currency converted ${cur} → ${rfq.currency} at ${rate} (buyer reference rate).`);
        } else {
          notes.push(`Currency ${cur} has no reference rate — value left unconverted.`);
          assumed = true;
        }
      }

      // Discounts
      const lineDisc = raw.lineDiscountPct ?? 0;
      const orderDisc = ex.charges?.orderLevelDiscountPct ?? 0;
      if (net != null && (lineDisc || orderDisc)) {
        net = net * (1 - lineDisc / 100) * (1 - orderDisc / 100);
        if (lineDisc) notes.push(`Line discount ${lineDisc}% applied.`);
        if (orderDisc) notes.push(`Order-level discount ${orderDisc}% applied.`);
      }

      const state: NormalizedCell["state"] =
        net == null ? (p.amount == null ? "missing" : "unmatched") : assumed ? "assumed" : "ok";

      let confidence = Math.min(raw.confidence ?? 0.5, raw.matchConfidence ?? 1);
      if (assumed) confidence *= 0.9;

      vendorCells.push({
        vendorId: ex.vendorId,
        lineNo: item.lineNo,
        state,
        statedText: statedText(raw, docCurrency),
        unitPriceLanded: null,
        unitPriceNet: net == null ? null : round(net),
        extendedTotal: null,
        confidence: Math.round(confidence * 100) / 100,
        evidence: raw.evidence || "—",
        compliance: raw.compliance ?? "unknown",
        deviation: raw.deviation,
        substitute: raw.substitute,
        leadTimeDays: raw.leadTimeDays,
        availableQty: raw.availableQty,
        shortSupply: raw.availableQty != null && raw.availableQty < item.quantity,
        notes,
        raw,
      });
      void key;
    }

    // Pass 2 — allocate order-level charges pro rata over quoted value, add tax.
    const quoted = vendorCells.filter((c) => c.unitPriceNet != null);
    const netOrderValue = quoted.reduce((s, c) => {
      const item = rfq.lineItems.find((l) => l.lineNo === c.lineNo)!;
      return s + (c.unitPriceNet ?? 0) * item.quantity;
    }, 0);

    const ch = ex.charges ?? ({} as VendorExtraction["charges"]);
    const fxDoc = FX[(ch.currency ?? "INR").toUpperCase()] ?? 1;
    let charges = 0;
    const chargeNotes: string[] = [];
    if (!ch.freightIncluded && ch.freightAmount) {
      charges += ch.freightAmount * fxDoc;
      chargeNotes.push(`freight ${ch.currency ?? "INR"} ${ch.freightAmount.toLocaleString("en-IN")}`);
    }
    if (ch.packingAmount) {
      charges += ch.packingAmount * fxDoc;
      chargeNotes.push(`packing ${ch.packingAmount.toLocaleString("en-IN")}`);
    }
    if (ch.installationAmount) {
      charges += ch.installationAmount * fxDoc;
      chargeNotes.push(`installation ${ch.installationAmount.toLocaleString("en-IN")}`);
    }
    if (ch.insuranceAmount) {
      charges += ch.insuranceAmount * fxDoc;
      chargeNotes.push(`insurance ${ch.insuranceAmount.toLocaleString("en-IN")}`);
    }
    if (ch.insurancePctOfValue) {
      charges += (netOrderValue * ch.insurancePctOfValue) / 100;
      chargeNotes.push(`insurance ${ch.insurancePctOfValue}% of value`);
    }

    for (const c of vendorCells) {
      const item = rfq.lineItems.find((l) => l.lineNo === c.lineNo)!;
      const ov = overrides[`${ex.vendorId}:${c.lineNo}`];
      if (ov) {
        c.unitPriceLanded = ov.unitPriceLanded;
        c.extendedTotal = round(ov.unitPriceLanded * item.quantity);
        c.state = "ok";
        c.confidence = 1;
        c.evidence = `Buyer-approved value. ${ov.note}`.trim();
        c.notes = [...c.notes, "Overridden by the buyer during review."];
        continue;
      }
      if (c.unitPriceNet == null) continue;
      const taxRate = ch.taxIncludedInPrice
        ? 0
        : (c.raw?.taxRatePct ?? ch.taxRatePct ?? (rfq.taxable ? 18 : 0));
      const share = netOrderValue > 0 ? (c.unitPriceNet * item.quantity) / netOrderValue : 0;
      const allocated = charges * share;
      const landed = c.unitPriceNet * (1 + taxRate / 100) + allocated / item.quantity;
      c.unitPriceLanded = round(landed);
      c.extendedTotal = round(landed * item.quantity);
      if (taxRate) c.notes.push(`Tax ${taxRate}% added.`);
      if (charges > 0 && chargeNotes.length)
        c.notes.push(`Order charges allocated pro rata (${chargeNotes.join(", ")}).`);
    }

    cells.push(...vendorCells);

    const priced = vendorCells.filter((c) => c.extendedTotal != null);
    const qualification = scoreQuestionnaire(ex);
    summaries.push({
      vendorId: ex.vendorId,
      name: vendor?.name ?? ex.vendor?.legalName ?? ex.vendorId,
      linesQuoted: priced.length,
      linesTotal: rfq.lineItems.length,
      comparableTotal: round(priced.reduce((s, c) => s + (c.extendedTotal ?? 0), 0)),
      coveredQuantityValue: round(netOrderValue),
      avgConfidence: priced.length
        ? Math.round((priced.reduce((s, c) => s + c.confidence, 0) / priced.length) * 100) / 100
        : 0,
      lowConfidenceLines: priced.filter((c) => c.confidence < 0.75).length,
      currencyConverted,
      qualification,
    });
  }

  return { currency: rfq.currency, fx: FX, cells, summaries };
}

export function scoreQuestionnaire(ex: VendorExtraction): QualificationResult {
  const answers: QualificationResult["answers"] = [];
  let score = 0;
  let max = 0;
  for (const q of rfq.questionnaire) {
    max += q.weight;
    const a = (ex.questionnaire ?? []).find((x) => x.id === q.id);
    let pass: boolean | null = null;
    let normalized = "—";
    if (a) {
      if (q.type === "boolean") {
        if (a.answerBool != null) {
          normalized = a.answerBool ? "Yes" : "No";
          pass = a.answerBool === q.target;
        }
      } else if (a.answerNumber != null) {
        normalized = String(a.answerNumber);
        pass = a.answerNumber >= (q.target as number);
      }
    }
    if (pass) score += q.weight;
    answers.push({
      id: q.id,
      question: q.question,
      stated: a?.answerText ?? "no response",
      normalized,
      pass,
      weight: q.weight,
      confidence: a?.confidence ?? 0,
      evidence: a?.evidence ?? "—",
    });
  }
  const pct = max ? Math.round((score / max) * 100) : 0;
  return { vendorId: ex.vendorId, score, maxScore: max, pct, qualified: pct >= QUALIFY_THRESHOLD, answers };
}

export function cellKey(vendorId: string, lineNo: number) {
  return `${vendorId}:${lineNo}`;
}

export function bestVendorForLine(comparison: Comparison, lineNo: number) {
  const priced = comparison.cells.filter((c) => c.lineNo === lineNo && c.unitPriceLanded != null);
  if (!priced.length) return null;
  return priced.reduce((a, b) => ((a.unitPriceLanded ?? 0) <= (b.unitPriceLanded ?? 0) ? a : b));
}
