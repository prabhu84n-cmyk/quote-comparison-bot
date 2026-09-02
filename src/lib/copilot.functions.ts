import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Rfq } from "@/lib/types";

const Input = z.object({
  instruction: z.string(),
  /** Full current RFQ document (already includes any unsaved edits). */
  rfq: z.record(z.string(), z.any()),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

export interface RfqChange {
  field: string;
  label: string;
  from: string;
  to: string;
  rationale: string;
}

export interface LineOp {
  op: "add" | "update" | "delete";
  lineNo: number | null;
  fields: Record<string, string | number | boolean | null>;
  rationale: string;
}

export interface QuestionOp {
  op: "add" | "update" | "delete";
  id: string | null;
  question?: string;
  type?: "boolean" | "number";
  target?: boolean | number;
  weight?: number;
  rationale: string;
}

export interface CopilotReply {
  reply: string;
  changes: RfqChange[];
  lineOps: LineOp[];
  questionOps: QuestionOp[];
  gaps: string[];
}

const EDITABLE = [
  ["title", "RFQ title"],
  ["purpose", "Purpose"],
  ["questionsDeadline", "Questions deadline"],
  ["submissionDeadline", "Submission deadline"],
  ["expectedAwardDate", "Expected award date"],
  ["quoteValidity", "Quote validity"],
  ["deliveryLocation", "Delivery location"],
  ["expectedDeliveryDate", "Expected delivery date"],
  ["contractDuration", "Contract duration"],
  ["currency", "Currency"],
  ["submissionInstructions", "Submission instructions"],
] as const;

export const rfqCopilot = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<CopilotReply> => {
    const { chatText, parseJsonLoose, ANALYST_MODEL } = await import("./ai.server");

    const current = data.rfq as unknown as Rfq;
    const snapshot = EDITABLE.map(
      ([f, l]) => `${f} (${l}) = ${String((current as unknown as Record<string, unknown>)[f])}`,
    ).join("\n");
    const lines = (current.lineItems ?? [])
      .map(
        (l) =>
          `${l.lineNo} | sku=${l.sku} | ${l.description} | spec=${l.specification} | qty=${l.quantity} ${l.uom} | kgPerUnit=${l.kgPerUnit} | requiredBy=${l.requiredBy}`,
      )
      .join("\n");
    const questions = (current.questionnaire ?? [])
      .map((q) => `${q.id} | ${q.question} | type=${q.type} | target=${String(q.target)} | weight=${q.weight}`)
      .join("\n");

    const raw = await chatText({
      model: ANALYST_MODEL,
      jsonMode: true,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are the RFQ drafting copilot for a category buyer. You amend an RFQ that is being prepared for issue: its header fields, its line items and its qualification questionnaire. You also flag anything that would make vendor responses hard to compare later.

Rules:
- Header changes: only the editable fields listed. Dates are ISO (YYYY-MM-DD) and must stay in sequence: questions deadline < submission deadline < award date < delivery date.
- Line items: use "lineOps". op "add" (lineNo null, supply fields), "update" (existing lineNo + only the changed fields), "delete" (existing lineNo). Line item fields: sku, description, specification, quantity, uom, kgPerUnit, requiredBy, ply, category, subCategory, deliveryLocation, substituteAllowed, mandatorySpec, notes.
- Questionnaire: use "questionOps". op "add" (id null), "update" (existing id + changed fields), "delete" (existing id). Fields: question, type ("boolean" or "number"), target (boolean for boolean type, number for number type), weight (integer).
- Only act on what the buyer asked. Never invent bulk deletions. If the instruction is vague, make the smallest reasonable change and state your assumption.
- "gaps" lists remaining risks that weaken comparability. Be specific and short. Empty array if nothing.
Return JSON: {"reply": string, "changes": [{"field","label","from","to","rationale"}], "lineOps": [{"op","lineNo","fields",'rationale'}], "questionOps": [{"op","id","question","type","target","weight","rationale"}], "gaps": string[]}. JSON only.`,
        },
        {
          role: "user",
          content: `RFQ ${current.id} — category ${current.productCategory}. Today is ${current.issueDate}.

EDITABLE HEADER FIELDS:
${snapshot}

LINE ITEMS (${current.lineItems?.length ?? 0}):
${lines || "(none)"}

QUESTIONNAIRE (${current.questionnaire?.length ?? 0}):
${questions || "(none)"}`,
        },
        ...data.history.slice(-6).map((m) => ({ role: m.role, content: m.content }) as const),
        { role: "user", content: data.instruction },
      ],
    });

    const parsed = parseJsonLoose<CopilotReply>(raw);
    const allowed = new Set(EDITABLE.map(([f]) => f as string));
    return {
      reply: parsed.reply ?? "",
      changes: (parsed.changes ?? []).filter((c) => allowed.has(c.field)),
      lineOps: (parsed.lineOps ?? []).filter((o) => o && (o.op === "add" || o.op === "update" || o.op === "delete")),
      questionOps: (parsed.questionOps ?? []).filter(
        (o) => o && (o.op === "add" || o.op === "update" || o.op === "delete"),
      ),
      gaps: parsed.gaps ?? [],
    };
  });
