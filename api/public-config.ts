type Req = { method?: string };
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

// The browser needs only the public Supabase URL and publishable key.
// Never expose the server's service role key from this endpoint.
export default function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && (key.startsWith('sb_publishable_') || key.startsWith('eyJ'));
  return res.status(200).json(configured ? { configured: true, url, key } : { configured: false });
}
