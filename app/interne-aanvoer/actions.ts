"use server";

import { revalidatePath } from "next/cache";
import { signIn, signOut } from "@/auth";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import { storeIntakeAsset, validateIntakeImage } from "@/lib/aanvoer/assets";
import { findIntakeMatches } from "@/lib/aanvoer/dedupe";
import { runAdminIntakeExtract } from "@/lib/aanvoer/extract";
import {
  saveIntakeAsEventCandidate,
  saveIntakeAsSource,
} from "@/lib/aanvoer/save";
import { htmlToPlainishText, safeFetchTipSource } from "@/lib/tips/safe-fetch";
import {
  proposalToDraft,
  type IntakeEditableDraft,
  type IntakeMatch,
  type IntakeMode,
  type IntakeProposal,
} from "@/lib/aanvoer/types";

export async function startAanvoerAdminSignIn() {
  await signIn("google", { redirectTo: "/interne-aanvoer" });
}

export async function signOutAanvoerAdmin() {
  await signOut({ redirectTo: "/interne-aanvoer" });
}

async function requireAdmin() {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return { ok: false as const, error: "Geen beheerrechten.", email: null };
  }
  return { ok: true as const, email: access.email };
}

export type AnalyzeIntakeResult =
  | {
      ok: true;
      proposal: IntakeProposal;
      draft: IntakeEditableDraft;
      matches: IntakeMatch[];
      assetId: string | null;
    }
  | { ok: false; error: string };

export async function analyzeIntakeAction(
  formData: FormData,
): Promise<AnalyzeIntakeResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const mode = String(formData.get("mode") ?? "").trim() as IntakeMode;
  if (mode !== "url" && mode !== "text" && mode !== "screenshot") {
    return { ok: false, error: "Ongeldige intake-modus." };
  }

  const url = String(formData.get("url") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const file = formData.get("screenshot");

  let assetId: string | null = null;
  let image: { mimeType: string; base64: string } | null = null;
  let sourceText = text;

  if (mode === "url") {
    if (!url) return { ok: false, error: "Plak eerst een URL." };
    const fetched = await safeFetchTipSource(url);
    if (fetched.ok) {
      sourceText = [
        text,
        htmlToPlainishText(fetched.text),
      ]
        .filter(Boolean)
        .join("\n\n");
    } else {
      sourceText = [
        text,
        `Kon pagina niet ophalen (${fetched.error}). Analyseer op basis van URL/metadata.`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  if (mode === "text" && !text) {
    return { ok: false, error: "Plak eerst tekst uit een advertentie of post." };
  }

  if (mode === "screenshot") {
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Kies een screenshot (PNG/JPG/WEBP)." };
    }
    const mimeType = file.type || "application/octet-stream";
    const check = validateIntakeImage({
      mimeType,
      byteSize: file.size,
    });
    if (!check.ok) return { ok: false, error: check.error };

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeIntakeAsset({
      mimeType,
      data: buffer,
      uploadedBy: gate.email!,
    });
    if (!stored) {
      return {
        ok: false,
        error:
          "Screenshot-opslag niet beschikbaar. Controleer of de migration is toegepast.",
      };
    }
    assetId = stored.id;
    image = {
      mimeType,
      base64: buffer.toString("base64"),
    };
  }

  const proposal = await runAdminIntakeExtract({
    mode,
    url: url || null,
    text: sourceText || null,
    image,
  });

  if (mode === "screenshot") {
    proposal.needsSourceVerification = true;
  }

  const draft = proposalToDraft(proposal);
  if (url && !draft.sourceUrl) draft.sourceUrl = url;

  const matches = await findIntakeMatches(draft);

  return {
    ok: true,
    proposal,
    draft,
    matches,
    assetId,
  };
}

export type SaveIntakeResult =
  | { ok: true; message: string; sourceId?: string; editionId?: string }
  | { ok: false; error: string; matches?: IntakeMatch[] };

function parseDraft(raw: string): IntakeEditableDraft | null {
  try {
    const parsed = JSON.parse(raw) as IntakeEditableDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveIntakeSourceAction(
  formData: FormData,
): Promise<SaveIntakeResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const draft = parseDraft(String(formData.get("draft") ?? ""));
  if (!draft) return { ok: false, error: "Ongeldige draft." };
  const assetId = String(formData.get("assetId") ?? "").trim() || null;
  const force = String(formData.get("force") ?? "") === "1";

  const matches = await findIntakeMatches(draft);
  if (!force && matches.some((m) => m.kind === "catalog_source")) {
    return {
      ok: false,
      error: "Mogelijke bestaande bron gevonden. Bevestig om toch op te slaan.",
      matches,
    };
  }

  const result = await saveIntakeAsSource({ draft, assetId, force });
  if (!result.ok) return result;
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  return {
    ok: true,
    message: result.message,
    sourceId: result.sourceId,
  };
}

export async function saveIntakeEventAction(
  formData: FormData,
): Promise<SaveIntakeResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const draft = parseDraft(String(formData.get("draft") ?? ""));
  if (!draft) return { ok: false, error: "Ongeldige draft." };
  const assetId = String(formData.get("assetId") ?? "").trim() || null;
  const force = String(formData.get("force") ?? "") === "1";

  const matches = await findIntakeMatches(draft);
  if (!force && matches.some((m) => m.kind === "event_edition")) {
    return {
      ok: false,
      error:
        "Mogelijke bestaande match. Kies expliciet opnieuw om toch een kandidaat te maken.",
      matches,
    };
  }

  const result = await saveIntakeAsEventCandidate({ draft, assetId });
  if (!result.ok) return result;
  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  return {
    ok: true,
    message: result.message,
    editionId: result.editionId,
  };
}

export async function saveIntakeCombinedAction(
  formData: FormData,
): Promise<SaveIntakeResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const draft = parseDraft(String(formData.get("draft") ?? ""));
  if (!draft) return { ok: false, error: "Ongeldige draft." };
  const assetId = String(formData.get("assetId") ?? "").trim() || null;
  const force = String(formData.get("force") ?? "") === "1";

  const matches = await findIntakeMatches(draft);
  if (
    !force &&
    matches.some((m) => m.kind === "catalog_source" || m.kind === "event_edition")
  ) {
    return {
      ok: false,
      error: "Mogelijke bestaande match. Bevestig om toch bron + event te bewaren.",
      matches,
    };
  }

  const source = await saveIntakeAsSource({ draft, assetId, force: true });
  if (!source.ok) return source;
  const event = await saveIntakeAsEventCandidate({ draft, assetId });
  if (!event.ok) {
    return {
      ok: false,
      error: `Bron bewaard, maar event mislukt: ${event.error}`,
      matches,
    };
  }

  revalidatePath("/interne-aanvoer");
  revalidatePath("/interne-events");
  return {
    ok: true,
    message: `${source.message} ${event.message}`,
    sourceId: source.sourceId,
    editionId: event.editionId,
  };
}
