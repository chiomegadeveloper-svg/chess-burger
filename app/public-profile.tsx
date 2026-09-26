"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Coins, Crown, Swords, Trophy, UserCheck, Users } from "lucide-react";
import { arena } from "./arena-client";
import type { PlayerProfile } from "./supabase";
import type { ArenaPlayer } from "./game-rules";
import { SocialButtons } from "./social";
import { levelFor } from "./cbr";
import ProfilePhotoBucket from "./profile-photo-bucket";
import Portfolio from "./portfolio";
import Testimonials from "./testimonials";
import { AvatarFrameOverlay } from "./avatar-frame-art";

type SocialCounts = { friends: number; followers: number; following: number };
type PublicProfileResponse = {
  profile: PlayerProfile;
  rank: number;
  social: SocialCounts;
};

const emptySocial: SocialCounts = { friends: 0, followers: 0, following: 0 };

export default function PublicProfile({
  userId,
  onClose,
  currentUserId,
  onChallenge,
}: {
  userId: string;
  onClose: () => void;
  currentUserId?: string;
  onChallenge: (player: ArenaPlayer) => void;
}) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [rank, setRank] = useState(0);
  const [social, setSocial] = useState<SocialCounts>(emptySocial);
  const [error, setError] = useState("");

  useEffect(() => {
    setProfile(null);
    setError("");
    let live = true;
    void arena<PublicProfileResponse>("public-profile", { user_id: userId })
      .then((result) => {
        if (!live) return;
        setProfile(result.profile);
        setRank(result.rank);
        setSocial(result.social ?? emptySocial);
      })
      .catch((cause) => {
        if (live) setError((cause as Error).message);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  if (error) {
    return (
      <section className="public-profile cloud-panel">
        <button className="back-button" onClick={onClose}><ArrowLeft />Back</button>
        <p className="inline-error">{error}</p>
      </section>
    );
  }
  if (!profile) return <p className="account-note">Loading player profile…</p>;

  const level = levelFor(profile.cbr);
  const games = profile.wins + profile.losses;
  const rate = games ? Math.round((profile.wins / games) * 100) : 0;

  return (
    <section className="public-profile">
      <button className="back-button" onClick={onClose}><ArrowLeft />Back</button>
      <div className="public-profile-hero cloud-panel">
        <span className={`public-avatar ${profile.avatar_frame_id ? "has-avatar-frame" : ""}`}>
          {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.display_name} /> : profile.display_name.charAt(0)}
          <AvatarFrameOverlay frameId={profile.avatar_frame_id}/>
        </span>
        <div>
          <p>@{profile.username}</p>
          <h1>{profile.display_name}</h1>
          <span>{profile.country_code} · Level {level.level} · {level.name}</span>
        </div>
        <img className="public-level" src={`/levels/level-${String(level.level - 1).padStart(2, "0")}.png`} alt={level.name} />
      </div>
      {profile.user_id !== currentUserId ? (
        <div className="profile-connect cloud-panel">
          <h2>Connect with {profile.display_name}</h2>
          <div className="profile-connect-actions">
            <button className="gold-button" onClick={() => onChallenge(profile)}>
              <Swords size={16} /> Challenge
            </button>
            <SocialButtons target={profile.user_id} onBlocked={() => setError("You blocked this player. Manage blocked players in Friends.")} />
          </div>
        </div>
      ) : null}
      <div className="profile-social-counts" aria-label="Player connections">
        <article><Users /><strong>{social.friends}</strong><span>Friends</span></article>
        <article><UserCheck /><strong>{social.followers}</strong><span>Followers</span></article>
        <article><UserCheck /><strong>{social.following}</strong><span>Following</span></article>
      </div>
      <div className="public-stats">
        <article><Trophy /><strong>#{rank}</strong><span>Current rank</span></article>
        <article><Crown /><strong>{profile.cbr}</strong><span>CBR</span></article>
        <article><Coins /><strong>{profile.gold_points}</strong><span>Gold</span></article>
        <article><strong>{rate}%</strong><span>Win rate</span></article>
      </div>
      {profile.bio ? <div className="cloud-panel public-bio"><h2>About</h2><p>{profile.bio}</p></div> : null}
      <div className="cloud-panel public-record">
        <h2>Player record</h2>
        <span>{profile.wins} wins</span>
        <span>{profile.losses} losses</span>
        <span>{profile.win_streak} win streak</span>
      </div>
      <ProfilePhotoBucket photos={profile.featured_photos} name={profile.display_name} />
      <Portfolio userId={profile.user_id} owner={profile.user_id === currentUserId} />
      <Testimonials profileId={profile.user_id} currentUserId={currentUserId} />
    </section>
  );
}
