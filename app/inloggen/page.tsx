import Link from "next/link";
import { ActionButton } from "@/components/ui/action-submit-button";
import { continueWithGoogle } from "@/app/account/actions";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { isGoogleAuthConfigured } from "@/lib/tips/auth-env";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/account");
  }

  const params = await searchParams;
  const error = params.error;
  const callbackRaw = params.callbackUrl;
  const callbackUrl =
    typeof callbackRaw === "string" &&
    callbackRaw.startsWith("/") &&
    !callbackRaw.startsWith("//")
      ? callbackRaw
      : "/account";

  const configured = isGoogleAuthConfigured();

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Inloggen</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Optioneel. Zonder account kun je DateOfflineHub volledig gebruiken. Met
        een account onthouden we je voorkeuren en bewaarde activiteiten op al
        je toestellen.
      </p>

      {error ? (
        <p
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="alert"
        >
          {error === "AccessDenied"
            ? "Inloggen geannuleerd of geweigerd. Je kunt DateOfflineHub zonder account blijven gebruiken."
            : error === "Configuration"
              ? "Inloggen is tijdelijk niet beschikbaar."
              : "Er ging iets mis bij het inloggen. Probeer het opnieuw of ga verder zonder account."}
        </p>
      ) : null}

      {configured ? (
        <form
          className="mt-8"
          action={async () => {
            "use server";
            await continueWithGoogle(callbackUrl);
          }}
        >
          <ActionButton pendingLabel="Bezig…" className="h-11 w-full rounded-full">
            Doorgaan met Google
          </ActionButton>
        </form>
      ) : (
        <p className="mt-8 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
          Google-login is hier niet geconfigureerd.
        </p>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        <Link href="/ontdek" className="font-medium underline-offset-4 hover:underline">
          Verder zonder account
        </Link>
      </p>
    </div>
  );
}
