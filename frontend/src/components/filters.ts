import type { AudienceLevel, EventType, VenueType } from '../api/types';

export interface VisitFilters {
  date_from?: string;
  date_to?: string;
  venue_type?: VenueType | '';
  event_type?: EventType | '';
  audience_level?: AudienceLevel | '';
  language?: string | '';
  author_id?: number;
  tags?: string[];
}

/** Build removable pills for the filters currently applied, so a collapsed
 * mobile filter panel still shows (and can clear) what's narrowing the list. */
export function visitFilterChips(
  filters: VisitFilters,
  update: (patch: Partial<VisitFilters>) => void,
  labels: {
    venueType: (v: string) => string;
    eventType: (v: string) => string;
    audienceLevel: (v: string) => string;
    from: string;
    to: string;
  },
): { key: string; label: string; onRemove: () => void }[] {
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.date_from)
    chips.push({
      key: 'date_from',
      label: `${labels.from}: ${filters.date_from}`,
      onRemove: () => update({ date_from: undefined }),
    });
  if (filters.date_to)
    chips.push({
      key: 'date_to',
      label: `${labels.to}: ${filters.date_to}`,
      onRemove: () => update({ date_to: undefined }),
    });
  if (filters.venue_type)
    chips.push({
      key: 'venue_type',
      label: labels.venueType(filters.venue_type),
      onRemove: () => update({ venue_type: '' }),
    });
  if (filters.event_type)
    chips.push({
      key: 'event_type',
      label: labels.eventType(filters.event_type),
      onRemove: () => update({ event_type: '' }),
    });
  if (filters.audience_level)
    chips.push({
      key: 'audience_level',
      label: labels.audienceLevel(filters.audience_level),
      onRemove: () => update({ audience_level: '' }),
    });
  if (filters.language)
    chips.push({
      key: 'language',
      label: filters.language,
      onRemove: () => update({ language: '' }),
    });
  for (const tag of filters.tags ?? [])
    chips.push({
      key: `tag:${tag}`,
      label: tag,
      onRemove: () => update({ tags: (filters.tags ?? []).filter((x) => x !== tag) }),
    });
  return chips;
}

export function filterParams(filters: VisitFilters): Record<string, string | number | undefined> {
  return {
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    venue_type: filters.venue_type || undefined,
    event_type: filters.event_type || undefined,
    audience_level: filters.audience_level || undefined,
    language: filters.language || undefined,
    author_id: filters.author_id,
    tags: filters.tags && filters.tags.length ? filters.tags.join(',') : undefined,
  };
}
