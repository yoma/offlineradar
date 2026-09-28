"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteAccountAction,
  publicSignOut,
  savePreferencesAction,
} from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { USER_PLACES } from "@/data/places";
import { writeProfile } from "@/lib/storage";
import type { PreferredMeetGender, UserGender } from "@/types/event";
import type { StoredProfile } from "@/types/search";
import { emptyProfile } from "@/lib/storage-shared";

const DISTANCES = [10, 25, 50, 100] as const;

export function AccountView({
  email,
  savedCount,
  preferences,
}: {
  email: string;
  savedCount: number;
  preferences: StoredProfile | null;
}) {
  const router = useRouter();
  const initial = preferences ?? emptyProfile;
  const [age, setAge] = useState(initial.age ? String(initial.age) : "");
  const [gender, setGender] = useState<UserGender | "">(initial.gender ?? "");
  const [placeId, setPlaceId] = useState(initial.placeId || "antwerpen");
  const [maxDistanceKm, setMaxDistanceKm] = useState(initial.maxDistanceKm || 25);
  const [preferredAgeMin, setPreferredAgeMin] = useState(
    initial.preferredAgeMin ? String(initial.preferredAgeMin) : "",
  );
  const [preferredAgeMax, setPreferredAgeMax] = useState(
    initial.preferredAgeMax ? String(initial.preferredAgeMax) : "",
  );
  const [preferredMeetGender, setPreferredMeetGender] =
    useState<PreferredMeetGender>(initial.preferredMeetGender || "anyone");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function onSavePreferences(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    const profile: StoredProfile = {
      age: age ? Number(age) : null,
      gender: gender || null,
      placeId,
      maxDistanceKm,
      preferredAgeMin: preferredAgeMin ? Number(preferredAgeMin) : null,
      preferredAgeMax: preferredAgeMax ? Number(preferredAgeMax) : null,
      preferredMeetGender,
      interests: initial.interests ?? [],
    };
    const result = await savePreferencesAction(profile);
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    writeProfile(profile);
    setStatus("Voorkeuren bewaard.");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Mijn account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We gebruiken je gegevens alleen om voorkeuren te onthouden en bewaarde
        activiteiten te synchroniseren. Meer info in de{" "}
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          privacyverklaring
        </Link>
        .
      </p>

      <dl className="mt-8 space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">E-mail</dt>
          <dd className="mt-0.5 font-medium break-all">{email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Bewaarde activiteiten</dt>
          <dd className="mt-0.5 font-medium">
            {savedCount}{" "}
            <Link
              href="/bewaard"
              className="ml-2 font-normal underline-offset-4 hover:underline"
            >
              Bekijk
            </Link>
          </dd>
        </div>
      </dl>

      <form onSubmit={onSavePreferences} className="mt-10 space-y-5 border-t border-border pt-8">
        <h2 className="text-lg font-semibold tracking-tight">Voorkeuren</h2>
        <p className="text-sm text-muted-foreground">
          Je kunt deze ook vanaf{" "}
          <Link href="/ontdek" className="underline-offset-4 hover:underline">
            Ontdek
          </Link>{" "}
          bewaren. URL-filters blijven leidend.
        </p>

        <label className="block text-sm">
          <span className="text-muted-foreground">Je leeftijd</span>
          <input
            type="number"
            min={18}
            max={99}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted-foreground">Gender</span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as UserGender | "")}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
          >
            <option value="">Niet ingesteld</option>
            <option value="woman">Vrouw</option>
            <option value="man">Man</option>
            <option value="other">Anders</option>
            <option value="prefer_not">Zeg ik liever niet</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-muted-foreground">Regio / plaats</span>
          <select
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
          >
            {USER_PLACES.map((place) => (
              <option key={place.id} value={place.id}>
                {place.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-muted-foreground">Max. afstand</span>
          <select
            value={maxDistanceKm}
            onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
          >
            {DISTANCES.map((km) => (
              <option key={km} value={km}>
                {km} km
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Gewenste leeftijd min</span>
            <input
              type="number"
              min={18}
              max={99}
              value={preferredAgeMin}
              onChange={(e) => setPreferredAgeMin(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted-foreground">Gewenste leeftijd max</span>
            <input
              type="number"
              min={18}
              max={99}
              value={preferredAgeMax}
              onChange={(e) => setPreferredAgeMax(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-muted-foreground">Wil graag ontmoeten</span>
          <select
            value={preferredMeetGender}
            onChange={(e) =>
              setPreferredMeetGender(e.target.value as PreferredMeetGender)
            }
            className="mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3"
          >
            <option value="anyone">Iedereen</option>
            <option value="women">Vrouwen</option>
            <option value="men">Mannen</option>
          </select>
        </label>

        <Button type="submit" disabled={busy} className="h-11 rounded-full px-6">
          {busy ? "Bewaren…" : "Bewaar mijn voorkeuren"}
        </Button>
        {status ? (
          <p className="text-sm text-muted-foreground" role="status">
            {status}
          </p>
        ) : null}
      </form>

      <div className="mt-10 space-y-3 border-t border-border pt-8">
        <p className="text-sm text-muted-foreground">
          <Link href="/feedback" className="underline-offset-4 hover:underline">
            Feedback geven
          </Link>
        </p>
        <form action={publicSignOut.bind(null, "/")}>
          <Button type="submit" variant="outline" className="h-11 rounded-full px-6">
            Uitloggen
          </Button>
        </form>

        {!confirmDelete ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => setConfirmDelete(true)}
          >
            Account verwijderen
          </button>
        ) : (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-950"
            role="alertdialog"
            aria-labelledby="delete-account-title"
          >
            <p id="delete-account-title" className="font-medium">
              Account definitief verwijderen?
            </p>
            <p className="mt-1.5 text-red-900/80">
              Voorkeuren en bewaarde activiteiten worden gewist. Je Google-account
              zelf blijft bestaan.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-10 rounded-full bg-red-600 hover:bg-red-700"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const result = await deleteAccountAction();
                  if (!result.ok) {
                    setBusy(false);
                    setStatus(result.error);
                    return;
                  }
                  router.push("/");
                  router.refresh();
                }}
              >
                Ja, verwijder account
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full"
                onClick={() => setConfirmDelete(false)}
              >
                Annuleren
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
