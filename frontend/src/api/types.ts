export const VENUE_TYPES = [
  'elementary_school',
  'middle_school',
  'high_school',
  'community_college',
  'university',
  'museum',
  'library',
  'community_center',
  'other',
] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const EVENT_TYPES = [
  'classroom_visit',
  'science_fair',
  'public_lecture',
  'lab_tour',
  'career_day',
  'demo_booth',
  'workshop',
  'other',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const HOST_RELATIONSHIPS = [
  'teacher_faculty',
  'administrator',
  'counselor',
  'alumnus',
  'former_student',
  'collaborator',
  'community_partner',
  'family_friend',
  'cold_outreach',
  'other',
] as const;
export type HostRelationship = (typeof HOST_RELATIONSHIPS)[number];

export const AUDIENCE_LEVELS = [
  'elementary',
  'middle_school',
  'high_school',
  'community_college',
  'undergraduate',
  'graduate',
  'general_public',
  'educators',
  'mixed',
] as const;
export type AudienceLevel = (typeof AUDIENCE_LEVELS)[number];

export function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface User {
  id: number;
  email: string;
  name: string;
  affiliation: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface UserBrief {
  id: number;
  name: string;
}

export interface Venue {
  id: number;
  name: string;
  venue_type: VenueType;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  created_by_id: number | null;
  created_at: string;
}

export interface VenueBrief {
  id: number;
  name: string;
  venue_type: VenueType;
  city: string | null;
}

export interface VenueListItem extends Venue {
  visit_count: number;
}

export interface VenueDetail extends Venue {
  visit_count: number;
  last_visit_date: string | null;
}

export interface Visit {
  id: number;
  author: UserBrief;
  venue: VenueBrief;
  visit_date: string;
  event_type: EventType;
  title: string;
  description: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  host_role: string | null;
  host_relationship: HostRelationship | null;
  host_relationship_detail: string | null;
  host_notes: string | null;
  people_reached: number;
  audience_level: AudienceLevel;
  duration_minutes: number | null;
  rating: number | null;
  reflection: string | null;
  follow_up_planned: boolean;
  additional_presenters: string | null;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface StatsSummary {
  total_visits: number;
  total_people_reached: number;
  distinct_venues: number;
  active_researchers: number;
  avg_rating: number | null;
}

export interface TimeseriesPoint {
  period: string;
  visits: number;
  people_reached: number;
}

export interface BreakdownRow {
  key: string;
  visits: number;
  people_reached: number;
}

export interface TopVenueRow {
  venue: VenueBrief;
  visits: number;
  people_reached: number;
}

export interface LeaderboardRow {
  user: UserBrief;
  visits: number;
  people_reached: number;
}

export interface PasswordResetResult {
  user_id: number;
  temporary_password: string;
}

// Mirror of the backend's MAX_PEOPLE_REACHED sanity ceiling.
export const MAX_PEOPLE_REACHED = 100_000;
// Above this we ask the user to confirm, to catch a stray extra zero.
export const PEOPLE_REACHED_CONFIRM_THRESHOLD = 2_000;
