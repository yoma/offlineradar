import Link from "next/link";
import { countBetaFeedbackByStatus } from "@/lib/feedback/store";

/**
 * Shared internal admin nav.
 * Daily path: Toevoegen → Bronnen → Wachtrij → Live. Secondary tools after.
 * Loads the "Nieuw" feedback count itself so every admin page shows the same badge.
 */
export async function InterneAdminNav({
  active,
  newFeedbackCount,
}: {
  active:
    | "dashboard"
    | "goedkeuren"
    | "events"
    | "tips"
    | "feedback"
    | "aanvoer"
    | "bronnen"
    | "instagram";
  /** Pass when the page already has the counts (feedback inbox). */
  newFeedbackCount?: number;
}) {
  if (newFeedbackCount === undefined) {
    try {
      newFeedbackCount = (await countBetaFeedbackByStatus()).new;
    } catch {
      newFeedbackCount = 0;
    }
  }
  const items = [
    { href: "/interne-aanvoer", key: "aanvoer" as const, label: "Toevoegen" },
    {
      href: "/interne-aanvoer?tab=bronnen",
      key: "bronnen" as const,
      label: "Bronnen",
    },
    {
      href: "/interne-goedkeuren",
      key: "goedkeuren" as const,
      label: "Wachtrij",
    },
    { href: "/interne-events", key: "events" as const, label: "Live" },
    {
      href: "/interne-instagram/wachtrij",
      key: "instagram" as const,
      label: "Instagram",
    },
    {
      href: "/interne-feedback",
      key: "feedback" as const,
      label:
        newFeedbackCount > 0
          ? `Feedback ${newFeedbackCount}`
          : "Feedback",
    },
    {
      href: "/interne-dashboard",
      key: "dashboard" as const,
      label: "Cijfers",
    },
  ];
  // "tips" still accepted as active for old links; highlight Wachtrij instead.
  const activeKey = active === "tips" ? "goedkeuren" : active;

  return (
    <nav className="mobile-scroll-x mb-6" aria-label="Interne navigatie">
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-stone-200/80 bg-white/75 p-1 shadow-sm backdrop-blur sm:min-w-0">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-stone-900 text-white shadow"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
