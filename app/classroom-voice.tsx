"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {RealtimeChannel,SupabaseClient} from "@supabase/supabase-js";
import {ExternalLink,Mic,MicOff,PhoneOff,Radio,Settings,X} from "lucide-react";
import {toast} from "sonner";
import {getSupabase} from "./supabase";
import "./classroom-voice.css";

type VoiceRole="teacher"|"student";
type VoiceSignal={from:string;to:string;description?:RTCSessionDescriptionInit;candidate?:RTCIceCandidateInit};
type RemoteVoice={id:string;stream:MediaStream};
type PermissionState="checking"|"prompt"|"granted"|"denied"|"unavailable";

const rtcConfig:RTCConfiguration={
  iceServers:[
    {urls:"stun:stun.l.google.com:19302"},
    {urls:"stun:stun1.l.google.com:19302"}
  ],
  iceCandidatePoolSize:4
};

function RemoteAudio({voice}:{voice:RemoteVoice}){
  const ref=useCallback((element:HTMLAudioElement|null)=>{
    if(element&&element.srcObject!==voice.stream){
      element.srcObject=voice.stream;
      void element.play().catch(()=>{});
    }
  },[voice.stream]);
  return <audio ref={ref} autoPlay playsInline aria-label="Remote SEba classroom voice"/>;
}

export default function ClassroomVoice({roomId,role}:{roomId:string;role:VoiceRole}){
  const [status,setStatus]=useState<"idle"|"starting"|"live">("idle");
  const [permission,setPermission]=useState<PermissionState>("checking");
  const [showPermissionHelp,setShowPermissionHelp]=useState(false);
  const [muted,setMuted]=useState(false);
  const [remoteVoices,setRemoteVoices]=useState<RemoteVoice[]>([]);
  const [participantCount,setParticipantCount]=useState(0);
  const streamRef=useRef<MediaStream|null>(null);
  const channelRef=useRef<RealtimeChannel|null>(null);
  const clientRef=useRef<SupabaseClient|null>(null);
  const userIdRef=useRef("");
  const autoStartedRef=useRef(false);
  const peersRef=useRef(new Map<string,RTCPeerConnection>());
  const pendingCandidates=useRef(new Map<string,RTCIceCandidateInit[]>());
  const isIOS=typeof navigator!=="undefined"&&/iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid=typeof navigator!=="undefined"&&/Android/i.test(navigator.userAgent);

  const sendSignal=useCallback((to:string,payload:Omit<VoiceSignal,"from"|"to">)=>{
    const channel=channelRef.current,from=userIdRef.current;
    if(channel&&from)void channel.send({type:"broadcast",event:"voice-signal",payload:{from,to,...payload}});
  },[]);

  const closePeer=useCallback((peerId:string)=>{
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    pendingCandidates.current.delete(peerId);
    setRemoteVoices(current=>current.filter(voice=>voice.id!==peerId));
  },[]);

  const ensurePeer=useCallback((peerId:string)=>{
    const existing=peersRef.current.get(peerId);
    if(existing)return existing;
    const peer=new RTCPeerConnection(rtcConfig);
    streamRef.current?.getTracks().forEach(track=>peer.addTrack(track,streamRef.current!));
    peer.onicecandidate=event=>{if(event.candidate)sendSignal(peerId,{candidate:event.candidate.toJSON()})};
    peer.ontrack=event=>{
      const stream=event.streams[0]||new MediaStream([event.track]);
      setRemoteVoices(current=>[...current.filter(voice=>voice.id!==peerId),{id:peerId,stream}]);
    };
    peer.onconnectionstatechange=()=>{
      if(["failed","closed"].includes(peer.connectionState))closePeer(peerId);
      if(peer.connectionState==="disconnected")window.setTimeout(()=>{if(peer.connectionState==="disconnected")closePeer(peerId)},4000);
    };
    peersRef.current.set(peerId,peer);
    return peer;
  },[closePeer,sendSignal]);

  const flushCandidates=useCallback(async(peerId:string,peer:RTCPeerConnection)=>{
    const queued=pendingCandidates.current.get(peerId)||[];
    pendingCandidates.current.delete(peerId);
    for(const candidate of queued)await peer.addIceCandidate(candidate).catch(()=>{});
  },[]);

  const receiveSignal=useCallback(async(signal:VoiceSignal)=>{
    if(!signal||signal.to!==userIdRef.current||signal.from===userIdRef.current)return;
    const peer=ensurePeer(signal.from);
    try{
      if(signal.description){
        await peer.setRemoteDescription(signal.description);
        await flushCandidates(signal.from,peer);
        if(signal.description.type==="offer"){
          const answer=await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal(signal.from,{description:answer});
        }
      }else if(signal.candidate){
        if(peer.remoteDescription)await peer.addIceCandidate(signal.candidate);
        else pendingCandidates.current.set(signal.from,[...(pendingCandidates.current.get(signal.from)||[]),signal.candidate]);
      }
    }catch(error){console.warn("classroom.voice-signal-failed",{peer:signal.from,error:String(error)})}
  },[ensurePeer,flushCandidates,sendSignal]);

  const syncPresence=useCallback(async()=>{
    const channel=channelRef.current,currentId=userIdRef.current;
    if(!channel||!currentId)return;
    const present=Object.keys(channel.presenceState()).filter(id=>id!==currentId);
    setParticipantCount(present.length+1);
    for(const peerId of [...peersRef.current.keys()])if(!present.includes(peerId))closePeer(peerId);
    for(const peerId of present){
      if(peersRef.current.has(peerId)||currentId.localeCompare(peerId)>=0)continue;
      const peer=ensurePeer(peerId);
      try{
        const offer=await peer.createOffer();
        await peer.setLocalDescription(offer);
        sendSignal(peerId,{description:offer});
      }catch(error){console.warn("classroom.voice-offer-failed",{peer:peerId,error:String(error)})}
    }
  },[closePeer,ensurePeer,sendSignal]);

  const leave=useCallback(()=>{
    const channel=channelRef.current,client=clientRef.current;
    channelRef.current=null;
    if(channel)void channel.untrack().finally(()=>{if(client)void client.removeChannel(channel)});
    peersRef.current.forEach(peer=>peer.close());
    peersRef.current.clear();
    pendingCandidates.current.clear();
    streamRef.current?.getTracks().forEach(track=>track.stop());
    streamRef.current=null;
    setRemoteVoices([]);
    setParticipantCount(0);
    setMuted(false);
    setStatus("idle");
  },[]);

  const start=useCallback(async()=>{
    if(status!=="idle")return;
    setStatus("starting");
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error("Microphone calling is not supported on this browser.");
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      streamRef.current=stream;
      setPermission("granted");
      window.localStorage.setItem("seba-voice-enabled","1");
      const client=await getSupabase();
      if(!client)throw Error("Live Classroom connection is unavailable.");
      const session=(await client.auth.getSession()).data.session;
      if(!session)throw Error("Sign in again before joining SEba Voice.");
      clientRef.current=client;
      userIdRef.current=session.user.id;
      const channel=client.channel(`classroom-voice:${roomId}`,{config:{broadcast:{self:false},presence:{key:session.user.id}}})
        .on("broadcast",{event:"voice-signal"},message=>void receiveSignal(message.payload as VoiceSignal))
        .on("presence",{event:"sync"},()=>void syncPresence())
        .subscribe(state=>{
          if(state==="SUBSCRIBED"){
            channelRef.current=channel;
            void channel.track({user_id:session.user.id,role,joined_at:new Date().toISOString()}).then(()=>{
              setParticipantCount(1);
              setStatus("live");
              void syncPresence();
            });
          }else if(state==="CHANNEL_ERROR"||state==="TIMED_OUT"){
            leave();
            toast.error("SEba Voice could not connect. Please try again.");
          }
        });
      channelRef.current=channel;
    }catch(error){
      leave();
      if(error instanceof DOMException&&error.name==="NotAllowedError"){
        setPermission("denied");
        setShowPermissionHelp(true);
        window.localStorage.removeItem("seba-voice-enabled");
      }
      const message=error instanceof DOMException&&error.name==="NotAllowedError"?"Microphone is blocked. Allow it in this site’s browser settings, then tap Enable Voice.":error instanceof Error?error.message:"Microphone could not start.";
      toast.error(message);
    }
  },[leave,receiveSignal,role,roomId,status,syncPresence]);

  const refreshPermission=useCallback(async()=>{
    if(!navigator.mediaDevices?.getUserMedia){setPermission("unavailable");return}
    try{
      const result=await navigator.permissions.query({name:"microphone" as PermissionName});
      setPermission(result.state);
      if(result.state==="granted"&&status==="idle")void start();
    }catch{
      // Safari does not consistently expose microphone through Permissions API.
      setPermission(current=>current==="denied"?current:"prompt");
    }
  },[start,status]);

  const toggleMute=()=>{
    const next=!muted;
    streamRef.current?.getAudioTracks().forEach(track=>{track.enabled=!next});
    setMuted(next);
  };

  useEffect(()=>{
    if(autoStartedRef.current)return;
    autoStartedRef.current=true;
    let active=true,permissionStatus:PermissionStatus|null=null;
    const prepare=async()=>{
      if(!navigator.mediaDevices?.getUserMedia){if(active)setPermission("unavailable");return}
      try{
        permissionStatus=await navigator.permissions.query({name:"microphone" as PermissionName});
        if(!active)return;
        setPermission(permissionStatus.state);
        permissionStatus.onchange=()=>{
          const next=permissionStatus?.state||"prompt";
          setPermission(next);
          if(next==="granted")void start();
        };
        if(permissionStatus.state==="granted")void start();
      }catch{
        setPermission("prompt");
        if(window.localStorage.getItem("seba-voice-enabled")==="1")void start();
      }
    };
    void prepare();
    return()=>{active=false;if(permissionStatus)permissionStatus.onchange=null};
  },[start]);

  useEffect(()=>leave,[leave,roomId]);

  useEffect(()=>{
    const checkAfterSettings=()=>{if(document.visibilityState==="visible")void refreshPermission()};
    document.addEventListener("visibilitychange",checkAfterSettings);
    return()=>document.removeEventListener("visibilitychange",checkAfterSettings);
  },[refreshPermission]);

  return <div className={`classroom-voice ${status}`}>
    {remoteVoices.map(voice=><RemoteAudio key={voice.id} voice={voice}/>)}
    {status==="idle"?<div className="voice-permission-actions"><button type="button" className={permission==="denied"?"permission-blocked":""} onClick={()=>permission==="denied"?setShowPermissionHelp(true):void start()} title={permission==="denied"?"Open microphone permission help":"Allow microphone and join SEba Voice"}>{permission==="denied"?<MicOff/>:<Mic/>}{permission==="denied"?"Mic blocked":"Enable Microphone"}</button>{permission==="denied"&&<button type="button" className="voice-settings" onClick={()=>setShowPermissionHelp(true)} aria-label="Microphone settings help"><Settings/></button>}</div>:
      status==="starting"?<button type="button" disabled><Radio/>Connecting…</button>:<>
        <span title="People connected to SEba Voice"><Radio/><b>{participantCount}</b></span>
        <button type="button" className={muted?"muted":""} onClick={toggleMute} title={muted?"Unmute microphone":"Mute microphone"}>{muted?<MicOff/>:<Mic/>}{muted?"Unmute":"Mute"}</button>
        <button type="button" className="leave-voice" onClick={leave} title="Leave Classroom Voice"><PhoneOff/><i>Leave</i></button>
      </>}
    {showPermissionHelp&&<div className="voice-permission-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowPermissionHelp(false)}}><section className="voice-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="voice-permission-title"><button type="button" className="voice-dialog-close" onClick={()=>setShowPermissionHelp(false)} aria-label="Close microphone help"><X/></button><div className="voice-dialog-icon"><MicOff/></div><h2 id="voice-permission-title">Allow microphone access</h2><p>For privacy, SEba cannot switch on a blocked microphone by itself. Change the permission, return here, then tap <b>Try Microphone Again</b>.</p><ol>{isIOS?<><li>Open the iPhone or iPad <b>Settings</b> app.</li><li>Open <b>Safari</b>, then <b>Microphone</b>, and choose <b>Allow</b>. You can also tap <b>aA</b> in Safari’s address bar → <b>Website Settings</b> → <b>Microphone</b> → <b>Allow</b>.</li></>:isAndroid?<><li>Tap the lock or site-settings icon beside the Chrome address.</li><li>Open <b>Permissions</b> → <b>Microphone</b> → <b>Allow</b>.</li><li>If Android privacy blocks it: <b>Settings</b> → <b>Privacy</b> → turn on <b>Microphone access</b>, then allow Chrome.</li></>:<><li>Click the lock or site-settings icon beside the browser address.</li><li>Set <b>Microphone</b> to <b>Allow</b>, then reload if your browser asks you to.</li></>}</ol><div className="voice-dialog-actions"><button type="button" onClick={()=>{setShowPermissionHelp(false);void start()}}><Mic/>Try Microphone Again</button><button type="button" className="voice-help-link" onClick={()=>window.open("https://support.google.com/chrome/answer/2693767","_blank","noopener,noreferrer")}><ExternalLink/>Browser Help</button></div></section></div>}
  </div>;
}
