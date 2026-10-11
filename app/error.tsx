"use client";

import Link from "next/link";
import { useEffect } from "react";
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
