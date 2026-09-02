import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { extractVendorQuote } from "@/lib/extract.functions";
import { buildComparison, type OverrideMap } from "@/lib/normalize";
import { vendors } from "@/data/vendors";
import { rfq as seedRfq } from "@/data/rfq";
import type { Comparison, Rfq, VendorExtraction, VendorInbox } from "@/lib/types";

export type VendorStatus = "idle" | "reading" | "extracting" | "done" | "error";

interface VendorState {
  status: VendorStatus;
  error?: string;
  startedAt?: number;
  ms?: number;
}

/** Everything the workspace knows about ONE RFQ. */
interface RfqSlice {
  states: Record<string, VendorState>;
  extractions: VendorExtraction[];
  overrides: OverrideMap;
  awards: Record<string, string>;
}

const EMPTY_SLICE: RfqSlice = { states: {}, extractions: [], overrides: {}, awards: {} };

type ByRfq = Record<string, RfqSlice>;

export interface QuestionnaireAttachment {
  base64: string;
  mime: string;
  kind: VendorInbox["kind"];
  fileLabel: string;
  vendorName: string;
}

interface WorkspaceValue {
  byRfq: ByRfq;
  setSlice: (rfqId: string, fn: (s: RfqSlice) => RfqSlice) => void;
  runVendorFor: (rfqId: string, v: VendorInbox, doc?: Rfq) => Promise<void>;
  attachQuestionnaireFor: (
    rfqId: string,
    vendorId: string,
    file: QuestionnaireAttachment,
    doc?: Rfq,
  ) => Promise<void>;
}

const Ctx = createContext<WorkspaceValue | null>(null);

const FALLBACK_CTX: WorkspaceValue = {
  byRfq: {},
  setSlice: () => {},
  runVendorFor: async () => {},
  attachQuestionnaireFor: async () => {},
};


const STORAGE = "aerchain.workspace.v2";
const LEGACY_STORAGE = "aerchain.workspace.v1";

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  image: "image/jpeg",
  email: "text/plain",
};

async function fileToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Attachment ${url} could not be read (${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [byRfq, setByRfq] = useState<ByRfq>({});
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        setByRfq(JSON.parse(raw) as ByRfq);
      } else {
        // Migrate the old single-RFQ cache onto the demo RFQ.
        const legacy = localStorage.getItem(LEGACY_STORAGE);
        if (legacy) {
          const p = JSON.parse(legacy) as Partial<RfqSlice>;
          setByRfq({
            [seedRfq.id]: {
              ...EMPTY_SLICE,
              extractions: p.extractions ?? [],
              overrides: p.overrides ?? {},
              awards: p.awards ?? {},
              states: Object.fromEntries(
                (p.extractions ?? []).map((e) => [e.vendorId, { status: "done" as const }]),
              ),
            },
          });
        }
      }
    } catch {
      /* ignore corrupted cache */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(byRfq));
    } catch {
      /* quota — cache is a convenience only */
    }
  }, [byRfq]);

  const setSlice = useCallback((rfqId: string, fn: (s: RfqSlice) => RfqSlice) => {
    setByRfq((prev) => ({ ...prev, [rfqId]: fn(prev[rfqId] ?? EMPTY_SLICE) }));
  }, []);

  const runVendorFor = useCallback(
    async (rfqId: string, v: VendorInbox, doc?: Rfq) => {
      const t0 = performance.now();
      const patchState = (st: VendorState | ((p: VendorState) => VendorState)) =>
        setSlice(rfqId, (s) => ({
          ...s,
          states: {
            ...s.states,
            [v.id]: typeof st === "function" ? st(s.states[v.id] ?? { status: "idle" }) : st,
          },
        }));

      patchState({ status: "reading", startedAt: Date.now() });
      try {
        const base64 = v.base64 ?? (await fileToBase64(v.file));
        patchState((p) => ({ ...p, status: "extracting" }));
        const result = await extractVendorQuote({
          data: {
            vendorId: v.id,
            base64,
            mime: v.mime ?? MIME[v.kind] ?? "application/octet-stream",
            vendorName: v.name,
            kind: v.kind,
            hint: v.hint,
            ...(v.docType ? { docType: v.docType } : {}),
            ...(doc ? { rfqDoc: doc as unknown as Record<string, unknown> } : {}),
          },
        });
        setSlice(rfqId, (s) => ({
          ...s,
          extractions: [...s.extractions.filter((e) => e.vendorId !== v.id), result],
          states: { ...s.states, [v.id]: { status: "done", ms: Math.round(performance.now() - t0) } },
        }));
      } catch (err) {
        patchState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    },
    [setSlice],
  );

  /**
   * A vendor that forgot the questionnaire can send it later: extract the late
   * document on its own and merge its answers into the existing extraction so
   * the comparison and qualification scores update in place.
   */
  const attachQuestionnaireFor = useCallback(
    async (rfqId: string, vendorId: string, file: QuestionnaireAttachment, doc?: Rfq) => {
      const t0 = performance.now();
      const patchState = (st: VendorState) =>
        setSlice(rfqId, (s) => ({ ...s, states: { ...s.states, [vendorId]: st } }));

      patchState({ status: "extracting", startedAt: Date.now() });
      try {
        const result = await extractVendorQuote({
          data: {
            vendorId,
            base64: file.base64,
            mime: file.mime,
            vendorName: file.vendorName,
            kind: file.kind,
            hint: `Questionnaire response sent separately by the vendor (${file.fileLabel}).`,
            docType: "questionnaire",
            ...(doc ? { rfqDoc: doc as unknown as Record<string, unknown> } : {}),
          },
        });
        setSlice(rfqId, (s) => {
          const existing = s.extractions.find((e) => e.vendorId === vendorId);
          const incoming = result.questionnaire ?? [];
          const merged: VendorExtraction = existing
            ? {
                ...existing,
                questionnaire: [
                  ...existing.questionnaire.filter((a) => !incoming.some((n) => n.id === a.id)),
                  ...incoming,
                ],
                warnings: [
                  ...(existing.warnings ?? []),
                  `Questionnaire answers updated from a late submission: ${file.fileLabel}.`,
                ],
              }
            : result;
          return {
            ...s,
            extractions: [...s.extractions.filter((e) => e.vendorId !== vendorId), merged],
            states: {
              ...s.states,
              [vendorId]: { status: "done", ms: Math.round(performance.now() - t0) },
            },
          };
        });
      } catch (err) {
        patchState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    },
    [setSlice],
  );

  const value: WorkspaceValue = { byRfq, setSlice, runVendorFor, attachQuestionnaireFor };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Scoped view of the workspace. Everything — extractions, comparison, awards —
 * belongs to one RFQ, so the same vendor can quote several RFQs independently.
 * Called without an id it only reports global progress (used by the app shell).
 */
export function useWorkspace(rfqId?: string, doc?: Rfq) {
  const ctx = useContext(Ctx);
  // A stale HMR module copy can briefly see an empty context; degrade instead of
  // blanking the page.
  const { byRfq, setSlice, runVendorFor } = ctx ?? FALLBACK_CTX;

  const id = rfqId ?? "";
  const slice = (rfqId ? byRfq[rfqId] : undefined) ?? EMPTY_SLICE;

  const allExtractions = useMemo(
    () => Object.values(byRfq).flatMap((s) => s.extractions),
    [byRfq],
  );
  const allStates = useMemo(() => Object.values(byRfq).flatMap((s) => Object.values(s.states)), [byRfq]);

  const extractions = rfqId ? slice.extractions : allExtractions;
  const states = slice.states;

  const runVendor = useCallback(
    (v: VendorInbox) => runVendorFor(id, v, doc),
    [runVendorFor, id, doc],
  );

  const runAll = useCallback(
    async (list?: VendorInbox[]) => {
      // Sequential: the gateway rate limit is shared across the workspace.
      for (const v of list ?? (id === seedRfq.id ? vendors : [])) {
        await runVendorFor(id, v, doc);
      }
    },
    [runVendorFor, id, doc],
  );

  const resetAll = useCallback(() => setSlice(id, () => EMPTY_SLICE), [setSlice, id]);

  const setOverride = useCallback(
    (vendorId: string, lineNo: number, unitPriceLanded: number, note: string) =>
      setSlice(id, (s) => ({
        ...s,
        overrides: { ...s.overrides, [`${vendorId}:${lineNo}`]: { unitPriceLanded, note } },
      })),
    [setSlice, id],
  );

  const clearOverride = useCallback(
    (vendorId: string, lineNo: number) =>
      setSlice(id, (s) => {
        const next = { ...s.overrides };
        delete next[`${vendorId}:${lineNo}`];
        return { ...s, overrides: next };
      }),
    [setSlice, id],
  );

  const award = useCallback(
    (lineNo: number, vendorId: string | null) =>
      setSlice(id, (s) => {
        const next = { ...s.awards };
        if (!vendorId) delete next[String(lineNo)];
        else next[String(lineNo)] = vendorId;
        return { ...s, awards: next };
      }),
    [setSlice, id],
  );

  const comparison: Comparison | null = useMemo(
    () => (rfqId && slice.extractions.length ? buildComparison(slice.extractions, slice.overrides, doc) : null),
    [rfqId, slice.extractions, slice.overrides, doc],
  );

  const busy = (rfqId ? Object.values(states) : allStates).some(
    (s) => s.status === "reading" || s.status === "extracting",
  );

  return {
    states,
    extractions,
    comparison,
    overrides: slice.overrides,
    awards: slice.awards,
    runVendor,
    runAll,
    resetAll,
    setOverride,
    clearOverride,
    award,
    busy,
  };
}
