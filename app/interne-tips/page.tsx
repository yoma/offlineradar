import { redirect } from "next/navigation";

/**
 * Tips live in Wachtrij now. Keep this route as a redirect for old bookmarks.
 */
export default function InterneTipsRedirectPage() {
  redirect("/interne-goedkeuren#tips");
}
