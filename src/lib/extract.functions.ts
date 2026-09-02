import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rfq as seedRfq } from "@/data/rfq";
import { vendorById } from "@/data/vendors";
import type { Rfq, SourceKind, VendorExtraction } from "./types";

const Input = z.object({
  vendorId: z.string(),
  base64: z.string(),
  mime: z.string(),
  /** Provided for buyer-uploaded responses that are not in the seeded mailbox. */
  vendorName: z.string().optional(),
  kind: z.enum(["xlsx", "pdf", "docx", "image", "email"]).optional(),
  hint: z.string().optional(),
  docType: z.enum(["quote", "questionnaire", "both"]).optional(),
  /** The RFQ this response belongs to — line catalogue and questionnaire come from it. */
  rfqDoc: z.any().optional(),
});

const LINE_CATALOGUE = (rfq: Rfq) =>
  rfq.lineItems
    .map(
      (l) =>
        `${l.lineNo}|${l.sku}|${l.description}|${l.specification}|qty ${l.quantity} ${l.uom}|board wt ${l.kgPerUnit} kg per ${l.uom}`,
    )
    .join("\n");

const QUESTIONS = (rfq: Rfq) => rfq.questionnaire.map((q) => `${q.id}: ${q.question}`).join("\n");

const SYSTEM = `You are an extraction engine inside a procurement platform. You read one vendor's quotation, in whatever shape it arrived, and return strict JSON.

Rules that matter more than completeness:
- Never invent a number. If a value is not in the document, use null and say so in "issues".
- Record what the vendor ACTUALLY wrote. Do not convert currencies, do not convert pricing units, do not apply discounts. A separate deterministic step does all of that. Your job is faithful capture plus line matching.
- Every line and every questionnaire answer needs an "evidence" string pointing at where in this document you read it, and a "confidence" between 0 and 1 that reflects how sure you are of the VALUE, not how sure you are that the document exists.
- If a vendor gives one rate that covers several RFQ lines (for example "Rs 42/kg for all 5-ply"), emit a separate line object for each RFQ line it covers, repeat the rate, and lower confidence to reflect the inference. Explain the inference in "matchBasis".
- If you cannot map a vendor row to an RFQ line, still emit it with rfqLineNo null and describe the problem in "issues".
- Do not emit lines for RFQ items the vendor did not quote. Missing lines are handled downstream.
- Confidence should genuinely vary. A crisp spreadsheet cell is 0.95+. A number read off a blurred photo at an angle is 0.5-0.75. A rate inferred from "rest same as last year" is below 0.5.`;

function buildUserPrompt(rfq: Rfq, vendorName: string, hint: string, locationHint: string) {
  return `RFQ ${rfq.id} — ${rfq.title}
Buyer currency: ${rfq.currency}. Delivery: ${rfq.deliveryLocation}.

RFQ LINE ITEMS (lineNo|item number|description|specification|quantity|board weight). Vendors are asked to quote the item number for identification:
${LINE_CATALOGUE(rfq)}

BUYER QUESTIONNAIRE:
${QUESTIONS(rfq)}

VENDOR: ${vendorName}
Known about this submission: ${hint}
${locationHint}

Return ONE JSON object with exactly this shape:
{
  "vendor": { "legalName": string|null, "registeredAddress": string|null, "registrationDetails": string|null, "taxRegistration": string|null, "primaryContact": string|null, "contactEmail": string|null, "contactPhone": string|null },
  "quoteRef": string|null,
  "quoteDate": string|null,
  "charges": {
    "taxRatePct": number|null, "taxIncludedInPrice": boolean,
    "freightAmount": number|null, "freightBasis": string|null, "freightIncluded": boolean,
    "packingAmount": number|null, "insuranceAmount": number|null, "insurancePctOfValue": number|null,
    "installationAmount": number|null, "orderLevelDiscountPct": number|null,
    "earlyPaymentDiscount": string|null, "volumeRebate": string|null, "priceEscalation": string|null,
    "paymentTerms": string|null, "quoteValidity": string|null, "currency": string|null, "evidence": string
  },
  "fulfilment": { "partialDelivery": string|null, "deliverySchedule": string|null, "backOrderPolicy": string|null, "replacementTurnaround": string|null, "stockHeldLocally": string|null, "supplyContinuity": string|null, "deliveryCoverage": string|null },
  "lines": [ {
    "rfqLineNo": number|null,
    "matchBasis": string,
    "matchConfidence": number,
    "vendorItemCode": string|null,
    "quotedDescription": string|null,
    "statedPrice": { "amount": number|null, "currency": string|null, "basis": "per_unit"|"per_pack"|"per_kg"|"unknown", "packQty": number|null, "basisText": string|null },
    "lineDiscountPct": number|null,
    "taxRatePct": number|null,
    "compliance": "yes"|"no"|"partial"|"substitute"|"unknown",
    "deviation": string|null,
    "substitute": string|null,
    "leadTimeDays": number|null,
    "availableQty": number|null,
    "moq": number|null,
    "countryOfOrigin": string|null,
    "confidence": number,
    "evidence": string,
    "issues": string[]
  } ],
  "questionnaire": [ { "id": string, "answerText": string|null, "answerBool": boolean|null, "answerNumber": number|null, "confidence": number, "evidence": string } ],
  "overallConfidence": number,
  "warnings": string[]
}

Notes on statedPrice.basis:
- "per_unit": the price is for one of the RFQ's own units (one piece / one roll / one sheet).
- "per_pack": the price covers a multiple — set packQty to how many RFQ units are in one priced pack (e.g. bundle of 25 → 25, box of 100 → 100).
- "per_kg": the price is per kilogram of board.
Put the vendor's own wording in basisText.

Answer with JSON only.`;
}

export const extractVendorQuote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<VendorExtraction> => {
    const seeded = vendorById(data.vendorId);
    const vendor = seeded ?? {
      id: data.vendorId,
      name: data.vendorName ?? data.vendorId,
      kind: (data.kind ?? "email") as SourceKind,
      hint: data.hint ?? "Buyer-uploaded vendor response.",
      fileLabel: data.vendorName ?? data.vendorId,
    };
    const docNote =
      data.docType === "questionnaire"
        ? "This document is a questionnaire response only — expect no pricing lines. Return an empty lines array if there is no pricing."
        : data.docType === "both"
          ? "This document contains both pricing and questionnaire answers."
          : "";

    const { parseSource } = await import("./parse.server");
    const { chatText, parseJsonLoose, EXTRACTION_MODEL } = await import("./ai.server");

    const doc = (data.rfqDoc as Rfq | undefined) ?? seedRfq;
    const parsed = await parseSource(vendor.kind as SourceKind, data.base64, data.mime);
    const prompt = buildUserPrompt(doc, vendor.name, `${vendor.hint}${docNote ? ` ${docNote}` : ""}`, parsed.locationHint);

    const userContent = parsed.imageDataUrl
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: parsed.imageDataUrl } },
        ]
      : `${prompt}\n\n----- BEGIN VENDOR DOCUMENT -----\n${parsed.text}\n----- END VENDOR DOCUMENT -----`;

    const raw = await chatText({
      model: EXTRACTION_MODEL,
      jsonMode: !parsed.imageDataUrl,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    });

    const parsedJson = parseJsonLoose<Omit<VendorExtraction, "vendorId" | "model" | "extractedAt" | "sourceKind" | "sourceLabel" | "sourceExcerpt">>(raw);

    return {
      vendorId: vendor.id,
      model: EXTRACTION_MODEL,
      extractedAt: new Date().toISOString(),
      sourceKind: vendor.kind,
      sourceLabel: vendor.fileLabel,
      sourceExcerpt: parsed.imageDataUrl
        ? "Photographic source — read directly by the vision model."
        : parsed.text.slice(0, 1400),
      ...parsedJson,
      lines: (parsedJson.lines ?? []).map((l) => ({ ...l, issues: l.issues ?? [] })),
      questionnaire: parsedJson.questionnaire ?? [],
      warnings: parsedJson.warnings ?? [],
    };
  });
