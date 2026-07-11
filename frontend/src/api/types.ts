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

export const VISIT_STATUSES = ['planned', 'completed'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Today's date as YYYY-MM-DD in the viewer's local zone. */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A planned event whose date has already passed. */
export function isOverdue(v: { status: VisitStatus; visit_date: string }): boolean {
  return v.status === 'planned' && v.visit_date < todayISO();
}

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
  status: VisitStatus;
  visit_date: string;
  start_time: string | null;
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

export const INSTITUTION_TYPES = [
  'school',
  'college',
  'university',
  'museum',
  'library',
  'other',
] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export interface InstitutionPoint {
  id: number;
  name: string;
  institution_type: InstitutionType;
  latitude: number;
  longitude: number;
  city: string | null;
  covered: boolean;
  visit_count: number;
}

export interface InstitutionDetail {
  id: number;
  name: string;
  institution_type: InstitutionType;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website: string | null;
  phone: string | null;
  region: string | null;
}

export interface VenuePoint {
  id: number;
  name: string;
  venue_type: VenueType;
  latitude: number;
  longitude: number;
  city: string | null;
  visit_count: number;
  institution_id: number | null;
}

// Best-effort mapping from a catalog institution to venue-create defaults.
// OSM can't tell elementary/middle/high apart, so we guess K-12 grade from the
// name and leave the rest for the user to confirm in the form.
export function institutionVenueType(inst: {
  institution_type: InstitutionType;
  name: string;
}): VenueType {
  switch (inst.institution_type) {
    case 'college':
      return 'community_college';
    case 'university':
      return 'university';
    case 'museum':
      return 'museum';
    case 'library':
      return 'library';
    case 'school': {
      const n = inst.name.toLowerCase();
      if (/\b(elementary|primary)\b/.test(n)) return 'elementary_school';
      if (/\b(middle|junior|intermediate|jr)\b/.test(n)) return 'middle_school';
      if (/\b(high|senior|secondary)\b/.test(n)) return 'high_school';
      return 'other';
    }
    default:
      return 'other';
  }
}

// Mirror of the backend's MAX_PEOPLE_REACHED sanity ceiling.
export const MAX_PEOPLE_REACHED = 100_000;
// Above this we ask the user to confirm, to catch a stray extra zero.
export const PEOPLE_REACHED_CONFIRM_THRESHOLD = 2_000;
