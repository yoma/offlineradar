"use client";

import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AVAILABILITY_LABEL,
  DISTANCES,
  MEET_GENDER_LABEL,
  PRICE_LABEL,
  WHEN_HINT,
  WHEN_LABEL,
} from "@/lib/format";
import type { PreferredMeetGender } from "@/types/event";
import type {
  AvailabilityFilter,
  PriceFilter,
  SearchState,
  WhenFilter,
} from "@/types/search";

const WHEN_OPTIONS: WhenFilter[] = [
  "any",
  "today",
  "tomorrow",
  "weekend",
  "next_week",
  "month",
  "date",
];

export function FilterSheet({
  open,
  onOpenChange,
  state,
  count,
  onChange,
  organizerOptions = [],
  selectedOrganizers = [],
  onOrganizersChange,
  onClearAdvanced,
  footerLabel,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: SearchState;
  count: number;
  onChange: (patch: Partial<SearchState>) => void;
  organizerOptions?: Array<{
    id: string;
    slug: string;
    name: string;
    blurb?: string | null;
  }>;
  selectedOrganizers?: string[];
  onOrganizersChange?: (slugs: string[]) => void;
  onClearAdvanced?: () => void;
  footerLabel?: string;
  /** Homepage: navigate to results. Discover: omit (just close sheet). */
  onApply?: () => void;
}) {
  function clearAdvanced() {
    // Categories live in the main search card; keep them when clearing "extra".
    onChange({
      price: "any",
      singlesOnly: false,
      trips: true,
      availability: "any",
      strictOnly: false,
      preferredMeetGender: "anyone",
      preferredAgeMin: null,
      preferredAgeMax: null,
    });
    onOrganizersChange?.([]);
    onClearAdvanced?.();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-0 overflow-hidden p-0 max-h-[min(92vh,100dvh)] rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)] md:data-[side=bottom]:inset-x-auto md:data-[side=bottom]:bottom-auto md:data-[side=bottom]:top-1/2 md:data-[side=bottom]:left-1/2 md:data-[side=bottom]:right-auto md:data-[side=bottom]:h-auto md:data-[side=bottom]:max-h-[min(85vh,840px)] md:data-[side=bottom]:w-[min(calc(100%-2rem),980px)] md:data-[side=bottom]:-translate-x-1/2 md:data-[side=bottom]:-translate-y-1/2 md:data-[side=bottom]:rounded-2xl md:data-[side=bottom]:border md:data-[side=bottom]:shadow-xl md:data-[side=bottom]:data-open:slide-in-from-bottom-0 md:data-[side=bottom]:data-open:fade-in-0"
      >
        <SheetHeader className="shrink-0 border-b border-[color-mix(in_srgb,var(--border)_70%,var(--brand-bordeaux)_30%)] px-5 py-4 md:px-6">
          <SheetTitle className="font-heading-section text-lg tracking-tight text-[var(--brand-bordeaux)]">
            Meer filters
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Extra verfijning. Categorieën kies je in het zoekblok.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6 md:py-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-x-8 md:gap-y-6">
            <FilterGroup title="Wanneer">
              <p className="mb-2 text-xs text-muted-foreground">
                {WHEN_HINT[state.when] ?? "Kies één periode."}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {WHEN_OPTIONS.map((option) => (
                  <Choice
                    key={option}
                    pressed={state.when === option}
                    onClick={() =>
                      onChange({
                        when: option,
                        date: option === "date" ? state.date : null,
                      })
                    }
                  >
                    {WHEN_LABEL[option]}
                  </Choice>
                ))}
              </div>
              {state.when === "date" ? (
                <Input
                  type="date"
                  className="mt-2.5 h-10 max-w-xs"
                  value={state.date ?? ""}
                  onChange={(event) =>
                    onChange({
                      when: "date",
                      date: event.target.value || null,
                    })
                  }
                />
              ) : null}
            </FilterGroup>

            <FilterGroup title="Afstand">
              <div
                className="inline-flex max-w-full flex-wrap rounded-full border border-border bg-muted/40 p-1"
                role="group"
                aria-label="Afstand"
              >
                {DISTANCES.map((km) => (
                  <button
                    key={km}
                    type="button"
                    aria-pressed={state.maxDistanceKm === km}
                    onClick={() => onChange({ maxDistanceKm: km })}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      state.maxDistanceKm === km
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </FilterGroup>

            {organizerOptions.length > 0 && onOrganizersChange ? (
              <OrganizerPicker
                sheetOpen={open}
                options={organizerOptions}
                selected={selectedOrganizers}
                onChange={onOrganizersChange}
              />
            ) : null}

            <FilterGroup title="Prijs">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PRICE_LABEL) as PriceFilter[])
                  .filter((price) => price !== "any")
                  .map((price) => (
                    <Choice
                      key={price}
                      pressed={state.price === price}
                      onClick={() =>
                        onChange({
                          price: state.price === price ? "any" : price,
                        })
                      }
                    >
                      {PRICE_LABEL[price]}
                    </Choice>
                  ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Beschikbaarheid">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(AVAILABILITY_LABEL) as AvailabilityFilter[])
                  .filter((item) => item !== "any")
                  .map((item) => (
                    <Choice
                      key={item}
                      pressed={state.availability === item}
                      onClick={() =>
                        onChange({
                          availability:
                            state.availability === item ? "any" : item,
                        })
                      }
                    >
                      {AVAILABILITY_LABEL[item]}
                    </Choice>
                  ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Extra opties" className="md:col-span-2">
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                <ToggleRow
                  title="Alleen singles"
                  description="Events die singles-only of duidelijk singlesgericht zijn."
                  checked={state.singlesOnly}
                  onChange={(checked) => onChange({ singlesOnly: checked })}
                />
                <ToggleRow
                  title="Reizen tonen"
                  description="Reizen, weekends en bestemmingen in het buitenland. Die tellen niet mee voor de afstand."
                  checked={state.trips}
                  onChange={(checked) => onChange({ trips: checked })}
                />
                <ToggleRow
                  title="Alleen strikte leeftijdsgrenzen"
                  description="Verbergt events die alleen een richtleeftijd vermelden."
                  checked={state.strictOnly}
                  onChange={(checked) => onChange({ strictOnly: checked })}
                />
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Wie wil je graag ontmoeten?
                  </p>
                  <p className="mb-1.5 text-[11px] text-muted-foreground/80">
                    Voorkeur voor sorteren. Verbergt geen activiteiten.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      Object.keys(MEET_GENDER_LABEL) as PreferredMeetGender[]
                    ).map((key) => (
                      <Choice
                        key={key}
                        pressed={state.preferredMeetGender === key}
                        onClick={() =>
                          onChange({ preferredMeetGender: key })
                        }
                      >
                        {MEET_GENDER_LABEL[key]}
                      </Choice>
                    ))}
                  </div>
                </div>
                <div className="grid max-w-sm grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="pref-min"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Leeftijd vanaf
                    </label>
                    <Input
                      id="pref-min"
                      type="number"
                      min={18}
                      max={99}
                      className="h-9"
                      value={state.preferredAgeMin ?? ""}
                      onChange={(event) =>
                        onChange({
                          preferredAgeMin: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="pref-max"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      tot
                    </label>
                    <Input
                      id="pref-max"
                      type="number"
                      min={18}
                      max={99}
                      className="h-9"
                      value={state.preferredAgeMax ?? ""}
                      onChange={(event) =>
                        onChange({
                          preferredAgeMax: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </FilterGroup>
          </div>
        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t border-border/70 bg-background/95 px-5 py-3 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={clearAdvanced}
            className="shrink-0 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Wis extra filters
          </button>
          <Button
            className="h-11 min-w-0 flex-1 rounded-xl sm:max-w-xs sm:flex-none"
            onClick={() => {
              onOpenChange(false);
              onApply?.();
            }}
          >
            <SlidersHorizontal className="size-4" />
            {footerLabel ??
              `Toon ${count} ${count === 1 ? "activiteit" : "activiteiten"}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function OrganizerPicker({
  sheetOpen,
  options,
  selected,
  onChange,
}: {
  sheetOpen: boolean;
  options: Array<{
    id: string;
    slug: string;
    name: string;
    blurb?: string | null;
  }>;
  selected: string[];
  onChange: (slugs: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!sheetOpen) {
      setExpanded(false);
      setQuery("");
    }
  }, [sheetOpen]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (expanded) {
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [expanded]);

  const selectedRecords = useMemo(
    () =>
      selected
        .map((slug) => options.find((item) => item.slug === slug))
        .filter(
          (
            item,
          ): item is {
            id: string;
            slug: string;
            name: string;
            blurb?: string | null;
          } => Boolean(item),
        ),
    [options, selected],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((item) => {
      if (selected.includes(item.slug)) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.slug.includes(needle) ||
        (item.blurb?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [options, query, selected]);

  const triggerLabel =
    selectedRecords.length === 0
      ? "Alle organisatoren"
      : selectedRecords.length === 1
        ? selectedRecords[0]!.name
        : `${selectedRecords.length} organisatoren`;

  return (
    <FilterGroup title="Organisator">
      <div ref={boxRef} className="relative max-w-sm">
        {selectedRecords.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedRecords.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() =>
                  onChange(selected.filter((slug) => slug !== item.slug))
                }
                className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                aria-label={`${item.name} verwijderen`}
              >
                {item.name}
                <X className="size-3 opacity-80" aria-hidden />
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 text-left text-sm font-medium transition hover:border-foreground/30"
        >
          <span
            className={
              selectedRecords.length > 0
                ? "truncate text-foreground"
                : "truncate text-muted-foreground"
            }
          >
            {triggerLabel}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>

        {expanded ? (
          <div
            id={listId}
            className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-white shadow-lg"
          >
            <label className="relative block border-b border-border">
              <span className="sr-only">Zoek een organisator</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zoeken…"
                className="h-10 w-full bg-transparent pr-3 pl-9 text-base outline-none md:text-sm"
                autoComplete="off"
              />
            </label>
            <ul role="listbox" className="max-h-48 overflow-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">
                  Geen organisator gevonden
                </li>
              ) : (
                filtered.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-black/[0.04]"
                      onClick={() => {
                        onChange(
                          selected.includes(item.slug)
                            ? selected
                            : [...selected, item.slug],
                        );
                        setQuery("");
                        setExpanded(false);
                      }}
                    >
                      <span className="text-sm font-medium">{item.name}</span>
                      {item.blurb ? (
                        <span className="text-xs text-muted-foreground">
                          {item.blurb}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </FilterGroup>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 shrink-0 accent-[var(--primary)]"
      />
    </label>
  );
}

function FilterGroup({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={`min-w-0 space-y-2 ${className}`}>
      <legend className="brand-section-label text-xs font-semibold tracking-[0.06em] uppercase">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Choice({
  pressed,
  children,
  onClick,
}: {
  pressed: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--brand-bordeaux)_55%,var(--brand-gold))] ${
        pressed
          ? "border-primary bg-primary text-primary-foreground"
          : "brand-chip-idle"
      }`}
    >
      {children}
    </button>
  );
}
