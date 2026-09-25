/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js';

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };
type Alert = { key: string; kind: string; title: string; body: string; target: string; created_at: string; sticky?: boolean };
type Row = Record<string, any>;
const age = 30 * 24 * 60 * 60 * 1000;
const first = (header: string | string[] | undefined) => Array.isArray(header) ? header[0] : header;
const phDay = (time: number) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time - 60_000));
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const clean = (value: unknown, maximum = 100) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
const err = (status: number, message: string) => Object.assign(new Error(message), { status });

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Notifications are not configured.' });
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const token = first(req.headers.authorization)?.replace(/^Bearer\s+/i, '');
    if (!token) throw err(401, 'Sign in to see your notifications.');
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user) throw err(401, 'Your session expired. Sign in again.');
    const userId = auth.data.user.id;

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body as { keys?: unknown } : {};
      if (!Array.isArray(body.keys) || body.keys.length > 80 || body.keys.some(key => typeof key !== 'string' || key.length < 3 || key.length > 160))
        throw err(400, 'Choose valid notifications to mark as read.');
      const keys = [...new Set(body.keys as string[])];
      if (!keys.length) return res.status(200).json({ ok: true });
      const saved = await db.from('cb_notification_reads').upsert(keys.map(notification_key => ({ user_id: userId, notification_key, read_at: new Date().toISOString() })), { onConflict: 'user_id,notification_key' });
      if (saved.error && !/cb_notification_reads|schema cache|does not exist/i.test(saved.error.message)) throw err(500, saved.error.message);
      return res.status(200).json({ ok: true });
    }

    const now = Date.now(), cutoff = new Date(now - age).toISOString(), day = phDay(now);
    const [reads, reward, puzzle, banners, comments, feed, purchases, gifts, socials, member, announcements] = await Promise.all([
      db.from('cb_notification_reads').select('notification_key,read_at').eq('user_id', userId).gte('read_at', cutoff).order('read_at', { ascending: false }).limit(500),
      db.rpc('cb_daily_reward_status', { p_user_id: userId }),
      db.from('cb_daily_puzzle_claims').select('puzzle_id').eq('user_id', userId).eq('puzzle_day', day).limit(1),
      db.from('cb_user_items').select('product_id,expires_at').eq('user_id', userId).gt('expires_at', new Date(now).toISOString()).lte('expires_at', new Date(now + 48 * 3600_000).toISOString()).order('expires_at', { ascending: true }).limit(12),
      db.from('cb_portfolio_comments').select('id,slot,author_id,body,created_at').eq('portfolio_user_id', userId).neq('author_id', userId).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(20),
      db.from('cb_feed').select('id').eq('user_id', userId).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(60),
      db.from('cb_gold_ledger').select('id,delta,kind,created_at').eq('user_id', userId).in('kind', ['shop_purchase', 'arena_ticket_purchase', 'bag_slots', 'cbc_purchase', 'classroom_room', 'seba_student_cbc', 'gold_gift', 'arena_champion']).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(100),
      db.from('cb_item_gifts').select('request_id,sender_id,item_kind,item_id,quantity,created_at').eq('recipient_id', userId).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(20),
      db.from('cb_social_links').select('id,user_id,kind,status,created_at').eq('target_id', userId).in('kind', ['friend', 'follow']).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(30),
      db.from('cb_guild_members').select('guild_id,joined_at').eq('user_id', userId).maybeSingle(),
      db.from('cb_feed').select('id,content,created_at,expires_at').eq('kind', 'announcement').gte('created_at', new Date(now - 7 * 86400_000).toISOString()).order('created_at', { ascending: false }).limit(5),
    ]);
    if (reads.error && !/cb_notification_reads|schema cache|does not exist/i.test(reads.error.message)) throw err(500, reads.error.message);
    // Older installations may lack an optional source. Keep the rest of the inbox available.
    const errors: string[] = [];
    const rows = (result: { data: unknown; error: { message: string } | null }, source: string): Row[] => {
      if (result.error) { errors.push(source); return []; }
      return Array.isArray(result.data) ? result.data as Row[] : [];
    };
    const bannerRows = rows(banners, 'banners'), commentRows = rows(comments, 'portfolio comments'), feedRows = rows(feed, 'feed'), purchaseRows = rows(purchases, 'purchases');
    const giftRows = rows(gifts, 'gifts'), socialRows = rows(socials, 'friends'), announcementRows = rows(announcements, 'announcements');
    const ids = feedRows.map(row => row.id as string);
    const [reactions, guild, chest, products] = await Promise.all([
      ids.length ? db.from('cb_feed_reactions').select('feed_id,user_id,created_at').in('feed_id', ids).neq('user_id', userId).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(40) : Promise.resolve({ data: [], error: null }),
      member.data?.guild_id ? db.from('cb_guild_activity').select('id,guild_id,actor_id,kind,created_at').eq('guild_id', member.data.guild_id).in('kind', ['join', 'leader']).gte('created_at', member.data.joined_at > cutoff ? member.data.joined_at : cutoff).order('created_at', { ascending: false }).limit(40) : Promise.resolve({ data: [], error: null }),
      member.data?.guild_id ? db.from('cb_guild_chest_ledger').select('id,user_id,amount,created_at').eq('guild_id', member.data.guild_id).gt('amount', 0).gte('created_at', member.data.joined_at > cutoff ? member.data.joined_at : cutoff).order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
      bannerRows.length || giftRows.length ? db.from('cb_shop_products').select('id,name').in('id', [...new Set([...bannerRows.map(row => row.product_id), ...giftRows.map(row => row.item_id)].filter(Boolean))]) : Promise.resolve({ data: [], error: null }),
    ]);
    if (member.error) errors.push('guild');
    const reactionRows = rows(reactions, 'reactions'), guildRows = rows(guild, 'guild'), chestRows = rows(chest, 'guild Gold'), productRows = rows(products, 'products');
    const actorIds = [...new Set([...commentRows.map(row => row.author_id), ...reactionRows.map(row => row.user_id), ...giftRows.map(row => row.sender_id), ...socialRows.map(row => row.user_id), ...guildRows.map(row => row.actor_id), ...chestRows.map(row => row.user_id)].filter(Boolean))] as string[];
    const actors = actorIds.length ? await db.from('cb_profiles').select('user_id,display_name,username').in('user_id', actorIds.slice(0, 130)) : { data: [], error: null };
    const actorMap = new Map((actors.data ?? []).map(row => [row.user_id, clean(row.display_name || row.username || 'Player', 50)]));
    const actor = (id: string) => actorMap.get(id) ?? 'A player';
    const productMap = new Map(productRows.map(row => [row.id, clean(row.name, 50)]));
    const alerts: Alert[] = [];
    const add = (alert: Alert) => alerts.push(alert);

    if (reward.error) errors.push('daily reward');
    else if (reward.data && !reward.data.claimed_today) add({ key: `daily:${day}`, kind: 'reward', title: 'Your daily reward is ready', body: `Claim day ${reward.data.day ?? 1} of your reward streak.`, target: 'rewards', created_at: new Date(now).toISOString(), sticky: true });
    if (puzzle.error) errors.push('puzzles');
    else if (!puzzle.data?.length) add({ key: `puzzles:${day}`, kind: 'puzzle', title: 'New puzzles arrived', body: 'Today’s Puzzle Quest is ready with Coach Patty.', target: 'puzzles', created_at: new Date(now).toISOString() });
    for (const row of bannerRows) add({ key: `banner:${row.product_id}:${row.expires_at}`, kind: 'banner', title: 'Your banner expires soon', body: `${productMap.get(row.product_id) ?? clean(row.product_id, 40)} expires ${new Date(row.expires_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}.`, target: 'bag', created_at: row.expires_at });
    for (const row of commentRows) add({ key: `portfolio-comment:${row.id}`, kind: 'comment', title: `${actor(row.author_id)} commented on your portfolio`, body: clean(row.body, 120), target: `portfolio:${row.slot}`, created_at: row.created_at });
    for (const row of reactionRows) add({ key: `reaction:${row.feed_id}:${row.user_id}:${row.created_at}`, kind: 'reaction', title: `${actor(row.user_id)} reacted to your feed`, body: 'Your community post received a heart.', target: 'home', created_at: row.created_at });
    const purchaseTitles: Record<string, string> = { shop_purchase: 'Banner purchase complete', arena_ticket_purchase: 'Arena ticket purchase complete', bag_slots: 'Bag slot purchase complete', cbc_purchase: 'Classroom credits purchased', classroom_room: 'Classroom room purchase complete', seba_student_cbc: 'Student credits purchased' };
    for (const row of purchaseRows) {
      if (row.delta < 0 && purchaseTitles[row.kind]) add({ key: `purchase:${row.id}`, kind: 'purchase', title: purchaseTitles[row.kind], body: `${Math.abs(row.delta)} Gold spent successfully.`, target: row.kind === 'arena_ticket_purchase' ? 'grand-arena' : row.kind === 'shop_purchase' ? 'bag' : row.kind === 'bag_slots' ? 'bag' : row.kind === 'cbc_purchase' || row.kind === 'classroom_room' || row.kind === 'seba_student_cbc' ? 'classroom' : 'shop', created_at: row.created_at });
      if (row.delta > 0 && row.kind === 'gold_gift') add({ key: `gold-gift:${row.id}`, kind: 'gift', title: 'Gold gift received', body: `Someone sent you ${row.delta} Gold.`, target: 'bag', created_at: row.created_at });
      if (row.delta > 0 && row.kind === 'arena_champion') add({ key: `champion:${row.id}`, kind: 'arena', title: 'Grand Arena champion!', body: `Your prize of ${row.delta} Gold has arrived.`, target: 'grand-arena', created_at: row.created_at });
    }
    for (const row of giftRows) add({ key: `item-gift:${row.request_id}`, kind: 'gift', title: `${actor(row.sender_id)} sent you a gift`, body: `${row.quantity ?? 1} × ${productMap.get(row.item_id) ?? clean(row.item_id || row.item_kind, 45)} is in your Bag.`, target: 'bag', created_at: row.created_at });
    for (const row of socialRows) {
      if (row.kind === 'friend' && row.status === 'pending') add({ key: `friend:${row.id}`, kind: 'friend', title: `${actor(row.user_id)} wants to be friends`, body: 'Review this friend request.', target: 'friend-requests', created_at: row.created_at, sticky: true });
      if (row.kind === 'follow') add({ key: `follower:${row.id}`, kind: 'friend', title: `${actor(row.user_id)} followed you`, body: 'See your new follower.', target: 'followers', created_at: row.created_at });
    }
    for (const row of guildRows) {
      if (row.kind === 'join' && row.actor_id !== userId) add({ key: `guild:${row.id}`, kind: 'guild', title: 'New guild member', body: `${actor(row.actor_id)} joined your guild.`, target: 'guild', created_at: row.created_at });
      if (row.kind === 'leader') add({ key: `guild:${row.id}`, kind: 'guild', title: 'New guild leader', body: `${actor(row.actor_id)} became the guild leader.`, target: 'guild', created_at: row.created_at });
    }
    for (const row of chestRows) add({ key: `guild-gold:${row.id}`, kind: 'guild', title: 'Guild Gold earned', body: `${actor(row.user_id)} added ${row.amount} Gold to the guild chest.`, target: 'guild', created_at: row.created_at });
    for (const row of announcementRows) if (!row.expires_at || Date.parse(row.expires_at) > now) add({ key: `announcement:${row.id}`, kind: 'announcement', title: 'New Chess Burger announcement', body: clean(row.content, 110) || 'See what is new in the community.', target: 'announcements', created_at: row.created_at });
    alerts.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return res.status(200).json({ items: alerts.slice(0, 80), read_entries: reads.data ?? [], unavailable: errors });
  } catch (error) {
    const failure = error as Error & { status?: number };
    return res.status(failure.status ?? 500).json({ error: failure.message || 'Notifications are temporarily unavailable.' });
  }
}
