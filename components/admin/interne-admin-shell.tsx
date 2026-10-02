import type { ReactNode } from "react";

/**
 * Shared warm shell for internal admin pages.
 */
export function InterneAdminShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  /** Wider layout for dashboard grids. */
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-[100svh] overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(212,175,55,0.12),_transparent_55%),linear-gradient(180deg,#fbf8f0_0%,#f5f0e6_45%,#f7f4ee_100%)]"
      />
      <div
        className={`relative mx-auto w-full min-w-0 px-4 py-8 sm:px-6 sm:py-10 ${
          wide ? "max-w-6xl" : "max-w-4xl"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
