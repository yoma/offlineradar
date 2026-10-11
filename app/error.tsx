"use client";

import Link from "next/link";
import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    const raw = typeof error.message === "string" ? error.message : "Er ging iets mis";
    // Keep short + scrub-ish: no emails, no long stacks.
    const message = raw.replace(/\S+@\S+/g, "[e-mail]").slice(0, 120);
    track("client_error", {
      message,
      digest: error.digest ?? null,
      path:
        typeof window !== "undefined" ? window.location.pathname.slice(0, 200) : null,
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Er ging iets mis
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        De pagina kon even niet geladen worden. Probeer opnieuw, of ga terug
        naar de start.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" onClick={reset} className="rounded-full">
          Opnieuw proberen
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/">Naar home</Link>
        </Button>
      </div>
    </div>
  );
}
