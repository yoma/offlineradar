"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";
import { toggleFollowOrganizerAction } from "@/app/account/actions";
import { track } from "@/lib/analytics";
import { PendingContent } from "@/components/ui/pending";
import { cn } from "@/lib/utils";

export function FollowOrganizerButton({
  organizerId,
  organizerName,
  initialFollowing = false,
  className,
}: {
  organizerId: string | null | undefined;
  organizerName: string;
  initialFollowing?: boolean;
  className?: string;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const loggedIn = Boolean(session?.user?.id);
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!organizerId) return null;

  const loginHref = `/inloggen?callbackUrl=${encodeURIComponent(pathname || "/ontdek")}`;

  if (status === "loading") {
    return (
      <span
        className={cn(
          "inline-flex h-9 items-center rounded-full border border-border px-3 text-sm text-muted-foreground",
          className,
        )}
      >
        …
      </span>
    );
  }

  if (!loggedIn) {
    return (
      <div className={cn("inline-flex flex-col items-start gap-1", className)}>
        <Link
          href={loginHref}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-sm font-medium text-foreground hover:border-foreground"
        >
          <Heart className="size-3.5" aria-hidden />
          Volg {organizerName}
        </Link>
        <p className="text-xs text-muted-foreground">
          Log in om organisatoren te volgen.
        </p>
      </div>
    );
  }

  function toggle() {
    if (pending) return;
    setError(null);
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const result = await toggleFollowOrganizerAction(organizerId!, next);
      if (!result.ok) {
        setFollowing(!next);
        setError(result.error);
        return;
      }
      setFollowing(result.following);
      track(next ? "organizer_follow" : "organizer_unfollow", {
        organizerId: organizerId ?? null,
        organizerName: organizerName ?? null,
      });
    });
  }

  return (
    <div className={cn("inline-flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-pressed={following}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition disabled:opacity-60",
          following
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-border bg-white text-foreground hover:border-foreground",
        )}
      >
        <PendingContent pending={pending} pendingLabel="Bezig…">
          <Heart
            className={cn("size-3.5", following && "fill-current")}
            aria-hidden
          />
          {following ? `Je volgt ${organizerName}` : `Volg ${organizerName}`}
        </PendingContent>
      </button>
      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : null}
      {!following ? (
        <p className="sr-only">Log in om organisatoren te volgen.</p>
      ) : null}
    </div>
  );
}
