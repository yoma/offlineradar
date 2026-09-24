export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-4 py-10">
      <div>
        <h1 className="font-heading text-4xl">Wat is OfflineRadar?</h1>
        <p className="mt-4 leading-7">
          OfflineRadar verzamelt offline activiteiten waar singles en mensen die nieuwe contacten zoeken elkaar kunnen ontmoeten.
        </p>
        <p className="mt-3 leading-7">
          Wij organiseren de events niet zelf. Tickets en reservaties gebeuren altijd bij de organisator.
        </p>
      </div>
      <div>
        <h2 className="font-heading text-2xl">Hoe actueel is de informatie?</h2>
        <p className="mt-3 leading-7">
          Bij elk event tonen we wanneer onze bron voor het laatst gecontroleerd werd. Bij twijfel raden we altijd aan om de officiële bron te bekijken.
        </p>
      </div>
      <div>
        <h2 className="font-heading text-2xl">Dit is een prototype</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          De activiteiten, organisatoren en links zijn fictief. Ze dienen om het product te beoordelen. Er is geen account, geen betaling en geen chat.
        </p>
      </div>
    </div>
  );
}
