import { randomUUID } from "node:crypto";
import { getEventsSql } from "@/lib/events/db";
import {
  INTAKE_ALLOWED_MIME,
  INTAKE_MAX_BYTES,
} from "@/lib/aanvoer/types";

export type IntakeAssetRecord = {
  id: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
  createdAt: string;
};

export type IntakeAssetWithData = IntakeAssetRecord & {
  data: Buffer;
};

function isAllowedMime(value: string): value is (typeof INTAKE_ALLOWED_MIME)[number] {
  return (INTAKE_ALLOWED_MIME as readonly string[]).includes(value);
}

export function validateIntakeImage(input: {
  mimeType: string;
  byteSize: number;
}): { ok: true } | { ok: false; error: string } {
  if (!isAllowedMime(input.mimeType)) {
    return {
      ok: false,
      error: "Alleen PNG, JPG/JPEG of WEBP zijn toegestaan.",
    };
  }
  if (input.byteSize <= 0 || input.byteSize > INTAKE_MAX_BYTES) {
    return {
      ok: false,
      error: "Screenshot mag maximaal 4 MB zijn.",
    };
  }
  return { ok: true };
}

export async function storeIntakeAsset(input: {
  mimeType: string;
  data: Buffer;
  uploadedBy: string;
}): Promise<IntakeAssetRecord | null> {
  const check = validateIntakeImage({
    mimeType: input.mimeType,
    byteSize: input.data.byteLength,
  });
  if (!check.ok) throw new Error(check.error);

  const sql = getEventsSql();
  if (!sql) return null;

  const id = randomUUID();
  const storageKey = `aanvoer/${id}`;
  const rows = (await sql`
    INSERT INTO admin_intake_assets (
      id, storage_key, mime_type, byte_size, data, uploaded_by
    )
    VALUES (
      ${id},
      ${storageKey},
      ${input.mimeType},
      ${input.data.byteLength},
      ${input.data},
      ${input.uploadedBy}
    )
    RETURNING id, storage_key, mime_type, byte_size, uploaded_by, created_at
  `) as {
    id: string;
    storage_key: string;
    mime_type: string;
    byte_size: number;
    uploaded_by: string;
    created_at: string;
  }[];

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export async function getIntakeAsset(
  id: string,
): Promise<IntakeAssetWithData | null> {
  const sql = getEventsSql();
  if (!sql) return null;
  const rows = (await sql`
    SELECT id, storage_key, mime_type, byte_size, data, uploaded_by, created_at
    FROM admin_intake_assets
    WHERE id = ${id}
    LIMIT 1
  `) as {
    id: string;
    storage_key: string;
    mime_type: string;
    byte_size: number;
    data: Buffer | Uint8Array | string;
    uploaded_by: string;
    created_at: string;
  }[];
  const row = rows[0];
  if (!row) return null;
  const data = Buffer.isBuffer(row.data)
    ? row.data
    : Buffer.from(row.data as Uint8Array);
  return {
    id: row.id,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    data,
  };
}
