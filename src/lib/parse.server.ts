import { unzipSync, strFromU8 } from "fflate";
import * as XLSX from "xlsx";
import type { SourceKind } from "./types";

export interface ParsedSource {
  /** Machine-readable text handed to the model, annotated with locations. */
  text: string;
  /** Present only for image sources; the model gets the pixels. */
  imageDataUrl?: string;
  locationHint: string;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function colLetter(i: number): string {
  let s = "";
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function parseXlsx(bytes: Uint8Array): ParsedSource {
  const wb = XLSX.read(bytes, { type: "array" });
  const chunks: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: "",
    });
    chunks.push(`### SHEET "${name}"`);
    rows.forEach((row, r) => {
      const cells = (row as unknown[])
        .map((v, c) => (v === "" || v == null ? null : `${colLetter(c)}${r + 1}=${String(v)}`))
        .filter(Boolean);
      if (cells.length) chunks.push(cells.join(" | "));
    });
    chunks.push("");
  }
  return {
    text: chunks.join("\n"),
    locationHint:
      'Cite evidence as: sheet name plus cell reference, e.g. Sheet "Commercial Offer", cell F12.',
  };
}

function parseDocx(bytes: Uint8Array): ParsedSource {
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("document.xml missing from .docx");
  const xml = strFromU8(doc);
  const paras = xml
    .split(/<\/w:p>/)
    .map((p) =>
      p
        .replace(/<w:tab[^>]*\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .trim(),
    )
    .filter((p) => p.length > 0);
  return {
    text: paras.map((p, i) => `[para ${i + 1}] ${p}`).join("\n"),
    locationHint: "Cite evidence as: paragraph number, e.g. paragraph 34.",
  };
}

async function parsePdf(bytes: Uint8Array): Promise<ParsedSource> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];
  return {
    text: pages.map((p, i) => `### PAGE ${i + 1}\n${p}`).join("\n\n"),
    locationHint: "Cite evidence as: page number plus a short source excerpt, e.g. page 2, row for line 14.",
  };
}

export async function parseSource(
  kind: SourceKind,
  base64: string,
  mime: string,
): Promise<ParsedSource> {
  if (kind === "image") {
    return {
      text: "",
      imageDataUrl: `data:${mime};base64,${base64}`,
      locationHint:
        "Cite evidence as: the region of the photo plus the text you read there, e.g. rate table row 7 (\"box/100  22.43\").",
    };
  }
  const bytes = b64ToBytes(base64);
  if (kind === "xlsx") return parseXlsx(bytes);
  if (kind === "docx") return parseDocx(bytes);
  if (kind === "pdf") return await parsePdf(bytes);
  return {
    text: strFromU8(bytes),
    locationHint: "Cite evidence as: a short verbatim excerpt from the message.",
  };
}
