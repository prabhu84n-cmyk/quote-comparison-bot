import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Rfq } from "@/lib/types";

/**
 * Vendor-facing RFQ pack. Deliberately omits internal buyer artefacts:
 * copilot interactions, questionnaire weights and scoring targets.
 */
function buildRfqPdfDoc(rfq: Rfq) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 40;
  const W = doc.internal.pageSize.getWidth();
  let y = M;

  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(120);
  doc.text("REQUEST FOR QUOTATION", M, y);
  doc.text(rfq.id, W - M, y, { align: "right" });
  y += 20;

  doc.setFontSize(15).setTextColor(20);
  const title = doc.splitTextToSize(rfq.title, W - M * 2) as string[];
  doc.text(title, M, y);
  y += title.length * 18 + 6;

  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(70);
  const purpose = doc.splitTextToSize(rfq.purpose, W - M * 2) as string[];
  doc.text(purpose, M, y);
  y += purpose.length * 12 + 10;

  const header: [string, string][] = [
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

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 4, textColor: 40, lineColor: 210 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 150, textColor: 90 } },
    body: header,
    margin: { left: M, right: M },
  });

  const afterHeader = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: afterHeader + 18,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 4, textColor: 60 },
    head: [["Submission instructions"]],
    headStyles: { fontStyle: "bold", fontSize: 9.5, textColor: 20 },
    body: [[rfq.submissionInstructions]],
    margin: { left: M, right: M },
  });

  doc.addPage();
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(20);
  doc.text(`Line items (${rfq.lineItems.length})`, M, M);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(60);
  doc.text(
    "Quote the item number shown against each line on your quotation for identification.",
    M,
    M + 13,
  );

  autoTable(doc, {
    startY: M + 24,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 3, textColor: 40, lineColor: 215, overflow: "linebreak" },
    headStyles: { fillColor: [235, 237, 240], textColor: 30, fontStyle: "bold" },
    head: [["#", "Item number", "Description", "Specification", "Qty", "UOM", "kg/unit", "Required by", "Substitute", "Unit price"]],
    body: rfq.lineItems.map((l) => [
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
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 54 },
      3: { cellWidth: 120 },
      4: { cellWidth: 34, halign: "right" },
      5: { cellWidth: 30 },
      6: { cellWidth: 30, halign: "right" },
      7: { cellWidth: 48 },
      8: { cellWidth: 40 },
      9: { cellWidth: 52 },
    },
    margin: { left: M, right: M },
  });

  const afterLines = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  autoTable(doc, {
    startY: afterLines + 18,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 4, textColor: 40, lineColor: 215 },
    headStyles: { fillColor: [235, 237, 240], textColor: 30, fontStyle: "bold" },
    head: [["Ref", "Qualification question", "Your response"]],
    body: rfq.questionnaire.map((q) => [q.id, q.question, ""]),
    columnStyles: { 0: { cellWidth: 40 }, 2: { cellWidth: 120 } },
    margin: { left: M, right: M },
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(140);
    doc.text(
      `${rfq.buyingOrganization} · ${rfq.id} · Responses to ${rfq.buyerEmail}`,
      M,
      doc.internal.pageSize.getHeight() - 20,
    );
    doc.text(`Page ${p} of ${pages}`, W - M, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  return doc;
}

export function rfqPdfFileName(rfq: Rfq) {
  return `${rfq.id}-RFQ.pdf`;
}

export function buildRfqPdfBlob(rfq: Rfq): Blob {
  return buildRfqPdfDoc(rfq).output("blob");
}

export function downloadRfqPdf(rfq: Rfq) {
  buildRfqPdfDoc(rfq).save(rfqPdfFileName(rfq));
}
