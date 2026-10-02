"use client";

import { useState, useTransition } from "react";

type ChatMsg = { role: "user" | "assistant"; content: string };

type ToolResultView = {
  name: string;
  result: {
    ok?: boolean;
    summary?: string;
    progress?: string[];
    runId?: string;
    ambiguous?: boolean;
    message?: string;
    options?: Array<{ id: string; name: string; url: string }>;
    links?: Array<{ label: string; href: string }>;
    data?: Record<string, unknown>;
  };
};

const PROGRESS_LABEL: Record<string, string> = {
  resolve: "Bron bepalen",
  fetch_agenda: "Agenda ophalen",
  fetch_page: "Pagina ophalen",
  extract: "Gegevens uitlezen",
  parse_events: "Evenementen uitlezen",
  compare: "Vergelijken",
  assess: "Beoordelen",
  save: "Opslaan",
  done: "Klaar",
  error: "Fout",
};

const SUGGESTIONS = [
  "Past dit in ons kraam? https://www.speeddaten.be/nl/kalender-8.htm",
  "Scan speeddaten.be opnieuw, grondig.",
  "Controleer waarom er evenementen van SmartVibes ontbreken.",
  "Wat heeft de laatste scan van speeddaten.be toegevoegd?",
];

export function AdminChatPanel() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [toolViews, setToolViews] = useState<ToolResultView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const nextMessages: ChatMsg[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/interne-admin-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          reply?: string;
          error?: string;
          toolResults?: ToolResultView[];
        };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Chat mislukt.");
          if (data.toolResults) setToolViews(data.toolResults);
          return;
        }
        setMessages([
          ...nextMessages,
          { role: "assistant", content: data.reply ?? "Klaar." },
        ]);
        setToolViews(data.toolResults ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Netwerkfout");
      }
    });
  }

  return (
    <section
      className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
      aria-label="Admin assistent"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)]">
            Assistent
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Scans en diagnoses starten echte achtergrondtaken, geen chat-only
            antwoorden.
          </p>
        </div>
      </header>

      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-left text-xs text-[var(--ink)] hover:bg-[var(--wash)]"
              onClick={() => send(s)}
              disabled={pending}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 max-h-72 space-y-2 overflow-y-auto text-sm">
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={
              m.role === "user"
                ? "ml-6 rounded-lg bg-[var(--wash)] px-3 py-2 text-[var(--ink)]"
                : "mr-6 rounded-lg border border-[var(--line)] px-3 py-2 text-[var(--ink)]"
            }
          >
            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {m.role === "user" ? "Jij" : "Assistent"}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {pending && (
          <div className="mr-6 text-xs text-[var(--muted)]">
            Bezig: agenda ophalen → evenementen uitlezen → vergelijken →
            opslaan…
          </div>
        )}
      </div>

      {toolViews.length > 0 && (
        <div className="mb-3 space-y-2 rounded-lg border border-[var(--line)] bg-[var(--wash)] p-3 text-xs">
          {toolViews.map((tv, idx) => {
            const r = tv.result;
            if (r.ambiguous) {
              return (
                <div key={idx}>
                  <div className="font-medium">{r.message}</div>
                  <ul className="mt-1 list-disc pl-4">
                    {(r.options ?? []).map((o) => (
                      <li key={o.id}>
                        {o.name} — {o.url}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            return (
              <div key={idx} className="space-y-1">
                <div className="font-medium">
                  {tv.name}
                  {r.ok === false ? " (mislukt)" : ""}
                </div>
                {r.progress && r.progress.length > 0 && (
                  <div className="text-[var(--muted)]">
                    {(r.progress ?? [])
                      .map((p) => PROGRESS_LABEL[p] ?? p)
                      .join(" → ")}
                  </div>
                )}
                <div>{r.summary}</div>
                {r.links && r.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {r.links.map((l) => (
                      <a
                        key={l.href}
                        href={l.href}
                        className="underline underline-offset-2"
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
                {r.ok === false && r.runId && (
                  <button
                    type="button"
                    className="mt-1 rounded border border-[var(--line)] px-2 py-1"
                    onClick={() =>
                      send(`Scan opnieuw de bron van run ${r.runId}`)
                    }
                  >
                    Opnieuw starten
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p className="mb-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Bv. Scan speeddaten.be grondiger…"
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-lg bg-[var(--ink)] px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Bezig…" : "Stuur"}
        </button>
      </form>
    </section>
  );
}
