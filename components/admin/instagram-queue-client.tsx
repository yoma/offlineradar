"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  approveQueuePostAction,
  createCustomPostAction,
  createProposalAction,
  deleteQueuePostAction,
  rejectQueuePostAction,
  retryQueuePostAction,
  saveQueuePostAction,
  setAutoPostAction,
  submitQueuePostAction,
  type QueueActionResult,
} from "@/app/interne-instagram/wachtrij/actions";
import type {
  InstagramQueuePost,
  InstagramQueueStatus,
} from "@/lib/instagram/queue";
import {
  formatBrusselsDateTime,
  toBrusselsLocalInput,
} from "@/lib/instagram/queue-time";

const CAPTION_MAX = 2200;

const STATUS_LABEL: Record<InstagramQueueStatus, string> = {
  concept: "Concept (afgewezen)",
  te_keuren: "Te keuren",
  goedgekeurd: "Goedgekeurd",
  gepost: "Gepost",
  mislukt: "Mislukt",
};

const STATUS_STYLE: Record<InstagramQueueStatus, string> = {
  concept: "bg-stone-100 text-stone-600",
  te_keuren: "bg-amber-100 text-amber-900",
  goedgekeurd: "bg-emerald-100 text-emerald-900",
  gepost: "bg-sky-100 text-sky-900",
  mislukt: "bg-red-100 text-red-900",
};

const FORMAT_LABEL: Record<string, string> = {
  binnenkort: "Binnenkort te beleven",
  deze_week: "Deze week",
  nieuw: "Nieuw op DateOfflineHub",
};

type Setup = {
  userIdSet: boolean;
  tokenConfigured: boolean;
  tokenStored: boolean;
  tokenRefreshedAt: string | null;
  tokenExpiresAt: string | null;
  tokenLastError: string | null;
  dryRun: boolean;
};

const primaryBtn =
  "rounded-xl bg-[var(--brand-bordeaux)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-bordeaux-muted)] disabled:opacity-50";
const secondaryBtn =
  "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50";
const dangerBtn =
  "rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50";

function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<QueueActionResult | null>(null);
  const run = (
    action: (formData: FormData) => Promise<QueueActionResult>,
    formData: FormData,
  ) =>
    start(async () => {
      setResult(null);
      setResult(await action(formData));
    });
  return { pending, result, run };
}

function ResultLine({ result }: { result: QueueActionResult | null }) {
  if (!result?.message) return null;
  return (
    <p
      role="status"
      className={`text-sm ${result.ok ? "text-emerald-700" : "text-red-700"}`}
    >
      {result.message}
    </p>
  );
}

function SlidePreview({ post }: { post: InstagramQueuePost }) {
  const [index, setIndex] = useState(0);
  const count = post.mediaIds.length;
  if (count === 0) {
    return (
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-center text-xs text-stone-500">
        Afbeeldingen opgeruimd (ouder dan 30 dagen).
      </div>
    );
  }
  const mediaId = post.mediaIds[Math.min(index, count - 1)]!;
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element -- frozen JPEG from our own API */}
      <img
        src={`/api/instagram/media/${mediaId}.jpg`}
        alt={`Slide ${index + 1} van ${count}`}
        className="w-full rounded-xl border border-stone-200 bg-stone-50"
      />
      {count > 1 ? (
        <div className="mt-2 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            className={secondaryBtn}
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            aria-label="Vorige slide"
          >
            ←
          </button>
          <span className="tabular-nums text-stone-600">
            {index + 1} / {count}
          </span>
          <button
            type="button"
            className={secondaryBtn}
            disabled={index >= count - 1}
            onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}
            aria-label="Volgende slide"
          >
            →
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PostCard({
  post,
  autoPost,
  nowMs,
}: {
  post: InstagramQueuePost;
  autoPost: boolean;
  nowMs: number;
}) {
  const { pending, result, run } = useAction();
  const [caption, setCaption] = useState(post.caption);
  const [time, setTime] = useState(toBrusselsLocalInput(post.scheduledAt));
  const locked = post.status === "gepost" || post.publishStartedAt != null;
  const timePassed = Date.parse(post.scheduledAt) < nowMs;

  const form = () => {
    const fd = new FormData();
    fd.set("id", post.id);
    fd.set("caption", caption);
    fd.set("scheduledAt", time);
    return fd;
  };

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <SlidePreview post={post} />

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[post.status]}`}
            >
              {STATUS_LABEL[post.status]}
            </span>
            <span className="text-sm text-stone-600">
              {post.format ? FORMAT_LABEL[post.format] ?? post.format : "Eigen post"}
              {" · "}
              {post.source === "auto" ? "voorgesteld door de site" : "handmatig"}
            </span>
          </div>

          {post.status === "gepost" ? (
            <p className="text-sm text-stone-700">
              Geplaatst op {formatBrusselsDateTime(post.postedAt ?? post.scheduledAt)}.
            </p>
          ) : null}
          {post.status === "mislukt" && post.errorMessage ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {post.errorMessage}
            </p>
          ) : null}
          {post.status === "te_keuren" && timePassed ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {autoPost
                ? "Tijdstip is voorbij; wordt bij de volgende ronde geplaatst."
                : "Tijdstip is voorbij. Goedkeuren plaatst de post binnen 15 minuten, of kies eerst een nieuw tijdstip."}
            </p>
          ) : null}
          {post.status === "te_keuren" && autoPost && !timePassed ? (
            <p className="text-xs text-stone-500">
              Automatisch posten staat aan: deze post gaat ook zonder goedkeuring online.
            </p>
          ) : null}

          <label className="text-sm font-semibold text-stone-800">
            Gepland op (Brusselse tijd)
            <input
              type="datetime-local"
              value={time}
              disabled={locked || pending}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 block w-full max-w-xs rounded-lg border border-stone-200 px-3 py-2 text-sm font-normal"
            />
          </label>

          <label className="text-sm font-semibold text-stone-800">
            <span className="flex items-center justify-between">
              Caption
              <span
                className={`text-xs font-normal tabular-nums ${caption.length > CAPTION_MAX ? "text-red-700" : "text-stone-500"}`}
              >
                {caption.length} / {CAPTION_MAX}
              </span>
            </span>
            <textarea
              value={caption}
              disabled={locked || pending}
              maxLength={CAPTION_MAX}
              rows={10}
              onChange={(e) => setCaption(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-stone-200 bg-[#fbf8f0] p-3 text-sm font-normal leading-6 text-stone-800"
            />
          </label>

          {!locked ? (
            <div className="flex flex-wrap gap-2">
              {post.status === "te_keuren" || post.status === "goedgekeurd" ? (
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={pending || !caption.trim()}
                  onClick={() => run(approveQueuePostAction, form())}
                >
                  {post.status === "goedgekeurd" ? "Opslaan & goedgekeurd laten" : "Goedkeuren"}
                </button>
              ) : null}
              {post.status === "te_keuren" || post.status === "goedgekeurd" ? (
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={pending}
                  onClick={() => run(rejectQueuePostAction, form())}
                >
                  Afwijzen
                </button>
              ) : null}
              {post.status === "te_keuren" || post.status === "concept" ? (
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={pending}
                  onClick={() => run(saveQueuePostAction, form())}
                >
                  Opslaan
                </button>
              ) : null}
              {post.status === "concept" ? (
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={pending}
                  onClick={() => run(submitQueuePostAction, form())}
                >
                  Terug naar te keuren
                </button>
              ) : null}
              {post.status === "mislukt" ? (
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={pending}
                  onClick={() => run(retryQueuePostAction, form())}
                >
                  Opnieuw proberen
                </button>
              ) : null}
              {post.status === "concept" || post.status === "mislukt" ? (
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Deze post definitief verwijderen?")) {
                      run(deleteQueuePostAction, form());
                    }
                  }}
                >
                  Verwijderen
                </button>
              ) : null}
            </div>
          ) : post.status !== "gepost" ? (
            <p className="text-sm text-stone-600">Wordt nu geplaatst…</p>
          ) : null}
          {pending ? <p className="text-sm text-stone-500">Bezig…</p> : null}
          <ResultLine result={result} />
        </div>
      </div>
    </article>
  );
}

function AutoPostToggle({ enabled }: { enabled: boolean }) {
  const { pending, result, run } = useAction();
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          className="mt-1 h-5 w-5"
          onChange={(e) => {
            const next = e.target.checked;
            if (
              next &&
              !window.confirm(
                "Voorstellen worden dan ZONDER jouw goedkeuring op Instagram geplaatst. Zeker?",
              )
            ) {
              return;
            }
            const fd = new FormData();
            fd.set("enabled", next ? "1" : "0");
            run(setAutoPostAction, fd);
          }}
        />
        <span>
          <span className="block text-sm font-semibold text-stone-800">
            Automatisch posten zonder goedkeuring
          </span>
          <span className="block text-sm text-stone-600">
            {enabled
              ? "AAN: voorstellen gaan op hun tijdstip online, ook als je ze niet goedkeurde."
              : "UIT: alleen posts die jij goedkeurt worden geplaatst."}
          </span>
        </span>
      </label>
      <ResultLine result={result} />
    </div>
  );
}

function SetupStatus({ setup }: { setup: Setup }) {
  const ready = setup.userIdSet && setup.tokenConfigured;
  const rows: [string, boolean, string][] = [
    ["INSTAGRAM_USER_ID", setup.userIdSet, setup.userIdSet ? "ingesteld" : "ontbreekt in Vercel"],
    [
      "Instagram-token",
      setup.tokenConfigured,
      !setup.tokenConfigured
        ? "ontbreekt in Vercel"
        : setup.tokenExpiresAt
          ? `geldig tot ${formatBrusselsDateTime(setup.tokenExpiresAt)} (wordt automatisch vernieuwd)`
          : setup.tokenStored
            ? "opgeslagen; eerste automatische vernieuwing volgt binnen 1 dag"
            : "ingesteld; wordt bij eerste gebruik veilig opgeslagen",
    ],
  ];
  return (
    <div className="space-y-1 text-sm">
      {rows.map(([label, ok, text]) => (
        <p key={label}>
          <span className={ok ? "text-emerald-700" : "text-red-700"}>{ok ? "✓" : "✗"}</span>{" "}
          <span className="font-semibold text-stone-800">{label}:</span>{" "}
          <span className="text-stone-600">{text}</span>
        </p>
      ))}
      {setup.tokenLastError ? (
        <p className="text-red-700">Laatste vernieuwing mislukt: {setup.tokenLastError}</p>
      ) : null}
      {setup.dryRun ? (
        <p className="text-amber-800">
          INSTAGRAM_META_DRY_RUN staat aan: er wordt niets echt gepost.
        </p>
      ) : null}
      {!ready ? (
        <p className="text-stone-600">Zonder deze twee kan er niets geplaatst worden.</p>
      ) : null}
    </div>
  );
}

function NewPostForms() {
  const proposal = useAction();
  const custom = useAction();
  const inputCls =
    "mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-normal";
  return (
    <details className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-stone-800">
        Zelf een post toevoegen
      </summary>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <form
          className="space-y-3"
          action={(fd) => proposal.run(createProposalAction, fd)}
        >
          <h3 className="text-sm font-semibold text-stone-800">Nieuw voorstel uit de events</h3>
          <label className="block text-sm text-stone-700">
            Soort post
            <select name="format" className={inputCls} defaultValue="binnenkort">
              <option value="binnenkort">Binnenkort te beleven (carrousel)</option>
              <option value="deze_week">Deze week</option>
              <option value="nieuw">Nieuw op DateOfflineHub</option>
            </select>
          </label>
          <label className="block text-sm text-stone-700">
            Plaatsen op (Brusselse tijd)
            <input type="datetime-local" name="scheduledAt" required className={inputCls} />
          </label>
          <button type="submit" className={primaryBtn} disabled={proposal.pending}>
            {proposal.pending ? "Afbeeldingen maken…" : "Voorstel maken"}
          </button>
          <ResultLine result={proposal.result} />
        </form>

        <form
          className="space-y-3"
          action={(fd) => custom.run(createCustomPostAction, fd)}
        >
          <h3 className="text-sm font-semibold text-stone-800">Eigen afbeeldingen</h3>
          <label className="block text-sm text-stone-700">
            Afbeeldingslinks (https, één per regel, max. 10)
            <textarea name="imageUrls" rows={3} required className={inputCls} />
          </label>
          <p className="text-xs text-stone-500">
            Worden gedownload, omgezet naar JPEG en bijgesneden tot een formaat dat Instagram aanvaardt.
          </p>
          <label className="block text-sm text-stone-700">
            Caption
            <textarea name="caption" rows={4} maxLength={CAPTION_MAX} required className={inputCls} />
          </label>
          <label className="block text-sm text-stone-700">
            Plaatsen op (Brusselse tijd)
            <input type="datetime-local" name="scheduledAt" required className={inputCls} />
          </label>
          <button type="submit" className={primaryBtn} disabled={custom.pending}>
            {custom.pending ? "Bezig…" : "Toevoegen"}
          </button>
          <ResultLine result={custom.result} />
        </form>
      </div>
    </details>
  );
}

export function InstagramQueueClient({
  posts,
  autoPost,
  loadError,
  nextSlots,
  setup,
  renderedAt,
}: {
  posts: InstagramQueuePost[];
  autoPost: boolean;
  loadError: string | null;
  nextSlots: { at: string; format: string }[];
  setup: Setup;
  /** Server render time, so "time passed" is stable across re-renders. */
  renderedAt: string;
}) {
  const nowMs = Date.parse(renderedAt);
  const open = posts.filter((p) => p.status === "te_keuren");
  const planned = posts.filter((p) => p.status === "goedgekeurd" || p.status === "mislukt");
  const rest = posts.filter((p) => p.status === "gepost" || p.status === "concept");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Instagram-wachtrij
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            De site stelt elke week posts voor. Pas de tekst aan als je wilt en klik
            op Goedkeuren; de post gaat dan op het geplande tijdstip online.
          </p>
        </div>
        <Link
          href="/interne-instagram"
          className="text-sm font-semibold text-[var(--brand-gold-ink)] underline-offset-2 hover:underline"
        >
          Concepten bekijken →
        </Link>
      </header>

      <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <AutoPostToggle enabled={autoPost} />
        <SetupStatus setup={setup} />
        {nextSlots.length > 0 ? (
          <p className="text-xs text-stone-500 md:col-span-2">
            Volgende voorstelmomenten:{" "}
            {nextSlots
              .map((s) => `${formatBrusselsDateTime(s.at)} (${FORMAT_LABEL[s.format] ?? s.format})`)
              .join(" · ")}
          </p>
        ) : null}
      </section>

      {loadError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{loadError}</p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-900">
          Te keuren ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-stone-600">
            Niets te keuren. Nieuwe voorstellen verschijnen hier automatisch.
          </p>
        ) : (
          open.map((p) => <PostCard key={p.id} post={p} autoPost={autoPost} nowMs={nowMs} />)
        )}
      </section>

      {planned.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-900">Gepland en mislukt</h2>
          {planned.map((p) => <PostCard key={p.id} post={p} autoPost={autoPost} nowMs={nowMs} />)}
        </section>
      ) : null}

      <NewPostForms />

      {rest.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-900">Geplaatst en afgewezen</h2>
          {rest.map((p) => <PostCard key={p.id} post={p} autoPost={autoPost} nowMs={nowMs} />)}
        </section>
      ) : null}
    </div>
  );
}
