"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { submitBetaFeedback } from "@/app/feedback/actions";
import { Button } from "@/components/ui/button";
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
} from "@/lib/feedback/labels";
import { cn } from "@/lib/utils";

const MODAL_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Werkt niet",
  unclear: "Onduidelijk",
  idea: "Idee",
  missing_event: "Mis ik",
  other: "Iets anders",
};

const PAGE_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Bug / werkt niet",
  unclear: "Onduidelijk",
  idea: "Idee",
  missing_event: "Event of aanbod ontbreekt",
  other: "Anders",
};

export function FeedbackForm({
  variant = "page",
  onSuccess,
}: {
  variant?: "page" | "modal";
  onSuccess?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const labels = variant === "modal" ? MODAL_CATEGORY_LABEL : PAGE_CATEGORY_LABEL;
  const isModal = variant === "modal";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("idle");
    setError(null);

    const formData = new FormData();
    formData.set("category", category);
    formData.set("message", message);
    formData.set("contactEmail", contactEmail);
    formData.set(
      "userAgent",
      typeof navigator !== "undefined" ? navigator.userAgent : "",
    );
    formData.set("pathname", pathname || "/feedback");
    formData.set("queryString", searchParams?.toString() ?? "");
    formData.set("website", "");

    const result = await submitBetaFeedback(formData);
    setBusy(false);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("ok");
    setMessage("");
    setContactEmail("");
    onSuccess?.();
  }

  if (status === "ok") {
    return (
      <div
        className={cn(
          "text-sm leading-6",
          isModal
            ? "rounded-2xl bg-[#e61e4d]/08 px-4 py-5 text-center"
            : "rounded-xl border border-border bg-secondary/40 px-4 py-5",
        )}
        role="status"
      >
        <p className="font-medium">Dankjewel! Je feedback is opgeslagen.</p>
        <p className="mt-2 text-muted-foreground">
          Dit helpt ons OfflineRadar beter te maken.
        </p>
        {!isModal ? (
          <Link
            href="/ontdek"
            className="mt-4 inline-block font-medium underline-offset-4 hover:underline"
          >
            Terug naar Ontdek
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset>
        <legend
          className={cn(
            "text-sm font-medium",
            isModal && "text-muted-foreground",
          )}
        >
          {isModal ? "Wat wil je melden?" : "Wat wil je doorgeven?"}
        </legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {FEEDBACK_CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition",
                category === key
                  ? isModal
                    ? "border-[#e61e4d]/40 bg-[#e61e4d]/12 font-medium text-[#e61e4d]"
                    : "border-foreground bg-foreground text-background"
                  : "border-border bg-white text-foreground hover:border-foreground/40",
              )}
            >
              {category === key && isModal ? "✓ " : null}
              {labels[key]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        {!isModal ? (
          <span className="font-medium">
            Vertel kort wat er gebeurde of wat je mist
          </span>
        ) : (
          <span className="sr-only">Je tip</span>
        )}
        <textarea
          name="message"
          required
          rows={isModal ? 4 : 5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={2000}
          placeholder={isModal ? "In een of twee zinnen…" : undefined}
          className={cn(
            "w-full rounded-2xl border border-border bg-white px-3.5 py-3 text-[15px] outline-none",
            "focus:border-[#e61e4d]/45 focus:ring-4 focus:ring-[#e61e4d]/15",
            !isModal && "mt-1.5 rounded-xl",
          )}
        />
        {isModal ? (
          <span className="mt-1.5 block text-xs text-muted-foreground">
            Kort mag ook. Tip: Ctrl/Cmd + Enter om snel te versturen.
          </span>
        ) : null}
      </label>

      {!isModal ? (
        <label className="block text-sm">
          <span className="font-medium">E-mailadres (optioneel)</span>
          <input
            type="email"
            name="contactEmail"
            autoComplete="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
          />
          <span className="mt-1 block text-muted-foreground">
            Alleen als we je hierover mogen contacteren.
          </span>
        </label>
      ) : (
        <input type="hidden" name="contactEmail" value={contactEmail} />
      )}

      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={busy}
        className={cn(
          "h-12 rounded-full",
          isModal && "w-full text-base font-semibold shadow-[0_12px_28px_-10px_rgba(230,30,77,0.55)]",
          !isModal && "h-11 px-6",
        )}
      >
        {busy ? "Versturen…" : isModal ? "Verstuur" : "Feedback versturen"}
      </Button>
    </form>
  );
}
