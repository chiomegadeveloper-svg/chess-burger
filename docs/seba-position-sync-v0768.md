# SEBA board reliability and paid continuation — v0.0768

Switching Teach / Play mode preserves the workspace and every student FEN, annotations and solver color. Play Mode changes movement rules only; reset remains an explicit action. Student free movement is disabled when changing mode as before.

Students can flip their own board view immediately using the existing view_flipped field. This changes viewing orientation, not the playable side or any other student's preference. Existing room solver color and puzzle-turn behavior remain intact.

Setup placement is idempotent: tapping the same piece twice leaves it in place. Placing an already-existing king relocates it safely rather than removing the target and failing silently. Free teaching moves swap friendly pieces on occupied squares; rejected puts never publish a partially modified board.

Local moves remain optimistic. The shared channel now publishes confirmed board rows only. Per-board pending writes prevent background polling or database events from reversing edits while saving. Delayed confirmed events are ignored by timestamp. Writes include expected starting FEN and compare-and-set FEN/version filters; concurrent stale edits fail instead of overwriting a newer board. Duplicate student moves return the existing board without replaying or logging them again. Assignment/reset commands wait for pending moves before applying.

At two minutes remaining, a paid non-training student sees Continue / Quit. Continue consumes 1 CBC through the existing transactional 30-minute access extension RPC. There is no silent automatic renewal. Free classes, approved trainings and teachers do not receive the paid prompt. Request IDs survive failed responses, and an in-flight lock prevents double-click spending. Zero-CBC Continue is disabled; buying CBC remains available. SQL changes are not required.

Validation: 34 targeted tests cover API permissions and positions, mode changes, independent orientation, stale-write conflicts, setup kings and repeated taps, delayed event merging, UI polling during save, renewal double-clicks, retry idempotency and insufficient credit, plus existing puzzle-turn, movement and history behavior. Production build passed. Browser fixture review confirmed a 2-to-1 CBC balance change and +30 minutes after Continue, unchanged piece locations on flipping, and an unchanged teacher position after switching to Play Mode. No production student balance or session was modified during validation. Screenshot: images/seba-two-minute-prompt-v0768.jpg.

Rollout: all teacher and student tabs should reload together; older clients still contain the previous reset and orientation controls. Realtime timing on two physical devices was not measured in this environment.
