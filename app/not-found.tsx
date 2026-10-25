import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Niet gevonden" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-heading text-4xl text-[var(--brand-bordeaux)]">
        Deze activiteit bestaat niet
      </h1>
      <p className="mt-3 text-muted-foreground">
        Ze staat niet in dit prototype, of ze hoort niet in de lijst.
      </p>
      <Link href="/ontdek" className="mt-6 inline-block font-medium underline">
        Terug naar ontdekken
      </Link>
    </div>
  );
}
