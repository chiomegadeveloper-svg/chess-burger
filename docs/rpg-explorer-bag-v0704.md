# RPG equipped bag Explorer fix — v0.0704

Explorer's inventory-save barrier correctly refused to continue with an unsaved layout, but valid potion metadata caused every production request to invalidate that layout. PostgreSQL JSONB changes object key ordering; comparing `restore` with JSON.stringify treated `{amount:20,resource:'hp'}` as different from `{resource:'hp',amount:20}`. Normalization therefore bumped inventoryRevision repeatedly, leaving equipment saves permanently pending.

Potion normalization now compares resource and amount values. Server equipment and grid validation uses structural equality, accepting reordered JSON object fields while still rejecting altered item attributes. No schema changes or user inventory deletion are required.

Validation: reproduced the original failure with JSONB-ordered fixture storage, then verified clicking an owned weapon's transfer button and Explore World saves the equipped item and opens Explorer. A separate PGlite PostgreSQL JSONB query test verifies idempotent normalization, unchanged inventory revisions and rejection of forged enhancements. The 75 existing/regression tests plus the PostgreSQL test pass (76 total); production build passes. Tested with fixture accounts rather than modifying a production player's inventory.
