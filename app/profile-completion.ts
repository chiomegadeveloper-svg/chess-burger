import type { PlayerProfile } from "./supabase";

type RegistrationProfile = Pick<
  PlayerProfile,
  "username" | "display_name" | "avatar_url" | "country_code"
>;

export function isProfileComplete(
  profile: RegistrationProfile | null | undefined,
) {
  if (!profile) return false;
  const username = profile.username.replace(/^@+/, "").trim().toLowerCase();
  return (
    /^[a-z0-9_]{3,24}$/.test(username) &&
    profile.display_name.trim().length > 0 &&
    profile.avatar_url.trim().length > 0 &&
    /^[A-Z]{2}$/.test(profile.country_code.trim().toUpperCase())
  );
}
