"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { track } from "@/lib/analytics";

function domainFromHref(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

type OutboundLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  eventId?: string | null;
  organizerId?: string | null;
  category?: string | null;
  originPage?: string | null;
  /** Extra analytics label, e.g. ticket | official | source */
  linkKind?: string;
};

/**
 * Central tracked external link for organizer/event sites.
 * Fires external_source_click then navigates normally.
 */
export function OutboundLink({
  href,
  children,
  eventId,
  organizerId,
  category,
  originPage,
  linkKind = "external",
  onClick,
  ...rest
}: OutboundLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    track("external_source_click", {
      eventId: eventId ?? null,
      organizerId: organizerId ?? null,
      category: category ?? null,
      sourceDomain: domainFromHref(href),
      linkKind,
      originPage: originPage ?? null,
    });
    onClick?.(event);
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      {...rest}
    >
      {children}
    </a>
  );
}
