import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Over",
  description: "Wat OfflineRadar is en hoe het werkt.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-10 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Wat is OfflineRadar?
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
          OfflineRadar verzamelt offline activiteiten waar singles en mensen die
          nieuwe contacten zoeken elkaar kunnen ontmoeten. Geen swipes, geen
          chat: ontdekken, bewaren, en doorklikken naar de organisator.
        </p>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Wij organiseren de events niet zelf. Tickets en reservaties gebeuren
          altijd bij de organisator.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Hoe actueel is de informatie?
        </h2>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Bij elk event tonen we wanneer onze bron voor het laatst gecontroleerd
          werd. Eventdetails kunnen wijzigen. Bij twijfel raadpleeg altijd de
          officiële bron of ticketlink.
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">Gesloten beta</h2>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          OfflineRadar zit in een gesloten testerfase. Je kunt de site zonder
          account gebruiken. Optioneel inloggen met Google bewaart voorkeuren en
          bewaarde activiteiten op al je toestellen.
        </p>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Feedback is welkom via{" "}
          <Link href="/feedback" className="underline-offset-4 hover:underline">
            Feedback geven
          </Link>
          .
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight">Privacy</h2>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          Lees hoe we met gegevens omgaan op de{" "}
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            privacyverklaring
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
