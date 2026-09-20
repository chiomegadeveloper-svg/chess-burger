export let fixtureMode: 'legacy' | 'invalid' | 'network-error' = 'legacy';
export function setFixtureMode(mode: typeof fixtureMode) { fixtureMode = mode; }
export async function arena<T>(action: string): Promise<T> {
  if (action === 'nearby' && fixtureMode === 'network-error') throw new Error('Fixture network unavailable.');
  if (action === 'nearby' && fixtureMode === 'invalid') return {players: [null, {user_id:'invalid',lat:null,lng:125}],territories:[{id:'invalid',user_id:'fixture-owner',lat:NaN,lng:125}]} as T;
  if (action === 'nearby') return {
    players: [],
    territories: [{
      id: '11111111-1111-4111-8111-111111111111', user_id: 'fixture-owner',
      lat: 11.244, lng: 125.003, kingdom_name: 'Regression Kingdom',
      is_owner: true, display_name: 'Fixture player',
    }],
  } as T;
  if (action === 'map-stats') return {
    online_users: 1, registered_users: 2, active_matches: 0,
    gps_online: 1, highest_online: null, updated_at: new Date().toISOString(),
  } as T;
  throw new Error(`The read-only fixture does not implement ${action}.`);
}
