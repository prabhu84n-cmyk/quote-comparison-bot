import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { rfq as seedRfq } from "@/data/rfq";
import type { Rfq } from "@/lib/types";

export const RFQ_STATUSES = ["Draft", "Approved", "Waiting for Quotes", "Awarded", "Closed"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export interface RfqSummary {
  id: string;
  title: string;
  productCategory: string;
  status: RfqStatus;
  lineItems: number;
  submissionDeadline: string;
  seed: boolean;
}

interface StoreState {
  custom: Rfq[];
  /** Edited versions of RFQs, keyed by id (covers the seeded demo RFQ too). */
  overrides: Record<string, Rfq>;
  statuses: Record<string, RfqStatus>;
}

const STORAGE = "aerchain.rfqs.v1";
const EMPTY: StoreState = { custom: [], overrides: {}, statuses: {} };

let state: StoreState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  void hydrateFromDb();
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as StoreState) };
  } catch {
    /* ignore corrupted cache */
  }
}

async function hydrateFromDb() {
  try {
    const { data, error } = await supabase
      .from("rfqs")
      .select("id,status,doc")
      .order("created_at", { ascending: true });
    if (error || !data) return;
    const custom: Rfq[] = [];
    const overrides = { ...state.overrides };
    const statuses = { ...state.statuses };
    for (const row of data) {
      const doc = row.doc as unknown as Rfq;
      if (row.id === seedRfq.id) overrides[row.id] = doc;
      else custom.push(doc);
      statuses[row.id] = row.status as RfqStatus;
    }
    commit({ custom, overrides, statuses });
  } catch {
    /* offline: fall back to cache */
  }
}

function commit(next: StoreState) {
  state = next;
  try {
    localStorage.setItem(STORAGE, JSON.stringify(next));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

const getSnapshot = () => {
  load();
  return state;
};
const getServerSnapshot = () => EMPTY;

function rowFor(r: Rfq, status: RfqStatus) {
  return {
    id: r.id,
    title: r.title,
    product_category: r.productCategory,
    status,
    line_items: r.lineItems.length,
    submission_deadline: r.submissionDeadline,
    doc: r as unknown as never,
  };
}

export function useRfqStore() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Memoised so consumers get a stable RFQ object identity between renders.
  const all: Rfq[] = useMemo(() => {
    const resolve = (r: Rfq) => s.overrides[r.id] ?? r;
    return [resolve(seedRfq), ...s.custom.map(resolve)];
  }, [s]);
  const statusOf = (id: string): RfqStatus =>
    s.statuses[id] ?? (id === seedRfq.id ? "Waiting for Quotes" : "Draft");


  return {
    rfqs: all,
    summaries: all.map<RfqSummary>((r) => ({
      id: r.id,
      title: r.title,
      productCategory: r.productCategory,
      status: statusOf(r.id),
      lineItems: r.lineItems.length,
      submissionDeadline: r.submissionDeadline,
      seed: r.id === seedRfq.id,
    })),
    statusOf,
    getRfq: (id: string) => all.find((r) => r.id === id) ?? null,
    setStatus: (id: string, status: RfqStatus) => {
      commit({ ...state, statuses: { ...state.statuses, [id]: status } });
      if (id !== seedRfq.id) {
        void supabase.from("rfqs").update({ status }).eq("id", id);
      }
    },
    addRfq: async (r: Rfq, status: RfqStatus = "Draft") => {
      commit({
        ...state,
        custom: [...state.custom, r],
        statuses: { ...state.statuses, [r.id]: status },
      });
      const { error } = await supabase.from("rfqs").insert(rowFor(r, status));
      if (error) throw error;
    },
    /** Persists a manually or copilot edited RFQ. */
    updateRfq: async (r: Rfq) => {
      const status = statusOf(r.id);
      commit({
        ...state,
        custom: state.custom.map((c) => (c.id === r.id ? r : c)),
        overrides: { ...state.overrides, [r.id]: r },
      });
      const { error } = await supabase.from("rfqs").upsert(rowFor(r, status), { onConflict: "id" });
      if (error) throw error;
    },
  };
}

export function nextRfqId(existing: string[]) {
  const year = new Date().getFullYear();
  let n = existing.length + 1;
  let id = `RFQ-${year}-${String(n).padStart(4, "0")}`;
  while (existing.includes(id)) {
    n += 1;
    id = `RFQ-${year}-${String(n).padStart(4, "0")}`;
  }
  return id;
}
