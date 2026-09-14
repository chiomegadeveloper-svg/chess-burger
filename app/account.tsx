"use client";
import { openSocial } from "./social";

import { useEffect, useState } from "react";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  Camera,
  Image as ImageIcon,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { levelFor } from "./cbr";
import { getSupabase, PlayerProfile } from "./supabase";
import {
  authStorage,
  keepLogin,
  setKeepLogin,
  clearAccountCache,
} from "./auth-storage";
import AppFeaturedPhoto from "./app-featured-photo";
import RewardEmblems, { FeaturedRewardPicker, FeaturedRewardSlots } from "./reward-emblems";
import { arena } from "./arena-client";
import { profileRequest } from "./profile-client";
import { toWebpUnder1Mb } from "./media";

const emptyPhotos = ["", "", "", ""],
  countries = [
    ["PH", "🇵🇭", "Philippines"],
    ["US", "🇺🇸", "United States"],
    ["JP", "🇯🇵", "Japan"],
    ["KR", "🇰🇷", "South Korea"],
    ["SG", "🇸🇬", "Singapore"],
    ["GB", "🇬🇧", "United Kingdom"],
  ];
const blankProfile = (id = "guest-device"): PlayerProfile => ({
  user_id: id,
  username: "new_player",
  display_name: "New Player",
  bio: "",
  avatar_url: "",
  card_photo_url: "",
  country_code: "PH",
  featured_photos: [],
  featured_badges: [],
  cbr: 88,
  ocbr: 88,
  gold_points: 0,
  win_streak: 0,
  wins: 0,
  losses: 0,
  role: "player",
  created_at: new Date().toISOString(),
});
const newAccountProfile = (u: User) => {
  const emailName =
      (u.email?.split("@")[0] ?? "player")
        .replace(/[^a-z0-9_]/gi, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .toLowerCase() || "player",
    suffix = u.id.replaceAll("-", "").slice(0, 5),
    username = (
      emailName.slice(0, Math.max(3, 18 - suffix.length)) +
      "_" +
      suffix
    ).slice(0, 24),
    name = emailName
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    ...blankProfile(u.id),
    username,
    display_name: name || "New Player",
  };
};
const flag = (code: string) =>
  countries.find((c) => c[0] === code)?.[1] ?? "🌐";

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export default function Account({
  onSaved,
  cardOnly = false,
  onOpenCms,
  onLoaded,
  onMembershipChange,
}: {
  onLoaded?: (profile: PlayerProfile) => void;
  onSaved: (profile: PlayerProfile) => void;
  cardOnly?: boolean;
  onOpenCms?: () => void;
  onMembershipChange?: (member: boolean) => void;
}) {
  const [client, setClient] = useState<SupabaseClient | null>(null),
    [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<PlayerProfile | null>(null),
    [guest, setGuest] = useState(false);
  const [remember, setRemember] = useState(true),
    [registered, setRegistered] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [socialCounts, setSocialCounts] = useState({
    friends: 0,
    followers: 0,
  });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selectedPhoto, setSelectedPhoto] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [showPasswordSecurity, setShowPasswordSecurity] = useState(false),
    [newPassword, setNewPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState("");
  useEffect(() => {
    setRemember(keepLogin());
    let live = true,
      unsubscribe = () => {};
    if (!navigator.onLine) {
      try {
        const raw =
          authStorage.getItem("cb-staff-profile") ??
          localStorage.getItem("cb-guest-profile");
        if (raw) {
          const cached = JSON.parse(raw);
          setProfile(cached);
          setGuest(false);
          onLoaded?.(cached);
          onMembershipChange?.(cached.user_id !== "guest-device");
        }
      } catch {}
      setLoading(false);
      return;
    }

    async function load(c: SupabaseClient, u: User | null) {
      if (!live) return;
      setUser(u);
      if (u) setGuest(false);
      if (!u) {
        setRegistered(false);
        setEditing(false);
        setProfile(null);
        setGuest(false);
        onMembershipChange?.(false);
        try {
          const raw = localStorage.getItem("cb-guest-profile");
          if (raw) {
            setProfile({
              ...blankProfile(),
              ...JSON.parse(raw),
              role: "player",
            });
            setGuest(true);
          }
        } catch {}
        setLoading(false);
        return;
      }
      let data: PlayerProfile | null = null;
      try {
        data = await profileRequest(c);
      } catch (e) {
        setError((e as Error).message);
      }
      if (!live) return;
      const loaded = data
        ? { ...blankProfile(u.id), ...data }
        : newAccountProfile(u);
      setRegistered(!!data);
      setEditing(!data);
      onMembershipChange?.(!!data);
      if (!live) return;
      setProfile(loaded);
      onLoaded?.(loaded);
      if (data) authStorage.setItem("cb-staff-profile", JSON.stringify(loaded));
      setLoading(false);
    }
    void getSupabase()
      .then(async (c) => {
        if (!live) return;
        setClient(c);
        if (!c) {
          try {
            const raw = localStorage.getItem("cb-guest-profile");
            if (raw) {
              const cached = {
                ...blankProfile(),
                ...JSON.parse(raw),
                role: "player" as const,
              };
              setProfile(cached);
              setGuest(true);
              onLoaded?.(cached);
              onMembershipChange?.(false);
            }
          } catch {}
          setLoading(false);
          return;
        }
        const {
          data: { session },
        } = await c.auth.getSession();
        await load(c, session?.user ?? null);
        const { data } = c.auth.onAuthStateChange((event, s) => {
          if (event === "PASSWORD_RECOVERY") {
            setShowPasswordSecurity(true);
            toast.info("Choose a new password to finish recovery.");
          }
          setTimeout(() => void load(c, s?.user ?? null), 0);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch(() => {
        try {
          const raw =
            authStorage.getItem("cb-staff-profile") ??
            localStorage.getItem("cb-guest-profile");
          if (raw) {
            const cached = JSON.parse(raw);
            setProfile(cached);
            setGuest(true);
            onLoaded?.(cached);
            onMembershipChange?.(false);
          }
        } catch {}
        setLoading(false);
        setError("Offline mode. Account changes are saved on this device.");
      });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!profile || profile.user_id === "guest-device") return;
    let live = true;
    const refresh = () =>
      void arena<{ friends: number; followers: number }>("social-counts")
        .then((counts) => {
          if (live) setSocialCounts(counts);
        })
        .catch(() => {});
    refresh();
    window.addEventListener("cb-social-changed", refresh);
    return () => {
      live = false;
      window.removeEventListener("cb-social-changed", refresh);
    };
  }, [profile?.user_id]);
  async function emailAuth(mode: "signin" | "signup") {
    setKeepLogin(remember);
    if (!client) {
      setError(
        "Account service is unavailable. Please check the app connection.",
      );
      return;
    }
    const normalized = email.trim().toLowerCase();
    if (!/^[^@\s]+@gmail\.com$/.test(normalized) || password.length < 6) {
      setError(
        "Use a Gmail address and a password with at least 6 characters.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "signin"
          ? await client.auth.signInWithPassword({
              email: normalized,
              password,
            })
          : await client.auth.signUp({
              email: normalized,
              password,
              options: {
                emailRedirectTo: new URL(
                  "/",
                  window.location.origin,
                ).toString(),
              },
            });
      if (result.error) setError(result.error.message);
      else if (mode === "signup" && !result.data.session)
        toast.success("Confirmation email sent.", {
          description: "Open the link to return directly to Chess Burger.",
        });
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function requestPasswordReset() {
    if (!client) {
      setError("Account service is unavailable. Please check the app connection.");
      return;
    }
    const target = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) {
      setError("Enter the email address used for your Chess Burger account.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: resetError } = await client.auth.resetPasswordForEmail(target, {
        redirectTo: new URL("/", window.location.origin).toString(),
      });
      if (resetError) throw resetError;
      toast.success("Recovery email sent.", {
        description: "Open the secure link, then choose a new password in Chess Burger.",
      });
    } catch {
      setError("We could not send a recovery email. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !user || guest) return;
    if (newPassword.length < 6) {
      setError("Your new password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await client.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSecurity(false);
      toast.success("Password updated securely.");
    } catch (e) {
      setError((e as Error).message || "Password could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File, kind: "avatar" | "photo", index = 0) {
    if (!profile || !user || !client || guest) {
      setError("Sign in to upload a profile photo.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session || session.user.id !== user.id) throw new Error("session");
      const blob = await toWebpUnder1Mb(file),
        path =
          user.id +
          "/" +
          kind +
          "-" +
          (kind === "avatar" ? 0 : index) +
          "-" +
          crypto.randomUUID() +
          ".webp";
      const { data, error } = await client.storage
        .from("cb-profile-media")
        .upload(path, blob, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false,
        });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes("bucket") || message.includes("not found"))
          throw new Error("bucket");
        if (
          message.includes("row-level") ||
          message.includes("policy") ||
          message.includes("unauthorized")
        )
          throw new Error("policy");
        throw error;
      }
      const publicUrl = client.storage
        .from("cb-profile-media")
        .getPublicUrl(data.path).data.publicUrl;
      if (!publicUrl.startsWith("https://")) throw new Error("url");
      const next =
        kind === "avatar"
          ? { ...profile, avatar_url: publicUrl }
          : {
              ...profile,
              featured_photos: Array.from({ length: 4 }, (_, i) =>
                i === index ? publicUrl : (profile.featured_photos[i] ?? ""),
              ),
            };
      setProfile(next);
      toast.success("Photo uploaded to Supabase.", {
        description: "Save your profile to keep this photo.",
      });
    } catch (e) {
      const code = (e as Error).message;
      setError(
        code === "image-size"
          ? "Photo could not be reduced below 1 MB. Choose a smaller image."
          : code === "session"
            ? "Your login expired. Sign in again before uploading."
            : code === "bucket"
              ? "Profile photo storage is not configured yet. Run supabase/profile-media-storage.sql once."
              : code === "policy"
                ? "Supabase blocked this upload. Apply the profile media storage policies, then retry."
                : "Photo could not be uploaded to Supabase. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !client || !user) return;
    setBusy(true);
    setError("");
    try {
      const username = profile.username.replace(/^@+/, "").trim().toLowerCase(),
        displayName = profile.display_name.trim();
      if (!/^[a-z0-9_]{3,24}$/.test(username))
        throw Object.assign(
          new Error(
            "Username must use 3–24 lowercase letters, numbers, or underscores.",
          ),
          { code: "username_format" },
        );
      if (!displayName)
        throw Object.assign(new Error("Enter your name."), {
          code: "name_required",
        });
      const payload = {
        user_id: profile.user_id,
        username,
        display_name: displayName,
        bio: profile.bio.trim(),
        avatar_url: profile.avatar_url,
        country_code: profile.country_code,
        featured_photos: profile.featured_photos,
        featured_badges: profile.featured_badges,
      };
      const data = await profileRequest(client, "PUT", payload);
      if (!data) throw new Error("Profile save returned no data.");
      const saved = { ...blankProfile(data.user_id), ...data };
      setProfile(saved);
      setRegistered(true);
      setEditing(false);
      onMembershipChange?.(true);
      authStorage.setItem("cb-staff-profile", JSON.stringify(saved));
      onSaved(saved);
      toast.success("Profile saved securely.");
    } catch (e) {
      const issue = e as { code?: string; message?: string };
      setError(
        issue.code === "username_taken" ||
          issue.code === "username_format" ||
          issue.code === "name_required"
          ? (issue.message ?? "Check your profile details.")
          : `Profile could not be saved${issue.message ? ": " + issue.message : ". Please try again."}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      if (user && client && !guest) {
        await arena("leave").catch(() => {});
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
      }
      clearAccountCache();
      setUser(null);
      setGuest(false);
      setProfile(null);
      toast.success("Signed out.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p className="account-note">Loading player profile…</p>;
  if (!user && !guest)
    return (
      <section className="account-panel">
        <div className="auth-brand">
          <img src="/cburger_logo.png" alt="Chess Burger" />
          <span>PLAYER ACCESS</span>
        </div>
        <h2>Welcome to the board.</h2>
        <p>Sign in with your Gmail address to save your player profile.</p>
        <form
          className="gmail-form"
          onSubmit={(e) => {
            e.preventDefault();
            void emailAuth("signin");
          }}
        >
          <label>
            Gmail address
            <input
              type="email"
              autoComplete="email"
              required
              placeholder="yourname@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="remember-login">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Keep me logged in
          </label>
          <div>
            <button disabled={busy} type="submit">
              {busy ? "Please wait…" : "Sign in"}
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => void emailAuth("signup")}
            >
              Create account
            </button>
            <button
              disabled={busy}
              type="button"
              className="password-recovery-button"
              onClick={() => void requestPasswordReset()}
            >
              Forgot password?
            </button>
          </div>
        </form>
        <p className="registration-note">
          Create or sign in to your account to unlock Chess Burger.
        </p>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  if (!profile) return null;
  const level = levelFor(profile.cbr),
    winRate =
      profile.wins + profile.losses
        ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
        : 0,
    isStaff = profile.role === "owner" || profile.role === "admin";
  const playerCard = (
    <>
      <div className="player-card">
        <div className="card-topline">
          <span className="card-brand-logo">
            <img src="/cburger_logo.png" alt="Chess Burger" />
          </span>
          <span>{flag(profile.country_code)} PLAYER CARD</span>
        </div>
        <div className="card-main">
          <div className="portrait-ring">
            <div className="portrait-circle">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.display_name} />
              ) : (
                profile.display_name.charAt(0)
              )}
            </div>
          </div>
          <div className="card-identity">
            <div className="card-identity-heading">
              <div>
                <p>
                  @{profile.username.replace(/^@+/, "")} ·{" "}
                  {flag(profile.country_code)}
                </p>
                <h2>{profile.display_name}</h2>
                <span className="card-online">
                  <i />
                  Online
                </span>
                <span className="card-status">
                  Level {level.level} · {level.name}
                </span>
              </div>
              <img
                className="identity-level-emblem"
                src={
                  "/levels/level-" +
                  String(level.level - 1).padStart(2, "0") +
                  ".png"
                }
                alt={level.name}
              />
            </div>
            <div className="card-stats">
              <div>
                <strong>
                  <i>♞</i>
                  {profile.cbr}
                </strong>
                <span>CBR</span>
              </div>
              <div>
                <strong>
                  <i>♜</i>
                  {profile.ocbr ?? 88}
                </strong>
                <span>OCBR</span>
              </div>
              <div>
                <strong>
                  <i>♟</i>
                  {profile.gold_points.toLocaleString()}
                </strong>
                <span>Gold</span>
              </div>
              <div>
                <strong>
                  <i>♛</i>
                  {winRate}%
                </strong>
                <span>Win rate</span>
              </div>
            </div>
          </div>
        </div>
        <div className="card-achievements">
          <section className="card-trophy-frame">
            <header>
              <Trophy />
              <span>
                <strong>Tournament Trophies</strong>
                <small>Chess Burger official awards</small>
              </span>
            </header>
            <div className="trophy-slots" aria-label="Tournament trophy slots">
              {["Champion", "Finalist", "Special award"].map((label) => (
                <span key={label}>
                  <i>♛</i>
                  <small>{label}</small>
                </span>
              ))}
            </div>
          </section>
          <FeaturedRewardSlots selected={profile.featured_badges} />
        </div>
      </div>
    </>
  );
  const passwordSecurity = !guest && user ? (
    <section className="password-security">
      <header>
        <div>
          <span>ACCOUNT SECURITY</span>
          <h2>Password</h2>
        </div>
        <button type="button" disabled={busy} onClick={() => setShowPasswordSecurity((open) => !open)}>
          {showPasswordSecurity ? "Cancel" : "Change password"}
        </button>
      </header>
      {showPasswordSecurity ? (
        <form onSubmit={changePassword}>
          <label>
            New password
            <input type="password" autoComplete="new-password" minLength={6} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
          </label>
          <label>
            Confirm new password
            <input type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" />
          </label>
          <button type="submit" disabled={busy}>{busy ? "Updating…" : "Save new password"}</button>
        </form>
      ) : <p>Use a unique password. If you forget it, use “Forgot password?” from the sign-in screen.</p>}
    </section>
  ) : null;
  if (cardOnly)
    return (
      <section>
        {playerCard}
        <AppFeaturedPhoto />
        <RewardEmblems />
      </section>
    );
  if (registered === true && !editing)
    return (
      <section className="profile-editor profile-readonly">
        <div className="account-toolbar">
          <span>Personal profile</span>
          <div className="account-controls">
            {isStaff && (
              <button
                type="button"
                className="cms-access-button"
                onClick={onOpenCms}
              >
                <ShieldCheck size={17} />
                CMS
              </button>
            )}
            <button
              className="signout-button"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="profile-hero">
          <div className="avatar-upload profile-avatar-static">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} />
            ) : (
              <span>{profile.display_name.charAt(0)}</span>
            )}
          </div>
          <div>
            <h2>{profile.display_name}</h2>
            <p>
              @{profile.username.replace(/^@+/, "")} ·{" "}
              {flag(profile.country_code)} Level {level.level} · {level.name}
            </p>
            {isStaff && (
              <span className="role-badge">
                {profile.role === "owner" ? "OWNER" : "GM ADMIN"}
              </span>
            )}
            <div className="profile-social">
              <button type="button" onClick={() => openSocial("friends")}>
                {socialCounts.friends} Friends
              </button>
              <button type="button" onClick={() => openSocial("chat")}>
                Chat
              </button>
              <button type="button" onClick={() => openSocial("followers")}>
                {socialCounts.followers} Followers
              </button>
            </div>
          </div>
        </div>
        <div className="profile-summary cloud-panel">
          <div>
            <span>Online CBR</span>
            <strong>{profile.cbr}</strong>
          </div>
          <div>
            <span>Offline OCBR</span>
            <strong>{profile.ocbr ?? 88}</strong>
          </div>
          <div>
            <span>Gold points</span>
            <strong>{profile.gold_points.toLocaleString()}</strong>
          </div>
          <div>
            <span>Online record</span>
            <strong>
              {profile.wins}W · {profile.losses}L
            </strong>
          </div>
          <article>
            <span>About</span>
            <p>{profile.bio || "No profile description yet."}</p>
          </article>
          <button
            className="gold-button edit-profile-button"
            type="button"
            onClick={() => setEditing(true)}
          >
            Edit profile
          </button>
        </div>
        {passwordSecurity}
      </section>
    );
  return (
    <section className="profile-editor">
      {registered === false && (
        <div className="profile-registration-intro">
          <span>STEP 2 OF 2</span>
          <h2>Register your player profile</h2>
          <p>
            Add your name and unique username to unlock every Chess Burger page.
          </p>
        </div>
      )}
      <div className="account-toolbar">
        <label className="remember-login">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRemember(e.target.checked);
              setKeepLogin(e.target.checked);
            }}
          />
          Keep me logged in
        </label>
        <div className="account-controls">
          {isStaff && (
            <button
              type="button"
              className="cms-access-button"
              onClick={onOpenCms}
            >
              <ShieldCheck size={17} />
              CMS
            </button>
          )}
          <button
            className="signout-button"
            disabled={busy}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="profile-hero">
        <label className="avatar-upload">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.display_name} />
          ) : (
            <span>{profile.display_name.charAt(0)}</span>
          )}
          <i>
            <Camera />
            Change
          </i>
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) =>
              e.target.files?.[0] && void upload(e.target.files[0], "avatar")
            }
          />
        </label>
        <div>
          <h2>{profile.display_name}</h2>
          <p>
            {flag(profile.country_code)} Level {level.level} · {level.name}
          </p>
          {isStaff && (
            <button type="button" className="role-badge" onClick={onOpenCms}>
              {profile.role === "owner" ? "OWNER" : "GM ADMIN"}
            </button>
          )}
          {registered !== false && (
            <div className="profile-social">
              <button type="button" onClick={() => openSocial("friends")}>
                Friends
              </button>
              <button type="button" onClick={() => openSocial("chat")}>
                Chat
              </button>
              <button type="button" onClick={() => openSocial("followers")}>
                Follow
              </button>
            </div>
          )}
        </div>
      </div>
      <form className="profile-form" onSubmit={save}>
        <label>
          Username
          <div className="username-input">
            <span>@</span>
            <input
              required
              pattern="[a-z0-9_]{3,24}"
              value={profile.username.replace(/^@/, "")}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  username: e.target.value.toLowerCase().replace(/^@/, ""),
                })
              }
            />
          </div>
        </label>
        <label>
          Name
          <input
            required
            maxLength={60}
            autoComplete="name"
            placeholder="Your full name"
            value={profile.display_name}
            onChange={(e) =>
              setProfile({ ...profile, display_name: e.target.value })
            }
          />
        </label>
        <label>
          Country
          <select
            value={profile.country_code}
            onChange={(e) =>
              setProfile({ ...profile, country_code: e.target.value })
            }
          >
            {countries.map((c) => (
              <option key={c[0]} value={c[0]}>
                {c[1]} {c[2]}
              </option>
            ))}
          </select>
        </label>
        <label>
          About
          <textarea
            maxLength={240}
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </label>
        <button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save profile"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <section className="profile-photos">
        <h2>Featured photos</h2>
        <div className="photo-grid">
          {Array.from({ length: 4 }, (_, i) =>
            profile.featured_photos[i] ? (
              <div className="photo-slot" key={i}>
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(profile.featured_photos[i])}
                >
                  <img
                    src={profile.featured_photos[i]}
                    alt={"Featured " + (i + 1)}
                  />
                </button>
                <label>
                  <Camera />
                  Replace
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    onChange={(e) =>
                      e.target.files?.[0] &&
                      void upload(e.target.files[0], "photo", i)
                    }
                  />
                </label>
              </div>
            ) : (
              <label key={i}>
                <ImageIcon />
                <span>Upload</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) =>
                    e.target.files?.[0] &&
                    void upload(e.target.files[0], "photo", i)
                  }
                />
              </label>
            ),
          )}
        </div>
        <p>
          Photos are automatically converted to WebP below 1 MB. Portrait and
          landscape images fit inside each thumbnail.
        </p>
      </section>
      <FeaturedRewardPicker
        selected={profile.featured_badges}
        onChange={(featured_badges) => setProfile({ ...profile, featured_badges })}
      />
      {passwordSecurity}
      <Dialog
        open={!!selectedPhoto}
        onOpenChange={(open) => !open && setSelectedPhoto("")}
      >
        <DialogContent className="photo-dialog">
          <DialogHeader>
            <DialogTitle>Featured photo</DialogTitle>
            <DialogDescription>Expanded player photo</DialogDescription>
          </DialogHeader>
          {selectedPhoto && <img src={selectedPhoto} alt="Expanded featured" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
