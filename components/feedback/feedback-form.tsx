"use client";

import { useState } from "react";
import Link from "next/link";
import { submitBetaFeedback } from "@/app/feedback/actions";
import { Button } from "@/components/ui/button";

export function FeedbackForm() {
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setStatus("idle");
    setMessage(null);
    formData.set("userAgent", typeof navigator !== "undefined" ? navigator.userAgent : "");
    const result = await submitBetaFeedback(formData);
    setBusy(false);
    if (!result.ok) {
      setStatus("error");
      setMessage(result.error);
      return;
    }
    setStatus("ok");
    setMessage("Bedankt. Je feedback is bewaard.");
  }

  if (status === "ok") {
    return (
      <div className="rounded-xl border border-border bg-secondary/40 px-4 py-5 text-sm leading-6">
        <p className="font-medium">{message}</p>
        <p className="mt-2 text-muted-foreground">
          Je mag OfflineRadar blijven gebruiken zonder account.
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
    <form action={onSubmit} className="space-y-5">
      <label className="block text-sm">
        <span className="font-medium">Wat ging goed?</span>
        <textarea
          name="whatWentWell"
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2 text-[15px]"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Wat was onduidelijk?</span>
        <textarea
          name="whatUnclear"
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2 text-[15px]"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Wat mis je?</span>
        <textarea
          name="whatMissing"
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2 text-[15px]"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">E-mail (optioneel)</span>
        <input
          type="email"
          name="contactEmail"
          autoComplete="email"
          className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
        />
        <span className="mt-1 block text-muted-foreground">
          Alleen als we je mogen contacteren over deze feedback.
        </span>
      </label>
      {message ? (
        <p className="text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="h-11 rounded-full px-6">
        {busy ? "Versturen…" : "Feedback versturen"}
      </Button>
    </form>
  );
}
