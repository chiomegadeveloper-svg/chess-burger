"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,Trophy,Coins,Crown} from "lucide-react";
import {arena} from "./arena-client";
import {PlayerProfile} from "./supabase";
import {SocialButtons} from './social';
import {levelFor} from "./cbr";

export default function PublicProfile({userId,onClose,currentUserId}:{userId:string;onClose:()=>void;currentUserId?:string}){
 const[profile,setProfile]=useState<PlayerProfile|null>(null),[rank,setRank]=useState(0),[error,setError]=useState("");
 useEffect(()=>{setProfile(null);setError("");let live=true;void arena<{profile:PlayerProfile;rank:number}>("public-profile",{user_id:userId}).then(r=>{if(live){setProfile(r.profile);setRank(r.rank);}}).catch(e=>live&&setError(e.message));return()=>{live=false};},[userId]);
 if(error)return <section className="public-profile cloud-panel"><button className="back-button" onClick={onClose}><ArrowLeft/>Community feed</button><p className="inline-error">{error}</p></section>;
 if(!profile)return <p className="account-note">Loading player profile…</p>;
 const level=levelFor(profile.cbr),games=profile.wins+profile.losses,rate=games?Math.round(profile.wins/games*100):0;
 return <section className="public-profile"><button className="back-button" onClick={onClose}><ArrowLeft/>Community feed</button><div className="public-profile-hero cloud-panel"><span className="public-avatar">{profile.avatar_url?<img src={profile.avatar_url} alt={profile.display_name}/>:profile.display_name.charAt(0)}</span><div><p>@{profile.username}</p><h1>{profile.display_name}</h1><span>{profile.country_code} · Level {level.level} · {level.name}</span></div><img className="public-level" src={`/levels/level-${String(level.level-1).padStart(2,"0")}.png`} alt={level.name}/></div>{profile.user_id!==currentUserId&&<SocialButtons target={profile.user_id} onBlocked={()=>setError("You blocked this player. Manage blocked players in Friends.")}/>}<div className="public-stats"><article><Trophy/><strong>#{rank}</strong><span>Current rank</span></article><article><Crown/><strong>{profile.cbr}</strong><span>CBR</span></article><article><Coins/><strong>{profile.gold_points}</strong><span>Gold</span></article><article><strong>{rate}%</strong><span>Win rate</span></article></div>{profile.bio&&<div className="cloud-panel public-bio"><h2>About</h2><p>{profile.bio}</p></div>}<div className="cloud-panel public-record"><h2>Player record</h2><span>{profile.wins} wins</span><span>{profile.losses} losses</span><span>{profile.win_streak} win streak</span></div></section>;
}
