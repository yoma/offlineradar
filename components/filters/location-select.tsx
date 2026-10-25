"use client";

import {
  ensureSelectedLocation,
  formatLocationOptionLabel,
  type LocationOption,
} from "@/lib/location-options";

export function LocationSelect({
  value,
  options,
  onChange,
  id,
  className,
  "aria-label": ariaLabel = "Locatie",
}: {
  value: string;
  options: LocationOption[];
  onChange: (placeId: string) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const resolved = ensureSelectedLocation(options, value);
  const selected = resolved.find((option) => option.id === value);
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      title={selected ? formatLocationOptionLabel(selected) : ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {resolved.map((option) => (
        <option key={option.id} value={option.id}>
          {formatLocationOptionLabel(option)}
        </option>
      ))}
    </select>
  );
}
