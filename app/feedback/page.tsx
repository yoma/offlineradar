import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback/feedback-form";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Geef productfeedback over OfflineRadar.",
};

export default function FeedbackPage() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-lg px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Feedback geven
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        OfflineRadar zit in een gesloten beta. Je antwoorden helpen ons te
        verbeteren. Geen account nodig.
      </p>
      <div className="mt-8">
        <FeedbackForm />
      </div>
    </div>
  );
}
