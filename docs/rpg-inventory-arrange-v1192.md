# Restore inventory arrangers — v0.1192

Hero Bag and Hero Stash retain their auto-arrange handlers, but the split Inventory page marked both buttons hidden. Their headers now show the existing compact SVG button style, with accessible names and hover/focus tooltips. Guild Stash receives the same icon beside its item count; it is disabled while loading, disconnected, empty or unavailable to the user. Narrow screens use a smaller icon button.

Guild arranging is computed from authoritative server items and committed through the existing membership-locked guild-to-guild layout RPC. Personal and shared revisions reject stale layouts, and request receipts make retries idempotent. The client refreshes and retries a revision conflict once. The operation preserves ownership, item rolls and currency. No database migration or new privileged database function is required.

The packing engine now tracks sixteen bits per row rather than eight, so the twelve-column shared grid cannot lose occupancy in columns 9–12 and produce overlapping placements.

Validation: ten packing/SQL checks and four focused UI checks passed. These cover a 120-item twelve-column arrangement, item identity and currency preservation, membership checks, stale revision rejection, rollback during a concurrent member change, retry idempotency, visible icon-only buttons, personal autosave and guild retry behavior. Production build passed.
