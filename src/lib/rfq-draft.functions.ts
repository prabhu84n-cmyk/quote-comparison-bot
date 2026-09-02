import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  instruction: z.string(),
  /** Current (possibly empty) form state. */
  form: z.record(z.string(), z.any()),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

export interface DraftPatch {
  reply: string;
  header: Record<string, string>;
  lineItems: Array<Record<string, string | number | boolean | null>>;
  /** replace = swap the whole list, append = add to what's there. */
  lineMode: "replace" | "append";
  questionnaire: Array<{ question: string; type: "boolean" | "number"; target: boolean | number; weight: number }>;
  questionMode: "replace" | "append";
  gaps: string[];
}

const HEADER_FIELDS = [
  "title",
  "buyingOrganization",
  "businessUnit",
  "buyerContact",
  "buyerEmail",
  "productCategory",
  "purpose",
  "issueDate",
  "questionsDeadline",
  "submissionDeadline",
  "expectedAwardDate",
  "quoteValidity",
  "deliveryLocation",
  "expectedDeliveryDate",
  "contractDuration",
  "currency",
  "submissionInstructions",
];

export const draftRfqFromText = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<DraftPatch> => {
    const { chatText, parseJsonLoose, ANALYST_MODEL } = await import("./ai.server");

    const today = new Date().toISOString().slice(0, 10);
    const raw = await chatText({
      model: ANALYST_MODEL,
      jsonMode: true,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are a drafting copilot that fills in a new RFQ creation form from a buyer's free-text (often dictated) description. Today is ${today}.

Return only fields the buyer implied or that are safe, standard defaults; leave anything unknown out of "header" entirely (do not blank existing values).
Header fields allowed: ${HEADER_FIELDS.join(", ")}. Dates are ISO YYYY-MM-DD and must stay in sequence: issueDate <= questionsDeadline < submissionDeadline < expectedAwardDate < expectedDeliveryDate.
Line item fields: sku, category, subCategory, description, ply (number), specification, quantity (number), uom, kgPerUnit (number), deliveryLocation, requiredBy (ISO date), substituteAllowed (boolean), mandatorySpec, notes. Omit lineNo.
Questionnaire items: question, type ("boolean" or "number"), target (boolean for boolean, number for number), weight (integer). WEIGHTS OF ALL QUESTIONNAIRE ITEMS MUST SUM TO EXACTLY 100.
Use lineMode/questionMode "append" when the buyer adds to what already exists, "replace" when they restate the whole list. If you propose no line items or no questions, return empty arrays with mode "append".
"gaps" lists short, specific missing details the buyer should still supply.
Return JSON: {"reply": string, "header": object, "lineItems": array, "lineMode": "replace"|"append", "questionnaire": array, "questionMode": "replace"|"append", "gaps": string[]}. JSON only.`,
        },
        {
          role: "user",
          content: `CURRENT FORM STATE (JSON):\n${JSON.stringify(data.form).slice(0, 12000)}`,
        },
        ...data.history.slice(-6).map((m) => ({ role: m.role, content: m.content }) as const),
        { role: "user", content: data.instruction },
      ],
    });

    const parsed = parseJsonLoose<DraftPatch>(raw);
    const header: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.header ?? {})) {
      if (HEADER_FIELDS.includes(k) && v != null && String(v).trim() !== "") header[k] = String(v);
    }
    return {
      reply: parsed.reply ?? "",
      header,
      lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
      lineMode: parsed.lineMode === "replace" ? "replace" : "append",
      questionnaire: Array.isArray(parsed.questionnaire) ? parsed.questionnaire : [],
      questionMode: parsed.questionMode === "replace" ? "replace" : "append",
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    };
  });
