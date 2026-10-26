/**
 * Mail to the admins when the Instagram automation needs a look: a reel
 * that could not be made, a reel that went out as a normal post, or a post
 * that failed. Never throws; a missing mail setup only logs.
 *
 * Recipients: INSTAGRAM_ALERT_EMAIL (comma-separated), else
 * OFFLINERADAR_ADMIN_EMAILS.
 */

import { appPublicBaseUrl } from "@/lib/email/app-brand";
import { sendViaResend } from "@/lib/email/resend";
import { getAdminEmailAllowlist } from "@/lib/tips/admin-auth";

export type InstagramAlertKind = "reel_render_failed" | "reel_fallback" | "publish_failed";

const SUBJECTS: Record<InstagramAlertKind, string> = {
  reel_render_failed: "Instagram: reel kon niet gemaakt worden",
  reel_fallback: "Instagram: gewone post geplaatst in plaats van reel",
  publish_failed: "Instagram: post niet geplaatst",
};

export function instagramAlertRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  const own = (env.INSTAGRAM_ALERT_EMAIL ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return own.length > 0 ? own : [...getAdminEmailAllowlist()];
}

export async function notifyInstagramAdmins(args: {
  kind: InstagramAlertKind;
  postId: string;
  message: string;
}): Promise<void> {
  const recipients = instagramAlertRecipients();
  const tag = `[instagram/notify] ${args.postId} ${args.kind}`;
  if (recipients.length === 0) {
    console.warn(`${tag}: geen ontvanger (INSTAGRAM_ALERT_EMAIL / OFFLINERADAR_ADMIN_EMAILS)`);
    return;
  }
  const text = [
    args.message,
    "",
    `Wachtrij: ${appPublicBaseUrl()}/interne-instagram/wachtrij`,
  ].join("\n");
  for (const to of recipients) {
    const sent = await sendViaResend({
      to,
      subject: SUBJECTS[args.kind],
      text,
      // One mail per post, kind and recipient, even when a run is retried.
      idempotencyKey: `instagram-${args.kind}-${args.postId}-${to}`.slice(0, 256),
    }).catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (!sent.ok) console.warn(`${tag}: mail naar ${to} mislukt: ${sent.error}`);
  }
}
