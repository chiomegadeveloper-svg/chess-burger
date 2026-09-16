import { createClient, type User } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function admin() {
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function userFromRequest(request: Request): Promise<User> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 });
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Response(JSON.stringify({ error: "Your login expired. Sign in again." }), { status: 401 });
  return data.user;
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export function errorBody(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Server request failed.";
  return json({ error: message }, 500);
}
export function safeName(value: unknown) {
  const name = String(value ?? "").replace(/^@+/, "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(name)) throw new Error("Username must use 3–24 lowercase letters, numbers, or underscores.");
  return name;
}