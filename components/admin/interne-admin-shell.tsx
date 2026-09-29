import type { ReactNode } from "react";

/**
 * Shared warm shell for internal admin pages.
 */
export function InterneAdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-[100svh] overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(230,30,77,0.08),_transparent_55%),linear-gradient(180deg,#faf7f4_0%,#f3efe9_45%,#f7f4f0_100%)]"
      />
      <div className="relative mx-auto w-full min-w-0 max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}
