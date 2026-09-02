import type { Rfq } from "@/lib/types";

/**
 * Vendor-facing RFQ deck (.pptx). Same visibility rules as the PDF pack:
 * no copilot interactions, no questionnaire weights, no internal targets.
 */
const INK = "1B1F24";
const MUTED = "5B6470";
const RULE = "D5D9DF";
const BAND = "EBEDF0";

export function rfqPptxFileName(rfq: Rfq) {
  return `${rfq.id}-RFQ.pptx`;
}

export async function buildRfqPptxBlob(rfq: Rfq): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5in
  pptx.title = `${rfq.id} — ${rfq.title}`;

  const slide = (heading: string) => {
    const s = pptx.addSlide();
    s.addText(heading, { x: 0.5, y: 0.35, w: 9, h: 0.4, fontSize: 20, bold: true, color: INK });
    s.addText(`${rfq.id} · ${rfq.buyingOrganization}`, {
      x: 9.4, y: 0.4, w: 3.5, h: 0.3, fontSize: 10, color: MUTED, align: "right",
    });
    s.addShape("line", { x: 0.5, y: 0.85, w: 12.33, h: 0, line: { color: RULE, width: 1 } });
    return s;
  };

  const tableOpts = {
    x: 0.5,
    w: 12.33,
    border: { type: "solid" as const, color: RULE, pt: 1 },
    fontSize: 10,
    color: INK,
    valign: "middle" as const,
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageLineWeight: -0.4,
    margin: 5,
  };

  const head = (cells: string[]) =>
    cells.map((t) => ({
      text: t,
      options: { bold: true, fill: { color: BAND }, color: INK },
    }));

  // Cover
  const cover = pptx.addSlide();
  cover.addText("REQUEST FOR QUOTATION", { x: 0.7, y: 2.1, w: 12, h: 0.4, fontSize: 12, bold: true, color: MUTED, charSpacing: 2 });
  cover.addText(rfq.title, { x: 0.7, y: 2.6, w: 12, h: 1.2, fontSize: 34, bold: true, color: INK });
  cover.addText(rfq.purpose, { x: 0.7, y: 3.9, w: 11, h: 1.2, fontSize: 13, color: MUTED });
  cover.addText(
    `${rfq.id}   ·   ${rfq.buyingOrganization}   ·   Submission deadline ${rfq.submissionDeadline}`,
    { x: 0.7, y: 5.4, w: 12, h: 0.4, fontSize: 12, color: INK },
  );

  // Overview
  const overview = slide("RFQ overview");
  const rows: [string, string][] = [
    ["Buying organization", rfq.buyingOrganization],
    ["Business unit", rfq.businessUnit],
    ["Buyer contact", `${rfq.buyerContact} · ${rfq.buyerEmail}`],
    ["Category", rfq.productCategory],
    ["Issue date", rfq.issueDate],
    ["Questions deadline", rfq.questionsDeadline],
    ["Submission deadline", rfq.submissionDeadline],
    ["Expected award date", rfq.expectedAwardDate],
    ["Quote validity", rfq.quoteValidity],
    ["Delivery location", rfq.deliveryLocation],
    ["Required by", rfq.expectedDeliveryDate],
    ["Contract duration", rfq.contractDuration],
    ["Estimated annual quantity", rfq.estimatedTotalQuantity.toLocaleString("en-IN")],
    ["Quoting currency", `${rfq.currency} (other currencies accepted, state the currency)`],
    ["Taxes", rfq.taxable ? "Quote exclusive of tax; state applicable tax rate" : "Not taxable"],
    ["Partial quotation", rfq.partialQuotationAllowed ? "Allowed" : "Not allowed"],
    ["Alternative products", rfq.alternativeProductAllowed ? "Allowed with full specification" : "Not allowed"],
    ["Partial award", rfq.partialAwardAllowed ? "Buyer may award by line" : "Single award"],
  ];
  overview.addTable(
    rows.map(([k, v]) => [
      { text: k, options: { bold: true, color: MUTED } },
      { text: v },
    ]),
    { ...tableOpts, y: 1.05, colW: [3.3, 9.03], fontSize: 9 },
  );

  // Submission instructions
  const instr = slide("Submission instructions");
  instr.addText(rfq.submissionInstructions, { x: 0.5, y: 1.15, w: 12.33, h: 4, fontSize: 14, color: INK });

  // Line items
  const lines = slide(`Line items (${rfq.lineItems.length})`);
  lines.addText("Quote the item number shown against each line on your quotation for identification.", {
    x: 0.5, y: 0.9, w: 12.33, h: 0.3, fontSize: 10, color: MUTED,
  });
  lines.addTable(
    [
      head(["#", "Item number", "Description", "Specification", "Qty", "UOM", "kg/unit", "Required by", "Substitute", "Unit price"]),
      ...rfq.lineItems.map((l) => [
        String(l.lineNo),
        l.sku,
        l.description,
        l.specification,
        l.quantity.toLocaleString("en-IN"),
        l.uom,
        String(l.kgPerUnit),
        l.requiredBy,
        l.substituteAllowed ? "Allowed" : "No",
        "",
      ]),
    ],
    { ...tableOpts, y: 1.3, fontSize: 8, colW: [0.4, 1.2, 2.5, 3.03, 0.8, 0.7, 0.7, 1.1, 0.9, 1.0] },
  );

  // Questionnaire
  const q = slide("Qualification questionnaire");
  q.addText("Answer every question in full — incomplete questionnaires may disqualify the quote.", {
    x: 0.5, y: 0.9, w: 12.33, h: 0.3, fontSize: 10, color: MUTED,
  });
  q.addTable(
    [
      head(["Ref", "Qualification question", "Your response"]),
      ...rfq.questionnaire.map((item) => [item.id, item.question, ""]),
    ],
    { ...tableOpts, y: 1.3, fontSize: 9, colW: [0.9, 7.43, 4.0] },
  );

  const out = (await pptx.write({ outputType: "blob" })) as Blob;
  return out;
}

export async function downloadRfqPptx(rfq: Rfq) {
  const blob = await buildRfqPptxBlob(rfq);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = rfqPptxFileName(rfq);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
