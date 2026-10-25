"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  approveQueuePostAction,
  createPostAction,
  deleteQueuePostAction,
  publishNowAction,
  publishStoryAction,
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
import { NEEDS_INSTAGRAM_CHECK } from "@/lib/instagram/queue-messages";
import {
  formatBrusselsDateTime,
  toBrusselsLocalInput,
} from "@/lib/instagram/queue-time";

const CAPTION_MAX = 2200;

const STATUS_LABEL: Record<InstagramQueueStatus, string> = {
  concept: "Afgewezen",
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
  event: "Eén event",
};

type Setup = {
  userIdSet: boolean;
  tokenConfigured: boolean;
  tokenStored: boolean;
  tokenRefreshedAt: string | null;
  tokenExpiresAt: string | null;
  tokenLastError: string | null;
  dryRun: boolean;
  publishOff: boolean;
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
  const [postStory, setPostStory] = useState(post.postStory);
  const locked = post.status === "gepost" || post.publishStartedAt != null;
  const timePassed = Date.parse(post.scheduledAt) < nowMs;

  const form = () => {
    const fd = new FormData();
    fd.set("id", post.id);
    fd.set("caption", caption);
    fd.set("scheduledAt", time);
    fd.set("postStory", postStory ? "1" : "0");
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
                : "Tijdstip is voorbij. Klik Nu plaatsen, of kies een nieuw tijdstip."}
            </p>
          ) : null}
          {post.status === "te_keuren" && autoPost && !timePassed ? (
            <p className="text-xs text-stone-500">
              Automatisch posten staat aan: deze post gaat ook zonder goedkeuring online.
            </p>
          ) : null}

          <label className="text-sm font-semibold text-stone-800">
            Tijdstip (Brusselse tijd)
            <span className="block text-xs font-normal text-stone-500">
              Geplande posts gaan online bij de dagelijkse ronde tussen 18 en 20 uur.
            </span>
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

          <StoryLine
            post={post}
            postStory={postStory}
            onChange={setPostStory}
            disabled={locked || pending}
            onPublishStory={() => run(publishStoryAction, form())}
          />

          {!locked ? (
            <div className="flex flex-wrap gap-2">
              {post.status === "te_keuren" || post.status === "goedgekeurd" ? (
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={pending || !caption.trim()}
                  onClick={() => {
                    if (window.confirm("Deze post nu op Instagram zetten?")) {
                      run(publishNowAction, form());
                    }
                  }}
                >
                  Nu plaatsen
                </button>
              ) : null}
              {post.status === "te_keuren" || post.status === "goedgekeurd" ? (
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={pending || !caption.trim()}
                  onClick={() => run(approveQueuePostAction, form())}
                >
                  {post.status === "goedgekeurd" ? "Opslaan" : "Plannen op dit tijdstip"}
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
                  Toch gebruiken
                </button>
              ) : null}
              {post.status === "mislukt" && post.errorMessage !== NEEDS_INSTAGRAM_CHECK ? (
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={pending}
                  onClick={() => run(retryQueuePostAction, form())}
                >
                  Opnieuw proberen
                </button>
              ) : null}
              {post.status === "mislukt" && post.errorMessage === NEEDS_INSTAGRAM_CHECK ? (
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Heb je op Instagram gekeken en staat deze post er NIET? Dan wordt hij opnieuw geplaatst.",
                      )
                    ) {
                      const fd = form();
                      fd.set("confirmedNotOnInstagram", "1");
                      run(retryQueuePostAction, fd);
                    }
                  }}
                >
                  Staat niet op Instagram, opnieuw plaatsen
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
          {pending ? <p className="text-sm text-stone-500">Bezig… (plaatsen duurt tot een halve minuut)</p> : null}
          <ResultLine result={result} />
        </div>
      </div>
    </article>
  );
}

function StoryLine({
  post,
  postStory,
  onChange,
  disabled,
  onPublishStory,
}: {
  post: InstagramQueuePost;
  postStory: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
  onPublishStory: () => void;
}) {
  const download = post.storyImageId ? (
    <a
      href={`/api/instagram/media/${post.storyImageId}.jpg`}
      download={`dateofflinehub-verhaal-${post.id}.jpg`}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-[var(--brand-gold-ink)] underline-offset-2 hover:underline"
    >
      Download verhaal
    </a>
  ) : null;

  if (post.status === "gepost") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {post.instagramStoryId ? (
          <span className="text-emerald-700">✓ Ook als verhaal geplaatst</span>
        ) : (
          <>
            {post.storyError ? (
              <span className="text-red-700">Verhaal: {post.storyError}</span>
            ) : (
              <span className="text-stone-600">Geen verhaal geplaatst.</span>
            )}
            <button
              type="button"
              className={secondaryBtn}
              disabled={disabled}
              onClick={onPublishStory}
            >
              Verhaal plaatsen
            </button>
          </>
        )}
        {download}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2 font-semibold text-stone-800">
        <input
          type="checkbox"
          checked={postStory}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4"
        />
        Ook als verhaal
      </label>
      {download}
      <span className="text-xs text-stone-500">
        Klikbare link? Download het verhaal en plaats het zelf met een linksticker.
      </span>
    </div>
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
      {setup.publishOff ? (
        <p className="font-semibold text-red-700">
          Noodstop actief (INSTAGRAM_META_PUBLISH_ENABLED=0): er wordt niets geplaatst.
        </p>
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

type PostKind = "binnenkort" | "deze_week" | "nieuw" | "event";

const KIND_OPTIONS: { value: PostKind; label: string; hint: string }[] = [
  { value: "binnenkort", label: "Binnenkort te beleven", hint: "carrousel met een paar events" },
  { value: "deze_week", label: "Deze week", hint: "overzicht van deze week" },
  { value: "nieuw", label: "Nieuw op de site", hint: "recent toegevoegde events" },
  { value: "event", label: "Eén event", hint: "jij kiest welk" },
];

function MakePostCard({ eventOptions }: { eventOptions: { id: string; label: string }[] }) {
  const { pending, result, run } = useAction();
  const [kind, setKind] = useState<PostKind>("binnenkort");
  const [story, setStory] = useState(true);
  const inputCls =
    "mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal";
  return (
    <section className="rounded-2xl border-2 border-[var(--brand-bordeaux)]/20 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-semibold text-stone-900">Maak een post</h2>
      <form
        className="mt-3 space-y-4"
        action={(fd) => {
          fd.set("kind", kind);
          fd.set("postStory", story ? "1" : "0");
          run(createPostAction, fd);
        }}
      >
        <div className="grid gap-2 sm:grid-cols-4">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                kind === option.value
                  ? "border-[var(--brand-bordeaux)] bg-[var(--brand-bordeaux)] text-white"
                  : "border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
              }`}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span
                className={`block text-xs ${kind === option.value ? "text-white/80" : "text-stone-500"}`}
              >
                {option.hint}
              </span>
            </button>
          ))}
        </div>

        {kind === "event" ? (
          <label className="block text-sm font-semibold text-stone-800">
            Welk event?
            <select name="eventId" required className={inputCls} defaultValue="">
              <option value="" disabled>
                Kies een event…
              </option>
              {eventOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
          <input
            type="checkbox"
            checked={story}
            onChange={(e) => setStory(e.target.checked)}
            className="h-4 w-4"
          />
          Ook als verhaal plaatsen
        </label>

        <button type="submit" className={primaryBtn} disabled={pending}>
          {pending ? "Afbeeldingen maken… (± 20 sec)" : "Maak post"}
        </button>
        <p className="text-xs text-stone-500">
          Er wordt nog niets geplaatst: je krijgt eerst een voorbeeld te zien.
        </p>
        <ResultLine result={result} />
      </form>
    </section>
  );
}

export function InstagramQueueClient({
  posts,
  autoPost,
  loadError,
  nextSlots,
  eventOptions,
  setup,
  renderedAt,
}: {
  posts: InstagramQueuePost[];
  autoPost: boolean;
  loadError: string | null;
  nextSlots: { at: string; format: string }[];
  eventOptions: { id: string; label: string }[];
  setup: Setup;
  /** Server render time, so "time passed" is stable across re-renders. */
  renderedAt: string;
}) {
  const nowMs = Date.parse(renderedAt);
  const open = posts.filter((p) => p.status === "te_keuren");
  const planned = posts.filter((p) => p.status === "goedgekeurd" || p.status === "mislukt");
  const posted = posts.filter((p) => p.status === "gepost");
  const rejected = posts.filter((p) => p.status === "concept");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Instagram-wachtrij
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Maak zelf een post, of keur de voorstellen van de site goed. Pas de tekst
            aan als je wilt en klik Nu plaatsen, of plan hem voor later.
          </p>
        </div>
        <Link
          href="/interne-instagram"
          className="text-sm font-semibold text-[var(--brand-gold-ink)] underline-offset-2 hover:underline"
        >
          Concepten bekijken →
        </Link>
      </header>

      <MakePostCard eventOptions={eventOptions} />

      <section className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <AutoPostToggle enabled={autoPost} />
        <SetupStatus setup={setup} />
        {nextSlots.length > 0 ? (
          <p className="text-xs text-stone-500 md:col-span-2">
            De site stelt zelf ook posts voor, op:{" "}
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

      {posted.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-900">Geplaatst</h2>
          {posted.map((p) => <PostCard key={p.id} post={p} autoPost={autoPost} nowMs={nowMs} />)}
        </section>
      ) : null}

      {rejected.length > 0 ? (
        <details className="space-y-4">
          <summary className="cursor-pointer text-sm font-semibold text-stone-600">
            Afgewezen ({rejected.length}): verborgen, open om er toch één te gebruiken
          </summary>
          <div className="mt-4 space-y-4">
            {rejected.map((p) => <PostCard key={p.id} post={p} autoPost={autoPost} nowMs={nowMs} />)}
          </div>
        </details>
      ) : null}
    </div>
  );
}
