/**
 * Neon store for public app users, preferences, and saved events.
 * Ownership always keyed by session user id — never client-supplied ids.
 */
import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import type { ActivityId, PreferredMeetGender, UserGender } from "@/types/event";
import type { StoredProfile } from "@/types/search";
import { emptyProfile } from "@/lib/storage-shared";

export type AppUserRecord = {
  id: string;
  email: string;
  googleSub: string | null;
  name: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function iso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function upsertAppUserFromGoogle(input: {
  email: string;
  googleSub: string | null;
  name?: string | null;
  imageUrl?: string | null;
}): Promise<AppUserRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const email = input.email.trim().toLowerCase();
  if (!email) return null;

  const existing = (await sql`
    SELECT * FROM app_users
    WHERE email = ${email}
       OR (${input.googleSub}::text IS NOT NULL AND google_sub = ${input.googleSub})
    ORDER BY created_at ASC
    LIMIT 1
  `) as {
    id: string;
    email: string;
    google_sub: string | null;
    name: string | null;
    image_url: string | null;
    created_at: string | Date;
    updated_at: string | Date;
  }[];

  if (existing[0]) {
    const row = existing[0];
    const updated = (await sql`
      UPDATE app_users SET
        email = ${email},
        google_sub = COALESCE(${input.googleSub}, google_sub),
        name = COALESCE(${input.name ?? null}, name),
        image_url = COALESCE(${input.imageUrl ?? null}, image_url),
        updated_at = now()
      WHERE id = ${row.id}
      RETURNING *
    `) as typeof existing;
    const u = updated[0]!;
    return {
      id: u.id,
      email: u.email,
      googleSub: u.google_sub,
      name: u.name,
      imageUrl: u.image_url,
      createdAt: iso(u.created_at)!,
      updatedAt: iso(u.updated_at)!,
    };
  }

  const id = randomUUID();
  const created = (await sql`
    INSERT INTO app_users (id, email, google_sub, name, image_url)
    VALUES (
      ${id},
      ${email},
      ${input.googleSub},
      ${input.name ?? null},
      ${input.imageUrl ?? null}
    )
    RETURNING *
  `) as typeof existing;
  const row = created[0]!;
  return {
    id: row.id,
    email: row.email,
    googleSub: row.google_sub,
    name: row.name,
    imageUrl: row.image_url,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export async function getAppUserById(
  id: string,
): Promise<AppUserRecord | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT * FROM app_users WHERE id = ${id} LIMIT 1
  `) as {
    id: string;
    email: string;
    google_sub: string | null;
    name: string | null;
    image_url: string | null;
    created_at: string | Date;
    updated_at: string | Date;
  }[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    googleSub: row.google_sub,
    name: row.name,
    imageUrl: row.image_url,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapPreferences(row: {
  age: number | null;
  gender: string | null;
  place_id: string;
  max_distance_km: number;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  preferred_meet_gender: string;
  interests: unknown;
}): StoredProfile {
  const interests = Array.isArray(row.interests)
    ? (row.interests.filter((x): x is ActivityId => typeof x === "string") as ActivityId[])
    : [];
  return {
    age: row.age,
    gender: (row.gender as UserGender | null) ?? null,
    placeId: row.place_id || emptyProfile.placeId,
    maxDistanceKm: row.max_distance_km || emptyProfile.maxDistanceKm,
    preferredAgeMin: row.preferred_age_min,
    preferredAgeMax: row.preferred_age_max,
    preferredMeetGender:
      (row.preferred_meet_gender as PreferredMeetGender) || "anyone",
    interests,
  };
}

export async function getUserPreferences(
  userId: string,
): Promise<StoredProfile | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT * FROM user_preferences WHERE user_id = ${userId} LIMIT 1
  `) as {
    age: number | null;
    gender: string | null;
    place_id: string;
    max_distance_km: number;
    preferred_age_min: number | null;
    preferred_age_max: number | null;
    preferred_meet_gender: string;
    interests: unknown;
  }[];
  if (!rows[0]) return null;
  return mapPreferences(rows[0]);
}

export async function upsertUserPreferences(
  userId: string,
  profile: StoredProfile,
): Promise<StoredProfile | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const interestsJson = JSON.stringify(profile.interests ?? []);
  const rows = (await sql`
    INSERT INTO user_preferences (
      user_id, age, gender, place_id, max_distance_km,
      preferred_age_min, preferred_age_max, preferred_meet_gender, interests
    ) VALUES (
      ${userId},
      ${profile.age},
      ${profile.gender},
      ${profile.placeId || "antwerpen"},
      ${profile.maxDistanceKm || 100},
      ${profile.preferredAgeMin},
      ${profile.preferredAgeMax},
      ${profile.preferredMeetGender || "anyone"},
      ${interestsJson}::jsonb
    )
    ON CONFLICT (user_id) DO UPDATE SET
      age = EXCLUDED.age,
      gender = EXCLUDED.gender,
      place_id = EXCLUDED.place_id,
      max_distance_km = EXCLUDED.max_distance_km,
      preferred_age_min = EXCLUDED.preferred_age_min,
      preferred_age_max = EXCLUDED.preferred_age_max,
      preferred_meet_gender = EXCLUDED.preferred_meet_gender,
      interests = EXCLUDED.interests,
      updated_at = now()
    RETURNING *
  `) as {
    age: number | null;
    gender: string | null;
    place_id: string;
    max_distance_km: number;
    preferred_age_min: number | null;
    preferred_age_max: number | null;
    preferred_meet_gender: string;
    interests: unknown;
  }[];
  return rows[0] ? mapPreferences(rows[0]) : null;
}

export async function listSavedEventIds(userId: string): Promise<string[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const rows = (await sql`
    SELECT event_edition_id
    FROM user_saved_events
    WHERE user_id = ${userId}
    ORDER BY saved_at DESC
  `) as { event_edition_id: string }[];
  return rows.map((r) => r.event_edition_id);
}

export async function setSavedEvent(
  userId: string,
  eventEditionId: string,
  saved: boolean,
): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  if (saved) {
    // Only save if edition exists (and preferably published/visible).
    const exists = await sql`
      SELECT id FROM event_editions WHERE id = ${eventEditionId} LIMIT 1
    `;
    if (exists.length === 0) return false;
    await sql`
      INSERT INTO user_saved_events (user_id, event_edition_id)
      VALUES (${userId}, ${eventEditionId})
      ON CONFLICT DO NOTHING
    `;
    return true;
  }
  await sql`
    DELETE FROM user_saved_events
    WHERE user_id = ${userId} AND event_edition_id = ${eventEditionId}
  `;
  return true;
}

/** Union merge: add any missing local ids to server (dedupe). */
export async function mergeSavedEventIds(
  userId: string,
  localIds: string[],
): Promise<string[]> {
  const sql = getEventsSql();
  if (!sql) return [];
  const clean = [...new Set(localIds.map((id) => id.trim()).filter(Boolean))];
  for (const id of clean) {
    await setSavedEvent(userId, id, true);
  }
  return listSavedEventIds(userId);
}

export async function countSavedEvents(userId: string): Promise<number> {
  const sql = getEventsSql();
  if (!sql) return 0;
  const rows = (await sql`
    SELECT count(*)::int AS n FROM user_saved_events WHERE user_id = ${userId}
  `) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

export async function deleteAppUser(userId: string): Promise<boolean> {
  const sql = getEventsSql();
  if (!sql) return false;
  const rows = await sql`
    DELETE FROM app_users WHERE id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}
