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
