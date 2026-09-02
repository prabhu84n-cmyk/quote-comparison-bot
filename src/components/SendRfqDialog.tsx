import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Mail, Plus, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildRfqPdfBlob, rfqPdfFileName } from "@/lib/rfq-pdf";
import type { Rfq } from "@/lib/types";

function defaultBody(rfq: Rfq): string {
  return [
    `Dear Vendor,`,
    ``,
    `You are invited to submit a quotation for ${rfq.id} — ${rfq.title}.`,
    ``,
    `Requisition summary:`,
    `• Category: ${rfq.productCategory}`,
    `• Line items: ${rfq.lineItems.length}`,
    `• Total quantity: ${rfq.lineItems.reduce((s, l) => s + Number(l.quantity || 0), 0).toLocaleString("en-IN")}`,
    `• Currency: ${rfq.currency}`,
    `• Delivery location: ${rfq.deliveryLocation}`,
    ``,
    `Key dates:`,
    `• Questions deadline: ${rfq.questionsDeadline}`,
    `• Quote submission deadline: ${rfq.submissionDeadline}`,
    `• Quote validity: ${rfq.quoteValidity}`,
    ``,
    `Please find the RFQ document attached. Quote against each item number exactly as listed in the RFQ (e.g. ${rfq.lineItems[0]?.sku ?? "AER-2026-001"}) so we can match your response to our lines. Complete the qualification questionnaire in full — incomplete questionnaires may disqualify the quote.`,
    ``,
    `Regards,`,
    `${rfq.buyerContact}`,
    `${rfq.buyingOrganization}`,
  ].join("\n");
}

export function SendRfqDialog({ rfq, open, onClose }: { rfq: Rfq; open: boolean; onClose: () => void }) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState(`Request for Quotation — ${rfq.id} ${rfq.title}`);
  const [body, setBody] = useState(() => defaultBody(rfq));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string[] | null>(null);
  const [deck, setDeck] = useState<{ blob: Blob; name: string } | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);

  // Build the vendor-facing RFQ deck as soon as the dialog opens so it is
  // attached to the message rather than left to the user to remember.
  useEffect(() => {
    if (!open || deck) return;
    let cancelled = false;
    void (async () => {
      try {
        const blob = buildRfqPdfBlob(rfq);
        if (!cancelled) setDeck({ blob, name: rfqPdfFileName(rfq) });
      } catch (e) {
        if (!cancelled) setDeckError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, rfq, deck]);

  const saveDeck = () => {
    if (!deck) return;
    const url = URL.createObjectURL(deck.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = deck.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const addRecipient = () => {
    const email = draft.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("That does not look like a valid email address.");
      return;
    }
    if (recipients.includes(email)) {
      setError("This vendor is already in the list.");
      return;
    }
    setError(null);
    setRecipients((r) => [...r, email]);
    setDraft("");
  };

  const send = async () => {
    if (!recipients.length) {
      setError("Add at least one vendor email address.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      const { sendRfqInvite } = await import("@/lib/email.functions");
      const res = await sendRfqInvite({
        data: { rfqId: rfq.id, recipients, subject, body },
      });
      if (!res.configured) {
        // Email domain not configured yet — hand off to the user's mail app.
        saveDeck();
        const mailto = `mailto:${recipients[0]}?bcc=${encodeURIComponent(recipients.slice(1).join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
        setSentTo(recipients);
      } else {
        setSentTo(res.sent);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4" /> Send RFQ to vendors
          </DialogTitle>
        </DialogHeader>

        {sentTo ? (
          <div className="space-y-3 p-1">
            <p className="text-sm text-foreground">
              RFQ invitation prepared for {sentTo.length} vendor{sentTo.length > 1 ? "s" : ""}:
            </p>
            <ul className="space-y-1 text-[13px] text-muted-foreground">
              {sentTo.map((r) => (
                <li key={r} className="num">
                  {r}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              The RFQ pack ({rfqPdfFileName(rfq)}) is attached; if your mail client opened, add
              the saved file from your downloads before sending.
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-1">
            <div>
              <div className="rail-label mb-1.5">Vendors</div>
              <div className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border bg-card p-2">
                {recipients.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 rounded-sm bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                  >
                    {r}
                    <button
                      type="button"
                      onClick={() => setRecipients((xs) => xs.filter((x) => x !== r))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addRecipient();
                    }
                  }}
                  placeholder="vendor@example.com"
                  className="h-7 min-w-44 flex-1 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
                />
                <Button type="button" size="sm" variant="secondary" onClick={addRecipient}>
                  <Plus className="size-3.5" /> Add
                </Button>
              </div>
            </div>

            <div>
              <div className="rail-label mb-1.5">Subject</div>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div>
              <div className="rail-label mb-1.5">Message — edit freely before sending</div>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="text-[13px] leading-relaxed" />
            </div>

            <div>
              <div className="rail-label mb-1.5">Attachment</div>
              <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2">
                {deck ? (
                  <>
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="num text-[13px] text-foreground">{deck.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(deck.blob.size / 1024).toFixed(0)} KB · RFQ pack (PDF)
                    </span>
                    <Button type="button" size="sm" variant="secondary" className="ml-auto" onClick={saveDeck}>
                      <Download className="size-3.5" /> Save
                    </Button>
                  </>
                ) : deckError ? (
                  <span className="text-[13px] text-risk">RFQ PDF could not be generated: {deckError}</span>
                ) : (
                  <>
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    <span className="text-[13px] text-muted-foreground">Extracting RFQ to PDF…</span>
                  </>
                )}
              </div>
            </div>

            {error && <p className="text-[13px] text-risk">{error}</p>}

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                The RFQ PDF is attached automatically and saved to your downloads for the
                mail client.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={() => void send()} disabled={sending}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send to {recipients.length || ""} vendor{recipients.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
