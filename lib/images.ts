import type { ActivityId, EventCategory } from "@/types/event";

const HERO =
  "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=2400&q=80";

const BY_ACTIVITY: Partial<Record<ActivityId, string>> = {
  eten: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80",
  drinken:
    "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80",
  wandelen:
    "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80",
  lopen:
    "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80",
  sport:
    "https://images.unsplash.com/photo-1517649763962-0c623066027c?auto=format&fit=crop&w=1200&q=80",
  padel:
    "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=80",
  party:
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
  dans: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=1200&q=80",
  workshop:
    "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80",
  reizen:
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1200&q=80",
  weekend:
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
  outdoor:
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
};

const BY_CATEGORY: Record<EventCategory, string> = {
  dating:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
  meet_new_people:
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80",
  social:
    "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=1200&q=80",
};

export function heroImageUrl(): string {
  return HERO;
}

export function eventImageUrl(input: {
  imageUrl?: string | null;
  category: EventCategory;
  activities: ActivityId[];
}): string {
  if (input.imageUrl) return input.imageUrl;
  for (const activity of input.activities) {
    const match = BY_ACTIVITY[activity];
    if (match) return match;
  }
  return BY_CATEGORY[input.category];
}
