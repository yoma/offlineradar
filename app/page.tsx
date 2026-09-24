import { HomeHero } from "@/components/home/home-search";

export default function HomePage() {
  return (
    <div>
      <HomeHero />
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          Zo werkt OfflineRadar
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Geen swipes, geen chat. Alleen ontdekken wat er binnenkort gebeurt, en doorklikken naar de organisator.
        </p>
        <ol className="mt-10 grid gap-10 sm:grid-cols-3">
          <Step n="01" title="Zoek" text="Kies waar, wanneer en wat je wilt doen." />
          <Step n="02" title="Controleer" text="Je leeftijd bepaalt of je mag deelnemen." />
          <Step n="03" title="Ga erheen" text="Tickets en reservatie blijven bij de organisator." />
        </ol>
      </section>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <li>
      <p className="text-sm font-semibold text-[#e61e4d]">{n}</p>
      <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{text}</p>
    </li>
  );
}
