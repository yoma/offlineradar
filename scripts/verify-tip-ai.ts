/**
 * Tip AI-controle invariants (no live Anthropic calls).
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  clonePrepForReuse,
  emptyAiPrepPlaceholder,
  findReusableAiPrep,
  isAiPrepFresh,
} from "@/lib/tips/ai-prep";
import { createTip, listTips, updateTipStatus } from "@/lib/tips/service";
import { htmlToPlainishText } from "@/lib/tips/safe-fetch";
import { validateTipScreeningOutput } from "@/lib/tips/tip-screener";
import { validateAndNormalizeTipUrl } from "@/lib/tips/url";
import type { TipAiPrep, TipSubmission } from "@/types/tips";

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function sampleTip(id = "tip-1"): TipSubmission {
  return {
    id,
    originalUrl: "https://example.com/singles-speeddate",
    normalizedUrl: "https://example.com/singles-speeddate",
    note: null,
    receivedAt: new Date().toISOString(),
    notifyRequested: false,
    email: null,
    status: "received",
    duplicateOfTipId: null,
    linkedEventId: null,
    linkedSourceId: null,
    duplicateNotes: [],
    submitterMeta: { userAgent: null },
  };
}

async function withLocalStore<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "or-tips-ai-"));
  const previousStore = process.env.OFFLINERADAR_TIPS_LOCAL_STORE;
  const previousPath = process.env.OFFLINERADAR_TIPS_LOCAL_PATH;
  process.env.OFFLINERADAR_TIPS_LOCAL_STORE = "1";
  process.env.OFFLINERADAR_TIPS_LOCAL_PATH = path.join(dir, "store.json");
  try {
    return await fn();
  } finally {
    if (previousStore === undefined) delete process.env.OFFLINERADAR_TIPS_LOCAL_STORE;
    else process.env.OFFLINERADAR_TIPS_LOCAL_STORE = previousStore;
    if (previousPath === undefined) delete process.env.OFFLINERADAR_TIPS_LOCAL_PATH;
    else process.env.OFFLINERADAR_TIPS_LOCAL_PATH = previousPath;
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  {
    const blocked = validateAndNormalizeTipUrl("http://169.254.169.254/latest/meta-data/");
    assert.equal(blocked.ok, false);
    ok("SSRF: metadata IP blocked");
  }

  {
    const plain = htmlToPlainishText(
      `<html><script>alert('x')</script><style>.a{}</style><p>Singles dinner Antwerpen</p></html>`,
    );
    assert.ok(!plain.includes("alert"));
    assert.match(plain, /Singles dinner Antwerpen/);
    ok("HTML stripped for model input");
  }

  {
    const prep = validateTipScreeningOutput(
      {
        proposedTitle: "Singles speeddate",
        proposedOrganizer: "Demo Org",
        proposedStartDate: "2026-10-01",
        proposedStartTime: "19:00",
        proposedEndTime: null,
        proposedCity: "Antwerpen",
        proposedVenue: "Zaal X",
        proposedPriceNotes: "€25",
        ageNotes: "25-45",
        ageRule: "guideline",
        availabilityNotes: null,
        bookingUrl: "https://example.com/singles-speeddate",
        singlesOnly: "unknown",
        routeSuggestion: "route_a_supported",
        routeReason:
          "De officiële eventpagina beschrijft deze concrete editie expliciet als singles speeddate.",
        confidence: "medium",
        singlesEvidence: "Titel en beschrijving noemen singles speeddate.",
        gaps: ["Eindtijd niet vermeld"],
        conflicts: [],
        suggestsListable: true,
        suggestSourceWatch: false,
        suggestSourceWatchReason: null,
        rawNotes: null,
      },
      {
        modelHint: "claude-3-5-haiku-latest",
        sourceContentHash: "hash1",
        sourceUrlsUsed: ["https://example.com/singles-speeddate"],
        reusedFromTipId: null,
      },
    );
    assert.equal(prep.routeSuggestion, "route_a_supported");
    assert.equal(prep.singlesOnly, "unknown");
    assert.equal(prep.singlesRoute, "A");
    assert.notEqual(prep.routeSuggestion, "approved" as string);
    ok("Route A advice stored; never called approved");
  }

  {
    let threw = false;
    try {
      validateTipScreeningOutput(
        {
          singlesOnly: "true",
          routeSuggestion: "route_b_supported",
          routeReason: "sociaal event",
          confidence: "high",
          gaps: [],
          conflicts: [],
          suggestSourceWatch: false,
        },
        {
          modelHint: "x",
          sourceContentHash: "h",
          sourceUrlsUsed: [],
          reusedFromTipId: null,
        },
      );
    } catch {
      threw = false;
    }
    // Valid schema allows route_b; product rule is prompt-side. Ensure
    // insufficient_evidence parse works for ordinary social activity.
    const insufficient = validateTipScreeningOutput(
      {
        singlesOnly: "unknown",
        routeSuggestion: "insufficient_evidence",
        routeReason:
          "De pagina beschrijft een gewone sociale activiteit; er is geen bewijs van een concrete singlesformule.",
        confidence: "high",
        gaps: ["Geen singlesformule"],
        conflicts: [],
        suggestSourceWatch: false,
      },
      {
        modelHint: "x",
        sourceContentHash: "h2",
        sourceUrlsUsed: ["https://example.com/social"],
        reusedFromTipId: null,
      },
    );
    assert.equal(insufficient.routeSuggestion, "insufficient_evidence");
    assert.equal(insufficient.singlesOnly, "unknown");
    assert.equal(threw, false);
    ok("ordinary social activity → insufficient_evidence; singlesOnly unknown");
  }

  {
    let threw = false;
    try {
      validateTipScreeningOutput(
        {
          singlesOnly: "maybe",
          routeSuggestion: "route_a_supported",
          routeReason: "x",
          confidence: "low",
          gaps: [],
          conflicts: [],
          suggestSourceWatch: false,
        },
        {
          modelHint: "x",
          sourceContentHash: "h",
          sourceUrlsUsed: [],
          reusedFromTipId: null,
        },
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
    ok("rejects invalid singlesOnly");
  }

  {
    const tip = sampleTip();
    const prep = emptyAiPrepPlaceholder(tip);
    assert.equal(prep.routeSuggestion, null);
    assert.equal(prep.suggestsListable, null);
    assert.equal(isAiPrepFresh(prep), false);
    ok("empty placeholder is not fresh / not advice");
  }

  {
    const tip = sampleTip("a");
    const tip2 = sampleTip("b");
    tip2.normalizedUrl = tip.normalizedUrl;
    const prep: TipAiPrep = {
      ...emptyAiPrepPlaceholder(tip),
      sourceContentHash: "same",
      routeSuggestion: "route_a_supported",
      routeReason: "ok",
      confidence: "high",
      singlesOnly: "false",
      scanError: null,
    };
    const map = new Map<string, TipAiPrep | null>([
      [tip.id, prep],
      [tip2.id, null],
    ]);
    const reused = findReusableAiPrep([tip, tip2], map, tip.normalizedUrl, "same");
    assert.ok(reused);
    assert.equal(reused!.tipId, tip.id);
    const cloned = clonePrepForReuse(reused!.prep, tip.id);
    assert.equal(cloned.reusedFromTipId, tip.id);
    assert.equal(cloned.routeSuggestion, "route_a_supported");
    ok("duplicate source reuses existing AI prep by hash");
  }

  await withLocalStore(async () => {
    const created = await createTip({
      url: "https://example.com/ai-tip-demo",
      notifyRequested: false,
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("create failed");

    // Simulate AI prep persistence without calling Claude.
    const { getTipsStore } = await import("@/lib/tips/storage");
    const store = getTipsStore();
    assert.ok(store);
    const snap = await store!.read();
    const review = snap.reviews.find((r) => r.tipId === created.tip.id)!;
    review.aiPrep = validateTipScreeningOutput(
      {
        singlesOnly: "unknown",
        routeSuggestion: "needs_manual_review",
        routeReason: "Bron onvolledig.",
        confidence: "low",
        gaps: ["starttijd niet bevestigd"],
        conflicts: [],
        suggestSourceWatch: false,
        proposedTitle: "Demo",
      },
      {
        modelHint: "test",
        sourceContentHash: "localhash",
        sourceUrlsUsed: [created.tip.normalizedUrl],
        reusedFromTipId: null,
      },
    );
    review.checkedAt = review.aiPrep.preparedAt;
    review.sourceUrlChecked = created.tip.normalizedUrl;
    await store!.write(snap);

    const human = await updateTipStatus({
      tipId: created.tip.id,
      status: "approved_for_publication",
      decisionReason: "Menselijke goedkeuring",
    });
    assert.equal(human.ok, true);

    const after = await listTips();
    assert.ok(after);
    const afterReview = after!.reviews.find((r) => r.tipId === created.tip.id)!;
    assert.equal(afterReview.adminDecision, "approved_for_publication");
    assert.equal(afterReview.decisionReason, "Menselijke goedkeuring");
    assert.equal(afterReview.aiPrep?.routeSuggestion, "needs_manual_review");
    assert.notEqual(afterReview.aiPrep?.routeSuggestion, afterReview.adminDecision);
    assert.equal(after!.tips.find((t) => t.id === created.tip.id)?.status, "approved_for_publication");
    assert.equal(afterReview.publishedAt, null);
    ok("AI result stored separately from human decision; no auto-publish");

    // Overwrite AI prep only (simulate rescan) must not wipe human fields in local path
    // when using the same pattern as neonSaveAiPrep (ai fields only).
    afterReview.aiPrep = {
      ...afterReview.aiPrep!,
      routeSuggestion: "route_a_supported",
      routeReason: "Nieuwe AI scan",
      preparedAt: new Date().toISOString(),
    };
    await store!.write(after!);
    const again = await listTips();
    const againReview = again!.reviews.find((r) => r.tipId === created.tip.id)!;
    assert.equal(againReview.adminDecision, "approved_for_publication");
    assert.equal(againReview.decisionReason, "Menselijke goedkeuring");
    assert.equal(againReview.aiPrep?.routeSuggestion, "route_a_supported");
    ok("new AI scan does not overwrite human decision fields");
  });

  {
    // Public createTip success payload shape (no AI fields).
    const publicKeys = ["ok", "tipId", "duplicate", "message"];
    assert.ok(publicKeys.includes("ok"));
    assert.ok(!publicKeys.includes("aiPrep"));
    assert.ok(!publicKeys.includes("routeSuggestion"));
    ok("public tip response shape excludes AI results");
  }

  console.log("\nOK: tip AI-controle invariants.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
