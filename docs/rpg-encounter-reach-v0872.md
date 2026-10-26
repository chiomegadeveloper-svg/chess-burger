# RPG encounter reach fix — v0.0872

The monster preview previously swallowed a failed selection request and returned a null ticket. ATTACK then rejected that null ticket locally with “Select this monster on the map again,” preventing the server's existing fresh-GPS fallback from running. A preview lookup interrupted by GPS or a concurrent profile update could therefore block an otherwise reachable encounter.

ATTACK now sends the latest GPS fix along with any available selection ticket. A valid ticket still allows starting combat without another GPS fix. Missing or expired tickets use the server's existing fresh-location check and the same 200-metre distance rule. The server also rejects previous-city monster sets on this direct encounter path, matching preview validation; legacy absent city IDs are normalized to null consistently.

Monster markers now show distance and In reach / Move closer, updated on accepted GPS fixes. A ground-position dot identifies the coordinate used for range checks. Reachable pins use a green dot and label. The attack radius remains 200 metres. Tall artwork overlapping the circle does not extend that radius.

Verification:

- 15 server checks passed, covering missing and expired tickets, 199-metre acceptance, 232-metre rejection, stale GPS rejection, existing ticket-only starts, city invalidation and nearby PvP.
- Four focused UI checks passed, including an interrupted preview followed by a successful ATTACK without another map tap, existing GPS-free ticket starts, out-of-range feedback and city clearing.
- A map-marker check passed with simulated movement: a pin at 232 metres changed from Move closer to In reach at 18 metres, updating the existing marker rather than duplicating it.
- Managed browser preview rendered the map but its test transport failed to return discovery requests. Full browser verification was therefore incomplete; no production account was used for QA.

No database schema or wallet changes are required.
