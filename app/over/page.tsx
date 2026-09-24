export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-10 px-4 py-12 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Wat is OfflineRadar?
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
          OfflineRadar verzamelt offline activiteiten waar singles en mensen die
          nieuwe contacten zoeken elkaar kunnen ontmoeten.
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
          werd. Bij twijfel raden we altijd aan om de officiële bron te
          bekijken.
        </p>
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Dit is een prototype
        </h2>
        <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
          De activiteiten, organisatoren en links zijn fictief. Ze dienen om het
          product te beoordelen. Er is geen account, geen betaling en geen chat.
        </p>
      </div>
    </div>
  );
}
