const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const EXTRACTION_MODEL = "google/gemini-3.7-flash";
export const ANALYST_MODEL = "google/gemini-3.7-flash";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GatewayError";
  }
}

/**
 * Streams a chat completion and returns the full text. Streaming matters here:
 * a 30-line extraction can run for minutes and a buffered request would be
 * severed by the platform before it returns.
 */
export async function chatText(opts: {
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
  temperature?: number;
}): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new GatewayError(401, "LOVABLE_API_KEY is not configured on the server.");

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      temperature: opts.temperature ?? 0.1,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let msg = body;
    try {
      const j = JSON.parse(body) as { error?: { message?: string }; message?: string };
      msg = j.error?.message ?? j.message ?? body;
    } catch {
      /* keep raw */
    }
    if (res.status === 429) msg = "AI rate limit reached. Wait a moment and retry.";
    if (res.status === 402) msg = msg || "AI credits exhausted for this workspace.";
    throw new GatewayError(res.status, msg || `Gateway returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) out += delta;
      } catch {
        /* partial frame, ignore */
      }
    }
  }
  return out;
}

/** Pulls the first JSON object/array out of a model response. */
export function parseJsonLoose<T>(raw: string): T {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) s = fence[1].trim();
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);

  try {
    return JSON.parse(s) as T;
  } catch {
    /* fall through to repair */
  }

  // Trim to the last complete closing brace/bracket, then try again.
  const lastEnd = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastEnd !== -1) {
    try {
      return JSON.parse(s.slice(0, lastEnd + 1)) as T;
    } catch {
      /* fall through to structural repair */
    }
  }

  return JSON.parse(repairJson(s)) as T;
}

/**
 * Repairs a truncated JSON document: drops any trailing partial token, then
 * closes every string, array and object the model left open. Truncation is the
 * dominant failure mode when a long extraction hits the model's token ceiling.
 */
function repairJson(input: string): string {
  /** Closes every array/object still open; null when a string is left open. */
  const close = (text: string): string | null => {
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    for (const ch of text) {
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") stack.pop();
    }
    if (inStr) return null;
    let out = text;
    while (stack.length) out += stack.pop();
    return out;
  };

  // Chop one trailing token at a time until the closed document parses.
  let s = input;
  const token = /\s*(?:"(?:[^"\\]|\\.)*"|[^"{}[\],:]+|[,:{["])\s*$/;
  for (let i = 0; i < 5000 && s.length > 0; i++) {
    const candidate = close(s);
    if (candidate) {
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        /* keep chopping */
      }
    }
    const next = s.replace(token, "");
    if (next === s) break;
    s = next;
  }
  throw new Error("Model returned malformed JSON that could not be repaired.");
}



