"use client";

import { useId, useMemo, useState } from "react";
import { placeLabel } from "@/lib/distance";
import {
  locationSuggestions,
  resolveLocationInput,
} from "@/lib/location-options";

/**
 * Departure place: type a Belgian municipality, deelgemeente or postcode.
 * The browser’s own suggestion list (datalist) keeps this usable inside
 * clipped cards and on phones. Text that is not one place reverts on blur.
 */
export function LocationPicker({
  value,
  onChange,
  id,
  className,
  "aria-label": ariaLabel = "Vertrekpunt",
}: {
  value: string;
  onChange: (placeId: string) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(() => placeLabel(value));
  const [shownValue, setShownValue] = useState(value);
  // Place changed from outside (profile, URL, chip): show its label.
  if (shownValue !== value) {
    setShownValue(value);
    setText(placeLabel(value));
  }

  const suggestions = useMemo(() => locationSuggestions(text), [text]);

  function commit(raw: string): string | null {
    const placeId = resolveLocationInput(raw);
    if (placeId && placeId !== value) onChange(placeId);
    return placeId;
  }

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        aria-label={ariaLabel}
        placeholder="Gemeente of postcode"
        list={listId}
        value={text}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setText(event.target.value);
          // A picked suggestion arrives as its full label: take it at once.
          const picked = suggestions.find(
            (option) => option.label === event.target.value,
          );
          if (picked && picked.id !== value) onChange(picked.id);
        }}
        onBlur={() => {
          const placeId = commit(text);
          setText(placeLabel(placeId ?? value));
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const placeId = resolveLocationInput(text);
          // First Enter takes the typed place; the next one submits the form.
          if (placeId && placeId !== value) {
            event.preventDefault();
            commit(text);
          }
        }}
        className={className}
      />
      <datalist id={listId}>
        {suggestions.map((option) => (
          <option key={option.id} value={option.label} />
        ))}
      </datalist>
    </>
  );
}
