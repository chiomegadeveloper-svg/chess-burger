import { createClient } from '@supabase/supabase-js';

type Req = { method?: string };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(200).json({ enabled: false });
  try {
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const r = await client.from('cb_app_settings').select('value').eq('key', 'maintenance').maybeSingle();
    if (r.error || !r.data) return res.status(200).json({ enabled: false });
    const value = r.data.value && typeof r.data.value === 'object' ? r.data.value as Record<string, unknown> : {};
    return res.status(200).json({ enabled: value.enabled === true, message: typeof value.message === 'string' ? value.message : '' });
  } catch { return res.status(200).json({ enabled: false }); }
}
