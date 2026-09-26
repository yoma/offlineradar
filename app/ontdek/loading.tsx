"use client";

import {
  SearchLoadingState,
  SEARCH_LOADING_SUBTITLES,
  SEARCH_LOADING_TITLE,
} from "@/components/discover/search-loading";

/**
 * Shown by Next.js during soft navigation to /ontdek.
 * Hard navigations from home show pending UX on the home CTA itself.
 */
export default function OntdekLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="mt-3 h-4 w-40 animate-pulse rounded bg-muted" />
      <SearchLoadingState active immediate className="mt-10" />
      <p className="sr-only">
        {SEARCH_LOADING_TITLE} {SEARCH_LOADING_SUBTITLES[0]}
      </p>
    </div>
  );
}
