# Start nearby battles from the map — v0.1136

The monster preview no longer requests a fresh device GPS reading or starts a separate selection request. ATTACK sends one encounter request with the latest map position, falling back to the position captured when the preview opened. The account transport no longer replaces monster selection/encounter payloads with a forced GPS reading. This removes the repeated “Waiting for your device GPS” gate for a monster already shown in range.

The server accepts that cached map snapshot for up to the existing 30-minute monster-set lifetime and still checks the 200-meter distance, current city, monster expiry, defeated status and hero eligibility. Invalid, future-dated or older snapshots remain rejected. Discovery and recovery keep their existing fresh-location requirements; existing selection tokens remain supported for older clients.

Verification: 11 server checks and three focused UI checks passed. The regression test makes any device-GPS request fail, opens a reachable monster with a two-minute-old map snapshot, clears the live position, and successfully starts combat with the preview snapshot. It also confirms no separate selection request was made. Other checks cover range rejection, expired snapshots, fresh discovery, city changes and pinned encounters.

The v0.1144 follow-up moves background discovery/recovery GPS acquisition outside the account mutation queue. Those operations still request fresh location, but a slow device fix cannot hold ATTACK behind it. Four focused UI checks now pass, including a regression that leaves the background GPS promise unresolved until after combat has started.
