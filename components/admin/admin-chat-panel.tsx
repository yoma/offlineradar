"use client";

import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";

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
  {
    title: "Past dit in ons kraam?",
    prompt:
      "Past dit in ons kraam? https://www.speeddaten.be/nl/kalender-8.htm",
  },
  {
    title: "Grondige scan",
    prompt: "Scan speeddaten.be opnieuw, grondig.",
  },
  {
    title: "Ontbrekende events",
    prompt: "Controleer waarom er evenementen van SmartVibes ontbreken.",
  },
  {
    title: "Laatste scan",
    prompt: "Wat heeft de laatste scan van speeddaten.be toegevoegd?",
  },
];

export function AdminChatPanel() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [toolViews, setToolViews] = useState<ToolResultView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, toolViews, pending]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const nextMessages: ChatMsg[] = [...messages, { role: "user", content }];
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

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(input);
    }
  }

  const empty = messages.length === 0 && !pending;

  return (
    <section
      className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-[0_12px_40px_-18px_rgba(28,25,23,0.28)]"
      aria-label="Admin assistent"
    >
      <header className="flex items-center gap-3 border-b border-stone-200/80 px-4 py-3.5 sm:px-5">
        <span className="flex size-9 items-center justify-center rounded-full bg-[var(--brand-gold-soft)] text-[var(--brand-gold-deep)]">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-stone-900">
            Assistent
          </h2>
          <p className="truncate text-xs text-stone-500">
            Scans en URL-checks starten echte taken, geen praatjes alleen.
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-5"
      >
        {empty ? (
          <div className="mx-auto flex max-w-xl flex-col items-center px-2 py-8 text-center">
            <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[var(--brand-gold-soft)] text-[var(--brand-gold-deep)]">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <h3 className="text-lg font-semibold tracking-tight text-stone-900">
              Waarmee kan ik helpen?
            </h3>
            <p className="mt-1.5 max-w-sm text-sm text-stone-500">
              Plak een link of domein om te beoordelen, of vraag een scan van een
              bekende bron.
            </p>
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  disabled={pending}
                  onClick={() => send(item.prompt)}
                  className="rounded-2xl border border-stone-200 bg-stone-50/80 px-3.5 py-3 text-left transition hover:border-stone-300 hover:bg-white hover:shadow-sm disabled:opacity-60"
                >
                  <span className="block text-sm font-medium text-stone-900">
                    {item.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-stone-500">
                    {item.prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={cn(
              "flex gap-2.5",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {m.role === "assistant" ? (
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-gold-soft)] text-[var(--brand-gold-deep)]"
                aria-hidden
              >
                <Sparkles className="size-3.5" />
              </span>
            ) : null}
            <div
              className={cn(
                "max-w-[min(100%,36rem)] rounded-2xl px-3.5 py-2.5 text-[14px] leading-6 whitespace-pre-wrap",
                m.role === "user"
                  ? "rounded-br-md bg-stone-900 text-white"
                  : "rounded-bl-md border border-stone-200/90 bg-stone-50 text-stone-800",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {pending ? (
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-gold-soft)] text-[var(--brand-gold-deep)]"
              aria-hidden
            >
              <Loader2 className="size-3.5 animate-spin" />
            </span>
            <div className="rounded-2xl rounded-bl-md border border-stone-200/90 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-500">
              Bezig met ophalen en beoordelen…
            </div>
          </div>
        ) : null}

        {toolViews.length > 0 ? (
          <div className="space-y-2 pl-10">
            {toolViews.map((tv, idx) => {
              const r = tv.result;
              if (r.ambiguous) {
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-950"
                  >
                    <div className="font-medium">{r.message}</div>
                    <ul className="mt-1.5 space-y-1">
                      {(r.options ?? []).map((o) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            className="text-left underline-offset-2 hover:underline"
                            onClick={() =>
                              send(`Gebruik bron ${o.name} (${o.url})`)
                            }
                          >
                            {o.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-700 shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2 font-medium text-stone-900">
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] tracking-wide uppercase">
                      {tv.name}
                    </span>
                    {r.ok === false ? (
                      <span className="text-red-700">mislukt</span>
                    ) : null}
                  </div>
                  {r.progress && r.progress.length > 0 ? (
                    <p className="mt-1.5 text-stone-500">
                      {(r.progress ?? [])
                        .map((p) => PROGRESS_LABEL[p] ?? p)
                        .join(" → ")}
                    </p>
                  ) : null}
                  {r.summary ? <p className="mt-1.5">{r.summary}</p> : null}
                  {r.links && r.links.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.links.map((l) => (
                        <a
                          key={l.href}
                          href={l.href}
                          className="rounded-full border border-stone-200 px-2.5 py-1 font-medium text-[var(--brand-gold-ink)] hover:bg-[var(--brand-gold-soft)]"
                        >
                          {l.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {r.ok === false && r.runId ? (
                    <button
                      type="button"
                      className="mt-2 rounded-lg border border-stone-200 px-2.5 py-1 font-medium hover:bg-stone-50"
                      onClick={() =>
                        send(`Scan opnieuw de bron van run ${r.runId}`)
                      }
                    >
                      Opnieuw starten
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {error ? (
          <p className="pl-10 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="border-t border-stone-200/80 bg-stone-50/60 p-3 sm:p-4">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm focus-within:border-[var(--brand-gold-deep)]/40 focus-within:ring-4 focus-within:ring-[var(--brand-gold)]/15"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label className="sr-only" htmlFor="admin-chat-input">
            Bericht aan assistent
          </label>
          <textarea
            id="admin-chat-input"
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Plak een link of vraag iets… (Enter = sturen)"
            disabled={pending}
            className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-5 text-stone-900 outline-none placeholder:text-stone-400 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            aria-label="Bericht sturen"
            className="mb-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-gold-deep)] text-white transition hover:bg-[var(--brand-gold-ink)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArrowUp className="size-4" aria-hidden />
            )}
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl px-1 text-[11px] text-stone-400">
          Shift+Enter voor een nieuwe regel. Domeinen zoals thursday.com mag je
          zo plakken.
        </p>
      </div>
    </section>
  );
}
