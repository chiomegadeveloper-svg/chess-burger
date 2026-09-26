import type { PlayerProfile } from "./supabase";

type RegistrationProfile = Pick<
  PlayerProfile,
  "user_id" | "username" | "display_name" | "avatar_url" | "country_code"
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
    profile.avatar_url.includes(`/storage/v1/object/public/cb-profile-media/${profile.user_id}/avatar-`) &&
    /^https:\/\/[^/?#]+\/storage\/v1\/object\/public\/cb-profile-media\/[a-f0-9-]{36}\/avatar-[a-z0-9-]+\.webp$/i.test(profile.avatar_url) &&
    /^[A-Z]{2}$/.test(profile.country_code.trim().toUpperCase())
  );
}
