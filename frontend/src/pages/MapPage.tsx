import {
  Button,
  Card,
  Checkbox,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { divIcon } from 'leaflet';
import { useMemo, useReducer, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import {
  INSTITUTION_TYPES,
  institutionVenueType,
  labelize,
  type InstitutionPoint,
  type InstitutionType,
  type Venue,
  type VenuePoint,
} from '../api/types';
import { COLORS, coveredIcon, gapIcon, venueIcon } from '../components/mapIcons';

interface Bounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

// Round bounds so tiny pans don't spam new queries / cache entries.
function roundBounds(b: Bounds): Bounds {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { south: r(b.south), north: r(b.north), west: r(b.west), east: r(b.east) };
}

function BoundsWatcher({ onChange }: { onChange: (b: Bounds) => void }) {
  const emit = (map: L.Map) => {
    const b = map.getBounds();
    onChange({
      south: b.getSouth(),
      north: b.getNorth(),
      west: b.getWest(),
      east: b.getEast(),
    });
  };
  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
    load: () => emit(map),
  });
  // Emit once on first render.
  useMemo(() => setTimeout(() => emit(map), 0), []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Show every institution category by default (including "other"), so nothing is
// silently hidden; the checkboxes + All/None let users narrow it down.
const DEFAULT_TYPES: InstitutionType[] = [...INSTITUTION_TYPES];

// Grid-based, count-thresholded clustering: institutions are only collapsed
// into a summary bubble when MORE THAN CLUSTER_MIN of them fall within the same
// small on-screen cell; otherwise every dot is drawn individually.
const CELL_PX = 46;
const CLUSTER_MIN = 20;

function clusterDivIcon(count: number) {
  return divIcon({
    html: `<div class="dc-cluster">${count.toLocaleString()}</div>`,
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function AdaptiveInstitutions({
  institutions,
  onLog,
}: {
  institutions: InstitutionPoint[];
  onLog: (inst: InstitutionPoint) => void;
}) {
  const map = useMap();
  const [tick, bump] = useReducer((x) => x + 1, 0);
  // Recompute the grid whenever the view changes (pan/zoom shifts pixel positions).
  useMapEvents({ moveend: () => bump(), zoomend: () => bump() });

  const { singles, clusters } = useMemo(() => {
    const cells = new Map<string, InstitutionPoint[]>();
    for (const inst of institutions) {
      const p = map.latLngToContainerPoint([inst.latitude, inst.longitude]);
      const key = `${Math.floor(p.x / CELL_PX)}:${Math.floor(p.y / CELL_PX)}`;
      const arr = cells.get(key);
      if (arr) arr.push(inst);
      else cells.set(key, [inst]);
    }
    const singles: InstitutionPoint[] = [];
    const clusters: { lat: number; lng: number; count: number }[] = [];
    for (const arr of cells.values()) {
      if (arr.length > CLUSTER_MIN) {
        const lat = arr.reduce((s, i) => s + i.latitude, 0) / arr.length;
        const lng = arr.reduce((s, i) => s + i.longitude, 0) / arr.length;
        clusters.push({ lat, lng, count: arr.length });
      } else {
        singles.push(...arr);
      }
    }
    return { singles, clusters };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutions, map, tick]);

  return (
    <>
      {singles.map((inst) => (
        <Marker
          key={`i-${inst.id}`}
          position={[inst.latitude, inst.longitude]}
          icon={inst.covered ? coveredIcon : gapIcon}
        >
          <Popup>
            <strong>{inst.name}</strong>
            <br />
            {labelize(inst.institution_type)}
            {inst.city ? ` · ${inst.city}` : ''}
            <br />
            {inst.covered ? (
              <span>Reached — {inst.visit_count} visit(s)</span>
            ) : (
              <span>No visits yet</span>
            )}
            <br />
            <Button
              size="compact-xs"
              mt={6}
              variant={inst.covered ? 'light' : 'filled'}
              onClick={() => onLog(inst)}
            >
              Log a visit here
            </Button>
          </Popup>
        </Marker>
      ))}
      {clusters.map((c, i) => (
        <Marker
          key={`c-${i}`}
          position={[c.lat, c.lng]}
          icon={clusterDivIcon(c.count)}
          eventHandlers={{
            click: () => map.setView([c.lat, c.lng], Math.min(map.getZoom() + 2, 18)),
          }}
        />
      ))}
    </>
  );
}

export function MapPage() {
  const navigate = useNavigate();
  const scheme = useComputedColorScheme('dark');
  // Flat, monochrome CARTO basemap so the colored markers read clearly.
  const tileUrl =
    scheme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [types, setTypes] = useState<InstitutionType[]>(DEFAULT_TYPES);
  const [statusFilter, setStatusFilter] = useState<'all' | 'gap' | 'covered'>('all');
  const [showVenues, setShowVenues] = useState(true);

  const rounded = bounds ? roundBounds(bounds) : null;
  const typeParam = types.join(',');

  const { data: institutions = [] } = useQuery({
    queryKey: ['map', 'institutions', rounded, typeParam, statusFilter],
    queryFn: () =>
      api.get<InstitutionPoint[]>('/api/map/institutions', {
        ...rounded!,
        types: typeParam,
        status: statusFilter,
      }),
    enabled: !!rounded && types.length > 0,
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['map', 'venues', rounded],
    queryFn: () => api.get<VenuePoint[]>('/api/map/venues', { ...rounded! }),
    enabled: !!rounded && showVenues,
  });

  const gapCount = institutions.filter((i) => !i.covered).length;

  const logVisitHere = async (inst: InstitutionPoint) => {
    try {
      let venue: Venue;
      try {
        venue = await api.post<Venue>('/api/venues', {
          name: inst.name,
          venue_type: institutionVenueType(inst),
          city: inst.city,
          latitude: inst.latitude,
          longitude: inst.longitude,
          institution_id: inst.id,
        });
      } catch (e) {
        // Venue already exists (name+city unique) — find and reuse it.
        if (e instanceof ApiError && e.status === 409) {
          const res = await api.get<{ items: Venue[] }>('/api/venues', { q: inst.name });
          const match = res.items.find((v) => v.name === inst.name) ?? res.items[0];
          if (!match) throw e;
          venue = match;
        } else {
          throw e;
        }
      }
      navigate(`/visits/new?venue=${venue.id}`);
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Could not start a visit',
        message: e instanceof ApiError ? e.message : 'Unexpected error',
      });
    }
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Map</Title>
          <Text c="dimmed" size="sm">
            Spot coverage gaps — {institutions.length.toLocaleString()} institutions in view ·{' '}
            {gapCount.toLocaleString()} not yet reached
          </Text>
        </div>
      </Group>

      <Card withBorder p="md">
        <Group justify="space-between" align="center">
          <Group gap="lg">
            <Checkbox.Group
              value={types}
              onChange={(v) => setTypes(v as InstitutionType[])}
            >
              <Group gap="sm" align="center">
                {INSTITUTION_TYPES.map((t) => (
                  <Checkbox key={t} value={t} label={labelize(t)} />
                ))}
                <Button.Group>
                  <Button
                    size="compact-xs"
                    variant="default"
                    onClick={() => setTypes([...INSTITUTION_TYPES])}
                    disabled={types.length === INSTITUTION_TYPES.length}
                  >
                    All
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="default"
                    onClick={() => setTypes([])}
                    disabled={types.length === 0}
                  >
                    None
                  </Button>
                </Button.Group>
              </Group>
            </Checkbox.Group>
            <SegmentedControl
              size="xs"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as typeof statusFilter)}
              data={[
                { label: 'All', value: 'all' },
                { label: 'Gaps only', value: 'gap' },
                { label: 'Reached', value: 'covered' },
              ]}
            />
            <Checkbox
              label="Show my venues"
              checked={showVenues}
              onChange={(e) => setShowVenues(e.currentTarget.checked)}
            />
          </Group>
          <Group gap="md">
            <LegendDot color={COLORS.gap} label="Gap" />
            <LegendDot color={COLORS.covered} label="Reached" />
            <LegendDot color={COLORS.venue} label="Venue (no visits yet)" />
          </Group>
        </Group>
      </Card>

      <Card withBorder p={0} style={{ overflow: 'hidden' }}>
        <MapContainer
          center={[35.86, -86.36]} // Tennessee
          zoom={7}
          style={{ height: '70vh', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            key={scheme}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={tileUrl}
            subdomains="abcd"
          />
          <BoundsWatcher onChange={setBounds} />

          <AdaptiveInstitutions institutions={institutions} onLog={logVisitHere} />

          {/* Your venues are drawn as individual dots (never clustered into
              summary bubbles) so every engagement is always visible. A venue
              with a completed visit shows green (reached); otherwise blue. */}
          {showVenues &&
            venues.map((v) => (
              <Marker
                key={`v-${v.id}`}
                position={[v.latitude, v.longitude]}
                icon={v.visited || v.visit_count > 0 ? coveredIcon : venueIcon}
              >
                <Popup>
                  <strong>{v.name}</strong>
                  <br />
                  {labelize(v.venue_type)}
                  {v.city ? ` · ${v.city}` : ''}
                  <br />
                  {v.visit_count} visit(s)
                  <br />
                  <Button size="compact-xs" mt={6} variant="light" onClick={() => navigate(`/venues/${v.id}`)}>
                    Open venue
                  </Button>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </Card>
      <Text size="xs" c="dimmed">
        Institution data © OpenStreetMap contributors. Import more regions with{' '}
        <code>scripts/import-institutions.sh</code>.
      </Text>
    </Stack>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          border: '2px solid #fff',
        }}
      />
      <Text size="xs">{label}</Text>
    </Group>
  );
}
