# ChessBurger v25

## Included

1. Win, loss and draw dialogs for online, nearby and local-board matches, with settled CBR change, current CBR, level, progress to the next level, wins/losses and win streak. Recently finished online matches can also be surfaced when the player is outside the board. Spectators do not receive player result dialogs.
2. Result-dialog controls for friend requests, following, personal chat and blocking registered opponents. Local guests remain playable without requiring a social account.
3. Activated Friends, Chat and Follow buttons on the account/card, plus actions on other players' profiles.
4. Search by name or username; friend requests, accept/decline/cancel/remove; online friends ordered first; 10 players per page.
5. Followers and Following lists, follow-back controls, 10 players per page.
6. Feed remains 10 items per page. Database triggers now enforce the 50-item maximum on EVERY insert and delete reactions for removed items.
7. Community chat and private conversations, refreshed every five seconds; paged message history, bounded messages, retry-safe sends and preserved drafts.
8. Server-enforced blocking for profile views and personal chats. Community messages and social search results from blocked users are hidden. Blocking removes existing friendship/follow links in both directions; unblocking does not restore them. Manage unblocking under Friends > Blocked.
9. Cyan knight-shaped splash glow, retaining the ChessBurger logo and five-second splash duration. Reduced-motion preference supported.

## Deployment required

This source package is complete, but the live application has NOT been updated.
The backend project identified in `.openai/hosting.json` returned "Sites project not found" in this session. The Vercel frontend forwards `/api/*` to the existing backend in `vercel.json`; deploying only the frontend will not activate social features.

1. Deploy this source to the existing authorized backend and apply the new migrations in order: `drizzle/0004_simple_steve_rogers.sql`, then `drizzle/0005_social_guards_feed_retention.sql`. Preserve existing data and prior migration history. These are SQLite/D1 migrations, not Supabase SQL. The normal Sites migration workflow applies them during deployment.
2. Verify backend availability, then deploy the matching frontend using the existing Vercel configuration (`npm run build:vercel`).
3. Installed apps refresh to the v25 service-worker cache when online.

No Supabase authentication changes are required. Chats and social relationships use the existing app backend, not device-only storage. Feed pruning removes database entries and reactions; it does not delete externally hosted image files.

Owner email addresses are intentionally excluded from this public-source package. Existing stored Owner roles are preserved. For a fresh legacy Supabase setup, replace the `.invalid` placeholders locally before running the optional Owner setup SQL and never commit the edited file.

## Verification

- TypeScript check.
- Vercel frontend production build and Sites backend production build.
- 22 automated checks including friendship acceptance, 10-item pagination, follow-back status, private-message isolation, bidirectional blocking, feed retention, offline sync, and settled match CBR.
- No live deployment or signed-in browser test was possible in this session.
