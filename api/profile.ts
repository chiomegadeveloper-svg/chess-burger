import { createClient } from '@supabase/supabase-js';

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };

function cleanUrl(value: unknown) {
  const url = String(value ?? '').trim();
  return !url || /^https:\/\//i.test(url) ? url : '';
}
function list(value: unknown, limit: number) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, limit) : [];
}
function view(row: Record<string, unknown> | null) {
  if (!row) return null;
  return { ...row, ocbr: 88, featured_photos: list(row.featured_photos, 4), featured_badges: list(row.featured_badges, 5) };
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
    if (req.method === 'GET') return res.status(200).json({ profile: view(existing.data) });

    const input = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if (JSON.stringify(input).length > 30000) return res.status(413).json({ error: 'Profile is too large.' });
    const username = String(input.username ?? '').replace(/^@+/, '').trim().toLowerCase();
    const displayName = String(input.display_name ?? '').trim();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must use 3–24 lowercase letters, numbers, or underscores.', code: 'username_format' });
    if (!displayName || displayName.length > 60) return res.status(400).json({ error: 'Enter your name (up to 60 characters).', code: 'name_required' });
    const country = String(input.country_code ?? 'PH');
    const payload = {
      user_id: user.id,
      username,
      display_name: displayName,
      bio: String(input.bio ?? '').trim().slice(0, 240),
      avatar_url: cleanUrl(input.avatar_url),
      country_code: /^[A-Z]{2}$/.test(country) ? country : 'PH',
      featured_photos: list(input.featured_photos, 4).map(cleanUrl),
      featured_badges: list(input.featured_badges, 5),
    };
    // Only these editable fields can be written. Existing roles, rewards and
    // match statistics remain under database control.
    const saved = await client.from('cb_profiles').upsert(payload, { onConflict: 'user_id' }).select('*').single();
    if (saved.error?.code === '23505') return res.status(409).json({ error: 'That username is already taken. Choose another one.', code: 'username_taken' });
    if (saved.error) throw saved.error;
    return res.status(200).json({ profile: view(saved.data) });
  } catch (error) {
    console.error('Chess Burger profile request failed', error);
    return res.status(500).json({ error: 'Profile could not be loaded or saved. Please retry.', code: 'profile_save_failed' });
  }
}
