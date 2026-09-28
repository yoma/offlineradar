"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { submitBetaFeedback } from "@/app/feedback/actions";
import { Button } from "@/components/ui/button";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  type FeedbackCategory,
} from "@/lib/feedback/labels";

export function FeedbackForm() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("other");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");

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
  }

  if (status === "ok") {
    return (
      <div
        className="rounded-xl border border-border bg-secondary/40 px-4 py-5 text-sm leading-6"
        role="status"
      >
        <p className="font-medium">Dankjewel! Je feedback is opgeslagen.</p>
        <p className="mt-2 text-muted-foreground">
          Dit helpt ons OfflineRadar beter te maken.
        </p>
        <Link
          href="/ontdek"
          className="mt-4 inline-block font-medium underline-offset-4 hover:underline"
        >
          Terug naar Ontdek
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium">Wat wil je doorgeven?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FEEDBACK_CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                category === key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-white text-foreground hover:border-foreground"
              }`}
            >
              {FEEDBACK_CATEGORY_LABEL[key]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="font-medium">
          Vertel kort wat er gebeurde of wat je mist
        </span>
        <textarea
          name="message"
          required
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2000}
          className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2 text-[15px]"
        />
      </label>

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

      {/* Honeypot */}
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

      <Button type="submit" disabled={busy} className="h-11 rounded-full px-6">
        {busy ? "Versturen…" : "Feedback versturen"}
      </Button>
    </form>
  );
}
