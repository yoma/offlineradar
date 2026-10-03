/**
 * Second-pass screenshot read: OCR-style text + URLs only.
 * Used when Pass-1 classifies too aggressively (e.g. Facebook "Internetprovider")
 * and drops the visible page name / website.
 */
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/screening/ai/anthropic-screener";
import type { IntakeProposal } from "@/lib/aanvoer/types";
import { enrichProposalWithScreenshotLeads } from "@/lib/aanvoer/screenshot-leads";

const OCR_TOOL: Anthropic.Tool = {
  name: "report_screenshot_text",
  description:
    "Alleen zichtbare tekst en URL’s uit een screenshot. Geen classificatie.",
  input_schema: {
    type: "object",
    properties: {
      pageName: {
        type: ["string", "null"],
        description: "Grote paginanaam/titel bovenaan (bv. Timeleft).",
      },
      facebookCategory: {
        type: ["string", "null"],
        description: "Grijze Facebook-categorie onder de naam, indien zichtbaar.",
      },
      visibleUrls: {
        type: "array",
        items: { type: "string" },
        description:
          "Elke website/domein zichtbaar, met of zonder https (bv. timeleft.com, app.timeleft.com).",
      },
      visibleText: {
        type: "string",
        description:
          "Alle leesbare woorden op het scherm, gescheiden door spaties/newlines. Inclusief knoppen en banners.",
      },
    },
    required: ["pageName", "visibleUrls", "visibleText"],
    additionalProperties: false,
  },
};

export type ScreenshotOcrResult = {
  pageName: string | null;
  facebookCategory: string | null;
  visibleUrls: string[];
  visibleText: string;
};

function asNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseOcr(input: unknown): ScreenshotOcrResult {
  if (typeof input !== "object" || input === null) {
    return {
      pageName: null,
      facebookCategory: null,
      visibleUrls: [],
      visibleText: "",
    };
  }
  const o = input as Record<string, unknown>;
  const urls = Array.isArray(o.visibleUrls)
    ? o.visibleUrls
        .filter((u): u is string => typeof u === "string" && Boolean(u.trim()))
        .map((u) => u.trim())
    : [];
  return {
    pageName: asNullableString(o.pageName),
    facebookCategory: asNullableString(o.facebookCategory),
    visibleUrls: [...new Set(urls)],
    visibleText: asNullableString(o.visibleText) ?? "",
  };
}

export function screenshotNeedsVisibleTextRescue(
  proposal: IntakeProposal,
): boolean {
  const hasSite = Boolean(
    proposal.sourceUrl.value?.trim() ||
      proposal.organizerUrl.value?.trim() ||
      (proposal.visibleUrls?.length ?? 0) > 0,
  );
  const hasName = Boolean(
    proposal.title.value?.trim() || proposal.organizer.value?.trim(),
  );
  const badCategory = /internetprovider|provider-app/i.test(
    `${proposal.category.value ?? ""} ${proposal.routeReason}`,
  );
  return (
    proposal.aiFailed ||
    !hasSite ||
    !hasName ||
    proposal.routeAdvice === "not_suitable" ||
    badCategory
  );
}

/**
 * Pure merge helper (testable without Anthropic).
 */
export function applyScreenshotOcrToProposal(
  proposal: IntakeProposal,
  ocr: ScreenshotOcrResult,
): IntakeProposal {
  const blob = [ocr.pageName, ocr.facebookCategory, ocr.visibleText, ...ocr.visibleUrls]
    .filter(Boolean)
    .join("\n");
  if (!blob.trim()) return proposal;

  const next: IntakeProposal = {
    ...proposal,
    visibleUrls: [
      ...new Set([...(proposal.visibleUrls ?? []), ...ocr.visibleUrls]),
    ],
  };

  if (!next.organizer.value?.trim() && ocr.pageName) {
    next.organizer = {
      value: ocr.pageName,
      status: "found",
      evidence: "Paginanaam zichtbaar in screenshot (OCR-pass)",
    };
  }
  if (!next.title.value?.trim() && ocr.pageName) {
    next.title = {
      value: ocr.pageName,
      status: "uncertain",
      evidence:
        "Paginanaam uit screenshot; concrete editie nog via website te bevestigen",
    };
  }
  if (
    (!next.category.value?.trim() ||
      /internetprovider/i.test(next.category.value)) &&
    ocr.facebookCategory
  ) {
    next.category = {
      value: ocr.facebookCategory,
      status: "found",
      evidence: "Facebook-categorie (vaak onbetrouwbaar)",
    };
  }

  const prevNotes = next.notes.value?.trim() ?? "";
  const stamp = `OCR-zichtbaar: ${blob.slice(0, 500)}`;
  if (!prevNotes.includes("OCR-zichtbaar:")) {
    next.notes = {
      value: [prevNotes, stamp].filter(Boolean).join("\n"),
      status: "found",
      evidence: next.notes.evidence ?? "Screenshot OCR-pass",
    };
  }

  // OCR recovered real page text → intake is usable again.
  if (ocr.pageName || ocr.visibleUrls.length > 0) {
    next.aiFailed = false;
    if (next.aiError?.includes("AI mislukt") || next.aiError?.includes("API-key")) {
      next.aiError = null;
    }
  }

  return enrichProposalWithScreenshotLeads(next, ocr.visibleUrls);
}

export async function readScreenshotVisibleText(input: {
  image: { mimeType: string; base64: string };
  apiKey?: string;
  model?: string;
}): Promise<ScreenshotOcrResult | null> {
  const apiKey = input.apiKey ?? process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const model =
    input.model ??
    process.env.ANTHROPIC_MODEL?.trim() ??
    DEFAULT_ANTHROPIC_MODEL;

  const mediaType =
    input.image.mimeType === "image/png" ||
    input.image.mimeType === "image/jpeg" ||
    input.image.mimeType === "image/webp" ||
    input.image.mimeType === "image/gif"
      ? input.image.mimeType
      : "image/jpeg";

  const client = new Anthropic({ apiKey });
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 900,
      system: [
        "Je leest screenshots letterlijk uit voor DateOfflineHub.",
        "Geen classificatie, geen route-advies, geen aannames.",
        "Noteer de paginanaam, elke zichtbare URL/domein, en alle leesbare tekst.",
        "Facebook-categorieën (bv. Internetprovider) zijn metadata, niet de paginanaam.",
        "Rapporteer uitsluitend via de tool report_screenshot_text.",
      ].join("\n"),
      tools: [OCR_TOOL],
      tool_choice: { type: "tool", name: OCR_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: input.image.base64,
              },
            },
            {
              type: "text",
              text: "Lees alle zichtbare tekst en URL’s op deze screenshot.",
            },
          ],
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return null;
    return parseOcr(toolUse.input);
  } catch {
    return null;
  }
}
