# RPG v0.0688

Explorer could read an older inventory while the newest coalesced autosave was still pending. That response replaced the shared Hero Room state, making items appear to move back into the stash. A second race allowed an in-flight Explorer poll or recovery response to apply after returning to equipment management.

All account game requests now drain queued inventory saves before continuing. Explorer opens only after the latest save succeeds, with equipment interactions temporarily locked during that transition. If saving fails, Explorer stays closed and local pending inventory is retained. Unchanged inventory checkpoints no longer create save requests, including when reopening an active battle. Closed battle connections reject delayed responses, and recovery responses are ignored after their Explorer view closes or changes.

The Exit RPG button is below active skills in the left sidebar, matching the supplied markup. It retains its existing save/exit behavior.

ct.js effects now measure the visible artwork across all six padded source frames. Scaling uses the union of the artwork’s distance from the frame center, fits within 86% of frame height and 42% of battle-frame width, and retains the original padding, sprite source, travel direction and hit timing. The browser bundle matches the source implementation.

All 63 RPG regression tests and the production build passed. Validation includes a delayed-first-save/newer-bag-save reproduction, reopening with the same bag, a late Explorer response after returning to Hero Room, pixel-footprint fitting, the RPG UI/asset regression suite, and production build. Browser QA used fixture inventory and GPS data, verified equipped items in Explorer, revisited Hero Room and Explorer, checked the larger spell preview, and captured the new Exit position. No production user inventory was edited as part of QA.
