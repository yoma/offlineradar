import Link from "next/link";

/**
 * Shared internal admin nav for tips / events / feedback.
 */
export function InterneAdminNav({
  active,
  newFeedbackCount = 0,
}: {
  active: "events" | "tips" | "feedback";
  newFeedbackCount?: number;
}) {
  const items = [
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
      className="mb-6 flex flex-wrap gap-2 text-sm"
      aria-label="Interne navigatie"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full border px-3 py-1.5 font-medium ${
              isActive
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
