"use client";

import { useMemo, useState } from "react";
import { ActionSubmitButton } from "@/components/ui/action-submit-button";
import {
  updateFeedbackCategoryAction,
  updateFeedbackNoteAction,
  updateFeedbackStatusAction,
} from "@/app/interne-feedback/actions";
import type { BetaFeedbackRecord } from "@/lib/feedback/labels";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABEL,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@/lib/feedback/labels";

function preview(text: string, max = 120): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("nl-BE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function FeedbackAdminClient({
  items,
  counts,
}: {
  items: BetaFeedbackRecord[];
  counts: { new: number; reviewing: number; done: number; open: number };
}) {
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">(
    "all",
  );
  const [categoryFilter, setCategoryFilter] = useState<
    FeedbackCategory | "all"
  >("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [items, statusFilter, categoryFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-full border border-border px-3 py-1">
          Nieuw {counts.new}
        </span>
        <span className="rounded-full border border-border px-3 py-1">
          Open {counts.open}
        </span>
        <span className="rounded-full border border-border px-3 py-1">
          Afgehandeld {counts.done}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", ...FEEDBACK_STATUSES] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              statusFilter === key
                ? "border-foreground bg-secondary"
                : "border-border text-muted-foreground"
            }`}
          >
            {key === "all" ? "Alle statussen" : FEEDBACK_STATUS_LABEL[key]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", ...FEEDBACK_CATEGORIES] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategoryFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              categoryFilter === key
                ? "border-foreground bg-secondary"
                : "border-border text-muted-foreground"
            }`}
          >
            {key === "all" ? "Alle types" : FEEDBACK_CATEGORY_LABEL[key]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen feedback in deze filter.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((item) => {
            const open = openId === item.id;
            const page =
              item.pathname != null
                ? `${item.pathname}${item.queryString ? `?${item.queryString}` : ""}`
                : null;
            return (
              <li
                key={item.id}
                className="min-w-0 rounded-xl border border-border bg-background px-4 py-4"
              >
                <button
                  type="button"
                  className="w-full min-w-0 text-left"
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatWhen(item.createdAt)}</span>
                    <span>·</span>
                    <span>{FEEDBACK_CATEGORY_LABEL[item.category]}</span>
                    <span>·</span>
                    <span>{FEEDBACK_STATUS_LABEL[item.status]}</span>
                    {item.appUserId ? (
                      <>
                        <span>·</span>
                        <span>Ingelogde tester</span>
                      </>
                    ) : (
                      <>
                        <span>·</span>
                        <span>Anonymous</span>
                      </>
                    )}
                  </div>
                  <p className="mt-2 break-words text-sm font-medium">
                    {preview(item.message)}
                  </p>
                  {item.contactEmail ? (
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {item.contactEmail}
                    </p>
                  ) : null}
                  {page ? (
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {page}
                    </p>
                  ) : null}
                </button>

                {open ? (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Bericht
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                        {item.message}
                      </p>
                    </div>

                    <form
                      action={updateFeedbackStatusAction}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="id" value={item.id} />
                      <label className="text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <select
                          name="status"
                          defaultValue={item.status}
                          className="mt-1 block h-10 rounded-md border border-border bg-white px-2"
                        >
                          {FEEDBACK_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {FEEDBACK_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <ActionSubmitButton
                        pendingLabel="Bezig…"
                        className="h-10 rounded-md bg-foreground px-3 text-sm text-background"
                      >
                        Status opslaan
                      </ActionSubmitButton>
                    </form>

                    <form
                      action={updateFeedbackCategoryAction}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="id" value={item.id} />
                      <label className="text-sm">
                        <span className="text-muted-foreground">Categorie</span>
                        <select
                          name="category"
                          defaultValue={item.category}
                          className="mt-1 block h-10 max-w-full rounded-md border border-border bg-white px-2"
                        >
                          {FEEDBACK_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {FEEDBACK_CATEGORY_LABEL[category]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <ActionSubmitButton
                        pendingLabel="Bezig…"
                        className="h-10 rounded-md border border-border px-3 text-sm"
                      >
                        Categorie opslaan
                      </ActionSubmitButton>
                    </form>

                    <form
                      action={updateFeedbackNoteAction}
                      className="space-y-2"
                    >
                      <input type="hidden" name="id" value={item.id} />
                      <label className="block text-sm">
                        <span className="text-muted-foreground">
                          Interne notitie
                        </span>
                        <textarea
                          name="adminNote"
                          rows={2}
                          defaultValue={item.adminNote ?? ""}
                          maxLength={1000}
                          className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                        />
                      </label>
                      <ActionSubmitButton
                        pendingLabel="Bezig…"
                        className="rounded-md border border-border px-3 py-2 text-sm"
                      >
                        Notitie opslaan
                      </ActionSubmitButton>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
