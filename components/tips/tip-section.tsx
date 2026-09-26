"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidEmail, validateAndNormalizeTipUrl } from "@/lib/tips/url";

type Capability = {
  submitEnabled: boolean;
  publicSubmitEnabled: boolean;
  storageMode: "disabled" | "local_file" | "neon";
};

export function TipSection() {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [capability, setCapability] = useState<Capability | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tips")
      .then((response) => response.json())
      .then((data: Partial<Capability>) => {
        if (!cancelled) {
          setCapability({
            submitEnabled: data.submitEnabled === true,
            publicSubmitEnabled: data.publicSubmitEnabled === true,
            storageMode:
              data.storageMode === "neon"
                ? "neon"
                : data.storageMode === "local_file"
                  ? "local_file"
                  : "disabled",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCapability({
            submitEnabled: false,
            publicSubmitEnabled: false,
            storageMode: "disabled",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submitEnabled = capability?.submitEnabled === true;

  function validateClient(): string | null {
    const urlResult = validateAndNormalizeTipUrl(url);
    if (!urlResult.ok) return urlResult.error;
    if (notify) {
      if (!email.trim()) {
        return "Vul je e-mailadres in om een update te ontvangen.";
      }
      if (!isValidEmail(email)) {
        return "Dit e-mailadres lijkt ongeldig.";
      }
    }
    return null;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!submitEnabled) {
      setError(
        "Verzenden is nog niet actief: er is nog geen duurzame opslag ingesteld.",
      );
      return;
    }

    const clientError = validateClient();
    if (clientError) {
      setError(clientError);
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          note: note.trim() || null,
          notifyRequested: notify,
          email: notify ? email.trim() : null,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setError(
          data.error ||
            "Je tip kon niet worden opgeslagen. Probeer het later opnieuw.",
        );
        return;
      }
      setSuccess(
        data.message ||
          "Bedankt voor je tip! We controleren de activiteit en bekijken of ze op OfflineRadar past.",
      );
      setUrl("");
      setNote("");
      setNotify(false);
      setEmail("");
    } catch {
      setError("Er ging iets mis bij het verzenden. Probeer het later opnieuw.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#tip-een-activiteit") {
      setOpen(true);
    }
  }, []);

  return (
    <section
      id="tip-een-activiteit"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6"
    >      <div className="rounded-2xl border border-border bg-secondary/40 px-5 py-8 sm:px-8">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Ken jij een leuk singlesevent? 🎉
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted-foreground">
          Ken je een singlesactiviteit die nog niet op OfflineRadar staat? Deel
          de officiële link en help andere singles nieuwe activiteiten ontdekken.
        </p>

        {!open ? (
          <Button
            type="button"
            className="mt-6 h-11 rounded-full px-6"
            onClick={() => {
              setOpen(true);
              setError("");
              setSuccess("");
            }}
          >
            Tip een singlesactiviteit
          </Button>
        ) : (
          <form
            className="mt-6 max-w-xl space-y-5"
            onSubmit={onSubmit}
            noValidate
            aria-describedby={error ? `${formId}-error` : undefined}
          >
            <div className="space-y-2">
              <Label htmlFor={`${formId}-url`}>Link naar de activiteit</Label>
              <Input
                id={`${formId}-url`}
                type="url"
                inputMode="url"
                autoComplete="url"
                required
                placeholder="https://…"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="h-12 rounded-xl text-base"
                aria-invalid={Boolean(error) && !url.trim()}
              />
              <p className="text-sm text-muted-foreground">
                Plak de officiële evenement-, ticket- of organisatorpagina.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${formId}-note`}>
                Wil je nog iets toevoegen?{" "}
                <span className="font-normal text-muted-foreground">
                  (optioneel)
                </span>
              </Label>
              <textarea
                id={`${formId}-note`}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                placeholder="Extra toelichting of specifieke editie…"
              />
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-border"
                  checked={notify}
                  onChange={(event) => {
                    setNotify(event.target.checked);
                    if (!event.target.checked) setEmail("");
                  }}
                />
                <span>
                  Wil je op de hoogte gebracht worden wanneer we je tip beoordeeld
                  hebben?
                </span>
              </label>

              {notify ? (
                <div className="space-y-2 pl-7">
                  <Label htmlFor={`${formId}-email`}>Je e-mailadres</Label>
                  <Input
                    id={`${formId}-email`}
                    type="email"
                    autoComplete="email"
                    required={notify}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-12 rounded-xl text-base"
                  />
                  <p className="text-sm text-muted-foreground">
                    We gebruiken je e-mailadres uitsluitend om je over deze
                    melding te informeren, niet voor reclame of nieuwsbrieven.
                  </p>
                </div>
              ) : null}
            </div>

            {!submitEnabled ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Verzenden is nog niet open voor bezoekers. Duurzame opslag en
                beveiliging moeten eerst worden geactiveerd. Lokaal testen met
                Neon:{" "}
                <code className="text-xs">npm run dev:tips-neon</code>.
              </p>
            ) : capability?.publicSubmitEnabled ? (
              <p className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
                Tip wordt pas bevestigd nadat we hem veilig hebben opgeslagen.
                Inzenden geeft geen garantie op publicatie.
              </p>
            ) : capability?.storageMode === "neon" ? (
              <p className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
                Neon-ontwikkelopslag actief (OfflineRadar-project). Publieke
                inzending blijft geblokkeerd zonder aparte productietoestemming.
              </p>
            ) : (
              <p className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
                Lokale ontwikkelopslag actief. Dit is geen productie-opslag.
              </p>
            )}

            {error ? (
              <p
                id={`${formId}-error`}
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            {success ? (
              <p role="status" className="text-sm text-emerald-800">
                {success}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                className="h-11 rounded-full px-6"
                disabled={pending || !submitEnabled}
              >
                {pending ? "Bezig met opslaan…" : "Tip verzenden"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full px-6"
                onClick={() => {
                  setOpen(false);
                  setError("");
                  setSuccess("");
                }}
              >
                Sluiten
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
