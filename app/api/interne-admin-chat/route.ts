import { NextResponse } from "next/server";
import { resolveTipsAdminAccess } from "@/lib/tips/admin-auth";
import {
  runAdminChat,
  type AdminChatMessage,
} from "@/lib/admin-chat/agent";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const access = await resolveTipsAdminAccess();
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: "Niet geautoriseerd." },
      { status: 401 },
    );
  }

  let body: { messages?: AdminChatMessage[] };
  try {
    body = (await request.json()) as { messages?: AdminChatMessage[] };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ongeldige JSON." },
      { status: 400 },
    );
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Geen berichten." },
      { status: 400 },
    );
  }
  // Cap history; only user/assistant text.
  const safe = messages
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4000),
    }));

  const result = await runAdminChat({
    messages: safe,
    email: access.email,
  });

  return NextResponse.json(result);
}
