/**
 * Old path of the hourly publish run, kept so a workflow file from before
 * the rename keeps working. Same handler as /api/instagram/publish.
 */
export { POST } from "@/app/api/instagram/publish/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
