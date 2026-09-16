import { admin, errorBody, json, safeName, userFromRequest } from "./_supabase";

type ProfileInput = {
  username?: string; display_name?: string; bio?: string; avatar_url?: string;
  card_photo_url?: string; country_code?: string; featured_photos?: string[]; featured_badges?: string[];
};

function cleanList(value: unknown, limit: number) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean).slice(0, limit) : [];
}
export default async function profile(request: Request) {
  try {
    const user = await userFromRequest(request);
    const db = admin();
    if (request.method === "GET") {
      const { data, error } = await db.from("cb_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return json({ profile: data });
    }
    if (request.method !== "PUT") return json({ error: "Method not allowed." }, 405);
    const input = await request.json() as ProfileInput;
    const username = safeName(input.username);
    const display_name = String(input.display_name ?? "").trim().slice(0, 60);
    if (!display_name) return json({ error: "Enter your name." }, 400);
    const avatar_url = String(input.avatar_url ?? "").trim();
    if (!avatar_url) return json({ error: "A profile picture is required to use Chess Burger." }, 400);
    const payload = {
      user_id: user.id, username, display_name,
      bio: String(input.bio ?? "").trim().slice(0, 240),
      avatar_url, country_code: /^[A-Z]{2}$/.test(String(input.country_code ?? "")) ? String(input.country_code) : "PH",
      featured_photos: cleanList(input.featured_photos, 4),
      featured_badges: cleanList(input.featured_badges, 5),
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: findError } = await db.from("cb_profiles").select("role,card_photo_url,created_at,cbr,gold_points,win_streak,wins,losses").eq("user_id", user.id).maybeSingle();
    if (findError) throw findError;
    const { data, error } = await db.from("cb_profiles").upsert({
      ...payload,
      role: existing?.role ?? "player",
      card_photo_url: existing?.card_photo_url ?? "",
      cbr: existing?.cbr ?? 88, gold_points: existing?.gold_points ?? 0,
      win_streak: existing?.win_streak ?? 0, wins: existing?.wins ?? 0, losses: existing?.losses ?? 0,
      created_at: existing?.created_at ?? new Date().toISOString(),
    }, { onConflict: "user_id" }).select().single();
    if (error) {
      if (error.code === "23505") return json({ error: "That username is already taken.", code: "username_taken" }, 409);
      throw error;
    }
    return json({ profile: data });
  } catch (error) { return errorBody(error); }
}