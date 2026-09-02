import { useSyncExternalStore } from "react";
import type { SourceKind, VendorInbox } from "@/lib/types";

export type DocType = "quote" | "questionnaire" | "both";

export interface UploadedResponse {
  id: string;
  rfqId: string;
  vendorName: string;
  docType: DocType;
  fileLabel: string;
  kind: SourceKind;
  mime: string;
  base64: string;
  receivedAt: string;
  note: string;
}

const STORAGE = "aerchain.uploads.v1";

let items: UploadedResponse[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) items = JSON.parse(raw) as UploadedResponse[];
  } catch {
    /* ignore corrupted cache */
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(items));
  } catch {
    /* quota — uploads stay in memory for this session */
  }
}

export function kindForFile(name: string, mime: string): SourceKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet")) return "xlsx";
  if (ext === "docx" || mime.includes("wordprocessing")) return "docx";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  return "email";
}

export function addUpload(input: Omit<UploadedResponse, "id" | "receivedAt">): UploadedResponse {
  load();
  const entry: UploadedResponse = {
    ...input,
    id: `up-${Math.random().toString(36).slice(2, 9)}`,
    receivedAt: new Date().toISOString(),
  };
  items = [...items, entry];
  persist();
  emit();
  return entry;
}

export function removeUpload(id: string) {
  load();
  items = items.filter((i) => i.id !== id);
  persist();
  emit();
}

export function uploadsForRfq(rfqId: string): UploadedResponse[] {
  load();
  return items.filter((i) => i.rfqId === rfqId);
}

export function uploadById(id: string): UploadedResponse | undefined {
  load();
  return items.find((i) => i.id === id);
}

const DOC_LABEL: Record<DocType, string> = {
  quote: "Quotation",
  questionnaire: "Questionnaire response",
  both: "Quotation + questionnaire",
};

export function uploadToInbox(u: UploadedResponse): VendorInbox {
  return {
    id: u.id,
    name: u.vendorName,
    shortName: u.vendorName.split(/\s+/).slice(0, 2).join(" "),
    from: "uploaded by buyer",
    subject: `${DOC_LABEL[u.docType]} — ${u.vendorName}`,
    receivedAt: u.receivedAt,
    body: u.note || `${DOC_LABEL[u.docType]} uploaded manually against ${u.rfqId}.`,
    file: "",
    fileLabel: u.fileLabel,
    kind: u.kind,
    hint: `Manually uploaded ${DOC_LABEL[u.docType].toLowerCase()}.`,
    base64: u.base64,
    mime: u.mime,
    docType: u.docType,
    uploaded: true,
  };
}

const EMPTY: UploadedResponse[] = [];

function snapshot() {
  load();
  return items;
}

export function useUploads(rfqId: string): UploadedResponse[] {
  const all = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot,
    () => EMPTY,
  );
  return all.filter((i) => i.rfqId === rfqId);
}
