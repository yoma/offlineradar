import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Internal tools, APIs and personal pages stay out of search.
      disallow: ["/interne-", "/api/", "/account", "/bewaard", "/inloggen"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
