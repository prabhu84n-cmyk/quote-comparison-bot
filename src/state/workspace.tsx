import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { extractVendorQuote } from "@/lib/extract.functions";
import { buildComparison, type OverrideMap } from "@/lib/normalize";
import { vendors } from "@/data/vendors";
import type { Comparison, VendorExtraction, VendorInbox } from "@/lib/types";

export type VendorStatus = "idle" | "reading" | "extracting" | "done" | "error";

interface VendorState {
  status: VendorStatus;
  error?: string;
  startedAt?: number;
  ms?: number;
}

interface WorkspaceValue {
  states: Record<string, VendorState>;
  extractions: VendorExtraction[];
  comparison: Comparison | null;
  overrides: OverrideMap;
  awards: Record<string, string>;
  runVendor: (v: VendorInbox) => Promise<void>;
  runAll: (list?: VendorInbox[]) => Promise<void>;
  resetAll: () => void;
  setOverride: (vendorId: string, lineNo: number, unitPriceLanded: number, note: string) => void;
  clearOverride: (vendorId: string, lineNo: number) => void;
  award: (lineNo: number, vendorId: string | null) => void;
  busy: boolean;
}

const Ctx = createContext<WorkspaceValue | null>(null);

const STORAGE = "aerchain.workspace.v1";

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
  const [states, setStates] = useState<Record<string, VendorState>>({});
  const [extractions, setExtractions] = useState<VendorExtraction[]>([]);
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [awards, setAwards] = useState<Record<string, string>>({});
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const p = JSON.parse(raw) as {
          extractions?: VendorExtraction[];
          overrides?: OverrideMap;
          awards?: Record<string, string>;
        };
        if (p.extractions?.length) {
          setExtractions(p.extractions);
          setStates(
            Object.fromEntries(p.extractions.map((e) => [e.vendorId, { status: "done" as const }])),
          );
        }
        if (p.overrides) setOverrides(p.overrides);
        if (p.awards) setAwards(p.awards);
      }
    } catch {
      /* ignore corrupted cache */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ extractions, overrides, awards }));
    } catch {
      /* quota — cache is a convenience only */
    }
  }, [extractions, overrides, awards]);

  const runVendor = useCallback(async (v: VendorInbox) => {
    const t0 = performance.now();
    setStates((s) => ({ ...s, [v.id]: { status: "reading", startedAt: Date.now() } }));
    try {
      const base64 = v.base64 ?? (await fileToBase64(v.file));
      setStates((s) => ({ ...s, [v.id]: { ...s[v.id], status: "extracting" } }));
      const result = await extractVendorQuote({
        data: {
          vendorId: v.id,
          base64,
          mime: v.mime ?? MIME[v.kind] ?? "application/octet-stream",
          vendorName: v.name,
          kind: v.kind,
          hint: v.hint,
          ...(v.docType ? { docType: v.docType } : {}),
        },
      });
      setExtractions((prev) => [...prev.filter((e) => e.vendorId !== v.id), result]);
      setStates((s) => ({
        ...s,
        [v.id]: { status: "done", ms: Math.round(performance.now() - t0) },
      }));
    } catch (err) {
      setStates((s) => ({
        ...s,
        [v.id]: { status: "error", error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, []);

  const runAll = useCallback(async (list?: VendorInbox[]) => {
    // Sequential: the gateway rate limit is shared across the workspace.
    for (const v of list ?? vendors) {
      await runVendor(v);
    }
  }, [runVendor]);

  const resetAll = useCallback(() => {
    setExtractions([]);
    setStates({});
    setOverrides({});
    setAwards({});
    localStorage.removeItem(STORAGE);
  }, []);

  const setOverride = useCallback(
    (vendorId: string, lineNo: number, unitPriceLanded: number, note: string) =>
      setOverrides((o) => ({ ...o, [`${vendorId}:${lineNo}`]: { unitPriceLanded, note } })),
    [],
  );
  const clearOverride = useCallback(
    (vendorId: string, lineNo: number) =>
      setOverrides((o) => {
        const next = { ...o };
        delete next[`${vendorId}:${lineNo}`];
        return next;
      }),
    [],
  );

  const award = useCallback(
    (lineNo: number, vendorId: string | null) =>
      setAwards((a) => {
        const next = { ...a };
        if (!vendorId) delete next[String(lineNo)];
        else next[String(lineNo)] = vendorId;
        return next;
      }),
    [],
  );

  const comparison = useMemo(
    () => (extractions.length ? buildComparison(extractions, overrides) : null),
    [extractions, overrides],
  );

  const busy = Object.values(states).some((s) => s.status === "reading" || s.status === "extracting");

  const value: WorkspaceValue = {
    states,
    extractions,
    comparison,
    overrides,
    awards,
    runVendor,
    runAll,
    resetAll,
    setOverride,
    clearOverride,
    award,
    busy,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
