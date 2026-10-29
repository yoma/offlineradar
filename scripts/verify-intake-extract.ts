/**
 * Offline checks for the admin intake AI call (no network).
 * Usage: npm run verify:intake-extract
 */
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import {
  createIntakeMessage,
  INTAKE_MAX_TOKENS,
  parseProposal,
  TOOL,
} from "../lib/aanvoer/extract";

const meta = { modelHint: "test", needsSourceVerificationDefault: false };

async function main() {
  // The decisive fields come first, so a long answer cannot cut them off.
  const keys = Object.keys((TOOL.input_schema as { properties: object }).properties);
  for (const key of ["routeAdvice", "routeReason", "singlesOriented", "singlesOnly"]) {
    assert.ok(keys.indexOf(key) < keys.indexOf("title"), `${key} before title`);
  }

  // A cut-off answer keeps what it has instead of failing the whole analysis.
  const partial = parseProposal(
    {
      title: { value: "Love On The Rooftop SKYBAR Antwerp 45+", status: "found" },
      singlesOriented: { value: "true", status: "found", evidence: "singlesavond 45+" },
    },
    meta,
  );
  assert.equal(partial.title.value, "Love On The Rooftop SKYBAR Antwerp 45+");
  assert.equal(partial.singlesOriented.value, "true");
  assert.equal(partial.routeAdvice, "needs_review");
  assert.ok(partial.routeReason.length > 0);

  const full = parseProposal(
    {
      routeAdvice: "route_a",
      routeReason: "Singlesavond",
      sourceKindHint: "website_first",
      singlesOnly: { value: "true", status: "found" },
      singlesOriented: { value: "true", status: "found" },
      title: { value: "X", status: "found" },
    },
    meta,
  );
  assert.equal(full.routeAdvice, "route_a");

  // Cut off at the first size → asked again with more room.
  const sizes: number[] = [];
  const fake = (replies: (() => Anthropic.Message)[]) =>
    ({
      messages: {
        create: async (p: { max_tokens: number }) => {
          sizes.push(p.max_tokens);
          return replies.shift()!();
        },
      },
    }) as unknown as Anthropic;
  const msg = (stop: Anthropic.Message["stop_reason"]) =>
    ({ stop_reason: stop, content: [], usage: null }) as unknown as Anthropic.Message;

  const params = { model: "m", messages: [] };
  let res = await createIntakeMessage(fake([() => msg("max_tokens"), () => msg("tool_use")]), params);
  assert.equal(res.stop_reason, "tool_use");
  assert.deepEqual(sizes, [...INTAKE_MAX_TOKENS]);

  // A temporary API error (overloaded) is retried once.
  sizes.length = 0;
  res = await createIntakeMessage(
    fake([
      () => {
        throw Object.assign(new Error("overloaded"), { status: 529 });
      },
      () => msg("tool_use"),
    ]),
    params,
  );
  assert.equal(res.stop_reason, "tool_use");

  // A real error (bad request) is not retried.
  sizes.length = 0;
  await assert.rejects(
    createIntakeMessage(
      fake([
        () => {
          throw Object.assign(new Error("bad"), { status: 400 });
        },
      ]),
      params,
    ),
  );
  assert.equal(sizes.length, 1);

  console.log("OK: intake extract offline checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
