import { useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { kindForFile } from "@/state/uploads";
import type { QuestionnaireAttachment } from "@/state/workspace";

const MAX_BYTES = 15 * 1024 * 1024;

export interface QuestionnaireTarget {
  id: string;
  name: string;
}

/**
 * A vendor may send the questionnaire after their quote. This attaches that
 * late document to an already-extracted vendor and merges the answers in.
 */
export function QuestionnaireUpload({
  vendors,
  busy,
  onAttach,
  label = "Attach questionnaire",
  variant = "secondary",
  defaultVendorId,
}: {
  vendors: QuestionnaireTarget[];
  busy: boolean;
  onAttach: (vendorId: string, file: QuestionnaireAttachment) => Promise<void>;
  label?: string;
  variant?: "secondary" | "ghost" | "default";
  defaultVendorId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [vendorId, setVendorId] = useState(defaultVendorId ?? vendors[0]?.id ?? "");
  const [picked, setPicked] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const activeVendor = vendors.find((v) => v.id === vendorId) ?? vendors[0];

  const pickFile = async (f: File | null) => {
    setError(null);
    setPicked(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(`"${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 15 MB.`);
      return;
    }
    setReading(true);
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
      setPicked({ name: f.name, type: f.type || "application/octet-stream", base64: btoa(bin) });
    } catch {
      setError(
        `"${f.name}" could not be read. If it sits in a synced folder (OneDrive, Drive), copy it locally and pick it again.`,
      );
    } finally {
      setReading(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!activeVendor) return setError("Pick the vendor this questionnaire belongs to.");
    if (!picked) return setError("Pick the questionnaire file.");
    setRunning(true);
    try {
      await onAttach(activeVendor.id, {
        base64: picked.base64,
        mime: picked.type,
        kind: kindForFile(picked.name, picked.type),
        fileLabel: picked.name,
        vendorName: activeVendor.name,
      });
      setOpen(false);
      setPicked(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  if (vendors.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" disabled={busy}>
          <ClipboardList className="size-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach a late questionnaire</DialogTitle>
          <DialogDescription>
            For a vendor who quoted first and sent the questionnaire later. The AI reads the document and
            merges the answers into that vendor&apos;s existing extraction, so qualification scores and the
            comparison update in place.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="q-vendor">Vendor</Label>
            <select
              id="q-vendor"
              value={activeVendor?.id ?? ""}
              onChange={(e) => setVendorId(e.target.value)}
              className="h-9 w-full rounded-sm border border-border bg-background px-2 text-[13px]"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-file">Questionnaire document</Label>
            <Input
              id="q-file"
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.txt,.eml,image/*"
              onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
            />
            {reading && <p className="text-xs text-muted-foreground">Reading file…</p>}
            {picked && !reading && <p className="text-xs text-ok">{picked.name} ready to extract.</p>}
          </div>
          {error && <p className="text-[13px] text-risk">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={running}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={running || reading}>
            {running && <Loader2 className="size-4 animate-spin" />} Extract &amp; update answers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
