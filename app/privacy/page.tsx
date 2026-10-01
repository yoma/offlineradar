import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Hoe DateOfflineHub omgaat met je gegevens.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-8 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          DateOfflineHub helpt je offline singlesactiviteiten te ontdekken. We
          bewaren zo weinig mogelijk gegevens.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Wie beheert dit?</h2>
        <p className="text-[15px] leading-7 text-muted-foreground">
          DateOfflineHub is een onafhankelijk productproject (beta). Contact via
          de{" "}
          <Link href="/feedback" className="underline-offset-4 hover:underline">
            feedbackpagina
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Zonder account
        </h2>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Je kunt zoeken, filters gebruiken, events bekijken en tips of meldingen
          sturen zonder in te loggen. Filters en bewaarde events kunnen lokaal
          op jouw toestel blijven (browseropslag).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Met Google-account (optioneel)
        </h2>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Als je inlogt via Google, bewaren we je e-mailadres en een interne
          gebruikers-id om:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-[15px] leading-7 text-muted-foreground">
          <li>zoekvoorkeuren te onthouden</li>
          <li>bewaarde activiteiten te synchroniseren</li>
          <li>organisatoren die je volgt te onthouden</li>
        </ul>
        <p className="text-[15px] leading-7 text-muted-foreground">
          We vragen geen wachtwoord, telefoonnummer, adres of exacte
          geboortedatum. Google-scopes blijven beperkt tot openid, e-mail en
          profiel.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Cookies / sessie
        </h2>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Bij login gebruiken we een beveiligde sessiecookie van Auth.js zodat
          je ingelogd blijft. Zonder login zijn die auth-cookies niet nodig.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Tips, meldingen en feedback
        </h2>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Als je een tip, melding of productfeedback stuurt, bewaren we alleen
          wat je invult (bijvoorbeeld een eventlink of optioneel e-mailadres)
          om de melding te behandelen.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Externe eventlinks
        </h2>
        <p className="text-[15px] leading-7 text-muted-foreground">
          DateOfflineHub organiseert de activiteiten niet zelf. Tickets,
          reservaties en actuele details staan bij de organisator. Eventinfo op
          DateOfflineHub kan wijzigen of verouderd zijn; de officiële bron blijft
          leidend.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Account verwijderen
        </h2>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Via{" "}
          <Link href="/account" className="underline-offset-4 hover:underline">
            Mijn account
          </Link>{" "}
          kun je je DateOfflineHub-account verwijderen. Dan wissen we je
          voorkeuren, bewaarde activiteiten en gevolgde organisatoren. Je
          Google-account zelf blijft
          bestaan.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        Laatst bijgewerkt: 28 september 2026 (beta).
      </p>
    </div>
  );
}
