import { createClient } from '@supabase/supabase-js';

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };

function cleanUrl(value: unknown) {
  const url = String(value ?? '').trim();
  return !url || /^https:\/\//i.test(url) ? url : '';
}
function avatarPath(client: any, userId: string, value: unknown) {
  const url = cleanUrl(value);
  const match = url.match(/\/cb-profile-media\/([^/?#]+)\/([^/?#]+)$/);
  if (!match || match[1] !== userId || !/^avatar-[a-z0-9-]+\.webp$/i.test(match[2])) return '';
  const path = `${userId}/${match[2]}`;
  return client.storage.from('cb-profile-media').getPublicUrl(path).data.publicUrl === url ? path : '';
}
function list(value: unknown, limit: number) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, limit) : [];
}
const BOBBIE_OWNER_ID = 'b8746953-d532-4f7e-83f5-987192ee7b0c';

async function recoverStoredAvatar(client: any, userId: string) {
  const files = await client.storage.from('cb-profile-media').list(userId, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (files.error) return '';
  const avatar = (files.data ?? []).find((file: any) => /^avatar-[a-z0-9-]+\.webp$/i.test(String(file.name ?? '')));
  if (!avatar) return '';
  return cleanUrl(client.storage.from('cb-profile-media').getPublicUrl(`${userId}/${avatar.name}`).data.publicUrl);
}

function view(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { ...row, ocbr: Number(row.ocbr ?? 88), gold_points: Number(row.gold_points ?? 88), wins: Number(row.wins ?? 0), losses: Number(row.losses ?? 0), win_streak: Number(row.win_streak ?? 0), featured_photos: list(row.featured_photos, 4), featured_badges: list(row.featured_badges, 5) };
}
async function framedView(client: any, row: Record<string, unknown> | null) {
  const profile = view(row);
  const itemId = String(row?.active_avatar_frame_item ?? '');
  if (!profile) return null;
  if (!/^af-(basic|premium)-(10|[1-9])-[a-f0-9]{32}$/.test(itemId)) return { ...profile, avatar_frame_id: null };
  const item = await client.from('cb_inventory_items').select('metadata').eq('user_id',row!.user_id).eq('item_kind','avatar_frame').eq('item_id',itemId).gt('quantity',0).maybeSingle();
  const frameId = String(item.data?.metadata?.frame_id ?? '');
  return { ...profile, avatar_frame_id: !item.error && itemId.startsWith(`af-${frameId}-`) && Date.parse(String(item.data?.metadata?.expires_at ?? '')) > Date.now() ? frameId : null };
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed.' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !/^[\x21-\x7e]+$/.test(key)) return res.status(503).json({ error: 'Profile service is not configured.' });
  const header = req.headers.authorization;
  const token = (Array.isArray(header) ? header[0] : header ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Your login expired. Sign in again.' });
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Your login expired. Sign in again.' });
    const existing = await client.from('cb_profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (req.method === 'GET') {
      let row = existing.data;
      if (row) {
        const patch: Record<string, unknown> = {};
        const currentPath = avatarPath(client, user.id, row.avatar_url);
        const verified = currentPath ? await client.storage.from('cb-profile-media').download(currentPath) : null;
        if (!verified?.data || verified.error) {
          const storedAvatar = await recoverStoredAvatar(client, user.id);
          patch.avatar_url = storedAvatar;
        }
        if (user.id === BOBBIE_OWNER_ID) {
          patch.role = 'owner';
          patch.cbr = Math.max(Number(row.cbr ?? 0), 100);
          patch.gold_points = Math.max(Number(row.gold_points ?? 0), 5);
          patch.wins = Math.max(Number(row.wins ?? 0), 1);
          patch.win_streak = Math.max(Number(row.win_streak ?? 0), 1);
        }
        if (Object.keys(patch).length) {
          const recovered = await client.from('cb_profiles').update(patch).eq('user_id', user.id).select('*').single();
          if (!recovered.error) row = recovered.data;
        }
      }
      return res.status(200).json({ profile: await framedView(client,row) });
    }

    const input = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if (JSON.stringify(input).length > 30000) return res.status(413).json({ error: 'Profile is too large.' });
    const username = String(input.username ?? '').replace(/^@+/, '').trim().toLowerCase();
    const displayName = String(input.display_name ?? '').trim();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must use 3–24 lowercase letters, numbers, or underscores.', code: 'username_format' });
    if (!displayName || displayName.length > 60) return res.status(400).json({ error: 'Enter your name (up to 60 characters).', code: 'name_required' });
    const country = String(input.country_code ?? 'PH');
    const avatar = cleanUrl(input.avatar_url);
    const path = avatarPath(client, user.id, avatar);
    if (!path) return res.status(400).json({ error: 'Upload your profile picture before saving your profile.', code: 'avatar_required' });
    const stored = await client.storage.from('cb-profile-media').download(path);
    if (stored.error || !stored.data || stored.data.type !== 'image/webp') return res.status(400).json({ error: 'Upload your profile picture before saving your profile.', code: 'avatar_required' });
    const payload = {
      user_id: user.id,
      username,
      display_name: displayName,
      bio: String(input.bio ?? '').trim().slice(0, 240),
      avatar_url: avatar,
      country_code: /^[A-Z]{2}$/.test(country) ? country : 'PH',
      featured_photos: list(input.featured_photos, 4).map(cleanUrl),
      featured_badges: list(input.featured_badges, 5),
    };
    // Only these editable fields can be written. Existing roles, rewards and
    // match statistics remain under database control.
    const saved = await client.from('cb_profiles').upsert(payload, { onConflict: 'user_id' }).select('*').single();
    if (saved.error?.code === '23505') return res.status(409).json({ error: 'That username is already taken. Choose another one.', code: 'username_taken' });
    if (saved.error) throw saved.error;
    return res.status(200).json({ profile: await framedView(client,saved.data) });
  } catch (error) {
    console.error('Chess Burger profile request failed', error);
    return res.status(500).json({ error: 'Profile could not be loaded or saved. Please retry.', code: 'profile_save_failed' });
  }
}
