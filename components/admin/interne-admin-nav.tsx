import Link from "next/link";

/**
 * Shared internal admin nav for tips / events / feedback / aanvoer / dashboard.
 */
export function InterneAdminNav({
  active,
  newFeedbackCount = 0,
}: {
  active: "dashboard" | "events" | "tips" | "feedback" | "aanvoer";
  newFeedbackCount?: number;
}) {
  const items = [
    {
      href: "/interne-dashboard",
      key: "dashboard" as const,
      label: "Dashboard",
    },
    { href: "/interne-aanvoer", key: "aanvoer" as const, label: "Aanvoer" },
    { href: "/interne-events", key: "events" as const, label: "Events" },
    { href: "/interne-tips", key: "tips" as const, label: "Tips" },
    {
      href: "/interne-feedback",
      key: "feedback" as const,
      label:
        newFeedbackCount > 0
          ? `Feedback ${newFeedbackCount}`
          : "Feedback",
    },
  ];

  return (
    <nav
      className="mb-6 overflow-x-auto"
      aria-label="Interne navigatie"
    >
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-stone-200/80 bg-white/75 p-1 shadow-sm backdrop-blur sm:min-w-0">
        {items.map((item) => {
          const isActive = item.key === active;
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
