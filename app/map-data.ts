import type {ArenaPlayer} from './game-rules';

export type NearbyPlayer = ArenaPlayer & {lat: number; lng: number; distance: number};
type Polygon = {type: 'Polygon'; coordinates: number[][][]};
type MultiPolygon = {type: 'MultiPolygon'; coordinates: number[][][][]};
export type Zone = {
  id: string; user_id: string; barangay_key: string; barangay: string; locality: string;
  boundary: Polygon | MultiPolygon; centroid_lat: number; centroid_lng: number;
  defense_points: number | null; online: boolean; is_owner: boolean;
  display_name: string; username: string; avatar_url: string; cbr: number | null; country_code: string;
};
type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numeric = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function mapCoordinates(lat: unknown, lng: unknown): {lat: number; lng: number} | null {
  const latitude = numeric(lat), longitude = numeric(lng);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {lat: latitude, lng: longitude};
}

function validRing(value: unknown): value is number[][] {
  if (!Array.isArray(value) || value.length < 4) return false;
  if (!value.every(point => Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number' && mapCoordinates(point[1], point[0]))) return false;
  const first = value[0], last = value[value.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}
function validPolygon(value: unknown): value is number[][][] {
  return Array.isArray(value) && value.length > 0 && value.every(validRing);
}
export function validBoundary(value: unknown): value is Polygon | MultiPolygon {
  return record(value) && (value.type === 'Polygon' ? validPolygon(value.coordinates) :
    value.type === 'MultiPolygon' && Array.isArray(value.coordinates) && value.coordinates.length > 0 && value.coordinates.every(validPolygon));
}

// Legacy cb_territories rows contain only a center, not GeoJSON. Build the
// display square locally without rewriting or claiming any database record.
export function kingdomBoundary(lat: number, lng: number): Polygon {
  const halfSide = Math.sqrt(2_000_000) / 2;
  const dLat = halfSide / 111_320;
  const dLng = halfSide / (111_320 * Math.max(0.01, Math.cos(lat * Math.PI / 180)));
  const south = Math.max(-90, lat - dLat), north = Math.min(90, lat + dLat);
  const west = Math.max(-180, lng - dLng), east = Math.min(180, lng + dLng);
  return {type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]]};
}

export function normalizeNearby(value: unknown): {players: NearbyPlayer[]; territories: Zone[]; territoriesComplete: boolean} {
  if (!record(value)) throw new Error('The nearby service returned an invalid response. Please try again.');
  const players: NearbyPlayer[] = [], territories: Zone[] = [];
  for (const row of Array.isArray(value.players) ? value.players : []) {
    if (!record(row) || !text(row.user_id)) continue;
    const location = mapCoordinates(row.lat, row.lng);
    if (!location) continue;
    players.push({
      user_id: text(row.user_id), username: text(row.username), display_name: text(row.display_name, 'Player'),
      avatar_url: text(row.avatar_url), country_code: text(row.country_code), cbr: numeric(row.cbr) ?? 0,
      gold_points: numeric(row.gold_points) ?? 0, wins: numeric(row.wins) ?? 0, losses: numeric(row.losses) ?? 0,
      win_streak: numeric(row.win_streak) ?? 0, ocbr: numeric(row.ocbr) ?? undefined,
      ...location, distance: Math.max(0, numeric(row.distance) ?? 0),
    });
  }
  for (const row of Array.isArray(value.territories) ? value.territories : []) {
    if (!record(row) || !text(row.id) || !text(row.user_id)) continue;
    const center = mapCoordinates(row.centroid_lat, row.centroid_lng) ?? mapCoordinates(row.lat, row.lng);
    if (!center) continue;
    territories.push({
      id: text(row.id), user_id: text(row.user_id), barangay_key: text(row.barangay_key),
      barangay: text(row.kingdom_name) || text(row.barangay) || 'Kingdom', locality: text(row.locality),
      boundary: validBoundary(row.boundary) ? row.boundary : kingdomBoundary(center.lat, center.lng),
      centroid_lat: center.lat, centroid_lng: center.lng, defense_points: numeric(row.defense_points),
      online: row.online === true, is_owner: row.is_owner === true,
      display_name: text(row.display_name, 'Player'), username: text(row.username), avatar_url: text(row.avatar_url),
      cbr: numeric(row.cbr), country_code: text(row.country_code),
    });
  }
  return {players, territories, territoriesComplete: Array.isArray(value.territories) && territories.length === value.territories.length};
}
