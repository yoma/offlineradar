import type { Metadata } from "next";
import { FeedbackPageOpen } from "@/components/feedback/feedback-page-open";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Geef productfeedback over OfflineRadar.",
};

export default function FeedbackPage() {
  return <FeedbackPageOpen />;
}
