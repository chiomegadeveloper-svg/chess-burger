# Chess Burger v16

## Email confirmation redirect

New Gmail signups now send Supabase the current Chess Burger origin as `emailRedirectTo`. Confirmation links therefore return to the deployed app instead of a development-only `localhost:3000` address.

Supabase must allow the production origin in **Authentication → URL Configuration**:

- Site URL: `https://chess-burger-archetype.chiomegadeveloper.chatgpt.site`
- Redirect URL: `https://chess-burger-archetype.chiomegadeveloper.chatgpt.site/**`

Confirmation links already generated before v16 keep their original redirect. After confirming through one of those older links, users can return to the public app and sign in normally, or request a fresh signup confirmation after the URL configuration is corrected.
