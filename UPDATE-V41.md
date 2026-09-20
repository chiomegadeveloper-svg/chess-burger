# Chess Burger V41 — Barangay KING territories

Run `supabase/0014_barangay_territory_defense.sql` once in the current Supabase SQL Editor before using the new territory controls.

This migration is non-destructive. It keeps existing profiles and territory owners, changes new-player Gold to 88, upgrades the newest legacy claim in each known barangay when that map is opened, and adds:

- polygonal barangay territory boundaries;
- 10 starting defense points;
- green/gray owner-presence flags and the electric-cyan KING flag;
- 18-Gold invasion challenges charged only after the owner accepts;
- normal CBR settlement for invasion games;
- +1 defense for an owner win, −1 for an attacker win, and ownership transfer at the last point.

After the SQL succeeds, deploy the matching application commit. Installed PWAs use cache `v51`; close and reopen the app once after deployment.
