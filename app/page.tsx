import { HomeSearch } from "@/components/home/home-search";

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-16 size-72 rounded-full border border-primary/15" />
        <div className="pointer-events-none absolute right-8 -top-4 size-40 rounded-full border border-primary/20" />
        <div className="pointer-events-none absolute right-16 top-10 size-16 rounded-full bg-primary/10" />
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
          <p className="text-sm font-medium text-primary">OfflineRadar</p>
          <h1 className="mt-3 max-w-xl font-heading text-5xl leading-none sm:text-6xl">
            Ga offline. Ontmoet mensen.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-7 text-muted-foreground">
            Singles-events, diners, wandelingen, sport, feestjes, reizen en andere manieren om nieuwe mensen te ontmoeten, allemaal op één plek.
          </p>
        </div>
      </section>
      <HomeSearch />
      <section className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-10 sm:grid-cols-3">
        <Step title="Zoek" text="Kies wanneer, waar en wat je wilt doen." />
        <Step title="Controleer" text="Je leeftijd bepaalt of je mag deelnemen." />
        <Step title="Ga erheen" text="Tickets en reservatie blijven bij de organisator." />
      </section>
    </div>
  );
}

function Step({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h2 className="font-heading text-xl">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
