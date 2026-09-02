import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, History, Loader2, Send, Sparkles, TriangleAlert } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { askAnalyst, suggestQuestions, type AnalystAnswer } from "@/lib/analyst.functions";
import { fetchAnalystLog, logAnalystTurn, type AnalystLogRow } from "@/lib/analyst-log";
import { rfq } from "@/data/rfq";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel, Tag, inr } from "@/components/Primitives";

export const Route = createFileRoute("/analyst")({
  head: () => ({
    meta: [
      { title: "Analyst Chat — Interrogate the Comparison" },
      {
        name: "description",
        content:
          "Ask questions in plain language about the vendor comparison: totals, exceptions, unit conversions, delivery risk and award recommendations, answered from the extracted data.",
      },
      { property: "og:title", content: "Analyst Chat — Interrogate the Comparison" },
      {
        property: "og:description",
        content: "Natural-language answers grounded strictly in the normalised quote data.",
      },
    ],
  }),
  component: AnalystPage,
});

const SEEDS = [
  "Which vendor is cheapest overall, and is that a fair comparison?",
  "Where did you convert units or currency, and how much does that move the numbers?",
  "Which lines has nobody quoted well, and what should I do about them?",
  "Recommend a split award across vendors and justify it.",
];

interface Turn {
  role: "user" | "assistant";
  content: string;
  payload?: AnalystAnswer;
}

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

function AnalystPage() {
  const { extractions, comparison, awards } = useWorkspace();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  useEffect(() => {
    if (!extractions.length || suggested.length) return;
    suggestQuestions({ data: { extractions } })
      .then(setSuggested)
      .catch(() => setSuggested([]));
  }, [extractions, suggested.length]);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    setQ("");
    setError(null);
    setTurns((t) => [...t, { role: "user", content: question }]);
    setLoading(true);
    try {
      const res = await askAnalyst({
        data: {
          question,
          history: turns.map((t) => ({ role: t.role, content: t.content })),
          extractions,
          awards,
        },
      });
      setTurns((t) => [...t, { role: "assistant", content: res.answer, payload: res }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (!comparison) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="panel max-w-md p-8 text-center">
          <div className="rail-label">Step 04 · Analyst</div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">No comparison loaded</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The analyst answers only from extracted quote data, so there is nothing to interrogate yet.
          </p>
          <Button className="mt-5" asChild>
            <Link to="/inbox">Go to the inbox</Link>
          </Button>
        </div>
      </div>
    );
  }

  const prompts = suggested.length ? suggested : SEEDS;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="flex min-h-[76vh] flex-col">
        <div className="mb-4">
          <div className="rail-label">Step 04 · Analyst</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ask about the comparison</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">
            Grounded in the normalised grid: {comparison.cells.length} cells, {comparison.summaries.length}{" "}
            vendors. It will not answer from outside this data, and it flags assumptions that drive a
            conclusion.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {turns.length === 0 && (
            <div className="panel p-5">
              <div className="rail-label flex items-center gap-2">
                <Sparkles className="size-3.5 text-signal" /> Suggested by the model, from this dataset
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => void ask(p)}
                    className="rounded-sm border border-border bg-background/60 px-3 py-2.5 text-left text-[13px] transition-colors hover:border-signal/60 hover:bg-secondary"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-sm border border-signal/40 bg-signal-soft px-3.5 py-2.5 text-[13px]">
                  {t.content}
                </div>
              </div>
            ) : (
              <div key={i} className="panel p-4">
                <div className="prose prose-invert max-w-none text-[13px] prose-p:my-2 prose-li:my-0.5 prose-strong:text-foreground prose-headings:mb-1 prose-headings:mt-4 prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-base prose-h2:text-[15px] prose-h3:text-sm prose-headings:text-foreground first:prose-headings:mt-0">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>
                </div>

                {t.payload?.table && (
                  <div className="mt-4 overflow-x-auto rounded-sm border border-border">
                    <div className="rail-label border-b border-border bg-chassis px-3 py-1.5">
                      {t.payload.table.title}
                    </div>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="etched">
                          {t.payload.table.columns.map((c) => (
                            <th key={c} className="rail-label px-3 py-2 text-left font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.payload.table.rows.map((r, ri) => (
                          <tr key={ri} className="border-b border-border/60 last:border-0">
                            {r.map((cell, ci) => (
                              <td
                                key={ci}
                                className={ci === 0 ? "px-3 py-1.5" : "num px-3 py-1.5"}
                              >
                                {typeof cell === "number" ? inr(cell, 2) : cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {t.payload?.chart && (
                  <div className="mt-4 h-64 rounded-sm border border-border p-3">
                    <div className="rail-label mb-2">{t.payload.chart.title}</div>
                    <ResponsiveContainer width="100%" height="88%">
                      {t.payload.chart.type === "line" ? (
                        <LineChart data={t.payload.chart.data}>
                          <CartesianGrid stroke="var(--color-border)" vertical={false} />
                          <XAxis dataKey={t.payload.chart.categoryKey} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                          <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={64} />
                          <Tooltip
                            contentStyle={{
                              background: "var(--color-popover)",
                              border: "1px solid var(--color-border)",
                              fontSize: 12,
                            }}
                          />
                          {t.payload.chart.seriesKeys.map((k, si) => (
                            <Line key={k} dataKey={k} stroke={COLORS[si % COLORS.length]} dot={false} strokeWidth={2} />
                          ))}
                        </LineChart>
                      ) : (
                        <BarChart data={t.payload.chart.data}>
                          <CartesianGrid stroke="var(--color-border)" vertical={false} />
                          <XAxis dataKey={t.payload.chart.categoryKey} tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                          <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={64} />
                          <Tooltip
                            cursor={{ fill: "var(--color-secondary)" }}
                            contentStyle={{
                              background: "var(--color-popover)",
                              border: "1px solid var(--color-border)",
                              fontSize: 12,
                            }}
                          />
                          {t.payload.chart.seriesKeys.map((k, si) => (
                            <Bar key={k} dataKey={k} fill={COLORS[si % COLORS.length]} radius={[2, 2, 0, 0]} />
                          ))}
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                )}

                {(t.payload?.caveats.length || t.payload?.basis.length) && (
                  <div className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                    {t.payload.basis.length > 0 && (
                      <div>
                        <div className="rail-label">Basis</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {t.payload.basis.map((b) => (
                            <Tag key={b} tone="signal">
                              {b}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    )}
                    {t.payload.caveats.length > 0 && (
                      <div>
                        <div className="rail-label flex items-center gap-1.5">
                          <TriangleAlert className="size-3 text-warn" /> Caveats
                        </div>
                        <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                          {t.payload.caveats.map((c, ci) => (
                            <li key={ci}>· {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {t.payload?.csv && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      const blob = new Blob([t.payload!.csv!.content], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = t.payload!.csv!.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="size-4" /> {t.payload.csv.filename}
                  </Button>
                )}
              </div>
            ),
          )}

          {loading && (
            <div className="panel sweeping flex items-center gap-3 px-4 py-3 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-signal" />
              Reading the normalised grid…
            </div>
          )}
          {error && (
            <div className="rounded-sm border border-risk/40 bg-risk-soft px-3 py-2 text-[13px] text-risk">
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="mt-4 panel p-3">
          <Textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(q);
              }
            }}
            rows={2}
            placeholder="Ask anything about these five quotes…"
            className="resize-none border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-1">
            <span className="rail-label">Enter to send · Shift+Enter for a new line</span>
            <Button size="sm" onClick={() => void ask(q)} disabled={loading || !q.trim()}>
              <Send className="size-4" /> Ask
            </Button>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <Panel title="Grounding" hint="what the model sees">
          <ul className="divide-y divide-border text-[13px]">
            {comparison.summaries.map((s) => (
              <li key={s.vendorId} className="px-4 py-2.5">
                <div className="font-medium">{s.name}</div>
                <div className="rail-label mt-1">
                  {s.linesQuoted}/{s.linesTotal} lines · ₹{inr(s.comparableTotal, 0)} · {s.qualification.pct}%
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Try asking">
          <div className="space-y-2 p-3">
            {SEEDS.map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                className="w-full rounded-sm border border-border bg-background/60 px-3 py-2 text-left text-xs transition-colors hover:border-signal/60"
              >
                {s}
              </button>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
