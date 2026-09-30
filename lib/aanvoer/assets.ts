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

/** Detect PNG/JPEG/WEBP (and reject HEIC) from magic bytes when browser mime is empty. */
export function sniffIntakeImageMime(
  data: Buffer | Uint8Array,
): (typeof INTAKE_ALLOWED_MIME)[number] | null {
  const bytes = data instanceof Buffer ? data : Buffer.from(data);
  if (bytes.length < 12) return null;

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function looksLikeHeic(data: Buffer | Uint8Array): boolean {
  const bytes = data instanceof Buffer ? data : Buffer.from(data);
  if (bytes.length < 12) return false;
  // ISO BMFF: ....ftyp....
  const brand = bytes.subarray(4, 8).toString("ascii");
  if (brand !== "ftyp") return false;
  const major = bytes.subarray(8, 12).toString("ascii").toLowerCase();
  return (
    major.startsWith("heic") ||
    major.startsWith("heif") ||
    major.startsWith("mif1") ||
    major.startsWith("msf1")
  );
}

export function resolveIntakeImageMime(input: {
  declaredMime: string;
  data: Buffer | Uint8Array;
}):
  | { ok: true; mimeType: (typeof INTAKE_ALLOWED_MIME)[number] }
  | { ok: false; error: string } {
  const declared = (input.declaredMime || "").toLowerCase().trim();
  if (declared === "image/heic" || declared === "image/heif") {
    return {
      ok: false,
      error:
        "HEIC/HEIF wordt niet ondersteund. Exporteer als PNG of JPG (op iPhone: Instellingen → Camera → Formaten → Meest compatibel).",
    };
  }
  if (looksLikeHeic(input.data)) {
    return {
      ok: false,
      error:
        "Dit lijkt een HEIC-bestand. Sla op als PNG of JPG en probeer opnieuw.",
    };
  }

  if (isAllowedMime(declared)) {
    return { ok: true, mimeType: declared };
  }

  const sniffed = sniffIntakeImageMime(input.data);
  if (sniffed) {
    return { ok: true, mimeType: sniffed };
  }

  return {
    ok: false,
    error: "Alleen PNG, JPG/JPEG of WEBP zijn toegestaan.",
  };
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
