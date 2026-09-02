import { supabase } from "@/integrations/supabase/client";
import type { AnalystAnswer } from "./analyst.functions";

export interface AnalystLogRow {
  id: string;
  rfq_id: string | null;
  session_id: string;
  question: string;
  answer: string | null;
  payload: AnalystAnswer | null;
  error: string | null;
  created_at: string;
}

const SESSION_KEY = "analyst-session-id";

/** Stable per-browser-session id so a conversation can be grouped later. */
export function analystSessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export async function logAnalystTurn(entry: {
  rfqId: string | null;
  question: string;
  answer?: string | null;
  payload?: AnalystAnswer | null;
  error?: string | null;
}): Promise<AnalystLogRow | null> {
  const { data, error } = await supabase
    .from("analyst_chat_log")
    .insert({
      rfq_id: entry.rfqId,
      session_id: analystSessionId(),
      question: entry.question,
      answer: entry.answer ?? null,
      payload: (entry.payload ?? null) as never,
      error: entry.error ?? null,
    })
    .select()
    .single();
  if (error) {
    console.warn("analyst log failed", error.message);
    return null;
  }
  return data as unknown as AnalystLogRow;
}

export async function fetchAnalystLog(limit = 50): Promise<AnalystLogRow[]> {
  const { data, error } = await supabase
    .from("analyst_chat_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("analyst log fetch failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as AnalystLogRow[];
}
