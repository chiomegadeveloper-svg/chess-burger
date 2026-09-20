import { getSupabase } from "./supabase";

export async function arena<T = any>(
  action: string,
  body: Record<string, unknown> = {},
  isPublic = false,
): Promise<T> {
  const request = async (token?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const query = new URLSearchParams({
      action,
      ...Object.fromEntries(
        Object.entries(body).map(([key, value]) => [key, String(value)]),
      ),
    });
    return fetch(`/api/arena${isPublic ? `?${query}` : ""}`, {
      method: isPublic ? "GET" : "POST",
      headers,
      body: isPublic ? undefined : JSON.stringify({ ...body, action }),
      cache: "no-store",
    });
  };

  const client = isPublic ? null : await getSupabase();
  let session = client ? (await client.auth.getSession()).data.session : null;
  if (!isPublic && !session)
    throw Error("Sign in and save your profile to play with other players.");

  let response = await request(session?.access_token);
  if (!isPublic && response.status === 401 && client) {
    const refreshed = await client.auth.refreshSession();
    session = refreshed.data.session;
    if (!session) throw Error("Your session expired. Please sign in again.");
    response = await request(session.access_token);
  }

  const raw = await response.text();
  let data: { error?: string } | T | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as { error?: string } | T;
    } catch {
      const plain = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      throw Error(
        plain.slice(0, 180) || `Game server error (${response.status}).`,
      );
    }
  }
  if (!response.ok)
    throw Error(
      (data as { error?: string } | null)?.error ??
        `Game server error (${response.status}).`,
    );
  if (!data) throw Error("The game server returned an empty response.");
  return data as T;
}
