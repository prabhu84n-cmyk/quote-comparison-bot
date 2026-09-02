import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rfq } from "@/data/rfq";

const Input = z.object({
  instruction: z.string(),
  current: z.record(z.string(), z.any()),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

export interface RfqChange {
  field: string;
  label: string;
  from: string;
  to: string;
  rationale: string;
}

export interface CopilotReply {
  reply: string;
  changes: RfqChange[];
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

    const current = { ...rfq, ...data.current } as Record<string, unknown>;
    const snapshot = EDITABLE.map(([f, l]) => `${f} (${l}) = ${String(current[f])}`).join("\n");

    const raw = await chatText({
      model: ANALYST_MODEL,
      jsonMode: true,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are the RFQ drafting copilot for a category buyer. You amend the header of an RFQ that is being prepared for issue, and you flag anything that would make vendor responses hard to compare later.

Rules:
- Only propose changes to the editable fields listed. Never touch line items.
- Dates are ISO (YYYY-MM-DD). Keep the sequence sane: questions deadline < submission deadline < award date < delivery date.
- If the buyer's instruction is vague, make the smallest reasonable change and say what you assumed.
- "gaps" lists things still missing or risky in the RFQ that would weaken comparability (e.g. no stated pricing unit, no incoterm, validity shorter than the award cycle). Be specific and short. Empty array if genuinely nothing.
Return JSON: {"reply": string, "changes": [{"field": string, "label": string, "from": string, "to": string, "rationale": string}], "gaps": string[]}. JSON only.`,
        },
        {
          role: "user",
          content: `Category: ${rfq.productCategory}. ${rfq.lineItems.length} line items, estimated ${rfq.estimatedTotalQuantity.toLocaleString("en-IN")} units, ${rfq.contractDuration} contract.

EDITABLE FIELDS AND CURRENT VALUES:
${snapshot}

Today is ${rfq.issueDate}.`,
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
      gaps: parsed.gaps ?? [],
    };
  });
