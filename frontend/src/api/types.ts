export const VENUE_TYPES = [
  'elementary_school',
  'middle_school',
  'high_school',
  'community_college',
  'university',
  'museum',
  'library',
  'community_center',
  'youtube_channel',
  'podcast',
  'social_media',
  'blog',
  'other',
] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const EVENT_TYPES = [
  'classroom_visit',
  'science_fair',
  'public_lecture',
  'colloquium',
  'seminar',
  'conference',
  'lab_tour',
  'career_day',
  'demo_booth',
  'workshop',
  'interview',
  'other',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const HOST_RELATIONSHIPS = [
  'teacher_faculty',
  'administrator',
  'counselor',
  'alumnus',
  'former_student',
  'former_teacher',
  'collaborator',
  'community_partner',
  'family_friend',
  'cold_outreach',
  'reached_out',
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

// Central list of allowed Visit.language values — must match
// backend/app/languages.py exactly (same strings, same order).
export const LANGUAGES = [
  'Afrikaans',
  'Albanian',
  'Amharic',
  'Arabic',
  'Armenian',
  'American Sign Language',
  'Azerbaijani',
  'Basque',
  'Belarusian',
  'Bengali',
  'Bosnian',
  'Bulgarian',
  'Burmese',
  'Cantonese',
  'Catalan',
  'Cebuano',
  'Chichewa',
  'Corsican',
  'Croatian',
  'Czech',
  'Danish',
  'Dutch',
  'English',
  'Esperanto',
  'Estonian',
  'Filipino',
  'Finnish',
  'French',
  'Frisian',
  'Galician',
  'Georgian',
  'German',
  'Greek',
  'Gujarati',
  'Haitian Creole',
  'Hausa',
  'Hawaiian',
  'Hebrew',
  'Hindi',
  'Hmong',
  'Hungarian',
  'Icelandic',
  'Igbo',
  'Indonesian',
  'Irish',
  'Italian',
  'Japanese',
  'Javanese',
  'Kannada',
  'Kazakh',
  'Khmer',
  'Kinyarwanda',
  'Korean',
  'Kurdish',
  'Kyrgyz',
  'Lao',
  'Latin',
  'Latvian',
  'Lithuanian',
  'Luxembourgish',
  'Macedonian',
  'Malagasy',
  'Malay',
  'Malayalam',
  'Maltese',
  'Mandarin Chinese',
  'Maori',
  'Marathi',
  'Mongolian',
  'Nepali',
  'Norwegian',
  'Odia',
  'Pashto',
  'Persian (Farsi)',
  'Polish',
  'Portuguese',
  'Punjabi',
  'Romanian',
  'Russian',
  'Samoan',
  'Scots Gaelic',
  'Serbian',
  'Sesotho',
  'Shona',
  'Sindhi',
  'Sinhala',
  'Slovak',
  'Slovenian',
  'Somali',
  'Spanish',
  'Sundanese',
  'Swahili',
  'Swedish',
  'Tagalog',
  'Tajik',
  'Tamil',
  'Tatar',
  'Telugu',
  'Thai',
  'Tigrinya',
  'Tongan',
  'Turkish',
  'Turkmen',
  'Ukrainian',
  'Urdu',
  'Uyghur',
  'Uzbek',
  'Vietnamese',
  'Welsh',
  'Xhosa',
  'Yiddish',
  'Yoruba',
  'Zulu',
  'Chinese (Traditional)',
  'Chinese (Simplified)',
  'Other',
] as const;

export function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface UserRole {
  title: string;
  organization: string | null;
}

export interface User {
  id: number;
  email: string;
  name: string;
  affiliation: string | null;
  position: string | null;
  orcid: string | null;
  is_admin: boolean;
  is_active: boolean;
  languages_spoken: string[];
  roles: UserRole[];
  created_at: string;
}

export interface UserBrief {
  id: number;
  name: string;
}

export interface School {
  id: number;
  venue: VenueBrief;
  created_at: string;
}

export interface AdminUser extends User {
  schools: VenueBrief[];
}

export interface ProfileVisit {
  id: number;
  visit_date: string;
  status: VisitStatus;
  title: string;
  event_type: EventType;
  audience_level: AudienceLevel | null;
  venue_name: string;
  venue_city: string | null;
  people_reached: number;
}

export interface UserProfile {
  id: number;
  name: string;
  affiliation: string | null;
  position: string | null;
  orcid: string | null;
  languages_spoken: string[];
  roles: UserRole[];
  schools: VenueBrief[];
  total_visits: number;
  total_people_reached: number;
  visits: ProfileVisit[];
}

export interface DirectoryUser {
  id: number;
  name: string;
  affiliation: string | null;
  position: string | null;
  orcid: string | null;
  languages_spoken: string[];
  roles: UserRole[];
  schools: VenueBrief[];
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
  url: string | null;
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

/** One address/place autocomplete result from the geocode search — prefills
 * a new venue's address fields, never its name or type. */
export interface PlaceSuggestion {
  label: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
}

/** A standing personal-network contact at a venue — independent of any
 * logged visit (a teacher you know, an alum, a past host you want to track). */
export interface Connection {
  id: number;
  venue_id: number;
  name: string;
  role: string | null;
  relationship_type: HostRelationship | null;
  relationship_detail: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  added_by: UserBrief | null;
  created_at: string;
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
  language: string | null;
  duration_minutes: number | null;
  rating: number | null;
  reflection: string | null;
  follow_up_planned: boolean;
  is_broadcast: boolean;
  additional_presenters: string | null;
  co_presenters: ContributorUser[];
  tags: string[];
  links: CoverageLink[];
  created_at: string;
  updated_at: string;
}

export interface ContributorUser {
  id: number;
  name: string;
  orcid: string | null;
}

/** A visit-list row — either a local visit or an activity pulled from a sibling
 * instance. Federated rows have `source` = the peer label, `id` null, an
 * `external_url` deep-link, and only feed-safe fields populated. */
export interface ActivityListItem {
  source: string;
  id: number | null;
  external_url: string | null;
  visit_date: string;
  start_time: string | null;
  status: VisitStatus | null;
  title: string | null;
  event_type: EventType | null;
  audience_level: AudienceLevel | null;
  language: string | null;
  people_reached: number;
  rating: number | null;
  tags: string[];
  author: UserBrief | null;
  venue: VenueBrief | null;
}

export const COVERAGE_CATEGORIES = ['press', 'social_media', 'video', 'blog', 'other'] as const;
export type CoverageCategory = (typeof COVERAGE_CATEGORIES)[number];
export const COVERAGE_LABELS: Record<string, string> = {
  press: 'Press',
  social_media: 'Social media',
  video: 'Video',
  blog: 'Blog',
  other: 'Other',
};

export interface CoverageLink {
  url: string;
  category: string;
  label: string | null;
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
  total_people_reached_remote: number;
  distinct_venues: number;
  active_communicators: number;
  avg_rating: number | null;
}

export interface TimeseriesPoint {
  period: string;
  visits: number;
  people_reached: number;
  planned_visits: number;
  people_reached_remote: number;
}

export interface BreakdownRow {
  key: string;
  visits: number;
  people_reached: number;
  people_reached_remote: number;
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
  visited: boolean;
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

// Mirror of the backend's MAX_PEOPLE_REACHED sanity ceiling (#41).
export const MAX_PEOPLE_REACHED = 500_000_000;
// Above this we ask the user to confirm, to catch a stray extra zero — set
// above any realistic in-person headcount so large-media reach isn't nagged.
export const PEOPLE_REACHED_CONFIRM_THRESHOLD = 100_000;

// ---- Reports (grant-ready activity exports) ----
export const REPORT_SCOPES = ['mine', 'all'] as const;
export type ReportScope = (typeof REPORT_SCOPES)[number];

export const REPORT_STATUS = ['completed', 'planned', 'all'] as const;
export type ReportStatusFilter = (typeof REPORT_STATUS)[number];

export interface ReportSummary {
  total_activities: number;
  total_people_reached: number;
  total_people_reached_remote: number;
  distinct_venues: number;
  active_communicators: number;
  avg_people_per_activity: number;
  first_activity: string | null;
  last_activity: string | null;
  activities_with_coverage: number;
  coverage_counts: Record<string, number>;
}

export interface ReportBreakdownRow {
  key: string;
  label: string;
  visits: number;
  people_reached: number;
}

export interface ReportTimelineRow {
  period: string;
  visits: number;
  people_reached: number;
}

export interface ReportTopVenueRow {
  venue: string;
  city: string;
  visits: number;
  people_reached: number;
}

export interface ReportLeaderboardRow {
  name: string;
  visits: number;
  people_reached: number;
}

export interface ReportAnalysis {
  by_venue_type: ReportBreakdownRow[];
  by_event_type: ReportBreakdownRow[];
  by_audience_level: ReportBreakdownRow[];
  by_host_relationship: ReportBreakdownRow[];
  timeline: ReportTimelineRow[];
  top_venues: ReportTopVenueRow[];
  leaderboard: ReportLeaderboardRow[];
}

export interface ReportMapPoint {
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  visits: number;
  people_reached: number;
}

export interface ReportRow {
  date: string;
  title: string;
  event_type: string;
  event_type_raw: string;
  venue: string;
  city: string;
  state: string;
  location: string;
  audience: string;
  audience_raw: string;
  people_reached: number;
  duration_minutes: number | null;
  presenter: string;
  additional_presenters: string;
  host: string;
  host_role: string;
  tags: string;
  coverage: string;
  coverage_categories: string[];
  coverage_links: string;
  status: string;
  status_raw: string;
}

export interface ActivityReport {
  title: string;
  scope: ReportScope;
  generated_at: string;
  date_from: string | null;
  date_to: string | null;
  summary: ReportSummary;
  analysis: ReportAnalysis;
  map: { points: ReportMapPoint[] };
  rows: ReportRow[];
}

// Public auth config (login/register pages) — whether sign-up is open and
// where to request an access code / password reset.
export interface AuthConfig {
  registration_enabled: boolean;
  contact_email: string | null;
  site_name: string | null;
  public_page: boolean;
  login_message: string | null;
  map_center_lat: number;
  map_center_lon: number;
  map_radius_km: number;
  banner_message: string | null;
  banner_level: string;
  user_directory_visible: boolean;
  has_siblings: boolean;
  /** Cloudflare Web Analytics beacon token, or null when not configured. */
  cf_analytics_token: string | null;
}

export interface LoginHistoryEntry {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  event_type: 'login' | 'register';
  created_at: string;
}

export interface LoginHistoryDay {
  date: string;
  logins: number;
  registrations: number;
  active_users: number;
}

export interface LoginHistory {
  total: number;
  recent: LoginHistoryEntry[];
  daily: LoginHistoryDay[];
}

export const FEDERATION_INTERVALS = ['hour', 'day', 'week'] as const;
export type FederationInterval = (typeof FEDERATION_INTERVALS)[number];

export interface FederationPeer {
  id: number;
  label: string | null;
  feed_url: string; // token masked
  interval: FederationInterval;
  enabled: boolean;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
  activity_count: number;
  next_sync_at: string | null;
  consecutive_failures: number;
  tag_filter: string[];
  created_at: string;
}

/** Result of the admin "Test feed URL" preview before adding a peer. */
export interface FederationPeerPreview {
  ok: boolean;
  instance_name: string | null;
  instance_url: string | null;
  activity_count: number;
  error: string | null;
}

export interface FederatedMapPoint {
  latitude: number;
  longitude: number;
  venue_name: string | null;
  venue_type: string | null;
  person_name: string | null;
  visit_date: string;
  people_reached: number;
  permalink: string | null;
  source_label: string | null;
}

export interface PublicActivity {
  visit_date: string;
  title: string;
  event_type: EventType;
  venue_name: string;
  venue_city: string | null;
  people_reached: number;
}

export interface PublicImpact {
  site_name: string | null;
  has_siblings: boolean;
  total_visits: number;
  total_people_reached: number;
  total_people_reached_remote: number;
  distinct_venues: number;
  active_communicators: number;
  timeseries: TimeseriesPoint[];
  by_venue_type: BreakdownRow[];
  recent: PublicActivity[];
}

export interface RegistrationSettings {
  invite_code: string;
  contact_email: string;
  site_url: string;
  site_name: string;
  public_page: boolean;
  login_message: string;
  map_center_lat: number;
  map_center_lon: number;
  map_radius_km: number;
  banner_message: string;
  banner_level: string;
  user_directory_visible: boolean;
  federation_publish: boolean;
  federation_publish_planned: boolean;
  federation_feed_url: string;
  /** Raw Cloudflare Web Analytics snippet the admin pasted (round-trips). */
  cf_analytics_snippet: string;
}

export interface DbImportResult {
  users_created: number;
  institutions_created: number;
  venues_created: number;
  visits_created: number;
  visits_skipped: number;
}

export interface AdminInstitution {
  id: number;
  name: string;
  institution_type: InstitutionType;
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  region: string | null;
  source: string;
}

export interface BackupFile {
  path: string;
  tier: string;
  size_bytes: number;
  modified_at: string;
}

export interface BackupListResponse {
  items: BackupFile[];
  count: number;
  total_size_bytes: number;
  last_backup_at: string | null;
}

export interface RestoreStatus {
  state: 'idle' | 'queued' | 'running' | 'success' | 'failed';
  detail: string | null;
  backup: string | null;
  at: string | null;
}

// --- CSV event import (own-profile bulk import wizard) ---

export interface ImportDraftRow {
  index: number;
  raw: Record<string, string>;
  title: string | null;
  visit_date: string | null;
  date_raw: string | null;
  event_type: string | null;
  audience_level: string | null;
  people_reached: number | null;
  venue_name: string | null;
  venue_city: string | null;
  description: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  language: string | null;
  presenters: string | null;
  url: string | null;
  warnings: string[];
}

export interface ImportParseResponse {
  format: 'symplectic' | 'generic';
  columns: string[];
  mappable_fields: string[];
  suggested_mapping: Record<string, string>;
  rows: ImportDraftRow[];
}
