"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OPEN_FEEDBACK_EVENT } from "@/components/feedback/feedback-launcher";

/** Deep-link `/feedback` opens the floating feedback modal. */
export function FeedbackPageOpen() {
  const router = useRouter();

  useEffect(() => {
    window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT));
    router.replace("/ontdek");
  }, [router]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-muted-foreground">
      Feedback openen…
    </div>
  );
}
