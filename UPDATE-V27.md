# Chess Burger v27

- Displays live Friends and Followers totals on the user player card.
- Limits First Blood to one event per player in a rolling 23-hour, 59-minute window for online and synced offline matches.
- Makes a player's own online move appear immediately while the server confirms it.
- Reduces active-match polling from 1.5 seconds to 0.5 seconds so opponents see moves sooner.
- Highlights the previous tile in gold and the destination tile in cyan for two seconds after every move.

No Supabase SQL update is required. These changes use the existing D1 tables.
