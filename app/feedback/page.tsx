import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedbackForm } from "@/components/feedback/feedback-form";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Geef productfeedback over OfflineRadar.",
};

export default function FeedbackPage() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-lg px-4 py-10 sm:px-6">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Beta — feedback welkom
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        Feedback geven
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Kort en concreet. Geen account nodig. We gebruiken dit alleen om
        OfflineRadar te verbeteren.
      </p>
      <div className="mt-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Laden…</p>}>
          <FeedbackForm />
        </Suspense>
      </div>
    </div>
  );
}
